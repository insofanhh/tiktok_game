'use client';

import { Radio, ShieldCheck, Sparkles, Swords, Users, Wifi, WifiOff } from 'lucide-react';
import { gsap } from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { GameAction, Team, UserStats } from '@/lib/game-types';
import { GameCanvas } from './game-canvas';
import { SettingsPanel } from './settings-panel';
import { useGameSocket } from './socket-provider';

export function GameApp() {
  const { state, lastAction, recentActions, connection, source, runtimeSettings, serverUrl } = useGameSocket();
  const recentlyJoinedUserId = lastAction?.type === 'JOIN' ? lastAction.user.userId : undefined;
  const blueTeam = getTeamStandings(state.users, 'blue', recentlyJoinedUserId);
  const redTeam = getTeamStandings(state.users, 'red', recentlyJoinedUserId);

  return (
    <main className="game-shell min-h-screen overflow-hidden bg-[#05080d] text-white">
      <div className="arena-glow arena-glow-blue" aria-hidden="true" />
      <div className="arena-glow arena-glow-red" aria-hidden="true" />

      <header className="game-header">
        <div className="flex min-w-0 items-center gap-4">
          <span className="live-indicator"><span /> LIVE</span>
          <div className="min-w-0">
            <p className="eyebrow truncate">TikTok Kingdom Clash</p>
            <p className="truncate text-sm text-slate-400">Tặng quà 1 xu để chọn phe ngẫu nhiên</p>
          </div>
        </div>

        <div className="versus-lockup" aria-label="Phe Xanh đấu với Phe Đỏ">
          <span className="score score-blue">{state.scores.blue}</span>
          <span className="text-cyan-300">XANH</span>
          <strong>VS</strong>
          <span className="text-rose-400">ĐỎ</span>
          <span className="score score-red">{state.scores.red}</span>
        </div>

        <div className="flex items-center justify-end gap-4 text-right">
          <div className="hidden items-center gap-2 text-xs font-bold text-slate-400 xl:flex">
            <Users className="h-4 w-4" /> {state.users.length} chiến binh
          </div>
          <div>
            <p className="eyebrow">Vòng sinh tồn</p>
            <RoundClock
              durationMinutes={runtimeSettings.roundDurationMinutes}
              startedAt={runtimeSettings.roundStartedAt}
            />
          </div>
          <SettingsPanel serverUrl={serverUrl} connection={connection} source={source} />
          <Radio className="h-6 w-6 text-rose-400" aria-hidden="true" />
        </div>
      </header>

      <section className="arena-layout">
        <TeamRoster
          title="PHE XANH"
          subtitle={`${blueTeam.length} chiến binh`}
          icon={<Swords />}
          rows={blueTeam}
          tone="blue"
          highlightedUserId={recentlyJoinedUserId}
        />

        <div className="canvas-frame">
          <GameCanvas state={state} lastAction={lastAction} />
          {lastAction && <FloatingAction key={lastAction.id} action={lastAction} />}

          <div className="pointer-events-none absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 border border-cyan-300/30 bg-cyan-950/80 px-4 py-2 text-xs font-bold tracking-[0.12em] text-cyan-100 backdrop-blur">
            <ShieldCheck className="h-4 w-4" />
            {countShields(state)} KHIÊN ĐANG HOẠT ĐỘNG
          </div>

          {recentActions.length > 0 && (
            <div className="event-ribbon" aria-label="Sự kiện gần nhất">
              {recentActions.slice(0, 3).map((action) => (
                <span key={action.id}>{action.user.nickname}: {action.message}</span>
              ))}
            </div>
          )}
        </div>

        <TeamRoster
          title="PHE ĐỎ"
          subtitle={`${redTeam.length} chiến binh`}
          icon={<Swords />}
          rows={redTeam}
          tone="red"
          highlightedUserId={recentlyJoinedUserId}
        />
      </section>

      <footer className="game-footer">
        <span>🌹 1 XU: CHỌN PHE</span>
        <span>💥 5 XU: BẮN −1 HP</span>
        <span>🏠 10 XU: XÂY NHÀ</span>
        <span>🛡️ 20 XU: TẠO KHIÊN</span>
        <span>⚡ &gt;100 XU: HỦY DIỆT</span>
        <ConnectionBadge connection={connection} sourceLabel={source.label} />
      </footer>

      <DebugControls serverUrl={serverUrl} />
    </main>
  );
}

function RoundClock({ durationMinutes, startedAt }: { durationMinutes: number; startedAt: number }) {
  const safeDurationMinutes = Number.isFinite(durationMinutes) ? durationMinutes : 10;
  const safeStartedAt = Number.isFinite(startedAt) ? startedAt : Date.now();
  const durationSeconds = Math.max(60, safeDurationMinutes * 60);
  const getRemainingSeconds = () => {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - safeStartedAt) / 1000));
    const elapsedInRound = elapsedSeconds % durationSeconds;
    return elapsedInRound === 0 ? durationSeconds : durationSeconds - elapsedInRound;
  };
  const [seconds, setSeconds] = useState(getRemainingSeconds);

  useEffect(() => {
    const updateClock = () => setSeconds(getRemainingSeconds());
    updateClock();
    const timer = window.setInterval(() => {
      updateClock();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [durationSeconds, safeStartedAt]);

  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return (
    <p
      className="font-mono text-2xl font-black tracking-widest text-amber-300"
      aria-label={`Còn ${minutes} phút ${remainder} giây`}
    >
      {minutes}:{remainder}
    </p>
  );
}

function ConnectionBadge({
  connection,
  sourceLabel,
}: {
  connection: 'connecting' | 'online' | 'offline';
  sourceLabel: string;
}) {
  const online = connection === 'online';
  return (
    <span className={online ? 'connection-online' : 'connection-offline'} title={sourceLabel}>
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {online ? sourceLabel : 'CHẾ ĐỘ XEM TRƯỚC'}
    </span>
  );
}

function FloatingAction({ action }: { action: GameAction }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const timeline = gsap.timeline();
    timeline
      .fromTo(ref.current, { opacity: 0, y: 30, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: 'back.out(1.7)' })
      .to(ref.current, { opacity: 0, y: -42, duration: 0.55, ease: 'power2.in' }, '+=1.2');
    return () => {
      timeline.kill();
    };
  }, []);

  return (
    <div ref={ref} className="pointer-events-none absolute inset-x-0 top-5 flex justify-center">
      <div className={`action-toast action-${action.team}`}>
        {action.user.avatarUrl
          ? <img className="avatar-chip object-cover" src={action.user.avatarUrl} alt="" />
          : <span className="avatar-chip">{initials(action.user.nickname)}</span>}
        <span><strong>{action.user.nickname}</strong> {action.message}</span>
        <Sparkles className="h-4 w-4 text-amber-300" />
      </div>
    </div>
  );
}

interface TeamRosterProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  rows: UserStats[];
  tone: Team;
  highlightedUserId?: string;
}

function TeamRoster({ title, subtitle, icon, rows, tone, highlightedUserId }: TeamRosterProps) {
  return (
    <aside className={`leaderboard leaderboard-${tone}`}>
      <div className="leaderboard-title">
        <span>{icon}</span>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="leader-empty">
          Đang chờ chiến binh phe {tone === 'blue' ? 'Xanh' : 'Đỏ'} đầu tiên...
        </div>
      ) : (
        <ol className="team-roster-list space-y-3">
          {rows.map((row, index) => (
            <li
              key={row.userId}
              className={`leader-row${row.userId === highlightedUserId ? ' leader-row-new' : ''}`}
            >
              <span className="rank">{String(index + 1).padStart(2, '0')}</span>
              {row.avatarUrl
                ? <img className="user-dot object-cover" src={row.avatarUrl} alt="" />
                : <span className="user-dot">{initials(row.nickname)}</span>}
              <span className="min-w-0 flex-1">
                <strong className="block truncate">{row.nickname}</strong>
                <small>
                  {row.userId === highlightedUserId && <span className="new-user-label">MỚI · </span>}
                  🏠 {row.built} · 💥 {row.destroyed}
                </small>
              </span>
              <b>{row.built + row.destroyed}</b>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

function getTeamStandings(users: UserStats[], team: Team, highlightedUserId?: string): UserStats[] {
  return users
    .filter((user) => user.team === team)
    .sort((left, right) => {
      if (left.userId === highlightedUserId && right.userId !== highlightedUserId) return -1;
      if (right.userId === highlightedUserId && left.userId !== highlightedUserId) return 1;
      const contributionDifference = (right.built + right.destroyed) - (left.built + left.destroyed);
      if (contributionDifference !== 0) return contributionDifference;
      if (right.built !== left.built) return right.built - left.built;
      return left.nickname.localeCompare(right.nickname, 'vi');
    });
}

function DebugControls({ serverUrl }: { serverUrl: string }) {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setVisible(new URLSearchParams(window.location.search).get('debug') === '1');
  }, []);

  if (!visible) return null;

  const sendGift = async (team: Team, giftName: string, diamondCount: number) => {
    setPending(true);
    const viewer = team === 'blue'
      ? { userId: 'operator-blue', uniqueId: 'operator_blue', nickname: 'Test Xanh' }
      : { userId: 'operator-red', uniqueId: 'operator_red', nickname: 'Test Đỏ' };
    try {
      await fetch(`${serverUrl}/api/mock/gift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewer, giftName: 'Rose', diamondCount: 1, repeatCount: 1 }),
      });
      await fetch(`${serverUrl}/api/mock/gift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewer, giftName, diamondCount, repeatCount: 1 }),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <aside className="debug-controls" aria-label="Bảng kiểm thử quà tặng">
      <p>MOCK CONTROL</p>
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={pending} onClick={() => void sendGift('blue', 'Rosa', 10)} className="bg-cyan-500 text-slate-950">Người A + Nhà</Button>
        <Button disabled={pending} onClick={() => void sendGift('red', 'Rosa', 10)} className="bg-rose-500 text-white">Người B + Nhà</Button>
        <Button disabled={pending} variant="outline" onClick={() => void sendGift('blue', '5 Coin Gift', 5)}>Người A bắn</Button>
        <Button disabled={pending} variant="outline" onClick={() => void sendGift('red', '20 Coin Gift', 20)}>Người B tạo khiên</Button>
        <Button disabled={pending} variant="destructive" onClick={() => void sendGift('blue', 'Big Gift', 101)}>Người A hủy diệt</Button>
        <Button disabled={pending} variant="destructive" onClick={() => void sendGift('red', 'Big Gift', 101)}>Người B hủy diệt</Button>
      </div>
    </aside>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0]?.toLocaleUpperCase('vi-VN') ?? '')
    .join('');
}

function countShields(state: ReturnType<typeof useGameSocket>['state']): number {
  return state.grid.reduce(
    (total, row) => total + row.filter((cell) => cell.building?.shielded).length,
    0,
  );
}
