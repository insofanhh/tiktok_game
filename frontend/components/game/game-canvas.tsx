'use client';

import { Application, extend } from '@pixi/react';
import { gsap } from 'gsap';
import { Container, Graphics } from 'pixi.js';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Building, GameAction, GameState } from '@/lib/game-types';

extend({ Container, Graphics });

export const DESIGN_WIDTH = 1200;
export const DESIGN_HEIGHT = 675;
const CELL_SIZE = 26;
const BOARD_X = 340;
const BOARD_Y = 78;

interface GameCanvasProps {
  state: GameState;
  lastAction: GameAction | null;
}

export const GameCanvas = memo(function GameCanvas({ state, lastAction }: GameCanvasProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-full w-full bg-[#07111d]" aria-hidden="true" />;

  return (
    <Application
      width={DESIGN_WIDTH}
      height={DESIGN_HEIGHT}
      backgroundAlpha={0}
      antialias={false}
      autoDensity={false}
      resolution={1}
      preference="webgl"
      roundPixels
      className="h-full w-full object-contain"
    >
      <GridLayer gridSize={state.gridSize} />
      {state.grid.flatMap((row) => row
        .filter((cell) => Boolean(cell.building))
        .map((cell) => (
          <BuildingView
            key={cell.building?.id}
            building={cell.building as Building}
            cellX={cell.x}
            cellY={cell.y}
          />
        )))}
      {lastAction?.x !== undefined && lastAction.y !== undefined && (
        <ActionEffect key={lastAction.id} action={lastAction} />
      )}
    </Application>
  );
});

const GridLayer = memo(function GridLayer({ gridSize }: { gridSize: number }) {
  const draw = useCallback((graphics: Graphics) => {
    graphics.clear();
    graphics.rect(0, 0, DESIGN_WIDTH / 2, DESIGN_HEIGHT).fill({ color: 0x071d35 });
    graphics.rect(DESIGN_WIDTH / 2, 0, DESIGN_WIDTH / 2, DESIGN_HEIGHT).fill({ color: 0x301018 });

    graphics
      .circle(170, 338, 210)
      .fill({ color: 0x0a3454, alpha: 0.5 })
      .circle(1030, 338, 210)
      .fill({ color: 0x4a1720, alpha: 0.52 });

    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        const blue = x < gridSize / 2;
        graphics
          .rect(
            BOARD_X + x * CELL_SIZE,
            BOARD_Y + y * CELL_SIZE,
            CELL_SIZE - 1,
            CELL_SIZE - 1,
          )
          .fill({ color: blue ? 0x0d3c61 : 0x551e28, alpha: 0.76 })
          .stroke({ color: blue ? 0x53d7ff : 0xff5b72, alpha: 0.15, width: 1 });
      }
    }

    graphics
      .rect(BOARD_X + gridSize * CELL_SIZE * 0.5 - 2, BOARD_Y - 11, 4, gridSize * CELL_SIZE + 22)
      .fill({ color: 0xffd65a, alpha: 0.88 });

    for (let index = 0; index < 8; index += 1) {
      const y = BOARD_Y + 23 + index * 65;
      graphics
        .moveTo(BOARD_X - 18, y)
        .lineTo(BOARD_X - 7, y - 5)
        .lineTo(BOARD_X - 7, y + 5)
        .closePath()
        .fill({ color: 0x59ddff, alpha: 0.72 })
        .moveTo(BOARD_X + gridSize * CELL_SIZE + 18, y)
        .lineTo(BOARD_X + gridSize * CELL_SIZE + 7, y - 5)
        .lineTo(BOARD_X + gridSize * CELL_SIZE + 7, y + 5)
        .closePath()
        .fill({ color: 0xff667d, alpha: 0.72 });
    }
  }, [gridSize]);

  return <pixiGraphics draw={draw} />;
});

interface BuildingViewProps {
  building: Building;
  cellX: number;
  cellY: number;
}

const BuildingView = memo(function BuildingView({ building, cellX, cellY }: BuildingViewProps) {
  const animatedRef = useRef<Container>(null);
  const shieldRef = useRef<Graphics>(null);
  const previousHealth = useRef(building.health);

  useLayoutEffect(() => {
    if (!animatedRef.current) return;
    const animation = gsap.fromTo(
      animatedRef.current,
      { alpha: 0, y: -70 },
      { alpha: 1, y: 0, duration: 0.48, ease: 'back.out(1.8)' },
    );
    return () => {
      animation.kill();
    };
  }, []);

  useLayoutEffect(() => {
    if (!shieldRef.current || !building.shielded) return;
    const animation = gsap.fromTo(
      shieldRef.current,
      { alpha: 0.38 },
      { alpha: 0.95, duration: 0.8, repeat: -1, yoyo: true, ease: 'sine.inOut' },
    );
    return () => {
      animation.kill();
    };
  }, [building.shielded]);

  useLayoutEffect(() => {
    if (!animatedRef.current || building.level !== 2) return;
    const animation = gsap.fromTo(
      animatedRef.current.scale,
      { x: 0.72, y: 0.72 },
      { x: 1, y: 1, duration: 0.38, ease: 'back.out(2.5)' },
    );
    return () => {
      animation.kill();
    };
  }, [building.level]);

  useLayoutEffect(() => {
    const container = animatedRef.current;
    const damaged = building.health < previousHealth.current;
    previousHealth.current = building.health;
    if (!container || !damaged) return;
    const animation = gsap.fromTo(
      container,
      { alpha: 0.35, x: -3 },
      { alpha: 1, x: 0, duration: 0.1, repeat: 3, yoyo: true, ease: 'power1.inOut' },
    );
    return () => {
      animation.kill();
    };
  }, [building.health]);

  const drawBuilding = useCallback((graphics: Graphics) => {
    graphics.clear();
    const color = building.team === 'blue' ? 0x4edcff : 0xff5c73;

    if (building.level === 2) {
      graphics
        .rect(3, 7, 18, 14)
        .fill({ color })
        .rect(5, 3, 4, 7)
        .rect(11, 1, 4, 9)
        .rect(17, 3, 4, 7)
        .fill({ color: 0xffe4a0 })
        .rect(10, 14, 4, 7)
        .fill({ color: 0x0a1623, alpha: 0.8 });
    } else {
      graphics
        .rect(5, 9, 14, 12)
        .fill({ color })
        .moveTo(3, 10)
        .lineTo(12, 3)
        .lineTo(21, 10)
        .closePath()
        .fill({ color: 0xffe4a0 })
        .rect(10, 14, 4, 7)
        .fill({ color: 0x0a1623, alpha: 0.8 });
    }
  }, [building.level, building.team]);

  const drawShield = useCallback((graphics: Graphics) => {
    graphics.clear();
    if (!building.shielded) return;
    graphics
      .circle(12, 12, 17)
      .fill({ color: 0x9aeaff, alpha: 0.1 })
      .stroke({ color: 0xb8f4ff, alpha: 0.96, width: 2 });
  }, [building.shielded]);

  const drawHealth = useCallback((graphics: Graphics) => {
    graphics.clear();
    const ratio = Math.max(0, Math.min(1, building.health / building.maxHealth));
    const color = ratio > 0.6 ? 0x5eea8c : ratio > 0.3 ? 0xffcf4a : 0xff506b;
    graphics
      .rect(1, -5, 22, 3)
      .fill({ color: 0x020617, alpha: 0.92 })
      .rect(2, -4, 20 * ratio, 1)
      .fill({ color, alpha: 1 });
  }, [building.health, building.maxHealth]);

  return (
    <pixiContainer x={BOARD_X + cellX * CELL_SIZE + 1} y={BOARD_Y + cellY * CELL_SIZE + 1}>
      <pixiContainer ref={animatedRef}>
        <pixiGraphics draw={drawHealth} />
        <pixiGraphics draw={drawBuilding} />
        {building.shielded && <pixiGraphics ref={shieldRef} draw={drawShield} />}
      </pixiContainer>
    </pixiContainer>
  );
});

function ActionEffect({ action }: { action: GameAction }) {
  if (
    (action.type === 'DAMAGE' || action.type === 'DESTROY' || action.type === 'BLOCKED')
    && action.sourceX !== undefined
    && action.sourceY !== undefined
  ) {
    return <ProjectileEffect action={action} />;
  }
  if (action.type === 'MEGA_DESTROY') return <MegaDestroyEffect action={action} />;
  return <PulseEffect action={action} />;
}

function ProjectileEffect({ action }: { action: GameAction }) {
  const projectileRef = useRef<Container>(null);
  const impactRef = useRef<Container>(null);
  const source = cellPoint(action.sourceX ?? 0, action.sourceY ?? 0);
  const target = cellPoint(action.x ?? 0, action.y ?? 0);

  useLayoutEffect(() => {
    if (!projectileRef.current || !impactRef.current) return;
    const projectile = projectileRef.current;
    const impact = impactRef.current;
    const timeline = gsap.timeline();
    timeline
      .set(impact, { alpha: 0, scale: 0.2 })
      .to(projectile, { x: target.x, y: target.y, duration: 0.62, ease: 'power2.in' })
      .to(projectile, { alpha: 0, duration: 0.05 })
      .to(impact, { alpha: 1, scale: action.type === 'BLOCKED' ? 1.2 : 1.8, duration: 0.18, ease: 'back.out(2.4)' }, '<')
      .to(impact, { alpha: 0, scale: 2.4, duration: 0.35, ease: 'power2.out' });
    return () => {
      timeline.kill();
    };
  }, [action.type, target.x, target.y]);

  const drawProjectile = useCallback((graphics: Graphics) => {
    graphics.clear();
    const color = action.team === 'blue' ? 0x54ddff : 0xff5c73;
    graphics
      .circle(0, 0, 7)
      .fill({ color, alpha: 0.22 })
      .circle(0, 0, 4)
      .fill({ color: 0xffffff })
      .stroke({ color, alpha: 1, width: 2 });
  }, [action.team]);

  const drawImpact = useCallback((graphics: Graphics) => {
    graphics.clear();
    const color = action.type === 'BLOCKED' ? 0x8beaff : 0xffb020;
    graphics
      .circle(0, 0, 15)
      .stroke({ color, alpha: 1, width: 4 })
      .circle(0, 0, 7)
      .fill({ color: 0xffffff, alpha: 0.9 });
  }, [action.type]);

  return (
    <pixiContainer>
      <pixiContainer ref={projectileRef} x={source.x} y={source.y}>
        <pixiGraphics draw={drawProjectile} />
      </pixiContainer>
      <pixiContainer ref={impactRef} x={target.x} y={target.y}>
        <pixiGraphics draw={drawImpact} />
      </pixiContainer>
    </pixiContainer>
  );
}

function MegaDestroyEffect({ action }: { action: GameAction }) {
  const effectRef = useRef<Container>(null);
  const target = cellPoint(action.x ?? 0, action.y ?? 0);

  useLayoutEffect(() => {
    if (!effectRef.current) return;
    const timeline = gsap.timeline();
    timeline
      .fromTo(effectRef.current, { alpha: 0, scale: 0.15 }, { alpha: 1, scale: 2.5, duration: 0.3, ease: 'expo.out' })
      .to(effectRef.current, { alpha: 0, scale: 4.5, duration: 0.7, ease: 'power2.out' });
    return () => {
      timeline.kill();
    };
  }, []);

  const draw = useCallback((graphics: Graphics) => {
    graphics.clear();
    graphics
      .circle(0, 0, 22)
      .fill({ color: 0xfff2a8, alpha: 0.18 })
      .stroke({ color: 0xffcf4a, alpha: 1, width: 5 })
      .moveTo(-18, -18)
      .lineTo(18, 18)
      .moveTo(18, -18)
      .lineTo(-18, 18)
      .stroke({ color: 0xffffff, alpha: 0.95, width: 4 });
  }, []);

  return (
    <pixiContainer ref={effectRef} x={target.x} y={target.y}>
      <pixiGraphics draw={draw} />
    </pixiContainer>
  );
}

function PulseEffect({ action }: { action: GameAction }) {
  const effectRef = useRef<Container>(null);

  useLayoutEffect(() => {
    if (!effectRef.current) return;
    const timeline = gsap.timeline();
    timeline
      .fromTo(effectRef.current.scale, { x: 0.2, y: 0.2 }, { x: 1.8, y: 1.8, duration: 0.32, ease: 'power3.out' })
      .to(effectRef.current, { alpha: 0, duration: 0.42, ease: 'power2.in' }, '<0.15');
    return () => {
      timeline.kill();
    };
  }, []);

  const drawEffect = useCallback((graphics: Graphics) => {
    graphics.clear();
    const color = action.type === 'SHIELD'
        ? 0x8beaff
        : 0xffe36e;
    graphics
      .circle(0, 0, 16)
      .stroke({ color, alpha: 1, width: 3 })
      .circle(0, 0, 9)
      .stroke({ color: 0xffffff, alpha: 0.72, width: 2 });
  }, [action.type]);

  return (
    <pixiContainer
      x={BOARD_X + (action.x ?? 0) * CELL_SIZE + CELL_SIZE / 2}
      y={BOARD_Y + (action.y ?? 0) * CELL_SIZE + CELL_SIZE / 2}
      ref={effectRef}
    >
      <pixiGraphics draw={drawEffect} />
    </pixiContainer>
  );
}

function cellPoint(x: number, y: number): { x: number; y: number } {
  return {
    x: BOARD_X + x * CELL_SIZE + CELL_SIZE / 2,
    y: BOARD_Y + y * CELL_SIZE + CELL_SIZE / 2,
  };
}
