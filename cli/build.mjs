// Builds every download into dist/:
//   consil.mjs                 single-file CLI (Node 20+), also used by install.sh
//   consil-win-x64.exe         standalone Windows app (Node SEA, no Node needed)
//   consil-win-x64.zip         the .exe + README
//   consil-node.zip            consil.mjs + launchers for macOS / Linux / Windows with Node
//   consil-cli-<v>.tgz         npm package: npm i -g <url>
//   SHA256SUMS.txt
// Usage: node cli/build.mjs [--api https://desk.example]   (the desk API baked into the builds)
import { build } from "esbuild";
import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync, readFileSync, copyFileSync, readdirSync, chmodSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const TMP = join(DIST, ".tmp");
const i = process.argv.indexOf("--api");
const API = (i > -1 ? process.argv[i + 1] : process.env.CONSIL_API_BAKE || "").replace(/\/$/, "");
const { VERSION } = await import("./src/consil.mjs");
const README = readFileSync(join(ROOT, "cli", "README.txt"), "utf8").replaceAll("__API__", API || "http://127.0.0.1:5120");

rmSync(DIST, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const bake = { "__CONSIL_API__": API || "__CONSIL_API__" };
const common = {
  entryPoints: [join(ROOT, "cli", "bin", "consil.mjs")],
  bundle: true, platform: "node", target: "node20", minify: false, legalComments: "none", logLevel: "warning",
};
const sub = (file) => {
  let s = readFileSync(file, "utf8");
  for (const [k, v] of Object.entries(bake)) s = s.replaceAll(`"${k}"`, JSON.stringify(v));
  writeFileSync(file, s);
};

// 1. ESM single file for Node users.
const mjs = join(DIST, "consil.mjs");
await build({ ...common, format: "esm", outfile: mjs, banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
sub(mjs);
chmodSync(mjs, 0o755);

// 2. CJS bundle for the Windows SEA (top-level await is not allowed there, so wrap the entry).
const seaEntry = join(TMP, "sea-entry.mjs");
writeFileSync(seaEntry, `import { main } from ${JSON.stringify(join(ROOT, "cli", "src", "consil.mjs").replace(/\\/g, "/"))};
main(process.argv.slice(2)).catch((err) => { console.error("  ! " + err.message); process.exitCode = 1; });
`);
const cjs = join(TMP, "consil.cjs");
await build({ ...common, entryPoints: [seaEntry], format: "cjs", outfile: cjs });
sub(cjs);

if (process.platform === "win32") {
  const cfg = join(TMP, "sea-config.json");
  const blob = join(TMP, "consil.blob");
  writeFileSync(cfg, JSON.stringify({ main: cjs, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false }));
  execFileSync(process.execPath, ["--experimental-sea-config", cfg], { stdio: "inherit" });
  const exe = join(DIST, "consil-win-x64.exe");
  copyFileSync(process.execPath, exe);
  const signtool = "C:/Program Files (x86)/Windows Kits/10/bin/x64/signtool.exe";
  if (existsSync(signtool)) execFileSync(signtool, ["remove", "/s", exe], { stdio: "ignore" });
  execFileSync(process.execPath, [join(ROOT, "node_modules", "postject", "dist", "cli.js"), exe, "NODE_SEA_BLOB", blob,
    "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"], { stdio: "inherit" });
  const winDir = join(TMP, "consil-win-x64");
  mkdirSync(winDir);
  copyFileSync(exe, join(winDir, "consil.exe"));
  writeFileSync(join(winDir, "README.txt"), README);
  writeFileSync(join(winDir, "Open CONSILIUM.cmd"), "@echo off\r\ncd /d \"%~dp0\"\r\nconsil.exe\r\npause\r\n");
  zip(winDir, join(DIST, "consil-win-x64.zip"));
}

// 3. Node zip for macOS / Linux / Windows with Node.
const nodeDir = join(TMP, "consil");
mkdirSync(nodeDir);
copyFileSync(mjs, join(nodeDir, "consil.mjs"));
writeFileSync(join(nodeDir, "consil"), '#!/bin/sh\nexec node "$(dirname "$0")/consil.mjs" "$@"\n');
chmodSync(join(nodeDir, "consil"), 0o755);
writeFileSync(join(nodeDir, "consil.cmd"), '@echo off\r\nnode "%~dp0consil.mjs" %*\r\n');
writeFileSync(join(nodeDir, "README.txt"), README);
zip(nodeDir, join(DIST, "consil-node.zip"));

// 4. npm package.
const pkgDir = join(TMP, "pkg");
mkdirSync(join(pkgDir, "bin"), { recursive: true });
copyFileSync(mjs, join(pkgDir, "bin", "consil.mjs"));
writeFileSync(join(pkgDir, "README.md"), README);
writeFileSync(join(pkgDir, "package.json"), JSON.stringify({
  name: "consilium-desk", version: VERSION, description: "CONSILIUM: four AI agents vote before every paper trade. Terminal desk for Robinhood Chain stock tokens.",
  type: "module", bin: { consil: "bin/consil.mjs" }, engines: { node: ">=20" }, license: "MIT", files: ["bin", "README.md"],
}, null, 2));
execSync(`npm pack --pack-destination "${DIST}"`, { cwd: pkgDir, stdio: "ignore" });
const tgz = readdirSync(DIST).find((f) => f.endsWith(".tgz"));
copyFileSync(join(DIST, tgz), join(DIST, "consil-cli.tgz"));
rmSync(join(DIST, tgz));

rmSync(TMP, { recursive: true, force: true });

// 5. checksums + manifest for the download page.
const files = readdirSync(DIST).filter((f) => !f.startsWith("."));
const manifest = { version: VERSION, api: API || null, built: new Date().toISOString(), files: [] };
const lines = [];
for (const f of files.sort()) {
  const data = readFileSync(join(DIST, f));
  const sha = createHash("sha256").update(data).digest("hex");
  lines.push(`${sha}  ${f}`);
  manifest.files.push({ name: f, bytes: data.length, sha256: sha });
}
writeFileSync(join(DIST, "SHA256SUMS.txt"), lines.join("\n") + "\n");
writeFileSync(join(DIST, "manifest.json"), JSON.stringify(manifest, null, 2));
for (const f of manifest.files) console.log(`${(f.bytes / 1e6).toFixed(1).padStart(6)} MB  ${f.name}`);

function zip(dir, out) {
  if (process.platform === "win32") {
    execFileSync("powershell.exe", ["-NoProfile", "-Command", `Compress-Archive -Path '${dir}' -DestinationPath '${out}' -Force`], { stdio: "inherit" });
  } else {
    execFileSync("zip", ["-qr", out, "."], { cwd: dir });
  }
}
