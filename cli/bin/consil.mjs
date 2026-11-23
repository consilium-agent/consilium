#!/usr/bin/env node
// Entry point: checks the Node version before loading anything that needs fetch.
const [major] = process.versions.node.split(".").map(Number);
if (major < 20) {
  console.error(`  ! consil needs Node.js 20 or newer (found ${process.versions.node}). https://nodejs.org`);
  process.exit(1);
}
const { main } = await import("../src/consil.mjs");
main(process.argv.slice(2)).catch((err) => {
  console.error(`  ! ${err.message}`);
  process.exitCode = 1;
});
