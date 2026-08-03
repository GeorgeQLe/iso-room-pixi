import type { GridPoint } from "iso-room-schema";

export interface ScreenPoint { x: number; y: number }
export interface ProjectionOptions {
  tileWidth: number;
  tileHeight: number;
  originX?: number;
  originY?: number;
}

/** Deterministic 2:1-compatible grid-to-screen projection. */
export function gridToScreen(point: GridPoint, options: ProjectionOptions): ScreenPoint {
  const halfWidth = options.tileWidth / 2;
  const halfHeight = options.tileHeight / 2;
  return {
    x: (options.originX ?? 0) + (point.x - point.y) * halfWidth,
    y: (options.originY ?? 0) + (point.x + point.y) * halfHeight,
  };
}

/** Inverse projection. Set `snap` false for fractional tile coordinates. */
export function screenToGrid(
  point: ScreenPoint,
  options: ProjectionOptions,
  snap = true,
): GridPoint {
  const x = point.x - (options.originX ?? 0);
  const y = point.y - (options.originY ?? 0);
  const gridX = (x / (options.tileWidth / 2) + y / (options.tileHeight / 2)) / 2;
  const gridY = (y / (options.tileHeight / 2) - x / (options.tileWidth / 2)) / 2;
  return snap ? { x: Math.floor(gridX + 0.5), y: Math.floor(gridY + 0.5) } : { x: gridX, y: gridY };
}

export function painterDepth(point: GridPoint, elevation = 0): number {
  return point.x + point.y + elevation / 1_000;
}

/** The documented Poketo-compatible sprite sizing preset; it contains no product logic. */
export const SPRITE_PRESET_2_TO_1 = {
  tileWidth: 256,
  tileHeight: 128,
  objectCanvasWidth: 256,
  objectCanvasHeight: 512,
  anchor: { x: 0.5, y: 0.875 },
} as const;
