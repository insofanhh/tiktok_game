import type { IncomingGift, ViewerIdentity } from '../game/types.js';

export interface SourceStatus {
  mode: 'mock' | 'tiktok';
  connected: boolean;
  label: string;
}

export interface EventSink {
  onChat: (viewer: ViewerIdentity, comment: string) => void;
  onGift: (viewer: ViewerIdentity, gift: IncomingGift) => void;
  onStatus: (status: SourceStatus) => void;
}

export interface LiveEventSource {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}
