import { AnimatedSprite, Assets, Sprite, Texture } from "pixi.js";
import type { AssetDefinition } from "iso-room-schema";

export interface PixiAssetExtension {
  texture?: string;
  frames?: string[];
  animationSpeed?: number;
  pixelPerfect?: boolean;
}

/** Build-time/runtime-local sprite catalog supporting textures and animated atlas frames. */
export class PixiSpriteCatalog {
  private readonly definitions = new Map<string, AssetDefinition>();
  private readonly textures = new Map<string, Texture>();
  private readonly animationTextures = new Map<string, Texture[]>();

  register(definitions: readonly AssetDefinition[]): void {
    definitions.forEach((definition) => this.definitions.set(definition.id, structuredClone(definition)));
  }

  getDefinitions(): AssetDefinition[] {
    return [...this.definitions.values()].map((definition) => structuredClone(definition));
  }

  async preload(ids: readonly string[] = [...this.definitions.keys()]): Promise<void> {
    for (const id of ids) {
      const definition = this.definitions.get(id);
      if (!definition) continue;
      const extension = definition.extensions?.["pixi.iso-room"] as PixiAssetExtension | undefined;
      if (extension?.frames?.length) {
        const textures: Texture[] = [];
        for (const frame of extension.frames) {
          textures.push(
            Assets.cache.has(frame)
              ? Assets.cache.get<Texture>(frame)
              : await Assets.load<Texture>(frame),
          );
        }
        this.animationTextures.set(id, textures);
        continue;
      }
      const source = extension?.texture ?? definition.source;
      if (source) {
        this.textures.set(
          id,
          Assets.cache.has(source)
            ? Assets.cache.get<Texture>(source)
            : await Assets.load<Texture>(source),
        );
      }
    }
  }

  createDisplayObject(id: string): Sprite | AnimatedSprite {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Unknown sprite asset '${id}'`);
    const extension = definition.extensions?.["pixi.iso-room"] as PixiAssetExtension | undefined;
    if (extension?.frames?.length) {
      const sprite = new AnimatedSprite(
        this.animationTextures.get(id) ?? extension.frames.map((frame) =>
          Assets.cache.has(frame) ? Assets.cache.get<Texture>(frame) : Texture.WHITE,
        ),
      );
      sprite.animationSpeed = extension.animationSpeed ?? 0.1;
      sprite.anchor.set(definition.anchors?.x ?? 0.5, definition.anchors?.y ?? 1);
      sprite.label = `asset:${id}`;
      if (typeof globalThis.requestAnimationFrame === "function") sprite.play();
      return sprite;
    }
    const source = extension?.texture ?? definition.source;
    const texture = this.textures.get(id)
      ?? (source && Assets.cache.has(source) ? Assets.cache.get<Texture>(source) : undefined)
      ?? Texture.WHITE;
    const sprite = new Sprite(texture);
    sprite.anchor.set(definition.anchors?.x ?? 0.5, definition.anchors?.y ?? 1);
    sprite.label = `asset:${id}`;
    return sprite;
  }
}
