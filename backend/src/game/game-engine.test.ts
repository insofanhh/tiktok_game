import { describe, expect, it } from 'vitest';
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
    expect(unit(e,'blue')?.health).toBe(99);
    expect(e.getState().users).toHaveLength(2);
  });
  it('counts individual hearts in a bundled event, never room total likes', () => {
    const e=battle();
    e.handleLike(blue,7);
    expect(unit(e,'red')?.health).toBe(93);
    expect(e.getState().users[0]?.shots).toBe(7);
  });
  it('consumes a rose shield on one heart and applies the remaining hearts', () => {
    const e=battle(); gift(e,red,'Hoa hồng');
    e.handleLike(blue,3);
    expect(unit(e,'red')).toMatchObject({health:98,shielded:false});
    expect(e.getState().users[0]?.shots).toBe(3);
  });
  it('does not stack shields from repeated roses', () => {
    const e=battle(); gift(e,red,'Rose',8);
    e.handleLike(blue,2);
    expect(unit(e,'red')?.health).toBe(99);
    expect(e.getState().users[1]?.shielded).toBe(1);
  });
  it('Rosa deals ten HP per gift and a shield blocks one entire shot', () => {
    const e=battle(); gift(e,red,'Rose'); gift(e,blue,'Rosa',3);
    expect(unit(e,'red')).toMatchObject({health:80,shielded:false});
  });
  it('Lucky Pig upgrades once to level 2 with 200 HP, without repeat healing', () => {
    const e=battle(); e.handleLike(blue,20);
    gift(e,red,'Heo may mắn');
    expect(unit(e,'red')).toMatchObject({health:200,maxHealth:200,level:2});
    e.handleLike(blue,2); gift(e,red,'Lucky Pig',5);
    expect(unit(e,'red')?.health).toBe(198);
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
    expect(e.getState().users[0]?.shots).toBe(100);
  });
  it.each([NaN,Infinity,-1,0,1.5])('rejects invalid like count %s', count => {
    const e=battle(); e.handleLike(blue,count);
    expect(unit(e,'red')?.health).toBe(100);
  });
  it('ignores unmapped gifts even when their price matches a mapped gift', () => {
    const e=battle();
    expect(resolveGiftKind('Unknown',9999)).toBeUndefined();
    e.handleGift(blue,{giftName:'Unknown',diamondCount:1,repeatCount:1});
    expect(unit(e,'blue')?.shielded).toBe(false);
  });
  it('refuses new users when the arena has no free cells', () => {
    const e=new GameEngine({gridSize:2,random:()=>0});
    for(let i=0;i<5;i++) e.handleJoin({userId:''+i,uniqueId:''+i,nickname:''+i});
    expect(e.getState().users).toHaveLength(4);
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
