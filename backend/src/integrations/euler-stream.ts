import {
  ClientCloseCode,
  SchemaVersion,
  createWebSocketUrl,
} from '@eulerstream/euler-websocket-sdk';
import type { WebcastChatMessage, WebcastGiftMessage, WebcastMemberMessage, WebcastLikeMessage } from '@eulerstream/euler-websocket-sdk/v1';
import WebSocket, { type RawData } from 'ws';
import type { ViewerIdentity } from '../game/types.js';
import type { EventSink, LiveEventSource } from './event-source.js';

interface EulerEnvelope {
  type: string;
  data: unknown;
}

const CONNECT_TIMEOUT_MS = 30_000;
const STABLE_CONNECTION_MS = 30_000;
const RETRYABLE_CODES = new Set<number>([1006, 1011, 1012, 1013, 4006, 4429, 4500, 4555, 4556, 4557]);

export class EulerStreamSource implements LiveEventSource {
  private socket: WebSocket | undefined;
  private running = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryAttempt = 0;
  private cancelAttempt: (() => void) | undefined;
  private readonly seen = new Set<string>();

  constructor(
    private readonly username: string,
    private readonly sink: EventSink,
    private readonly apiKey: string,
  ) {}

  async start(): Promise<void> {
    await this.stop();
    this.running = true;
    this.retryAttempt = 0;
    await this.connect();
  }

  private connect(): Promise<void> {
    const url = createWebSocketUrl({
      uniqueId: this.username,
      apiKey: this.apiKey,
      features: {
        bundleEvents: false,
        rawMessages: false,
        schemaVersion: SchemaVersion.v1,
        syntheticPresence: false,
      },
    });
    this.sink.onStatus({
      mode: 'tiktok', connected: false,
      label: `Đang kết nối @${this.username}${this.retryAttempt ? ` (thử lại lần ${this.retryAttempt})` : ''}`,
      ...(this.retryAttempt ? { retryAttempt: this.retryAttempt } : {}),
    });

    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;
      let finished = false;
      let ready = false;
      let stableTimer: ReturnType<typeof setTimeout> | undefined;
      const timeout = setTimeout(() => fail(1006, 'connect-timeout'), CONNECT_TIMEOUT_MS);
      const isCurrent = () => this.running && this.socket === socket && !finished;
      const cleanup = () => {
        finished = true;
        clearTimeout(timeout);
        clearTimeout(stableTimer);
        if (this.socket === socket) {
          this.socket = undefined;
          this.cancelAttempt = undefined;
        }
      };
      const fail = (code: number, reason = '') => {
        if (!isCurrent()) return;
        cleanup();
        // Retire the old transport before scheduling another one. Late events are ignored.
        if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
        const label = describeClose(code, reason);
        const terminal = [1000, 4005, 4400, 4401, 4403, 4404].includes(code);
        if (!terminal && (RETRYABLE_CODES.has(code) || reason === 'WS State Error')) {
          this.retryAttempt += 1;
          const baseDelay = code === 4429 ? 30_000 : 5_000;
          const delay = Math.min(60_000, baseDelay * 2 ** Math.min(this.retryAttempt - 1, 4));
          this.sink.onStatus({
            mode: 'tiktok', connected: false, errorCode: code,
            label: `${label}. Tự kết nối lại sau ${delay / 1000} giây (lần ${this.retryAttempt}).`,
            retryAttempt: this.retryAttempt, retryAt: Date.now() + delay,
          });
          this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            if (this.running) void this.connect().catch(() => undefined);
          }, delay);
          // Settings are saved; the pending retry is reported via source status / HTTP 202.
          resolve();
        } else {
          this.running = false;
          this.sink.onStatus({ mode: 'tiktok', connected: false, label, errorCode: code });
          reject(new Error(label));
        }
      };
      this.cancelAttempt = () => {
        cleanup();
        resolve();
      };
      const finishReady = () => {
        if (!isCurrent() || ready) return;
        ready = true;
        clearTimeout(timeout);
        // Repeated short-lived connections must keep backing off.
        stableTimer = setTimeout(() => { this.retryAttempt = 0; }, STABLE_CONNECTION_MS);
        this.sink.onStatus({ mode: 'tiktok', connected: true, label: `Euler Live @${this.username}` });
        resolve();
      };

      socket.on('message', (raw) => {
        if (!isCurrent()) return;
        for (const message of parseEulerMessages(raw)) {
          if (message.type === 'tiktok.disconnect') {
            const code = isRecord(message.data) ? Number(message.data.reason) : 1006;
            fail(Number.isInteger(code) ? code : 1006);
            return;
          }
          // roomInfo can arrive before the upstream TikTok WebSocket succeeds.
          if (message.type === 'tiktok.connect' || message.type.startsWith('Webcast')) finishReady();
          this.handleMessage(message);
        }
      });
      socket.once('unexpected-response', (_request, response) => {
        response.resume();
        const status = response.statusCode ?? 500;
        fail(status === 401 ? 4401 : status === 403 ? 4403 : status === 429 ? 4429 : status >= 500 ? 1011 : 4400);
      });
      // Do not forward raw ws errors: they can contain an authenticated URL.
      socket.once('error', () => fail(1006));
      socket.once('close', (code, reason) => fail(code, reason.toString()));
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const socket = this.socket;
    this.cancelAttempt?.();
    if (!socket || socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => { socket.terminate(); resolve(); }, 2_000);
      socket.once('close', () => { clearTimeout(timeout); resolve(); });
      if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
      else socket.close(1000, 'Switching source');
    });
  }

  private handleMessage(message: EulerEnvelope): void {
    if (!isRecord(message.data)) return;
    if (isRecord(message.data) && isRecord(message.data.event)) {
      const id = message.data.event.msgId;
      if (typeof id === 'string' && id && id !== '0') {
        const key = message.type + ':' + id;
        if (this.seen.has(key)) return;
        this.seen.add(key);
        if (this.seen.size > 10000) this.seen.delete(this.seen.values().next().value!);
      }
    }
    if (message.type === 'WebcastMemberMessage') {
      const data = message.data as unknown as WebcastMemberMessage;
      const viewer = toViewer(data.user);
      if (viewer && data.actionId === 1) this.sink.onJoin(viewer);
      return;
    }
    if (message.type === 'WebcastLikeMessage') {
      const data = message.data as unknown as WebcastLikeMessage;
      const viewer = toViewer(data.user);
      if (viewer) this.sink.onLike(viewer, Number(data.likeCount));
      return;
    }
    if (message.type === 'WebcastChatMessage') {
      const data = message.data as unknown as WebcastChatMessage;
      const viewer = toViewer(data.user);
      if (viewer && data.comment) this.sink.onChat(viewer, data.comment);
      return;
    }

    if (message.type === 'WebcastGiftMessage') {
      const data = message.data as unknown as WebcastGiftMessage;
      const viewer = toViewer(data.user);
      if (!viewer) return;
      if (data.giftDetails?.giftType === 1 && data.repeatEnd === 0) return;
      this.sink.onGift(viewer, {
        giftName: data.giftDetails?.giftName || String(data.giftId),
        repeatCount: Math.max(1, Number(data.repeatCount || 1)),
        diamondCount: Math.max(1, Number(data.giftDetails?.diamondCount || 1)),
      });
    }
  }
}

function parseEulerMessages(raw: RawData): EulerEnvelope[] {
  try {
    const payload: unknown = JSON.parse(raw.toString());
    const candidates = Array.isArray(payload)
      ? payload
      : isRecord(payload) && Array.isArray(payload.messages)
        ? payload.messages
        : [payload];
    return candidates.filter(isEulerEnvelope);
  } catch {
    return [];
  }
}

function isEulerEnvelope(value: unknown): value is EulerEnvelope {
  return isRecord(value) && typeof value.type === 'string' && 'data' in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toViewer(user: WebcastChatMessage['user'] | WebcastGiftMessage['user']): ViewerIdentity | null {
  if (!user?.userId) return null;
  const avatarUrl = user.profilePicture?.urls?.[0];
  return {
    userId: user.userId,
    uniqueId: user.uniqueId || user.userId,
    nickname: user.nickname || user.uniqueId || user.userId,
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function describeClose(code: number, reason: string): string {
  if (code === ClientCloseCode.NOT_LIVE) return 'Tài khoản TikTok hiện không livestream';
  if (code === ClientCloseCode.STREAM_END) return 'Phiên TikTok Live đã kết thúc';
  if (code === ClientCloseCode.INVALID_AUTH) return 'Euler API key không hợp lệ (4401)';
  if (code === ClientCloseCode.NO_PERMISSION) return 'Euler API key không có quyền truy cập Live này (4403)';
  if (code === ClientCloseCode.INVALID_OPTIONS) return 'Cấu hình kết nối Euler không hợp lệ (4400)';
  if (code === ClientCloseCode.TOO_MANY_CONNECTIONS) return 'Euler đang giới hạn số kết nối hoặc tốc độ kết nối (4429)';
  if (code === ClientCloseCode.NORMAL) return 'Euler Live đã đóng kết nối';
  if (reason === 'connect-timeout') return 'Chưa nhận được xác nhận kết nối TikTok sau 30 giây';
  if (reason === 'WS State Error' || code === ClientCloseCode.INTERNAL_SERVER_ERROR) {
    return `Euler gặp lỗi khi thiết lập kết nối tới TikTok (${code}${reason === 'WS State Error' ? ': WS State Error' : ''})`;
  }
  if (code === ClientCloseCode.WEBCAST_FETCH_ERROR || code === ClientCloseCode.ROOM_INFO_FETCH_ERROR) {
    return `Euler chưa lấy được dữ liệu phòng TikTok (${code})`;
  }
  return `Kết nối Euler/TikTok bị gián đoạn (${code})`;
}
