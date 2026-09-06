import {
  ClientCloseCode,
  CloseMessageMap,
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

const CONNECT_TIMEOUT_MS = 20_000;

export class EulerStreamSource implements LiveEventSource {
  private socket: WebSocket | undefined;
  private intentionalStop = false;
  private readonly seen = new Set<string>();

  constructor(
    private readonly username: string,
    private readonly sink: EventSink,
    private readonly apiKey: string,
  ) {}

  async start(): Promise<void> {
    this.intentionalStop = false;
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

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;
      let ready = false;
      let settled = false;

      const finishReady = () => {
        if (ready) return;
        ready = true;
        settled = true;
        clearTimeout(timeout);
        this.sink.onStatus({
          mode: 'tiktok',
          connected: true,
          label: `Euler Live @${this.username}`,
        });
        resolve();
      };

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.terminate();
        reject(new Error('Euler Stream không phản hồi trong 20 giây'));
      }, CONNECT_TIMEOUT_MS);

      socket.on('message', (raw) => {
        for (const message of parseEulerMessages(raw)) {
          if (message.type === 'roomInfo' || message.type === 'tiktok.connect') finishReady();
          this.handleMessage(message);
        }
      });

      socket.once('error', (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
          return;
        }
        if (!this.intentionalStop) {
          this.sink.onStatus({ mode: 'tiktok', connected: false, label: error.message });
        }
      });

      socket.once('close', (code, reason) => {
        clearTimeout(timeout);
        if (this.socket === socket) this.socket = undefined;
        const label = describeClose(code, reason.toString());
        if (!settled) {
          settled = true;
          reject(new Error(label));
          return;
        }
        if (!this.intentionalStop) {
          this.sink.onStatus({ mode: 'tiktok', connected: false, label });
        }
      });
    });
  }

  async stop(): Promise<void> {
    this.intentionalStop = true;
    const socket = this.socket;
    if (!socket) return;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        socket.terminate();
        resolve();
      }, 2_000);
      socket.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.close(1000, 'Switching source');
    });
    if (this.socket === socket) this.socket = undefined;
    this.sink.onStatus({ mode: 'tiktok', connected: false, label: 'Đã ngắt Euler Live' });
  }

  private handleMessage(message: EulerEnvelope): void {
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
      const data = message.data as WebcastMemberMessage;
      const viewer = toViewer(data.user);
      if (viewer && data.actionId === 1) this.sink.onJoin(viewer);
      return;
    }
    if (message.type === 'WebcastLikeMessage') {
      const data = message.data as WebcastLikeMessage;
      const viewer = toViewer(data.user);
      if (viewer) this.sink.onLike(viewer, Number(data.likeCount));
      return;
    }
    if (message.type === 'WebcastChatMessage') {
      const data = message.data as WebcastChatMessage;
      const viewer = toViewer(data.user);
      if (viewer && data.comment) this.sink.onChat(viewer, data.comment);
      return;
    }

    if (message.type === 'WebcastGiftMessage') {
      const data = message.data as WebcastGiftMessage;
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
  if (code === ClientCloseCode.INVALID_AUTH) return 'Euler API key không hợp lệ';
  if (code === ClientCloseCode.NO_PERMISSION) return 'Euler API key không có quyền truy cập Live này';
  if (code === ClientCloseCode.TOO_MANY_CONNECTIONS) return 'Euler đang giới hạn số kết nối đồng thời';
  const known = CloseMessageMap[code as ClientCloseCode];
  return reason || known || `Euler Live đã ngắt kết nối (${code})`;
}
