'use client';
import { Clock3, Crown, Heart, Radio, Shield, Swords, Trophy, Users, Volume2, VolumeX, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { GameState, RankingEntry } from '@/lib/game-types';
import { Avatar } from './avatar';
import { GameCanvas } from './game-canvas';
import { SettingsPanel } from './settings-panel';
import { useGameSocket } from './socket-provider';
import { useGameAudio } from './use-game-audio';

const gifts = [
  { icon: '♥', name: 'Thả tim', detail: '1 tim · 1 phát bắn', gift: '' },
  { icon: '🌹', name: 'Hoa hồng', detail: 'Khiên chặn 1 phát', gift: 'Rose' },
  { icon: '🌷', name: 'Rosa', detail: 'Bắn −10 HP', gift: 'Rosa' },
  { icon: '🐷', name: 'Heo may mắn', detail: 'Cấp 2 · 200 HP', gift: 'Lucky Pig' },
  { icon: '🕊️', name: 'Hạc giấy', detail: 'Loại 1 đối thủ', gift: 'Paper Crane' },
  { icon: '💸', name: 'Súng bắn tiền', detail: 'Loại 10 đối thủ', gift: 'Money Gun' },
  { icon: '🌌', name: 'Thiên hà', detail: 'Loại 20 đối thủ', gift: 'Galaxy' },
];

export function GameApp() {
  const { state, recentActions, connection, source, serverUrl } = useGameSocket();
  const [tab, setTab] = useState<'arena'|'ranking'>('arena');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const finished = state.round.status === 'finished';
  const audio = useGameAudio(recentActions, finished);
  const survivors = state.scores.blue + state.scores.red;
  const latest = recentActions.find(a => a.type !== 'IGNORED');
  const ranking = useMemo(() => liveRanking(state), [state]);
  const connected = connection === 'online';
  useEffect(() => { setTab('arena'); }, [state.round.id]);
  const restart = async () => {
    setPending(true); setError('');
    try { await post(serverUrl + '/api/round/restart', {}); }
    catch(e) { setError(e instanceof Error ? e.message : 'Không thể bắt đầu vòng mới'); }
    finally { setPending(false); }
  };

  return <main className="survival-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="TikTok Kingdom Clash"><span className="brand-mark"><Swords size={23}/></span><span>KINGDOM <b>CLASH</b><small>ĐẤU TRƯỜNG SINH TỒN</small></span></a>
      <div className="header-controls">
        <button className={'icon-button ' + (audio.enabled ? 'sound-on' : '')} onClick={() => void audio.toggle()} aria-label={audio.enabled ? 'Tắt âm thanh' : 'Bật âm thanh'} aria-pressed={audio.enabled}>{audio.enabled ? <Volume2 size={19}/> : <VolumeX size={19}/>}</button>
        <SettingsPanel serverUrl={serverUrl} connection={connection} source={source}/>
      </div>
    </header>

    <div className="live-bar"><span className={'status-dot ' + (connected && source.connected ? 'connected' : '')}/><span>{!connected ? 'Đang kết nối lại máy chủ…' : source.mode === 'mock' ? 'GIẢ LẬP' : 'TIKTOK LIVE'}</span><span className="live-description">{connected ? source.label : 'Dữ liệu tạm thời chưa cập nhật'}</span><span className="viewer-count"><Users size={14}/>{state.users.length}</span></div>
    {audio.error && <p role="alert" className="error-banner">{audio.error}</p>}
    <section className={'match-header ' + (finished ? 'match-finished' : '')}>
      <div className="round-kicker"><span/><span>{finished ? 'VÒNG ĐẤU ĐÃ KẾT THÚC' : 'VÀO LIVE LÀ CÓ MẶT TRONG TRẬN'}</span><span/></div>
      <div className="scoreboard">
        <div className="team-score blue"><span>PHE XANH</span><strong>{state.scores.blue.toString().padStart(2,'0')}</strong><small>đang sống sót</small></div>
        <div className="round-center"><span className="vs-pill">VS</span><RoundClock round={state.round} serverTime={state.serverTime}/><small><Clock3 size={12}/> CÒN LẠI</small></div>
        <div className="team-score red"><span>PHE ĐỎ</span><strong>{state.scores.red.toString().padStart(2,'0')}</strong><small>đang sống sót</small></div>
      </div>
      <div className="balance-track" aria-label="Tỉ lệ người sống sót hai phe"><span style={{ width: (survivors ? state.scores.blue/survivors*100 : 50)+'%' }}/></div>
    </section>

    {finished ? <section className="results-panel">
      <div className="result-crown"><Trophy size={34}/></div>
      <p className="section-kicker">TỔNG KẾT VÒNG SINH TỒN</p>
      <h1>{state.round.winner === 'draw' ? 'HAI PHE HÒA NHAU' : state.round.winner === 'blue' ? 'PHE XANH CHIẾN THẮNG' : 'PHE ĐỎ CHIẾN THẮNG'}</h1>
      <p className="result-subtitle">{survivors} chiến binh sống sót · {state.users.length} người tham gia</p>
      {state.round.ranking.length > 0 && <div className="podium">{state.round.ranking.slice(0,3).map((r,i) => <div className={'podium-place place-' + i} key={r.userId}><span className="podium-rank">{i === 0 ? <Crown size={23}/> : '#' + (i+1)}</span><Avatar name={r.nickname} url={r.avatarUrl}/><strong>{r.nickname}</strong><small>{r.destroyed} hạ gục · {r.health} HP</small></div>)}</div>}
      <Ranking rows={state.round.ranking}/>
      <AutoRestartCountdown restartAt={state.round.restartAt} serverTime={state.serverTime}/>
      <p className="ranking-rule">Ưu tiên sống sót → hạ gục → HP → thời gian sống sót.</p>
      <button className="primary-action" onClick={() => void restart()} disabled={pending || !connected}>{pending ? 'Đang bắt đầu…' : 'Bắt đầu vòng tiếp theo'}<Zap size={17}/></button>
      {error && <p className="error-banner" role="alert">{error}</p>}
    </section> : <>
      <div className="arena-toolbar"><div className="arena-tabs" aria-label="Chọn nội dung"><button className={tab === 'arena' ? 'selected' : ''} onClick={() => setTab('arena')} aria-pressed={tab === 'arena'}><Swords size={16}/>Đấu trường</button><button className={tab === 'ranking' ? 'selected' : ''} onClick={() => setTab('ranking')} aria-pressed={tab === 'ranking'}><Trophy size={16}/>Bảng hạng</button></div><span className="alive-count"><span/>{survivors} sống sót</span></div>
      <section className="arena-surface">
        {tab === 'arena' ? <GameCanvas state={state} actions={recentActions}/> : <Ranking rows={ranking}/>}
        <div className="battle-caption"><Heart size={15}/><span>Thả tim để khai hỏa. Bảo vệ avatar của bạn!</span></div>
      </section>
      <div className="activity-feed" aria-label="Diễn biến trận đấu">
        <span className="activity-icon"><Zap size={19}/></span>
        {latest ? <div key={latest.id} className="activity-message"><strong className={latest.team}>{latest.user.nickname}</strong><span>{latest.message}</span></div> : <div className="activity-message"><strong>Sẵn sàng vào trận</strong><span>Mỗi người xem có 1 avatar · 100 HP</span></div>}
        <span className="activity-live">LIVE</span>
      </div>
    </>}

    <section className="arsenal">
      <div className="section-heading"><div><span className="section-kicker">TIẾP SỨC CHO CHIẾN BINH</span><h2>Kho kỹ năng</h2></div><Shield size={23}/></div>
      <div className="gift-grid">{gifts.map((g,i) => <div className={'gift-card gift-' + i} key={g.name}><span className="gift-icon" aria-hidden="true">{g.icon}</span><div><strong>{g.name}</strong><small>{g.detail}</small></div></div>)}</div>
      <p className="arsenal-note">Khiên không cộng dồn. Quà hạ gục xuyên khiên. Bị loại sẽ chờ vòng sau.</p>
    </section>
    {!audio.enabled && <button className="sound-prompt" onClick={() => void audio.toggle()}><Volume2 size={16}/>Bật âm thanh để cảm nhận trận đấu</button>}
    <DebugControls serverUrl={serverUrl} state={state} enabled={source.mode === 'mock' && connected}/>
    <footer className="survival-footer"><Radio size={13}/> KINGDOM CLASH <span>Vào Live · Chọn phe tự động · Sinh tồn</span><a href="/audio/CREDITS.txt" target="_blank" rel="noreferrer">Nguồn âm thanh</a></footer>
  </main>;
}

function RoundClock({ round, serverTime }: { round: GameState['round']; serverTime: number }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const offset = serverTime ? serverTime - Date.now() : 0;
    const update = () => setRemaining(round.status === 'finished' ? 0 : Math.max(0, Math.ceil((round.endsAt - Date.now() - offset)/1000)));
    update(); const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [round.endsAt, round.status, serverTime]);
  return <strong className={'round-time ' + (remaining <= 30 ? 'urgent' : '')}>{String(Math.floor(remaining/60)).padStart(2,'0')}<span>:</span>{String(remaining%60).padStart(2,'0')}</strong>;
}

function Ranking({ rows }: { rows: RankingEntry[] }) {
  return <div className="ranking-list" aria-label="Bảng xếp hạng"><div className="ranking-head"><span>CHIẾN BINH</span><span>HẠ GỤC</span><span>HP</span></div>
    {rows.length ? rows.map(row => <div key={row.userId} className="ranking-row"><span className="ranking-person"><b className={row.rank <= 3 ? 'top-rank' : ''}>{row.rank}</b><Avatar name={row.nickname} url={row.avatarUrl}/><span><strong>{row.nickname}</strong><small className={row.team}>{row.alive ? 'Sống sót' : 'Đã bị loại'} · Phe {row.team === 'blue' ? 'Xanh' : 'Đỏ'}</small></span></span><b>{row.destroyed}</b><span>{row.health}</span></div>) : <p className="empty-ranking">Chưa có người tham gia vòng này.</p>}
  </div>;
}
function liveRanking(state: GameState): RankingEntry[] {
  const buildings = new Map(state.grid.flatMap(r => r.flatMap(c => c.building ? [[c.building.ownerId,c.building] as const] : [])));
  return state.users.map(u => ({ ...u, rank: 0, score: u.destroyed, alive: buildings.has(u.userId), health: buildings.get(u.userId)?.health ?? 0, level: buildings.get(u.userId)?.level ?? 1, survivalMs: Math.max(0,(u.eliminatedAt ?? state.serverTime)-u.joinedAt) }))
    .sort((a,b) => Number(b.alive)-Number(a.alive) || b.destroyed-a.destroyed || b.health-a.health || b.survivalMs-a.survivalMs || a.userId.localeCompare(b.userId))
    .map((r,i) => ({ ...r, rank: i+1 }));
}
async function post(url: string, data: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const payload = await response.json() as { error?: unknown };
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Thao tác chưa thành công');
  return payload;
}
function DebugControls({ serverUrl, state, enabled }: { serverUrl: string; state: GameState; enabled: boolean }) {
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setVisible(new URLSearchParams(window.location.search).get('debug') === '1'), []);
  if (!visible) return null;
  const send = async (kind: string, giftName?: string) => {
    setPending(true); setError('');
    try {
      const viewer = state.users.find(u => u.userId === selected) ?? state.users[0];
      if (kind === 'join') {
        const id = 'test-' + Date.now();
        await post(serverUrl + '/api/mock/join', { viewer: { userId: id, uniqueId: id, nickname: 'Khách ' + (state.users.length+1) } });
        setSelected(id);
      } else if (kind === 'finish') await post(serverUrl + '/api/mock/finish', {});
      else {
        if (!viewer) throw new Error('Thêm người xem trước khi thử kỹ năng');
        await post(serverUrl + '/api/mock/' + kind, kind === 'like' ? { viewer, count: 1 } : { viewer, giftName, repeatCount: 1 });
      }
    } catch(e) { setError(e instanceof Error ? e.message : 'Lỗi kết nối'); }
    finally { setPending(false); }
  };
  return <details className="mock-panel"><summary>Bảng thử nghiệm sự kiện</summary><label>Người thực hiện<select value={selected || state.users[0]?.userId || ''} onChange={e => setSelected(e.target.value)}>{state.users.map(u => <option value={u.userId} key={u.userId}>{u.nickname} · {u.team === 'blue' ? 'Xanh' : 'Đỏ'}</option>)}</select></label><div className="mock-buttons"><button disabled={pending || !enabled || state.round.status === 'finished'} onClick={() => void send('join')}>+ Người vào Live</button>{gifts.map(g => <button disabled={pending || !enabled || state.round.status === 'finished'} key={g.name} onClick={() => void send(g.gift ? 'gift' : 'like',g.gift)}>{g.icon} {g.name}</button>)}<button disabled={pending || !enabled || state.round.status === 'finished'} onClick={() => void send('finish')}>Kết thúc vòng</button></div>{error && <p role="alert">{error}</p>}</details>;
}

function AutoRestartCountdown({ restartAt, serverTime }: { restartAt: number | null; serverTime: number }) {
  const [seconds, setSeconds] = useState(10);
  useEffect(() => {
    if (!restartAt) return;
    const offset = serverTime - Date.now();
    const update = () => setSeconds(Math.max(0, Math.ceil((restartAt - Date.now() - offset) / 1000)));
    update();
    const timer = setInterval(update, 200);
    return () => clearInterval(timer);
  }, [restartAt, serverTime]);
  if (!restartAt) return null;
  return <p className="auto-restart-countdown" role="timer"><Clock3 size={16}/>
    {seconds > 0 ? <>Vòng tiếp theo bắt đầu sau <strong>{seconds}s</strong></> : 'Đang bắt đầu vòng mới…'}
  </p>;
}
