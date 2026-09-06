import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as pause } from 'node:timers/promises';
import { io } from 'socket.io-client';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../backend/', import.meta.url));
const base = 'http://127.0.0.1:4101';
const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
  cwd, env: { ...process.env, PORT: '4101', HOST: '127.0.0.1', TIKTOK_MODE: 'mock', MOCK_INTERVAL_MS: '0' }, stdio: ['ignore','pipe','pipe'],
});
let logs='';
child.stdout.on('data', d => { logs += d; });
child.stderr.on('data', d => { logs += d; });
let socket;
try {
  for(let i=0;i<100 && !logs.includes('listening on');i++) {
    if(child.exitCode !== null) throw new Error(logs);
    await pause(100);
  }
  assert.match(logs,/listening on http:\/\/127.0.0.1:4101/);
  const initial=await (await fetch(base+'/api/state')).json();
  // The fixture requires Mock and deliberately never switches the user's saved Live source.
  const health=await (await fetch(base+'/health')).json();
  assert.equal(health.source.mode,'mock','Run this smoke check with local Mock settings');
  socket=io(base,{transports:['websocket'],reconnection:false});
  const states=[];
  socket.on('game:state',state=>states.push(state));
  await Promise.race([once(socket,'connect'),pause(5000).then(()=>{throw new Error('Socket timeout');})]);
  const post=async(path,body={})=>{
    const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal(r.status,200,await r.clone().text());
    return r.json();
  };
  const viewer={userId:'smoke',uniqueId:'smoke',nickname:'Smoke'};
  await post('/api/mock/join',{viewer});
  await post('/api/mock/like',{viewer,count:1});
  await post('/api/mock/gift',{viewer,giftName:'Rose',repeatCount:1});
  const result=await post('/api/mock/finish');
  assert.equal(result.round.status,'finished');
  assert.equal(result.users.length,initial.users.length+1);
  const frozen=result.round;
  await post('/api/mock/like',{viewer,count:100});
  const after=await (await fetch(base+'/api/state')).json();
  assert.deepEqual(after.round,frozen);
  assert(Math.abs(frozen.restartAt - result.serverTime - 10000) < 100);
  await pause(10300);
  const automatic=await (await fetch(base+'/api/state')).json();
  assert.notEqual(automatic.round.id,frozen.id);
  assert.equal(automatic.round.status,'active');
  assert.equal(automatic.round.restartAt,null);
  assert(automatic.users.every(u=>u.destroyed===0));
  await pause(100);
  assert(states.some(s=>s.round.id===automatic.round.id),'Automatic restart must reach connected clients');
  const reset=await post('/api/round/restart');
  assert.notEqual(reset.round.id,frozen.id);
  assert.equal(reset.round.status,'active');
  assert(reset.users.every(u=>u.destroyed===0));
  const settings=await (await fetch(base+'/api/settings')).json();
  assert.equal(settings.roundStartedAt,reset.round.startedAt);
  const invalid=await fetch(base+'/api/mock/like',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({viewer,count:-1})});
  assert.equal(invalid.status,400);
  await pause(100);
  assert(states.some(s=>s.round.status==='finished'),'Result must reach connected clients');
  assert(states.some(s=>s.round.id===reset.round.id),'New round must reach connected clients');
  console.log('PASS HTTP + Socket.IO: join, like, shield, finish, freeze, automatic 10-second restart, manual restart, clock sync and invalid-input rejection');
} finally {
  socket?.disconnect();
  child.kill();
  if(child.exitCode===null) await Promise.race([once(child,'exit'),pause(3000)]);
}
