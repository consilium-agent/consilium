CONSILIUM terminal desk
====================
Four AI agents (SCOUT, QUANT, RISK, EXEC) vote before every paper trade on
Robinhood Chain stock tokens. Paper mode: no orders are sent, no wallet is
touched, no keys are needed. Not financial advice.

Start
  Windows app:   double-click "Open CONSILIUM.cmd" (or run consil.exe in a terminal)
  Node 20+:      ./consil            (macOS / Linux)
                 consil.cmd          (Windows with Node)

Commands
  consil                            interactive desk
  consil ask "question"             ask the desk anything about the market
  consil markets                    live spot markets (USDG)
  consil council NVDA               four agents vote on one market
  consil watch NVDA --every 60      paper-trade on the council's verdicts
  consil ledger [--reset]           paper fills, positions and P&L
  consil key sk-ant-...             use your own Claude key for answers
  consil status                     check market data, desk API and key

Where things live
  Market data:  api.rh.lighter.xyz (public, read-only), fetched by this app
  Answers:      the CONSILIUM desk API (__API__) or your own Claude key
  Your files:   ~/.consilium/ledger.json and ~/.consilium/config.json

Verify a download against SHA256SUMS.txt on the download page.
