export interface ArenaLayout {
  columns: number;
  rows: number;
  scale: number;
  cardWidth: number;
  cardHeight: number;
  gap: number;
}
export const CARD_WIDTH = 80;
export const CARD_HEIGHT = 112;
const GAP = 8;

/** Fit every participant in a measured team area; never discard or paginate players. */
export function fitArena(count: number, width: number, height: number): ArenaLayout {
  const empty = { columns: 1, rows: 0, scale: 0, cardWidth: 0, cardHeight: 0, gap: 0 };
  if (count <= 0 || width <= 0 || height <= 0) return empty;
  let best = { ...empty, rows: count };
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const scale = Math.min(1, width / (columns * CARD_WIDTH + (columns - 1) * GAP),
      height / (rows * CARD_HEIGHT + (rows - 1) * GAP));
    if (scale > best.scale) {
      best = { columns, rows, scale, cardWidth: CARD_WIDTH * scale, cardHeight: CARD_HEIGHT * scale, gap: GAP * scale };
    }
  }
  return best;
}
