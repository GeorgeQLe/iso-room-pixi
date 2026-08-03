# iso-room-pixi

PixiJS 8 sprite-native renderer, renderer-independent command engine, and accessible
React editor for `iso-room-schema`.

Clone with `--recurse-submodules` until `iso-room-schema` is published to npm.

The engine API includes lifecycle, loading and canonical export, command history,
selection events, validation, coordinate transforms, catalog registration, deterministic
A* queries, camera control, and build/play switching. React is only required by
`@iso-room/pixi-editor-react`.

The default procedural catalog works offline. The documented 2:1 preset uses 256×128
tile diamonds, 256×512 object canvases, and a `(0.5, 0.875)` anchor. Static tiles are
isolated from dynamic entities for caching/chunking; entity depth is deterministic.

## Performance target

Profile a 128×128 fixture with 2,000 objects using browser Performance tools in a
production build. Record scripting, render, texture count, draw calls, and memory.
Prefer atlas batching, cached 16×16 static chunks, visibility culling, and incremental
depth updates. CI tests correctness and deterministic screenshots, not machine-specific FPS.

Optional CC0 importers are intentionally build-time only: pin an upstream archive URL
and SHA-256 in a local importer manifest, verify before extraction, and emit
`attribution.json`. Runtime hotlinks are forbidden.
