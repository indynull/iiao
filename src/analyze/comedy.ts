/**
 * Comedy model: far-fetched things ARE operating systems.
 * Marketing “platforms” and “Cloudflare OS” energy are not.
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

/** Physical / mundane / claim-shaped nonsense that deserves a noble OS reading. */
const ABSURD_RE =
  /\b(shoe|sneaker|boot|sandal|sock|toaster|fridge|refrigerator|microwave|oven|kettle|mug|cup|chair|table|desk|sofa|couch|lamp|bulb|pencil|pen|notebook|calendar|umbrella|backpack|wallet|keys?|door|window|mirror|toothbrush|toothpaste|soap|towel|pillow|blanket|sandwich|pizza|banana|apple|coffee|tea|beer|wine|plant|cactus|cat|dog|hamster|bird|fish|rock|stone|brick|road|bridge|elevator|escalator|traffic light|parking meter|vending machine|atm|remote|remote control|tv|television|radio|clock|watch|alarm|bike|bicycle|car|bus|train|plane|boat|ship|hammer|screwdriver|wrench|nail|screw|tape|glue|sticker|meme|spreadsheet|inbox|email|slack|meeting|standup|stand-up|status page|todo|to-do|habit tracker)\b/i;

const REAL_OS_RE =
  /\b(linux|kernel\.org|freebsd|openbsd|netbsd|windows nt|macos|darwin|xnu|android|ios(?!\s*developer)|unix|gnu\/linux|reactos|haiku os|templeos)\b/i;

const MARKETING_HOST_RE =
  /\b(cloudflare|vercel|netlify|heroku|datadog|stripe|salesforce|hubspot|notion\.so|slack\.com|asana|monday\.com|airtable|zendesk|intercom|twilio|okta|auth0|supabase|firebase)\b/i;

export function classify(ctx: ComedyCtx): ComedyMode {
  if (REAL_OS_RE.test(ctx.blob) || REAL_OS_RE.test(ctx.subject)) return "real_os";
  if (ctx.signals.kernel >= 4 && ctx.signals.openSource >= 2) return "real_os";

  const corp =
    ctx.signals.saas +
    ctx.signals.pricing +
    ctx.signals.platform +
    ctx.signals.cloud +
    ctx.signals.ai;
  const saidOsNoKernel = ctx.signals.os > 0 && ctx.signals.kernel === 0;
  if (
    MARKETING_HOST_RE.test(ctx.blob) ||
    (corp >= 6 && ctx.signals.kernel === 0) ||
    (saidOsNoKernel && corp >= 3)
  ) {
    return "marketing";
  }

  if (ABSURD_RE.test(ctx.subject) || ABSURD_RE.test(ctx.displayName)) return "absurd";
  // Free-form claim with almost no tech lexicon
  if (ctx.kind === "claim" && corp + ctx.signals.kernel + ctx.signals.os < 2) {
    return "absurd";
  }
  // Failed probe on a non-corp looking host → treat claim-like
  if (!ctx.probeOk && ctx.kind === "url" && corp < 2 && ctx.signals.kernel === 0) {
    if (!/\.(io|dev|app|cloud|tech)\b/i.test(ctx.host ?? "")) return "absurd";
  }

  return "generic";
}

/** Hash-stable 0..1 for deterministic spice. */
export function spice(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function confidenceFor(mode: ComedyMode, ctx: ComedyCtx): {
  confidence: number;
  steps: { label: string; delta: number; total: number }[];
} {
  const sp = spice(ctx.subject.toLowerCase());
  const steps: { label: string; delta: number; total: number }[] = [];
  let total = 0;

  const set = (label: string, v: number) => {
    const delta = v - total;
    total = v;
    steps.push({ label, delta, total });
  };

  if (mode === "absurd") {
    // High: shoes, toasters, calendars are obviously OSes
    set("far-fetched systems reading", 72 + sp * 18);
    if (ABSURD_RE.test(ctx.subject)) set("mundane object bonus", total + 6);
    if (ctx.kind === "claim") set("no website = pure OS energy", total + 4);
  } else if (mode === "marketing") {
    // Low: SaaS that said platform/OS
    set("corporate landing page baseline", 18 + sp * 10);
    if (ctx.signals.os > 0 && ctx.signals.kernel === 0)
      set("said OS without a kernel (−)", total - 6);
    if (ctx.signals.pricing + ctx.signals.saas >= 4)
      set("pricing-page tax (−)", total - 5);
    if (MARKETING_HOST_RE.test(ctx.blob)) set("known platform cosplayer (−)", total - 4);
  } else if (mode === "real_os") {
    set("unfortunately this one is real", 88 + sp * 6);
  } else {
    // generic web thing
    set("generic software object", 38 + sp * 16);
    if (ctx.signals.kernel > 0) set("tripped over a kernel word", total + 12);
    if (ctx.signals.saas > 3) set("SaaS drag (−)", total - 10);
  }

  const confidence = Math.round(Math.min(97, Math.max(5, total)));
  if (Math.abs(confidence - total) > 0.01) {
    steps.push({
      label: "rounded for the courts",
      delta: confidence - total,
      total: confidence,
    });
  }
  return { confidence, steps };
}

export type Analogy = { boot: string; kernel: string; scheduler: string; fs: string; userspace: string; syscall: string };

export function analogiesFor(ctx: ComedyCtx): Analogy {
  const n = ctx.displayName.replace(/\s+/g, " ").trim() || "it";
  const sub = ctx.subject.toLowerCase();
  const sp = spice(sub);

  if (/\bshoe|sneaker|sandal|boot|sock\b/i.test(sub + n)) {
    return {
      boot: "Boot sequence = putting it on. POST beeps are your knees.",
      kernel: "The sole is ring‑0: everything else is drivers for sidewalk I/O.",
      scheduler: "It pre-empts socks and schedules steps with hard real-time guarantees.",
      fs: "Laces are a doubly-linked list. Knots are fsync.",
      userspace: "Toes are user processes. The pinky is a zombie process.",
      syscall: "syscall: step() → ERODE_SOUL; open(/dev/puddle) may block.",
    };
  }
  if (/\btoaster|oven|microwave|kettle|fridge|microwave\b/i.test(sub + n)) {
    return {
      boot: "Power-on self-test: the little light. If it fails, you starve.",
      kernel: "Heating element is the kernel — privileged, hot, poorly documented.",
      scheduler: "Pop is a hardware interrupt. Bagel mode is a realtime priority class.",
      fs: "Slots are mount points. Crumbs are orphaned inodes.",
      userspace: "Bread is userspace. Burnt toast is a kernel panic you can eat.",
      syscall: "ioctl(TOAST, BROWNNESS) — undefined behavior after 4 minutes.",
    };
  }
  if (/\bcalendar|meeting|standup|inbox|email|slack|todo\b/i.test(sub + n)) {
    return {
      boot: "Morning open is boot. Coffee is init.",
      kernel: "The calendar kernel enforces preemption via guilt.",
      scheduler: "It is literally a scheduler. CFS for adults.",
      fs: "Recurring events are hard links. Declined invites are tombstones.",
      userspace: "You are the process. Cancel culture is OOM killer.",
      syscall: "sched_yield() is “sorry, can we push this?”",
    };
  }
  if (/\bcat|dog|hamster|bird|fish\b/i.test(sub + n)) {
    return {
      boot: "Wake-up is boot. Food bowl is the bootloader.",
      kernel: "Instinct is ring‑0. Training is a buggy userspace daemon.",
      scheduler: "Nap priorities dominate. Zoomies are soft IRQs.",
      fs: "The house is a filesystem. Hair is write amplification.",
      userspace: "You think you're root. You're a guest account with treat privileges.",
      syscall: "write(/dev/lap, self) — may return EBUSY.",
    };
  }
  if (/\bcar|bus|train|bike|bicycle\b/i.test(sub + n)) {
    return {
      boot: "Ignition is boot. Check-engine is dmesg.",
      kernel: "ECU/engine is the kernel. Oil is memory pressure.",
      scheduler: "Traffic lights are the global scheduler. You are not realtime.",
      fs: "Roads are block devices. Potholes are bad sectors.",
      userspace: "Passengers are processes. The GPS is a lying oracle.",
      syscall: "ioctl(HORN) — denied in HOAs.",
    };
  }

  // Generic far-fetched template, rotated by spice
  const templates: Analogy[] = [
    {
      boot: `${n} boots whenever you start caring about it. That's init.`,
      kernel: `At the core of ${n} is a privileged loop that never yields — classic kernel.`,
      scheduler: `${n} schedules attention, time, and mild regret with fair-share vibes.`,
      fs: `State lives in ${n} the way files live on disk: poorly organized, emotionally permanent.`,
      userspace: `Everything you do with ${n} is userspace. Root is whoever paid.`,
      syscall: `The only syscall is use(${n}) → sometimes EAGAIN.`,
    },
    {
      boot: `Power-on for ${n} is the moment it enters the chat.`,
      kernel: `${n} abstracts hardware (reality) so apps (your plans) don't segfault.`,
      scheduler: `It preempts other hobbies. Nice value: -20.`,
      fs: `Memories of ${n} are a write-ahead log you never compact.`,
      userspace: `Plugins for ${n} include “hope” and “copium.”`,
      syscall: `mmap(life) with ${n} as the backing store.`,
    },
    {
      boot: `${n} has a bootloader: the story you tell about why you need it.`,
      kernel: `Isolation: ${n} keeps wet things away from dry things. Security through topology.`,
      scheduler: `Interrupts arrive as notifications, emails, or physical pain.`,
      fs: `Permissions on ${n}: rwx for you, --- for everyone you live with.`,
      userspace: `GUI is optional. CLI is “just look at it.”`,
      syscall: `poll() on ${n} returns POLLIN when drama is ready.`,
    },
  ];
  return templates[Math.floor(sp * templates.length)]!;
}

export function absurdAxisNotes(a: Analogy): Record<string, string> {
  return {
    kernel: a.kernel,
    schedule: a.scheduler,
    hardware: a.boot,
    marketing: "No pricing page. Pure. Uncorrupted. OS energy.",
    syscall: a.syscall,
    isolation: a.userspace,
    boot: a.boot,
    posix: a.fs,
  };
}

export function marketingRoast(ctx: ComedyCtx, confidence: number): string[] {
  const name = ctx.displayName;
  const lines: string[] = [
    `${name} is trying so hard to be infrastructure that it forgot to be an operating system.`,
  ];
  if (ctx.signals.os > 0 && ctx.signals.kernel === 0) {
    lines.push(
      `They said “OS” ${ctx.signals.os}× and “kernel” never. That's not a stack. That's a brand deck with impostor syndrome.`,
    );
  }
  lines.push(
    `A shoe has a better process model than this. The shoe boots. This one redirects to /pricing.`,
  );
  if (ctx.signals.cloud + ctx.signals.platform >= 3) {
    lines.push(
      `“Platform,” “edge,” “cloud” — lots of prepositions, zero ring‑0. ${confidence}% OS, mostly for legal reasons.`,
    );
  }
  lines.push(
    `Final reading: not an OS. A website that cosplays sysadmin on LinkedIn.`,
  );
  return lines.slice(0, 5);
}

export function absurdRoast(ctx: ComedyCtx, a: Analogy, confidence: number): string[] {
  const name = ctx.displayName;
  return [
    `Yes. ${name} is an operating system. Court is adjourned.`,
    a.boot,
    a.kernel,
    a.scheduler,
    `${a.fs} ${a.userspace}`,
    `We rate it ${confidence}% OS — higher than most things that put “OS” in the product name.`,
  ].slice(0, 5);
}

export function realOsRoast(ctx: ComedyCtx, confidence: number): string[] {
  const name = ctx.displayName;
  return [
    `${name} is, tragically, an actual operating system. The bit is ruined.`,
    `No far-fetched analogy required. It has a kernel on purpose. Boring. Correct. ${confidence}%.`,
    `Compare to a shoe: the shoe is funnier. This one just… works (sometimes).`,
  ];
}

export function genericRoast(ctx: ComedyCtx, confidence: number): string[] {
  const name = ctx.displayName;
  const a = analogiesFor(ctx);
  if (confidence >= 55) {
    return [
      `${name} can be an OS if we allow poetry into systems design. We do.`,
      a.kernel,
      a.scheduler,
      `${confidence}% — not Cloudflare-OS levels of fraud, not kernel.org levels of homework.`,
    ];
  }
  return [
    `${name} is mostly software cosplay.`,
    a.boot,
    `At ${confidence}% it's more “app” than “OS,” unless you count vibes as syscalls.`,
  ];
}
