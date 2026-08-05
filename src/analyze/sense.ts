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
      score > 0.55
        ? `Actually said kernel/OS stuff (${ctx.signals.kernel + ctx.signals.os}×). Bold of them.`
        : `Almost no kernel talk. Ring‑0 remains a cosplay outfit.`,
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
      score > 0.4
        ? `Mentions processes/scheduling (${ctx.signals.schedule}×). Something gets “run.”`
        : `No process model in the copy. Work is scheduled by hope and Slack.`,
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
      score > 0.4
        ? `Touches metal in language (${ctx.signals.hardware}×). Silicon was mentioned.`
        : `Hardware is a myth. This thing runs on pure marketing weather.`,
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
      score > 0.55
        ? `Platform/SaaS fog is thick. Pricing energy detected.`
        : `Surprisingly restrained on the slogan front. Still not a kernel.`,
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
    note: (ctx, score) =>
      score > 0.4
        ? `APIs/SDKs exist — syscalls if you rename HTTP and squint.`
        : `Few interfaces. The “syscall table” might be a contact form.`,
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
      score > 0.45
        ? `Isolation talk shows up (${ctx.signals.security}×). Boundaries, allegedly.`
        : `Everyone shares the vibes plane. Multi-tenant of the soul.`,
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
    note: (ctx, score) =>
      score > 0.4
        ? `There's a “boot” path: install → account → credit card.`
        : `No boot sequence. Perhaps it was always already running in a deck.`,
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
      score > 0.5
        ? `Unix/Linux/OS ancestry name-dropped. Ancestor worship detected.`
        : `Genealogy: “founded in a slide deck, 20xx.”`,
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
    { label: "Average of the vibe axes", delta: base, total: base },
  ];
  let total = base;

  const adjust = (label: string, delta: number) => {
    if (delta === 0) return;
    total += delta;
    steps.push({ label, delta, total });
  };

  if (/\bkernel\.org\b|\blinux\.org\b|\bfreedesktop\b/i.test(ctx.blob)) {
    adjust("It's literally kernel.org energy (+25)", 25);
  }
  if (/\boperating system\b/i.test(ctx.blob) && ctx.signals.kernel > 0) {
    adjust("Said “operating system” and meant it (+12)", 12);
  }
  if (ctx.signals.os > 0 && ctx.signals.saas > 3 && ctx.signals.kernel === 0) {
    adjust("Said OS on a SaaS page (+8, branding tax rebate)", 8);
  }
  if (ctx.signals.saas > 4 && ctx.signals.kernel === 0 && ctx.signals.os === 0) {
    adjust("Pure SaaS, zero kernel (−12)", -12);
  }
  if (ctx.probe && !ctx.probe.ok && ctx.kind === "url") {
    adjust("Page wouldn't load, we guessed (−5)", -5);
  }
  if (/cloudflare/i.test(ctx.blob) && ctx.signals.os > 0) {
    const floor = 55;
    if (total < floor)
      adjust(`Cloudflare said OS so floor is ${floor}%`, floor - total);
  }
  if (/\bemacs\b/i.test(ctx.blob)) {
    const floor = 62;
    if (total < floor)
      adjust(`Emacs diplomatic immunity → ${floor}%`, floor - total);
  }

  const confidence = Math.round(Math.min(96, Math.max(4, total)));
  if (confidence !== Math.round(total)) {
    steps.push({
      label: `Reality clamp → ${confidence}%`,
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
    return `${name} is an edge platform that said the quiet part (“OS”) out loud`;
  }
  if (/\bemacs\b/i.test(ctx.blob)) {
    return `${name}: OS if you live there, editor if you have to file taxes`;
  }
  if (
    confidence >= 72 &&
    (ctx.signals.kernel > 0 || ctx.signals.openSource > 2)
  ) {
    return `${name} might actually be an OS — awkward for the bit`;
  }
  if (confidence >= 55 && ctx.signals.os > 0) {
    return `${name} wants the OS title; ${top?.label ?? "vibes"} is doing PR`;
  }
  if (ctx.signals.saas > 3 && ctx.signals.kernel === 0) {
    return `${name} is SaaS in a trench coat labeled “platform”`;
  }
  if (ctx.signals.browser > 2 && confidence < 50) {
    return `${name}: a website with ambition, not a bootloader`;
  }
  if (ctx.signals.cloud > 2 && ctx.signals.hardware < 1) {
    return `${name} lives in the cloud and has never met a CPU`;
  }
  if (confidence < 30) {
    return `${name} is ${confidence}% OS — mostly ${low?.label ?? "not"}`;
  }
  return `${name} clocks in at ${confidence}% operating-system-shaped`;
}

function subtitleFor(ctx: SenseCtx, confidence: number): string {
  if (confidence >= 75) {
    return `We're not saying it is an OS. We're saying ${confidence}% of the evidence is embarrassing.`;
  }
  if (confidence >= 50) {
    return `Schrodinger's OS: ${confidence}% chance it's real, 100% chance the naming was aggressive.`;
  }
  if (confidence >= 30) {
    return `Could be an OS if you redefine “OS” as “thing with a website.” Please don't.`;
  }
  return `This is about as much OS as a toaster is a chef. ${confidence}% on a good day.`;
}

function stampFor(confidence: number, ctx: SenseCtx): string {
  if (!ctx.probe?.ok && ctx.kind === "url") return "GHOSTED BY HTTP";
  if (confidence >= 75) return "SUSPICIOUSLY OS";
  if (confidence >= 55) return "IT'S COMPLICATED";
  if (confidence >= 35) return "THIN ICE";
  return "NOT AN OS";
}

function findingsFor(ctx: SenseCtx): string[] {
  // Kept for internal use; UI prefers roast[]
  return roastFor(ctx, 50, []);
}

function roastFor(
  ctx: SenseCtx,
  confidence: number,
  criteria: Criterion[],
): string[] {
  const name = ctx.displayName;
  const lines: string[] = [];
  const s = ctx.signals;
  const top = [...criteria].sort((a, b) => b.score - a.score)[0];
  const low = [...criteria].sort((a, b) => a.score - b.score)[0];

  if (ctx.probe?.ok && ctx.probe.title) {
    lines.push(
      `Somewhere, a marketer typed “${shortQuote(ctx.probe.title, 48)}” and hit publish like it was a kernel config.`,
    );
  } else if (ctx.kind === "url" && ctx.probe && !ctx.probe.ok) {
    lines.push(
      `The site wouldn't even load. That's either security theater or shame. We assumed both.`,
    );
  } else if (ctx.kind === "claim") {
    lines.push(
      `No website — just the claim “${shortQuote(ctx.subject, 60)},” standing naked under fluorescent lights.`,
    );
  }

  if (s.os > 0 && s.kernel === 0) {
    lines.push(
      `They said “OS” ${s.os} time${s.os === 1 ? "" : "s"} and “kernel” zero times. That's not engineering. That's a mood board.`,
    );
  } else if (s.kernel >= 3) {
    lines.push(
      `Kernel talk showed up ${s.kernel}×. Either it's real or they're LARPing Multics on LinkedIn.`,
    );
  }

  if (s.saas + s.pricing >= 4) {
    lines.push(
      `Pricing/SaaS energy is off the charts. If this boots, it boots into a checkout form.`,
    );
  }
  if (s.cloud >= 3 && s.hardware === 0) {
    lines.push(
      `Lots of “cloud,” zero hardware. Somewhere a CPU is filing a missing-person report.`,
    );
  }
  if (s.ai >= 3) {
    lines.push(
      `AI got name-dropped ${s.ai}×. Congrats, your “OS” is a chatbot with a status page.`,
    );
  }
  if (s.platform >= 3) {
    lines.push(
      `“Platform” appears like a nervous tic. Platforms used to mean something. Then marketing found the word.`,
    );
  }

  if (confidence >= 70) {
    lines.push(
      `At ${confidence}% we're uncomfortably close to admitting ${name} might… be an OS. The bit is suffering.`,
    );
  } else if (confidence >= 45) {
    lines.push(
      `${confidence}% OS-shaped. Not nothing. Not Windows. Mostly ${top?.label?.toLowerCase() ?? "vibes"}.`,
    );
  } else {
    lines.push(
      `${confidence}% — which is a polite way of saying ${low?.label?.toLowerCase() ?? "everything"} is doing stand-up while the kernel is in another building.`,
    );
  }

  if (/\bemacs\b/i.test(ctx.blob)) {
    lines.push(`Emacs exemption applied. The church of Ctrl‑X has lobbyists.`);
  }
  if (/cloudflare/i.test(ctx.blob)) {
    lines.push(
      `If Cloudflare ships it, half the internet will call it an OS by Thursday anyway.`,
    );
  }

  // unique, max 5
  return [...new Set(lines)].slice(0, 5);
}

function redFlagsFor(ctx: SenseCtx, criteria: Criterion[]): string[] {
  const flags: string[] = [];
  if (ctx.signals.os > 0 && ctx.signals.kernel === 0) {
    flags.push(
      `Said “OS” ${ctx.signals.os}× with zero kernel talk. That's not a product category, that's a tattoo.`,
    );
  }
  if (ctx.signals.pricing > 0 && ctx.signals.hardware === 0) {
    flags.push(
      `Pricing page energy (${ctx.signals.pricing}×) but hardware is a stranger.`,
    );
  }
  if (ctx.signals.saas > 3) {
    flags.push(
      `SaaS/dashboard lexicon is doing cardio (${ctx.signals.saas} hits). Multi-tenant vibes, not ring‑0.`,
    );
  }
  if (ctx.signals.platform > 2 && ctx.signals.schedule === 0) {
    flags.push(
      `“Platform” ${ctx.signals.platform}×, processes 0×. Platforms used to mean something. Allegedly.`,
    );
  }
  if (ctx.probe?.ok && (ctx.probe.headings?.length ?? 0) === 0) {
    flags.push(`No real headings — just marketing fog and a hero image of gradients.`);
  }
  if (!ctx.probe?.ok && ctx.kind === "url") {
    flags.push(`Couldn't load the page. Judging based on the vibe of the URL. Fair? No. Fun? Yes.`);
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
      `Marketing score ${(marketing.score * 100).toFixed(0)}% vs kernel ${(kernel.score * 100).toFixed(0)}% — classic fake-OS signature.`,
    );
  }
  return flags;
}

function timelineFor(ctx: SenseCtx): { t: string; event: string }[] {
  return [
    {
      t: "1",
      event: ctx.probe?.ok
        ? `Opened “${shortQuote(ctx.probe.title || ctx.host || "page", 50)}”`
        : ctx.kind === "url"
          ? `Page ghosted us — ${ctx.probe?.error || "no body"}`
          : `No page, only vibes`,
    },
    {
      t: "2",
      event: `Counted the snitches: os=${ctx.signals.os} kernel=${ctx.signals.kernel} saas=${ctx.signals.saas} cloud=${ctx.signals.cloud}`,
    },
    {
      t: "3",
      event: `Rubber-stamped a percentage like it's science`,
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
      question: "Did they even whisper “OS” or “kernel”?",
      measure: `os=${ctx.signals.os}, kernel=${ctx.signals.kernel}, sum=${ctx.signals.os + ctx.signals.kernel}`,
      threshold: "sum ≥ 1",
      pass: ctx.signals.os + ctx.signals.kernel >= 1,
    },
    {
      id: "t-kernel-axis",
      question: "Is the kernel cosplay convincing?",
      measure: `kernel vibe = ${(sc("kernel") * 100).toFixed(0)}%`,
      threshold: "≥ 40%",
      pass: sc("kernel") >= 0.4,
    },
    {
      id: "t-schedule",
      question: "Does anything get scheduled, or only meetings?",
      measure: `schedule hits=${ctx.signals.schedule}, axis=${(sc("schedule") * 100).toFixed(0)}%`,
      threshold: "hits ≥ 1 OR axis ≥ 35%",
      pass: ctx.signals.schedule >= 1 || sc("schedule") >= 0.35,
    },
    {
      id: "t-hardware",
      question: "Have they met a CPU in real life?",
      measure: `hardware hits=${ctx.signals.hardware}, axis=${(sc("hardware") * 100).toFixed(0)}%`,
      threshold: "hits ≥ 1 OR axis ≥ 35%",
      pass: ctx.signals.hardware >= 1 || sc("hardware") >= 0.35,
    },
    {
      id: "t-saas",
      question: "Is this just a pricing page in a trench coat?",
      measure: `saas+pricing=${ctx.signals.saas + ctx.signals.pricing}`,
      threshold: "sum ≥ 3 → yes, commercial fog",
      pass: ctx.signals.saas + ctx.signals.pricing >= 3,
    },
    {
      id: "t-final",
      question: "Final vibe check ≥ 50%?",
      measure: `score = ${confidence}%`,
      threshold: "≥ 50% → OS-ward",
      pass: confidence >= 50,
    },
  ];

  const root: TreeNode = {
    id: "root",
    label: `Is ${shortQuote(ctx.displayName, 32)} an OS?`,
    detail: "the only question that matters",
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

  const roast = roastFor(ctx, confidence, criteria);

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
    roast,
    methodology: [],
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
      label: "Stare at the subject",
      blurb: kind === "url" ? "Looks like a URL. Dangerous." : "Free-form nonsense. Perfect.",
      ms: 200,
    },
    {
      id: "probe",
      label: "Raid the webpage",
      blurb:
        kind === "url"
          ? "Steal title, headings, incriminating words"
          : "No page — pure claim energy",
      ms: kind === "url" ? 800 : 120,
    },
    {
      id: "lex",
      label: "Count the snitches",
      blurb: "OS, kernel, SaaS, pricing — who talked?",
      ms: 280,
    },
    {
      id: "tree",
      label: "Hold the inquisition",
      blurb: "Yes/no questions with receipts",
      ms: 240,
    },
    {
      id: "radar",
      label: "Draw the vibe circle",
      blurb: "Make it look expensive",
      ms: 160,
    },
    {
      id: "seal",
      label: "Rubber-stamp a number",
      blurb: "Science™",
      ms: 140,
    },
  ];
}
