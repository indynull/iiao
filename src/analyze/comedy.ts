/**
 * Straight satire: YES/NO plus a short stack of deadpan systems commentary.
 * Absurd objects → OS. Marketing platforms → not. Real kernels → yes.
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
  /** Lead line under the giant YES/NO */
  line: string;
  /** Extra commentary paragraphs */
  lines: string[];
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

function n(s: string): string {
  return s.trim() || "This";
}

type Bundle = { lead: string; more: string[] };

function absurdBundle(name: string, subject: string, sp: number): Bundle {
  const s = (subject + " " + name).toLowerCase();
  const nm = name.trim() || "It";

  if (/\bshoe|sneaker|sandal|boot|sock\b/.test(s)) {
    return {
      lead: pick(sp, [
        `${nm} boots, preempts socks, and never ships a status page.`,
        `The sole is ring 0. Everything else is drivers for the sidewalk.`,
      ]),
      more: [
        "Laces are a doubly-linked list. Knots are fsync.",
        "Toes are user processes. The pinky is a zombie that never reaps.",
        "syscall: step() → ERODE_SOUL. open(/dev/puddle) may block.",
        "No changelog. No downtime window. Just forward motion.",
      ],
    };
  }
  if (/\btoaster|oven|microwave|kettle|fridge\b/.test(s)) {
    return {
      lead: pick(sp, [
        `${nm} runs a privileged heating loop and panics into breakfast.`,
        `Power-on self-test: the little light. If it fails, civilization ends.`,
      ]),
      more: [
        "Crumbs are orphaned inodes. The tray is a block device.",
        "Bagel mode is a realtime priority class. Pop is a hardware interrupt.",
        "Userspace is bread. Burnt toast is a kernel panic you can eat.",
        "ioctl(TOAST, BROWNNESS) — undefined behavior after four minutes.",
      ],
    };
  }
  if (/\bcalendar|meeting|standup|inbox|email|slack|todo|group chat|chat\b/.test(s)) {
    return {
      lead: pick(sp, [
        `${nm} is a scheduler with worse UX than cron and stronger opinions than systemd.`,
        `${nm} preempts your life with soft IRQs called “invites.”`,
      ]),
      more: [
        "You are the process. Decline is SIGTERM. No-show is OOM killer.",
        "Recurring events are hard links. Declined invites are tombstones.",
        "Morning open is boot. Coffee is init.",
        "Fair-share scheduling, except your focus never gets a turn.",
      ],
    };
  }
  if (/\bcat|dog|hamster|bird|fish\b/.test(s)) {
    return {
      lead: pick(sp, [
        `${nm} runs instinct in kernel mode and treats you like a guest account.`,
        `Food bowl is the bootloader. Zoomies are hardware interrupts.`,
      ]),
      more: [
        "Naps have higher priority than your meetings.",
        "Training is a buggy userspace daemon that restarts every night.",
        "write(/dev/lap, self) may return EBUSY.",
        "The house is a filesystem. Hair is write amplification.",
      ],
    };
  }
  if (/\bcar|bus|train|bike|bicycle\b/.test(s)) {
    return {
      lead: pick(sp, [
        `Ignition is boot. Traffic is the global lock. You are not realtime.`,
        `${nm} abstracts roads so your plans don't segfault into a ditch.`,
      ]),
      more: [
        "ECU is the kernel. Oil is memory pressure.",
        "Potholes are bad sectors. GPS is a lying oracle.",
        "ioctl(HORN) — permission denied in residential zones.",
        "Passengers are processes. The driver is root until the first ticket.",
      ],
    };
  }

  return {
    lead: pick(sp, [
      `${nm} manages resources, time, and mild regret.`,
      `${nm} sits between you and reality. Middleware for existence.`,
    ]),
    more: [
      `${nm} boots when you start caring about it.`,
      "Something privileged is always running underneath.",
      "Apps (your plans) crash. The substrate remains.",
      "No status page. No SLA. Perfect uptime culture.",
    ],
  };
}

function marketingBundle(name: string, ctx: ComedyCtx, sp: number): Bundle {
  const nm = n(name);
  const lead = pick(sp, [
    `${nm} is a website with a global edge network and no kernel.`,
    `${nm} boots into a pricing table. That is sales, not init.`,
    `“Platform” on every slide. Processes: not found.`,
  ]);
  const more: string[] = [
    "No scheduler, no userspace, no ring 0 — CDN, dashboards, and hope.",
    "Gradients outnumber syscalls.",
  ];
  if (ctx.signals.os > 0 && ctx.signals.kernel === 0) {
    more.push(
      `Said “OS” ${ctx.signals.os}× and “kernel” never. Naming is doing the heavy lifting.`,
    );
  }
  if (ctx.signals.pricing + ctx.signals.saas >= 3) {
    more.push("The boot sequence is: hero → logo cloud → checkout.");
  }
  if (ctx.signals.cloud >= 3) {
    more.push("Lots of cloud. Somewhere a CPU files a missing-person report.");
  }
  more.push("A shoe has a clearer process model.");
  return { lead, more: more.slice(0, 4) };
}

function realBundle(name: string, sp: number): Bundle {
  const nm = n(name);
  return {
    lead: pick(sp, [
      `${nm} schedules processes, talks to hardware, and owns ring 0.`,
      `Kernel, drivers, userspace — the full stack.`,
    ]),
    more: [
      "This is what the word meant before product marketing found it.",
      "Drivers exist. Panics exist. The hardware is not optional.",
      "Boring. Correct. Still an OS.",
    ],
  };
}

function genericBundle(name: string, conf: number, sp: number): Bundle {
  const nm = n(name);
  if (conf >= 55) {
    return {
      lead: pick(sp, [
        `${nm} sits between you and the machine.`,
        `${nm} owns resources. Apps just visit.`,
      ]),
      more: [
        "Some isolation, some interface, incomplete ring 0.",
        `${conf}% — more substrate than screensaver, less than a kernel.`,
      ],
    };
  }
  return {
    lead: pick(sp, [
      `${nm} runs on top of something else. Guests aren't kernels.`,
      `Useful software. Not the layer that boots the world.`,
    ]),
    more: [
      "It needs an OS underneath. That is the tell.",
      "Come back when it schedules something that is not a demo call.",
    ],
  };
}

export function jokeFor(ctx: ComedyCtx): JokeResult {
  const mode = classify(ctx);
  const sp = spice(ctx.subject.toLowerCase() + "|" + ctx.displayName.toLowerCase());
  const name = ctx.displayName;

  if (mode === "absurd") {
    const confidence = Math.round(78 + sp * 16);
    const b = absurdBundle(name, ctx.subject, sp);
    return { answer: "YES", confidence, line: b.lead, lines: b.more };
  }

  if (mode === "marketing") {
    const confidence = Math.round(12 + sp * 18);
    const b = marketingBundle(name, ctx, sp);
    return { answer: "NO", confidence, line: b.lead, lines: b.more };
  }

  if (mode === "real_os") {
    const confidence = Math.round(90 + sp * 6);
    const b = realBundle(name, sp);
    return { answer: "YES", confidence, line: b.lead, lines: b.more };
  }

  const confidence = Math.round(36 + sp * 28);
  const b = genericBundle(name, confidence, sp);
  return {
    answer: confidence >= 55 ? "KINDA" : "NO",
    confidence,
    line: b.lead,
    lines: b.more,
  };
}

export function axisScores(
  mode: ComedyMode,
): { id: string; label: string; score: number; note: string }[] {
  if (mode === "absurd") {
    return [
      { id: "kernel", label: "Kernel", score: 0.9, note: "Something privileged is running." },
      { id: "schedule", label: "Scheduler", score: 0.92, note: "Time gets ordered." },
      { id: "hardware", label: "Hardware", score: 0.88, note: "Touches the real world." },
      { id: "marketing", label: "Marketing", score: 0.12, note: "Almost none." },
      { id: "syscall", label: "Syscalls", score: 0.85, note: "use() sometimes works." },
      { id: "isolation", label: "Isolation", score: 0.8, note: "Keeps domains apart." },
      { id: "boot", label: "Boot", score: 0.94, note: "It starts." },
      { id: "posix", label: "Lineage", score: 0.7, note: "Spiritually UNIX." },
    ];
  }
  if (mode === "marketing") {
    return [
      { id: "kernel", label: "Kernel", score: 0.12, note: "Missing." },
      { id: "schedule", label: "Scheduler", score: 0.25, note: "Only demos." },
      { id: "hardware", label: "Hardware", score: 0.15, note: "Cloud said no." },
      { id: "marketing", label: "Marketing", score: 0.9, note: "Maximum density." },
      { id: "syscall", label: "Syscalls", score: 0.55, note: "HTTP, roughly." },
      { id: "isolation", label: "Isolation", score: 0.4, note: "Multi-tenant vibes." },
      { id: "boot", label: "Boot", score: 0.5, note: "Sign up → card." },
      { id: "posix", label: "Lineage", score: 0.1, note: "Born in a deck." },
    ];
  }
  if (mode === "real_os") {
    return [
      { id: "kernel", label: "Kernel", score: 0.95, note: "Present." },
      { id: "schedule", label: "Scheduler", score: 0.9, note: "Real processes." },
      { id: "hardware", label: "Hardware", score: 0.85, note: "Drivers exist." },
      { id: "marketing", label: "Marketing", score: 0.2, note: "Low." },
      { id: "syscall", label: "Syscalls", score: 0.9, note: "The real kind." },
      { id: "isolation", label: "Isolation", score: 0.85, note: "Rings." },
      { id: "boot", label: "Boot", score: 0.9, note: "You know the one." },
      { id: "posix", label: "Lineage", score: 0.95, note: "Ancestors approve." },
    ];
  }
  return [
    { id: "kernel", label: "Kernel", score: 0.4, note: "Unclear." },
    { id: "schedule", label: "Scheduler", score: 0.45, note: "Maybe." },
    { id: "hardware", label: "Hardware", score: 0.35, note: "Optional." },
    { id: "marketing", label: "Marketing", score: 0.5, note: "Some." },
    { id: "syscall", label: "Syscalls", score: 0.5, note: "Buttons." },
    { id: "isolation", label: "Isolation", score: 0.4, note: "Tabs." },
    { id: "boot", label: "Boot", score: 0.45, note: "Open app." },
    { id: "posix", label: "Lineage", score: 0.3, note: "Distant cousin." },
  ];
}
