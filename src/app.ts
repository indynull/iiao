import { analyze } from "./analyze/engine";
import type { Analysis, ProbeResult } from "./analyze/types";
import { navigate, parseLocation, reportPath } from "./routes";

const EXAMPLES = [
  "a shoe",
  "my toaster",
  "the group chat",
  "https://www.cloudflare.com/",
  "https://kernel.org/",
  "emacs",
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
  return shell(`
    <main class="stage stage--load">
      <p class="thinking" id="think">thinking…</p>
      <p class="subject-quiet">${esc(subject)}</p>
    </main>
  `);
}

function answerClass(v: string): string {
  if (v === "YES") return "answer--yes";
  if (v === "NO") return "answer--no";
  return "answer--kinda";
}

function reportView(a: Analysis): string {
  const answer = a.verdict; // YES | NO | KINDA
  const line = a.subtitle;
  const sub = a.stamp;

  return shell(`
    <main class="stage stage--result">
      <p class="about">${esc(a.subject)}</p>
      <h1 class="answer ${answerClass(answer)}">${esc(answer)}</h1>
      <p class="line">${esc(line)}</p>
      ${sub ? `<p class="subline">${esc(sub)}</p>` : ""}
      <p class="pct">${a.confidence}%</p>
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

async function probeUrl(subject: string): Promise<ProbeResult | null> {
  try {
    const u = new URL(subject.includes("://") ? subject : `https://${subject}`);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    const res = await fetch(`/api/probe?url=${encodeURIComponent(u.toString())}`);
    if (!res.ok) return { ok: false, error: `http ${res.status}` };
    return (await res.json()) as ProbeResult;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const THINKS = [
  "thinking…",
  "consulting the shoe council…",
  "checking for a kernel…",
  "almost…",
];

async function runLoad(root: HTMLElement, subject: string): Promise<Analysis> {
  const el = root.querySelector("#think");
  let i = 0;
  const t = window.setInterval(() => {
    i = (i + 1) % THINKS.length;
    if (el) el.textContent = THINKS[i]!;
  }, 450);
  const [, probe] = await Promise.all([sleep(900), probeUrl(subject)]);
  window.clearInterval(t);
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
      navigate(reportPath(btn.dataset.ex ?? ""));
    });
  });
}

function bindReport(root: HTMLElement, a: Analysis) {
  root.querySelector("#btn-copy")?.addEventListener("click", async () => {
    const url = `${location.origin}${reportPath(a.subject)}`;
    const text = `${a.verdict} — ${a.subtitle}\n${url}`;
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

  const analysis = await runLoad(mount, route.subject);
  if (token !== runToken) return;

  const path = reportPath(route.subject);
  if (location.pathname + location.search !== path) {
    history.replaceState({}, "", path);
  }

  mount.innerHTML = reportView(analysis);
  bindNav(mount);
  bindReport(mount, analysis);
}
