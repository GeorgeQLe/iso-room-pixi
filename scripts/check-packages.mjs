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
      peerName: "pixi.js",
      peerVersion: "8.12.0",
      engineExport: "IsoRoomPixiEngine",
      editorExport: "IsoRoomEditor",
    }
  : {
      engineName: "@iso-room/three",
      editorName: "@iso-room/three-editor-react",
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

function inspectTarball(tarball, requiredFiles) {
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
  if (manifest.version !== "1.0.0-rc.1") {
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
  ]);
  const editorManifest = inspectTarball(editorTarball, [
    "package/package.json",
    "package/README.md",
    "package/LICENSE",
    "package/dist/index.js",
    "package/dist/index.d.ts",
  ]);

  if (engineManifest.dependencies?.["iso-room-schema"] !== "^1.0.0-rc.1") {
    throw new Error(`${renderer.engineName} has an invalid schema range`);
  }
  if (engineManifest.peerDependencies?.[renderer.peerName] === undefined) {
    throw new Error(`${renderer.engineName} is missing its renderer peer`);
  }
  if (editorManifest.dependencies?.[renderer.engineName] !== "^1.0.0-rc.1") {
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
  await writeFile(
    join(consumerDir, "smoke.mjs"),
    `import { ${renderer.engineExport} } from "${renderer.engineName}";
import { ${renderer.editorExport} } from "${renderer.editorName}";
import { SCHEMA_VERSION } from "iso-room-schema";

if (typeof ${renderer.engineExport} !== "function") throw new Error("engine export missing");
if (typeof ${renderer.editorExport} !== "function") throw new Error("editor export missing");
if (SCHEMA_VERSION !== "1.0.0") throw new Error("schema runtime missing");
`,
  );
  await writeFile(
    join(consumerDir, "smoke.ts"),
    `import { ${renderer.engineExport} } from "${renderer.engineName}";
import { ${renderer.editorExport} } from "${renderer.editorName}";
import type { LayoutDocument } from "iso-room-schema";

const Engine: typeof ${renderer.engineExport} = ${renderer.engineExport};
const Editor: typeof ${renderer.editorExport} = ${renderer.editorExport};
const document = {} as LayoutDocument;
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
