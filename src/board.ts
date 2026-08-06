/** Owner-only telemetry backdoor — not linked from the public UI. */

import { navigate } from "./routes";

const TOKEN_KEY = "iiao_board_token";

type TelemetryEvent = {
  ts?: string;
  thing?: string;
  inputKind?: string;
  answer?: string;
  confidence?: number;
  engine?: string;
  model?: string | null;
  thingSource?: string;
  host?: string;
};

type TelemetryPayload = {
  ok: boolean;
  error?: string;
  stats?: {
    total: number;
    byAnswer?: Record<string, number>;
    byEngine?: Record<string, number>;
    byModel?: Record<string, number>;
    byKind?: Record<string, number>;
    updatedAt?: string;
  };
  topThings?: { thing: string; count: number }[];
  recent?: TelemetryEvent[];
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getToken(): string {
  return (sessionStorage.getItem(TOKEN_KEY) || "").trim();
}

function setToken(t: string) {
  sessionStorage.setItem(TOKEN_KEY, t.trim());
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

/** Swallow ?token= into sessionStorage and clean the URL. */
export function absorbTokenFromQuery(): void {
  const q = new URLSearchParams(location.search);
  const t = q.get("token")?.trim();
  if (!t) return;
  setToken(t);
  q.delete("token");
  const next = q.toString();
  history.replaceState(
    {},
    "",
    location.pathname + (next ? `?${next}` : "") + location.hash,
  );
}

function loginView(err?: string): string {
  return `
    <main class="stage stage--board">
      <h1 class="board-title">Board desk</h1>
      <p class="board-sub">Owner telemetry. Not linked from the public site.</p>
      ${err ? `<p class="board-err">${esc(err)}</p>` : ""}
      <form class="box box--try" id="board-login" autocomplete="off">
        <label class="sr-only" for="board-token">Telemetry token</label>
        <input id="board-token" type="password" name="token"
          placeholder="TELEMETRY_TOKEN" required autocomplete="current-password" />
        <button type="submit">Open</button>
      </form>
      <p class="board-hint">Or open <code>/board?token=…</code> once — it sticks for this tab.</p>
    </main>
  `;
}

function dashShell(): string {
  return `
    <main class="stage stage--board">
      <header class="board-head">
        <div>
          <h1 class="board-title">Board desk</h1>
          <p class="board-sub" id="board-updated">loading…</p>
        </div>
        <div class="board-actions">
          <button type="button" class="btn btn--ghost" id="board-refresh">Refresh</button>
          <button type="button" class="btn btn--ghost" id="board-logout">Lock</button>
        </div>
      </header>
      <div id="board-body" class="board-body">
        <p class="board-sub">Fetching…</p>
      </div>
    </main>
  `;
}

function fmtTime(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function barRow(label: string, n: number, max: number): string {
  const pct = max > 0 ? Math.round((n / max) * 100) : 0;
  return `
    <div class="board-bar">
      <span class="board-bar__l">${esc(label)}</span>
      <span class="board-bar__n">${n}</span>
      <span class="board-bar__t"><span style="width:${pct}%"></span></span>
    </div>`;
}

function renderDash(data: TelemetryPayload): string {
  const s = data.stats || { total: 0 };
  const byA = s.byAnswer || {};
  const byE = s.byEngine || {};
  const byK = s.byKind || {};
  const byM = s.byModel || {};
  const top = data.topThings || [];
  const recent = data.recent || [];
  const maxTop = Math.max(1, ...top.map((t) => t.count));
  const maxAns = Math.max(1, ...Object.values(byA));

  return `
    <div class="board-cards">
      <div class="board-card"><span class="board-card__k">Total</span><span class="board-card__v">${s.total}</span></div>
      <div class="board-card board-card--yes"><span class="board-card__k">Yes</span><span class="board-card__v">${byA.YES ?? 0}</span></div>
      <div class="board-card board-card--no"><span class="board-card__k">No</span><span class="board-card__v">${byA.NO ?? 0}</span></div>
      <div class="board-card board-card--kinda"><span class="board-card__k">Kinda</span><span class="board-card__v">${byA.KINDA ?? 0}</span></div>
    </div>

    <div class="board-grid">
      <section class="board-panel">
        <h2 class="section__label">By engine</h2>
        ${Object.entries(byE)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => barRow(k, v, Math.max(1, ...Object.values(byE))))
          .join("") || "<p class='board-sub'>none yet</p>"}
      </section>
      <section class="board-panel">
        <h2 class="section__label">By kind</h2>
        ${Object.entries(byK)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => barRow(k, v, Math.max(1, ...Object.values(byK))))
          .join("") || "<p class='board-sub'>none yet</p>"}
      </section>
      <section class="board-panel">
        <h2 class="section__label">By answer</h2>
        ${Object.entries(byA)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => barRow(k, v, maxAns))
          .join("") || "<p class='board-sub'>none yet</p>"}
      </section>
      <section class="board-panel">
        <h2 class="section__label">By model</h2>
        ${Object.entries(byM)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) =>
            barRow(k.replace("@cf/meta/", ""), v, Math.max(1, ...Object.values(byM))),
          )
          .join("") || "<p class='board-sub'>none yet</p>"}
      </section>
    </div>

    <section class="board-panel board-panel--wide">
      <h2 class="section__label">Top things</h2>
      <div class="board-top">
        ${
          top.length
            ? top
                .map(
                  (t) => `
          <div class="board-top__row">
            <span class="board-top__n">${t.count}</span>
            <span class="board-top__t">${esc(t.thing)}</span>
            <span class="board-top__bar"><span style="width:${Math.round((t.count / maxTop) * 100)}%"></span></span>
          </div>`,
                )
                .join("")
            : "<p class='board-sub'>none yet</p>"
        }
      </div>
    </section>

    <section class="board-panel board-panel--wide">
      <h2 class="section__label">Recent (${recent.length})</h2>
      <div class="board-feed">
        ${
          recent.length
            ? recent
                .map((e) => {
                  const ans = (e.answer || "?").toUpperCase();
                  const cls =
                    ans === "YES"
                      ? "yes"
                      : ans === "NO"
                        ? "no"
                        : ans === "KINDA"
                          ? "kinda"
                          : "";
                  return `
          <article class="board-ev">
            <span class="board-ev__a board-ev__a--${cls}">${esc(ans)}</span>
            <div class="board-ev__body">
              <p class="board-ev__thing">${esc(e.thing || "—")}</p>
              <p class="board-ev__meta">
                ${esc(fmtTime(e.ts))}
                · ${esc(e.engine || "?")}
                ${e.host ? ` · ${esc(e.host)}` : ""}
                ${e.confidence != null ? ` · ${e.confidence}%` : ""}
                ${e.inputKind ? ` · ${esc(e.inputKind)}` : ""}
              </p>
            </div>
          </article>`;
                })
                .join("")
            : "<p class='board-sub'>none yet</p>"
        }
      </div>
    </section>
  `;
}

async function fetchTelemetry(token: string): Promise<TelemetryPayload> {
  const res = await fetch("/api/telemetry", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as TelemetryPayload;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function renderBoard(mount: HTMLElement): Promise<void> {
  absorbTokenFromQuery();
  document.title = "Board desk · iiao";
  // discourage indexing if someone links it
  let robots = document.head.querySelector(
    'meta[name="robots"]',
  ) as HTMLMetaElement | null;
  if (!robots) {
    robots = document.createElement("meta");
    robots.name = "robots";
    document.head.appendChild(robots);
  }
  robots.content = "noindex, nofollow";

  const token = getToken();
  if (!token) {
    mount.innerHTML = shell(loginView());
    bindLogin(mount);
    return;
  }

  mount.innerHTML = shell(dashShell());
  bindDashChrome(mount);

  const body = mount.querySelector("#board-body");
  const updated = mount.querySelector("#board-updated");
  try {
    const data = await fetchTelemetry(token);
    if (body) body.innerHTML = renderDash(data);
    if (updated) {
      updated.textContent = `updated ${fmtTime(data.stats?.updatedAt)} · auto every 20s`;
    }
  } catch (e) {
    clearToken();
    const msg = e instanceof Error ? e.message : "unauthorized";
    mount.innerHTML = shell(loginView(msg === "unauthorized" ? "Bad token." : msg));
    bindLogin(mount);
    return;
  }

  // auto-refresh
  const tick = window.setInterval(async () => {
    const t = getToken();
    if (!t || !document.querySelector("#board-body")) {
      window.clearInterval(tick);
      return;
    }
    try {
      const data = await fetchTelemetry(t);
      const b = document.querySelector("#board-body");
      const u = document.querySelector("#board-updated");
      if (b) b.innerHTML = renderDash(data);
      if (u) u.textContent = `updated ${fmtTime(data.stats?.updatedAt)} · auto every 20s`;
    } catch {
      /* keep last paint */
    }
  }, 20_000);

  // store interval on element so re-renders don't stack forever
  (mount as HTMLElement & { __boardTick?: number }).__boardTick = tick;
}

function shell(inner: string): string {
  return `
    <div class="page page--board">
      ${inner}
      <footer class="foot">
        <a href="/" data-nav="/">is it an os?</a>
        <span class="foot__dot">·</span>
        <span>board desk</span>
      </footer>
    </div>
    <div class="toast" id="toast" role="status"></div>
  `;
}

function bindLogin(root: HTMLElement) {
  root.querySelectorAll<HTMLAnchorElement>("[data-nav]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(a.dataset.nav || "/");
    });
  });
  root.querySelector("#board-login")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = root.querySelector<HTMLInputElement>("#board-token");
    const v = input?.value.trim();
    if (!v) return;
    setToken(v);
    void renderBoard(root);
  });
}

function bindDashChrome(root: HTMLElement) {
  root.querySelectorAll<HTMLAnchorElement>("[data-nav]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const prev = (root as HTMLElement & { __boardTick?: number }).__boardTick;
      if (prev) window.clearInterval(prev);
      navigate(a.dataset.nav || "/");
    });
  });
  root.querySelector("#board-logout")?.addEventListener("click", () => {
    const prev = (root as HTMLElement & { __boardTick?: number }).__boardTick;
    if (prev) window.clearInterval(prev);
    clearToken();
    void renderBoard(root);
  });
  root.querySelector("#board-refresh")?.addEventListener("click", () => {
    void renderBoard(root);
  });
}
