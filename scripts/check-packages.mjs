import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const renderer = basename(root).endsWith("pixi")
  ? {
      engineName: "@iso-room/pixi",
      editorName: "@iso-room/pixi-editor-react",
      engineVersion: "1.0.0-rc.2",
      editorVersion: "1.0.0-rc.1",
      peerName: "pixi.js",
      peerVersion: "8.12.0",
      engineExport: "IsoRoomPixiEngine",
      editorExport: "IsoRoomEditor",
    }
  : {
      engineName: "@iso-room/three",
      editorName: "@iso-room/three-editor-react",
      engineVersion: "1.0.0-rc.1",
      editorVersion: "1.0.0-rc.1",
      peerName: "three",
      peerVersion: "0.179.1",
      engineExport: "IsoRoomThreeEngine",
      editorExport: "IsoRoomThreeEditor",
    };
const outputFlag = process.argv.indexOf("--output");
const schemaFlag = process.argv.indexOf("--schema-tarball");
const persistentOutput =
  outputFlag === -1 ? undefined : resolve(root, process.argv[outputFlag + 1]);
const providedSchemaTarball =
  schemaFlag === -1 ? undefined : resolve(root, process.argv[schemaFlag + 1]);
const scratch = await mkdtemp(join(tmpdir(), "iso-room-renderer-pack-"));
const artifactDir = persistentOutput ?? join(scratch, "artifacts");
const consumerDir = join(scratch, "consumer");

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

async function packPackage(directory) {
  const before = new Set(
    (await readdir(artifactDir)).filter((name) => name.endsWith(".tgz")),
  );
  run("pnpm", ["pack", "--pack-destination", artifactDir], directory);
  const created = (await readdir(artifactDir)).filter(
    (name) => name.endsWith(".tgz") && !before.has(name),
  );
  if (created.length !== 1) {
    throw new Error(`expected one tarball from ${directory}`);
  }
  return join(artifactDir, created[0]);
}

function inspectTarball(tarball, requiredFiles, expectedVersion = "1.0.0-rc.1") {
  const listing = spawnSync("tar", ["-tzf", tarball], {
    encoding: "utf8",
  });
  if (listing.status !== 0) throw new Error(`unable to inspect ${tarball}`);
  const packedFiles = new Set(listing.stdout.trim().split("\n"));
  for (const required of requiredFiles) {
    if (!packedFiles.has(required)) {
      throw new Error(`${basename(tarball)} is missing ${required}`);
    }
  }

  const manifestResult = spawnSync(
    "tar",
    ["-xOf", tarball, "package/package.json"],
    { encoding: "utf8" },
  );
  if (manifestResult.status !== 0) {
    throw new Error(`unable to read the manifest from ${tarball}`);
  }
  const manifest = JSON.parse(manifestResult.stdout);
  if (manifest.version !== expectedVersion) {
    throw new Error(`${manifest.name} has unexpected version ${manifest.version}`);
  }
  if (JSON.stringify(manifest).includes("workspace:")) {
    throw new Error(`${manifest.name} contains an unpublished workspace range`);
  }
  return manifest;
}

try {
  await mkdir(artifactDir, { recursive: true });
  await mkdir(consumerDir, { recursive: true });

  if (!providedSchemaTarball) {
    run("pnpm", ["--filter", "iso-room-schema", "build"]);
  }
  run("pnpm", ["--filter", "./packages/**", "build"]);

  const schemaTarball =
    providedSchemaTarball ??
    (await packPackage(join(root, "iso-room-schema")));
  const engineTarball = await packPackage(join(root, "packages/engine"));
  const editorTarball = await packPackage(join(root, "packages/editor-react"));

  inspectTarball(schemaTarball, [
    "package/package.json",
    "package/README.md",
    "package/LICENSE",
    "package/dist/index.js",
    "package/dist/index.d.ts",
  ]);
  const engineManifest = inspectTarball(engineTarball, [
    "package/package.json",
    "package/README.md",
    "package/LICENSE",
    "package/dist/index.js",
    "package/dist/index.d.ts",
  ], renderer.engineVersion);
  const editorManifest = inspectTarball(editorTarball, [
    "package/package.json",
    "package/README.md",
    "package/LICENSE",
    "package/dist/index.js",
    "package/dist/index.d.ts",
  ], renderer.editorVersion);

  if (engineManifest.dependencies?.["iso-room-schema"] !== "^1.0.0-rc.1") {
    throw new Error(`${renderer.engineName} has an invalid schema range`);
  }
  if (engineManifest.peerDependencies?.[renderer.peerName] === undefined) {
    throw new Error(`${renderer.engineName} is missing its renderer peer`);
  }
  if (editorManifest.dependencies?.[renderer.engineName] !== `^${renderer.engineVersion}`) {
    throw new Error(`${renderer.editorName} has an invalid engine range`);
  }
  if (editorManifest.peerDependencies?.react === undefined) {
    throw new Error(`${renderer.editorName} is missing its React peer`);
  }

  await writeFile(
    join(consumerDir, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: {
          "iso-room-schema": `file:${schemaTarball}`,
          [renderer.engineName]: `file:${engineTarball}`,
          [renderer.editorName]: `file:${editorTarball}`,
          [renderer.peerName]: renderer.peerVersion,
          react: "19.1.1",
        },
        devDependencies: {
          "@types/react": "19.1.9",
          typescript: "5.8.3",
        },
        pnpm: {
          overrides: {
            "iso-room-schema": `file:${schemaTarball}`,
            [renderer.engineName]: `file:${engineTarball}`,
          },
        },
      },
      null,
      2,
    ),
  );
  const runtimeSmoke = renderer.engineName === "@iso-room/pixi"
    ? `import {
  IsoRoomPixiEngine,
  createEmptyLayout,
} from "@iso-room/pixi";
import { AnimatedSprite, Assets, Container, Texture } from "pixi.js";
import { IsoRoomEditor } from "@iso-room/pixi-editor-react";
import { SCHEMA_VERSION } from "iso-room-schema";

if (typeof IsoRoomPixiEngine !== "function") throw new Error("engine export missing");
if (typeof IsoRoomEditor !== "function") throw new Error("editor export missing");
if (SCHEMA_VERSION !== "1.0.0") throw new Error("schema runtime missing");

const layout = createEmptyLayout(3, 3);
layout.walls.push({
  id: "wall.one",
  roomId: "room.main",
  tile: { x: 0, y: 0 },
  direction: "north",
});
layout.assets = [
  {
    id: "sprite.alpha",
    name: "Alpha",
    kind: "sprite",
    source: "packed-alpha",
    footprint: { width: 1, height: 1 },
    anchors: { x: 0.2, y: 0.8 },
  },
  {
    id: "sprite.beta",
    name: "Beta",
    kind: "sprite",
    footprint: { width: 1, height: 1 },
    anchors: { x: 0.75, y: 0.25 },
    extensions: {
      "pixi.iso-room": {
        frames: ["packed-beta-1", "packed-beta-2"],
        animationSpeed: 0.2,
      },
    },
  },
];
layout.entities = [
  {
    id: "entity.beta",
    name: "Beta",
    assetId: "sprite.beta",
    roomId: "room.main",
    position: { x: 1, y: 0 },
    footprint: { width: 1, height: 1 },
    rotation: 0,
    elevation: 0,
    collision: false,
  },
  {
    id: "entity.alpha",
    name: "Alpha",
    assetId: "sprite.alpha",
    roomId: "room.main",
    position: { x: 0, y: 0 },
    footprint: { width: 1, height: 1 },
    rotation: 0,
    elevation: 0,
    collision: false,
  },
];

const alphaTexture = new Texture();
const betaTexture1 = new Texture();
const betaTexture2 = new Texture();
Assets.cache.set("packed-alpha", alphaTexture);
Assets.cache.set("packed-beta-1", betaTexture1);
Assets.cache.set("packed-beta-2", betaTexture2);

const engine = new IsoRoomPixiEngine(layout);
engine.registerCatalog(layout.assets);
await engine.preloadCatalog();
const surfaces = engine.getRendererSurfaces();
const entityIds = surfaces.entityLayer.children.map((child) => child.label);
if (entityIds.join(",") !== "entity.alpha,entity.beta") {
  throw new Error(\`non-deterministic painter order: \${entityIds.join(",")}\`);
}
const alpha = surfaces.entityLayer.children[0]?.children[0];
const beta = surfaces.entityLayer.children[1]?.children[0];
if (alpha?.texture !== alphaTexture || beta?.textures?.[0] !== betaTexture1) {
  throw new Error("catalog entities did not use distinct declared textures");
}
if (alpha.anchor.x !== 0.2 || alpha.anchor.y !== 0.8) {
  throw new Error("static sprite anchor was not applied");
}
if (!(beta instanceof AnimatedSprite) || beta.anchor.x !== 0.75 || beta.anchor.y !== 0.25) {
  throw new Error("animated sprite anchor was not applied");
}

const bakedFloor = new Container({ label: "consumer-baked-floor" });
const consumerOverlay = new Container({ label: "consumer-overlay" });
const persistentOverlay = new Container({ label: "persistent-overlay" });
surfaces.staticLayer.addChild(bakedFloor);
surfaces.overlayLayer.addChild(consumerOverlay);
surfaces.consumerLayer.addChild(persistentOverlay);
engine.select(["entity.alpha"]);
engine.setRenderPolicy({
  floors: false,
  walls: false,
  selections: false,
  placeholders: false,
});
engine.queryPath({ x: 0, y: 0 }, { x: 1, y: 0 });
if (surfaces.staticLayer.children.length !== 1 || surfaces.staticLayer.children[0] !== bakedFloor) {
  throw new Error("disabled floors/walls rendered or baked floor was cleared");
}
if (surfaces.overlayLayer.children.length !== 1 || surfaces.overlayLayer.children[0] !== consumerOverlay) {
  throw new Error("placeholder rendered or consumer overlay was cleared");
}
if (surfaces.consumerLayer.children[0] !== persistentOverlay) {
  throw new Error("persistent consumer layer was cleared");
}

engine.setRenderPolicy({ entityFilter: (entity) => entity.id !== "entity.beta" });
if (surfaces.entityLayer.children.some((child) => child.label === "entity.beta")) {
  throw new Error("entity filter was not applied");
}
engine.setCamera({ x: 12, y: -8, zoom: 1.5 });
if (
  surfaces.world.position.x !== 12
  || surfaces.world.position.y !== -8
  || surfaces.world.scale.x !== 1.5
  || surfaces.entityLayer.parent !== surfaces.world
  || surfaces.consumerLayer.parent !== surfaces.world
) {
  throw new Error("camera did not transform engine and consumer layers together");
}
`
    : `import { ${renderer.engineExport} } from "${renderer.engineName}";
import { ${renderer.editorExport} } from "${renderer.editorName}";
import { SCHEMA_VERSION } from "iso-room-schema";

if (typeof ${renderer.engineExport} !== "function") throw new Error("engine export missing");
if (typeof ${renderer.editorExport} !== "function") throw new Error("editor export missing");
if (SCHEMA_VERSION !== "1.0.0") throw new Error("schema runtime missing");
`;
  await writeFile(
    join(consumerDir, "smoke.mjs"),
    runtimeSmoke,
  );
  await writeFile(
    join(consumerDir, "smoke.ts"),
    `import {
  ${renderer.engineExport}${renderer.engineName === "@iso-room/pixi" ? `,
  type PixiRendererSurfaces,
  type PixiRenderPolicy` : ""}
} from "${renderer.engineName}";
import { ${renderer.editorExport} } from "${renderer.editorName}";
import type { LayoutDocument } from "iso-room-schema";

const Engine: typeof ${renderer.engineExport} = ${renderer.engineExport};
const Editor: typeof ${renderer.editorExport} = ${renderer.editorExport};
const document = {} as LayoutDocument;
${renderer.engineName === "@iso-room/pixi" ? `const surfaces: PixiRendererSurfaces = new Engine().getRendererSurfaces();
const policy: Partial<PixiRenderPolicy> = { floors: false, entities: true };
new Engine().setRenderPolicy(policy);
void surfaces;
void policy;` : ""}
void Engine;
void Editor;
void document;
`,
  );

  run("pnpm", ["install", "--ignore-scripts"], consumerDir);
  run("node", ["smoke.mjs"], consumerDir);
  run(
    "pnpm",
    [
      "exec",
      "tsc",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "--strict",
      "--skipLibCheck",
      "--noEmit",
      "smoke.ts",
    ],
    consumerDir,
  );

  console.log(
    `validated ${engineManifest.name}@${engineManifest.version} and ${editorManifest.name}@${editorManifest.version}`,
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
