# Builds docs.html, download.html and 404.html from the homepage shell (head + logo).
import json, re, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
idx = (WEB / "index.html").read_text(encoding="utf-8")
head = idx[: idx.index("</head>")]
mark = re.search(r'<svg class="mark".*?</svg>', idx, re.S).group(0)


def header(cur):
    links = [("/app", "Web desk"), ("/docs", "Docs"), ("/download", "Download"), ("/#council", "Council"), ("/#api", "API")]
    nav = "".join(f'<a href="{h}"' + (' aria-current="page"' if h == cur else "") + f">{t}</a>" for h, t in links)
    return f'''<a class="skip" href="#main">Skip to content</a>
<div class="topbar" role="region" aria-label="Token"><span class="tb-tick">$CONSIL</span><code class="tb-ca" data-ca>CA soon</code><button type="button" class="tb-btn" data-copy-ca>Copy CA</button><a class="tb-btn hot" data-social="pons" href="#token">Buy on Pons ↗</a><a class="tb-link" data-social="x" href="#token">X ↗</a><a class="tb-link" data-social="github" href="#token">GitHub ↗</a></div>
<header class="hd">
  <div class="wrap">
    <a class="logo" href="/" aria-label="CONSILIUM home">{mark}<span class="rule"></span><span class="word"><b>CONSILIUM</b><i>AGENT DESK</i></span></a>
    <nav class="nav" id="nav" aria-label="Main">{nav}</nav>
    <div class="act">
      <a class="ico" data-social="x" href="#token" aria-label="CONSILIUM on X"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L2.8 2h6.4l4.4 5.9L18.9 2Zm-1.1 18h1.7L7.3 3.9H5.5L17.8 20Z"/></svg></a>
      <a class="ico" data-social="github" href="#token" aria-label="CONSILIUM on GitHub"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7 3.6 3.6 0 0 1 .1-2.7s.8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/></svg></a>
      <a class="btn sm" href="/app">Open web desk</a>
      <a class="btn sm solid" href="/download">Download</a>
      <button class="burger" type="button" aria-controls="nav" aria-expanded="false" aria-label="Menu"><i></i><i></i><i></i></button>
    </div>
  </div>
</header>'''


FOOT = '<footer class="ft"><div class="wrap"><span>CONSILIUM · paper-mode AI trading desk · Not financial advice · Not affiliated with Robinhood</span><span><a href="/docs">Docs</a><a href="/download">Download</a><a href="/app">Web desk</a><a data-social="x" href="#token">X</a><a data-social="github" href="#token">GitHub</a><a href="/dl/SHA256SUMS.txt">Checksums</a></span></div></footer>'


def page(name, title, desc, cur, body, scripts):
    h = head.replace("<title>CONSILIUM · Four agents. One trade.</title>", f"<title>{title}</title>")
    h = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{desc}">', h)
    h = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{title}">', h)
    s = "".join((f'<script src="{x}"></script>\n' if x.startswith("/vendor/") else f'<script type="module" src="{x}"></script>\n') for x in scripts)
    (WEB / name).write_text(h + '</head>\n<body class="app">\n' + header(cur) + "\n" + body + "\n" + FOOT + "\n" + s + "</body>\n</html>\n", encoding="utf-8")


DOCS = '''<div class="page-head"><div class="wrap"><span class="kick">Documentation · v0.1.0</span><h1>How the desk<br><span class="hot">works.</span></h1></div></div>
<main id="main" class="wrap doc">
<nav aria-label="On this page"><a href="#start">Quick start</a><a href="#cli">Terminal commands</a><a href="#vote">How a vote works</a><a href="#ledger">Paper ledger</a><a href="#api">API reference</a><a href="#key">Your own Claude key</a><a href="#self">Run your own desk</a><a href="#data">Data and privacy</a></nav>
<article>
<h2 id="start">Quick start</h2>
<p>CONSILIUM runs in three places with the same four agents: the <a href="/app">web desk</a>, the Windows app and the terminal CLI. Nothing needs an account or a wallet.</p>
<h3>Windows (no Node needed)</h3>
<pre><code>irm <span data-site></span>/install.ps1 | iex
consil council NVDA</code></pre>
<h3>macOS and Linux (Node.js 20+)</h3>
<pre><code>curl -fsSL <span data-site></span>/install.sh | sh
consil council NVDA</code></pre>
<h3>Any OS with npm</h3>
<pre><code>npm i -g <span data-site></span>/dl/consil-cli.tgz</code></pre>
<p>Prefer to download by hand? Every file is on the <a href="/download">download page</a> with its SHA-256.</p>

<h2 id="cli">Terminal commands</h2>
<table><tr><th>Command</th><th>What it does</th></tr>
<tr><td><code>consil</code></td><td>Interactive desk. Type a question, or <code>/council NVDA</code>, <code>/markets</code>, <code>/watch NVDA</code>, <code>/ledger</code>, <code>/status</code>, <code>/exit</code>. Follow-up questions can refer to the council you just ran.</td></tr>
<tr><td><code>consil ask "..."</code></td><td>Streams an answer from the desk. Name a ticker and the desk convenes the council on it first. Answers are in English.</td></tr>
<tr><td><code>consil ask --agent risk "..."</code></td><td>Ask one agent instead of the chair: <code>scout</code>, <code>quant</code>, <code>risk</code> or <code>exec</code>. Each answers from its own role and numbers.</td></tr>
<tr><td><code>consil markets [crypto|stocks]</code></td><td>Live markets on Lighter (Robinhood Chain): stock tokens on spot in USDG, and crypto (BTC, ETH, SOL, HYPE and more) on spot or perpetual markets, with 24h change and volume.</td></tr>
<tr><td><code>consil council NVDA</code></td><td>The four agents vote on one market and the verdict is printed with each agent's case.</td></tr>
<tr><td><code>consil watch NVDA --every 60</code></td><td>Runs the council on a timer (30 s minimum) and paper-trades every BUY or SELL verdict.</td></tr>
<tr><td><code>consil ledger [--reset]</code></td><td>Positions, the last fills and equity, marked at the live price.</td></tr>
<tr><td><code>consil key sk-ant-...</code></td><td>Use your own Claude key for answers and agent cases. <code>consil key --clear</code> removes it.</td></tr>
<tr><td><code>consil status</code></td><td>Checks market data, the desk API and which answer source is active.</td></tr>
</table>
<p>Options: <code>--api &lt;url&gt;</code> or <code>CONSIL_API</code> points at another desk server, <code>NO_COLOR=1</code> prints plain text, <code>CONSIL_HOME</code> moves the data folder.</p>

<h2 id="vote">How a vote works</h2>
<p>All four votes are plain code. Claude only writes each agent's one-line case from the numbers and cannot change a vote or the verdict.</p>
<table><tr><th>Agent</th><th>Reads</th><th>Votes</th></tr>
<tr><td>SCOUT</td><td>EMA20 against EMA50 on 1h candles, and the 24h change</td><td>BUY when EMA20 is more than 0.15% above EMA50 and the day is not down more than 1%. SELL in the mirror case. Otherwise HOLD.</td></tr>
<tr><td>QUANT</td><td>RSI14 on 1h candles</td><td>BUY under 35, SELL over 65, otherwise HOLD.</td></tr>
<tr><td>RISK</td><td>Market status, spread, 24h volume, hourly volatility</td><td>APPROVE only if the market is open, the spread is at most 40 bps, 24h volume is at least $5,000 and hourly volatility over the last day is at most 3.5%. Otherwise VETO.</td></tr>
<tr><td>EXEC</td><td>The live order book</td><td>Walks the book for a 250 USDG ticket in the trade's direction. READY if it fills with at most 50 bps slippage, otherwise BLOCK.</td></tr>
</table>
<p>The direction comes from SCOUT and QUANT. If they point opposite ways there is no trade. A RISK veto or an EXEC block always stops the trade. Otherwise at least 3 of the 4 agents must be behind it.</p>
<h3>Change the rules</h3>
<p>Every number above is a rule you can change on the <a href="/app">web desk</a> (Rules tab, or the Cautious, Balanced and Aggressive presets) or through the API. The server clamps each value to its range:</p>
<table><tr><th>Rule</th><th>Default</th><th>Range</th></tr>
<tr><td><code>quorum</code></td><td>3</td><td>2 to 4 agents</td></tr>
<tr><td><code>emaGapPct</code></td><td>0.15</td><td>0.02 to 2</td></tr>
<tr><td><code>rsiBuy</code> / <code>rsiSell</code></td><td>35 / 65</td><td>10 to 50 / 50 to 90</td></tr>
<tr><td><code>maxSpreadBps</code></td><td>40</td><td>2 to 300</td></tr>
<tr><td><code>maxVolPct</code></td><td>3.5</td><td>0.2 to 15</td></tr>
<tr><td><code>minVolumeUsd</code></td><td>5,000</td><td>0 to 1,000,000</td></tr>
<tr><td><code>ticketUsd</code></td><td>250</td><td>10 to 10,000</td></tr>
<tr><td><code>maxSlipBps</code></td><td>50</td><td>2 to 500</td></tr></table>

<h2 id="ledger">Paper ledger</h2>
<p>Every account starts with 1,000 USDG of paper cash. A BUY verdict opens a 250 USDG position at EXEC's average fill price if you hold none; a SELL verdict closes it. No order is ever sent.</p>
<p>The terminal app stores the ledger in <code>~/.consilium/ledger.json</code>. The web desk stores it in your browser.</p>

<h2 id="api">API reference</h2>
<p>Public, read-only, JSON. Rate limits: 240 requests a minute per IP, 20 questions per 10 minutes.</p>
<h3>GET /v1/markets?asset=crypto</h3>
<p><code>asset</code> is optional: <code>stock</code> or <code>crypto</code>. Crypto uses whichever Lighter market trades more for that coin, spot or perpetual; paper trades on perps are long or flat, no leverage.</p>
<pre><code>{ "ok": true, "markets": [ { "symbol": "BTC", "pair": "BTC-PERP", "asset": "crypto", "kind": "perp", "last": 61325.4, "change24hPct": 1.01, "dayVolumeUsd": 144946450, "tier": "liquid" } ] }</code></pre>
<h3>GET /v1/council/:symbol</h3>
<pre><code>{ "ok": true, "council": {
  "symbol": "NVDA", "price": 136.14, "quorum": 3,
  "votes": { "scout": { "vote": "BUY", "facts": { "ema20": 134.37, "ema50": 134.01 } }, "quant": { ... }, "risk": { ... }, "exec": { ... } },
  "verdict": { "action": "BUY", "behind": 3, "reason": "3 of 4 agents agree." },
  "brief": { "scout": "...", "quant": "...", "risk": "...", "exec": "...", "chair": "..." } } }</code></pre>
<p>Add any rule as a query parameter to vote with your own rules, for example <code>/v1/council/NVDA?quorum=4&amp;maxSpreadBps=20</code>. Add <code>brief=0</code> to skip the agents' written case (faster, used by the live watchlist).</p>
<h3>GET /v1/rules</h3>
<p>The default rules and the <code>[default, min, max]</code> range of each.</p>
<h3>GET /v1/candles/:symbol?res=1h&amp;count=300</h3>
<p>Candles from Lighter. <code>res</code> is one of 1m, 5m, 15m, 1h, 4h, 1d; <code>count</code> 10 to 500. The web desk polls this every 5 seconds to keep its chart live.</p>
<h3>POST /v1/ask</h3>
<p>Body <code>{"question": "...", "agent": "risk", "rules": {"quorum": 4}, "history": [{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}</code>; <code>agent</code> (chair, scout, quant, risk, exec) and <code>rules</code> are optional, question up to 600 characters. The answer streams as server-sent events: <code>context</code>, then <code>text</code> chunks, then <code>done</code> or <code>error</code>.</p>
<pre><code>curl -N <span data-site></span>/v1/ask -H "content-type: application/json" \\
  -d '{"question":"Why would RISK veto AMD?"}'</code></pre>
<h3>GET /v1/health</h3>
<p>Version, mode (always <code>paper</code>) and whether the model is online.</p>

<h2 id="key">Your own Claude key</h2>
<p>By default the app asks our desk API. With <code>consil key sk-ant-...</code> the app talks to Claude directly with your key, so questions never pass through our server. The key is saved in <code>~/.consilium/config.json</code>, readable only by your user.</p>

<h2 id="self">Run your own desk</h2>
<pre><code>git clone &lt;your copy&gt; consilium &amp;&amp; cd consilium
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start      # http://127.0.0.1:5120
node cli/build.mjs --api https://your-desk.example   # rebuild the downloads</code></pre>
<p>Set <code>SITE_URL</code> so the install scripts point at your domain, and <code>TRUST_PROXY=1</code> behind a reverse proxy.</p>

<h2 id="data">Data and privacy</h2>
<p>Market data is Lighter's public, read-only API for Robinhood Chain. The desk keeps no accounts and no wallets. Questions sent to the desk API are passed to Claude to write the answer and are not stored by the desk. Paper mode only: this is not financial advice and CONSILIUM is not affiliated with Robinhood.</p>
</article>
</main>'''

DOWNLOAD = '''<div class="page-head"><div class="wrap"><span class="kick">Downloads · <span id="ver">v0.1.0</span></span><h1>Take the desk<br><span class="hot">with you.</span></h1></div></div>
<main id="main" class="wrap" style="padding-bottom:120px">
  <div class="dl" id="rows">
    <div class="r"><div><b>Windows app</b><small>consil.exe · x64 · no Node needed</small></div><div class="f" data-sha="consil-win-x64.exe">sha256 loading</div><div class="f" data-size="consil-win-x64.exe"></div><a class="btn solid" href="/dl/consil-win-x64.exe">Download .exe</a></div>
    <div class="r"><div><b>Windows zip</b><small>consil.exe + Open CONSILIUM.cmd</small></div><div class="f" data-sha="consil-win-x64.zip">sha256 loading</div><div class="f" data-size="consil-win-x64.zip"></div><a class="btn" href="/dl/consil-win-x64.zip">Download .zip</a></div>
    <div class="r"><div><b>macOS · Linux</b><small>zip · Node.js 20+</small></div><div class="f" data-sha="consil-node.zip">sha256 loading</div><div class="f" data-size="consil-node.zip"></div><a class="btn" href="/dl/consil-node.zip">Download .zip</a></div>
    <div class="r"><div><b>npm package</b><small>npm i -g · any OS with Node 20+</small></div><div class="f" data-sha="consil-cli.tgz">sha256 loading</div><div class="f" data-size="consil-cli.tgz"></div><a class="btn" href="/dl/consil-cli.tgz">Download .tgz</a></div>
    <div class="r"><div><b>Single file</b><small>consil.mjs · node consil.mjs</small></div><div class="f" data-sha="consil.mjs">sha256 loading</div><div class="f" data-size="consil.mjs"></div><a class="btn" href="/dl/consil.mjs">Download .mjs</a></div>
  </div>
  <div class="split" style="margin-top:64px">
    <div>
      <h2 class="big" style="font-size:clamp(44px,5vw,72px)"><span class="line">Install in</span><span class="line hot">one line.</span></h2>
      <p class="lead">The Windows installer puts consil.exe in your user folder and adds it to PATH. The macOS and Linux installer puts consil in ~/.local/bin. Read either script first: <a href="/install.ps1">install.ps1</a>, <a href="/install.sh">install.sh</a>.</p>
    </div>
    <div class="doc" style="display:block;padding:0">
      <pre><code># Windows PowerShell
irm <span data-site></span>/install.ps1 | iex

# macOS / Linux
curl -fsSL <span data-site></span>/install.sh | sh

# verify a download (PowerShell)
Get-FileHash .\\consil-win-x64.exe -Algorithm SHA256</code></pre>
      <p class="kick">Windows may warn that the app is from an unknown publisher: the build is not code-signed yet. Compare the SHA-256 above before you run it.</p>
    </div>
  </div>
</main>'''

APP = '<main id="main" class="deskgrid">\n  <section class="kpis" aria-label="Desk summary"><div class="kpi"><i class="kico">$</i><div><small>Paper equity</small><b id="k-eq">1,000.00</b><em id="k-eq2">USDG · since start</em></div></div><div class="kpi"><i class="kico">◧</i><div><small>Open positions</small><b id="k-pos">0</b><em id="k-pos2">No open trades</em></div></div><div class="kpi wide"><i class="kico">✓</i><div><small>Watchlist verdicts</small><div class="vbar" id="k-vbar"><span class="b" style="flex:0"></span><span class="s" style="flex:0"></span><span class="h" style="flex:1"></span></div><em id="k-vd">Waiting for the first vote</em></div></div><div class="kpi"><i class="kico">↯</i><div><small>Last paper fill</small><b id="k-fill">None yet</b><em id="k-fill2">Turn on auto paper-trade</em></div></div><div class="kpi"><i class="kico">≡</i><div><small>Rules</small><b id="k-rules">Default</b><em id="k-rules2">Quorum 3 of 4</em></div></div></section>\n  <aside class="pane">\n    <h2>Watchlist <span class="pill live" id="live-pill">Live</span></h2>\n    <div class="watch" id="watch" role="list"></div>\n    <div class="addrow"><label class="skip" for="add">Add a market</label><select id="add"><option value="">+ Add market</option></select></div>\n    <p class="kick pad">Every market on the list is re-voted on each tick with your rules.</p>\n  </aside>\n  <section class="center">\n    <div class="symhead">\n      <div class="symid"><span id="d-logo"></span><div><small class="kick" id="d-pair">Lighter spot · USDG</small><b id="d-sym">----</b></div></div>\n      <span id="d-px"></span>\n    </div>\n    <div class="chart live-chart"><div id="chart" aria-label="Live price chart. Drag to pan, scroll to zoom."></div><div class="legend" id="legend"></div><div class="res" id="res" role="group" aria-label="Candle size"><button type="button" data-r="1m">1m</button><button type="button" data-r="5m">5m</button><button type="button" data-r="15m">15m</button><button type="button" data-r="1h" aria-pressed="true">1h</button><button type="button" data-r="4h">4h</button><button type="button" data-r="1d">1d</button><span class="sep"></span><button type="button" id="fit" title="Fit all candles">Fit</button><button type="button" id="now" title="Jump to the latest candle">Now</button></div></div>\n    <div class="ctl">\n      <button class="btn solid" type="button" id="run">Convene now</button>\n      <label class="switch"><input type="checkbox" id="live" checked> Live</label>\n      <label class="switch">every <select id="every"><option value="30">30 s</option><option value="60" selected>60 s</option><option value="120">2 min</option></select></label>\n      <label class="switch"><input type="checkbox" id="auto"> Auto paper-trade</label>\n      <span class="kick" id="tick-state"></span>\n    </div>\n    <div class="board" id="board">\n      <div class="top"><span>Council <span id="rules-tag" class="pill" hidden>Custom rules</span></span><span class="pill" id="d-when">Not run yet</span></div>\n      <div id="b-votes"><div class="skel">Convening the agents</div></div>\n      <div class="verdict" id="b-verdict"></div>\n    </div>\n    <div class="board">\n      <div class="top"><span>Activity</span><span class="kick" id="log-n"></span></div>\n      <div class="activity" id="activity" aria-live="polite"><div class="skel">The log fills as the agents vote.</div></div>\n    </div>\n  </section>\n  <aside class="pane side-pane">\n    <div class="ptabs" role="tablist">\n      <button type="button" role="tab" aria-selected="true" data-tab="agents">Agents</button>\n      <button type="button" role="tab" aria-selected="false" data-tab="rules">Rules</button>\n      <button type="button" role="tab" aria-selected="false" data-tab="ledger">Ledger</button>\n    </div>\n    <div class="tabpane" id="tab-agents">\n      <div class="agent-pick" id="agent-pick" role="group" aria-label="Who answers">\n        <button type="button" data-a="chair" aria-pressed="true">Chair</button>\n        <button type="button" data-a="scout" aria-pressed="false" style="--c:var(--scout)">SCOUT</button>\n        <button type="button" data-a="quant" aria-pressed="false" style="--c:var(--quant)">QUANT</button>\n        <button type="button" data-a="risk" aria-pressed="false" style="--c:var(--risk)">RISK</button>\n        <button type="button" data-a="exec" aria-pressed="false" style="--c:var(--exec)">EXEC</button>\n      </div>\n      <p class="kick pad" id="agent-role">The chair speaks for all four agents and the verdict.</p>\n      <div class="console agent-chat">\n        <div class="log" id="ask-log" aria-live="polite"><div class="msg desk"><div class="who2">Chair</div><div class="body">Ask about the market on screen, your rules, or why an agent voted the way it did. Answers are in English and use live data.</div></div></div>\n        <form id="ask-form"><label class="skip" for="ask-q">Your question</label><input id="ask-q" maxlength="600" autocomplete="off" placeholder="Ask the chair"><button type="submit">Ask</button></form>\n      </div>\n    </div>\n    <div class="tabpane" id="tab-rules" hidden>\n      <div class="presets" role="group" aria-label="Presets"><button type="button" data-p="cautious">Cautious</button><button type="button" data-p="balanced">Balanced</button><button type="button" data-p="aggressive">Aggressive</button></div>\n      <form class="rules" id="rules"></form>\n      <p class="kick pad">Saved in this browser. Changes apply on the next vote; the server clamps every value to its range.</p>\n    </div>\n    <div class="tabpane" id="tab-ledger" hidden>\n      <div class="ledger">\n        <div class="eq"><small>Equity · USDG</small><b id="eq">1,000.00</b><small id="eq-sub"></small></div>\n        <div id="pos"></div>\n        <div class="fills" id="fills"></div>\n        <button class="btn sm" type="button" id="reset">Reset ledger</button>\n        <p class="kick">Stored in this browser only. Paper fills priced on the live book; no orders are sent.</p>\n      </div>\n    </div>\n  </aside>\n</main>'

ADMIN = '<div class="page-head"><div class="wrap"><span class="kick">Admin</span><h1>Desk<br><span class="hot">settings.</span></h1></div></div>\n<main id="main" class="wrap" style="padding:40px 0 120px;max-width:760px">\n  <form id="login" class="board" style="padding:24px" hidden>\n    <label class="kick" for="pw">Password</label>\n    <input id="pw" type="password" autocomplete="current-password" class="adm-in" required>\n    <button class="btn solid" type="submit" style="margin-top:14px">Log in</button>\n    <p class="kick chg-dn" id="login-msg" style="margin-top:12px"></p>\n  </form>\n  <form id="panel" class="board" style="padding:24px;display:grid;gap:16px" hidden>\n    <label><span class="kick">Contract (CA)</span><input id="f-ca" class="adm-in" placeholder="0x… (42 characters)" spellcheck="false"></label>\n    <label><span class="kick">Buy on Pons link</span><input id="f-pons" class="adm-in" placeholder="https://…"></label>\n    <label><span class="kick">Chart link</span><input id="f-chart" class="adm-in" placeholder="https://…"></label>\n    <label><span class="kick">X</span><input id="f-x" class="adm-in" placeholder="@ConsiliumDesk or https://x.com/…"></label>\n    <label><span class="kick">GitHub</span><input id="f-github" class="adm-in" placeholder="https://github.com/…"></label>\n    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn solid" type="submit">Save</button><button class="btn" type="button" id="logout">Log out</button><span id="save-msg" class="kick"></span></div>\n    <p class="kick">Empty fields show "Soon" on the site. Every value is checked on the server.</p>\n  </form>\n</main>'

NF = '''<main id="main" class="wrap" style="padding:140px 0 160px"><span class="kick">404 · not found</span><h1 class="big" style="margin-top:14px"><span class="line">No quorum</span><span class="line hot">on this page.</span></h1><div class="cta" style="padding:40px 0 0;text-align:left;border:0"><div class="row" style="justify-content:flex-start"><a class="btn solid" href="/">Back to the desk</a><a class="btn" href="/docs">Read the docs</a></div></div></main>'''

page("docs.html", "Docs · CONSILIUM", "Terminal commands, the exact voting rules, the paper ledger and the public API of the CONSILIUM desk.", "/docs", DOCS, ["/js/common.js?v=7", "/js/pages.js?v=1"])
page("download.html", "Download · CONSILIUM", "Download the CONSILIUM desk for Windows, macOS and Linux, or install it with one line. SHA-256 for every file.", "/download", DOWNLOAD, ["/js/common.js?v=7", "/js/pages.js?v=1"])
page("app.html", "Web desk · CONSILIUM", "A live four-agent trading desk: watch several Robinhood Chain stock tokens, change the rules the agents vote by, paper-trade the verdicts and ask any agent why.", "/app", APP, ["/vendor/lightweight-charts.js", "/js/common.js?v=7", "/js/app.js?v=6"])
page("admin.html", "Admin · CONSILIUM", "Desk settings.", "", ADMIN, ["/js/common.js?v=7", "/js/admin.js?v=1"])
page("404.html", "Not found · CONSILIUM", "This page does not exist.", "", NF, ["/js/common.js?v=7"])
print("ok")
