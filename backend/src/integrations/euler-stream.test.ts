import { describe, expect, it, vi } from 'vitest';
import { EulerStreamSource } from './euler-stream.js';
import { GameEngine } from '../game/game-engine.js';
function setup() {
  const sink={onActivity:vi.fn(),onJoin:vi.fn(),onLike:vi.fn(),onGift:vi.fn(),onChat:vi.fn(),onStatus:vi.fn()};
  const source=new EulerStreamSource('test',sink,'unused');
  // Exercise the event dispatcher without opening a real socket or spending gifts.
  const dispatch=(message: {type:string;data:unknown}) => (source as unknown as {handleMessage:(m:unknown)=>void}).handleMessage(message);
  return {sink,dispatch};
}
const user={userId:'42',uniqueId:'viewer',nickname:'Viewer',profilePicture:{urls:['https://example.com/a.jpg']}};
describe('Euler event translation',()=>{
  it('joins on entry only, preserving the profile picture',()=>{
    const {sink,dispatch}=setup();
    dispatch({type:'WebcastMemberMessage',data:{user,actionId:1}});
    dispatch({type:'WebcastMemberMessage',data:{user,actionId:3}});
    expect(sink.onJoin).toHaveBeenCalledTimes(1);
    expect(sink.onJoin.mock.calls[0]?.[0]).toMatchObject({userId:'42',avatarUrl:'https://example.com/a.jpg'});
  });
  it('uses likeCount, not the cumulative room total and deduplicates message IDs',()=>{
    const {sink,dispatch}=setup();
    const message={type:'WebcastLikeMessage',data:{user,likeCount:7,totalLikeCount:99999,event:{msgId:'1'}}};
    dispatch(message);dispatch(message);
    expect(sink.onLike).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({userId:'42'}),7);
  });
  it('applies a streak only on its final event with the final repeat count',()=>{
    const {sink,dispatch}=setup();
    dispatch({type:'WebcastGiftMessage',data:{user,repeatCount:2,repeatEnd:0,giftDetails:{giftType:1,giftName:'Rosa'}}});
    dispatch({type:'WebcastGiftMessage',data:{user,repeatCount:3,repeatEnd:1,giftDetails:{giftType:1,giftName:'Rosa'}}});
    expect(sink.onGift).toHaveBeenCalledTimes(1);
    expect(sink.onGift.mock.calls[0]?.[1]).toMatchObject({giftName:'Rosa',repeatCount:3});
  });
  it('ignores events without an identified viewer',()=>{
    const {sink,dispatch}=setup();
    dispatch({type:'WebcastLikeMessage',data:{likeCount:7}});
    dispatch({type:'WebcastMemberMessage',data:{actionId:1}});
    expect(sink.onLike).not.toHaveBeenCalled(); expect(sink.onJoin).not.toHaveBeenCalled();
  });
});


describe('Rose streaks into shield points', () => {
  it('adds the final ten roses once, including when the final message is retried', () => {
    const engine = new GameEngine({ random: () => 0 });
    const sink = {
      onJoin: vi.fn(), onLike: vi.fn(), onChat: vi.fn(), onStatus: vi.fn(),
      onGift: engine.handleGift.bind(engine),
    };
    const source = new EulerStreamSource('test', sink, 'unused');
    const dispatch = (message: { type:string; data:unknown }) => (source as unknown as { handleMessage:(message:unknown)=>void }).handleMessage(message);
    const rose = { user, giftDetails:{ giftType:1, giftName:'Rose' } };
    for (const repeatCount of [1, 5, 10]) {
      dispatch({ type:'WebcastGiftMessage', data:{ ...rose, repeatCount, repeatEnd:0, event:{ msgId:'in-progress-' + repeatCount } } });
    }
    expect(engine.getState().users).toHaveLength(0);
    const final = { type:'WebcastGiftMessage', data:{ ...rose, repeatCount:10, repeatEnd:1, event:{ msgId:'completed-10' } } };
    dispatch(final); dispatch(final);
    const building = () => engine.getState().grid.flat().find(cell => cell.building?.ownerId === '42')?.building;
    expect(building()).toMatchObject({ health:100, shieldHealth:10 });
    dispatch({ type:'WebcastGiftMessage', data:{ ...rose, repeatCount:10, repeatEnd:1, event:{ msgId:'next-completed-10' } } });
    expect(building()).toMatchObject({ health:100, shieldHealth:20 });
  });
});


describe('Euler viewer activity', () => {
  it('renews presence for in-progress gifts without granting the gift early', () => {
    const { sink, dispatch } = setup();
    const message = { type: 'WebcastGiftMessage', data: { user, repeatCount: 10, repeatEnd: 0, giftDetails: { giftType: 1, giftName: 'Rose' }, event: { msgId: 'streak-progress' } } };
    dispatch(message);
    dispatch(message);
    expect(sink.onActivity).toHaveBeenCalledExactlyOnceWith('42');
    expect(sink.onGift).not.toHaveBeenCalled();
  });
  it('renews identified social activity but ignores room totals and unknown member actions', () => {
    const { sink, dispatch } = setup();
    dispatch({ type: 'WebcastSocialMessage', data: { user } });
    dispatch({ type: 'WebcastRoomUserSeqMessage', data: { user, total: 100 } });
    dispatch({ type: 'WebcastMemberMessage', data: { user, actionId: 3 } });
    dispatch({ type: 'WebcastSocialMessage', data: {} });
    expect(sink.onActivity).toHaveBeenCalledExactlyOnceWith('42');
  });
});
