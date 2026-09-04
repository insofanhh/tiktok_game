import type { Building, GameState, GridCell, Team, UserStats } from './game-types';

const demoStructures: ReadonlyArray<{
  x: number;
  y: number;
  team: Team;
  level: 1 | 2;
  shielded: boolean;
  owner: string;
}> = [
  { x: 2, y: 3, team: 'blue', level: 2, shielded: true, owner: 'Linh Miu' },
  { x: 5, y: 8, team: 'blue', level: 1, shielded: false, owner: 'Gia Bảo' },
  { x: 7, y: 14, team: 'blue', level: 1, shielded: false, owner: 'Mộc An' },
  { x: 8, y: 5, team: 'blue', level: 2, shielded: false, owner: 'Linh Miu' },
  { x: 12, y: 4, team: 'red', level: 1, shielded: true, owner: 'Hải Đăng' },
  { x: 15, y: 9, team: 'red', level: 2, shielded: false, owner: 'Bảo Trân' },
  { x: 17, y: 15, team: 'red', level: 1, shielded: false, owner: 'Mèo Ú' },
  { x: 11, y: 16, team: 'red', level: 2, shielded: false, owner: 'Hải Đăng' },
];

const demoUsers: UserStats[] = [
  { userId: 'demo-linh', uniqueId: 'linhmiu', nickname: 'Linh Miu', team: 'blue', built: 14, upgraded: 4, shielded: 2, destroyed: 2 },
  { userId: 'demo-bao', uniqueId: 'giabao', nickname: 'Gia Bảo', team: 'blue', built: 11, upgraded: 3, shielded: 1, destroyed: 4 },
  { userId: 'demo-an', uniqueId: 'mocan', nickname: 'Mộc An', team: 'blue', built: 9, upgraded: 2, shielded: 1, destroyed: 1 },
  { userId: 'demo-hai', uniqueId: 'haidang', nickname: 'Hải Đăng', team: 'red', built: 7, upgraded: 2, shielded: 1, destroyed: 12 },
  { userId: 'demo-tran', uniqueId: 'baotran', nickname: 'Bảo Trân', team: 'red', built: 6, upgraded: 2, shielded: 2, destroyed: 9 },
  { userId: 'demo-meo', uniqueId: 'meou', nickname: 'Mèo Ú', team: 'red', built: 5, upgraded: 1, shielded: 1, destroyed: 7 },
];

export function createDemoState(): GameState {
  const size = 20;
  const grid: GridCell[][] = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x): GridCell => ({
      x,
      y,
      territory: x < size / 2 ? 'blue' : 'red',
    })),
  );

  for (const [index, item] of demoStructures.entries()) {
    const cell = grid[item.y]?.[item.x];
    if (!cell) continue;
    const building: Building = {
      id: `demo-${index}`,
      ownerId: `demo-${item.owner}`,
      ownerName: item.owner,
      team: item.team,
      level: item.level,
      shielded: item.shielded,
      health: 10,
      maxHealth: 10,
    };
    cell.building = building;
  }

  return {
    version: 0,
    gridSize: size,
    grid,
    users: demoUsers,
    leaderboard: {
      builders: demoUsers
        .map((user) => ({ userId: user.userId, nickname: user.nickname, team: user.team, score: user.built + user.upgraded }))
        .sort((left, right) => right.score - left.score)
        .slice(0, 3),
      destroyers: demoUsers
        .map((user) => ({ userId: user.userId, nickname: user.nickname, team: user.team, score: user.destroyed }))
        .sort((left, right) => right.score - left.score)
        .slice(0, 3),
    },
    scores: { blue: 6, red: 6 },
    updatedAt: Date.now(),
  };
}
