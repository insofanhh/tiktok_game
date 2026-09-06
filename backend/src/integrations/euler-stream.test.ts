import { describe, expect, it, vi } from 'vitest';
import { EulerStreamSource } from './euler-stream.js';
function setup() {
  const sink={onJoin:vi.fn(),onLike:vi.fn(),onGift:vi.fn(),onChat:vi.fn(),onStatus:vi.fn()};
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
