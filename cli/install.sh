#!/bin/sh
# CONSILIUM installer for macOS and Linux. Needs Node.js 20+.
#   curl -fsSL __SITE__/install.sh | sh
set -eu
SITE="${CONSIL_SITE:-__SITE__}"
DIR="$HOME/.consilium/bin"
BIN="$HOME/.local/bin"
command -v node >/dev/null 2>&1 || { echo "consil needs Node.js 20+ (https://nodejs.org)"; exit 1; }
MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$MAJOR" -ge 20 ] || { echo "consil needs Node.js 20+, found $(node -v)"; exit 1; }
mkdir -p "$DIR" "$BIN"
curl -fsSL "$SITE/dl/consil.mjs" -o "$DIR/consil.mjs"
printf '#!/bin/sh\nexec node "%s/consil.mjs" "$@"\n' "$DIR" > "$BIN/consil"
chmod +x "$BIN/consil"
echo "installed: $BIN/consil"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "add to PATH: export PATH=\"\$HOME/.local/bin:\$PATH\"";; esac
echo "try: consil council NVDA"
