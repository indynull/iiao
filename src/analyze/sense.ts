/**
 * Thin wrapper: classify + joke, still expose structure for optional deep view.
 */
import {
  axisScores,
  classify,
  jokeFor,
  type ComedyMode,
} from "./comedy";
import { seedHex } from "./seed";
import type {
  Analysis,
  Criterion,
  ProbeResult,
  ProbeSignals,
  SignalStat,
  SubjectKind,
  TreeNode,
} from "./types";

export type SenseCtx = {
  subject: string;
  kind: SubjectKind;
  host: string | null;
  displayName: string;
  blob: string;
  probe: ProbeResult | null;
  signals: ProbeSignals;
  quotes: string[];
  mode: ComedyMode;
};

const EMPTY_SIGNALS: ProbeSignals = {
  os: 0,
  kernel: 0,
  hardware: 0,
  schedule: 0,
  platform: 0,
  saas: 0,
  browser: 0,
  cloud: 0,
  pricing: 0,
  openSource: 0,
  security: 0,
  ai: 0,
};

function detectKind(raw: string): SubjectKind {
  const s = raw.trim();
  if (!s) return "empty";
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    if (u.hostname.includes(".")) return "url";
  } catch {
    /* claim */
  }
  return "claim";
}

function hostOf(subject: string, kind: SubjectKind): string | null {
  if (kind !== "url") return null;
  try {
    return new URL(subject.includes("://") ? subject : `https://${subject}`)
      .hostname;
  } catch {
    return null;
  }
}

function shortQuote(s: string, max = 72): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function localSignals(blob: string): ProbeSignals {
  const c = (re: RegExp) =>
    (blob.match(new RegExp(re.source, "gi")) || []).length;
  return {
    os: c(/\boperating systems?\b|\bos\b|cloudflare os/),
    kernel: c(/\bkernel\b|\bring[-\s]?0\b|\bsyscall/),
    hardware: c(/\bhardware\b|\bcpu\b|\bgpu\b|\bbare[-\s]?metal\b|\bfirmware\b/),
    schedule: c(/\bschedul(e|er|ing)\b|\bprocess(es)?\b|\bthread(s)?\b/),
    platform: c(/\bplatform\b|\becosystem\b|\binfrastructure\b/),
    saas: c(/\bsaas\b|\bdashboard\b|\bpricing\b|\benterprise\b|\bfree trial\b/),
    browser: c(/\bbrowser\b|\bchrome\b|\belectron\b|\bwebkit\b|\bjavascript\b/),
    cloud: c(/\bcloud\b|\bedge\b|\bserverless\b|\bcdn\b|\bworkers?\b|\bkubernetes\b/),
    pricing: c(/\bpricing\b|\b\$\d|\bper month\b|\bbilling\b/),
    openSource: c(/\bopen[-\s]?source\b|\bgithub\b|\bposix\b|\bunix\b|\blinux\b/),
    security: c(/\bsecur(e|ity)\b|\bisolat(e|ion)\b|\bsandbox\b|\bzero[-\s]?trust\b/),
    ai: c(/\bai\b|\bllm\b|\bmachine learning\b|\bagent(s)?\b/),
  };
}

export function buildContext(
  subjectRaw: string,
  probe?: ProbeResult | null,
): SenseCtx {
  const subject = subjectRaw.trim() || "the void";
  const kind = detectKind(subject === "the void" ? "" : subject);
  const host =
    probe?.host || hostOf(subject, kind === "empty" ? "claim" : kind);

  const quotes: string[] = [];
  if (probe?.title) quotes.push(probe.title);
  if (probe?.description) quotes.push(probe.description);

  const blob = [
    subject,
    host ?? "",
    probe?.title ?? "",
    probe?.description ?? "",
    (probe?.headings ?? []).join(" "),
    probe?.textSample ?? "",
  ]
    .join("\n")
    .toLowerCase();

  const base = { ...(probe?.signals ?? EMPTY_SIGNALS) };
  if (!probe?.ok) {
    const local = localSignals(blob + " " + subject.toLowerCase());
    for (const k of Object.keys(base) as (keyof ProbeSignals)[]) {
      base[k] = Math.max(base[k], local[k]);
    }
  }

  const displayName =
    (kind === "claim" || kind === "empty"
      ? shortQuote(subject, 48)
      : null) ||
    probe?.title?.split(/[|\-–—]/)[0]?.trim() ||
    host ||
    shortQuote(subject, 48);

  const kindNorm = (kind === "empty" ? "claim" : kind) as SubjectKind;
  const mode = classify({
    subject,
    displayName,
    blob,
    kind: kindNorm,
    host,
    signals: base,
    probeOk: !!probe?.ok,
  });

  return {
    subject,
    kind: kindNorm,
    host,
    displayName,
    blob,
    probe: probe ?? null,
    signals: base,
    quotes: [...new Set(quotes.map((x) => shortQuote(x, 100)))].slice(0, 8),
    mode,
  };
}

function simpleTree(
  name: string,
  answer: string,
  line: string,
  confidence: number,
): TreeNode {
  const yes = answer === "YES" || answer === "KINDA";
  return {
    id: "root",
    label: `Is ${shortQuote(name, 28)} an OS?`,
    taken: true,
    outcome: "question",
    children: [
      {
        id: "y",
        label: "Yes",
        taken: yes,
        outcome: "yes",
        detail: yes ? line : undefined,
        children: yes
          ? [
              {
                id: "leaf",
                label: `${answer} · ${confidence}%`,
                taken: true,
                outcome: "leaf",
                detail: line,
              },
            ]
          : [],
      },
      {
        id: "n",
        label: "No",
        taken: !yes,
        outcome: "no",
        detail: !yes ? line : undefined,
        children: !yes
          ? [
              {
                id: "leaf",
                label: `${answer} · ${confidence}%`,
                taken: true,
                outcome: "leaf",
                detail: line,
              },
            ]
          : [],
      },
    ],
  };
}

function caseId(subject: string): string {
  const seed = seedHex(subject.toLowerCase());
  return `IIAO-${seed.slice(0, 4).toUpperCase()}-${seed.slice(4, 8).toUpperCase()}`;
}

export function analyze(
  subjectRaw: string,
  probe?: ProbeResult | null,
): Analysis {
  const ctx = buildContext(subjectRaw, probe);
  const joke = jokeFor({
    subject: ctx.subject,
    displayName: ctx.displayName,
    blob: ctx.blob,
    kind: ctx.kind,
    host: ctx.host,
    signals: ctx.signals,
    probeOk: !!ctx.probe?.ok,
  });

  const axes = axisScores(ctx.mode);
  const criteria: Criterion[] = axes.map((a) => ({
    id: a.id,
    label: a.label,
    weight: 1,
    score: a.score,
    note: a.note,
    axis: a.label,
    inputs: [],
  }));

  const signalStats: SignalStat[] = (
    [
      ["os", "OS wording", ctx.signals.os],
      ["kernel", "Kernel", ctx.signals.kernel],
      ["saas", "SaaS", ctx.signals.saas],
      ["platform", "Platform", ctx.signals.platform],
      ["cloud", "Cloud", ctx.signals.cloud],
      ["pricing", "Pricing", ctx.signals.pricing],
    ] as [string, string, number][]
  ).map(([key, label, count]) => ({ key, label, count }));

  const seed = seedHex(ctx.subject.toLowerCase());

  return {
    subject: ctx.subject,
    kind: ctx.kind,
    host: ctx.host,
    seed,
    caseId: caseId(ctx.subject),
    confidence: joke.confidence,
    verdict: joke.answer,
    subtitle: joke.line,
    stamp: joke.sub ?? "",
    criteria,
    tree: simpleTree(ctx.displayName, joke.answer, joke.line, joke.confidence),
    radar: criteria.map((c) => ({
      axis: c.axis,
      value: Math.round(c.score * 100),
    })),
    signalStats,
    confidenceSteps: [
      { label: ctx.mode, delta: joke.confidence, total: joke.confidence },
    ],
    timeline: [],
    redFlags: joke.sub ? [joke.sub] : [],
    findings: [joke.line],
    roast: [joke.line, ...(joke.sub ? [joke.sub] : [])],
    methodology: [],
    probe: ctx.probe,
  };
}

export function pipelineFor(_subject: string) {
  return [];
}
