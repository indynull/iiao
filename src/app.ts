import { analyze } from "./analyze/engine";
import type { Analysis, ProbeResult } from "./analyze/types";
import { navigate, parseLocation, reportPath } from "./routes";
import "./viz/gauge";
import "./viz/radar";
import "./viz/tree";
import "./viz/bars";
import type { IiaoRadar } from "./viz/radar";
import type { IiaoTree } from "./viz/tree";
import type { IiaoBars } from "./viz/bars";

const EXAMPLES = [
  "https://www.cloudflare.com/",
  "https://www.gnu.org/software/emacs/",
  "https://kernel.org/",
  "https://www.microsoft.com/windows",
  "a toaster with Wi‑Fi",
  "my calendar app",
];

const LOADING_LINES = [
  "asking Multics if this counts…",
  "checking for a bootloader (emotional)…",
  "scanning for the word “platform”…",
  "consulting three raccoons in a trench coat…",
  "measuring ring‑0 cosplay density…",
  "negotiating with the marketing department…",
  "looking for a kernel under the pricing table…",
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
    <div class="shell">
      <header class="topbar">
        <a class="brand" href="/" data-nav="/">
          <span class="brand__mark" aria-hidden="true"></span>
          <span class="brand__text">
            <span class="brand__name">Is it an OS?</span>
            <span class="brand__sub">no it isn't (probably)</span>
          </span>
        </a>
        <span class="pill">free judgments · paid therapy not included</span>
      </header>
      ${inner}
      <footer class="footer">
        <span>algor.ist · not a real standards body</span>
        <span>share the link · ruin a product meeting</span>
      </footer>
    </div>
    <div class="toast" id="toast" role="status"></div>
  `;
}

function homeView(): string {
  return shell(`
    <section class="hero">
      <div>
        <p class="hero__kicker">the internet's least useful standards body</p>
        <h1>Is it <em>an OS?</em></h1>
        <p class="hero__lead">
          Paste a link. We will decide — with charts — whether it's an operating system
          or just a website that said something unhinged in a press release.
        </p>
      </div>
      <form class="compose" id="compose" autocomplete="off">
        <div class="compose__row">
          <label class="sr-only" for="subject">URL or claim</label>
          <input id="subject" name="subject" type="text" inputmode="url"
            placeholder="https://your-favorite-crime.com"
            required maxlength="2048" />
          <button class="btn btn--primary" type="submit">Judge</button>
        </div>
        <p class="compose__hint">works on products, repos, toasters, and lies</p>
        <div class="examples" id="examples">
          ${EXAMPLES.map((e) => `<button type="button" class="chip" data-ex="${esc(e)}">${esc(e)}</button>`).join("")}
        </div>
      </form>
    </section>
  `);
}

function pipelineView(subject: string): string {
  return shell(`
    <section class="loading">
      <p class="hero__kicker">hold please</p>
      <h1 class="verdict-title" style="font-family:var(--serif);font-size:clamp(1.8rem,4vw,2.6rem);margin:0 0 0.75rem">
        Deciding…
      </h1>
      <p class="loading__subject">${esc(subject)}</p>
      <p class="loading__line" id="load-line">${esc(LOADING_LINES[0]!)}</p>
      <div class="loading__bar" aria-hidden="true"><span></span></div>
    </section>
  `);
}

function signalChips(a: Analysis): string {
  const funny: Record<string, string> = {
    os: "said OS",
    kernel: "kernel cosplay",
    hardware: "touched metal",
    schedule: "has processes?",
    platform: "platform™",
    saas: "SaaS energy",
    pricing: "pricing page",
    cloud: "cloud vibes",
    browser: "it's a website",
    security: "security theater",
    openSource: "open source aura",
    ai: "AI-washed",
  };
  const chips = (a.signalStats ?? [])
    .filter((s) => s.count > 0)
    .sort((x, y) => y.count - x.count)
    .slice(0, 8)
    .map(
      (s) =>
        `<span class="schip"><b>${s.count}×</b> ${esc(funny[s.key] ?? s.label)}</span>`,
    )
    .join("");
  return chips || `<span class="schip schip--empty">said nothing useful</span>`;
}

function reportView(a: Analysis): string {
  const roast = (a.roast?.length ? a.roast : a.findings) ?? [];
  const hotCriteria = [...a.criteria]
    .sort((x, y) => Math.abs(y.score - 0.5) - Math.abs(x.score - 0.5))
    .slice(0, 4);

  return shell(`
    <section>
      <div class="actions">
        <button class="btn btn--ghost" type="button" id="btn-copy">Share this insult</button>
        <button class="btn btn--ghost" type="button" id="btn-again">Judge something else</button>
      </div>

      <div class="report-head">
        <article class="card card--paper">
          <div class="meta-row">
            ${a.host ? `<span class="tag">${esc(a.host)}</span>` : ""}
            <span class="tag">${a.confidence}% OS</span>
          </div>
          <h1 class="verdict-title">${esc(a.verdict)}</h1>
          <p class="verdict-sub">${esc(a.subtitle)}</p>
          <div class="subject-line">${esc(a.subject)}</div>
          <div class="stamp">${esc(a.stamp)}</div>
        </article>
        <article class="card gauge-card">
          <iiao-gauge value="${a.confidence}" label="os-ness"></iiao-gauge>
        </article>
      </div>

      <article class="card card--roast" style="margin-bottom:1rem">
        <div class="roast">
          ${roast.map((line) => `<p class="roast__p">${esc(line)}</p>`).join("")}
        </div>
        <div class="schips" style="margin-top:1.1rem">${signalChips(a)}</div>
      </article>

      ${
        a.redFlags.length
          ? `<article class="card" style="margin-bottom:1rem">
        <h2 class="section-title">hot takes</h2>
        <ul class="listy listy--hot">
          ${a.redFlags.map((f) => `<li>${esc(f)}</li>`).join("")}
        </ul>
      </article>`
          : ""
      }

      <article class="card" style="margin-bottom:1rem">
        <h2 class="section-title">awkward questions</h2>
        <iiao-tree id="tree"></iiao-tree>
      </article>

      <div class="grid-2">
        <article class="card">
          <h2 class="section-title">vibe circle</h2>
          <iiao-radar id="radar"></iiao-radar>
        </article>
        <article class="card">
          <h2 class="section-title">scoreboard</h2>
          <div class="bars" id="mini-bars">
            ${hotCriteria
              .map(
                (c, i) => `
              <div class="bar-row" style="--i:${i}">
                <div class="bar-row__meta">
                  <span class="bar-row__label">${esc(c.label)}</span>
                  <span class="bar-row__score">${Math.round(c.score * 100)}</span>
                </div>
                <div class="bar-row__track">
                  <div class="bar-row__fill" style="--w:${c.score}"></div>
                </div>
                <p class="bar-row__note">${esc(c.note)}</p>
              </div>`,
              )
              .join("")}
          </div>
        </article>
      </div>
    </section>
  `);
}

function toast(msg: string) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 2200);
}

async function probeUrl(subject: string): Promise<ProbeResult | null> {
  try {
    const u = new URL(subject.includes("://") ? subject : `https://${subject}`);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    const res = await fetch(`/api/probe?url=${encodeURIComponent(u.toString())}`);
    if (!res.ok) return { ok: false, error: `http ${res.status}` };
    return (await res.json()) as ProbeResult;
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runLoading(root: HTMLElement, subject: string): Promise<Analysis> {
  const lineEl = root.querySelector("#load-line");
  let i = 0;
  const tick = window.setInterval(() => {
    i = (i + 1) % LOADING_LINES.length;
    if (lineEl) lineEl.textContent = LOADING_LINES[i]!;
  }, 700);

  const probePromise = probeUrl(subject);
  // Minimum comedy delay so the lines can land
  const [, probe] = await Promise.all([sleep(1600), probePromise]);
  window.clearInterval(tick);
  return analyze(subject, probe);
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
      const v = btn.dataset.ex ?? "";
      if (input) input.value = v;
      navigate(reportPath(v));
    });
  });
}

function bindReport(root: HTMLElement, a: Analysis) {
  const radar = root.querySelector<IiaoRadar>("#radar");
  const tree = root.querySelector<IiaoTree>("#tree");
  if (radar) radar.data = a.radar;
  if (tree) tree.tree = a.tree;

  root.querySelector("#btn-copy")?.addEventListener("click", async () => {
    const url = `${location.origin}${reportPath(a.subject)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Copied. Go start a fight.");
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

  mount.innerHTML = pipelineView(route.subject);
  bindNav(mount);

  const analysis = await runLoading(mount, route.subject);
  if (token !== runToken) return;

  const path = reportPath(route.subject);
  if (location.pathname + location.search !== path) {
    history.replaceState({}, "", path);
  }

  mount.innerHTML = reportView(analysis);
  bindNav(mount);
  bindReport(mount, analysis);
}
