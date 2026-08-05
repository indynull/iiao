/**
 * Short, deadpan punchlines — single-serving-site energy.
 * Absurd things → YES with one clean analogy.
 * Marketing platforms → NO with one dry line.
 * Real OSes → YES, unfortunately.
 */
import type { ProbeSignals, SubjectKind } from "./types";

export type ComedyMode = "absurd" | "marketing" | "real_os" | "generic";

export type ComedyCtx = {
  subject: string;
  displayName: string;
  blob: string;
  kind: SubjectKind;
  host: string | null;
  signals: ProbeSignals;
  probeOk: boolean;
};

export type JokeResult = {
  answer: "YES" | "NO" | "KINDA";
  confidence: number;
  line: string;
  sub?: string;
};

const ABSURD_RE =
  /\b(shoe|sneaker|boot|sandal|sock|toaster|fridge|refrigerator|microwave|oven|kettle|mug|cup|chair|table|desk|sofa|couch|lamp|bulb|pencil|pen|notebook|calendar|umbrella|backpack|wallet|keys?|door|window|mirror|toothbrush|toothpaste|soap|towel|pillow|blanket|sandwich|pizza|banana|apple|coffee|tea|beer|wine|plant|cactus|cat|dog|hamster|bird|fish|rock|stone|brick|road|bridge|elevator|escalator|traffic light|parking meter|vending machine|atm|remote|remote control|tv|television|radio|clock|watch|alarm|bike|bicycle|car|bus|train|plane|boat|ship|hammer|screwdriver|wrench|nail|screw|tape|glue|sticker|meme|spreadsheet|inbox|email|slack|meeting|standup|stand-up|todo|to-do|habit|group chat|chat)\b/i;

const REAL_OS_RE =
  /\b(linux|kernel\.org|freebsd|openbsd|netbsd|windows|macos|darwin|android|ios|unix|gnu\/linux|reactos|templeos|haiku)\b/i;

const MARKETING_HOST_RE =
  /\b(cloudflare|vercel|netlify|heroku|datadog|stripe|salesforce|hubspot|notion|asana|monday|airtable|zendesk|intercom|twilio|okta|auth0|supabase|firebase)\b/i;

export function spice(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function classify(ctx: ComedyCtx): ComedyMode {
  if (REAL_OS_RE.test(ctx.blob) || REAL_OS_RE.test(ctx.subject)) return "real_os";
  if (ctx.signals.kernel >= 4 && ctx.signals.openSource >= 2) return "real_os";

  const corp =
    ctx.signals.saas +
    ctx.signals.pricing +
    ctx.signals.platform +
    ctx.signals.cloud +
    ctx.signals.ai;
  if (
    MARKETING_HOST_RE.test(ctx.blob) ||
    (corp >= 6 && ctx.signals.kernel === 0) ||
    (ctx.signals.os > 0 && ctx.signals.kernel === 0 && corp >= 3)
  ) {
    return "marketing";
  }

  if (ABSURD_RE.test(ctx.subject) || ABSURD_RE.test(ctx.displayName)) return "absurd";
  if (ctx.kind === "claim" && corp + ctx.signals.kernel + ctx.signals.os < 2)
    return "absurd";
  return "generic";
}

function pick<T>(sp: number, items: T[]): T {
  return items[Math.floor(sp * items.length) % items.length]!;
}

/** One killer line for absurd objects. */
function absurdLine(name: string, subject: string, sp: number): string {
  const s = (subject + " " + name).toLowerCase();
  const n = name.trim() || "It";

  if (/\bshoe|sneaker|sandal|boot|sock\b/.test(s)) {
    return pick(sp, [
      `${n} boots, preempts socks, and never ships a status page.`,
      `The sole is ring 0. Everything else is just drivers for the sidewalk.`,
      `${n} schedules steps in hard real time. Your calendar wishes it could.`,
    ]);
  }
  if (/\btoaster|oven|microwave|kettle|fridge\b/.test(s)) {
    return pick(sp, [
      `${n} runs a privileged heating loop and panics into breakfast.`,
      `Crumbs are orphaned inodes. Bagel mode is a realtime priority class.`,
      `Power-on self-test: the little light. If it fails, civilization ends.`,
    ]);
  }
  if (/\bcalendar|meeting|standup|inbox|email|slack|todo|group chat|chat\b/.test(s)) {
    return pick(sp, [
      `${n} is a scheduler with worse UX than cron and stronger opinions than systemd.`,
      `It preempts your life with soft IRQs called “invites.”`,
      `You are the process. Decline is SIGTERM. No-show is OOM.`,
    ]);
  }
  if (/\bcat|dog|hamster|bird|fish\b/.test(s)) {
    return pick(sp, [
      `${n} runs instinct in kernel mode and treats you like a guest account.`,
      `Naps have higher priority than your meetings. Correctly.`,
      `Food bowl is the bootloader. Zoomies are hardware interrupts.`,
    ]);
  }
  if (/\bcar|bus|train|bike|bicycle\b/.test(s)) {
    return pick(sp, [
      `Ignition is boot. Traffic is the global lock. You're not realtime.`,
      `${n} abstracts roads so your plans don't segfault into a ditch.`,
    ]);
  }

  return pick(sp, [
    `${n} manages resources, time, and mild regret — that's an OS with better branding.`,
    `${n} boots when you start caring and never takes writeups. Elite uptime culture.`,
    `If it coordinates chaos so the rest of life can run, it's an OS. ${n} qualifies.`,
    `${n} sits between you and reality. Middleware for existence. OS enough.`,
  ]);
}

function marketingLine(name: string, sp: number): string {
  return pick(sp, [
    `${n(name)} is a website with a global edge network and no kernel.`,
    `“Platform” on every slide. Processes: not found.`,
    `${n(name)} boots into a pricing table. That is sales, not init.`,
    `No scheduler, no userspace, no ring 0 — just CDN and hope.`,
    `${n(name)} has more gradients than syscalls.`,
  ]);
}

function n(s: string): string {
  return s.trim() || "This";
}

function realLine(name: string, sp: number): string {
  return pick(sp, [
    `${n(name)} schedules processes, talks to hardware, and owns ring 0.`,
    `Kernel, drivers, userspace — the full stack, not a landing page.`,
    `${n(name)} is what the word “OS” was for before marketing found it.`,
  ]);
}

function genericLine(name: string, sp: number, conf: number): string {
  if (conf >= 55) {
    return pick(sp, [
      `${n(name)} sits between you and the machine. That is the job.`,
      `${n(name)} owns the resources. Apps just visit.`,
    ]);
  }
  return pick(sp, [
    `${n(name)} runs on top of something else. Guests aren't kernels.`,
    `Useful software. Not the layer that boots the world.`,
  ]);
}

export function jokeFor(ctx: ComedyCtx): JokeResult {
  const mode = classify(ctx);
  const sp = spice(ctx.subject.toLowerCase() + "|" + ctx.displayName.toLowerCase());
  const name = ctx.displayName;

  if (mode === "absurd") {
    const confidence = Math.round(78 + sp * 16);
    return {
      answer: "YES",
      confidence,
      line: absurdLine(name, ctx.subject, sp),
    };
  }

  if (mode === "marketing") {
    const confidence = Math.round(12 + sp * 18);
    return {
      answer: "NO",
      confidence,
      line: marketingLine(name, sp),
    };
  }

  if (mode === "real_os") {
    const confidence = Math.round(90 + sp * 6);
    return {
      answer: "YES",
      confidence,
      line: realLine(name, sp),
    };
  }

  const confidence = Math.round(36 + sp * 28);
  return {
    answer: confidence >= 55 ? "KINDA" : "NO",
    confidence,
    line: genericLine(name, sp, confidence),
  };
}

/** Axis scores for optional deep view — still comedy-shaped. */
export function axisScores(mode: ComedyMode): { id: string; label: string; score: number; note: string }[] {
  if (mode === "absurd") {
    return [
      { id: "kernel", label: "Kernel energy", score: 0.9, note: "Something privileged is running." },
      { id: "schedule", label: "Scheduling", score: 0.92, note: "Time gets ordered. Barely." },
      { id: "hardware", label: "Touches reality", score: 0.88, note: "Physical layer: undefeated." },
      { id: "marketing", label: "Marketing fog", score: 0.12, note: "Refreshingly un-SaaS." },
      { id: "syscall", label: "Interface", score: 0.85, note: "use() returns success sometimes." },
      { id: "isolation", label: "Isolation", score: 0.8, note: "Keeps wet off dry." },
      { id: "boot", label: "Boot ritual", score: 0.94, note: "It starts. That's init." },
      { id: "posix", label: "Lineage", score: 0.7, note: "Spiritually UNIX." },
    ];
  }
  if (mode === "marketing") {
    return [
      { id: "kernel", label: "Kernel energy", score: 0.12, note: "Missing." },
      { id: "schedule", label: "Scheduling", score: 0.25, note: "Only demos." },
      { id: "hardware", label: "Touches reality", score: 0.15, note: "Cloud said no." },
      { id: "marketing", label: "Marketing fog", score: 0.9, note: "Maximum density." },
      { id: "syscall", label: "Interface", score: 0.55, note: "HTTP counts, kinda." },
      { id: "isolation", label: "Isolation", score: 0.4, note: "Multi-tenant vibes." },
      { id: "boot", label: "Boot ritual", score: 0.5, note: "Sign up → credit card." },
      { id: "posix", label: "Lineage", score: 0.1, note: "Born in a deck." },
    ];
  }
  if (mode === "real_os") {
    return [
      { id: "kernel", label: "Kernel energy", score: 0.95, note: "Present on purpose." },
      { id: "schedule", label: "Scheduling", score: 0.9, note: "Actual processes." },
      { id: "hardware", label: "Touches reality", score: 0.85, note: "Drivers exist." },
      { id: "marketing", label: "Marketing fog", score: 0.2, note: "Mercifully low." },
      { id: "syscall", label: "Interface", score: 0.9, note: "The real kind." },
      { id: "isolation", label: "Isolation", score: 0.85, note: "Rings and all." },
      { id: "boot", label: "Boot ritual", score: 0.9, note: "You know the one." },
      { id: "posix", label: "Lineage", score: 0.95, note: "Ancestors approve." },
    ];
  }
  return [
    { id: "kernel", label: "Kernel energy", score: 0.4, note: "Unclear." },
    { id: "schedule", label: "Scheduling", score: 0.45, note: "Maybe." },
    { id: "hardware", label: "Touches reality", score: 0.35, note: "Optional." },
    { id: "marketing", label: "Marketing fog", score: 0.5, note: "Some." },
    { id: "syscall", label: "Interface", score: 0.5, note: "Buttons." },
    { id: "isolation", label: "Isolation", score: 0.4, note: "Tabs." },
    { id: "boot", label: "Boot ritual", score: 0.45, note: "Open app." },
    { id: "posix", label: "Lineage", score: 0.3, note: "Distant cousin." },
  ];
}
