/**
 * Content-driven OS-ness sensing.
 * Scores, stats, and decision tree are derived only from probe/claim data.
 */
import { seedHex } from "./seed";
import type {
  Analysis,
  ConfidenceStep,
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

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Map hit counts → 0..1 with soft saturation. */
function sat(n: number, soft = 3): number {
  return clamp01(1 - Math.exp(-Math.max(0, n) / soft));
}

function shortQuote(s: string, max = 72): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
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
  for (const h of probe?.headings ?? []) quotes.push(h);
  for (const p of probe?.phrases ?? []) quotes.push(p);

  const blob = [
    subject,
    host ?? "",
    probe?.title ?? "",
    probe?.description ?? "",
    (probe?.headings ?? []).join(" "),
    probe?.textSample ?? "",
    (probe?.phrases ?? []).join(" "),
  ]
    .join("\n")
    .toLowerCase();

  const base = { ...(probe?.signals ?? EMPTY_SIGNALS) };
  if (!probe?.ok) {
    const local = localSignals(blob);
    for (const k of Object.keys(base) as (keyof ProbeSignals)[]) {
      base[k] = Math.max(base[k], local[k]);
    }
  }

  const displayName =
    probe?.title?.split(/[|\-–—]/)[0]?.trim() ||
    host ||
    shortQuote(subject, 48);

  return {
    subject,
    kind: kind === "empty" ? "claim" : kind,
    host,
    displayName,
    blob,
    probe: probe ?? null,
    signals: base,
    quotes: [...new Set(quotes.map((x) => shortQuote(x, 100)))].slice(0, 8),
  };
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

type AxisDef = {
  id: string;
  label: string;
  weight: number;
  score: (ctx: SenseCtx) => { score: number; inputs: string[] };
  note: (ctx: SenseCtx, score: number) => string;
};

const AXES: AxisDef[] = [
  {
    id: "kernel",
    label: "Kernel / OS lexicon",
    weight: 1.4,
    score: (ctx) => {
      const k = sat(ctx.signals.kernel, 2);
      const o = sat(ctx.signals.os, 2);
      let s = k * 0.7 + o * 0.5;
      const lineage = /\blinux\b|\bbsd\b|\bwindows nt\b|\bxnu\b|\bmach\b/i.test(
        ctx.blob,
      );
      if (lineage) s += 0.35;
      if (ctx.signals.saas > 2 && ctx.signals.kernel === 0) s *= 0.35;
      const inputs = [
        `kernel hits=${ctx.signals.kernel} → sat ${k.toFixed(2)}`,
        `os hits=${ctx.signals.os} → sat ${o.toFixed(2)}`,
        lineage ? "lineage keyword boost +0.35" : "no lineage keyword",
        ctx.signals.saas > 2 && ctx.signals.kernel === 0
          ? "SaaS-without-kernel penalty ×0.35"
          : "no SaaS penalty",
      ];
      return { score: clamp01(s), inputs };
    },
    note: (ctx, score) =>
      `kernel=${ctx.signals.kernel}, os=${ctx.signals.os} → score ${(score * 100).toFixed(0)}%`,
  },
  {
    id: "schedule",
    label: "Scheduler / process",
    weight: 1.2,
    score: (ctx) => {
      const base = sat(ctx.signals.schedule, 3);
      let s = base;
      const orch = /\bjob queue\b|\bworker pool\b|\borchestr/i.test(ctx.blob);
      if (orch) s += 0.25;
      if (ctx.signals.cloud > 0) s += 0.1;
      return {
        score: clamp01(s),
        inputs: [
          `schedule/process hits=${ctx.signals.schedule} → sat ${base.toFixed(2)}`,
          orch ? "orchestr/queue language +0.25" : "no orchestr language",
          ctx.signals.cloud > 0 ? `cloud hits=${ctx.signals.cloud} +0.10` : "no cloud boost",
        ],
      };
    },
    note: (ctx, score) =>
      `schedule hits=${ctx.signals.schedule} → ${(score * 100).toFixed(0)}%`,
  },
  {
    id: "hardware",
    label: "Hardware contact",
    weight: 1.3,
    score: (ctx) => {
      const base = sat(ctx.signals.hardware, 2);
      let s = base;
      const metal = /\bbare[-\s]?metal\b|\bfirmware\b|\bdriver\b|\bsilicon\b/i.test(
        ctx.blob,
      );
      if (metal) s += 0.3;
      if (ctx.signals.cloud > 3 && ctx.signals.hardware === 0) s *= 0.4;
      return {
        score: clamp01(s),
        inputs: [
          `hardware hits=${ctx.signals.hardware} → sat ${base.toFixed(2)}`,
          metal ? "metal/driver language +0.30" : "no metal language",
          ctx.signals.cloud > 3 && ctx.signals.hardware === 0
            ? "cloud-heavy/no-hardware ×0.40"
            : "no cloud/hardware penalty",
        ],
      };
    },
    note: (ctx, score) =>
      `hardware hits=${ctx.signals.hardware} → ${(score * 100).toFixed(0)}%`,
  },
  {
    id: "marketing",
    label: "Marketing / platform surface",
    weight: 1.0,
    score: (ctx) => {
      const p = sat(ctx.signals.platform, 4) * 0.35;
      const pr = sat(ctx.signals.pricing, 3) * 0.25;
      const sa = sat(ctx.signals.saas, 4) * 0.25;
      let s = p + pr + sa;
      const brandOs = ctx.signals.os > 0 && ctx.signals.kernel === 0;
      if (brandOs) s += 0.35;
      const hype =
        /\bsupercharge\b|\brevolutioni[sz]e\b|\bnext[-\s]?gen\b|\bunleash\b/i.test(
          ctx.blob,
        );
      if (hype) s += 0.15;
      return {
        score: clamp01(s),
        inputs: [
          `platform=${ctx.signals.platform} pricing=${ctx.signals.pricing} saas=${ctx.signals.saas}`,
          brandOs ? "OS-without-kernel branding +0.35" : "no brand-OS boost",
          hype ? "hype lexicon +0.15" : "no hype lexicon",
        ],
      };
    },
    note: (ctx, score) =>
      `platform/saas/pricing surface → ${(score * 100).toFixed(0)}%`,
  },
  {
    id: "syscall",
    label: "API / interface surface",
    weight: 1.0,
    score: (ctx) => {
      let s = 0;
      const api = /\bapi\b|\bsdk\b|\bcli\b|\bendpoint/i.test(ctx.blob);
      const rest = /\brest\b|\bgraphql\b|\bwebhook/i.test(ctx.blob);
      if (api) s += 0.35;
      if (ctx.signals.cloud > 0) s += 0.2;
      if (ctx.signals.os > 0) s += 0.15;
      if (rest) s += 0.15;
      return {
        score: clamp01(s),
        inputs: [
          api ? "api/sdk/cli present +0.35" : "no api/sdk/cli",
          `cloud=${ctx.signals.cloud} os=${ctx.signals.os}`,
          rest ? "rest/graphql/webhook +0.15" : "no HTTP-API jargon",
        ],
      };
    },
    note: (ctx, score) => `interface surface → ${(score * 100).toFixed(0)}%`,
  },
  {
    id: "isolation",
    label: "Isolation / security",
    weight: 1.1,
    score: (ctx) => {
      const base = sat(ctx.signals.security, 3);
      let s = base;
      const iso =
        /\bsandbox\b|\bvm\b|\bcontainer\b|\bisolate|multi[-\s]?tenant/i.test(
          ctx.blob,
        );
      if (iso) s += 0.3;
      return {
        score: clamp01(s),
        inputs: [
          `security hits=${ctx.signals.security} → sat ${base.toFixed(2)}`,
          iso ? "sandbox/vm/container language +0.30" : "no isolation keywords",
        ],
      };
    },
    note: (ctx, score) =>
      `security hits=${ctx.signals.security} → ${(score * 100).toFixed(0)}%`,
  },
  {
    id: "boot",
    label: "Install / onboarding path",
    weight: 0.9,
    score: (ctx) => {
      let s = 0;
      const install =
        /\binstall\b|\bdownload\b|\bget started\b|\bquickstart\b|\bdeploy\b|\bsign up\b/i.test(
          ctx.blob,
        );
      const boot = /\bboot\b|\binit\b|\bstartup\b/i.test(ctx.blob);
      if (install) s += 0.4;
      if (ctx.signals.pricing > 0) s += 0.2;
      if (boot) s += 0.35;
      return {
        score: clamp01(s),
        inputs: [
          install ? "install/onboard language +0.40" : "no install language",
          `pricing hits=${ctx.signals.pricing}${ctx.signals.pricing > 0 ? " +0.20" : ""}`,
          boot ? "boot/init language +0.35" : "no boot/init language",
        ],
      };
    },
    note: (ctx, score) => `onboarding surface → ${(score * 100).toFixed(0)}%`,
  },
  {
    id: "posix",
    label: "POSIX / OS lineage",
    weight: 1.15,
    score: (ctx) => {
      const oss = sat(ctx.signals.openSource, 3) * 0.5;
      let s = oss;
      const posix =
        /\bposix\b|\bunix\b|\blinux\b|\bgnu\b|\bbsd\b|\bsysv\b/i.test(ctx.blob);
      const editors = /\bemacs\b|\bvim\b|\bneovim\b/i.test(ctx.blob);
      const desktops =
        /\bwindows\b|\bmacos\b|\bandroid\b|\bios\b/i.test(ctx.blob);
      if (posix) s += 0.45;
      if (editors) s += 0.25;
      if (desktops) s += 0.4;
      return {
        score: clamp01(s),
        inputs: [
          `openSource/linux-ish hits=${ctx.signals.openSource} → ${oss.toFixed(2)}`,
          posix ? "posix/unix/linux +0.45" : "no posix/unix/linux",
          editors ? "editor-as-OS meme +0.25" : "no editor meme",
          desktops ? "desktop/mobile OS name +0.40" : "no desktop OS name",
        ],
      };
    },
    note: (ctx, score) =>
      `lineage hits openSource=${ctx.signals.openSource} → ${(score * 100).toFixed(0)}%`,
  },
];

function buildCriteria(ctx: SenseCtx): Criterion[] {
  return AXES.map((a) => {
    const { score, inputs } = a.score(ctx);
    return {
      id: a.id,
      label: a.label,
      weight: a.weight,
      score,
      note: a.note(ctx, score),
      axis: a.label,
      inputs,
    };
  });
}

function signalStats(ctx: SenseCtx): SignalStat[] {
  const s = ctx.signals;
  return (
    [
      ["os", "OS wording", s.os],
      ["kernel", "Kernel / syscall", s.kernel],
      ["hardware", "Hardware", s.hardware],
      ["schedule", "Scheduler / process", s.schedule],
      ["platform", "Platform", s.platform],
      ["saas", "SaaS / dashboard", s.saas],
      ["pricing", "Pricing", s.pricing],
      ["cloud", "Cloud / edge", s.cloud],
      ["browser", "Browser / JS", s.browser],
      ["security", "Security / isolation", s.security],
      ["openSource", "Open source / Linux", s.openSource],
      ["ai", "AI / agents", s.ai],
    ] as [string, string, number][]
  ).map(([key, label, count]) => ({ key, label, count }));
}

/** Transparent confidence: weighted mean of axes + listed adjustments. */
function confidenceFrom(
  criteria: Criterion[],
  ctx: SenseCtx,
): { confidence: number; steps: ConfidenceStep[] } {
  let num = 0;
  let den = 0;
  for (const c of criteria) {
    num += c.score * c.weight;
    den += c.weight;
  }
  const base = den ? (num / den) * 100 : 0;
  const steps: ConfidenceStep[] = [
    { label: "Weighted axis mean", delta: base, total: base },
  ];
  let total = base;

  const adjust = (label: string, delta: number) => {
    if (delta === 0) return;
    total += delta;
    steps.push({ label, delta, total });
  };

  if (/\bkernel\.org\b|\blinux\.org\b|\bfreedesktop\b/i.test(ctx.blob)) {
    adjust("Known kernel host (+25)", 25);
  }
  if (/\boperating system\b/i.test(ctx.blob) && ctx.signals.kernel > 0) {
    adjust("“operating system” + kernel lexicon (+12)", 12);
  }
  if (ctx.signals.os > 0 && ctx.signals.saas > 3 && ctx.signals.kernel === 0) {
    adjust("OS branding on SaaS page (+8)", 8);
  }
  if (ctx.signals.saas > 4 && ctx.signals.kernel === 0 && ctx.signals.os === 0) {
    adjust("Heavy SaaS, no OS/kernel (−12)", -12);
  }
  if (ctx.probe && !ctx.probe.ok && ctx.kind === "url") {
    adjust("Probe failed (−5)", -5);
  }
  if (/cloudflare/i.test(ctx.blob) && ctx.signals.os > 0) {
    const floor = 55;
    if (total < floor) adjust(`Cloudflare+OS floor → ${floor}`, floor - total);
  }
  if (/\bemacs\b/i.test(ctx.blob)) {
    const floor = 62;
    if (total < floor) adjust(`Emacs claim floor → ${floor}`, floor - total);
  }

  const confidence = Math.round(Math.min(96, Math.max(4, total)));
  if (confidence !== Math.round(total)) {
    steps.push({
      label: `Clamped to ${confidence}%`,
      delta: confidence - total,
      total: confidence,
    });
  }
  return { confidence, steps };
}

function verdictFor(
  ctx: SenseCtx,
  confidence: number,
  criteria: Criterion[],
): string {
  const name = ctx.displayName;
  const top = [...criteria].sort((a, b) => b.score - a.score)[0];
  const low = [...criteria].sort((a, b) => a.score - b.score)[0];

  if (
    /cloudflare/i.test(ctx.blob) &&
    (ctx.signals.os > 0 || /workers|edge|cdn/i.test(ctx.blob))
  ) {
    return `${name}: edge platform with OS-shaped branding`;
  }
  if (/\bemacs\b/i.test(ctx.blob)) {
    return `${name} — OS by lifestyle, editor by paperwork`;
  }
  if (
    confidence >= 72 &&
    (ctx.signals.kernel > 0 || ctx.signals.openSource > 2)
  ) {
    return `${name} scores like a real OS (kernel/lineage present)`;
  }
  if (confidence >= 55 && ctx.signals.os > 0) {
    return `${name} claims OS-hood; ${top?.label ?? "signals"} lead`;
  }
  if (ctx.signals.saas > 3 && ctx.signals.kernel === 0) {
    return `${name} is SaaS wearing a trench coat labeled "platform"`;
  }
  if (ctx.signals.browser > 2 && confidence < 50) {
    return `${name}: browser-era software, not a bootloader`;
  }
  if (ctx.signals.cloud > 2 && ctx.signals.hardware < 1) {
    return `${name} — cloud product, little hardware language`;
  }
  if (confidence < 30) {
    return `${name} fails OS checks (${low?.label ?? "axes"} lowest)`;
  }
  return `${name}: OS confidence ${confidence}% from measured signals`;
}

function subtitleFor(ctx: SenseCtx, confidence: number): string {
  const bits: string[] = [];
  if (ctx.probe?.ok && ctx.probe.title) {
    bits.push(`Probed “${shortQuote(ctx.probe.title, 56)}”.`);
  } else if (ctx.kind === "url" && ctx.probe && !ctx.probe.ok) {
    bits.push(
      `Probe failed (${ctx.probe.error || "unreachable"}) — scoring claim/URL text only.`,
    );
  } else if (ctx.kind === "claim") {
    bits.push(`Claim-only analysis (no remote page).`);
  }
  bits.push(
    confidence >= 50
      ? `Weighted signals → OS-ward (${confidence}%).`
      : `Weighted signals → not an OS (${confidence}%).`,
  );
  if (ctx.host) bits.push(`Host: ${ctx.host}.`);
  return bits.join(" ");
}

function stampFor(confidence: number, ctx: SenseCtx): string {
  if (!ctx.probe?.ok && ctx.kind === "url") return "PROBE DEGRADED";
  if (confidence >= 75) return "OS-WARD";
  if (confidence >= 55) return "AMBIGUOUS";
  if (confidence >= 35) return "SKEPTICAL";
  return "NOT AN OS";
}

function findingsFor(ctx: SenseCtx): string[] {
  const out: string[] = [];
  if (ctx.probe?.ok) {
    out.push(
      `HTTP ${ctx.probe.status ?? "?"} · ${ctx.probe.bytes ?? 0} bytes · ${ctx.probe.finalUrl || ctx.subject}`,
    );
    if (ctx.probe.title) out.push(`Title: ${ctx.probe.title}`);
    if (ctx.probe.description)
      out.push(`Meta: ${shortQuote(ctx.probe.description, 140)}`);
    if (ctx.probe.headings?.length)
      out.push(`Headings: ${ctx.probe.headings.slice(0, 5).join(" · ")}`);
  } else if (ctx.kind === "url") {
    out.push(
      `Could not load page${ctx.probe?.error ? `: ${ctx.probe.error}` : "."}`,
    );
  } else {
    out.push(`Claim: “${shortQuote(ctx.subject, 100)}”`);
  }
  return out;
}

function redFlagsFor(ctx: SenseCtx, criteria: Criterion[]): string[] {
  const flags: string[] = [];
  if (ctx.signals.os > 0 && ctx.signals.kernel === 0) {
    flags.push(
      `OS wording (${ctx.signals.os}) without kernel/syscall hits (0).`,
    );
  }
  if (ctx.signals.pricing > 0 && ctx.signals.hardware === 0) {
    flags.push(
      `Pricing hits (${ctx.signals.pricing}) with hardware hits = 0.`,
    );
  }
  if (ctx.signals.saas > 3) {
    flags.push(`SaaS/dashboard hits = ${ctx.signals.saas}.`);
  }
  if (ctx.signals.platform > 2 && ctx.signals.schedule === 0) {
    flags.push(
      `Platform hits (${ctx.signals.platform}) with schedule/process = 0.`,
    );
  }
  if (ctx.probe?.ok && (ctx.probe.headings?.length ?? 0) === 0) {
    flags.push(`No H1–H3 headings extracted from HTML.`);
  }
  if (!ctx.probe?.ok && ctx.kind === "url") {
    flags.push(`Remote probe failed; signal set is partial.`);
  }
  const marketing = criteria.find((c) => c.id === "marketing");
  const kernel = criteria.find((c) => c.id === "kernel");
  if (
    marketing &&
    kernel &&
    marketing.score > 0.5 &&
    kernel.score < 0.25
  ) {
    flags.push(
      `Marketing axis ${(marketing.score * 100).toFixed(0)}% ≫ kernel axis ${(kernel.score * 100).toFixed(0)}%.`,
    );
  }
  return flags;
}

function timelineFor(ctx: SenseCtx): { t: string; event: string }[] {
  return [
    {
      t: "1",
      event: ctx.probe?.ok
        ? `Fetch OK — “${shortQuote(ctx.probe.title || ctx.host || "page", 50)}”`
        : ctx.kind === "url"
          ? `Fetch failed — ${ctx.probe?.error || "no body"}`
          : `No fetch — claim text only`,
    },
    {
      t: "2",
      event: `Counts os=${ctx.signals.os} kernel=${ctx.signals.kernel} hardware=${ctx.signals.hardware} schedule=${ctx.signals.schedule} saas=${ctx.signals.saas} cloud=${ctx.signals.cloud}`,
    },
    {
      t: "3",
      event: `Score axes from counts → confidence (see breakdown)`,
    },
  ];
}

/**
 * Real decision tree: each level is a measured test.
 * Both outcomes are shown; only the taken branch continues.
 */
function buildTree(
  ctx: SenseCtx,
  confidence: number,
  criteria: Criterion[],
): TreeNode {
  type Test = {
    id: string;
    question: string;
    measure: string;
    threshold: string;
    pass: boolean;
  };

  const byId = Object.fromEntries(criteria.map((c) => [c.id, c]));
  const sc = (id: string) => byId[id]?.score ?? 0;

  const tests: Test[] = [
    {
      id: "t-os-kernel",
      question: "OS or kernel lexicon present?",
      measure: `os=${ctx.signals.os}, kernel=${ctx.signals.kernel}, sum=${ctx.signals.os + ctx.signals.kernel}`,
      threshold: "sum ≥ 1",
      pass: ctx.signals.os + ctx.signals.kernel >= 1,
    },
    {
      id: "t-kernel-axis",
      question: "Kernel axis score high enough?",
      measure: `kernel axis = ${(sc("kernel") * 100).toFixed(0)}%`,
      threshold: "score ≥ 40%",
      pass: sc("kernel") >= 0.4,
    },
    {
      id: "t-schedule",
      question: "Scheduler/process language present?",
      measure: `schedule hits=${ctx.signals.schedule}, axis=${(sc("schedule") * 100).toFixed(0)}%`,
      threshold: "hits ≥ 1 OR axis ≥ 35%",
      pass: ctx.signals.schedule >= 1 || sc("schedule") >= 0.35,
    },
    {
      id: "t-hardware",
      question: "Hardware contact in copy?",
      measure: `hardware hits=${ctx.signals.hardware}, axis=${(sc("hardware") * 100).toFixed(0)}%`,
      threshold: "hits ≥ 1 OR axis ≥ 35%",
      pass: ctx.signals.hardware >= 1 || sc("hardware") >= 0.35,
    },
    {
      id: "t-saas",
      question: "SaaS/pricing dominant (anti-OS weight)?",
      measure: `saas+pricing=${ctx.signals.saas + ctx.signals.pricing}`,
      threshold: "sum ≥ 3 → yes (commercial surface)",
      pass: ctx.signals.saas + ctx.signals.pricing >= 3,
    },
    {
      id: "t-final",
      question: "Weighted confidence ≥ 50%?",
      measure: `confidence = ${confidence}%`,
      threshold: "≥ 50% → OS-ward",
      pass: confidence >= 50,
    },
  ];

  const root: TreeNode = {
    id: "root",
    label: `Is ${shortQuote(ctx.displayName, 32)} an OS?`,
    detail: "Measured decision path",
    outcome: "question",
    taken: true,
    children: [],
  };

  let parent = root;
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i]!;
    const qNode: TreeNode = {
      id: t.id,
      label: t.question,
      detail: `${t.measure} · ${t.threshold}`,
      outcome: "question",
      taken: true,
      children: [],
    };

    const yesNode: TreeNode = {
      id: `${t.id}-yes`,
      label: "Yes",
      detail: t.pass ? `Taken · ${t.measure}` : `Not taken · ${t.measure}`,
      outcome: "yes",
      taken: t.pass,
      children: [],
    };
    const noNode: TreeNode = {
      id: `${t.id}-no`,
      label: "No",
      detail: !t.pass ? `Taken · ${t.measure}` : `Not taken · ${t.measure}`,
      outcome: "no",
      taken: !t.pass,
      children: [],
    };

    qNode.children = [yesNode, noNode];
    parent.children = [qNode];

    const chosen = t.pass ? yesNode : noNode;

    if (i === tests.length - 1) {
      chosen.children = [
        {
          id: "leaf",
          label:
            confidence >= 50
              ? `OS-ward · ${confidence}%`
              : `Not an OS · ${confidence}%`,
          detail: `Final weighted confidence = ${confidence}%`,
          outcome: "leaf",
          taken: true,
        },
      ];
    } else {
      parent = chosen;
    }
  }

  return root;
}

function caseId(subject: string, title: string): string {
  const seed = seedHex(subject.toLowerCase() + "|" + title);
  return `IIAO-${seed.slice(0, 4).toUpperCase()}-${seed.slice(4, 8).toUpperCase()}`;
}

export function analyze(
  subjectRaw: string,
  probe?: ProbeResult | null,
): Analysis {
  const ctx = buildContext(subjectRaw, probe);
  const seed = seedHex(
    ctx.subject.toLowerCase() + "|" + (ctx.probe?.title ?? ""),
  );

  const criteria = buildCriteria(ctx);
  const { confidence, steps } = confidenceFrom(criteria, ctx);
  const radar = criteria.map((c) => ({
    axis: c.axis,
    value: Math.round(c.score * 100),
  }));

  return {
    subject: ctx.subject,
    kind: ctx.kind,
    host: ctx.host,
    seed,
    caseId: caseId(ctx.subject, ctx.probe?.title ?? ""),
    confidence,
    verdict: verdictFor(ctx, confidence, criteria),
    subtitle: subtitleFor(ctx, confidence),
    stamp: stampFor(confidence, ctx),
    criteria,
    tree: buildTree(ctx, confidence, criteria),
    radar,
    signalStats: signalStats(ctx),
    confidenceSteps: steps,
    timeline: timelineFor(ctx),
    redFlags: redFlagsFor(ctx, criteria),
    findings: findingsFor(ctx),
    methodology: [
      "Fetch HTML → title, meta, headings, text sample",
      "Count lexicon hits (OS, kernel, SaaS, …) on that text",
      "Score 8 weighted axes from counts (formula per axis in stats)",
      "Confidence = weighted mean + listed adjustments",
      "Decision tree = ordered threshold tests on those measurements",
    ],
    probe: ctx.probe,
  };
}

export function pipelineFor(subject: string): {
  id: string;
  label: string;
  blurb: string;
  ms: number;
}[] {
  const kind = detectKind(subject);
  return [
    {
      id: "ingest",
      label: "Ingest subject",
      blurb: kind === "url" ? "Normalize URL" : "Treat as free-form claim",
      ms: 200,
    },
    {
      id: "probe",
      label: "Fetch & parse page",
      blurb:
        kind === "url"
          ? "Title, meta, headings, lexicon counts"
          : "Skip remote fetch (not a URL)",
      ms: kind === "url" ? 800 : 120,
    },
    {
      id: "lex",
      label: "Score OS axes",
      blurb: "Each axis = formula over measured hits",
      ms: 280,
    },
    {
      id: "tree",
      label: "Walk decision tree",
      blurb: "Threshold tests on measured values",
      ms: 240,
    },
    {
      id: "radar",
      label: "Project stats",
      blurb: "Signal table + weighted confidence",
      ms: 160,
    },
    {
      id: "seal",
      label: "Seal determination",
      blurb: "Verdict from final confidence",
      ms: 140,
    },
  ];
}
