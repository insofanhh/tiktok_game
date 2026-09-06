import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameAudio } from '../../../frontend/lib/game-audio';
import type { GameAction } from '../../../frontend/lib/game-types';

function fixture() {
  const sources: Array<{buffer: unknown; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: null | (()=>void)}> = [];
  const node = () => ({connect:vi.fn(),disconnect:vi.fn()});
  const context = {
    currentTime: 1, state:'running', destination:{},
    createDynamicsCompressor:()=>({...node(),threshold:{value:0},knee:{value:0},ratio:{value:0},attack:{value:0},release:{value:0}}),
    createGain:()=>({...node(),gain:{value:0,setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()}}),
    createOscillator:vi.fn(()=>({...node(),frequency:{setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},start:vi.fn(),stop:vi.fn()})),
    createBufferSource:()=>{
      const source={...node(),buffer:null as unknown,playbackRate:{value:1},start:vi.fn(),stop:vi.fn(),onended:null as null|(()=>void)};
      sources.push(source); return source;
    },
    decodeAudioData:async(bytes:ArrayBuffer)=>({tag:new Uint8Array(bytes)[0]}),
    close:vi.fn(async()=>undefined),
  };
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(new Uint8Array([url.includes('heavy') ? 2 : 1]))));
  return {audio:new GameAudio(context as unknown as AudioContext),context,sources};
}
function action(type:GameAction['type'],shotCount=1):GameAction {
  return {id:'shot',type,team:'blue',user:{userId:'u',uniqueId:'u',nickname:'U'},timestamp:Date.now(),message:'',shotCount};
}
afterEach(()=>vi.unstubAllGlobals());
describe('recorded gunshot playback',()=>{
  it('uses the rifle recording for shots and the heavy recording for elimination gifts',async()=>{
    const {audio,context,sources}=fixture(); await audio.load();
    audio.playAction(action('DAMAGE'));
    context.currentTime+=1; audio.playAction(action('MEGA_DESTROY'));
    expect(sources.map(s=>s.buffer)).toEqual([{tag:1},{tag:2}]);
    expect(sources.every(s=>s.start.mock.calls.length===1)).toBe(true);
    expect(context.createOscillator).not.toHaveBeenCalled();
  });
  it('caps simultaneous voices even with huge like bundles and overlapping volleys',async()=>{
    const {audio,context,sources}=fixture(); await audio.load();
    for(let i=0;i<20;i++) { context.currentTime+=.1; audio.playAction(action('DAMAGE',10000)); }
    expect(sources).toHaveLength(6);
    audio.stopVoices();
    expect(sources.every(s=>s.stop.mock.calls.length===1)).toBe(true);
    context.currentTime+=1; audio.playAction(action('DAMAGE'));
    expect(sources).toHaveLength(7);
  });
  it('does not play while suspended and can retry a failed sample download',async()=>{
    const {audio,context,sources}=fixture();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await expect(audio.load()).rejects.toThrow('offline');
    await expect(audio.load()).resolves.toBeUndefined();
    context.state='suspended'; audio.playAction(action('DAMAGE'));
    expect(sources).toHaveLength(0);
  });
});
