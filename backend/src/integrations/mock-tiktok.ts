import type { GiftKind, ViewerIdentity } from '../game/types.js';
import type { EventSink, LiveEventSource } from './event-source.js';

const VIEWERS: ReadonlyArray<ViewerIdentity> = [
  { userId: 'mock-linh', uniqueId: 'linhmiu', nickname: 'Linh Miu' },
  { userId: 'mock-bao', uniqueId: 'giabao', nickname: 'Gia Bảo' },
  { userId: 'mock-an', uniqueId: 'mocan', nickname: 'Mộc An' },
  { userId: 'mock-hai', uniqueId: 'haidang', nickname: 'Hải Đăng' },
  { userId: 'mock-tran', uniqueId: 'baotran', nickname: 'Bảo Trân' },
  { userId: 'mock-meo', uniqueId: 'meou', nickname: 'Mèo Ú' },
];

const GIFTS: ReadonlyArray<{ kind: GiftKind; giftName: string; diamondCount: number }> = [
  { kind: 'build', giftName: 'Rosa', diamondCount: 10 },
  { kind: 'build', giftName: 'Rosa', diamondCount: 10 },
  { kind: 'attack', giftName: '5 Coin Gift', diamondCount: 5 },
  { kind: 'shield', giftName: '20 Coin Gift', diamondCount: 20 },
  { kind: 'megaAttack', giftName: 'Big Gift', diamondCount: 101 },
];

export class MockTikTokSource implements LiveEventSource {
  private timer: NodeJS.Timeout | undefined;
  private tick = 0;

  constructor(
    private readonly sink: EventSink,
    private readonly intervalMs: number,
  ) {}

  async start(): Promise<void> {
    for (const viewer of VIEWERS) {
      this.sink.onGift(viewer, { giftName: 'Rose', diamondCount: 1, repeatCount: 1 });
    }
    this.sink.onStatus({ mode: 'mock', connected: true, label: 'TikTok Mock đang chạy' });

    if (this.intervalMs <= 0) return;
    this.timer = setInterval(() => {
      const viewer = VIEWERS[this.tick % VIEWERS.length];
      const gift = GIFTS[this.tick % GIFTS.length];
      this.tick += 1;
      if (!viewer || !gift) return;
      this.sink.onGift(viewer, {
        giftName: gift.giftName,
        diamondCount: gift.diamondCount,
        repeatCount: 1,
      });
    }, this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.sink.onStatus({ mode: 'mock', connected: false, label: 'TikTok Mock đã dừng' });
  }
}
