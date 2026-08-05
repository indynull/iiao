import { Hono } from "hono";
import { cors } from "hono/cors";

export type Env = {
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({ origin: "*", allowMethods: ["GET", "OPTIONS"] }),
);

app.get("/api/health", (c) =>
  c.json({ ok: true, service: "iiao", joke: "still not an OS" }),
);

/** Light probe: fetch URL, pull title/description. Chaos fuel, not a crawler. */
app.get("/api/probe", async (c) => {
  const raw = c.req.query("url")?.trim();
  if (!raw) return c.json({ ok: false, error: "missing url" }, 400);

  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return c.json({ ok: false, error: "invalid url" }, 400);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    return c.json({ ok: false, error: "only http(s)" }, 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "IIAO-Laboratory/0.2 (+https://iiao.algor.ist; comedy probe)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const buf = await res.arrayBuffer();
    const max = 200_000;
    const slice = buf.byteLength > max ? buf.slice(0, max) : buf;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    const title = pickMeta(text, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description =
      pickMeta(text, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      pickMeta(text, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ||
      pickMeta(text, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);

    return c.json({
      ok: true,
      status: res.status,
      title: clean(title),
      description: clean(description),
      finalUrl: res.url,
      bytes: buf.byteLength,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "probe failed";
    return c.json({ ok: false, error: msg }, 200);
  } finally {
    clearTimeout(timer);
  }
});

function pickMeta(html: string, re: RegExp): string | undefined {
  const m = html.match(re);
  return m?.[1]?.trim();
}

function clean(s: string | undefined): string | undefined {
  if (!s) return undefined;
  return s.replace(/\s+/g, " ").trim().slice(0, 280);
}

/** API only — static SPA served by Workers Assets (see wrangler.toml). */
export default app;
