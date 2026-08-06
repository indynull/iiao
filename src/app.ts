import { analyze } from "./analyze/engine";
import type { Analysis } from "./analyze/types";
import { boardVoice } from "./analyze/voice";
import { renderBoard } from "./board";
import { navigate, parseLocation, reportPath } from "./routes";

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
  const u = String(v || "").toUpperCase();
  if (u === "YES") return "answer--yes";
  if (u === "NO") return "answer--no";
  return "answer--kinda";
}

/** Display verdict: Yes / No / Kinda (logic stays YES/NO/KINDA). */
function verdictDisplay(v: string): string {
  const u = String(v || "").toUpperCase();
  if (u === "YES") return "Yes";
  if (u === "NO") return "No";
  if (u === "KINDA") return "Kinda";
  if (!v) return "";
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

function roadmapSection(a: Analysis): string {
  const r = a.roadmap;
  if (!r?.steps?.length) return "";
  const label = r.label || "Board remediation";
  const gapNote =
    r.band === "hairline"
      ? `<span>+${r.gap}</span> footnote`
      : r.band === "style"
        ? `<span>+${r.gap}</span> style pts`
        : r.band === "chasm"
          ? `<span>+${r.gap}</span> chasm`
          : `<span>+${r.gap}</span> still missing`;
  return `<section class="section section--roadmap section--roadmap-${esc(r.band || "serious")}">
    <h2 class="section__label">${esc(label)}</h2>
    <div class="roadmap">
      <div class="roadmap__head">
        <p class="roadmap__title">${esc(r.headline)}</p>
        <p class="roadmap__gap">${gapNote}</p>
      </div>
      <ol class="roadmap__steps">
        ${r.steps
          .map(
            (s, i) =>
              `<li style="--i:${i}"><span class="roadmap__n">${i + 1}</span><span class="roadmap__t">${esc(s)}</span></li>`,
          )
          .join("")}
      </ol>
    </div>
  </section>`;
}

function reportView(
  a: Analysis,
  meta?: { thing?: string; engine?: string },
): string {
  const answer = a.verdict;
  const lead = a.subtitle;
  const rest = (a.roast ?? []).filter((l) => l && l !== lead);
  // User typed "my cat" — board talks about "your cat"
  const thing = boardVoice(meta?.thing || a.stamp || a.subject);
  const showSource =
    boardVoice(a.subject) !== a.subject || thing !== a.subject;

  // Joke only: verdict + roast + remediation. No lab tables.
  return shell(`
    <main class="stage stage--result">
      <article class="verdict-card">
        <div class="verdict-card__grid">
          <div class="verdict-card__copy">
            <h1 class="about">
              ${esc(thing)}
              ${showSource ? `<span class="about__src">from ${esc(a.subject)}</span>` : ""}
            </h1>
            <p class="answer ${answerClass(answer)}">${esc(verdictDisplay(answer))}</p>
            <p class="line">${esc(lead)}</p>
          </div>
          <div class="verdict-card__gauge">
            <iiao-gauge value="${a.confidence}" tone="${esc(answerClass(answer).replace("answer--", ""))}" label="confidence"></iiao-gauge>
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

      ${roadmapSection(a)}

      <section class="section section--try">
        <h2 class="section__label">Try another</h2>
        <form class="box box--try" id="compose-again" autocomplete="off">
          <label class="sr-only" for="subject-again">Link, product, or idea</label>
          <input id="subject-again" name="subject" type="text"
            placeholder="a shoe, sunglasses, my boss, a link…"
            required maxlength="2048" />
          <button type="submit">Ask</button>
        </form>
        <div class="row row--try">
          <button type="button" class="btn btn--ghost" id="btn-copy">Share this one</button>
        </div>
      </section>
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

function setPageMeta(opts: {
  title: string;
  description: string;
  url?: string;
  image?: string;
}) {
  document.title = opts.title;
  const setMeta = (
    selector: string,
    content: string,
    props: Record<string, string>,
  ) => {
    let el = document.head.querySelector(selector) as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement("meta");
      for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  };
  setMeta('meta[name="description"]', opts.description, { name: "description" });
  setMeta('meta[property="og:title"]', opts.title, { property: "og:title" });
  setMeta('meta[property="og:description"]', opts.description, {
    property: "og:description",
  });
  setMeta('meta[property="og:type"]', "website", { property: "og:type" });
  if (opts.url) {
    setMeta('meta[property="og:url"]', opts.url, { property: "og:url" });
  }
  if (opts.image) {
    setMeta('meta[property="og:image"]', opts.image, { property: "og:image" });
    setMeta('meta[name="twitter:image"]', opts.image, { name: "twitter:image" });
    setMeta('meta[name="twitter:card"]', "summary_large_image", {
      name: "twitter:card",
    });
  } else {
    setMeta('meta[name="twitter:card"]', "summary", { name: "twitter:card" });
  }
  setMeta('meta[name="twitter:title"]', opts.title, { name: "twitter:title" });
  setMeta('meta[name="twitter:description"]', opts.description, {
    name: "twitter:description",
  });
}

function reportSocial(a: Analysis, thing: string) {
  const title = `${verdictDisplay(a.verdict)} · ${a.confidence}% — ${thing}`;
  const description = (a.subtitle || `Is ${thing} an OS?`).slice(0, 200);
  const url = `${location.origin}${reportPath(a.subject)}`;
  const image = `${location.origin}/og?v=${encodeURIComponent(a.verdict)}&c=${a.confidence}&t=${encodeURIComponent(thing)}`;
  setPageMeta({ title, description, url, image });
}

type JudgeResponse = {
  ok: boolean;
  engine?: string;
  thing?: string;
  analysis?: Analysis;
  error?: string;
};

type JudgeOk = { analysis: Analysis; thing?: string; engine?: string };

/** Same subject+engine prefer in this tab → skip the full board theater. */
const judgeCache = new Map<string, JudgeOk>();

const ENGINE_KEY = "iiao_engine_prefer";
type EnginePrefer = "auto" | "ai" | "rules";

function getEnginePrefer(): EnginePrefer {
  const v = (sessionStorage.getItem(ENGINE_KEY) || "auto").toLowerCase();
  if (v === "ai" || v === "rules") return v;
  return "auto";
}

function setEnginePrefer(p: EnginePrefer) {
  sessionStorage.setItem(ENGINE_KEY, p);
}

/** Cycle auto → ai → rules. Hidden: Ctrl+Shift+E */
export function cycleEnginePrefer(): EnginePrefer {
  const cur = getEnginePrefer();
  const next: EnginePrefer =
    cur === "auto" ? "ai" : cur === "ai" ? "rules" : "auto";
  setEnginePrefer(next);
  judgeCache.clear();
  return next;
}

export function enginePreferLabel(p: EnginePrefer): string {
  if (p === "ai") return "engine: AI (forced)";
  if (p === "rules") return "engine: rules (forced)";
  return "engine: auto";
}

const FAST_MS = 420;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

function setLoadPct(
  pctEl: Element | null,
  fillEl: SVGPathElement | null,
  pct: number,
) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  if (pctEl) pctEl.textContent = String(p);
  if (fillEl) fillEl.style.strokeDashoffset = String(100 - p);
}

/** Brief calm beat when the answer is already in hand (cache / rules). */
async function playFastLoad(root: HTMLElement): Promise<void> {
  const board = root.querySelector(".load-board");
  const badge = root.querySelector(".load-board__badge");
  const thinkEl = root.querySelector("#think");
  const hintEl = root.querySelector("#load-hint");
  const pctEl = root.querySelector("#load-pct");
  const fillEl = root.querySelector<SVGPathElement>("#load-gauge-fill");
  const gates = [...root.querySelectorAll<HTMLElement>(".load-gate")];

  board?.classList.add("load-board--fast");
  if (badge) badge.textContent = "cached";
  if (thinkEl) thinkEl.textContent = "already on file…";
  if (hintEl) hintEl.textContent = "skipping the ceremony";
  if (fillEl) {
    fillEl.style.strokeDasharray = "100";
    fillEl.style.transition = "stroke-dashoffset 0.55s ease";
  }

  // Light two gates, not the whole gauntlet
  gates[0]?.classList.add("load-gate--on");
  setLoadPct(pctEl, fillEl, 40);
  await sleep(220);
  gates[0]?.classList.add("load-gate--done");
  gates[1]?.classList.add("load-gate--on");
  setLoadPct(pctEl, fillEl, 88);
  await sleep(280);
  gates.forEach((g) => g.classList.add("load-gate--done", "load-gate--on"));
  setLoadPct(pctEl, fillEl, 100);
  await sleep(160);
}

async function playSlowLoad(
  root: HTMLElement,
  fetchDone: Promise<JudgeOk | null>,
): Promise<JudgeOk | null> {
  const thinkEl = root.querySelector("#think");
  const hintEl = root.querySelector("#load-hint");
  const pctEl = root.querySelector("#load-pct");
  const fillEl = root.querySelector<SVGPathElement>("#load-gauge-fill");
  const gates = [...root.querySelectorAll<HTMLElement>(".load-gate")];

  let thinkI = 0;
  let gateI = 0;
  let pct = 0;
  let result: JudgeOk | null = null;
  let settled = false;

  if (fillEl) {
    fillEl.style.strokeDasharray = "100";
    fillEl.style.strokeDashoffset = "100";
  }

  const tickThink = window.setInterval(() => {
    thinkI = (thinkI + 1) % THINKS.length;
    if (thinkEl) thinkEl.textContent = THINKS[thinkI]!;
  }, 700);

  const tickBoard = window.setInterval(() => {
    if (settled) return;
    if (gateI < gates.length) {
      gates[gateI]?.classList.add("load-gate--on");
      if (gateI > 0) gates[gateI - 1]?.classList.add("load-gate--done");
      if (hintEl) hintEl.textContent = LOAD_GATES[gateI]?.a ?? "";
      gateI += 1;
    } else {
      gates.forEach((g) => g.classList.add("load-gate--done", "load-gate--on"));
    }
    pct = Math.min(92, pct + 11 + Math.floor(Math.random() * 8));
    setLoadPct(pctEl, fillEl, pct);
  }, 480);

  try {
    result = await fetchDone;
  } finally {
    settled = true;
    window.clearInterval(tickThink);
    window.clearInterval(tickBoard);
    gates.forEach((g) => g.classList.add("load-gate--done", "load-gate--on"));
    setLoadPct(pctEl, fillEl, 100);
  }
  return result;
}

async function fetchJudge(subject: string): Promise<JudgeOk | null> {
  try {
    const res = await fetch("/api/judge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, prefer: getEnginePrefer() }),
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
  }
  return null;
}

async function runLoad(
  root: HTMLElement,
  subject: string,
): Promise<JudgeOk> {
  const prefer = getEnginePrefer();
  const key = `${prefer}:${subject.trim().toLowerCase()}`;
  const cached = judgeCache.get(key);
  if (cached) {
    await playFastLoad(root);
    return cached;
  }

  const started = performance.now();
  const fetchDone = fetchJudge(subject);
  // Race a short timer: if answer is back already, don't drag the theater
  const quick = await Promise.race([
    fetchDone.then((r) => ({ kind: "done" as const, r, ms: performance.now() - started })),
    sleep(FAST_MS).then(() => ({ kind: "slow" as const })),
  ]);

  let result: JudgeOk | null;
  if (quick.kind === "done") {
    // Rules / warm edge — calm short beat instead of full gate walk
    result = quick.r;
    if (result) await playFastLoad(root);
  } else {
    result = await playSlowLoad(root, fetchDone);
  }

  if (result) {
    judgeCache.set(key, result);
    return result;
  }
  const fallback: JudgeOk = {
    analysis: analyze(subject, null),
    engine: "rules",
  };
  judgeCache.set(key, fallback);
  return fallback;
}

function bindHome(root: HTMLElement) {
  bindCompose(root, "compose", "subject");
  root.querySelectorAll<HTMLButtonElement>("[data-ex]").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigate(reportPath(btn.dataset.ex ?? ""));
    });
  });
}

function bindCompose(
  root: HTMLElement,
  formId: string,
  inputId: string,
  opts?: { focus?: boolean },
) {
  const form = root.querySelector<HTMLFormElement>(`#${formId}`);
  const input = root.querySelector<HTMLInputElement>(`#${inputId}`);
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input?.value.trim();
    if (!v) return;
    navigate(reportPath(v));
  });
  if (opts?.focus) {
    // After paint so mobile keyboards and scroll settle
    window.requestAnimationFrame(() => input?.focus());
  }
}

function bindReport(root: HTMLElement, a: Analysis) {
  bindCompose(root, "compose-again", "subject-again", { focus: true });
  root.querySelector("#btn-copy")?.addEventListener("click", async () => {
    const url = `${location.origin}${reportPath(a.subject)}`;
    const thing = boardVoice(a.stamp || a.subject);
    const head = `${verdictDisplay(a.verdict)} · ${a.confidence}% — ${thing}`;
    const body = [head, a.subtitle, ...(a.roast ?? []).slice(1, 3)]
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
    setPageMeta({
      title: "Is it an OS?",
      description:
        "Paste a link, or describe a product or idea. We will tell you if it is an OS.",
      url: location.origin + "/",
    });
    bindNav(mount);
    bindHome(mount);
    return;
  }

  if (route.name === "board") {
    const prev = (mount as HTMLElement & { __boardTick?: number }).__boardTick;
    if (prev) window.clearInterval(prev);
    await renderBoard(mount);
    return;
  }

  mount.innerHTML = loadingView(route.subject);
  document.title = `Judging… ${route.subject.slice(0, 48)}`;
  bindNav(mount);

  const { analysis, thing, engine } = await runLoad(mount, route.subject);
  if (token !== runToken) return;

  const path = reportPath(route.subject);
  if (location.pathname + location.search !== path) {
    history.replaceState({}, "", path);
  }

  mount.innerHTML = reportView(analysis, { thing, engine });
  reportSocial(
    analysis,
    boardVoice(thing || analysis.stamp || route.subject),
  );
  bindNav(mount);
  bindReport(mount, analysis);
}
