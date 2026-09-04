import { randomUUID } from 'node:crypto';
import type {
  Building,
  GameAction,
  GameState,
  GiftKind,
  GridCell,
  IncomingGift,
  LeaderboardEntry,
  Team,
  UserStats,
  ViewerIdentity,
} from './types.js';

export interface GameEngineOptions {
  gridSize?: number;
  random?: () => number;
}

const GIFT_ALIASES: Readonly<Record<string, GiftKind>> = {
  rose: 'join',
  'hoa hồng': 'join',
  '🌹': 'join',
  rosa: 'build',
};

export class GameEngine {
  private readonly gridSize: number;
  private readonly random: () => number;
  private readonly grid: GridCell[][];
  private readonly users = new Map<string, UserStats>();
  private version = 0;
  private updatedAt = Date.now();

  constructor(options: GameEngineOptions = {}) {
    this.gridSize = options.gridSize ?? 20;
    this.random = options.random ?? Math.random;

    if (this.gridSize < 2 || this.gridSize % 2 !== 0) {
      throw new Error('gridSize must be an even number greater than or equal to 2');
    }

    this.grid = Array.from({ length: this.gridSize }, (_, y) =>
      Array.from({ length: this.gridSize }, (_, x): GridCell => ({
        x,
        y,
        territory: x < this.gridSize / 2 ? 'blue' : 'red',
      })),
    );
  }

  handleChat(_viewer: ViewerIdentity, _comment: string): GameAction | null {
    return null;
  }

  handleGift(viewer: ViewerIdentity, gift: IncomingGift): GameAction[] {
    const kind = resolveGiftKind(gift.giftName, gift.diamondCount);
    if (kind === 'join') return [this.joinRandomTeam(viewer)];

    const stats = this.users.get(viewer.userId);
    if (!stats || !kind) {
      const fallbackTeam: Team = stats?.team ?? 'blue';
      const reason = stats
        ? `Quà ${gift.giftName} chưa được gán hành động`
        : `${viewer.nickname} cần tặng quà 1 xu để chọn phe trước`;
      return [this.createAction('IGNORED', fallbackTeam, viewer, reason)];
    }

    const actions: GameAction[] = [];
    const repeats = Math.max(1, Math.min(100, Math.floor(gift.repeatCount)));
    for (let index = 0; index < repeats; index += 1) {
      actions.push(this.applyGift(kind, stats, viewer));
    }
    return actions;
  }

  getState(): GameState {
    const users = [...this.users.values()].map((user) => ({ ...user }));
    return {
      version: this.version,
      gridSize: this.gridSize,
      grid: this.grid.map((row) =>
        row.map((cell) => cell.building
          ? { ...cell, building: { ...cell.building } }
          : { ...cell }),
      ),
      users,
      leaderboard: {
        builders: this.createLeaderboard(users, (user) => user.built + user.upgraded),
        destroyers: this.createLeaderboard(users, (user) => user.destroyed),
      },
      scores: this.calculateScores(),
      updatedAt: this.updatedAt,
    };
  }

  reset(): GameState {
    for (const row of this.grid) {
      for (const cell of row) delete cell.building;
    }
    this.users.clear();
    this.touch();
    return this.getState();
  }

  private applyGift(kind: GiftKind, stats: UserStats, viewer: ViewerIdentity): GameAction {
    switch (kind) {
      case 'join':
        return this.joinRandomTeam(viewer);
      case 'build':
        return this.build(stats, viewer);
      case 'shield':
        return this.shield(stats, viewer);
      case 'attack':
        return this.attack(stats, viewer);
      case 'megaAttack':
        return this.megaAttack(stats, viewer);
    }
  }

  private joinRandomTeam(viewer: ViewerIdentity): GameAction {
    const existing = this.users.get(viewer.userId);
    if (existing) {
      return this.createAction(
        'JOIN',
        existing.team,
        viewer,
        `${viewer.nickname} đã ở phe ${existing.team === 'blue' ? 'Xanh' : 'Đỏ'}`,
      );
    }

    const team: Team = this.random() < 0.5 ? 'blue' : 'red';
    const stats: UserStats = {
      ...viewer,
      team,
      built: 0,
      upgraded: 0,
      shielded: 0,
      destroyed: 0,
    };
    this.users.set(viewer.userId, stats);
    this.touch();
    return this.createAction(
      'JOIN',
      team,
      viewer,
      `${viewer.nickname} được chọn ngẫu nhiên vào phe ${team === 'blue' ? 'Xanh' : 'Đỏ'}`,
    );
  }

  private build(stats: UserStats, viewer: ViewerIdentity): GameAction {
    const cell = this.pickCell((candidate) => candidate.territory === stats.team && !candidate.building);
    if (!cell) {
      return this.createAction('IGNORED', stats.team, viewer, 'Lãnh thổ đã kín, không còn ô để xây');
    }

    const building: Building = {
      id: randomUUID(),
      ownerId: viewer.userId,
      ownerName: viewer.nickname,
      team: stats.team,
      level: 1,
      shielded: false,
      health: 10,
      maxHealth: 10,
    };
    cell.building = building;
    stats.built += 1;
    this.touch();
    return this.createAction('BUILD', stats.team, viewer, '+1 Nhà (10 HP)', cell);
  }

  private shield(stats: UserStats, viewer: ViewerIdentity): GameAction {
    const cell = this.pickCell((candidate) =>
      candidate.building?.ownerId === viewer.userId && !candidate.building.shielded,
    );
    if (!cell?.building) {
      return this.createAction('IGNORED', stats.team, viewer, 'Bạn chưa có nhà cần tạo khiên');
    }

    cell.building.shielded = true;
    stats.shielded += 1;
    this.touch();
    return this.createAction('SHIELD', stats.team, viewer, '+1 Khiên bảo vệ', cell);
  }

  private attack(stats: UserStats, viewer: ViewerIdentity): GameAction {
    const sourceCell = this.pickCell((candidate) => candidate.building?.ownerId === viewer.userId);
    if (!sourceCell?.building) {
      return this.createAction('IGNORED', stats.team, viewer, 'Bạn cần có nhà để khai hỏa');
    }

    const targetTeam: Team = stats.team === 'blue' ? 'red' : 'blue';
    const cell = this.pickCell((candidate) => candidate.building?.team === targetTeam);
    if (!cell?.building) {
      return this.createAction('IGNORED', stats.team, viewer, 'Đối phương chưa có công trình để phá');
    }

    if (cell.building.shielded) {
      cell.building.shielded = false;
      this.touch();
      return this.createAction(
        'BLOCKED',
        stats.team,
        viewer,
        'Đạn bị Khiên chặn',
        cell,
        targetTeam,
        sourceCell,
        0,
        cell.building.health,
      );
    }

    cell.building.health = Math.max(0, cell.building.health - 1);
    const remainingHealth = cell.building.health;
    if (remainingHealth === 0) {
      delete cell.building;
      stats.destroyed += 1;
    }
    this.touch();
    return this.createAction(
      remainingHealth === 0 ? 'DESTROY' : 'DAMAGE',
      stats.team,
      viewer,
      remainingHealth === 0 ? 'Bắn sập một nhà đối thủ' : `Bắn trúng nhà, còn ${remainingHealth}/10 HP`,
      cell,
      targetTeam,
      sourceCell,
      1,
      remainingHealth,
    );
  }

  private megaAttack(stats: UserStats, viewer: ViewerIdentity): GameAction {
    const targetTeam: Team = stats.team === 'blue' ? 'red' : 'blue';
    const cell = this.pickCell((candidate) => candidate.building?.team === targetTeam);
    if (!cell?.building) {
      return this.createAction('IGNORED', stats.team, viewer, 'Đối phương chưa có công trình để phá');
    }

    delete cell.building;
    stats.destroyed += 1;
    this.touch();
    return this.createAction(
      'MEGA_DESTROY',
      stats.team,
      viewer,
      'Hủy diệt hoàn toàn một nhà, xuyên mọi Khiên',
      cell,
      targetTeam,
      undefined,
      10,
      0,
    );
  }

  private pickCell(predicate: (cell: GridCell) => boolean): GridCell | undefined {
    const candidates = this.grid.flat().filter(predicate);
    if (candidates.length === 0) return undefined;
    const index = Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length));
    return candidates[index];
  }

  private createLeaderboard(
    users: UserStats[],
    scoreFor: (user: UserStats) => number,
  ): LeaderboardEntry[] {
    return users
      .map((user): LeaderboardEntry => {
        const entry: LeaderboardEntry = {
          userId: user.userId,
          nickname: user.nickname,
          team: user.team,
          score: scoreFor(user),
        };
        if (user.avatarUrl) entry.avatarUrl = user.avatarUrl;
        return entry;
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.nickname.localeCompare(right.nickname))
      .slice(0, 3);
  }

  private calculateScores(): { blue: number; red: number } {
    return this.grid.flat().reduce(
      (scores, cell) => {
        if (cell.building) scores[cell.building.team] += 1;
        return scores;
      },
      { blue: 0, red: 0 },
    );
  }

  private createAction(
    type: GameAction['type'],
    team: Team,
    user: ViewerIdentity,
    message: string,
    cell?: GridCell,
    targetTeam?: Team,
    sourceCell?: GridCell,
    damage?: number,
    remainingHealth?: number,
  ): GameAction {
    const action: GameAction = {
      id: randomUUID(),
      type,
      team,
      user: { ...user },
      message,
      timestamp: Date.now(),
    };
    if (cell) {
      action.x = cell.x;
      action.y = cell.y;
    }
    if (sourceCell) {
      action.sourceX = sourceCell.x;
      action.sourceY = sourceCell.y;
    }
    if (targetTeam) action.targetTeam = targetTeam;
    if (damage !== undefined) action.damage = damage;
    if (remainingHealth !== undefined) action.remainingHealth = remainingHealth;
    return action;
  }

  private touch(): void {
    this.version += 1;
    this.updatedAt = Date.now();
  }
}

export function resolveGiftKind(giftName: string, diamondCount?: number): GiftKind | undefined {
  const alias = GIFT_ALIASES[giftName.trim().toLocaleLowerCase('vi-VN')];
  if (alias) return alias;
  if (diamondCount === undefined || !Number.isFinite(diamondCount)) return undefined;
  if (diamondCount > 100) return 'megaAttack';
  if (diamondCount === 20) return 'shield';
  if (diamondCount === 10) return 'build';
  if (diamondCount === 5) return 'attack';
  if (diamondCount === 1) return 'join';
  return undefined;
}
