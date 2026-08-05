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

/** Fetch a URL and extract structure used by the client-side determination. */
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
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "IIAO-Laboratory/0.3 (+https://iiao.algor.ist; content probe for satire)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
      },
    });
    const buf = await res.arrayBuffer();
    const max = 350_000;
    const slice = buf.byteLength > max ? buf.slice(0, max) : buf;
    const html = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    const extracted = extract(html, res.url || url.toString());

    return c.json({
      ok: true,
      status: res.status,
      finalUrl: res.url,
      bytes: buf.byteLength,
      host: safeHost(res.url || url.toString()),
      ...extracted,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "probe failed";
    return c.json({ ok: false, error: msg }, 200);
  } finally {
    clearTimeout(timer);
  }
});

function safeHost(u: string): string | undefined {
  try {
    return new URL(u).hostname;
  } catch {
    return undefined;
  }
}

function pickMeta(html: string, re: RegExp): string | undefined {
  const m = html.match(re);
  return m?.[1]?.trim();
}

function clean(s: string | undefined, max = 280): string | undefined {
  if (!s) return undefined;
  const t = s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return undefined;
  return t.slice(0, max);
}

function stripNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function headings(html: string): string[] {
  const out: string[] = [];
  const re = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 12) {
    const t = clean(m[2], 120);
    if (t && t.length > 2) out.push(t);
  }
  return out;
}

function visibleText(html: string): string {
  const stripped = stripNoise(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.slice(0, 8000);
}

function count(re: RegExp, text: string): number {
  const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
  const r = new RegExp(re.source, flags);
  return (text.match(r) || []).length;
}

function extract(html: string, finalUrl: string) {
  const title = clean(
    pickMeta(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    200,
  );
  const description = clean(
    pickMeta(
      html,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ) ||
      pickMeta(
        html,
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
      ) ||
      pickMeta(
        html,
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      ),
    400,
  );
  const ogTitle = clean(
    pickMeta(
      html,
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    ),
    200,
  );
  const hs = headings(html);
  const text = visibleText(html);
  const blob = [title, ogTitle, description, hs.join(" "), text, finalUrl]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const signals = {
    os: count(/\boperating systems?\b|\bos\b|cloudflare os/g, blob),
    kernel: count(/\bkernel\b|\bring[-\s]?0\b|\bsyscall/g, blob),
    hardware: count(
      /\bhardware\b|\bcpu\b|\bgpu\b|\bbare[-\s]?metal\b|\bfirmware\b|\bdevice driver/g,
      blob,
    ),
    schedule: count(
      /\bschedul(e|er|ing)\b|\bprocess(es)?\b|\bthread(s)?\b|\bpreempt/g,
      blob,
    ),
    platform: count(/\bplatform\b|\becosystem\b|\binfrastructure\b/g, blob),
    saas: count(
      /\bsaas\b|\bdashboard\b|\bpricing\b|\benterprise\b|\bsubscribe\b|\bfree trial\b|\bget started\b/g,
      blob,
    ),
    browser: count(
      /\bbrowser\b|\bchrome\b|\belectron\b|\bwebkit\b|\bfirefox\b|\bspa\b|\breact\b|\bjavascript\b/g,
      blob,
    ),
    cloud: count(
      /\bcloud\b|\bedge\b|\bserverless\b|\bcdn\b|\bworkers?\b|\bkubernetes\b|\bcontainer/g,
      blob,
    ),
    pricing: count(
      /\bpricing\b|\b\$\d|\bper month\b|\bbilling\b|\bplans?\b/g,
      blob,
    ),
    openSource: count(
      /\bopen[-\s]?source\b|\bgithub\b|\blicen[cs]e\b|\bposix\b|\bunix\b|\blinux\b/g,
      blob,
    ),
    security: count(
      /\bsecur(e|ity)\b|\bisolat(e|ion)\b|\bsandbox\b|\bzero[-\s]?trust\b|\bencrypt/g,
      blob,
    ),
    ai: count(/\bai\b|\bllm\b|\bmachine learning\b|\bagent(s)?\b|\bmodel\b/g, blob),
  };

  // Distinctive phrases: short headings + title words
  const phrases: string[] = [];
  if (title) phrases.push(title);
  if (description) phrases.push(description.slice(0, 160));
  for (const h of hs.slice(0, 6)) phrases.push(h);

  return {
    title: title || ogTitle,
    description,
    headings: hs,
    textSample: text.slice(0, 2500),
    phrases: phrases.slice(0, 10),
    signals,
  };
}

/** API only — static SPA served by Workers Assets (see wrangler.toml). */
export default app;
