import type { GameState } from './game-types';
// Never present invented participants as live data while disconnected.
export function createDemoState(): GameState {
  return { version: 0, gridSize: 20, grid: [], users: [], leaderboard: { builders: [], destroyers: [] },
    scores: { blue: 0, red: 0 }, updatedAt: 0, serverTime: 0,
    round: { id: 'waiting', status: 'active', startedAt: 0, endsAt: 0, restartAt: null, winner: null, ranking: [] } };
}
