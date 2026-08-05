/**
 * Content + comedy OS-ness sensing.
 * Absurd things (shoes, toasters) score high with far-fetched analogies.
 * Marketing “platforms” / Cloudflare-OS energy score low.
 */
import {
  absurdAxisNotes,
  absurdRoast,
  analogiesFor,
  classify,
  confidenceFor,
  genericRoast,
  marketingRoast,
  realOsRoast,
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
    (kind === "claim" ? shortQuote(subject, 48) : null) ||
    probe?.title?.split(/[|\-–—]/)[0]?.trim() ||
    host ||
    shortQuote(subject, 48);

  const partial = {
    subject,
    kind: (kind === "empty" ? "claim" : kind) as SubjectKind,
    host,
    displayName,
    blob,
    probe: probe ?? null,
    signals: base,
    quotes: [...new Set(quotes.map((x) => shortQuote(x, 100)))].slice(0, 8),
  };

  const mode = classify({
    subject: partial.subject,
    displayName: partial.displayName,
    blob: partial.blob,
    kind: partial.kind,
    host: partial.host,
    signals: partial.signals,
    probeOk: !!probe?.ok,
  });

  return { ...partial, mode };
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
  if (ctx.mode === "absurd") {
    const a = analogiesFor({
      subject: ctx.subject,
      displayName: ctx.displayName,
      blob: ctx.blob,
      kind: ctx.kind,
      host: ctx.host,
      signals: ctx.signals,
      probeOk: !!ctx.probe?.ok,
    });
    const notes = absurdAxisNotes(a);
    // All axes high — far-fetched but committed
    const scores: Record<string, number> = {
      kernel: 0.88,
      schedule: 0.91,
      hardware: 0.86,
      marketing: 0.15,
      syscall: 0.84,
      isolation: 0.79,
      boot: 0.93,
      posix: 0.77,
    };
    return AXES.map((ax) => ({
      id: ax.id,
      label: ax.label,
      weight: ax.weight,
      score: scores[ax.id] ?? 0.8,
      note: notes[ax.id] ?? a.kernel,
      axis: ax.label,
      inputs: ["far-fetched analogy (not a word-count)"],
    }));
  }

  if (ctx.mode === "marketing") {
    // Depress OS axes, inflate marketing
    return AXES.map((ax) => {
      const { score, inputs } = ax.score(ctx);
      let s = score;
      if (ax.id === "kernel" || ax.id === "hardware" || ax.id === "posix")
        s = Math.min(s, 0.22);
      if (ax.id === "marketing") s = Math.max(s, 0.75);
      if (ax.id === "boot") s = Math.min(Math.max(s, 0.45), 0.55); // signup flow
      return {
        id: ax.id,
        label: ax.label,
        weight: ax.weight,
        score: s,
        note:
          ax.id === "kernel"
            ? "No kernel. Only hero gradients and a “Get started” button."
            : ax.id === "marketing"
              ? "Slogan density could power a small city."
              : ax.note(ctx, s),
        axis: ax.label,
        inputs,
      };
    });
  }

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

function comedyBag(ctx: SenseCtx) {
  return {
    subject: ctx.subject,
    displayName: ctx.displayName,
    blob: ctx.blob,
    kind: ctx.kind,
    host: ctx.host,
    signals: ctx.signals,
    probeOk: !!ctx.probe?.ok,
  };
}

function confidenceFrom(ctx: SenseCtx) {
  return confidenceFor(ctx.mode, comedyBag(ctx));
}

function verdictFor(ctx: SenseCtx, confidence: number): string {
  const name = ctx.displayName;
  if (ctx.mode === "absurd") {
    return `${name} is an operating system (we can explain)`;
  }
  if (ctx.mode === "marketing") {
    return `${name} is a landing page with main-character syndrome`;
  }
  if (ctx.mode === "real_os") {
    return `${name} is, unfortunately, a real OS`;
  }
  if (/\bemacs\b/i.test(ctx.blob)) {
    return `${name}: OS if you live there, editor on your tax forms`;
  }
  return confidence >= 55
    ? `${name} is OS-shaped if you squint with love`
    : `${name} is ${confidence}% OS — mostly vibes`;
}

function subtitleFor(ctx: SenseCtx, confidence: number): string {
  if (ctx.mode === "absurd") {
    return `Far-fetched? Yes. Wrong? No. ${confidence}% OS by constructive analogy.`;
  }
  if (ctx.mode === "marketing") {
    return `Said “platform” a lot. Still not a kernel. ${confidence}% and that's generous.`;
  }
  if (ctx.mode === "real_os") {
    return `No bit. No stretch. Just a kernel. ${confidence}%.`;
  }
  return `Committee split. ${confidence}% after poetry was admitted into evidence.`;
}

function stampFor(ctx: SenseCtx, confidence: number): string {
  if (ctx.mode === "absurd") return "CERTIFIED OS";
  if (ctx.mode === "marketing") return "COSPLAY ONLY";
  if (ctx.mode === "real_os") return "BORINGLY CORRECT";
  if (confidence >= 55) return "OS-ADJACENT";
  return "NOT AN OS";
}

function findingsFor(ctx: SenseCtx): string[] {
  return roastFor(ctx, 50);
}

function roastFor(ctx: SenseCtx, confidence: number): string[] {
  const c = comedyBag(ctx);
  if (ctx.mode === "absurd") {
    return absurdRoast(c, analogiesFor(c), confidence);
  }
  if (ctx.mode === "marketing") {
    return marketingRoast(c, confidence);
  }
  if (ctx.mode === "real_os") {
    return realOsRoast(c, confidence);
  }
  return genericRoast(c, confidence);
}

function redFlagsFor(ctx: SenseCtx): string[] {
  if (ctx.mode === "absurd") {
    const a = analogiesFor(comedyBag(ctx));
    return [
      a.syscall,
      "Detractors will say this is a metaphor. Detractors also use Windows.",
      "If Cloudflare can ship an OS, a shoe can ship preemption.",
    ];
  }
  if (ctx.mode === "marketing") {
    const flags: string[] = [];
    if (ctx.signals.os > 0 && ctx.signals.kernel === 0) {
      flags.push(
        `“OS” ${ctx.signals.os}×, kernel 0× — naming is doing all the heavy lifting.`,
      );
    }
    flags.push(
      `A shoe has a clearer boot sequence than ${ctx.displayName}.`,
    );
    if (ctx.signals.pricing + ctx.signals.saas >= 3) {
      flags.push(`Boots into a pricing table. That's not init, that's sales.`);
    }
    flags.push(`Platform cosplay level: professional.`);
    return flags;
  }
  if (ctx.mode === "real_os") {
    return [
      "No red flags — only the grey ones of actual systems software.",
      "Humor declined: reality intervened.",
    ];
  }
  return [
    ctx.signals.saas > 2
      ? "SaaS smell detected — analogy reserves partially mobilized."
      : "Could go either way. Poetry on standby.",
  ];
}

function timelineFor(ctx: SenseCtx): { t: string; event: string }[] {
  return [
    {
      t: "1",
      event: `mode=${ctx.mode}`,
    },
    {
      t: "2",
      event: `os=${ctx.signals.os} kernel=${ctx.signals.kernel} saas=${ctx.signals.saas}`,
    },
    {
      t: "3",
      event:
        ctx.mode === "absurd"
          ? "constructive analogy engaged"
          : ctx.mode === "marketing"
            ? "cosplay court in session"
            : "systems court",
    },
  ];
}

/**
 * Decision tree: comedy-mode tests with measured / analogical detail.
 */
function buildTree(ctx: SenseCtx, confidence: number): TreeNode {
  type Test = {
    id: string;
    question: string;
    measure: string;
    threshold: string;
    pass: boolean;
  };

  const a = analogiesFor(comedyBag(ctx));
  let tests: Test[];

  if (ctx.mode === "absurd") {
    tests = [
      {
        id: "t-resource",
        question: "Does it manage resources?",
        measure: a.kernel,
        threshold: "yes if it constrains reality",
        pass: true,
      },
      {
        id: "t-sched",
        question: "Does it schedule work?",
        measure: a.scheduler,
        threshold: "yes if time is involved",
        pass: true,
      },
      {
        id: "t-boot",
        question: "Is there a boot sequence?",
        measure: a.boot,
        threshold: "yes if it starts somehow",
        pass: true,
      },
      {
        id: "t-vs-corp",
        question: "More OS than a SaaS homepage?",
        measure: "shoe/toaster/calendar > pricing page",
        threshold: "always",
        pass: true,
      },
      {
        id: "t-final",
        question: "Declare it an OS?",
        measure: `analogy confidence = ${confidence}%`,
        threshold: "≥ 50%",
        pass: confidence >= 50,
      },
    ];
  } else if (ctx.mode === "marketing") {
    tests = [
      {
        id: "t-said-os",
        question: "Did marketing say OS/platform?",
        measure: `os=${ctx.signals.os} platform=${ctx.signals.platform}`,
        threshold: "any branding hit",
        pass: ctx.signals.os + ctx.signals.platform > 0,
      },
      {
        id: "t-kernel",
        question: "Is there an actual kernel?",
        measure: `kernel hits=${ctx.signals.kernel}`,
        threshold: "≥ 1",
        pass: ctx.signals.kernel >= 1,
      },
      {
        id: "t-pricing",
        question: "Does it boot into pricing?",
        measure: `saas+pricing=${ctx.signals.saas + ctx.signals.pricing}`,
        threshold: "≥ 3 → yes",
        pass: ctx.signals.saas + ctx.signals.pricing >= 3,
      },
      {
        id: "t-shoe",
        question: "Would a shoe beat it in court?",
        measure: "far-fetched objects have better process models",
        threshold: "yes",
        pass: true,
      },
      {
        id: "t-final",
        question: "Is it an OS?",
        measure: `score = ${confidence}%`,
        threshold: "≥ 50% (it won't)",
        pass: confidence >= 50,
      },
    ];
  } else {
    tests = [
      {
        id: "t-os-kernel",
        question: "OS/kernel lexicon present?",
        measure: `os=${ctx.signals.os}, kernel=${ctx.signals.kernel}`,
        threshold: "sum ≥ 1",
        pass: ctx.signals.os + ctx.signals.kernel >= 1,
      },
      {
        id: "t-saas",
        question: "Is SaaS doing the talking?",
        measure: `saas+pricing=${ctx.signals.saas + ctx.signals.pricing}`,
        threshold: "≥ 3",
        pass: ctx.signals.saas + ctx.signals.pricing >= 3,
      },
      {
        id: "t-analogy",
        question: "Can we force an analogy?",
        measure: a.boot,
        threshold: "poetry allowed",
        pass: true,
      },
      {
        id: "t-final",
        question: "Final call ≥ 50%?",
        measure: `score = ${confidence}%`,
        threshold: "≥ 50%",
        pass: confidence >= 50,
      },
    ];
  }

  const root: TreeNode = {
    id: "root",
    label: `Is ${shortQuote(ctx.displayName, 32)} an OS?`,
    detail:
      ctx.mode === "absurd"
        ? "analogy court"
        : ctx.mode === "marketing"
          ? "cosplay court"
          : "systems court",
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
      detail: t.pass ? `→ ${t.measure}` : t.measure,
      outcome: "yes",
      taken: t.pass,
      children: [],
    };
    const noNode: TreeNode = {
      id: `${t.id}-no`,
      label: "No",
      detail: !t.pass ? `→ ${t.measure}` : t.measure,
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
              ? `It is an OS · ${confidence}%`
              : `Not an OS · ${confidence}%`,
          detail:
            ctx.mode === "absurd"
              ? "by constructive analogy"
              : ctx.mode === "marketing"
                ? "by corporate cosplay failure"
                : `confidence ${confidence}%`,
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
  const { confidence, steps } = confidenceFrom(ctx);
  const radar = criteria.map((c) => ({
    axis: c.axis,
    value: Math.round(c.score * 100),
  }));

  const roast = roastFor(ctx, confidence);

  return {
    subject: ctx.subject,
    kind: ctx.kind,
    host: ctx.host,
    seed,
    caseId: caseId(ctx.subject, ctx.probe?.title ?? ""),
    confidence,
    verdict: verdictFor(ctx, confidence),
    subtitle: subtitleFor(ctx, confidence),
    stamp: stampFor(ctx, confidence),
    criteria,
    tree: buildTree(ctx, confidence),
    radar,
    signalStats: signalStats(ctx),
    confidenceSteps: steps,
    timeline: timelineFor(ctx),
    redFlags: redFlagsFor(ctx),
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
