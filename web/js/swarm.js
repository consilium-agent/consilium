// The four desk agents build the page: each cursor flies to a block, drags a selection box
// over it, reads out its size and locks it in. Blocks are elements with class "sw".
// Without JS or with reduced motion everything is simply visible (see boot.js and site.css).
const AGENTS = [
  { name: "SCOUT", color: "#e2531c" },
  { name: "QUANT", color: "#c99a2e" },
  { name: "RISK", color: "#27a774" },
  { name: "EXEC", color: "#3d86ad" },
];
const MOVE_MS = 520;
const DRAW_MS = 340;
const HOLD_MS = 160;
const GROUP_DEADLINE_MS = 6000;  // a block never stays hidden longer than this

const root = document.documentElement;
const layer = document.getElementById("swarm");
const hud = document.getElementById("hud");
const active = root.classList.contains("js") && layer;

const all = () => [...document.querySelectorAll(".sw")];
const label = (el) => (el.dataset.label || el.textContent.trim().replace(/\s+/g, " ").slice(0, 26) || el.tagName.toLowerCase()).toUpperCase();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reveal = (el) => el.classList.add("on");

if (!active) {
  all().forEach(reveal);
} else {
  start();
}

function start() {
  let paused = false;
  const queue = [];
  const queued = new Set();

  // Cursor + selection box for each agent.
  const bots = AGENTS.map((a, i) => {
    const cur = document.createElement("div");
    cur.className = "cur";
    cur.innerHTML = `<svg viewBox="0 0 18 18"><path d="M2 1.5 L15.5 8.2 L9.3 9.6 L6.6 15.8 Z" fill="${a.color}" stroke="#0a0a0b" stroke-width="1.3" stroke-linejoin="round"/></svg>
      <span class="lab"><span class="name" style="background:${a.color};${a.name === "EXEC" ? "color:#fff" : ""}">${a.name}</span><span class="doing" style="color:${a.color}">Online</span></span>`;
    const box = document.createElement("div");
    box.className = "box";
    box.style.borderColor = a.color;
    box.style.opacity = "0";
    box.innerHTML = '<span class="dim"></span>';
    layer.append(box, cur);
    const bot = { ...a, cur, box, doing: cur.querySelector(".doing"), x: 0, y: 0, busy: false };
    place(bot, innerWidth * (0.15 + i * 0.22), 60 + i * 40, true);
    return bot;
  });

  function place(bot, x, y, instant) {
    bot.x = Math.max(4, Math.min(innerWidth - 120, x));
    bot.y = Math.max(4, Math.min(innerHeight - 40, y));
    bot.cur.style.transition = instant ? "none" : "";
    bot.cur.style.transform = `translate(${bot.x}px, ${bot.y}px)`;
  }

  // A block can only be built once its parent block is in place.
  function enqueue(el) {
    const chain = [];
    for (let n = el; n; n = n.parentElement?.closest(".sw")) chain.unshift(n);
    for (const n of chain) {
      if (n.classList.contains("on") || queued.has(n)) continue;
      queued.add(n);
      queue.push(n);
      setTimeout(() => reveal(n), GROUP_DEADLINE_MS);
    }
    bots.forEach(work);
  }

  async function build(bot, el) {
    const r = el.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    if (!visible || paused) return reveal(el);
    // Long queues speed up so a fast scroller is never kept waiting.
    const k = queue.length > 10 ? 0.45 : queue.length > 5 ? 0.7 : 1;
    bot.doing.textContent = `Building [${label(el)}]`;
    place(bot, r.left - 4, r.top - 4);
    await wait(MOVE_MS * k);
    const r2 = el.getBoundingClientRect();
    Object.assign(bot.box.style, { left: r2.left + "px", top: r2.top + "px", width: "0px", height: "0px", opacity: "1" });
    bot.box.querySelector(".dim").textContent = `${Math.round(r2.width)} × ${Math.round(r2.height)} px`;
    requestAnimationFrame(() => {
      Object.assign(bot.box.style, { width: r2.width + "px", height: r2.height + "px" });
      place(bot, r2.right - 6, r2.bottom - 6);
    });
    await wait(DRAW_MS * k);
    reveal(el);
    bot.doing.textContent = `Locked [${label(el)}]`;
    await wait(HOLD_MS * k);
    bot.box.style.opacity = "0";
  }

  async function work(bot) {
    if (bot.busy || paused) return;
    bot.busy = true;
    while (queue.length && !paused) {
      const el = queue.shift();
      queued.delete(el);
      if (!el.classList.contains("on")) await build(bot, el);
    }
    bot.busy = false;
    bot.doing.textContent = "Patrolling";
  }

  // Idle agents wander and check finished blocks.
  setInterval(() => {
    if (paused || document.hidden) return;
    for (const bot of bots) {
      if (bot.busy || Math.random() < 0.6) continue;
      const done = all().filter((el) => el.classList.contains("on")).map((el) => [el, el.getBoundingClientRect()]).filter(([, r]) => r.top > 70 && r.bottom < innerHeight - 20 && r.width > 40);
      if (done.length && Math.random() < 0.6) {
        const [el, r] = done[Math.floor(Math.random() * done.length)];
        // park just outside the block's corner so the copy stays readable
        bot.doing.textContent = `Verified [${label(el)}]`;
        place(bot, r.right + 6, r.bottom + 4);
      } else {
        bot.doing.textContent = "Patrolling";
        // wander in the open right side of the screen, away from the copy column
        place(bot, innerWidth * (0.58 + Math.random() * 0.34), innerHeight * (0.15 + Math.random() * 0.6));
      }
    }
  }, 2400);

  // Every block is built when it scrolls into view, in document order.
  const io = new IntersectionObserver((entries) => {
    entries.filter((e) => e.isIntersecting).sort((x, y) => (x.target.compareDocumentPosition(y.target) & 4 ? -1 : 1)).forEach((e) => {
      io.unobserve(e.target);
      enqueue(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px" });
  const watchAll = () => all().forEach((el) => io.observe(el));
  watchAll();

  // HUD: pause shows everything at once and parks the agents; replay builds the page again.
  if (hud) {
    hud.hidden = false;
    const pauseBtn = document.getElementById("hud-pause");
    pauseBtn.addEventListener("click", () => {
      paused = !paused;
      pauseBtn.textContent = paused ? "Resume" : "Pause";
      layer.style.display = paused ? "none" : "";
      if (paused) { all().forEach(reveal); queue.length = 0; queued.clear(); }
    });
    document.getElementById("hud-replay").addEventListener("click", () => {
      paused = false;
      pauseBtn.textContent = "Pause";
      layer.style.display = "";
      queue.length = 0;
      queued.clear();
      all().forEach((el) => el.classList.remove("on"));
      scrollTo({ top: 0, behavior: "instant" });
      watchAll();
    });
  }
  addEventListener("resize", () => bots.forEach((b) => place(b, b.x, b.y, true)));
}
