# CONSILIUM

> Built, tested and deployed by the CONSILIUM agent · live at [consiliumdesk.xyz](https://consiliumdesk.xyz) · [@ConsiliumDesk](https://x.com/ConsiliumDesk)

Four AI agents vote before every paper trade on Robinhood Chain stock tokens and crypto.

- **SCOUT** reads the trend (EMA20 vs EMA50 on 1h candles).
- **QUANT** reads the stretch (RSI14).
- **RISK** holds a veto: spread, 24h volume and volatility limits.
- **EXEC** walks the live order book for the ticket size.

A trade needs 3 of 4 agents behind it, and a RISK veto or an EXEC block cannot be outvoted. Every threshold is a rule you can change. Market data is Lighter's public, read-only API for Robinhood Chain. **Paper mode only**: no orders are sent, no wallet is touched. Not financial advice. Not affiliated with Robinhood.

## Three ways in

| | |
|---|---|
| Web desk | Live watchlist, live chart (zoom and pan), your own rules, chat with any agent |
| Terminal | `consil council BTC`, `consil watch NVDA`, `consil ask --agent risk "..."` |
| Windows app | `consil.exe`, no Node needed |

## Run it

```sh
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start        # http://127.0.0.1:5120
npm test
```

Without a key the desk still votes; answers and the agents' written case need Claude.

## Build the downloads

```sh
node cli/build.mjs --api https://your-desk.example
```

Writes `dist/`: `consil-win-x64.exe` (Node single executable), `consil-node.zip`, `consil-cli.tgz`, `consil.mjs`, `SHA256SUMS.txt`.

## Terminal app

```
consil                            interactive desk
consil ask "question"             ask the desk anything
consil ask --agent risk "..."     ask one agent: scout, quant, risk or exec
consil markets [crypto|stocks]    live markets
consil council <SYM>              four agents vote on one market
consil watch <SYM> [--every 60]   paper-trade on the council's verdicts
consil ledger [--reset]           paper fills and P&L
consil key [sk-ant-...|--clear]   use your own Claude key
consil status
```

The app runs the four agents on your machine against Lighter's public API, so `markets`, `council` and `watch` work even when the desk server is down.

## API

| Method | Path | |
|---|---|---|
| GET | `/v1/markets?asset=crypto` | markets, optionally only `stock` or `crypto` |
| GET | `/v1/council/:symbol?quorum=4&maxSpreadBps=20` | four votes, verdict, each agent's case; any rule as a query parameter, `brief=0` to skip the written case |
| GET | `/v1/rules` | default rules and their ranges |
| GET | `/v1/candles/:symbol?res=1m&count=300` | candles, `1m` to `1d` |
| POST | `/v1/ask` | `{question, agent?, rules?, history?}` → server-sent events |

## Layout

```
server/   HTTP server, market data, the four agents, Claude
cli/      terminal app and the download builder
web/      site, live desk, docs
test/     node --test
```

## License

MIT, see [LICENSE](LICENSE). Third-party files keep their own licenses.
