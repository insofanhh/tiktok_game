export type Team = 'blue' | 'red';
export type ActionType =
  | 'JOIN'
  | 'BUILD'
  | 'SHIELD'
  | 'DAMAGE'
  | 'DESTROY'
  | 'MEGA_DESTROY'
  | 'BLOCKED'
  | 'IGNORED';

export interface ViewerIdentity {
  userId: string;
  uniqueId: string;
  nickname: string;
  avatarUrl?: string;
}

export interface Building {
  id: string;
  ownerId: string;
  ownerName: string;
  team: Team;
  level: 1 | 2;
  shielded: boolean;
  health: number;
  maxHealth: number;
}

export interface GridCell {
  x: number;
  y: number;
  territory: Team;
  building?: Building;
}

export interface UserStats extends ViewerIdentity {
  team: Team;
  built: number;
  upgraded: number;
  shielded: number;
  destroyed: number;
}

export interface LeaderboardEntry {
  userId: string;
  nickname: string;
  avatarUrl?: string;
  team: Team;
  score: number;
}

export interface GameState {
  version: number;
  gridSize: number;
  grid: GridCell[][];
  users: UserStats[];
  leaderboard: {
    builders: LeaderboardEntry[];
    destroyers: LeaderboardEntry[];
  };
  scores: { blue: number; red: number };
  updatedAt: number;
}

export interface GameAction {
  id: string;
  type: ActionType;
  team: Team;
  user: ViewerIdentity;
  message: string;
  timestamp: number;
  x?: number;
  y?: number;
  sourceX?: number;
  sourceY?: number;
  targetTeam?: Team;
  damage?: number;
  remainingHealth?: number;
}

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
