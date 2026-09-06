import { randomUUID } from 'node:crypto';
import type { GameAction, GameState, GiftKind, GridCell, IncomingGift, RankingEntry, Team, UserStats, ViewerIdentity } from './types.js';

const LIKE_DAMAGE = 2;

export interface GameEngineOptions { gridSize?: number; random?: () => number; now?: () => number; durationMs?: number }
const aliases: Record<string, GiftKind> = {
  rose: 'shield', 'hoa hong': 'shield', '🌹': 'shield', rosa: 'attack',
  'lucky pig': 'upgrade', 'heo may man': 'upgrade', 'lon may man': 'upgrade',
  'paper crane': 'eliminate', 'hac giay': 'eliminate',
  'money gun': 'eliminate10', 'sung ban tien': 'eliminate10',
  galaxy: 'eliminate20', 'thien ha': 'eliminate20',
};
export function resolveGiftKind(name: string, _diamonds?: number): GiftKind | undefined {
  return aliases[name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ')];
}
export class GameEngine {
  private readonly gridSize: number;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly grid: GridCell[][];
  private readonly users = new Map<string, UserStats>();
  private readonly likeTargets = new Map<string, string>();
  private version = 0;
  private updatedAt: number;
  private durationMs: number;
  private round: GameState['round'];

  constructor(options: GameEngineOptions = {}) {
    this.gridSize = options.gridSize ?? 20;
    if (!Number.isInteger(this.gridSize) || this.gridSize < 2 || this.gridSize % 2) throw new Error('gridSize must be even and >= 2');
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.durationMs = options.durationMs ?? 600_000;
    this.updatedAt = this.now();
    this.round = this.newRound();
    this.grid = Array.from({ length: this.gridSize }, (_, y) =>
      Array.from({ length: this.gridSize }, (_, x) => ({ x, y, territory: x < this.gridSize / 2 ? 'blue' : 'red' })));
  }
  private newRound(): GameState['round'] {
    const startedAt = this.now();
    return { id: randomUUID(), status: 'active', startedAt, endsAt: startedAt + this.durationMs, restartAt: null, winner: null, ranking: [] };
  }
  finishIfExpired(): boolean {
    if (this.round.status === 'finished' || this.now() < this.round.endsAt) return false;
    this.finishRound();
    return true;
  }
  finishRound(): GameState {
    if (this.round.status === 'active') {
      this.round.endsAt = Math.min(this.now(), this.round.endsAt);
      this.round.status = 'finished';
      this.round.restartAt = this.now() + 10_000;
      this.round.ranking = this.rank();
      const scores = this.scores();
      this.round.winner = scores.blue === scores.red ? 'draw' : scores.blue > scores.red ? 'blue' : 'red';
      this.touch();
    }
    return this.getState();
  }
  restartIfDue(): boolean {
    if (this.round.status !== 'finished' || this.round.restartAt === null || this.now() < this.round.restartAt) return false;
    this.reset(this.durationMs, true);
    return true;
  }
  handleJoin(viewer: ViewerIdentity): GameAction[] {
    this.finishIfExpired();
    if (this.round.status === 'finished') return [];
    const existing = this.users.get(viewer.userId);
    if (existing) {
      Object.assign(existing, viewer);
      const cell = this.owned(viewer.userId);
      if (cell?.building) Object.assign(cell.building, { ownerName: viewer.nickname, ...(viewer.avatarUrl ? { avatarUrl: viewer.avatarUrl } : {}) });
      this.touch();
      return []; // Presence retries never grant another life.
    }
    const scores = this.scores();
    const team: Team = scores.blue === scores.red ? (this.random() < .5 ? 'blue' : 'red') : scores.blue < scores.red ? 'blue' : 'red';
    const cell = this.pick(c => c.territory === team && !c.building);
    if (!cell) return [this.action('IGNORED', team, viewer, 'Đấu trường đã đủ 400 người chơi')];
    this.users.set(viewer.userId, { ...viewer, team, built: 1, upgraded: 0, shielded: 0, destroyed: 0, shots: 0, damageDealt: 0, joinedAt: this.now() });
    cell.building = { id: randomUUID(), ownerId: viewer.userId, ownerName: viewer.nickname, ...(viewer.avatarUrl ? { avatarUrl: viewer.avatarUrl } : {}), team, level: 1, shieldHealth: 0, health: 100, maxHealth: 100 };
    this.touch();
    return [this.action('JOIN', team, viewer, 'Vào trận · 100 HP', cell)];
  }
  handleChat(viewer: ViewerIdentity, _comment: string): GameAction | null {
    return this.handleJoin(viewer)[0] ?? null;
  }
  handleLike(viewer: ViewerIdentity, count: number): GameAction[] {
    if (!Number.isSafeInteger(count) || count <= 0) return [];
    const actions = this.handleJoin(viewer);
    if (this.round.status === 'finished') return [];
    const stats = this.users.get(viewer.userId);
    if (!stats || !this.owned(viewer.userId)) return actions;
    let remaining = count;
    // Keep consecutive two-HP shots on one opponent, including across separate Live events.
    // Work stays bounded by opponents and shields, even for very large like bundles.
    while (remaining > 0) {
      const target = this.likeTarget(stats);
      if (!target?.building) break;
      const durability = target.building.health + target.building.shieldHealth;
      const shots = Math.min(remaining, Math.ceil(durability / LIKE_DAMAGE));
      actions.push(this.hit(stats, viewer, target, shots * LIKE_DAMAGE, false, shots));
      remaining -= shots;
    }
    return actions;
  }
  handleGift(viewer: ViewerIdentity, gift: IncomingGift): GameAction[] {
    const actions = this.handleJoin(viewer);
    if (this.round.status === 'finished') return [];
    const stats = this.users.get(viewer.userId);
    const kind = resolveGiftKind(gift.giftName);
    if (!stats) return actions;
    if (!kind) return [...actions, this.action('IGNORED', stats.team, viewer, 'Quà này chưa có kỹ năng')];
    const own = this.owned(viewer.userId);
    if (!own?.building) return [...actions, this.action('IGNORED', stats.team, viewer, 'Đã bị loại · Hẹn bạn vòng sau')];
    if (!Number.isSafeInteger(gift.repeatCount) || gift.repeatCount < 1) return actions;
    if (kind === 'shield') {
      // Apply the whole completed Rose streak in one action, without dropping roses above 100.
      const added = Math.min(gift.repeatCount, Number.MAX_SAFE_INTEGER - 200 - own.building.shieldHealth);
      own.building.shieldHealth += added;
      stats.shielded = Math.min(Number.MAX_SAFE_INTEGER, stats.shielded + added);
      this.touch();
      const action = this.action('SHIELD', stats.team, viewer, `+${added} khiên · Tổng ${own.building.shieldHealth}`, own);
      action.remainingShieldHealth = own.building.shieldHealth;
      return [...actions, action];
    }
    for (let i = 0; i < Math.min(100, gift.repeatCount); i++) {
      if (kind === 'upgrade') {
        if (own.building.level === 2) continue;
        Object.assign(own.building, { level: 2, health: 200, maxHealth: 200 });
        stats.upgraded++;
        this.touch();
        actions.push(this.action('UPGRADE', stats.team, viewer, 'Heo may mắn · Cấp 2 · 200 HP', own));
      } else {
        const targets = kind === 'eliminate20' ? 20 : kind === 'eliminate10' ? 10 : 1;
        for (let n = 0; n < targets; n++) {
          const target = this.enemy(stats.team);
          if (!target?.building) break;
          actions.push(this.hit(stats, viewer, target, 10, kind !== 'attack', 1));
        }
      }
    }
    return actions;
  }
  private hit(stats: UserStats, viewer: ViewerIdentity, cell: GridCell, damage: number, instant: boolean, shotCount: number): GameAction {
    const target = cell.building!;
    const source = this.owned(viewer.userId);
    const action = this.action('DAMAGE', stats.team, viewer, '', cell);
    Object.assign(action, { sourceX: source?.x, sourceY: source?.y, targetTeam: target.team, targetUserId: target.ownerId, shotCount });
    stats.shots += shotCount;
    const absorbed = instant ? 0 : Math.min(damage, target.shieldHealth);
    target.shieldHealth -= absorbed;
    const dealt = instant ? target.health : Math.min(damage - absorbed, target.health);
    target.health -= dealt;
    stats.damageDealt += dealt;
    Object.assign(action, {
      damage: dealt, shieldDamage: absorbed, remainingShieldHealth: target.shieldHealth,
      remainingHealth: target.health,
      message: `-${dealt} HP${absorbed ? ` · -${absorbed} khiên` : ''} · ${target.ownerName}`,
    });
    if (dealt === 0) {
      action.type = 'BLOCKED';
      action.message = `Khiên hấp thụ ${absorbed} sát thương · Còn ${target.shieldHealth} · ${target.ownerName}`;
    }
    if (!target.health) {
      stats.destroyed++;
      const victim = this.users.get(target.ownerId);
      if (victim) victim.eliminatedAt = this.now();
      delete cell.building;
      action.type = instant ? 'MEGA_DESTROY' : 'DESTROY';
      action.remainingShieldHealth = 0;
      action.message = 'Hạ gục ' + target.ownerName;
    }
    this.touch();
    return action;
  }
  reset(durationMs = this.durationMs, keepParticipants = false): GameState {
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Invalid round duration');
    const viewers: ViewerIdentity[] = keepParticipants ? [...this.users.values()].map(u => ({ userId: u.userId, uniqueId: u.uniqueId, nickname: u.nickname, ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}) })) : [];
    this.durationMs = durationMs;
    for (const row of this.grid) for (const cell of row) delete cell.building;
    this.users.clear();
    this.likeTargets.clear();
    this.round = this.newRound();
    for (const viewer of viewers) this.handleJoin(viewer);
    this.touch();
    return this.getState();
  }
  getState(): GameState {
    this.finishIfExpired();
    const users = [...this.users.values()].map(u => ({ ...u }));
    const leaders = (field: 'built' | 'destroyed') => users.filter(u => u[field] > 0).sort((a,b) => b[field] - a[field]).slice(0,3).map(u => ({ ...u, score: u[field] }));
    return {
      version: this.version, gridSize: this.gridSize,
      grid: this.grid.map(row => row.map(c => c.building ? { ...c, building: { ...c.building } } : { ...c })),
      users, leaderboard: { builders: leaders('built'), destroyers: leaders('destroyed') },
      scores: this.scores(), updatedAt: this.updatedAt, serverTime: this.now(),
      round: { ...this.round, ranking: this.round.ranking.map(r => ({ ...r })) },
    };
  }
  private rank(): RankingEntry[] {
    return [...this.users.values()].map(user => {
      const building = this.owned(user.userId)?.building;
      return { ...user, rank: 0, alive: Boolean(building), health: building?.health ?? 0, level: building?.level ?? (user.upgraded ? 2 : 1), score: user.destroyed, survivalMs: Math.max(0, (user.eliminatedAt ?? this.round.endsAt) - user.joinedAt) };
    }).sort((a,b) => Number(b.alive)-Number(a.alive) || b.destroyed-a.destroyed || b.health-a.health || b.survivalMs-a.survivalMs || a.userId.localeCompare(b.userId))
      .map((user, i) => ({ ...user, rank: i+1 }));
  }
  private scores() { return this.grid.flat().reduce((s,c) => { if(c.building) s[c.building.team]++; return s; }, { blue: 0, red: 0 }); }
  private owned(id: string) { return this.grid.flat().find(c => c.building?.ownerId === id); }
  private likeTarget(attacker: UserStats): GridCell | undefined {
    const targetId = this.likeTargets.get(attacker.userId);
    const current = targetId ? this.owned(targetId) : undefined;
    if (current?.building && current.building.team !== attacker.team) return current;
    const next = this.enemy(attacker.team);
    if (next?.building) this.likeTargets.set(attacker.userId, next.building.ownerId);
    else this.likeTargets.delete(attacker.userId);
    return next;
  }
  private enemy(team: Team) { return this.pick(c => Boolean(c.building && c.building.team !== team)); }
  private pick(predicate: (c: GridCell) => boolean) {
    const cells = this.grid.flat().filter(predicate);
    return cells[Math.min(cells.length-1, Math.floor(this.random()*cells.length))];
  }
  private action(type: GameAction['type'], team: Team, user: ViewerIdentity, message: string, cell?: GridCell): GameAction {
    return { id: randomUUID(), type, team, user: { ...user }, message, timestamp: this.now(), ...(cell ? { x: cell.x, y: cell.y } : {}), ...(cell?.building ? { targetUserId: cell.building.ownerId } : {}) };
  }
  private touch() { this.version++; this.updatedAt = this.now(); }
}
