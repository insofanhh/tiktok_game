import { CARD_HEIGHT, CARD_WIDTH } from './arena-layout';
import { createPatrolSlots, patrolPosition, type ActorPosition, type PatrolSlot } from './arena-motion';
import type { Building, GameAction, GameState, UserStats } from './game-types';

const COLORS = { blue: '#67dfff', red: '#ff81aa' };
const SHOTS = new Set(['DAMAGE', 'DESTROY', 'MEGA_DESTROY', 'BLOCKED']);
interface Soldier {
  user: UserStats;
  building?: Building;
  slot: PatrolSlot;
  position: ActorPosition;
  firedAt: number;
  hitAt: number;
  aimAngle: number;
  aimTarget: string | null;
}
interface Shot {
  id: string;
  action: GameAction;
  started: number;
  impacted: boolean;
}
export interface SoldierInfo { userId: string; name: string; health: number; level: number; alive: boolean }

/** Canvas animation is independent of React/socket frequency and never changes authoritative game state. */
export class ArenaRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private readonly motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  private frameId = 0;
  private width = 0;
  private height = 0;
  private pixelRatio = 1;
  private model: GameState | null = null;
  private roundId = '';
  private serverOffset = 0;
  private rosterKey = '';
  private soldiers = new Map<string, Soldier>();
  private images = new Map<string, HTMLImageElement>();
  private seen = new Set<string>();
  private pending: GameAction[] = [];
  private shots: Shot[] = [];
  private shakeUntil = 0;
  private shakePower = 0;
  private selectedId: string | null = null;
  private reducedMotion = this.motionPreference.matches;
  private disposed = false;
  private lastFrame = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onSelect: (info: SoldierInfo | null) => void) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Thiết bị chưa hỗ trợ Canvas 2D');
    this.ctx = ctx;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.motionPreference.addEventListener('change', this.handleMotionChange);
    this.canvas.addEventListener('pointerdown', this.handlePointer);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.resize();
    this.frameId = requestAnimationFrame(this.render);
  }

  update(state: GameState, actions: GameAction[]): void {
    if (state.round.id !== this.roundId) {
      this.roundId = state.round.id;
      this.soldiers.clear();
      this.shots = [];
      this.seen.clear();
      this.pending = [];
      this.selectedId = null;
      this.onSelect(null);
      this.rosterKey = '';
    }
    if (this.model !== state && state.serverTime) this.serverOffset = state.serverTime - Date.now();
    this.model = state;
    this.syncRoster();
    for (const action of [...actions].reverse()) {
      if (this.seen.has(action.id)) continue;
      this.seen.add(action.id);
      if (!document.hidden && Math.abs(Date.now() + this.serverOffset - action.timestamp) < 2000) this.pending.push(action);
    }
    if (this.seen.size > 1000) this.seen = new Set(actions.map(action => action.id));
    if (this.selectedId) this.onSelect(this.info(this.selectedId));
  }

  private resize(): void {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.pixelRatio);
    this.canvas.height = Math.round(this.height * this.pixelRatio);
    this.rosterKey = '';
    this.syncRoster();
  }

  private syncRoster(): void {
    if (!this.model) return;
    const state = this.model;
    const key = state.users.map(user => user.userId + ':' + user.team).join('|');
    const changed = key !== this.rosterKey;
    const slots = changed ? createPatrolSlots(state.users, this.width, this.height) : [];
    const buildings = new Map(state.grid.flatMap(row => row.flatMap(cell => cell.building ? [[cell.building.ownerId, cell.building] as const] : [])));
    const slotMap = new Map(slots.map(slot => [slot.userId, slot]));
    const now = performance.now();
    for (const user of state.users) {
      const existing = this.soldiers.get(user.userId);
      const slot = slotMap.get(user.userId) ?? existing?.slot;
      if (!slot) continue;
      const building = buildings.get(user.userId);
      const soldier: Soldier = {
        user, building, slot,
        position: changed || !existing ? patrolPosition(slot, now / 1000, this.reducedMotion) : existing.position,
        firedAt: existing?.firedAt ?? -10000,
        hitAt: existing?.hitAt ?? -10000,
        aimAngle: existing?.aimAngle ?? 0,
        aimTarget: existing?.aimTarget ?? null,
      };
      this.soldiers.set(user.userId, soldier);
      if (user.avatarUrl && !this.images.has(user.avatarUrl)) {
        const image = new Image();
        image.referrerPolicy = 'no-referrer';
        image.src = user.avatarUrl;
        this.images.set(user.avatarUrl, image);
      }
    }
    const current = new Set(state.users.map(user => user.userId));
    for (const id of this.soldiers.keys()) if (!current.has(id)) this.soldiers.delete(id);
    const urls = new Set(state.users.map(user => user.avatarUrl));
    for (const url of this.images.keys()) if (!urls.has(url)) this.images.delete(url);
    this.rosterKey = key;
  }

  private render = (now: number): void => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.render);
    // A steady 30fps keeps a crowded arena inexpensive on phones.
    if (now - this.lastFrame < 1000 / 30 || document.hidden) return;
    this.lastFrame = now;
    const ctx = this.ctx;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    for (const soldier of this.soldiers.values()) {
      if (soldier.building) soldier.position = patrolPosition(soldier.slot, now / 1000, this.reducedMotion);
    }
    for (const action of this.pending.splice(0)) {
      if (!SHOTS.has(action.type)) continue;
      const source = this.soldiers.get(action.user.userId);
      const target = action.targetUserId ? this.soldiers.get(action.targetUserId) : undefined;
      if (!source || !target) continue;
      source.firedAt = now;
      source.aimTarget = target.user.userId;
      this.shots.push({ id: action.id, action, started: now, impacted: false });
      this.shake(now, action.type === 'MEGA_DESTROY' ? 2.8 : .9);
    }
    for (const soldier of this.soldiers.values()) {
      const target = soldier.aimTarget ? this.soldiers.get(soldier.aimTarget) : undefined;
      if (!target) continue;
      const from = soldier.position, to = target.position;
      const facing = soldier.user.team === 'blue' ? 1 : -1;
      soldier.aimAngle = Math.atan2(
        to.y + 40 * to.scale - from.y - 56 * from.scale,
        Math.max(1, (to.x + 40 * to.scale - from.x - 40 * from.scale) * facing),
      );
    }
    this.shots = this.shots.filter(shot => now - shot.started < 1000).slice(-100);

    ctx.save();
    if (!this.reducedMotion && now < this.shakeUntil) {
      const strength = this.shakePower * Math.min(1, (this.shakeUntil - now) / 170);
      ctx.translate(Math.sin(now * .091) * strength, Math.cos(now * .117) * strength * .65);
    }
    this.drawField();
    for (const soldier of this.soldiers.values()) this.drawSoldier(soldier, now);
    for (const shot of this.shots) this.drawShot(shot, now);
    ctx.restore();
  };

  private drawField(): void {
    const ctx = this.ctx;
    const w = this.width, h = this.height;
    ctx.fillStyle = '#101c2a'; ctx.fillRect(-5, -5, w + 10, h + 10);
    const floor = ctx.createLinearGradient(0, 0, w, 0);
    floor.addColorStop(0, '#133342');
    floor.addColorStop(.48, '#142733');
    floor.addColorStop(.52, '#30212e');
    floor.addColorStop(1, '#402335');
    ctx.fillStyle = floor; ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = .7; ctx.strokeStyle = '#c0d9e80b';
    for (let x = 0; x < w; x += 26) { ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 34; y < h; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.strokeStyle = '#dfeeff25'; ctx.lineWidth = 1;
    ctx.strokeRect(5, 34, w - 10, h - 40);
    ctx.beginPath(); ctx.arc(w / 2, (h + 34) / 2, Math.min(42, w * .12), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([8, 9]);
    ctx.strokeStyle = '#dfeeff50';
    ctx.beginPath(); ctx.moveTo(w / 2, 34); ctx.lineTo(w / 2, h - 6); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#07121ad9'; ctx.fillRect(0, 0, w, 32);
    ctx.font = '700 11px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.blue; ctx.fillText('BIỆT ĐỘI XANH', w / 4, 21);
    ctx.fillStyle = COLORS.red; ctx.fillText('BIỆT ĐỘI ĐỎ', w * .75, 21);
    ctx.fillStyle = '#a7b8c8'; ctx.font = '800 9px "Segoe UI", sans-serif'; ctx.fillText('VS', w / 2, 20);
    if (!this.soldiers.size) {
      ctx.fillStyle = '#c2cad9'; ctx.font = '500 14px "Segoe UI", sans-serif';
      ctx.fillText('Chờ người xem vào Live…', w / 2, h / 2);
    }
  }

  private drawSoldier(soldier: Soldier, now: number): void {
    const ctx = this.ctx;
    const { user, building, position } = soldier;
    const { x, y, scale, phase } = position;
    const color = COLORS[user.team];
    const facing = user.team === 'blue' ? 1 : -1;
    const alive = Boolean(building);
    const shotAge = now - soldier.firedAt;
    const hitAge = now - soldier.hitAt;
    const firing = shotAge < 160 && shotAge >= 0;
    const hit = hitAge < 260 && hitAge >= 0;
    const recoil = firing && !this.reducedMotion ? Math.sin(shotAge / 160 * Math.PI) * 4 : 0;
    const bob = alive && !this.reducedMotion ? Math.sin(phase * 2) * 1.3 : 0;
    const stride = alive && !this.reducedMotion ? Math.sin(phase) * 9 : 0;

    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    if (hit && !this.reducedMotion) ctx.translate(Math.sin(hitAge * .15) * 3 * (1 - hitAge / 260), 0);
    ctx.globalAlpha = alive ? 1 : .28;
    ctx.fillStyle = '#03081266';
    ctx.beginPath(); ctx.ellipse(40, 95, 20, 4, 0, 0, Math.PI * 2); ctx.fill();

    // Health stays above the avatar, while the body leans and recoils underneath.
    ctx.fillStyle = '#07101be6'; this.roundRect(17, 1, 46, 6, 3); ctx.fill();
    if (building) {
      ctx.fillStyle = building.level === 2 ? '#ffcf76' : color;
      this.roundRect(18, 2, Math.max(0, 44 * building.health / building.maxHealth), 4, 2); ctx.fill();
    }
    if (building?.level === 2) {
      ctx.fillStyle = '#ffda8b'; ctx.font = '800 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('LV.2', 40, 13);
    }

    ctx.save(); ctx.translate(-facing * recoil, bob);
    if (!alive) {
      ctx.translate(40, 66); ctx.rotate(-facing * .65); ctx.translate(-40, -66);
    }
    // Black, outlined stick limbs with a team-coloured inner stroke.
    const limb = (points: number[]) => {
      ctx.beginPath(); ctx.moveTo(points[0]!, points[1]!);
      for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i]!, points[i + 1]!);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#07111a'; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 3.6; ctx.stroke();
    };
    limb([40, 48, 39 - facing * 2, 70]);
    limb([39, 69, 33 + stride * .5, 81, 29 + stride, 93]);
    limb([39, 69, 47 - stride * .5, 82, 52 - stride, 92]);
    const angle = soldier.aimAngle;
    const gripX = (distance: number) => 40 + facing * distance * Math.cos(angle);
    const gripY = (distance: number) => 56 + distance * Math.sin(angle);
    limb([40, 54, 40 + facing * 8, 63, gripX(22), gripY(22)]);
    limb([39, 56, 39 + facing * 6, 60, gripX(12), gripY(12)]);

    ctx.save(); ctx.translate(40, 56); ctx.scale(facing, 1); ctx.rotate(angle);
    ctx.fillStyle = '#090e15'; ctx.fillRect(10, -5, 26, 8);
    ctx.fillStyle = '#9babb4'; ctx.fillRect(14, -4, 18, 3);
    ctx.fillStyle = '#263842'; ctx.fillRect(16, 2, 5, 9); ctx.fillRect(8, -2, 8, 5);
    ctx.fillStyle = '#dae7e9'; ctx.fillRect(33, -3, 6, 3);
    ctx.fillStyle = '#111923'; ctx.fillRect(20, -8, 6, 3);
    if (firing) {
      ctx.globalAlpha = 1 - shotAge / 160;
      ctx.fillStyle = '#fff0a5'; ctx.shadowColor = '#ffd177'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(39, -2); ctx.lineTo(51, -9); ctx.lineTo(47, -2);
      ctx.lineTo(55, 1); ctx.lineTo(46, 3); ctx.lineTo(49, 10); ctx.lineTo(39, 3); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // The user's original TikTok photo is the character's head.
    ctx.save(); ctx.beginPath(); ctx.arc(40, 32, 18, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = user.team === 'blue' ? '#285d76' : '#793f5c'; ctx.fillRect(21, 13, 38, 38);
    const avatar = user.avatarUrl ? this.images.get(user.avatarUrl) : undefined;
    if (avatar?.complete && avatar.naturalWidth) {
      const side = Math.min(avatar.naturalWidth, avatar.naturalHeight);
      ctx.drawImage(avatar, (avatar.naturalWidth - side) / 2, (avatar.naturalHeight - side) / 2, side, side, 22, 14, 36, 36);
    } else {
      const initials = user.nickname.trim().split(/\s+/).slice(-2).map(word => word[0]).join('').toUpperCase();
      ctx.fillStyle = '#f1f6ff'; ctx.font = '800 13px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(initials, 40, 37);
    }
    ctx.restore();
    ctx.strokeStyle = building?.level === 2 ? '#ffe09a' : '#effaff';
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(40, 32, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    if (building?.shielded) {
      ctx.strokeStyle = '#82ffe2'; ctx.lineWidth = 1.5; ctx.fillStyle = '#63ffd70a';
      ctx.beginPath(); ctx.ellipse(40, 50, 30, 44, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#b8ffec'; ctx.font = '800 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('◆', 67, 24);
    }
    ctx.globalAlpha = 1;
    const selected = this.selectedId === user.userId;
    ctx.fillStyle = selected ? '#e1ceff' : alive ? '#f1f5ff' : '#93a0b3';
    ctx.font = (selected ? '800' : '600') + ' 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#020714'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
    ctx.fillText(this.fitText(user.nickname, 78), 40, 108);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    if (selected) {
      ctx.strokeStyle = '#d2b5ff'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.strokeRect(1, 0, 78, 111); ctx.setLineDash([]);
    }
    ctx.restore();
  }

  private drawShot(shot: Shot, now: number): void {
    const source = this.soldiers.get(shot.action.user.userId);
    const target = shot.action.targetUserId ? this.soldiers.get(shot.action.targetUserId) : undefined;
    if (!source || !target) return;
    const ctx = this.ctx;
    const age = now - shot.started;
    const mega = shot.action.type === 'MEGA_DESTROY';
    const duration = this.reducedMotion ? 0 : 190;
    const a = source.position, b = target.position;
    const facing = source.user.team === 'blue' ? 1 : -1;
    const from = {
      x: a.x + (40 + facing * (39 * Math.cos(source.aimAngle) + 2 * Math.sin(source.aimAngle))) * a.scale,
      y: a.y + (56 + 39 * Math.sin(source.aimAngle) - 2 * Math.cos(source.aimAngle)) * a.scale,
    };
    const to = { x: b.x + 40 * b.scale, y: b.y + 50 * b.scale };
    ctx.save();
    if (age < duration) {
      const progress = age / duration;
      const tail = Math.max(0, progress - .25);
      ctx.strokeStyle = mega ? '#f3c7ff' : '#ffe9a6';
      ctx.lineWidth = mega ? 3 : 1.8;
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(from.x + (to.x - from.x) * tail, from.y + (to.y - from.y) * tail);
      ctx.lineTo(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress); ctx.stroke();
    } else {
      if (!shot.impacted) {
        shot.impacted = true; target.hitAt = now;
        this.shake(now, mega ? 4 : 1.7);
      }
      const elapsed = age - duration;
      const progress = Math.min(1, elapsed / 520);
      const blocked = shot.action.type === 'BLOCKED';
      const color = blocked ? '#89ffe2' : mega ? '#f1baff' : '#ffc577';
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
      if (!this.reducedMotion) {
        const radius = (mega ? 28 : 15) * progress;
        ctx.beginPath(); ctx.arc(to.x, to.y, radius, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 7; i++) {
          const angle = i * Math.PI * 2 / 7 + .2;
          const distance = radius * (1 + (i % 2) * .5);
          ctx.fillRect(to.x + Math.cos(angle) * distance, to.y + Math.sin(angle) * distance, 2, 2);
        }
      }
      ctx.font = '800 ' + (mega ? 16 : 13) + 'px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 3;
      ctx.fillText(blocked ? 'CHẶN!' : '-' + (shot.action.damage ?? 1), to.x, to.y - 16 - (this.reducedMotion ? 0 : progress * 24));
    }
    ctx.restore();
  }

  private shake(now: number, power: number): void {
    if (this.reducedMotion) return;
    this.shakePower = now < this.shakeUntil ? Math.max(this.shakePower, power) : power;
    this.shakeUntil = now + 170;
  }
  private fitText(text: string, width: number): string {
    if (this.ctx.measureText(text).width <= width) return text;
    let value = text;
    while (value.length > 1 && this.ctx.measureText(value + '…').width > width) value = value.slice(0, -1);
    return value + '…';
  }
  private roundRect(x: number, y: number, width: number, height: number, radius: number): void {
    this.ctx.beginPath(); this.ctx.roundRect(x, y, Math.max(0, width), height, radius);
  }
  private info(id: string): SoldierInfo | null {
    const soldier = this.soldiers.get(id);
    return soldier ? { userId: id, name: soldier.user.nickname, health: soldier.building?.health ?? 0, level: soldier.building?.level ?? (soldier.user.upgraded ? 2 : 1), alive: Boolean(soldier.building) } : null;
  }
  private handlePointer = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    const found = [...this.soldiers.values()].reverse().find(soldier => {
      const p = soldier.position;
      return x >= p.x && x <= p.x + CARD_WIDTH * p.scale && y >= p.y && y <= p.y + CARD_HEIGHT * p.scale;
    });
    this.selectedId = found?.user.userId ?? null;
    this.onSelect(this.selectedId ? this.info(this.selectedId) : null);
  };
  private handleMotionChange = (): void => { this.reducedMotion = this.motionPreference.matches; };
  private handleVisibility = (): void => {
    if (document.hidden) { cancelAnimationFrame(this.frameId); this.shots = []; this.pending = []; }
    else if (!this.disposed) { this.pending = []; this.lastFrame = 0; this.frameId = requestAnimationFrame(this.render); }
  };
  destroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.observer.disconnect();
    this.motionPreference.removeEventListener('change', this.handleMotionChange);
    this.canvas.removeEventListener('pointerdown', this.handlePointer);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.images.clear(); this.soldiers.clear();
  }
}
