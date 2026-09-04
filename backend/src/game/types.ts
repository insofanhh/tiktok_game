export type Team = 'blue' | 'red';
export type GiftKind = 'join' | 'build' | 'shield' | 'attack' | 'megaAttack';
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

export interface UserStats extends ViewerIdentity {
  team: Team;
  built: number;
  upgraded: number;
  shielded: number;
  destroyed: number;
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

export interface LeaderboardEntry {
  userId: string;
  nickname: string;
  avatarUrl?: string;
  team: Team;
  score: number;
}

export interface GameLeaderboard {
  builders: LeaderboardEntry[];
  destroyers: LeaderboardEntry[];
}

export interface GameScores {
  blue: number;
  red: number;
}

export interface GameState {
  version: number;
  gridSize: number;
  grid: GridCell[][];
  users: UserStats[];
  leaderboard: GameLeaderboard;
  scores: GameScores;
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

export interface IncomingGift {
  giftName: string;
  repeatCount: number;
  diamondCount?: number;
}
