'use client';
import { useEffect, useRef, useState } from 'react';
import { GameAudio } from '@/lib/game-audio';
import type { GameAction } from '@/lib/game-types';

export function useGameAudio(actions: GameAction[], finished: boolean) {
  const audio = useRef<GameAudio | null>(null);
  const seen = useRef(new Set<string>());
  const busy = useRef(false);
  const mounted = useRef(true);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (enabled && audio.current) {
        audio.current.stopVoices();
        await audio.current.context.suspend();
        setEnabled(false);
        return;
      }
      if (!audio.current || audio.current.context.state === 'closed') audio.current = new GameAudio(new AudioContext());
      // Resume on the user gesture before waiting for local sample downloads.
      await audio.current.context.resume();
      await audio.current.load();
      if (!mounted.current) return;
      setEnabled(true);
      setError('');
      audio.current.tone(660);
    } catch (reason) {
      if (mounted.current) {
        setEnabled(false);
        setError(reason instanceof Error ? reason.message : 'Chưa bật được âm thanh. Hãy thử lại.');
      }
    } finally { busy.current = false; }
  };

  useEffect(() => {
    const fresh = actions.filter(action => !seen.current.has(action.id));
    actions.forEach(action => seen.current.add(action.id));
    if (seen.current.size > 500) seen.current = new Set(actions.map(action => action.id));
    if (!enabled) return;
    for (const action of fresh.slice(0, 6)) {
      if (Date.now() - action.timestamp < 2000) audio.current?.playAction(action);
    }
  }, [actions, enabled]);

  useEffect(() => {
    if (finished && enabled) audio.current?.victory();
  }, [finished]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void audio.current?.destroy();
      audio.current = null;
    };
  }, []);
  return { enabled, toggle, error };
}
