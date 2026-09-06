import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { EulerStreamSource } from './euler-stream.js';

vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  class FakeSocket extends EventEmitter {
    static instances: FakeSocket[] = [];
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 1;
    constructor(readonly url: string) { super(); FakeSocket.instances.push(this); }
    terminate = vi.fn(() => { this.readyState = 3; this.emit('close', 1006, Buffer.from('')); });
    close = vi.fn(() => { this.readyState = 3; this.emit('close', 1000, Buffer.from('')); });
  }
  return { default: FakeSocket };
});

interface FakeSocket extends EventEmitter {
  readyState: number;
  url: string;
  terminate: ReturnType<typeof vi.fn>;
}
const sockets = (WebSocket as unknown as { instances: FakeSocket[] }).instances;
const sources: EulerStreamSource[] = [];
const latest = () => sockets.at(-1)!;
const message = (socket: FakeSocket, type: string, data: unknown = {}) => socket.emit('message', Buffer.from(JSON.stringify({ type, data })));
const close = (socket: FakeSocket, code: number, reason = '') => {
  socket.readyState = 3;
  socket.emit('close', code, Buffer.from(reason));
};
async function setup() {
  const sink = { onJoin: vi.fn(), onLike: vi.fn(), onGift: vi.fn(), onChat: vi.fn(), onStatus: vi.fn() };
  const source = new EulerStreamSource('test', sink, 'secret-test-key');
  sources.push(source);
  const started = source.start();
  await Promise.resolve();
  return { source, sink, started, socket: latest() };
}
const like = { user: { userId: '42', nickname: 'Viewer' }, likeCount: 3, event: { msgId: 'like-1' } };

beforeEach(() => { vi.useFakeTimers(); sockets.length = 0; });
afterEach(async () => {
  await Promise.all(sources.splice(0).map(source => source.stop()));
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('Euler connection lifecycle', () => {
  it('waits for upstream confirmation instead of treating room metadata as connected', async () => {
    const { sink, socket, started } = await setup();
    let settled = false;
    void started.then(() => { settled = true; });
    message(socket, 'roomInfo');
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(sink.onStatus).not.toHaveBeenCalledWith(expect.objectContaining({ connected: true }));
    message(socket, 'tiktok.connect');
    await started;
    expect(sink.onStatus).toHaveBeenLastCalledWith({ mode: 'tiktok', connected: true, label: 'Euler Live @test' });
  });

  it('also accepts real Live events as proof of upstream connection', async () => {
    const { sink, socket, started } = await setup();
    message(socket, 'WebcastLikeMessage', like);
    await started;
    expect(sink.onLike).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ userId: '42' }), 3);
    expect(sink.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ connected: true }));
  });

  it('recovers from WS State Error with increasing delays and clears errors on success', async () => {
    const { sink, socket, started } = await setup();
    message(socket, 'roomInfo');
    close(socket, 1011, 'WS State Error');
    await started;
    expect(sink.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ connected: false, errorCode: 1011, retryAttempt: 1, retryAt: Date.now() + 5000 }));
    await vi.advanceTimersByTimeAsync(4999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
    close(latest(), 1011, 'WS State Error');
    expect(sink.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ retryAttempt: 2, retryAt: Date.now() + 10000 }));
    await vi.advanceTimersByTimeAsync(10000);
    message(latest(), 'tiktok.connect');
    expect(sink.onStatus).toHaveBeenLastCalledWith({ mode: 'tiktok', connected: true, label: 'Euler Live @test' });
  });

  it('keeps backoff across short connections, caps it, and resets after a stable connection', async () => {
    const { sink, socket, started } = await setup();
    close(socket, 1011);
    await started;
    for (const delay of [5000, 10000, 20000, 40000, 60000]) {
      await vi.advanceTimersByTimeAsync(delay);
      message(latest(), 'tiktok.connect');
      close(latest(), 1011);
    }
    expect(sink.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ retryAt: Date.now() + 60000 }));
    await vi.advanceTimersByTimeAsync(60000);
    message(latest(), 'tiktok.connect');
    await vi.advanceTimersByTimeAsync(30000);
    close(latest(), 1011);
    expect(sink.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ retryAttempt: 1, retryAt: Date.now() + 5000 }));
  });

  it('deduplicates likes and gifts across reconnections', async () => {
    const { sink, socket, started } = await setup();
    const gift = { ...like, event: { msgId: 'gift-1' }, repeatCount: 1, repeatEnd: 1, giftDetails: { giftType: 1, giftName: 'Rose' } };
    message(socket, 'WebcastLikeMessage', like);
    message(socket, 'WebcastGiftMessage', gift);
    await started;
    close(socket, 4500);
    await vi.advanceTimersByTimeAsync(5000);
    message(latest(), 'WebcastLikeMessage', like);
    message(latest(), 'WebcastGiftMessage', gift);
    expect(sink.onLike).toHaveBeenCalledTimes(1);
    expect(sink.onGift).toHaveBeenCalledTimes(1);
  });

  it('handles disconnect events even before the transport closes', async () => {
    const { sink, socket, started } = await setup();
    message(socket, 'tiktok.connect');
    await started;
    message(socket, 'tiktok.disconnect', { reason: 4500 });
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    expect(sink.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ errorCode: 4500, retryAttempt: 1 }));
    message(socket, 'tiktok.connect');
    message(socket, 'WebcastLikeMessage', like);
    expect(sink.onLike).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sockets).toHaveLength(2);
  });

  it('times out and ignores delayed messages from the retired socket', async () => {
    const { sink, socket, started } = await setup();
    await vi.advanceTimersByTimeAsync(30000);
    await started;
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    message(socket, 'roomInfo');
    message(socket, 'tiktok.connect');
    expect(sink.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ connected: false, retryAttempt: 1 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(sockets).toHaveLength(2);
  });

  it('schedules one retry for an error followed by close and never forwards authenticated URLs', async () => {
    const { sink, socket, started } = await setup();
    socket.emit('error', new Error('wss://ws.eulerstream.com?apiKey=secret-test-key'));
    close(socket, 1006);
    await started;
    expect(JSON.stringify(sink.onStatus.mock.calls)).not.toContain('secret-test-key');
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sockets).toHaveLength(2);
  });

  it.each([1000, 4005, 4400, 4401, 4403, 4404])('does not retry terminal code %s', async code => {
    const { sink, socket, started } = await setup();
    const rejected = expect(started).rejects.toThrow();
    close(socket, code, 'secret-test-key');
    await rejected;
    expect(sink.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ errorCode: code, connected: false }));
    expect(JSON.stringify(sink.onStatus.mock.calls)).not.toContain('secret-test-key');
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(120000);
    expect(sockets).toHaveLength(1);
  });

  it('backs off longer when Euler rate limits the connection', async () => {
    const { sink, socket, started } = await setup();
    close(socket, 4429);
    await started;
    expect(sink.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ retryAt: Date.now() + 30000 }));
    await vi.advanceTimersByTimeAsync(30000);
    expect(sockets).toHaveLength(2);
  });

  it.each([[401, 4401], [403, 4403]])('classifies HTTP %s as terminal code %s', async (statusCode, errorCode) => {
    const { sink, socket, started } = await setup();
    const rejected = expect(started).rejects.toThrow();
    const resume = vi.fn();
    socket.emit('unexpected-response', {}, { statusCode, resume });
    await rejected;
    expect(resume).toHaveBeenCalledOnce();
    expect(sink.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ errorCode }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels pending retries when switching source', async () => {
    const { source, socket, started } = await setup();
    close(socket, 1011);
    await started;
    await source.stop();
    await vi.advanceTimersByTimeAsync(120000);
    expect(sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles pending startup and ignores events when stopped during connection', async () => {
    const { source, sink, socket, started } = await setup();
    socket.readyState = 0;
    await source.stop();
    await started;
    message(socket, 'tiktok.connect');
    await vi.advanceTimersByTimeAsync(120000);
    expect(sockets).toHaveLength(1);
    expect(sink.onStatus).not.toHaveBeenCalledWith(expect.objectContaining({ connected: true }));
    expect(vi.getTimerCount()).toBe(0);
  });
});
