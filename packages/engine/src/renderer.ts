import { Application, Container, Graphics, Text } from "pixi.js";
import type { GridPoint, LayoutDocument } from "iso-room-schema";
import { gridToScreen, painterDepth } from "./projection.js";

export interface PixiRendererOptions {
  background?: number;
  antialias?: boolean;
  resolution?: number;
}

/** Sprite-native renderer with separate cached static and depth-sorted dynamic layers. */
export class PixiRoomRenderer {
  readonly app = new Application();
  readonly world = new Container();
  readonly staticLayer = new Container();
  readonly entityLayer = new Container();
  readonly overlayLayer = new Container();
  private layout?: LayoutDocument;
  private camera = { x: 0, y: 0, zoom: 1 };
  private mounted = false;

  async mount(host: HTMLElement, options: PixiRendererOptions = {}): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: options.background ?? 0x161a22,
      antialias: options.antialias ?? false,
      resolution: options.resolution ?? globalThis.devicePixelRatio ?? 1,
      autoDensity: true,
    });
    this.world.addChild(this.staticLayer, this.entityLayer, this.overlayLayer);
    this.app.stage.addChild(this.world);
    host.replaceChildren(this.app.canvas);
    this.mounted = true;
  }

  render(layout: LayoutDocument, selection: ReadonlySet<string> = new Set(), route: GridPoint[] = []): void {
    this.layout = layout;
    if (!this.mounted) return;
    this.staticLayer.removeChildren();
    this.entityLayer.removeChildren();
    this.overlayLayer.removeChildren();
    const projection = { tileWidth: layout.grid.tileWidth, tileHeight: layout.grid.tileHeight };
    for (const floor of layout.floors) for (const tile of floor.tiles) {
      const screen = gridToScreen(tile, projection);
      const diamond = new Graphics()
        .poly([
          screen.x, screen.y - layout.grid.tileHeight / 2,
          screen.x + layout.grid.tileWidth / 2, screen.y,
          screen.x, screen.y + layout.grid.tileHeight / 2,
          screen.x - layout.grid.tileWidth / 2, screen.y,
        ])
        .fill((tile.x + tile.y) % 2 ? 0x697d91 : 0x778da2)
        .stroke({ color: 0x344454, width: 2 });
      this.staticLayer.addChild(diamond);
    }
    for (const wall of layout.walls) {
      const screen = gridToScreen(wall.tile, projection);
      const northSouth = wall.direction === "north" || wall.direction === "south";
      const x = northSouth ? layout.grid.tileWidth / 2 : -layout.grid.tileWidth / 2;
      const y = northSouth ? 0 : 0;
      const wallGraphic = new Graphics()
        .moveTo(screen.x, screen.y)
        .lineTo(screen.x + x, screen.y - layout.grid.tileHeight / 2 + y)
        .stroke({ color: layout.openings.some((opening) => opening.wallId === wall.id) ? 0x51d6ca : 0xdde5ed, width: 8 });
      this.staticLayer.addChild(wallGraphic);
    }
    for (const entity of layout.entities) {
      const screen = gridToScreen(entity.position, projection);
      const container = new Container();
      container.label = entity.id;
      container.zIndex = painterDepth(entity.position, entity.elevation);
      container.position.set(screen.x, screen.y - entity.elevation);
      const body = new Graphics().rect(-32, -72, 64, 72)
        .fill(selection.has(entity.id) ? 0xffc857 : 0xde7d4a)
        .stroke({ color: 0x3b2418, width: 3 });
      const label = new Text({ text: entity.name, style: { fill: 0xffffff, fontSize: 12 } });
      label.anchor.set(0.5, 0); label.y = 8;
      container.addChild(body, label);
      this.entityLayer.addChild(container);
    }
    this.entityLayer.sortableChildren = true;
    this.entityLayer.sortChildren();
    for (const tile of route) {
      const screen = gridToScreen(tile, projection);
      this.overlayLayer.addChild(new Graphics().circle(screen.x, screen.y, 9).fill(0x51d6ca));
    }
    this.applyCamera();
  }

  setCamera(camera: Partial<{ x: number; y: number; zoom: number }>): void {
    this.camera = { ...this.camera, ...camera, zoom: Math.max(0.1, Math.min(8, camera.zoom ?? this.camera.zoom)) };
    this.applyCamera();
  }

  getCamera(): Readonly<typeof this.camera> { return this.camera; }
  rerender(selection: ReadonlySet<string>, route: GridPoint[]): void {
    if (this.layout) this.render(this.layout, selection, route);
  }
  destroy(): void {
    if (!this.mounted) return;
    this.app.destroy({ removeView: true }, { children: true, texture: true });
    this.mounted = false;
  }
  private applyCamera(): void {
    if (!this.mounted) return;
    this.world.position.set(
      this.app.screen.width / 2 + this.camera.x,
      this.app.screen.height / 5 + this.camera.y,
    );
    this.world.scale.set(this.camera.zoom);
  }
}
