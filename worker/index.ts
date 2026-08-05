import { Hono } from "hono";
import { cors } from "hono/cors";
import { resolveThing } from "../src/analyze/thing";
import { analyze } from "../src/analyze/engine";
import type { Analysis, ProbeResult } from "../src/analyze/types";

export type Env = {
  ASSETS: Fetcher;
  AI: Ai;
};

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }),
);

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "iiao",
    engine: "workers-ai",
    model: MODEL,
  }),
);

app.get("/api/probe", async (c) => {
  const raw = c.req.query("url")?.trim();
  if (!raw) return c.json({ ok: false, error: "missing url" }, 400);
  const probe = await probeUrl(raw);
  return c.json(probe);
});

/**
 * Main judgment path: resolve product entity → Workers AI (free) → structured result.
 * Falls back to local rules if AI is unavailable.
 */
app.post("/api/judge", async (c) => {
  let body: { subject?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid json" }, 400);
  }
  const subject = body.subject?.trim();
  if (!subject || subject.length > 2048) {
    return c.json({ ok: false, error: "missing subject" }, 400);
  }

  const isUrl = looksLikeUrl(subject);
  let probe: ProbeResult | null = null;
  if (isUrl) {
    probe = await probeUrl(subject);
  }

  const resolved = resolveThing(subject, probe);
  const contextBits = [
    `User input: ${subject}`,
    `Resolved product/thing to judge: ${resolved.thing}`,
    `Resolution: ${resolved.source}`,
    probe?.ok
      ? `Page title: ${probe.title ?? "—"}\nMeta: ${probe.description ?? "—"}\nSnippet: ${(probe.textSample ?? "").slice(0, 900)}`
      : isUrl
        ? `Probe: failed (${probe?.error ?? "n/a"})`
        : "No URL — free-form product/idea description.",
  ].join("\n");

  let analysis: Analysis;
  let engine: "workers-ai" | "rules" = "rules";

  try {
    const aiOut = await runJudge(c.env.AI, resolved.thing, contextBits);
    if (aiOut) {
      analysis = analysisFromAi(subject, resolved.thing, aiOut, probe);
      engine = "workers-ai";
    } else {
      analysis = analyze(resolved.thing, probe);
      // Keep original input in subject for permalink display, but roast about thing
      analysis = {
        ...analysis,
        subject,
        subtitle: analysis.subtitle,
        roast: analysis.roast,
      };
      // Prefer resolved name in about line — put thing first in roast if missing
      if (resolved.thing !== subject) {
        analysis = {
          ...analysis,
          stamp: resolved.thing,
          findings: [`Judging: ${resolved.thing}`, ...analysis.findings],
        };
      }
    }
  } catch {
    analysis = analyze(resolved.thing, probe);
    analysis = {
      ...analysis,
      subject,
      stamp: resolved.thing !== subject ? resolved.thing : analysis.stamp,
    };
  }

  // Always surface the resolved product name for the UI "about" line
  if (resolved.thing && resolved.thing !== subject) {
    analysis = {
      ...analysis,
      subject, // keep original for share URL identity
      stamp: resolved.thing, // UI can show "about Cloudflare OS"
    };
  }

  return c.json({
    ok: true,
    engine,
    thing: resolved.thing,
    thingSource: resolved.source,
    analysis,
  });
});

type AiJudge = {
  answer: "YES" | "NO" | "KINDA";
  confidence: number;
  line: string;
  lines: string[];
  notes?: { label: string; note: string }[];
};

async function runJudge(
  ai: Ai,
  thing: string,
  context: string,
): Promise<AiJudge | null> {
  const system = `You are the deadpan judge for "Is it an OS?" — a satire site.
You commit fully. Never say "far-fetched", "metaphor", "tongue-in-cheek", "the bit", or "just a joke".
State rulings as fact in the style of systems commentary.

Rules of comedy:
- Ordinary objects and weird product ideas often ARE operating systems (boot, kernel, scheduler, isolation, userspace analogies).
- Marketing "platforms", edge CDNs, SaaS dashboards that merely brand themselves "OS" are usually NOT operating systems.
- Real kernels (Linux, Windows, macOS, Android, iOS) ARE operating systems.
- Judge the PRODUCT/THING named, not a blog post, article title, or marketing page format.
- Fridge ≠ toaster: each needs distinct, specific analogies. Never reuse the same lines for different things.

Return ONLY valid JSON (no markdown fences):
{
  "answer": "YES" | "NO" | "KINDA",
  "confidence": 0-100,
  "line": "one sharp lead sentence about the thing",
  "lines": ["2 to 4 more short deadpan paragraphs", "..."],
  "notes": [{"label": "Kernel", "note": "short"}, {"label": "Boot", "note": "short"}]
}`;

  const user = `Judge whether this is an OS.

THING TO JUDGE (this is what answer about): ${thing}

Context (may include a URL/blog — do NOT judge the blog; judge the THING):
${context}`;

  const raw = await ai.run(MODEL, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 700,
    temperature: 0.75,
  });

  const text =
    typeof raw === "object" && raw && "response" in raw
      ? String((raw as { response: string }).response)
      : typeof raw === "string"
        ? raw
        : JSON.stringify(raw);

  return parseAiJson(text);
}

function parseAiJson(text: string): AiJudge | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as Partial<AiJudge>;
    const answer = String(obj.answer || "").toUpperCase();
    if (answer !== "YES" && answer !== "NO" && answer !== "KINDA") return null;
    const line = String(obj.line || "").trim();
    if (!line) return null;
    const lines = Array.isArray(obj.lines)
      ? obj.lines.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
      : [];
    const confidence = Math.min(
      97,
      Math.max(5, Math.round(Number(obj.confidence) || 50)),
    );
    return {
      answer: answer as AiJudge["answer"],
      confidence,
      line,
      lines,
      notes: Array.isArray(obj.notes)
        ? obj.notes
            .map((n) => ({
              label: String((n as { label?: string }).label || "").trim(),
              note: String((n as { note?: string }).note || "").trim(),
            }))
            .filter((n) => n.label && n.note)
            .slice(0, 6)
        : undefined,
    };
  } catch {
    return null;
  }
}

function analysisFromAi(
  originalInput: string,
  thing: string,
  j: AiJudge,
  probe: ProbeResult | null,
): Analysis {
  const notes = j.notes?.length
    ? j.notes
    : [
        { label: "Kernel", note: "See commentary." },
        { label: "Boot", note: "See commentary." },
      ];
  const criteria = notes.map((n, i) => ({
    id: `n${i}`,
    label: n.label,
    weight: 1,
    score: j.answer === "YES" ? 0.85 : j.answer === "NO" ? 0.2 : 0.5,
    note: n.note,
    axis: n.label,
    inputs: [] as string[],
  }));
  const roast = [j.line, ...j.lines];
  return {
    subject: originalInput,
    kind: looksLikeUrl(originalInput) ? "url" : "claim",
    host: probe?.host ?? null,
    seed: "ai",
    caseId: "IIAO-AI",
    confidence: j.confidence,
    verdict: j.answer,
    subtitle: j.line,
    stamp: thing,
    criteria,
    tree: {
      id: "root",
      label: `Is ${thing} an OS?`,
      taken: true,
      outcome: "question",
      children: [],
    },
    radar: criteria.map((c) => ({
      axis: c.axis,
      value: Math.round(c.score * 100),
    })),
    signalStats: [],
    confidenceSteps: [
      { label: "workers-ai", delta: j.confidence, total: j.confidence },
    ],
    timeline: [],
    redFlags: j.lines.slice(0, 2),
    findings: roast,
    roast,
    methodology: [],
    probe,
  };
}

function looksLikeUrl(s: string): boolean {
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    return u.hostname.includes(".");
  } catch {
    return false;
  }
}

async function probeUrl(raw: string): Promise<ProbeResult> {
  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: "invalid url" };
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    return { ok: false, error: "only http(s)" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "IIAO/0.4 (+https://iiao.algor.ist; product probe)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
      },
    });
    const buf = await res.arrayBuffer();
    const max = 350_000;
    const slice = buf.byteLength > max ? buf.slice(0, max) : buf;
    const html = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    const extracted = extract(html, res.url || url.toString());
    return {
      ok: true,
      status: res.status,
      finalUrl: res.url,
      bytes: buf.byteLength,
      host: safeHost(res.url || url.toString()),
      ...extracted,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "probe failed";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

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
  return stripNoise(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

function count(re: RegExp, text: string): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  return (text.match(new RegExp(re.source, flags)) || []).length;
}

function extract(html: string, finalUrl: string) {
  const title = clean(pickMeta(html, /<title[^>]*>([\s\S]*?)<\/title>/i), 200);
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

  return {
    title: title || ogTitle,
    description,
    headings: hs,
    textSample: text.slice(0, 2500),
    phrases: [title, description, ...hs.slice(0, 4)].filter(Boolean) as string[],
    signals: {
      os: count(/\boperating systems?\b|\bos\b|cloudflare os/g, blob),
      kernel: count(/\bkernel\b|\bring[-\s]?0\b|\bsyscall/g, blob),
      hardware: count(
        /\bhardware\b|\bcpu\b|\bgpu\b|\bbare[-\s]?metal\b|\bfirmware\b/g,
        blob,
      ),
      schedule: count(
        /\bschedul(e|er|ing)\b|\bprocess(es)?\b|\bthread(s)?\b/g,
        blob,
      ),
      platform: count(/\bplatform\b|\becosystem\b|\binfrastructure\b/g, blob),
      saas: count(
        /\bsaas\b|\bdashboard\b|\bpricing\b|\benterprise\b|\bfree trial\b/g,
        blob,
      ),
      browser: count(
        /\bbrowser\b|\bchrome\b|\belectron\b|\bjavascript\b/g,
        blob,
      ),
      cloud: count(
        /\bcloud\b|\bedge\b|\bserverless\b|\bcdn\b|\bworkers?\b/g,
        blob,
      ),
      pricing: count(/\bpricing\b|\b\$\d|\bper month\b|\bbilling\b/g, blob),
      openSource: count(
        /\bopen[-\s]?source\b|\bgithub\b|\bposix\b|\bunix\b|\blinux\b/g,
        blob,
      ),
      security: count(
        /\bsecur(e|ity)\b|\bisolat(e|ion)\b|\bsandbox\b/g,
        blob,
      ),
      ai: count(/\bai\b|\bllm\b|\bmachine learning\b|\bagent(s)?\b/g, blob),
    },
  };
}

export default app;
