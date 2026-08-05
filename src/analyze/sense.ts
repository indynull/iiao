/**
 * Content-driven OS-ness sensing.
 * Scores and copy come from the subject + probe — not random list picks.
 * Tiny seed noise only for stamp flavor / non-essential garnish.
 */
import { hashString, mulberry32, seedHex } from "./seed";
import type {
  Analysis,
  Criterion,
  ProbeResult,
  ProbeSignals,
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

function sat(n: number, soft = 3): number {
  // 0,1,2,3+ hits → diminishing 0..1
  return clamp01(1 - Math.exp(-n / soft));
}

function q(ctx: SenseCtx, fallback: string): string {
  return ctx.quotes[0] || fallback;
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
    probe?.host ||
    hostOf(subject, kind === "empty" ? "claim" : kind);

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

  // Merge probe signals with claim-only regex if no probe
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
  const c = (re: RegExp) => (blob.match(new RegExp(re.source, "gi")) || []).length;
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
  score: (ctx: SenseCtx) => number;
  note: (ctx: SenseCtx, score: number) => string;
};

const AXES: AxisDef[] = [
  {
    id: "kernel",
    label: "Kernel cosplay",
    weight: 1.4,
    score: (ctx) => {
      let s = sat(ctx.signals.kernel, 2) * 0.7 + sat(ctx.signals.os, 2) * 0.5;
      if (/\blinux\b|\bbsd\b|\bwindows nt\b|\bxnu\b|\bmach\b/i.test(ctx.blob)) s += 0.35;
      if (ctx.signals.saas > 2 && ctx.signals.kernel === 0) s *= 0.35;
      return clamp01(s);
    },
    note: (ctx, score) => {
      if (ctx.signals.kernel > 0)
        return `Page language hits kernel/syscall vocabulary (${ctx.signals.kernel}×). ${score > 0.6 ? "Taking itself seriously." : "Soft cosplay."}`;
      if (ctx.signals.os > 0)
        return `Says "OS" (${ctx.signals.os}×) without kernel vocabulary — classic branding move.`;
      return `No kernel talk on ${ctx.host || "this subject"}. Ring‑0 remains a lifestyle choice.`;
    },
  },
  {
    id: "schedule",
    label: "Scheduler theater",
    weight: 1.2,
    score: (ctx) => {
      let s = sat(ctx.signals.schedule, 3);
      if (/\bjob queue\b|\bworker pool\b|\borchestr/i.test(ctx.blob)) s += 0.25;
      if (ctx.signals.cloud > 0) s += 0.1;
      return clamp01(s);
    },
    note: (ctx, score) =>
      score > 0.45
        ? `Scheduling/process language present (${ctx.signals.schedule} hits). Something gets "run" — maybe not processes.`
        : `Little/no process or scheduler language. Work appears to be scheduled by hope.`,
  },
  {
    id: "hardware",
    label: "Hardware contact",
    weight: 1.3,
    score: (ctx) => {
      let s = sat(ctx.signals.hardware, 2);
      if (/\bbare[-\s]?metal\b|\bfirmware\b|\bdriver\b|\bsilicon\b/i.test(ctx.blob))
        s += 0.3;
      if (ctx.signals.cloud > 3 && ctx.signals.hardware === 0) s *= 0.4;
      return clamp01(s);
    },
    note: (ctx, score) =>
      score > 0.4
        ? `Hardware/device language found. Touching metal (or pretending to).`
        : `Hardware is abstract to the point of myth. ${ctx.displayName} lives in software weather.`,
  },
  {
    id: "marketing",
    label: "Marketing entropy",
    weight: 1.0,
    score: (ctx) => {
      // Higher marketing = more "not a real OS" signal for score of this axis as "OS-ness of marketing claim"
      // We invert: high marketing entropy means strong OS *claims* via branding → mid score with chaos
      let s =
        sat(ctx.signals.platform, 4) * 0.35 +
        sat(ctx.signals.pricing, 3) * 0.25 +
        sat(ctx.signals.saas, 4) * 0.25;
      if (ctx.signals.os > 0 && ctx.signals.kernel === 0) s += 0.35;
      if (/\bsupercharge\b|\brevolutioni[sz]e\b|\bnext[-\s]?gen\b|\bunleash\b/i.test(ctx.blob))
        s += 0.15;
      return clamp01(s);
    },
    note: (ctx, score) => {
      const t = q(ctx, ctx.displayName);
      if (score > 0.55)
        return `High slogan density. Exhibit A: “${shortQuote(t, 64)}”. OS-ness via press release.`;
      return `Relatively restrained marketing surface. Still not proof of a kernel.`;
    },
  },
  {
    id: "syscall",
    label: "Syscall cosplay",
    weight: 1.0,
    score: (ctx) => {
      let s = 0;
      if (/\bapi\b|\bsdk\b|\bcli\b|\bendpoint/i.test(ctx.blob)) s += 0.35;
      if (ctx.signals.cloud > 0) s += 0.2;
      if (ctx.signals.os > 0) s += 0.15;
      if (/\brest\b|\bgraphql\b|\bwebhook/i.test(ctx.blob)) s += 0.15;
      return clamp01(s);
    },
    note: (ctx, score) =>
      score > 0.4
        ? `Interfaces exist (API/SDK/CLI language). Userspace, if you squint and rename "HTTP".`
        : `Few interface metaphors. The "syscall table" may be a contact form.`,
  },
  {
    id: "isolation",
    label: "Isolation vibes",
    weight: 1.1,
    score: (ctx) => {
      let s = sat(ctx.signals.security, 3);
      if (/\bsandbox\b|\bvm\b|\bcontainer\b|\bisolate|multi[-\s]?tenant/i.test(ctx.blob))
        s += 0.3;
      return clamp01(s);
    },
    note: (ctx, score) =>
      score > 0.45
        ? `Isolation/security vocabulary present (${ctx.signals.security} hits). Boundaries are part of the story.`
        : `Weak isolation narrative. Everyone shares the vibes plane.`,
  },
  {
    id: "boot",
    label: "Boot ritual",
    weight: 0.9,
    score: (ctx) => {
      let s = 0;
      if (/\binstall\b|\bdownload\b|\bget started\b|\bquickstart\b|\bdeploy\b|\bsign up\b/i.test(ctx.blob))
        s += 0.4;
      if (ctx.signals.pricing > 0) s += 0.2;
      if (/\bboot\b|\binit\b|\bstartup\b/i.test(ctx.blob)) s += 0.35;
      return clamp01(s);
    },
    note: (ctx, score) =>
      score > 0.4
        ? `Onboarding/install language found — a boot sequence of sorts (docs → account → card).`
        : `No clear boot path in the copy. Perhaps it was always already running.`,
  },
  {
    id: "posix",
    label: "POSIX / lineage",
    weight: 1.15,
    score: (ctx) => {
      let s = sat(ctx.signals.openSource, 3) * 0.5;
      if (/\bposix\b|\bunix\b|\blinux\b|\bgnu\b|\bbsd\b|\bsysv\b/i.test(ctx.blob)) s += 0.45;
      if (/\bemacs\b|\bvim\b|\bneovim\b/i.test(ctx.blob)) s += 0.25;
      if (/\bwindows\b|\bmacos\b|\bandroid\b|\bios\b/i.test(ctx.blob)) s += 0.4;
      return clamp01(s);
    },
    note: (ctx, score) =>
      score > 0.5
        ? `Lineage signals (Unix/Linux/OS names or open-source posture). Ancestor worship detected.`
        : `No POSIX/Unix/OS lineage language. Genealogy: "founded in a slide deck."`,
  },
];

function buildCriteria(ctx: SenseCtx): Criterion[] {
  return AXES.map((a) => {
    const score = a.score(ctx);
    return {
      id: a.id,
      label: a.label,
      weight: a.weight,
      score,
      note: a.note(ctx, score),
      axis: a.label,
    };
  });
}

function confidenceFrom(criteria: Criterion[], ctx: SenseCtx): number {
  let num = 0;
  let den = 0;
  for (const c of criteria) {
    num += c.score * c.weight;
    den += c.weight;
  }
  let pct = den ? (num / den) * 100 : 20;

  // Strong real-OS boosters
  if (/\bkernel\.org\b|\blinux\.org\b|\bfreedesktop\b/i.test(ctx.blob)) pct += 25;
  if (/\boperating system\b/i.test(ctx.blob) && ctx.signals.kernel > 0) pct += 12;
  if (ctx.signals.os > 0 && ctx.signals.saas > 3 && ctx.signals.kernel === 0) pct += 8; // marketing OS claim
  if (ctx.signals.saas > 4 && ctx.signals.kernel === 0 && ctx.signals.os === 0) pct -= 12;
  if (ctx.probe && !ctx.probe.ok) pct -= 5;

  // Known comedy magnets
  if (/cloudflare/i.test(ctx.blob) && ctx.signals.os > 0) pct = Math.max(pct, 55);
  if (/emacs/i.test(ctx.blob)) pct = Math.max(pct, 62);

  return Math.round(Math.min(96, Math.max(4, pct)));
}

function verdictFor(ctx: SenseCtx, confidence: number, criteria: Criterion[]): string {
  const name = ctx.displayName;
  const top = [...criteria].sort((a, b) => b.score - a.score)[0];
  const low = [...criteria].sort((a, b) => a.score - b.score)[0];

  if (/cloudflare/i.test(ctx.blob) && (ctx.signals.os > 0 || /workers|edge|cdn/i.test(ctx.blob))) {
    return `${name}: edge platform with OS-shaped branding`;
  }
  if (/\bemacs\b/i.test(ctx.blob)) {
    return `${name} — OS by lifestyle, editor by paperwork`;
  }
  if (confidence >= 72 && (ctx.signals.kernel > 0 || ctx.signals.openSource > 2)) {
    return `${name} scores like a real OS (kernel/lineage present)`;
  }
  if (confidence >= 55 && ctx.signals.os > 0) {
    return `${name} claims OS-hood; ${top?.label ?? "vibes"} is doing the heavy lifting`;
  }
  if (ctx.signals.saas > 3 && ctx.signals.kernel === 0) {
    return `${name} is SaaS wearing a trench coat labeled "platform"`;
  }
  if (ctx.signals.browser > 2 && confidence < 50) {
    return `${name}: browser-era software, not a bootloader`;
  }
  if (ctx.signals.cloud > 2 && ctx.signals.hardware < 1) {
    return `${name} — distributed cloud product, hardware optional (denied)`;
  }
  if (confidence < 30) {
    return `${name} fails the OS vibe check (${low?.label ?? "everything"} collapsed)`;
  }
  return `${name}: operating-system-shaped object (${Math.round(confidence)}% theater)`;
}

function subtitleFor(ctx: SenseCtx, confidence: number): string {
  const bits: string[] = [];
  if (ctx.probe?.ok && ctx.probe.title) {
    bits.push(`Probed “${shortQuote(ctx.probe.title, 56)}”.`);
  } else if (ctx.kind === "url" && ctx.probe && !ctx.probe.ok) {
    bits.push(`Probe failed (${ctx.probe.error || "unreachable"}) — scoring from URL/claim text only.`);
  } else if (ctx.kind === "claim") {
    bits.push(`Free-form claim analysis — no remote page.`);
  }
  bits.push(
    confidence >= 60
      ? `Determination leans OS-ward on content signals.`
      : `Determination leans “not an OS” on content signals.`,
  );
  if (ctx.host) bits.push(`Host: ${ctx.host}.`);
  return bits.join(" ");
}

function stampFor(confidence: number, ctx: SenseCtx): string {
  if (!ctx.probe?.ok && ctx.kind === "url") return "PROBE DEGRADED";
  if (confidence >= 75) return "OS-WARD SEAL";
  if (confidence >= 55) return "AMBIGUOUS SEAL";
  if (confidence >= 35) return "SKEPTICAL SEAL";
  return "NOT AN OS SEAL";
}

function findingsFor(ctx: SenseCtx): string[] {
  const out: string[] = [];
  if (ctx.probe?.ok) {
    out.push(
      `Fetched ${ctx.probe.finalUrl || ctx.subject} → HTTP ${ctx.probe.status ?? "?"} (${ctx.probe.bytes ?? 0} bytes).`,
    );
    if (ctx.probe.title) out.push(`Title: ${ctx.probe.title}`);
    if (ctx.probe.description) out.push(`Meta: ${shortQuote(ctx.probe.description, 140)}`);
    if (ctx.probe.headings?.length)
      out.push(`Headings: ${ctx.probe.headings.slice(0, 4).join(" · ")}`);
  } else if (ctx.kind === "url") {
    out.push(`Could not load page content${ctx.probe?.error ? `: ${ctx.probe.error}` : "."}`);
  } else {
    out.push(`Subject treated as claim text: “${shortQuote(ctx.subject, 100)}”.`);
  }

  const s = ctx.signals;
  const hits = (
    [
      ["OS wording", s.os],
      ["kernel", s.kernel],
      ["hardware", s.hardware],
      ["scheduler/process", s.schedule],
      ["platform", s.platform],
      ["SaaS/pricing", s.saas + s.pricing],
      ["cloud/edge", s.cloud],
      ["browser/JS", s.browser],
      ["security/isolation", s.security],
      ["AI", s.ai],
    ] as [string, number][]
  )
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, n]) => `${k}: ${n}`);

  if (hits.length) out.push(`Signal counts — ${hits.join(", ")}.`);
  else out.push("No strong OS/platform lexicon in the available text.");
  return out;
}

function redFlagsFor(ctx: SenseCtx, criteria: Criterion[]): string[] {
  const flags: string[] = [];
  if (ctx.signals.os > 0 && ctx.signals.kernel === 0) {
    flags.push(`Uses “OS” language without kernel/syscall talk — branding, not bootloader.`);
  }
  if (ctx.signals.pricing > 0 && ctx.signals.hardware === 0) {
    flags.push(`Pricing page energy with zero hardware contact.`);
  }
  if (ctx.signals.saas > 3) {
    flags.push(`Heavy SaaS/dashboard lexicon (${ctx.signals.saas} hits) — multi-tenant vibes, not ring‑0.`);
  }
  if (ctx.signals.platform > 2 && ctx.signals.schedule === 0) {
    flags.push(`“Platform” appears without process/scheduler vocabulary.`);
  }
  if (ctx.probe?.ok && (ctx.probe.headings?.length ?? 0) === 0) {
    flags.push(`No H1–H3 structure extracted — marketing SPA fog.`);
  }
  if (!ctx.probe?.ok && ctx.kind === "url") {
    flags.push(`Remote probe failed; determination is partially blind.`);
  }
  const marketing = criteria.find((c) => c.id === "marketing");
  const kernel = criteria.find((c) => c.id === "kernel");
  if (marketing && kernel && marketing.score > 0.5 && kernel.score < 0.25) {
    flags.push(`Marketing entropy ≫ kernel cosplay — classic fake-OS signature.`);
  }
  if (flags.length === 0) {
    flags.push(`No catastrophic red flags; still not a substitute for reading a kernel.`);
  }
  return flags.slice(0, 5);
}

function endorsementsFor(ctx: SenseCtx, confidence: number): string[] {
  const name = ctx.displayName;
  const out = [
    `Excerpt-driven read of ${ctx.host || "the claim"} (not a legal OS definition)`,
    confidence >= 50
      ? `Would boot on a conference slide about ${name}`
      : `Would not pass a systems oral exam about ${name}`,
  ];
  if (ctx.signals.ai > 2) out.push("An LLM somewhere is also confused");
  if (/cloudflare/i.test(ctx.blob)) out.push("Product naming committee (alleged)");
  return out.slice(0, 3);
}

function timelineFor(ctx: SenseCtx): { t: string; event: string }[] {
  const y = new Date().getFullYear();
  return [
    {
      t: "probe",
      event: ctx.probe?.ok
        ? `Retrieved “${shortQuote(ctx.probe.title || ctx.host || "page", 50)}”`
        : ctx.kind === "url"
          ? `Probe failed — ${ctx.probe?.error || "no body"}`
          : `Ingested claim text only`,
    },
    {
      t: "signals",
      event: `OS=${ctx.signals.os} kernel=${ctx.signals.kernel} saas=${ctx.signals.saas} cloud=${ctx.signals.cloud}`,
    },
    {
      t: `${y}`,
      event: `IIAO case sealed for ${ctx.displayName}`,
    },
  ];
}

function buildTree(ctx: SenseCtx, confidence: number, criteria: Criterion[]): TreeNode {
  const byId = Object.fromEntries(criteria.map((c) => [c.id, c]));
  const yes = (id: string, thresh = 0.4) => (byId[id]?.score ?? 0) >= thresh;

  const steps: {
    q: string;
    yLabel: string;
    nLabel: string;
    goYes: boolean;
  }[] = [
    {
      q: "Does the text claim OS / kernel power?",
      yLabel: ctx.signals.os + ctx.signals.kernel > 0 ? `Yes — OS/kernel hits (${ctx.signals.os + ctx.signals.kernel})` : "Yes (weak)",
      nLabel: "No OS/kernel lexicon",
      goYes: ctx.signals.os + ctx.signals.kernel > 0,
    },
    {
      q: "Is there scheduler/process language?",
      yLabel: yes("schedule", 0.35) ? "Yes — work is 'run'" : "Mostly no",
      nLabel: "No process model in copy",
      goYes: yes("schedule", 0.35),
    },
    {
      q: "Hardware contact or pure cloud?",
      yLabel: yes("hardware", 0.35) ? "Mentions hardware/metal" : "Token hardware",
      nLabel: ctx.signals.cloud > 0 ? "Cloud/edge, metal optional" : "No hardware story",
      goYes: yes("hardware", 0.35),
    },
    {
      q: "SaaS/pricing dominant?",
      yLabel: ctx.signals.saas + ctx.signals.pricing > 2 ? "Yes — commercial surface" : "Mild",
      nLabel: "Not primarily a pricing story",
      goYes: ctx.signals.saas + ctx.signals.pricing > 2,
    },
    {
      q: "Final content-weighted call",
      yLabel: confidence >= 50 ? `OS-ward (${confidence}%)` : `Weak OS case`,
      nLabel: confidence < 50 ? `Not an OS (${confidence}%)` : "Ambiguous",
      goYes: confidence >= 50,
    },
  ];

  function leaf(label: string, outcome: TreeNode["outcome"]): TreeNode {
    return { id: `L-${label.slice(0, 12)}`, label, outcome };
  }

  // Linear path following actual goYes, with rejected branch as stub
  let root: TreeNode = {
    id: "root",
    label: `Is ${shortQuote(ctx.displayName, 28)} an OS?`,
    detail: "Content-weighted inquiry",
    children: [],
  };

  let cursor = root;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    const yNode: TreeNode = {
      id: `Y${i}`,
      label: s.yLabel,
      outcome: "yes",
      children: [],
    };
    const nNode: TreeNode = {
      id: `N${i}`,
      label: s.nLabel,
      outcome: "no",
      children: [],
    };
    const qNode: TreeNode = {
      id: `Q${i}`,
      label: s.q,
      children: [yNode, nNode],
    };

    // attach qNode under cursor's chosen path
    if (i === 0) {
      root.children = [qNode];
    } else {
      cursor.children = [qNode];
    }

    const chosen = s.goYes ? yNode : nNode;
    const rejected = s.goYes ? nNode : yNode;
    rejected.children = [
      leaf(s.goYes ? "Rejected path" : "Rejected path", "leaf"),
    ];

    if (i === steps.length - 1) {
      chosen.children = [
        leaf(
          confidence >= 50
            ? `Conclude: OS-shaped (${confidence}%)`
            : `Conclude: not an OS (${confidence}%)`,
          confidence >= 50 ? "yes" : "no",
        ),
      ];
    } else {
      cursor = chosen;
    }
  }

  // Chaos footnote if marketing OS without kernel
  if (ctx.signals.os > 0 && ctx.signals.kernel === 0) {
    root.children!.push({
      id: "chaos",
      label: "Chaos branch: marketing said OS",
      outcome: "chaos",
      children: [
        leaf(`Rebrand “${shortQuote(ctx.displayName, 24)}” as lifestyle kernel`, "chaos"),
      ],
    });
  }

  return root;
}

function caseId(seed: string): string {
  return `IIAO-${seed.slice(0, 4).toUpperCase()}-${seed.slice(4, 8).toUpperCase()}`;
}

export function analyze(subjectRaw: string, probe?: ProbeResult | null): Analysis {
  const ctx = buildContext(subjectRaw, probe);
  const seed = seedHex(ctx.subject.toLowerCase() + "|" + (ctx.probe?.title ?? ""));
  // rng only for non-semantic garnish
  const rng = mulberry32(hashString(seed));
  void rng;

  const criteria = buildCriteria(ctx);
  const confidence = confidenceFrom(criteria, ctx);
  const radar = criteria.map((c) => ({
    axis: c.axis,
    value: Math.round(c.score * 100),
  }));

  return {
    subject: ctx.subject,
    kind: ctx.kind,
    host: ctx.host,
    seed,
    caseId: caseId(seed),
    confidence,
    verdict: verdictFor(ctx, confidence, criteria),
    subtitle: subtitleFor(ctx, confidence),
    stamp: stampFor(confidence, ctx),
    criteria,
    tree: buildTree(ctx, confidence, criteria),
    radar,
    timeline: timelineFor(ctx),
    redFlags: redFlagsFor(ctx, criteria),
    endorsements: endorsementsFor(ctx, confidence),
    findings: findingsFor(ctx),
    methodology: [
      "HTTP probe extracts title, meta, headings, text sample, signal counts",
      "Eight weighted axes scored from those signals (not a random table)",
      "Decision tree branches follow measured yes/no from the page",
      "Tone is satirical; counts and quotes are from the subject",
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
      blurb: "Kernel, scheduler, hardware, SaaS entropy, …",
      ms: 280,
    },
    {
      id: "tree",
      label: "Walk decision tree",
      blurb: "Branches follow measured signals",
      ms: 240,
    },
    {
      id: "radar",
      label: "Project radar",
      blurb: "Axis scores → chart",
      ms: 160,
    },
    {
      id: "seal",
      label: "Seal determination",
      blurb: "Verdict + confidence from content weights",
      ms: 140,
    },
  ];
}
