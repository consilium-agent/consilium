// Docs and download pages: fill in this site's address and the build manifest.
document.querySelectorAll("[data-site]").forEach((el) => { el.textContent = location.origin; });
fetch("/dl/manifest.json").then((r) => r.json()).then((m) => {
  const ver = document.getElementById("ver");
  if (ver) ver.textContent = `v${m.version} · built ${m.built.slice(0, 10)}`;
  for (const f of m.files) {
    document.querySelectorAll(`[data-size="${f.name}"]`).forEach((el) => { el.textContent = `${(f.bytes / 1e6).toFixed(1)} MB`; });
    document.querySelectorAll(`[data-sha="${f.name}"]`).forEach((el) => { el.textContent = `sha256 ${f.sha256}`; });
  }
}).catch(() => {
  document.querySelectorAll("[data-sha]").forEach((el) => { el.textContent = "checksums in SHA256SUMS.txt"; });
});
