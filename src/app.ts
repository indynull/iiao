import { analyze, pipelineFor } from "./analyze/engine";
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
  "the browser tab I'm ignoring",
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
            <span class="brand__sub">IIAO Laboratory</span>
          </span>
        </a>
        <span class="pill">pure chaos · peer-unreviewed</span>
      </header>
      ${inner}
      <footer class="footer">
        <span>algor.ist / iiao · theatrical methodology</span>
        <span>permalinks encode the subject · no backend ledger</span>
      </footer>
    </div>
    <div class="toast" id="toast" role="status"></div>
  `;
}

function homeView(): string {
  return shell(`
    <section class="hero">
      <div>
        <p class="hero__kicker">Ministry of OS Determination</p>
        <h1>Is it <em>an OS?</em></h1>
        <p class="hero__lead">
          Paste a link to <strong>anything</strong> — a product, a repo, a rumor, a toaster.
          We run a solemn, chaotic audit and stamp a confidence score.
          Inspired by things that are absolutely not operating systems but said the quiet part with a product name.
        </p>
      </div>
      <form class="compose" id="compose" autocomplete="off">
        <div class="compose__row">
          <label class="sr-only" for="subject">URL or claim</label>
          <input id="subject" name="subject" type="text" inputmode="url"
            placeholder="https://anything.example — or free-form chaos"
            required maxlength="2048" />
          <button class="btn btn--primary" type="submit">Determine</button>
        </div>
        <p class="compose__hint">Shareable case files live at /is/&lt;token&gt; · same subject → same chaos</p>
        <div class="examples" id="examples">
          ${EXAMPLES.map((e) => `<button type="button" class="chip" data-ex="${esc(e)}">${esc(e)}</button>`).join("")}
        </div>
      </form>
      <div class="feature-grid">
        <article class="feature">
          <h3>Decision trees</h3>
          <p>Branching bureaucracy until comedy saturates. Chaos paths included free of charge.</p>
        </article>
        <article class="feature">
          <h3>Instrument panel</h3>
          <p>Radar, gauges, axis bars — as if rigor were a visual style guide.</p>
        </article>
        <article class="feature">
          <h3>Permalinks</h3>
          <p>Encode any subject in the path. Send the roast. No accounts. No mercy.</p>
        </article>
      </div>
    </section>
  `);
}

function pipelineView(subject: string): string {
  const steps = pipelineFor(subject);
  return shell(`
    <section>
      <p class="hero__kicker">Case opening</p>
      <h1 class="verdict-title" style="font-family:var(--serif);font-size:clamp(1.8rem,4vw,2.4rem);margin:0 0 1rem">
        Analyzing subject…
      </h1>
      <p class="subject-line" style="border:none;padding:0;margin:0 0 1rem;color:var(--muted)">${esc(subject)}</p>
      <div class="pipeline" id="pipeline">
        <div class="pipeline__head">
          <span>IIAO pipeline</span>
          <span id="pipe-status">running</span>
        </div>
        <ul class="pipeline__list">
          ${steps
            .map(
              (s) => `
            <li class="pipeline__item" data-id="${s.id}" data-status="pending" data-ms="${Math.round(s.ms)}">
              <span class="pipeline__dot" aria-hidden="true"></span>
              <div>
                <div class="pipeline__label">${esc(s.label)}</div>
                <p class="pipeline__blurb">${esc(s.blurb)}</p>
              </div>
              <span class="pipeline__ms">—</span>
            </li>`,
            )
            .join("")}
        </ul>
      </div>
    </section>
  `);
}

function reportView(a: Analysis): string {
  const probeBits = a.probe?.ok
    ? `title: ${a.probe.title ?? "—"}\ndesc: ${a.probe.description ?? "—"}\nstatus: ${a.probe.status ?? "—"}\nfinal: ${a.probe.finalUrl ?? "—"}`
    : a.probe?.error
      ? `probe: ${a.probe.error}`
      : "probe: skipped / unavailable";

  return shell(`
    <section>
      <div class="actions">
        <button class="btn btn--ghost" type="button" id="btn-copy">Copy permalink</button>
        <button class="btn btn--ghost" type="button" id="btn-again">New determination</button>
        <a class="btn btn--ghost" href="${reportPath(a.subject)}" id="permalink">${esc(location.origin)}${reportPath(a.subject)}</a>
      </div>

      <div class="report-head">
        <article class="card card--paper">
          <div class="meta-row">
            <span class="tag">${esc(a.caseId)}</span>
            <span class="tag">seed ${esc(a.seed)}</span>
            <span class="tag">${esc(a.kind)}</span>
          </div>
          <h1 class="verdict-title">${esc(a.verdict)}</h1>
          <p class="verdict-sub">${esc(a.subtitle)}</p>
          <div class="subject-line">${esc(a.subject)}</div>
          <div class="stamp">${esc(a.stamp)}</div>
        </article>
        <article class="card gauge-card">
          <iiao-gauge value="${a.confidence}" label="OS confidence"></iiao-gauge>
        </article>
      </div>

      <div class="grid-2">
        <article class="card">
          <h2 class="section-title">Decision tree</h2>
          <iiao-tree id="tree"></iiao-tree>
        </article>
        <article class="card">
          <h2 class="section-title">Axis radar</h2>
          <iiao-radar id="radar"></iiao-radar>
        </article>
      </div>

      <article class="card" style="margin-bottom:1rem">
        <h2 class="section-title">Criterion scores</h2>
        <iiao-bars id="bars"></iiao-bars>
      </article>

      <div class="grid-2">
        <article class="card">
          <h2 class="section-title">Red flags</h2>
          <ul class="listy listy--hot">
            ${a.redFlags.map((f) => `<li>${esc(f)}</li>`).join("")}
          </ul>
        </article>
        <article class="card">
          <h2 class="section-title">Endorsements (fabricated)</h2>
          <ul class="listy listy--ice">
            ${a.endorsements.map((f) => `<li>${esc(f)}</li>`).join("")}
          </ul>
        </article>
      </div>

      <div class="grid-2" style="margin-top:1rem">
        <article class="card">
          <h2 class="section-title">Timeline of alleged history</h2>
          <div class="timeline">
            ${a.timeline.map((t) => `
              <div class="timeline__item">
                <div class="timeline__t">${esc(t.t)}</div>
                <div class="timeline__e">${esc(t.event)}</div>
              </div>`).join("")}
          </div>
        </article>
        <article class="card">
          <h2 class="section-title">Probe residue</h2>
          <pre class="probe-box">${esc(probeBits)}</pre>
          <h2 class="section-title" style="margin-top:1.1rem">Methodology</h2>
          <ul class="listy">
            ${a.methodology.map((m) => `<li>${esc(m)}</li>`).join("")}
          </ul>
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
    return { ok: false, error: "not a URL / probe offline" };
  }
}

async function runPipeline(root: HTMLElement, subject: string): Promise<Analysis> {
  const items = [...root.querySelectorAll<HTMLElement>(".pipeline__item")];
  let probe: ProbeResult | null = null;

  for (const item of items) {
    item.dataset.status = "running";
    const ms = Number(item.dataset.ms ?? 300);
    const id = item.dataset.id;
    const started = performance.now();

    if (id === "probe") {
      probe = await probeUrl(subject);
      if (probe && !probe.ok) item.dataset.status = "warn";
    } else {
      await sleep(ms);
    }

    const elapsed = Math.round(performance.now() - started);
    const msEl = item.querySelector(".pipeline__ms");
    if (msEl) msEl.textContent = `${elapsed}ms`;
    if (item.dataset.status === "running") item.dataset.status = "done";
  }

  const status = document.getElementById("pipe-status");
  if (status) status.textContent = "sealed";

  return analyze(subject, probe);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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
  const bars = root.querySelector<IiaoBars>("#bars");
  if (radar) radar.data = a.radar;
  if (tree) tree.tree = a.tree;
  if (bars) bars.items = a.criteria;

  root.querySelector("#btn-copy")?.addEventListener("click", async () => {
    const url = `${location.origin}${reportPath(a.subject)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Permalink copied");
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

  const analysis = await runPipeline(mount, route.subject);
  if (token !== runToken) return;

  // Ensure URL is canonical permalink form
  const path = reportPath(route.subject);
  if (location.pathname + location.search !== path) {
    history.replaceState({}, "", path);
  }

  mount.innerHTML = reportView(analysis);
  bindNav(mount);
  bindReport(mount, analysis);
}
