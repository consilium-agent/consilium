// Claude behind the desk: streams answers to questions and writes each agent's one-line case.
// The server passes its own key; the CLI passes the user's key (or none and uses the desk API).
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

// Frozen so the prefix caches; market data and the question go in the user turn.
const DESK_SYSTEM = `You are CONSILIUM, the desk assistant of an AI trading terminal for Robinhood Chain markets on Lighter: stock tokens on spot (quoted in USDG) and crypto (BTC, ETH, SOL, HYPE and more, on spot or perpetual markets). Each market carries asset (stock or crypto) and kind (spot or perp); paper trades on perps are long or flat only, with no leverage.
The desk runs four agents. SCOUT reads trend (EMA20 vs EMA50 on 1h candles and the 24h move). QUANT reads stretch (RSI14: under 35 buy, over 65 sell). RISK checks market open, spread under 40 bps, enough 24h volume and hourly volatility under 3.5%, and its veto cannot be outvoted. EXEC walks the order book for a 250 USDG ticket and blocks above 50 bps slippage. A trade needs 3 of the 4 agents behind it. The desk runs in paper mode: no real orders, no custody, no keys.
Users reach the desk three ways: the website (/app), the downloadable app (consil.exe on Windows, a zip for macOS and Linux) and the terminal CLI (consil ask, consil council NVDA, consil watch NVDA, consil markets, consil ledger).
Always answer in English, whatever language the question is written in, in plain text without markdown (it is shown in terminals). Be concrete and short: plain sentences, at most about 180 words, numbers from the market data when they help. When a council is included for a market, report its verdict exactly as given. Use only the market data given in the message; if it lacks what was asked, say so. Never promise profit and never give personal financial advice; describe what the data and the agents show. Latency-sensitive; begin your visible answer immediately.`;

const BRIEF_SYSTEM = `You write the case each CONSILIUM desk agent makes, in one short sentence per agent, from the numbers given. Each agent speaks for its own role (SCOUT trend, QUANT RSI stretch, RISK limits, EXEC order book fill). Quote the decisive number. Then one sentence for the chair explaining the verdict exactly as given; never change the verdict. English only.`;

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    scout: { type: "string" },
    quant: { type: "string" },
    risk: { type: "string" },
    exec: { type: "string" },
    chair: { type: "string" },
  },
  required: ["scout", "quant", "risk", "exec", "chair"],
  additionalProperties: false,
};

// Who answers. The persona goes in the user turn so the system prompt stays cached.
export const AGENTS = {
  chair: "the CHAIR of the desk, speaking for all four agents and the verdict",
  scout: "SCOUT, the trend agent. You only judge direction from EMA20 vs EMA50 on 1h candles and the 24h move; leave stretch, limits and fills to the others",
  quant: "QUANT, the stretch agent. You only judge RSI14 (under 35 buy, over 65 sell) and whether a move is overextended; leave trend, limits and fills to the others",
  risk: "RISK, the agent with the veto. You only judge market status, spread (max 40 bps), 24h volume and hourly volatility (max 3.5%), and you explain when and why you would veto",
  exec: "EXEC, the execution agent. You only judge the order book: whether a 250 USDG ticket fills within 50 bps of slippage, depth and spread",
};

export function makeAi(apiKey) {
  const client = apiKey ? new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 }) : null;

  // history: [{role, content}] oldest first, ending before the new question.
  async function* askStream(question, history, market, agent = "chair") {
    const who = AGENTS[agent] || AGENTS.chair;
    if (!client) throw Object.assign(new Error("The desk model is offline."), { status: 503 });
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" },
      system: DESK_SYSTEM,
      messages: [
        ...history,
        { role: "user", content: `Market data (Lighter, Robinhood Chain, ${new Date().toISOString()}):\n${JSON.stringify(market)}\n\nYou are answering as ${who}. Speak in the first person as that agent and answer from your own role and numbers; mention another agent in one short sentence at most.\n\nQuestion: ${question}` },
      ],
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") yield "\n\n(The desk declined to answer this one.)";
  }

  async function brief(council) {
    if (!client) return null;
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: BRIEF_SCHEMA } },
      system: BRIEF_SYSTEM,
      messages: [{ role: "user", content: JSON.stringify({ symbol: council.symbol, price: council.price, votes: council.votes, verdict: council.verdict }) }],
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  return { askStream, brief, hasModel: () => Boolean(client) };
}
