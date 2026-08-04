# @iso-room/pixi

Framework-neutral PixiJS 8 renderer and command engine for
[`iso-room-schema`](https://github.com/GeorgeQLe/iso-room-schema).

```ts
import { IsoRoomPixiEngine } from "@iso-room/pixi";

const engine = new IsoRoomPixiEngine();
engine.setMode("build");
```

Register and preload sprite assets before mounting (or before the next render):

```ts
engine.registerCatalog(layout.assets);
await engine.preloadCatalog();
```

The engine owns the Pixi application and camera. Consumers can safely attach
persistent content to the exposed layers without deep imports:

```ts
const { world, staticLayer, entityLayer, overlayLayer, consumerLayer } =
  engine.getRendererSurfaces();

engine.setRenderPolicy({
  floors: false,
  walls: false,
  entityFilter: (entity) => entity.layer !== "gameplay",
});
engine.setCamera({ x: 20, y: 10, zoom: 1.5 });
```

Engine rerenders remove only engine-managed display objects. Consumer children
attached to the exposed layers, including `consumerLayer`, remain in place and
share the world's camera transform.

PixiJS is a peer dependency so applications control its version. See the
[project repository](https://github.com/GeorgeQLe/iso-room-pixi) for editor
examples, API scope, and performance targets.
