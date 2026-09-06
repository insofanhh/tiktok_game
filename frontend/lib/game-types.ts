export type Team = 'blue' | 'red';
export type GiftKind = 'shield' | 'attack' | 'upgrade' | 'eliminate' | 'eliminate10' | 'eliminate20';
export type ActionType = 'JOIN' | 'BUILD' | 'UPGRADE' | 'SHIELD' | 'DAMAGE' | 'DESTROY' | 'MEGA_DESTROY' | 'BLOCKED' | 'IGNORED';
export interface ViewerIdentity { userId: string; uniqueId: string; nickname: string; avatarUrl?: string }
export interface UserStats extends ViewerIdentity {
  team: Team; built: number; upgraded: number; shielded: number; destroyed: number;
  shots: number; damageDealt: number; joinedAt: number; eliminatedAt?: number;
}
export interface Building {
  id: string; ownerId: string; ownerName: string; avatarUrl?: string; team: Team;
  level: 1 | 2; shielded: boolean; health: number; maxHealth: number;
}
export interface GridCell { x: number; y: number; territory: Team; building?: Building }
export interface LeaderboardEntry extends ViewerIdentity { team: Team; score: number }
export interface RankingEntry extends LeaderboardEntry {
  rank: number; alive: boolean; health: number; level: number; destroyed: number; damageDealt: number; survivalMs: number;
}
export interface GameLeaderboard { builders: LeaderboardEntry[]; destroyers: LeaderboardEntry[] }
export interface GameScores { blue: number; red: number }
export interface GameState {
  version: number; gridSize: number; grid: GridCell[][]; users: UserStats[];
  leaderboard: GameLeaderboard; scores: GameScores; updatedAt: number; serverTime: number;
  round: { id: string; status: 'active' | 'finished'; startedAt: number; endsAt: number; restartAt: number | null; winner: Team | 'draw' | null; ranking: RankingEntry[] };
}
export interface GameAction {
  id: string; type: ActionType; team: Team; user: ViewerIdentity; message: string; timestamp: number;
  x?: number; y?: number; sourceX?: number; sourceY?: number; targetTeam?: Team;
  targetUserId?: string; damage?: number; remainingHealth?: number; shotCount?: number;
}
export interface IncomingGift { giftName: string; repeatCount: number; diamondCount?: number }


export interface SourceStatus {
  mode: 'mock' | 'tiktok';
  connected: boolean;
  label: string;
}

export interface RuntimeSourceSettings {
  mode: 'mock' | 'live';
  username: string;
  hasEulerApiKey: boolean;
  roundDurationMinutes: number;
  roundStartedAt: number;
  source: SourceStatus;
}
