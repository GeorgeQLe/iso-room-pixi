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
  register(definitions: readonly AssetDefinition[]): void {
    definitions.forEach((definition) => this.definitions.set(definition.id, structuredClone(definition)));
  }
  async preload(ids: readonly string[] = [...this.definitions.keys()]): Promise<void> {
    for (const id of ids) {
      const definition = this.definitions.get(id);
      if (!definition?.source) continue;
      this.textures.set(id, await Assets.load<Texture>(definition.source));
    }
  }
  createDisplayObject(id: string): Sprite | AnimatedSprite {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Unknown sprite asset '${id}'`);
    const extension = definition.extensions?.["pixi.iso-room"] as PixiAssetExtension | undefined;
    if (extension?.frames?.length) {
      const sprite = new AnimatedSprite(extension.frames.map((frame) => Texture.from(frame)));
      sprite.animationSpeed = extension.animationSpeed ?? 0.1; sprite.play(); return sprite;
    }
    const sprite = new Sprite(this.textures.get(id) ?? Texture.WHITE);
    sprite.anchor.set(definition.anchors?.x ?? 0.5, definition.anchors?.y ?? 1);
    return sprite;
  }
}
