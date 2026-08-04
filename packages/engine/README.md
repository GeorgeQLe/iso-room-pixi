# @iso-room/pixi

Framework-neutral PixiJS 8 renderer and command engine for
[`iso-room-schema`](https://github.com/GeorgeQLe/iso-room-schema).

```ts
import { IsoRoomPixiEngine } from "@iso-room/pixi";

const engine = new IsoRoomPixiEngine();
engine.setMode("build");
```

PixiJS is a peer dependency so applications control the renderer instance and
version. See the [project repository](https://github.com/GeorgeQLe/iso-room-pixi)
for editor examples, API scope, and performance targets.
