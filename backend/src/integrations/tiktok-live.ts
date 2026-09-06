import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
import type { WebcastChatMessage, WebcastGiftMessage, WebcastMemberMessage, WebcastLikeMessage } from 'tiktok-live-connector';
import type { EventSink, LiveEventSource } from './event-source.js';

interface TikTokEventClient {
  on(event: WebcastEvent.MEMBER, listener: (data: WebcastMemberMessage) => void): void;
  on(event: WebcastEvent.LIKE, listener: (data: WebcastLikeMessage) => void): void;
  on(event: WebcastEvent.CHAT, listener: (data: WebcastChatMessage) => void): void;
  on(event: WebcastEvent.GIFT, listener: (data: WebcastGiftMessage) => void): void;
}

export class TikTokLiveSource implements LiveEventSource {
  private readonly connection: TikTokLiveConnection;

  constructor(
    username: string,
    private readonly sink: EventSink,
    eulerApiKey: string,
  ) {
    this.connection = new TikTokLiveConnection(username, {
      enableExtendedGiftInfo: true,
      signApiKey: eulerApiKey,
    });

    const eventClient = this.connection as unknown as TikTokEventClient;

    eventClient.on(WebcastEvent.MEMBER, (data) => {
      if (data.user && Number(data.action) === 1) this.sink.onJoin(identity(data.user));
    });
    eventClient.on(WebcastEvent.LIKE, (data) => {
      if (data.user) this.sink.onLike(identity(data.user), Number(data.count));
    });
    eventClient.on(WebcastEvent.CHAT, (data) => {
      if (!data.user) return;
      this.sink.onChat(
        identity(data.user),
        data.content,
      );
    });

    eventClient.on(WebcastEvent.GIFT, (data) => {
      if (!data.user) return;
      if (data.gift?.type === 1 && data.repeatEnd === 0) return;

      this.sink.onGift(
        identity(data.user),
        {
          giftName: data.gift?.name || data.giftId,
          repeatCount: Number(data.repeatCount || 1),
        },
      );
    });
  }

  async start(): Promise<void> {
    const state = await this.connection.connect();
    this.sink.onStatus({
      mode: 'tiktok',
      connected: true,
      label: `Đã kết nối TikTok room ${state.roomId}`,
    });
  }

  async stop(): Promise<void> {
    await this.connection.disconnect();
    this.sink.onStatus({ mode: 'tiktok', connected: false, label: 'Đã ngắt TikTok Live' });
  }
}

function identity(user: NonNullable<WebcastChatMessage['user']>) {
  const avatarUrl = user.avatarThumb?.urlList?.[0];
  return { userId: user.id, uniqueId: user.displayId || user.id, nickname: user.nickname || user.displayId || user.id, ...(avatarUrl ? { avatarUrl } : {}) };
}
