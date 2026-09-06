import { describe, expect, it } from 'vitest';
import { GameEngine } from './game-engine.js';
const viewer = (i: number) => ({ userId:String(i), uniqueId:'u' + i, nickname:'User ' + i });
function populate(engine: GameEngine, count: number) {
  for (let i = 0; i < count; i++) engine.handleJoin(viewer(i));
}

describe('per-round player limits', () => {
  it('admits exactly the limit and ignores rejected entries without changing state', () => {
    const e = new GameEngine({ maxPlayers:2, random:() => 0 });
    populate(e, 2);
    const before = e.stateVersion;
    expect(e.handleJoin(viewer(2))).toEqual([]);
    expect(e.stateVersion).toBe(before);
    expect(e.getState().users).toHaveLength(2);
  });
  it('counts eliminated players and does not reopen a slot after a kill', () => {
    const e = new GameEngine({ maxPlayers:2, random:() => 0 });
    populate(e, 2);
    e.handleGift(viewer(0), { giftName:'Paper Crane', repeatCount:1 });
    expect(e.getState().scores).toEqual({ blue:1, red:0 });
    expect(e.handleJoin(viewer(2))).toEqual([]);
    expect(e.getState().users).toHaveLength(2);
  });
  it('enforces admission for likes, chats and gifts as well as member events', () => {
    const e = new GameEngine({ maxPlayers:2, random:() => 0 });
    populate(e, 2);
    const before = e.stateVersion;
    expect(e.handleLike(viewer(2), 10)).toEqual([]);
    expect(e.handleChat(viewer(3), 'hello')).toBeNull();
    expect(e.handleGift(viewer(4), { giftName:'Rose', repeatCount:10 })).toEqual([]);
    expect(e.handleGift(viewer(5), { giftName:'Galaxy', repeatCount:10 })).toEqual([]);
    expect(e.stateVersion).toBe(before);
    expect(e.getState().users).toHaveLength(2);
    expect(e.getState().grid.flat().filter(c => c.building).every(c => c.building?.health === 100)).toBe(true);
  });
  it('keeps existing players and their interactions working at capacity', () => {
    const e = new GameEngine({ maxPlayers:2, random:() => 0 });
    populate(e, 2);
    e.handleJoin({ ...viewer(0), nickname:'Updated' });
    e.handleGift(viewer(0), { giftName:'Rose', repeatCount:10 });
    expect(e.handleLike(viewer(0), 1)[0]).toMatchObject({ damage:2 });
    const units = e.getState().grid.flat().flatMap(c => c.building ? [c.building] : []);
    expect(units.find(b => b.ownerId === '0')?.shieldHealth).toBe(10);
    expect(e.getState().users).toHaveLength(2);
  });
  it('applies a lower limit to new entries immediately and trims only on the next round', () => {
    const e = new GameEngine({ random:() => 0 });
    populate(e, 4);
    const roundId = e.getState().round.id;
    e.setPlayerLimit(2);
    expect(e.getState().round.id).toBe(roundId);
    expect(e.getState().users).toHaveLength(4);
    expect(e.handleJoin(viewer(4))).toEqual([]);
    expect(e.reset(60000, true).users.map(u => u.userId)).toEqual(['0', '1']);
  });
  it('accepts more viewers after increasing or clearing the limit', () => {
    const e = new GameEngine({ maxPlayers:1 });
    populate(e, 2);
    expect(e.getState().users).toHaveLength(1);
    e.setPlayerLimit(2);
    e.handleJoin(viewer(1));
    expect(e.getState().users).toHaveLength(2);
    e.setPlayerLimit(null);
    e.handleJoin(viewer(2));
    expect(e.getState().users).toHaveLength(3);
  });
  it('has no hidden 400-player ceiling in unlimited mode and preserves coordinates when growing', () => {
    const e = new GameEngine({ random:() => 0 });
    populate(e, 400);
    const first = e.getState().grid.flat().find(c => c.building?.ownerId === '0')!;
    for (let i = 400; i < 505; i++) e.handleJoin(viewer(i));
    const state = e.getState();
    expect(state.users).toHaveLength(505);
    const occupied = state.grid.flat().filter(c => c.building);
    expect(occupied).toHaveLength(505);
    expect(new Set(occupied.map(c => `${c.x},${c.y}`)).size).toBe(505);
    expect(occupied.every(c => c.territory === c.building?.team)).toBe(true);
    expect(occupied.find(c => c.building?.ownerId === '0')).toMatchObject({ x:first.x, y:first.y });
    expect(e.reset().grid).toHaveLength(20);
  });
  it('honors explicit limits above 400', () => {
    const e = new GameEngine({ maxPlayers:450 });
    populate(e, 451);
    expect(e.getState().users).toHaveLength(450);
  });
  it('retains the limit through automatic restarts while allowing entries if the new round has room', () => {
    let now = 1000;
    const e = new GameEngine({ maxPlayers:2, now:() => now, random:() => 0 });
    populate(e, 1);
    e.finishRound();
    now += 10000;
    expect(e.restartIfDue()).toBe(true);
    expect(e.handleJoin(viewer(1))).toHaveLength(1);
    expect(e.handleJoin(viewer(2))).toEqual([]);
    expect(e.getState().users).toHaveLength(2);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid engine limit %s', limit => {
    expect(() => new GameEngine({ maxPlayers:limit })).toThrow('Invalid player limit');
  });
});
