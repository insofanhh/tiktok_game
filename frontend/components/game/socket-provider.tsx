'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { createDemoState } from '@/lib/demo-state';
import type { GameAction, GameState, RuntimeSourceSettings, SourceStatus } from '@/lib/game-types';

interface ServerToClientEvents {
  'game:state': (state: GameState) => void;
  'game:action': (action: GameAction) => void;
  'source:status': (status: SourceStatus) => void;
  'settings:runtime': (settings: RuntimeSourceSettings) => void;
}

interface ClientToServerEvents {
  'game:request-state': () => void;
}

type ConnectionState = 'connecting' | 'online' | 'offline';

interface GameSocketContextValue {
  state: GameState;
  lastAction: GameAction | null;
  recentActions: GameAction[];
  connection: ConnectionState;
  source: SourceStatus;
  runtimeSettings: RuntimeSourceSettings;
  serverUrl: string;
}

const GameSocketContext = createContext<GameSocketContextValue | null>(null);
const SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://127.0.0.1:4100';

export function GameSocketProvider({ children }: { children: React.ReactNode }) {
  const roundId = useRef('waiting');
  const [state, setState] = useState<GameState>(() => createDemoState());
  const [lastAction, setLastAction] = useState<GameAction | null>(null);
  const [recentActions, setRecentActions] = useState<GameAction[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [source, setSource] = useState<SourceStatus>({
    mode: 'mock',
    connected: false,
    label: 'Đang kết nối máy chủ game',
  });
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSourceSettings>({
    mode: 'mock',
    username: '',
    hasEulerApiKey: false,
    roundDurationMinutes: 10,
    maxPlayers: null,
    roundStartedAt: Date.now(),
    source: {
      mode: 'mock',
      connected: false,
      label: 'Đang kết nối máy chủ game',
    },
  });

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      setConnection('online');
      socket.emit('game:request-state');
    });
    socket.on('disconnect', () => setConnection('offline'));
    socket.on('connect_error', () => setConnection('offline'));
    socket.on('game:state', (next) => {
      if (roundId.current !== next.round.id) {
        setLastAction(null); setRecentActions([]);
        roundId.current = next.round.id;
      }
      setState(next);
    });
    socket.on('source:status', setSource);
    socket.on('settings:runtime', (settings) => {
      setRuntimeSettings(settings);
      setSource(settings.source);
    });
    socket.on('game:action', (action) => {
      setLastAction(action);
      setRecentActions((current) => [action, ...current].slice(0, 48));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const value = useMemo<GameSocketContextValue>(() => ({
    state,
    lastAction,
    recentActions,
    connection,
    source,
    runtimeSettings,
    serverUrl: SERVER_URL,
  }), [connection, lastAction, recentActions, runtimeSettings, source, state]);

  return <GameSocketContext.Provider value={value}>{children}</GameSocketContext.Provider>;
}

export function useGameSocket(): GameSocketContextValue {
  const value = useContext(GameSocketContext);
  if (!value) throw new Error('useGameSocket must be used inside GameSocketProvider');
  return value;
}
