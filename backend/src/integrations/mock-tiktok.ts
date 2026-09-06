import type { ViewerIdentity } from '../game/types.js';
import type { EventSink, LiveEventSource } from './event-source.js';
const names = ['Linh Miu', 'Gia Bảo', 'Mộc An', 'Hải Đăng', 'Bảo Trân', 'Mèo Ú', 'Minh Anh', 'Tuấn Kiệt', 'Khánh Vy', 'Hoàng Nam', 'Ngọc Nhi', 'Anh Thư', 'Quang Huy', 'Bông', 'Đức Anh', 'Hà My'];
export class MockTikTokSource implements LiveEventSource {
  private timer: NodeJS.Timeout | undefined;
  private tick = 0;
  private readonly viewers: ViewerIdentity[] = names.map((nickname, i) => ({ userId: 'mock-' + i, uniqueId: 'player_' + i, nickname }));
  constructor(private readonly sink: EventSink, private readonly intervalMs: number) {}
  async start(): Promise<void> {
    for (const viewer of this.viewers) this.sink.onJoin(viewer);
    this.sink.onStatus({ mode: 'mock', connected: true, label: 'Đang chạy giả lập' });
    if (this.intervalMs <= 0) return;
    this.timer = setInterval(() => {
      const viewer = this.viewers[this.tick % this.viewers.length]!;
      const index = this.tick++;
      if (index % 7 === 0) this.sink.onGift(viewer, { giftName: 'Rose', repeatCount: 1 });
      else if (index % 11 === 0) this.sink.onGift(viewer, { giftName: 'Lucky Pig', repeatCount: 1 });
      else if (index % 5 === 0) this.sink.onGift(viewer, { giftName: 'Rosa', repeatCount: 1 });
      else this.sink.onLike(viewer, 1 + index % 5);
    }, this.intervalMs);
  }
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.sink.onStatus({ mode: 'mock', connected: false, label: 'Đã dừng giả lập' });
  }
}
