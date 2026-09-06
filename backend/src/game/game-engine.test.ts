import { describe, expect, it, vi } from 'vitest';
import { GameEngine, resolveGiftKind } from './game-engine.js';
import type { ViewerIdentity } from './types.js';
const blue: ViewerIdentity = { userId:'blue', uniqueId:'blue', nickname:'Blue', avatarUrl:'https://example.com/avatar.jpg' };
const red: ViewerIdentity = { userId:'red', uniqueId:'red', nickname:'Red' };
const unit = (engine: GameEngine, id: string) => engine.getState().grid.flat().find(c => c.building?.ownerId === id)?.building;
const gift = (engine: GameEngine, viewer: ViewerIdentity, giftName: string, repeatCount = 1) => engine.handleGift(viewer,{giftName,repeatCount});
function battle() {
  const engine = new GameEngine({ random: () => 0 });
  engine.handleJoin(blue); engine.handleJoin(red);
  return engine;
}
describe('survival rules', () => {
  it('grants one 100 HP avatar on presence and balances the teams', () => {
    const e=battle();
    expect(unit(e,'blue')).toMatchObject({health:100,maxHealth:100,level:1,avatarUrl:blue.avatarUrl});
    expect(e.getState().scores).toEqual({blue:1,red:1});
    e.handleJoin({...blue,nickname:'Updated'});
    expect(e.getState().users).toHaveLength(2);
    expect(unit(e,'blue')?.ownerName).toBe('Updated');
  });
  it('can enroll viewers whose member event was missed via chat/like/gift', () => {
    const e=new GameEngine({random:()=>0});
    e.handleChat(blue,'hello');
    e.handleLike(red,1);
    expect(unit(e,'blue')?.health).toBe(98);
    expect(e.getState().users).toHaveLength(2);
  });
  it('counts individual hearts in a bundled event, never room total likes', () => {
    const e=battle();
    e.handleLike(blue,7);
    expect(unit(e,'red')?.health).toBe(86);
    expect(e.getState().users[0]?.shots).toBe(7);
  });
  it('absorbs one damage per rose before applying the rest to health', () => {
    const e=battle(); gift(e,red,'Hoa hồng');
    e.handleLike(blue,3);
    expect(unit(e,'red')).toMatchObject({health:95,shieldHealth:0});
    expect(e.getState().users[0]?.shots).toBe(3);
  });
  it('stacks shields from every rose and only consumes absorbed damage', () => {
    const e=battle(); gift(e,red,'Rose',8);
    e.handleLike(blue,2);
    expect(unit(e,'red')).toMatchObject({ health:100, shieldHealth:4 });
    expect(e.getState().users[1]?.shielded).toBe(8);
  });
  it('Rosa deals ten damage per gift and a one-point shield absorbs only one damage', () => {
    const e=battle(); gift(e,red,'Rose'); gift(e,blue,'Rosa',3);
    expect(unit(e,'red')).toMatchObject({health:71,shieldHealth:0});
  });
  it('Lucky Pig upgrades once to level 2 with 200 HP, without repeat healing', () => {
    const e=battle(); e.handleLike(blue,20);
    gift(e,red,'Heo may mắn');
    expect(unit(e,'red')).toMatchObject({health:200,maxHealth:200,level:2});
    e.handleLike(blue,2); gift(e,red,'Lucky Pig',5);
    expect(unit(e,'red')?.health).toBe(196);
    expect(e.getState().users[1]?.upgraded).toBe(1);
  });
  it('eliminates an avatar when HP reaches zero and never re-enrolls that user in the same round', () => {
    const e=battle(); e.handleLike(blue,100);
    expect(unit(e,'red')).toBeUndefined();
    e.handleJoin(red); gift(e,red,'Lucky Pig'); e.handleLike(red,100);
    expect(unit(e,'red')).toBeUndefined();
    expect(unit(e,'blue')?.health).toBe(100);
    expect(e.getState().users[0]?.destroyed).toBe(1);
  });
  it('Paper Crane eliminates one opponent through shield and level 2 HP', () => {
    const e=battle(); gift(e,red,'Lucky Pig'); gift(e,red,'Rose');
    gift(e,blue,'Hạc giấy');
    expect(unit(e,'red')).toBeUndefined();
    expect(e.getState().scores).toEqual({blue:1,red:0});
  });
  it.each([['Money Gun',10],['Thiên hà',20]] as const)('%s eliminates %i distinct opponents', (name,count) => {
    const e=new GameEngine({random:()=>0});
    for(let i=0;i<44;i++) e.handleJoin({userId:'u'+i,uniqueId:'u'+i,nickname:'U'+i});
    const viewer=e.getState().users[0]!;
    const before=e.getState().scores.red;
    const actions=gift(e,viewer,name);
    expect(e.getState().scores.red).toBe(before-count);
    expect(new Set(actions.map(a=>a.targetUserId)).size).toBe(count);
    expect(e.getState().users[0]?.destroyed).toBe(count);
  });
  it('stops multi-target gifts when fewer opponents remain and never attacks allies', () => {
    const e=battle(); gift(e,blue,'Galaxy',100);
    expect(e.getState().scores).toEqual({blue:1,red:0});
    expect(e.getState().users[0]?.destroyed).toBe(1);
  });
  it('bounds enormous like bundles by remaining HP rather than looping once per like', () => {
    const e=battle();
    const actions=e.handleLike(blue,Number.MAX_SAFE_INTEGER);
    expect(actions).toHaveLength(1);
    expect(e.getState().users[0]?.shots).toBe(50);
  });
  it.each([NaN,Infinity,-1,0,1.5])('rejects invalid like count %s', count => {
    const e=battle(); e.handleLike(blue,count);
    expect(unit(e,'red')?.health).toBe(100);
  });
  it('ignores unmapped gifts even when their price matches a mapped gift', () => {
    const e=battle();
    expect(resolveGiftKind('Unknown',9999)).toBeUndefined();
    e.handleGift(blue,{giftName:'Unknown',diamondCount:1,repeatCount:1});
    expect(unit(e,'blue')?.shieldHealth).toBe(0);
  });
  it('refuses new users when the arena has no free cells', () => {
    const e=new GameEngine({gridSize:2,random:()=>0});
    for(let i=0;i<5;i++) e.handleJoin({userId:''+i,uniqueId:''+i,nickname:''+i});
    expect(e.getState().users).toHaveLength(4);
  });
});
describe('two-HP hearts and focused targeting', () => {
  const ally: ViewerIdentity = { userId:'ally', uniqueId:'ally', nickname:'Ally' };
  const nextRed: ViewerIdentity = { userId:'red-2', uniqueId:'red-2', nickname:'Red 2' };
  function squads() {
    const random = vi.fn(() => 0);
    const engine = new GameEngine({ random });
    for (const viewer of [blue, red, ally, nextRed]) engine.handleJoin(viewer);
    return { engine, random };
  }

  it('groups ten hearts into twenty damage against exactly one opponent', () => {
    const { engine } = squads();
    expect(engine.handleLike(blue, 10)).toEqual([expect.objectContaining({
      type:'DAMAGE', targetUserId:'red', shotCount:10, damage:20, remainingHealth:80,
    })]);
    expect(unit(engine, 'red-2')?.health).toBe(100);
    expect(engine.getState().users[0]).toMatchObject({ shots:10, damageDealt:20, destroyed:0 });
  });

  it('keeps the same opponent when ten hearts arrive as separate events', () => {
    const { engine, random } = squads();
    const actions = engine.handleLike(blue, 1);
    random.mockReturnValue(0.99);
    for (let i = 1; i < 10; i++) actions.push(...engine.handleLike(blue, 1));
    expect(new Set(actions.map(action => action.targetUserId))).toEqual(new Set(['red']));
    expect(unit(engine, 'red')?.health).toBe(80);
    expect(unit(engine, 'red-2')?.health).toBe(100);
    expect(engine.getState().users[0]).toMatchObject({ shots:10, damageDealt:20 });
  });

  it("uses excess hearts on the defeated opponent's teammate within the same event", () => {
    const { engine } = squads();
    expect(engine.handleLike(blue, 60)).toEqual([
      expect.objectContaining({ type:'DESTROY', targetUserId:'red', shotCount:50, damage:100, remainingHealth:0 }),
      expect.objectContaining({ type:'DAMAGE', targetUserId:'red-2', shotCount:10, damage:20, remainingHealth:80 }),
    ]);
    expect(unit(engine, 'red')).toBeUndefined();
    expect(unit(engine, 'red-2')?.health).toBe(80);
    expect(unit(engine, 'blue')?.health).toBe(100);
    expect(unit(engine, 'ally')?.health).toBe(100);
    expect(engine.getState().users[0]).toMatchObject({ shots:60, damageDealt:120, destroyed:1 });
  });

  it('carries remaining shots over multiple enemies and stops when none remain', () => {
    const { engine } = squads();
    const actions = engine.handleLike(blue, Number.MAX_SAFE_INTEGER);
    expect(actions).toHaveLength(2);
    expect(engine.getState().scores).toEqual({ blue:2, red:0 });
    expect(engine.getState().users[0]).toMatchObject({ shots:100, damageDealt:200, destroyed:2 });
    expect(engine.handleLike(blue, 10)).toEqual([]);
    expect(unit(engine, 'ally')?.health).toBe(100);
  });

  it('uses only the shots needed for a wounded target before switching', () => {
    const { engine } = squads();
    engine.handleLike(blue, 45);
    const actions = engine.handleLike(blue, 10);
    expect(actions).toEqual([
      expect.objectContaining({ targetUserId:'red', shotCount:5, damage:10 }),
      expect.objectContaining({ targetUserId:'red-2', shotCount:5, damage:10 }),
    ]);
    expect(unit(engine, 'red-2')?.health).toBe(90);
  });

  it('keeps focus while depleting shield points and applying excess damage to HP', () => {
    const { engine, random } = squads();
    engine.handleLike(blue, 1);
    gift(engine, red, 'Rose', 10);
    random.mockReturnValue(0.99);
    expect(engine.handleLike(blue, 10)).toEqual([
      expect.objectContaining({ type:'DAMAGE', targetUserId:'red', shotCount:10, damage:10, shieldDamage:10 }),
    ]);
    expect(unit(engine, 'red')).toMatchObject({ health:88, shieldHealth:0 });
    expect(unit(engine, 'red-2')?.health).toBe(100);
  });

  it("absorbs damage with the next target's shield after a kill", () => {
    const { engine } = squads();
    engine.handleLike(blue, 49);
    gift(engine, nextRed, 'Rose');
    expect(engine.handleLike(blue, 4)).toEqual([
      expect.objectContaining({ type:'DESTROY', targetUserId:'red', shotCount:1, damage:2 }),
      expect.objectContaining({ type:'DAMAGE', targetUserId:'red-2', shotCount:3, damage:5, shieldDamage:1 }),
    ]);
    expect(unit(engine, 'red-2')).toMatchObject({ health:95, shieldHealth:0 });
  });

  it('handles upgraded 200-HP targets before moving excess shots to another opponent', () => {
    const { engine } = squads();
    gift(engine, red, 'Lucky Pig');
    engine.handleLike(blue, 110);
    expect(unit(engine, 'red')).toBeUndefined();
    expect(unit(engine, 'red-2')?.health).toBe(80);
    expect(engine.getState().users[0]).toMatchObject({ shots:110, damageDealt:220, destroyed:1 });
  });

  it('selects another opponent when someone else eliminates the locked target', () => {
    const { engine } = squads();
    engine.handleLike(blue, 1);
    gift(engine, ally, 'Paper Crane');
    expect(engine.handleLike(blue, 1)).toEqual([
      expect.objectContaining({ targetUserId:'red-2', damage:2, shotCount:1 }),
    ]);
  });

  it('clears previous targets when a new round starts', () => {
    const { engine, random } = squads();
    engine.handleLike(blue, 1);
    engine.reset(60000, true);
    random.mockReturnValue(0.99);
    expect(engine.handleLike(blue, 1)).toEqual([
      expect.objectContaining({ targetUserId:'red-2', damage:2 }),
    ]);
    expect(unit(engine, 'red')?.health).toBe(100);
  });
});

describe('stacking Rose shield points', () => {
  it.each([blue, red])('adds ten shield points per ten roses to $nickname', viewer => {
    const e = battle();
    expect(gift(e, viewer, 'Rose', 10)).toEqual([
      expect.objectContaining({ type:'SHIELD', remainingShieldHealth:10 }),
    ]);
    expect(unit(e, viewer.userId)).toMatchObject({ health:100, shieldHealth:10 });
    gift(e, viewer, 'Hoa hồng', 10);
    expect(unit(e, viewer.userId)).toMatchObject({ health:100, shieldHealth:20 });
    expect(e.getState().users.find(u => u.userId === viewer.userId)?.shielded).toBe(20);
  });

  it('adds separate gifts to the remaining shield instead of replacing it', () => {
    const e = battle();
    for (let i = 0; i < 10; i++) gift(e, red, 'Rose');
    e.handleLike(blue, 3);
    expect(unit(e, 'red')).toMatchObject({ health:100, shieldHealth:4 });
    gift(e, red, 'Rose', 10);
    expect(unit(e, 'red')).toMatchObject({ health:100, shieldHealth:14 });
  });

  it('retains unused shield after each hit and only damages HP once it runs out', () => {
    const e = battle(); gift(e, red, 'Rose', 10);
    expect(e.handleLike(blue, 3)).toEqual([
      expect.objectContaining({ type:'BLOCKED', damage:0, shieldDamage:6, remainingShieldHealth:4, remainingHealth:100, shotCount:3 }),
    ]);
    expect(e.handleLike(blue, 2)).toEqual([
      expect.objectContaining({ type:'BLOCKED', damage:0, shieldDamage:4, remainingShieldHealth:0, remainingHealth:100 }),
    ]);
    e.handleLike(blue, 1);
    expect(unit(e, 'red')).toMatchObject({ health:98, shieldHealth:0 });
    expect(e.getState().users[0]).toMatchObject({ shots:6, damageDealt:2 });
  });

  it('spills damage beyond the shield into HP in the same volley', () => {
    const e = battle(); gift(e, red, 'Rose', 10);
    expect(e.handleLike(blue, 6)).toEqual([
      expect.objectContaining({ type:'DAMAGE', damage:2, shieldDamage:10, remainingShieldHealth:0, remainingHealth:98, shotCount:6 }),
    ]);
  });

  it('absorbs Rosa by shield HP rather than discarding the whole shield', () => {
    const e = battle(); gift(e, red, 'Rose', 15);
    gift(e, blue, 'Rosa');
    expect(unit(e, 'red')).toMatchObject({ health:100, shieldHealth:5 });
    expect(gift(e, blue, 'Rosa')).toEqual([
      expect.objectContaining({ type:'DAMAGE', damage:5, shieldDamage:5, remainingShieldHealth:0, remainingHealth:95 }),
    ]);
  });

  it('does not cap Rose streaks at 100 or emit an action per rose', () => {
    const e = battle();
    expect(gift(e, red, 'Rose', 1000)).toHaveLength(1);
    expect(unit(e, 'red')?.shieldHealth).toBe(1000);
    expect(e.getState().users[1]?.shielded).toBe(1000);
  });

  it("keeps each player's shield independent when attacking", () => {
    const e = battle(); gift(e, blue, 'Rose', 10); gift(e, red, 'Rose', 7);
    e.handleLike(red, 3);
    expect(unit(e, 'blue')).toMatchObject({ health:100, shieldHealth:4 });
    expect(unit(e, 'red')).toMatchObject({ health:100, shieldHealth:7 });
  });

  it('preserves shield through presence updates and level upgrades, then clears it for a new round', () => {
    const e = battle(); gift(e, red, 'Rose', 10);
    e.handleJoin({ ...red, nickname:'Updated' });
    gift(e, red, 'Lucky Pig');
    expect(unit(e, 'red')).toMatchObject({ health:200, shieldHealth:10 });
    e.reset(60000, true);
    expect(unit(e, 'red')).toMatchObject({ health:100, shieldHealth:0 });
  });

  it('keeps instant elimination gifts effective through stacked shields', () => {
    const e = battle(); gift(e, red, 'Rose', 1000);
    expect(gift(e, blue, 'Paper Crane')).toEqual([
      expect.objectContaining({ type:'MEGA_DESTROY', damage:100, shieldDamage:0, remainingShieldHealth:0 }),
    ]);
    expect(unit(e, 'red')).toBeUndefined();
    gift(e, red, 'Rose', 10);
    expect(unit(e, 'red')).toBeUndefined();
  });

  it('batches huge volleys using shield plus HP and preserves exact shot statistics', () => {
    const e = battle(); gift(e, red, 'Rose', 10);
    expect(e.handleLike(blue, Number.MAX_SAFE_INTEGER)).toEqual([
      expect.objectContaining({ type:'DESTROY', shotCount:55, damage:100, shieldDamage:10 }),
    ]);
    expect(e.getState().users[0]).toMatchObject({ shots:55, damageDealt:100, destroyed:1 });
  });
});

describe('server-controlled rounds', () => {
  it('ends at the exact deadline, freezes ranking, rejects late input, and keeps the result', () => {
    let now=1000;
    const e=new GameEngine({now:()=>now,durationMs:1000,random:()=>0});
    e.handleJoin(blue); e.handleJoin(red); e.handleLike(blue,20);
    now=2000;
    expect(e.finishIfExpired()).toBe(true);
    const result=e.getState();
    expect(result.round.status).toBe('finished');
    expect(result.round.ranking[0]?.userId).toBe('blue');
    expect(result.round.winner).toBe('draw');
    expect(e.handleLike(red,100)).toEqual([]);
    expect(gift(e,red,'Galaxy')).toEqual([]);
    expect(e.handleJoin({userId:'late',uniqueId:'late',nickname:'Late'})).toEqual([]);
    now=99999;
    expect(e.getState().round).toEqual(result.round);
    expect(e.finishIfExpired()).toBe(false);
  });
  it('ranks survivors ahead of eliminated users and returns immutable snapshots', () => {
    let now=100;
    const e=new GameEngine({now:()=>now,random:()=>0});
    e.handleJoin(blue);e.handleJoin(red);
    now=200;gift(e,blue,'Paper Crane');
    now=300;
    const result=e.finishRound();
    expect(result.round.winner).toBe('blue');
    expect(result.round.ranking.map(r=>r.alive)).toEqual([true,false]);
    expect(result.round.ranking[1]?.survivalMs).toBe(100);
    result.round.ranking[0]!.health=1;
    expect(e.getState().round.ranking[0]?.health).toBe(100);
  });
  it('starts a new round and resurrects participants without old elimination timestamps or scores', () => {
    const e=battle(); gift(e,blue,'Paper Crane');
    const old=e.finishRound().round.id;
    const next=e.reset(60000,true);
    expect(next.round.id).not.toBe(old);
    expect(next.round.status).toBe('active');
    expect(next.users.every(u=>u.destroyed===0 && u.eliminatedAt===undefined)).toBe(true);
    expect(next.scores).toEqual({blue:1,red:1});
    expect(unit(e,'red')?.health).toBe(100);
  });
  it('returns an empty, valid summary for a round with no viewers', () => {
    const e=new GameEngine();
    expect(e.finishRound().round).toMatchObject({winner:'draw',ranking:[],status:'finished'});
  });
});

describe('automatic next round', () => {
  it('keeps results for exactly ten seconds, then revives everyone once', () => {
    let now=1000;
    const e=new GameEngine({now:()=>now,durationMs:60000,random:()=>0});
    e.handleJoin(blue); e.handleJoin(red); gift(e,blue,'Paper Crane');
    const result=e.finishRound();
    expect(result.round.restartAt).toBe(11000);
    now=10999;
    expect(e.restartIfDue()).toBe(false);
    expect(e.getState().round.id).toBe(result.round.id);
    now=11000;
    expect(e.restartIfDue()).toBe(true);
    const next=e.getState();
    expect(next.round).toMatchObject({status:'active',startedAt:11000,endsAt:71000,restartAt:null,ranking:[]});
    expect(next.round.id).not.toBe(result.round.id);
    expect(next.scores).toEqual({blue:1,red:1});
    expect(next.users.every(u=>u.destroyed===0 && u.eliminatedAt===undefined)).toBe(true);
    expect(e.restartIfDue()).toBe(false);
  });
  it('starts the full summary period when a delayed server notices expiry', () => {
    let now=1000;
    const e=new GameEngine({now:()=>now,durationMs:1000});
    now=9000;
    e.finishIfExpired();
    expect(e.getState().round.restartAt).toBe(19000);
    expect(e.restartIfDue()).toBe(false);
  });
  it('cancels the old automatic deadline when a round is restarted manually', () => {
    let now=1000;
    const e=new GameEngine({now:()=>now,durationMs:60000});
    e.finishRound();
    now=2000;
    const manual=e.reset();
    now=11000;
    expect(e.restartIfDue()).toBe(false);
    expect(e.getState().round.id).toBe(manual.round.id);
  });
});
