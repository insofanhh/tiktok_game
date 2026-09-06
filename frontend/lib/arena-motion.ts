import { fitArena, CARD_WIDTH, CARD_HEIGHT } from './arena-layout';
import type { Team } from './game-types';

export interface PatrolSlot {
  userId: string;
  team: Team;
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  seed: number;
}
export interface ActorPosition { x: number; y: number; scale: number; phase: number }

export function playerSeed(id: string): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

/** Non-overlapping patrol sectors keep every player inside their team's half, even on mobile. */
export function createPatrolSlots(
  users: ReadonlyArray<{ userId: string; team: Team }>,
  width: number,
  height: number,
): PatrolSlot[] {
  if (width <= 40 || height <= 20) return [];
  const slots: PatrolSlot[] = [];
  for (const team of ['blue', 'red'] as const) {
    const members = users.filter(user => user.team === team);
    const areaWidth = width / 2 - 16;
    const areaHeight = height - 16;
    const layout = fitArena(members.length, areaWidth, areaHeight);
    if (!layout.rows) continue;
    const cellWidth = areaWidth / layout.columns;
    const cellHeight = areaHeight / layout.rows;
    members.forEach((user, index) => slots.push({
      userId: user.userId,
      team,
      left: (team === 'blue' ? 8 : width / 2 + 8) + (index % layout.columns) * cellWidth,
      top: 8 + Math.floor(index / layout.columns) * cellHeight,
      width: cellWidth,
      height: cellHeight,
      scale: layout.scale * .76,
      seed: playerSeed(user.userId),
    }));
  }
  return slots;
}

export function patrolPosition(slot: PatrolSlot, time: number, reducedMotion = false): ActorPosition {
  const phase = time * (1.2 + slot.seed * .8) + slot.seed * Math.PI * 2;
  const roomX = Math.max(0, slot.width - CARD_WIDTH * slot.scale);
  const roomY = Math.max(0, slot.height - CARD_HEIGHT * slot.scale);
  return {
    x: slot.left + roomX * (reducedMotion ? .5 : .5 + .46 * Math.sin(phase * .45)),
    y: slot.top + roomY * (reducedMotion ? .5 : .5 + .46 * Math.cos(phase * .32 + slot.seed * 4)),
    scale: slot.scale,
    phase: reducedMotion ? 0 : time * (9 + slot.seed * 3) + slot.seed * 6,
  };
}
