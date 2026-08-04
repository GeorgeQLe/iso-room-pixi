import { describe, expect, it } from "vitest";
import { AnimatedSprite, Assets, Container, Texture } from "pixi.js";
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

  it("renders registered textures and anchors in deterministic painter order", async () => {
    const layout = createEmptyLayout(3, 3);
    layout.assets = [
      {
        id: "sprite.alpha", name: "Alpha", kind: "sprite", source: "test-alpha",
        footprint: { width: 1, height: 1 }, anchors: { x: 0.2, y: 0.8 },
      },
      {
        id: "sprite.beta", name: "Beta", kind: "sprite", footprint: { width: 1, height: 1 },
        anchors: { x: 0.75, y: 0.25 },
        extensions: { "pixi.iso-room": { frames: ["test-beta-1", "test-beta-2"] } },
      },
    ];
    layout.entities = [
      {
        id: "entity.beta", name: "Beta", assetId: "sprite.beta", roomId: "room.main",
        position: { x: 1, y: 0 }, footprint: { width: 1, height: 1 }, rotation: 0,
        elevation: 0, collision: false,
      },
      {
        id: "entity.alpha", name: "Alpha", assetId: "sprite.alpha", roomId: "room.main",
        position: { x: 0, y: 0 }, footprint: { width: 1, height: 1 }, rotation: 0,
        elevation: 0, collision: false,
      },
    ];
    const alphaTexture = new Texture();
    const betaTexture1 = new Texture();
    const betaTexture2 = new Texture();
    Assets.cache.set("test-alpha", alphaTexture);
    Assets.cache.set("test-beta-1", betaTexture1);
    Assets.cache.set("test-beta-2", betaTexture2);

    const engine = new IsoRoomPixiEngine(layout);
    engine.registerCatalog(layout.assets);
    await engine.preloadCatalog();
    const { entityLayer } = engine.getRendererSurfaces();
    expect(entityLayer.children.map((child) => child.label))
      .toEqual(["entity.alpha", "entity.beta"]);
    expect(entityLayer.children[0]?.children[0]).toMatchObject({
      texture: alphaTexture,
      anchor: { x: 0.2, y: 0.8 },
    });
    expect(entityLayer.children[1]?.children[0]).toBeInstanceOf(AnimatedSprite);
    expect(entityLayer.children[1]?.children[0]?.anchor).toMatchObject({ x: 0.75, y: 0.25 });
  });

  it("applies render policy without removing consumer-owned layers", () => {
    const layout = createEmptyLayout(2, 2);
    layout.walls.push({
      id: "wall.one", roomId: "room.main", tile: { x: 0, y: 0 }, direction: "north",
    });
    layout.entities.push({
      id: "entity.one", name: "One", assetId: "procedural.crate", roomId: "room.main",
      position: { x: 0, y: 0 }, footprint: { width: 1, height: 1 }, rotation: 0,
      elevation: 0, collision: false,
    });
    const engine = new IsoRoomPixiEngine(layout);
    engine.registerCatalog(layout.assets);
    const surfaces = engine.getRendererSurfaces();
    const bakedFloor = new Container({ label: "consumer-baked-floor" });
    const overlay = new Container({ label: "consumer-overlay" });
    surfaces.staticLayer.addChild(bakedFloor);
    surfaces.overlayLayer.addChild(overlay);

    engine.select(["entity.one"]);
    engine.setRenderPolicy({
      floors: false,
      walls: false,
      selections: false,
      placeholders: false,
    });
    engine.queryPath({ x: 0, y: 0 }, { x: 1, y: 0 });

    expect(surfaces.staticLayer.children).toEqual([bakedFloor]);
    expect(surfaces.overlayLayer.children).toEqual([overlay]);
    engine.setCamera({ x: 15, y: -4, zoom: 2 });
    expect(surfaces.world.position).toMatchObject({ x: 15, y: -4 });
    expect(surfaces.world.scale).toMatchObject({ x: 2, y: 2 });
    expect(surfaces.consumerLayer.parent).toBe(surfaces.world);
  });
});
