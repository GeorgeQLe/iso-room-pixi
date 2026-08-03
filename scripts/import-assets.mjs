import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Usage: pnpm import-assets ./assets.pinned.json");
const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
if (!/^https:\/\//.test(manifest.url) || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
  throw new Error("Manifest must pin an HTTPS url and lowercase 64-character sha256");
}
const response = await fetch(manifest.url);
if (!response.ok) throw new Error(`Asset download failed: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const actual = createHash("sha256").update(bytes).digest("hex");
if (actual !== manifest.sha256) throw new Error(`Checksum mismatch: expected ${manifest.sha256}, received ${actual}`);
const target = resolve("assets/imported", manifest.id);
await mkdir(target, { recursive: true });
await writeFile(resolve(target, basename(new URL(manifest.url).pathname) || "archive.bin"), bytes);
await writeFile(resolve(target, "attribution.json"), `${JSON.stringify({
  id: manifest.id, title: manifest.title, author: manifest.author, license: manifest.license,
  source: manifest.url, sha256: manifest.sha256, importedAt: new Date().toISOString(),
}, null, 2)}\n`);
console.log(`Verified and stored ${manifest.id} in ${target}`);
