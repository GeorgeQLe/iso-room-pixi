import type {
  GridPoint, LayoutDocument, Opening, PlacedEntity, Rotation, Tile, WallEdge,
} from "iso-room-schema";

export type EditCommand =
  | { type: "entity.add"; entity: PlacedEntity }
  | { type: "entity.remove"; ids: string[] }
  | { type: "entity.move"; ids: string[]; delta: GridPoint }
  | { type: "entity.rotate"; ids: string[]; rotation?: Rotation }
  | { type: "entity.duplicate"; ids: string[] }
  | { type: "entity.layer"; ids: string[]; layer: string }
  | { type: "floor.paint"; floorId: string; tiles: Tile[]; remove?: boolean }
  | { type: "wall.add"; wall: WallEdge }
  | { type: "wall.remove"; ids: string[] }
  | { type: "opening.add"; opening: Opening }
  | { type: "opening.remove"; ids: string[] }
  | { type: "room.resize"; width: number; height: number };

const uniqueTiles = (tiles: Tile[]) => [...new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile])).values()];

export function applyCommand(layout: LayoutDocument, command: EditCommand): LayoutDocument {
  const next = structuredClone(layout);
  switch (command.type) {
    case "entity.add": next.entities.push(structuredClone(command.entity)); break;
    case "entity.remove": next.entities = next.entities.filter((item) => !command.ids.includes(item.id)); break;
    case "entity.move":
      next.entities.filter((item) => command.ids.includes(item.id)).forEach((item) => {
        item.position.x += command.delta.x; item.position.y += command.delta.y;
      }); break;
    case "entity.rotate":
      next.entities.filter((item) => command.ids.includes(item.id)).forEach((item) => {
        item.rotation = command.rotation ?? ((item.rotation + 90) % 360) as Rotation;
      }); break;
    case "entity.duplicate":
      for (const entity of next.entities.filter((item) => command.ids.includes(item.id))) {
        let suffix = 1; let id = `${entity.id}.copy`;
        while (next.entities.some((item) => item.id === id)) id = `${entity.id}.copy${++suffix}`;
        next.entities.push({ ...structuredClone(entity), id, name: `${entity.name} copy`, position: { x: entity.position.x + 1, y: entity.position.y + 1 } });
      } break;
    case "entity.layer":
      next.entities.filter((item) => command.ids.includes(item.id)).forEach((item) => { item.layer = command.layer; });
      break;
    case "floor.paint": {
      const floor = next.floors.find((item) => item.id === command.floorId);
      if (!floor) throw new Error(`Unknown floor '${command.floorId}'`);
      const targets = new Set(command.tiles.map((tile) => `${tile.x},${tile.y}`));
      floor.tiles = command.remove
        ? floor.tiles.filter((tile) => !targets.has(`${tile.x},${tile.y}`))
        : uniqueTiles([...floor.tiles, ...command.tiles]);
      break;
    }
    case "wall.add": next.walls.push(structuredClone(command.wall)); break;
    case "wall.remove":
      next.walls = next.walls.filter((wall) => !command.ids.includes(wall.id));
      next.openings = next.openings.filter((opening) => next.walls.some((wall) => wall.id === opening.wallId));
      break;
    case "opening.add": next.openings.push(structuredClone(command.opening)); break;
    case "opening.remove": next.openings = next.openings.filter((item) => !command.ids.includes(item.id)); break;
    case "room.resize": {
      const oldWidth = next.grid.width; const oldHeight = next.grid.height;
      const completeFloors = new Set(next.floors.filter((floor) => {
        const tiles = new Set(floor.tiles.map((tile) => `${tile.x},${tile.y}`));
        return tiles.size === oldWidth * oldHeight
          && Array.from({ length: oldWidth * oldHeight }, (_, index) => `${index % oldWidth},${Math.floor(index / oldWidth)}`).every((tile) => tiles.has(tile));
      }).map((floor) => floor.id));
      next.grid.width = command.width; next.grid.height = command.height;
      next.floors.forEach((floor) => {
        floor.tiles = completeFloors.has(floor.id)
          ? Array.from({ length: command.width * command.height }, (_, index) => ({ x: index % command.width, y: Math.floor(index / command.width) }))
          : floor.tiles.filter((tile) => tile.x < command.width && tile.y < command.height);
      });
      break;
    }
  }
  return next;
}
