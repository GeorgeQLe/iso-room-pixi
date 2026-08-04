# @iso-room/pixi-editor-react

Accessible React editor bindings for
[`@iso-room/pixi`](https://github.com/GeorgeQLe/iso-room-pixi/tree/main/packages/engine).

```tsx
import { IsoRoomEditor } from "@iso-room/pixi-editor-react";
import type { LayoutDocument } from "iso-room-schema";

export function RoomEditor({ layout }: { layout: LayoutDocument }) {
  return <IsoRoomEditor initialLayout={layout} />;
}
```

React is a peer dependency. The engine and schema are installed as runtime
dependencies.
