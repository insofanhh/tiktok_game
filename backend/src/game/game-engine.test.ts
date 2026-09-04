import { describe, expect, it } from 'vitest';
import { GameEngine, resolveGiftKind } from './game-engine.js';
import type { ViewerIdentity } from './types.js';

const blue: ViewerIdentity = { userId: 'blue-1', uniqueId: 'blue', nickname: 'Blue' };
const red: ViewerIdentity = { userId: 'red-1', uniqueId: 'red', nickname: 'Red' };

function setupBattle(): GameEngine {
  const values = [0, 0.75, 0, 0];
  const engine = new GameEngine({ random: () => values.shift() ?? 0 });
  engine.handleGift(blue, { giftName: 'Rose', diamondCount: 1, repeatCount: 1 });
  engine.handleGift(red, { giftName: 'Rose', diamondCount: 1, repeatCount: 1 });
  engine.handleGift(blue, { giftName: 'Rosa', diamondCount: 10, repeatCount: 1 });
  engine.handleGift(red, { giftName: 'Rosa', diamondCount: 10, repeatCount: 1 });
  return engine;
}

describe('GameEngine', () => {
  it('uses a Rose or any 1-coin gift to assign a random team', () => {
    const engine = new GameEngine({ random: () => 0.75 });
    const [action] = engine.handleGift(blue, { giftName: 'Rose', diamondCount: 1, repeatCount: 1 });

    expect(action?.type).toBe('JOIN');
    expect(action?.team).toBe('red');
    expect(engine.getState().users[0]?.team).toBe('red');
    expect(engine.getState().scores).toEqual({ blue: 0, red: 0 });
  });

  it('builds a 10 HP house for Rosa or any 10-coin gift', () => {
    const engine = new GameEngine({ random: () => 0 });
    engine.handleGift(blue, { giftName: 'Rose', diamondCount: 1, repeatCount: 1 });
    const [action] = engine.handleGift(blue, { giftName: 'Rosa', diamondCount: 10, repeatCount: 1 });
    const building = engine.getState().grid[0]?.[0]?.building;

    expect(action?.type).toBe('BUILD');
    expect(building?.health).toBe(10);
    expect(building?.maxHealth).toBe(10);
  });

  it('fires from an owned house and removes one HP per 5-coin gift', () => {
    const engine = setupBattle();
    const [action] = engine.handleGift(blue, { giftName: '5 Coin Gift', diamondCount: 5, repeatCount: 1 });
    const target = engine.getState().grid[0]?.[10]?.building;

    expect(action?.type).toBe('DAMAGE');
    expect(action?.sourceX).toBe(0);
    expect(action?.x).toBe(10);
    expect(action?.remainingHealth).toBe(9);
    expect(target?.health).toBe(9);
  });

  it('destroys a house only after ten regular shots', () => {
    const engine = setupBattle();
    let lastType: string | undefined;
    for (let shot = 0; shot < 10; shot += 1) {
      [lastType] = engine
        .handleGift(blue, { giftName: '5 Coin Gift', diamondCount: 5, repeatCount: 1 })
        .map((action) => action.type);
    }

    expect(lastType).toBe('DESTROY');
    expect(engine.getState().scores.red).toBe(0);
    expect(engine.getState().leaderboard.destroyers[0]?.score).toBe(1);
  });

  it('uses a shield to block one regular shot without losing HP', () => {
    const engine = setupBattle();
    engine.handleGift(red, { giftName: '20 Coin Gift', diamondCount: 20, repeatCount: 1 });
    const [blocked] = engine.handleGift(blue, { giftName: '5 Coin Gift', diamondCount: 5, repeatCount: 1 });
    const target = engine.getState().grid[0]?.[10]?.building;

    expect(blocked?.type).toBe('BLOCKED');
    expect(target?.shielded).toBe(false);
    expect(target?.health).toBe(10);
  });

  it('lets gifts over 100 coins destroy a shielded house immediately', () => {
    const engine = setupBattle();
    engine.handleGift(red, { giftName: '20 Coin Gift', diamondCount: 20, repeatCount: 1 });
    const [destroyed] = engine.handleGift(blue, { giftName: 'Big Gift', diamondCount: 101, repeatCount: 1 });

    expect(destroyed?.type).toBe('MEGA_DESTROY');
    expect(engine.getState().scores.red).toBe(0);
  });

  it('maps supported coin values and ignores unsupported prices', () => {
    expect(resolveGiftKind('anything', 1)).toBe('join');
    expect(resolveGiftKind('anything', 5)).toBe('attack');
    expect(resolveGiftKind('anything', 10)).toBe('build');
    expect(resolveGiftKind('anything', 20)).toBe('shield');
    expect(resolveGiftKind('anything', 100)).toBeUndefined();
    expect(resolveGiftKind('anything', 101)).toBe('megaAttack');
  });
});
