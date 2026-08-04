import {
  parseLayout, serializeCanonical, validateLayout,
  type AssetDefinition, type GridPoint, type LayoutDocument, type ValidationResult,
} from "iso-room-schema";
import { applyCommand, type EditCommand } from "./commands.js";
import { createEmptyLayout } from "./layout.js";
import { findPath } from "./navigation.js";
import { gridToScreen, screenToGrid, type ProjectionOptions, type ScreenPoint } from "./projection.js";
import { PixiSpriteCatalog } from "./catalog.js";
import {
  PixiRoomRenderer,
  type PixiRendererOptions,
  type PixiRendererSurfaces,
  type PixiRenderPolicy,
} from "./renderer.js";

export type EngineMode = "build" | "play";
export type EngineEvent =
  | { type: "layout"; layout: LayoutDocument }
  | { type: "selection"; ids: string[] }
  | { type: "mode"; mode: EngineMode }
  | { type: "validation"; result: ValidationResult };
export type EngineListener = (event: EngineEvent) => void;

export interface CreateEngineOptions extends PixiRendererOptions {
  host?: HTMLElement;
  layout?: LayoutDocument;
}

export class IsoRoomPixiEngine {
  private layout: LayoutDocument;
  private readonly catalog = new PixiSpriteCatalog();
  private readonly renderer = new PixiRoomRenderer(this.catalog);
  private readonly listeners = new Set<EngineListener>();
  private history: LayoutDocument[] = [];
  private future: LayoutDocument[] = [];
  private selection = new Set<string>();
  private route: GridPoint[] = [];
  private mode: EngineMode = "build";

  constructor(layout: LayoutDocument = createEmptyLayout()) {
    this.layout = structuredClone(layout);
    this.catalog.register(this.layout.assets);
  }
  async mount(host: HTMLElement, options?: PixiRendererOptions): Promise<void> {
    await this.renderer.mount(host, options);
    this.render();
  }
  destroy(): void { this.listeners.clear(); this.renderer.destroy(); }
  subscribe(listener: EngineListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  getLayout(): LayoutDocument { return structuredClone(this.layout); }
  loadLayout(input: string | LayoutDocument): ValidationResult {
    const parsed = parseLayout(input);
    if (!parsed.success || !parsed.document) return parsed.validation;
    this.history = []; this.future = []; this.layout = parsed.document; this.selection.clear();
    this.catalog.register(this.layout.assets);
    this.render();
    this.emit({ type: "selection", ids: [] });
    this.emit({ type: "layout", layout: this.getLayout() });
    return parsed.validation;
  }
  exportLayout(): LayoutDocument { return this.getLayout(); }
  exportJSON(): string { return serializeCanonical(this.layout); }
  execute(command: EditCommand): ValidationResult {
    if (this.mode !== "build") throw new Error("Editing commands are disabled in play mode");
    this.history.push(this.getLayout()); this.future = [];
    this.layout = applyCommand(this.layout, command);
    this.reconcileSelection();
    const result = this.validate(); this.render(); this.emit({ type: "layout", layout: this.getLayout() });
    return result;
  }
  undo(): boolean {
    const previous = this.history.pop(); if (!previous) return false;
    this.future.push(this.getLayout()); this.layout = previous; this.reconcileSelection(); this.render(); this.emit({ type: "layout", layout: this.getLayout() }); return true;
  }
  redo(): boolean {
    const next = this.future.pop(); if (!next) return false;
    this.history.push(this.getLayout()); this.layout = next; this.reconcileSelection(); this.render(); this.emit({ type: "layout", layout: this.getLayout() }); return true;
  }
  canUndo(): boolean { return this.history.length > 0; }
  canRedo(): boolean { return this.future.length > 0; }
  select(ids: string[], additive = false): void {
    if (!additive) this.selection.clear();
    ids.forEach((id) => this.selection.add(id)); this.render(); this.emit({ type: "selection", ids: [...this.selection] });
  }
  getSelection(): string[] { return [...this.selection]; }
  validate(): ValidationResult { const result = validateLayout(this.layout); this.emit({ type: "validation", result }); return result; }
  registerCatalog(assets: readonly AssetDefinition[]): void {
    this.catalog.register(assets);
    this.render();
  }
  async preloadCatalog(ids?: readonly string[]): Promise<void> {
    await this.catalog.preload(ids);
    this.render();
  }
  getCatalog(): AssetDefinition[] { return this.catalog.getDefinitions(); }
  queryPath(start: GridPoint, goal: GridPoint): GridPoint[] { this.route = findPath(this.layout, start, goal); this.render(); return [...this.route]; }
  setMode(mode: EngineMode): ValidationResult {
    const result = this.validate();
    if (mode === "play" && !result.valid) return result;
    this.mode = mode; this.emit({ type: "mode", mode }); return result;
  }
  getMode(): EngineMode { return this.mode; }
  gridToScreen(point: GridPoint): ScreenPoint { return gridToScreen(point, this.projection()); }
  screenToGrid(point: ScreenPoint, snap = true): GridPoint { return screenToGrid(point, this.projection(), snap); }
  getRendererSurfaces(): PixiRendererSurfaces { return this.renderer.getSurfaces(); }
  setRenderPolicy(policy: Partial<PixiRenderPolicy>): void {
    this.renderer.setRenderPolicy(policy);
    this.render();
  }
  getRenderPolicy(): Readonly<PixiRenderPolicy> { return this.renderer.getRenderPolicy(); }
  setCamera(camera: Partial<{ x: number; y: number; zoom: number }>): void { this.renderer.setCamera(camera); }
  getCamera(): Readonly<{ x: number; y: number; zoom: number }> { return this.renderer.getCamera(); }
  private projection(): ProjectionOptions { return { tileWidth: this.layout.grid.tileWidth, tileHeight: this.layout.grid.tileHeight }; }
  private reconcileSelection(): void {
    const entityIds = new Set(this.layout.entities.map((entity) => entity.id));
    const ids = [...this.selection].filter((id) => entityIds.has(id));
    if (ids.length === this.selection.size) return;
    this.selection = new Set(ids); this.emit({ type: "selection", ids });
  }
  private render(): void { this.renderer.render(this.layout, this.selection, this.route); }
  private emit(event: EngineEvent): void { this.listeners.forEach((listener) => listener(event)); }
}

export async function createEngine(options: CreateEngineOptions = {}): Promise<IsoRoomPixiEngine> {
  const engine = new IsoRoomPixiEngine(options.layout);
  if (options.host) await engine.mount(options.host, options);
  return engine;
}
