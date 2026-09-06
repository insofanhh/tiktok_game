import { describe, expect, it } from 'vitest';
import { createPatrolSlots, patrolPosition } from '../../../frontend/lib/arena-motion';
import { CARD_HEIGHT, CARD_WIDTH } from '../../../frontend/lib/arena-layout';

describe('stickman patrols', () => {
  it.each([16, 40, 100, 400])('keeps all %i players and their full bodies in the correct half at all sampled times', count => {
    const users = Array.from({length:count},(_,i)=>({userId:'u'+i,team:i%2 ? 'red' as const : 'blue' as const}));
    for (const [width,height] of [[296,240],[366,504],[1100,600]]) {
      const slots=createPatrolSlots(users,width!,height!);
      expect(slots).toHaveLength(count);
      for(const slot of slots) for(const time of [0,.25,1,3,10,30,75,600]) {
        const p=patrolPosition(slot,time);
        expect(p.x).toBeGreaterThanOrEqual(slot.team==='blue' ? 0 : width!/2);
        expect(p.x+CARD_WIDTH*p.scale).toBeLessThanOrEqual(slot.team==='blue' ? width!/2 : width!);
        expect(p.y).toBeGreaterThanOrEqual(34);
        expect(p.y+CARD_HEIGHT*p.scale).toBeLessThanOrEqual(height!);
        // A player's complete body stays inside its own patrol sector, avoiding overlaps.
        expect(p.x).toBeGreaterThanOrEqual(slot.left);
        expect(p.x+CARD_WIDTH*p.scale).toBeLessThanOrEqual(slot.left+slot.width);
        expect(p.y).toBeGreaterThanOrEqual(slot.top);
        expect(p.y+CARD_HEIGHT*p.scale).toBeLessThanOrEqual(slot.top+slot.height);
      }
    }
  });
  it('moves over time, staggers players and honors reduced motion',()=>{
    const slots=createPatrolSlots([{userId:'alice',team:'blue'},{userId:'bob',team:'blue'}],366,504);
    const slot=slots[0]!;
    expect(patrolPosition(slot,0)).not.toEqual(patrolPosition(slot,1));
    expect(slots[0]?.seed).not.toEqual(slots[1]?.seed);
    expect(patrolPosition(slot,0,true)).toEqual(patrolPosition(slot,50,true));
  });
  it('keeps an uneven team and viewport changes bounded',()=>{
    const users=Array.from({length:99},(_,i)=>({userId:''+i,team:'red' as const}));
    const narrow=createPatrolSlots(users,320,500),wide=createPatrolSlots(users,900,500);
    expect(narrow).toHaveLength(99);
    expect(wide[0]!.scale).toBeGreaterThan(narrow[0]!.scale);
    expect(createPatrolSlots(users,0,0)).toEqual([]);
  });
});
