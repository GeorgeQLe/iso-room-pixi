import { SCHEMA_VERSION, type LayoutDocument } from "iso-room-schema";

export function createEmptyLayout(width = 16, height = 16): LayoutDocument {
  const tiles = Array.from({ length: width * height }, (_, index) => ({
    x: index % width, y: Math.floor(index / width),
  }));
  return {
    schemaVersion: SCHEMA_VERSION,
    metadata: { id: "layout", title: "Untitled isometric room" },
    grid: { width, height, tileWidth: 256, tileHeight: 128 },
    theme: "procedural",
    assets: [
      { id: "procedural.crate", name: "Crate", kind: "procedural", footprint: { width: 1, height: 1 }, collision: true },
      { id: "procedural.avatar", name: "Avatar", kind: "procedural", footprint: { width: 1, height: 1 }, collision: false },
    ],
    rooms: [{ id: "room.main", name: "Main room", floorRegionIds: ["floor.main"] }],
    floors: [{ id: "floor.main", roomId: "room.main", material: "checker", tiles }],
    walls: [], openings: [], entities: [], zones: [],
    spawnPoints: [{ id: "spawn.main", name: "Main spawn", roomId: "room.main", position: { x: 0, y: 0 } }],
    navigation: { allowDiagonal: false, preventCornerCutting: true },
  };
}
