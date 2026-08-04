import { Application, Container, Graphics } from "pixi.js";
import type { GridPoint, LayoutDocument, PlacedEntity } from "iso-room-schema";
import { PixiSpriteCatalog } from "./catalog.js";
import { gridToScreen, painterDepth } from "./projection.js";

export interface PixiRendererOptions {
  background?: number;
  antialias?: boolean;
  resolution?: number;
}

export interface PixiRendererSurfaces {
  app: Application;
  world: Container;
  staticLayer: Container;
  entityLayer: Container;
  overlayLayer: Container;
  /** Persistent top-most layer owned entirely by the consumer. */
  consumerLayer: Container;
}

export interface PixiEntityRenderContext {
  catalog: PixiSpriteCatalog;
  selected: boolean;
}

export type PixiEntityFilter = (entity: Readonly<PlacedEntity>) => boolean;
export type PixiEntityRenderer = (
  entity: Readonly<PlacedEntity>,
  context: Readonly<PixiEntityRenderContext>,
) => Container | null | undefined;

export interface PixiRenderPolicy {
  floors: boolean;
  walls: boolean;
  entities: boolean;
  selections: boolean;
  routes: boolean;
  placeholders: boolean;
  entityFilter: PixiEntityFilter | null;
  /**
   * Return a display object to replace catalog rendering, null to suppress the
   * entity, or undefined to use the registered catalog asset.
   */
  entityRenderer: PixiEntityRenderer | null;
}

export const DEFAULT_PIXI_RENDER_POLICY: Readonly<PixiRenderPolicy> = {
  floors: true,
  walls: true,
  entities: true,
  selections: true,
  routes: true,
  placeholders: true,
  entityFilter: null,
  entityRenderer: null,
};

/** Sprite-native renderer with separate cached static and depth-sorted dynamic layers. */
export class PixiRoomRenderer {
  readonly app = new Application();
  readonly world = new Container();
  readonly staticLayer = new Container();
  readonly entityLayer = new Container();
  readonly overlayLayer = new Container();
  readonly consumerLayer = new Container();
  private layout?: LayoutDocument;
  private camera = { x: 0, y: 0, zoom: 1 };
  private policy: PixiRenderPolicy = { ...DEFAULT_PIXI_RENDER_POLICY };
  private managedStatic: Container[] = [];
  private managedEntities: Container[] = [];
  private managedOverlays: Container[] = [];
  private mounted = false;

  constructor(private readonly catalog: PixiSpriteCatalog = new PixiSpriteCatalog()) {
    this.world.addChild(this.staticLayer, this.entityLayer, this.overlayLayer, this.consumerLayer);
    this.app.stage.addChild(this.world);
    this.entityLayer.sortableChildren = true;
  }

  async mount(host: HTMLElement, options: PixiRendererOptions = {}): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: options.background ?? 0x161a22,
      antialias: options.antialias ?? false,
      resolution: options.resolution ?? globalThis.devicePixelRatio ?? 1,
      autoDensity: true,
    });
    host.replaceChildren(this.app.canvas);
    this.mounted = true;
    this.applyCamera();
  }

  render(layout: LayoutDocument, selection: ReadonlySet<string> = new Set(), route: GridPoint[] = []): void {
    this.layout = layout;
    this.removeManaged(this.managedStatic);
    this.removeManaged(this.managedEntities);
    this.removeManaged(this.managedOverlays);
    const projection = { tileWidth: layout.grid.tileWidth, tileHeight: layout.grid.tileHeight };
    if (this.policy.floors) {
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
        diamond.label = `floor:${floor.id}`;
        this.addManaged(this.staticLayer, this.managedStatic, diamond);
      }
    }
    if (this.policy.walls) {
      for (const wall of layout.walls) {
        const screen = gridToScreen(wall.tile, projection);
        const northSouth = wall.direction === "north" || wall.direction === "south";
        const x = northSouth ? layout.grid.tileWidth / 2 : -layout.grid.tileWidth / 2;
        const wallGraphic = new Graphics()
          .moveTo(screen.x, screen.y)
          .lineTo(screen.x + x, screen.y - layout.grid.tileHeight / 2)
          .stroke({ color: layout.openings.some((opening) => opening.wallId === wall.id) ? 0x51d6ca : 0xdde5ed, width: 8 });
        wallGraphic.label = `wall:${wall.id}`;
        this.addManaged(this.staticLayer, this.managedStatic, wallGraphic);
      }
    }
    if (this.policy.entities) {
      const entities = layout.entities
        .filter((entity) => this.policy.entityFilter?.(entity) ?? true);
      entities.sort((left, right) => {
        const depth = painterDepth(left.position, left.elevation) - painterDepth(right.position, right.elevation);
        return depth || left.id.localeCompare(right.id);
      });
      for (const entity of entities) {
        const screen = gridToScreen(entity.position, projection);
        const selected = selection.has(entity.id);
        const replacement = this.policy.entityRenderer?.(entity, { catalog: this.catalog, selected });
        const displayObject = replacement === undefined
          ? this.catalog.createDisplayObject(entity.assetId)
          : replacement;
        if (displayObject === null) continue;
        const container = new Container();
        container.label = entity.id;
        container.zIndex = painterDepth(entity.position, entity.elevation);
        container.position.set(screen.x, screen.y - entity.elevation);
        container.addChild(displayObject);
        this.addManaged(this.entityLayer, this.managedEntities, container);
        if (selected && this.policy.selections) {
          const marker = new Graphics()
            .ellipse(screen.x, screen.y - entity.elevation, layout.grid.tileWidth / 5, layout.grid.tileHeight / 5)
            .stroke({ color: 0xffc857, width: 4 });
          marker.label = `selection:${entity.id}`;
          this.addManaged(this.overlayLayer, this.managedOverlays, marker);
        }
      }
    }
    this.entityLayer.sortChildren();
    if (this.policy.routes && this.policy.placeholders) {
      for (const tile of route) {
        const screen = gridToScreen(tile, projection);
        const marker = new Graphics().circle(screen.x, screen.y, 9).fill(0x51d6ca);
        marker.label = "route-placeholder";
        this.addManaged(this.overlayLayer, this.managedOverlays, marker);
      }
    }
    this.applyCamera();
  }

  getSurfaces(): PixiRendererSurfaces {
    return {
      app: this.app,
      world: this.world,
      staticLayer: this.staticLayer,
      entityLayer: this.entityLayer,
      overlayLayer: this.overlayLayer,
      consumerLayer: this.consumerLayer,
    };
  }

  setRenderPolicy(policy: Partial<PixiRenderPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  getRenderPolicy(): Readonly<PixiRenderPolicy> { return { ...this.policy }; }

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

  private addManaged(parent: Container, collection: Container[], child: Container): void {
    collection.push(child);
    parent.addChild(child);
  }

  private removeManaged(collection: Container[]): void {
    for (const child of collection) child.removeFromParent();
    collection.length = 0;
  }

  private applyCamera(): void {
    this.world.position.set(
      (this.mounted ? this.app.screen.width / 2 : 0) + this.camera.x,
      (this.mounted ? this.app.screen.height / 5 : 0) + this.camera.y,
    );
    this.world.scale.set(this.camera.zoom);
  }
}
