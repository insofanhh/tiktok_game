import { describe, expect, it } from 'vitest';
import { GameEngine } from './game-engine.js';
const viewer = (id: string) => ({ userId: id, uniqueId: id, nickname: id });
function setup(maxPlayers = 2) {
  let now = 1000;
  const engine = new GameEngine({ now: () => now, random: () => 0, maxPlayers });
  engine.setPresenceConnected(true);
  engine.handleJoin(viewer('a'));
  engine.handleJoin(viewer('b'));
  return { engine, advance: (ms: number) => { now += ms; } };
}
const building = (e: GameEngine, id: string) => e.getState().grid.flat().find(c => c.building?.ownerId === id)?.building;

describe('Live inactivity admission policy', () => {
  it('releases a slot at 60 seconds, removes the unit and retargets attacks', () => {
    const { engine: e, advance } = setup();
    e.handleLike(viewer('a'), 1);
    advance(59999);
    e.recordActivity('a');
    expect(e.expireInactive()).toEqual([]);
    expect(e.handleJoin(viewer('c'))).toEqual([]);
    advance(1);
    expect(e.expireInactive()).toMatchObject([{ type: 'LEAVE', user: { userId: 'b' } }]);
    expect(building(e, 'b')).toBeUndefined();
    expect(e.getState().users.map(u => u.userId)).toEqual(['a']);
    expect(e.handleJoin(viewer('c'))).toHaveLength(1);
    expect(e.handleLike(viewer('a'), 1)[0]).toMatchObject({ targetUserId: 'c', damage: 2 });
    const version = e.stateVersion;
    expect(e.handleLeave('b')).toEqual([]);
    expect(e.stateVersion).toBe(version);
  });
  it.each(['join', 'like', 'chat', 'gift'] as const)('%s renews activity', kind => {
    const { engine: e, advance } = setup();
    advance(59000);
    if (kind === 'join') e.handleJoin(viewer('a'));
    if (kind === 'like') e.handleLike(viewer('a'), 1);
    if (kind === 'chat') e.handleChat(viewer('a'), 'hello');
    if (kind === 'gift') e.handleGift(viewer('a'), { giftName: 'Rose', repeatCount: 1 });
    advance(1000);
    e.expireInactive();
    expect(e.getState().users.map(u => u.userId)).toEqual(['a']);
    advance(59000);
    e.expireInactive();
    expect(e.getState().users).toHaveLength(0);
  });
  it('does not treat receiving attacks as viewer activity', () => {
    const { engine: e, advance } = setup();
    advance(59000);
    e.handleLike(viewer('a'), 1);
    advance(1000);
    e.expireInactive();
    expect(e.getState().users.map(u => u.userId)).toEqual(['a']);
  });
  it('pauses on disconnect and grants a fresh minute on reconnect', () => {
    const { engine: e, advance } = setup();
    advance(59000);
    e.setPresenceConnected(false);
    advance(300000);
    expect(e.expireInactive()).toEqual([]);
    e.setPresenceConnected(true);
    advance(59999);
    expect(e.expireInactive()).toEqual([]);
    advance(1);
    expect(e.expireInactive()).toHaveLength(2);
  });
  it('does not expire mock players or retain rejected activity', () => {
    let now = 0;
    const e = new GameEngine({ now: () => now, maxPlayers: 1 });
    e.handleJoin(viewer('a'));
    now = 100000;
    expect(e.expireInactive()).toEqual([]);
    e.recordActivity('rejected');
    expect(e.getState().users).toHaveLength(1);
  });
  it('restores original HP, shields, level and stats only if a slot is available', () => {
    const { engine: e } = setup();
    e.handleGift(viewer('b'), { giftName: 'Lucky Pig', repeatCount: 1 });
    e.handleGift(viewer('b'), { giftName: 'Rose', repeatCount: 10 });
    e.handleLike(viewer('a'), 10);
    e.handleGift(viewer('b'), { giftName: 'Rose', repeatCount: 5 });
    const progress = building(e, 'b');
    e.handleLeave('b');
    e.handleJoin(viewer('c'));
    expect(e.handleJoin(viewer('b'))).toEqual([]);
    e.handleLeave('c');
    e.handleJoin(viewer('b'));
    expect(building(e, 'b')).toEqual(progress);
    expect(building(e, 'b')).toMatchObject({ health: 190, shieldHealth: 5, level: 2 });
  });
  it('releases dead participants but does not grant a new life on return', () => {
    const { engine: e } = setup();
    e.handleGift(viewer('a'), { giftName: 'Paper Crane', repeatCount: 1 });
    e.handleLeave('b');
    expect(e.handleJoin(viewer('c'))).toHaveLength(1);
    e.handleLeave('c');
    e.handleLike(viewer('b'), 100);
    expect(building(e, 'b')).toBeUndefined();
    expect(e.getState().users.find(u => u.userId === 'b')?.eliminatedAt).toBeDefined();
    expect(building(e, 'a')?.health).toBe(100);
  });
  it('does not count a round restart as activity or resurrect departed viewers', () => {
    const { engine: e, advance } = setup();
    e.handleLeave('b');
    advance(59000);
    e.reset(600000, true);
    expect(e.getState().users.map(u => u.userId)).toEqual(['a']);
    advance(1000);
    expect(e.expireInactive()).toHaveLength(1);
    e.handleJoin(viewer('b'));
    expect(building(e, 'b')?.health).toBe(100);
  });
  it('keeps the published summary immutable when departures occur before the next round', () => {
    const { engine: e, advance } = setup();
    e.finishRound();
    const round = e.getState().round;
    e.handleLeave('b');
    expect(e.getState().round).toEqual(round);
    advance(10000);
    expect(e.restartIfDue()).toBe(true);
    expect(e.getState().users.map(u => u.userId)).toEqual(['a']);
  });
});
