import { describe, expect, it } from "vitest";
import { IsoRoomPixiEngine, createEmptyLayout, findPath, gridToScreen, screenToGrid } from "../packages/engine/src/index.js";

describe("Pixi engine behavior", () => {
  it("projects and picks tiles deterministically", () => {
    const options = { tileWidth: 256, tileHeight: 128, originX: 500, originY: 100 };
    const screen = gridToScreen({ x: 4, y: 7 }, options);
    expect(screenToGrid(screen, options)).toEqual({ x: 4, y: 7 });
  });

  it("supports command undo and redo", () => {
    const engine = new IsoRoomPixiEngine(createEmptyLayout(4, 4));
    engine.execute({ type: "entity.add", entity: {
      id: "crate", name: "Crate", assetId: "procedural.crate", roomId: "room.main",
      position: { x: 2, y: 2 }, footprint: { width: 1, height: 1 }, rotation: 0,
      elevation: 0, collision: true,
    } });
    expect(engine.exportLayout().entities).toHaveLength(1);
    expect(engine.undo()).toBe(true);
    expect(engine.exportLayout().entities).toHaveLength(0);
    expect(engine.redo()).toBe(true);
    expect(engine.exportLayout().entities).toHaveLength(1);
  });

  it("clears selections that no longer exist after edits and loads", () => {
    const engine = new IsoRoomPixiEngine(createEmptyLayout(4, 4));
    const entity = {
      id: "crate", name: "Crate", assetId: "procedural.crate", roomId: "room.main",
      position: { x: 2, y: 2 }, footprint: { width: 1, height: 1 }, rotation: 0 as const,
      elevation: 0, collision: true,
    };
    engine.execute({ type: "entity.add", entity }); engine.select([entity.id]);
    engine.execute({ type: "entity.remove", ids: [entity.id] });
    expect(engine.getSelection()).toEqual([]);
    engine.undo(); engine.select([entity.id]);
    expect(engine.loadLayout(createEmptyLayout(4, 4)).valid).toBe(true);
    expect(engine.getSelection()).toEqual([]);
  });

  it("returns stable A* routes", () => {
    const layout = createEmptyLayout(4, 4);
    expect(findPath(layout, { x: 0, y: 0 }, { x: 3, y: 0 }))
      .toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
  });

  it("extends complete floors when a room grows", () => {
    const engine = new IsoRoomPixiEngine(createEmptyLayout(4, 4));
    engine.execute({ type: "room.resize", width: 5, height: 5 });
    expect(engine.exportLayout().floors[0]?.tiles).toHaveLength(25);
    expect(engine.queryPath({ x: 0, y: 0 }, { x: 4, y: 4 }).at(-1)).toEqual({ x: 4, y: 4 });
  });
});
