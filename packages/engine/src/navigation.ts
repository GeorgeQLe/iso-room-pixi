import type { GridPoint, LayoutDocument } from "iso-room-schema";

const key = ({ x, y }: GridPoint) => `${x},${y}`;
const point = (value: string): GridPoint => {
  const [x = 0, y = 0] = value.split(",").map(Number);
  return { x, y };
};

function blockedTiles(layout: LayoutDocument): Set<string> {
  const blocked = new Set<string>();
  for (const entity of layout.entities) {
    if (!entity.collision) continue;
    const rotated = entity.rotation === 90 || entity.rotation === 270;
    const width = rotated ? entity.footprint.height : entity.footprint.width;
    const height = rotated ? entity.footprint.width : entity.footprint.height;
    for (let x = 0; x < width; x += 1) for (let y = 0; y < height; y += 1) {
      blocked.add(`${entity.position.x + x},${entity.position.y + y}`);
    }
  }
  for (const zone of layout.zones) {
    if (zone.accessible === false || layout.navigation.blockedZoneIds?.includes(zone.id)) {
      zone.tiles.forEach((tile) => blocked.add(key(tile)));
    }
  }
  return blocked;
}

/** Deterministic A*: cardinal neighbors precede diagonals and ties use coordinate order. */
export function findPath(layout: LayoutDocument, start: GridPoint, goal: GridPoint): GridPoint[] {
  const floor = new Set(layout.floors.flatMap((region) => region.tiles.map(key)));
  const blocked = blockedTiles(layout);
  if (!floor.has(key(start)) || !floor.has(key(goal)) || blocked.has(key(start)) || blocked.has(key(goal))) return [];
  const cardinal = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
  const diagonal = [{ x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }];
  const offsets = layout.navigation.allowDiagonal ? [...cardinal, ...diagonal] : cardinal;
  const goalKey = key(goal);
  const open = new Set([key(start)]);
  const cameFrom = new Map<string, string>();
  const g = new Map([[key(start), 0]]);
  const heuristic = (candidate: GridPoint) => Math.abs(candidate.x - goal.x) + Math.abs(candidate.y - goal.y);
  while (open.size) {
    const currentKey = [...open].sort((a, b) => {
      const pa = point(a); const pb = point(b);
      const score = (g.get(a) ?? Infinity) + heuristic(pa) - (g.get(b) ?? Infinity) - heuristic(pb);
      return score || a.localeCompare(b);
    })[0]!;
    if (currentKey === goalKey) {
      const route = [currentKey];
      while (cameFrom.has(route[0]!)) route.unshift(cameFrom.get(route[0]!)!);
      return route.map(point);
    }
    open.delete(currentKey);
    const current = point(currentKey);
    for (const offset of offsets) {
      const next = { x: current.x + offset.x, y: current.y + offset.y };
      const nextKey = key(next);
      if (!floor.has(nextKey) || blocked.has(nextKey)) continue;
      if (offset.x && offset.y && layout.navigation.preventCornerCutting) {
        if (blocked.has(`${current.x + offset.x},${current.y}`) || blocked.has(`${current.x},${current.y + offset.y}`)) continue;
      }
      const tentative = (g.get(currentKey) ?? Infinity) + (offset.x && offset.y ? Math.SQRT2 : 1);
      if (tentative < (g.get(nextKey) ?? Infinity)) {
        cameFrom.set(nextKey, currentKey); g.set(nextKey, tentative); open.add(nextKey);
      }
    }
  }
  return [];
}
