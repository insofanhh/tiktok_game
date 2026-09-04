import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
import type { WebcastChatMessage, WebcastGiftMessage } from 'tiktok-live-connector';
import type { EventSink, LiveEventSource } from './event-source.js';

interface TikTokEventClient {
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

    eventClient.on(WebcastEvent.CHAT, (data) => {
      if (!data.user) return;
      this.sink.onChat(
        {
          userId: data.user.id,
          uniqueId: data.user.displayId || data.user.id,
          nickname: data.user.nickname || data.user.displayId || data.user.id,
        },
        data.content,
      );
    });

    eventClient.on(WebcastEvent.GIFT, (data) => {
      if (!data.user) return;
      if (data.gift?.type === 1 && data.repeatEnd === 0) return;

      this.sink.onGift(
        {
          userId: data.user.id,
          uniqueId: data.user.displayId || data.user.id,
          nickname: data.user.nickname || data.user.displayId || data.user.id,
        },
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
