import { analyze } from "./analyze/engine";
import type { Analysis } from "./analyze/types";
import { navigate, parseLocation, reportPath } from "./routes";
import type { IiaoTree } from "./viz/tree";
import type { IiaoRadar } from "./viz/radar";
import type { IiaoBars } from "./viz/bars";
import type { IiaoStats } from "./viz/stats";

const EXAMPLES = [
  "a shoe",
  "my toaster",
  "the group chat",
  "https://www.cloudflare.com/",
  "https://kernel.org/",
  "emacs",
];

const LOAD_GATES = [
  { q: "Does it run anything?", a: "scanning schedulers…" },
  { q: "Kernel-ish core?", a: "poking ring 0…" },
  { q: "Real isolation?", a: "crash one, watch the rest…" },
  { q: "Boot ≠ signup?", a: "timing power-on…" },
  { q: "Marketing claiming OS?", a: "red-penning copy…" },
];

const THINKS = [
  "convening the board…",
  "finding the product…",
  "counting syscalls…",
  "asking the model…",
  "weighing the evidence…",
  "almost certified…",
];

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(inner: string): string {
  return `
    <div class="page">
      ${inner}
      <footer class="foot">
        <a href="/" data-nav="/">is it an os?</a>
        <span class="foot__dot">·</span>
        <span>algor.ist</span>
      </footer>
    </div>
    <div class="toast" id="toast" role="status"></div>
  `;
}

function homeView(): string {
  return shell(`
    <main class="stage stage--home">
      <h1 class="title">Is it an OS?</h1>
      <p class="tagline">Paste a link, or describe a product or idea.</p>
      <form class="box" id="compose" autocomplete="off">
        <label class="sr-only" for="subject">Link, product, or idea</label>
        <input id="subject" name="subject" type="text"
          placeholder="https://… or “an edge platform for agents” or a shoe"
          required maxlength="2048" autofocus />
        <button type="submit">Ask</button>
      </form>
      <div class="examples" id="examples">
        ${EXAMPLES.map(
          (e) =>
            `<button type="button" class="ex" data-ex="${esc(e)}">${esc(e)}</button>`,
        ).join("")}
      </div>
    </main>
  `);
}

function loadingView(subject: string): string {
  const gates = LOAD_GATES.map(
    (g, i) => `
    <li class="load-gate" data-i="${i}" style="--i:${i}">
      <span class="load-gate__dot" aria-hidden="true"></span>
      <span class="load-gate__q">${esc(g.q)}</span>
      <span class="load-gate__a">${esc(g.a)}</span>
    </li>`,
  ).join("");

  return shell(`
    <main class="stage stage--load">
      <p class="thinking" id="think">convening the board…</p>
      <p class="subject-quiet">${esc(subject)}</p>

      <div class="load-board" aria-live="polite">
        <div class="load-board__head">
          <span class="load-board__badge">live path</span>
          <span class="load-board__hint" id="load-hint">walking the decision tree</span>
        </div>
        <ol class="load-gates" id="load-gates">
          ${gates}
        </ol>
        <div class="load-meters">
          <div class="load-gauge" aria-hidden="true">
            <svg viewBox="0 0 120 70" class="load-gauge__svg">
              <path class="load-gauge__track" d="M14 58 A46 46 0 0 1 106 58" fill="none" stroke-width="10" stroke-linecap="round"/>
              <path class="load-gauge__fill" id="load-gauge-fill" d="M14 58 A46 46 0 0 1 106 58" fill="none" stroke-width="10" stroke-linecap="round" pathLength="100"/>
            </svg>
            <div class="load-gauge__num"><span id="load-pct">0</span>%</div>
          </div>
          <div class="load-bars" aria-hidden="true">
            ${["kernel", "boot", "sched", "saas", "claim"]
              .map(
                (lab, i) => `
              <div class="load-bar" style="--i:${i}">
                <span class="load-bar__lab">${lab}</span>
                <span class="load-bar__track"><span class="load-bar__fill"></span></span>
              </div>`,
              )
              .join("")}
          </div>
        </div>
      </div>
    </main>
  `);
}

function answerClass(v: string): string {
  if (v === "YES") return "answer--yes";
  if (v === "NO") return "answer--no";
  return "answer--kinda";
}

function reportView(
  a: Analysis,
  meta?: { thing?: string; engine?: string },
): string {
  const answer = a.verdict;
  const lead = a.subtitle;
  const rest = (a.roast ?? []).filter((l) => l && l !== lead);
  const notes = a.criteria.filter((c) => c.note && c.label).slice(0, 6);
  const thing = meta?.thing || a.stamp || a.subject;
  const showSource = thing !== a.subject;
  const hasRadar = (a.radar?.length ?? 0) >= 3;
  const hasTree = Boolean(a.tree?.children?.length);
  const hasSignals = (a.signalStats?.length ?? 0) > 0;
  const hasBars = notes.length > 0;

  return shell(`
    <main class="stage stage--result">
      <article class="verdict-card">
        <div class="verdict-card__grid">
          <div class="verdict-card__copy">
            <p class="about">
              ${esc(thing)}
              ${showSource ? `<span class="about__src">from ${esc(a.subject)}</span>` : ""}
            </p>
            <h1 class="answer ${answerClass(answer)}">${esc(answer)}</h1>
            <p class="line">${esc(lead)}</p>
          </div>
          <div class="verdict-card__gauge">
            <iiao-gauge value="${a.confidence}" label="confidence"></iiao-gauge>
          </div>
        </div>
      </article>

      ${
        rest.length
          ? `<section class="section">
        <h2 class="section__label">Commentary</h2>
        <div class="commentary">
          ${rest.map((l) => `<p>${esc(l)}</p>`).join("")}
        </div>
      </section>`
          : ""
      }

      ${
        hasTree || hasRadar
          ? `<section class="section">
        <h2 class="section__label">How we got here</h2>
        <div class="viz-grid">
          ${
            hasTree
              ? `<div class="viz-panel viz-panel--tree">
            <h3 class="viz-panel__h">Decision path</h3>
            <iiao-tree id="viz-tree"></iiao-tree>
          </div>`
              : ""
          }
          ${
            hasRadar
              ? `<div class="viz-panel viz-panel--radar">
            <h3 class="viz-panel__h">OS-ness radar</h3>
            <iiao-radar id="viz-radar"></iiao-radar>
          </div>`
              : ""
          }
        </div>
      </section>`
          : ""
      }

      ${
        hasBars
          ? `<section class="section">
        <h2 class="section__label">Systems notes</h2>
        <iiao-bars id="viz-bars"></iiao-bars>
      </section>`
          : ""
      }

      ${
        hasSignals
          ? `<section class="section">
        <h2 class="section__label">Evidence desk</h2>
        <iiao-stats id="viz-stats"></iiao-stats>
      </section>`
          : ""
      }

      <div class="row">
        <button type="button" class="btn" id="btn-copy">Share</button>
        <button type="button" class="btn btn--ghost" id="btn-again">Again</button>
      </div>
    </main>
  `);
}

function toast(msg: string) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 2000);
}

type JudgeResponse = {
  ok: boolean;
  engine?: string;
  thing?: string;
  analysis?: Analysis;
  error?: string;
};

async function runLoad(
  root: HTMLElement,
  subject: string,
): Promise<{ analysis: Analysis; thing?: string; engine?: string }> {
  const thinkEl = root.querySelector("#think");
  const hintEl = root.querySelector("#load-hint");
  const pctEl = root.querySelector("#load-pct");
  const fillEl = root.querySelector<SVGPathElement>("#load-gauge-fill");
  const gates = [...root.querySelectorAll<HTMLElement>(".load-gate")];

  let thinkI = 0;
  let gateI = 0;
  let pct = 0;

  const tickThink = window.setInterval(() => {
    thinkI = (thinkI + 1) % THINKS.length;
    if (thinkEl) thinkEl.textContent = THINKS[thinkI]!;
  }, 700);

  const tickBoard = window.setInterval(() => {
    if (gateI < gates.length) {
      gates[gateI]?.classList.add("load-gate--on");
      if (gateI > 0) gates[gateI - 1]?.classList.add("load-gate--done");
      if (hintEl) hintEl.textContent = LOAD_GATES[gateI]?.a ?? "";
      gateI += 1;
    } else {
      gates.forEach((g) => g.classList.add("load-gate--done", "load-gate--on"));
    }
    pct = Math.min(92, pct + 11 + Math.floor(Math.random() * 8));
    if (pctEl) pctEl.textContent = String(pct);
    if (fillEl) fillEl.style.strokeDashoffset = String(100 - pct);
  }, 480);

  if (fillEl) {
    fillEl.style.strokeDasharray = "100";
    fillEl.style.strokeDashoffset = "100";
  }

  try {
    const res = await fetch("/api/judge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject }),
    });
    const data = (await res.json()) as JudgeResponse;
    if (data.ok && data.analysis) {
      return {
        analysis: data.analysis,
        thing: data.thing,
        engine: data.engine,
      };
    }
  } catch {
    /* fall through */
  } finally {
    window.clearInterval(tickThink);
    window.clearInterval(tickBoard);
  }

  return { analysis: analyze(subject, null), engine: "rules" };
}

function bindHome(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>("#compose");
  const input = root.querySelector<HTMLInputElement>("#subject");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input?.value.trim();
    if (!v) return;
    navigate(reportPath(v));
  });
  root.querySelectorAll<HTMLButtonElement>("[data-ex]").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigate(reportPath(btn.dataset.ex ?? ""));
    });
  });
}

function bindReport(root: HTMLElement, a: Analysis) {
  const tree = root.querySelector<IiaoTree>("#viz-tree");
  if (tree) tree.tree = a.tree;

  const radar = root.querySelector<IiaoRadar>("#viz-radar");
  if (radar) radar.data = a.radar ?? [];

  const bars = root.querySelector<IiaoBars>("#viz-bars");
  if (bars) bars.items = a.criteria ?? [];

  const stats = root.querySelector<IiaoStats>("#viz-stats");
  if (stats) {
    stats.data = {
      signals: a.signalStats ?? [],
      steps: a.confidenceSteps ?? [],
    };
  }

  root.querySelector("#btn-copy")?.addEventListener("click", async () => {
    const url = `${location.origin}${reportPath(a.subject)}`;
    const body = [a.verdict, a.subtitle, ...(a.roast ?? []).slice(1, 3)]
      .filter(Boolean)
      .join("\n");
    const text = `${body}\n${url}`;
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch {
      toast(url);
    }
  });
  root.querySelector("#btn-again")?.addEventListener("click", () => navigate("/"));
}

function bindNav(root: HTMLElement) {
  root.querySelectorAll<HTMLAnchorElement>("[data-nav]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(a.dataset.nav || "/");
    });
  });
}

let runToken = 0;

export async function renderApp(mount: HTMLElement) {
  const route = parseLocation(location.pathname, location.search);
  const token = ++runToken;

  if (route.name === "home") {
    mount.innerHTML = homeView();
    bindNav(mount);
    bindHome(mount);
    return;
  }

  mount.innerHTML = loadingView(route.subject);
  bindNav(mount);

  const { analysis, thing, engine } = await runLoad(mount, route.subject);
  if (token !== runToken) return;

  const path = reportPath(route.subject);
  if (location.pathname + location.search !== path) {
    history.replaceState({}, "", path);
  }

  mount.innerHTML = reportView(analysis, { thing, engine });
  bindNav(mount);
  bindReport(mount, analysis);
}
