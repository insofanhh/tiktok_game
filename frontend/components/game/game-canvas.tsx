'use client';
import { useEffect, useRef, useState } from 'react';
import type { GameAction, GameState } from '@/lib/game-types';
import { ArenaRenderer, type SoldierInfo } from '@/lib/arena-renderer';

export function GameCanvas({ state, actions }: { state: GameState; actions: GameAction[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ArenaRenderer | null>(null);
  const [selected, setSelected] = useState<SoldierInfo | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!canvas.current) return;
    try {
      renderer.current = new ArenaRenderer(canvas.current, setSelected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không mở được đấu trường');
    }
    return () => { renderer.current?.destroy(); renderer.current = null; };
  }, []);
  useEffect(() => { renderer.current?.update(state, actions); }, [state, actions]);

  return <div className="battlefield combat-arena">
    <canvas ref={canvas} className="combat-canvas" role="img"
      aria-label={'Đấu trường người que: ' + state.scores.blue + ' người phe Xanh và ' + state.scores.red + ' người phe Đỏ sống sót. Chạm nhân vật để xem thông tin.'}/>
    {error && <p className="canvas-error" role="alert">{error}</p>}
    {selected && <div className="soldier-inspector" aria-live="polite">
      <strong>{selected.name}</strong><span>{selected.alive ? selected.health + ' HP · ' + selected.shieldHealth + ' khiên · Cấp ' + selected.level : 'Đã bị loại · Chờ vòng sau'}</span>
    </div>}
    <ul className="sr-only" aria-label="Người tham gia đấu trường">{state.users.map(user => <li key={user.userId}>
      {user.nickname} · Phe {user.team === 'blue' ? 'Xanh' : 'Đỏ'} · {user.eliminatedAt ? 'Đã bị loại' : 'Đang chiến đấu'}
    </li>)}</ul>
  </div>;
}
