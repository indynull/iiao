import { analyze } from "./analyze/engine";
import type { Analysis } from "./analyze/types";
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

function engineLabel(engine?: string): string {
  if (engine === "workers-ai") return "Cloudflare Llama";
  if (engine === "rules") return "offline rules";
  return engine || "";
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
  const eng = engineLabel(meta?.engine);

  return shell(`
    <main class="stage stage--result">
      <article class="verdict-card">
        <p class="about">
          ${esc(thing)}
          ${showSource ? `<span class="about__src">from ${esc(a.subject)}</span>` : ""}
        </p>
        <h1 class="answer ${answerClass(answer)}">${esc(answer)}</h1>
        <p class="line">${esc(lead)}</p>
        <div class="meta-row">
          <p class="pct">${a.confidence}% confident</p>
          ${eng ? `<span class="engine-pill" title="How this was judged">${esc(eng)}</span>` : ""}
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
        notes.length
          ? `<section class="section">
        <h2 class="section__label">Systems notes</h2>
        <ul class="notes">
          ${notes
            .map(
              (c) =>
                `<li><span class="notes__k">${esc(c.label)}</span><span>${esc(c.note)}</span></li>`,
            )
            .join("")}
        </ul>
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

const THINKS = [
  "thinking…",
  "finding the product…",
  "asking the model…",
  "almost…",
];

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
  const el = root.querySelector("#think");
  let i = 0;
  const t = window.setInterval(() => {
    i = (i + 1) % THINKS.length;
    if (el) el.textContent = THINKS[i]!;
  }, 500);

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
    window.clearInterval(t);
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
