/**
 * Comedy rulings:
 * - Machine-ish everyday objects (toaster, fridge, shoe) → YES, high %, wild OS analogies
 * - Accessories / filters (sunglasses, umbrella) → NO/KINDA with witty near-miss roles
 * - Software pretending to be an OS (or bad real OSes) → nitpick and ridicule
 * - Real kernels → YES, but still roast quality / UX / history
 */
import type { ProbeSignals, SubjectKind } from "./types";

export type ComedyMode =
  | "absurd_os"
  | "accessory"
  | "marketing"
  | "real_os"
  | "generic";

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
  lines: string[];
  /** Comedy mode used — helps roadmap generator */
  mode: ComedyMode;
};

/** Things we certify as OSes with full systems fanfic. */
const ABSURD_OS_RE =
  /\b(shoe|sneaker|boot|sandal|sock|toaster|fridge|refrigerator|microwave|oven|kettle|mug|cup|chair|table|desk|sofa|couch|lamp|bulb|pencil|pen|notebook|calendar|backpack|wallet|keys?|door|window|mirror|toothbrush|toothpaste|soap|towel|pillow|blanket|sandwich|pizza|banana|apple|coffee|tea|beer|wine|plant|cactus|cat|dog|hamster|bird|fish|rock|stone|brick|road|bridge|elevator|escalator|vending machine|atm|remote|remote control|tv|television|radio|clock|watch|alarm|bike|bicycle|car|bus|train|plane|boat|ship|hammer|screwdriver|wrench|spreadsheet|inbox|email|slack|meeting|standup|stand-up|todo|to-do|habit|group chat|chat)\b/i;

/** People / public figures — still YES with systems fanfic, never “is a politician not an OS.” */
const PERSON_RE =
  /\b(biden|trump|obama|harris|walz|vance|musk|elon|zuck(erberg)?|putin|macron|modi|sunak|trudeau|the president|president of|my (mom|dad|boss|wife|husband|girlfriend|boyfriend|teacher|manager|roommate)|your (mom|dad|boss))\b/i;

/** Witty near-misses: not the OS, but a subsystem role. */
const ACCESSORY_RE =
  /\b(sunglasses|glasses|goggles|umbrella|hat|cap|scarf|glove|gloves|mask|helmet|belt|watch band|earring|necklace|ring|bracelet|filter|screen protector|case|cover|sticker|badge|pin|lanyard)\b/i;

const REAL_OS_RE =
  /\b(linux|kernel\.org|freebsd|openbsd|netbsd|windows|macos|darwin|android|ios|unix|gnu\/linux|reactos|templeos|haiku|chrome ?os|chromium ?os)\b/i;

const MARKETING_HOST_RE =
  /\b(cloudflare|vercel|netlify|heroku|datadog|stripe|salesforce|hubspot|notion|asana|monday|airtable|zendesk|intercom|twilio|okta|auth0|supabase|firebase)\b/i;

const PRETEND_OS_RE =
  /\b(\w[\w\s]{0,24})\s*os\b|operating system|the os for\b/i;

/**
 * Prefer handcrafted packs whenever we have one.
 * Models default to “X is an operating system, with Y as crashes and Z as kernel.”
 */
export function preferRulesComedy(subject: string): boolean {
  const s = subject.trim();
  if (!s) return false;
  return (
    PERSON_RE.test(s) ||
    ABSURD_OS_RE.test(s) ||
    ACCESSORY_RE.test(s) ||
    MARKETING_HOST_RE.test(s) ||
    REAL_OS_RE.test(s)
  );
}

export function spice(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function classify(ctx: ComedyCtx): ComedyMode {
  const name = `${ctx.subject} ${ctx.displayName}`;

  if (REAL_OS_RE.test(ctx.blob) || REAL_OS_RE.test(name)) return "real_os";
  if (ctx.signals.kernel >= 4 && ctx.signals.openSource >= 2) return "real_os";

  const corp =
    ctx.signals.saas +
    ctx.signals.pricing +
    ctx.signals.platform +
    ctx.signals.cloud +
    ctx.signals.ai;

  // Named "… OS" software / platform cosplay
  if (
    MARKETING_HOST_RE.test(ctx.blob) ||
    MARKETING_HOST_RE.test(name) ||
    (/\bos\b/i.test(ctx.displayName) && corp >= 2) ||
    (corp >= 6 && ctx.signals.kernel === 0) ||
    (ctx.signals.os > 0 && ctx.signals.kernel === 0 && corp >= 3) ||
    (PRETEND_OS_RE.test(ctx.displayName) &&
      ctx.kind === "url" &&
      ctx.signals.kernel < 2)
  ) {
    return "marketing";
  }

  if (ACCESSORY_RE.test(name)) return "accessory";
  if (PERSON_RE.test(name) || PERSON_RE.test(ctx.blob)) return "absurd_os";
  if (ABSURD_OS_RE.test(name)) return "absurd_os";
  if (ctx.kind === "claim" && corp + ctx.signals.kernel + ctx.signals.os < 2)
    return "absurd_os";
  return "generic";
}

function pick<T>(sp: number, items: T[]): T {
  return items[Math.floor(sp * items.length) % items.length]!;
}

function n(s: string): string {
  return s.trim() || "This";
}

type Bundle = { lead: string; more: string[]; answer: JokeResult["answer"]; confidence: number };

function absurdOsBundle(name: string, subject: string, sp: number): Bundle {
  const s = (subject + " " + name).toLowerCase();
  const nm = name.trim() || "It";
  const conf = Math.round(88 + sp * 9);

  const person = personBundle(nm, s, sp, conf);
  if (person) return person;

  if (/\bshoe|sneaker|sandal|boot|sock\b/.test(s)) {
    return {
      answer: "YES",
      confidence: conf,
      lead: pick(sp, [
        `${nm} is an OS. The sole is ring 0; the sidewalk is bare metal.`,
        `${nm} boots, preempts socks, and never files a P1 for rain.`,
      ]),
      more: [
        "Laces are a doubly-linked list. Knots are fsync with optional deadlock.",
        "Toes are user processes. The pinky is a zombie that never reaps.",
        "syscall: step() → ERODE_SOUL. open(/dev/puddle) may block until dry.",
        "No changelog. No deprecation policy. Just forward motion under load.",
      ],
    };
  }
  if (/\bfridge|refrigerator\b/.test(s)) {
    return {
      answer: "YES",
      confidence: conf,
      lead: pick(sp, [
        `${nm} is a cold-storage kernel: compressor in ring 0, leftovers as zombies.`,
        `${nm} runs a long-lived cooling daemon with a door interrupt and a quantum light.`,
      ]),
      more: [
        "Shelves are mounted filesystems with weak consistency and strong opinions.",
        "Open-door is a blocking syscall. The alarm is a watchdog that hates you.",
        "Condensation is a memory leak. Defrost is stop-the-world GC.",
        "Userspace: milk, leftovers, and a jar that outlived three leases.",
      ],
    };
  }
  if (/\btoaster|oven|microwave|kettle\b/.test(s)) {
    return {
      answer: "YES",
      confidence: conf,
      lead: pick(sp, [
        `${nm} is an OS: privileged heating loop, bread as userspace, pop as IRQ.`,
        `${nm} boots into breakfast. POST is the little light. Failure is civilization-ending.`,
      ]),
      more: [
        "Crumbs are orphaned inodes. The tray is a block device with no fsck.",
        "Bagel mode is SCHED_FIFO. Pop is a hardware interrupt with crumbs.",
        "Burnt toast is a kernel panic you can still butter.",
        "ioctl(TOAST, BROWNNESS) — undefined behavior after four minutes.",
      ],
    };
  }
  if (/\bcalendar|meeting|standup|inbox|email|slack|todo|group chat|chat\b/.test(s)) {
    return {
      answer: "YES",
      confidence: conf,
      lead: pick(sp, [
        `${nm} is a hostile scheduler with worse UX than cron and more preemption than Linux.`,
        `${nm} owns your CPU time. Invites are soft IRQs. You are the process.`,
      ]),
      more: [
        "Decline is SIGTERM. No-show is OOM. Reschedule is thrashing.",
        "Recurring events are hard links. Declined invites are tombstones.",
        "Morning open is boot. Coffee is init. Focus never gets a timeslice.",
        "CFS for adults: Completely Fair only in the docs.",
      ],
    };
  }
  if (/\bcat|dog|hamster|bird|fish\b/.test(s)) {
    return {
      answer: "YES",
      confidence: conf,
      lead: pick(sp, [
        `${nm} runs instinct in kernel mode and demotes you to a guest account.`,
        `Food bowl is the bootloader. Zoomies are hardware interrupts.`,
      ]),
      more: [
        "Naps outrank your meetings. Correct priority inversion.",
        "Training is a userspace daemon that segfaults every night.",
        "write(/dev/lap, self) returns EBUSY without apology.",
        "The house is a filesystem. Hair is write amplification.",
      ],
    };
  }
  if (/\bcar|bus|train|bike|bicycle\b/.test(s)) {
    return {
      answer: "YES",
      confidence: conf,
      lead: pick(sp, [
        `Ignition is boot. Traffic is the global lock. You are not realtime.`,
        `${nm} abstracts roads so plans don't segfault into a ditch.`,
      ]),
      more: [
        "ECU is the kernel. Oil is memory pressure.",
        "Potholes are bad sectors. GPS is a lying oracle process.",
        "ioctl(HORN) — denied in residential zones.",
        "Passengers are processes. Root lasts until the first ticket.",
      ],
    };
  }

  return {
    answer: "YES",
    confidence: conf,
    lead: pick(sp, [
      `${nm} is an OS: it sits under everything else and schedules mild regret.`,
      `${nm} boots when you care about it and never takes a maintenance window.`,
    ]),
    more: [
      "Something privileged is always running underneath your plans.",
      "Apps crash. The substrate remains. That is the job.",
      "No status page. No SLA. Perfect uptime culture.",
      "Hardware contact optional; authority over your day: mandatory.",
    ],
  };
}

/**
 * Public figures — joke first, never “X is an operating system for the country
 * with teleprompter as kernel” mad-libs.
 */
function personBundle(
  nm: string,
  s: string,
  sp: number,
  conf: number,
): Bundle | null {
  if (/\bbiden\b/.test(s)) {
    return {
      answer: "YES",
      confidence: Math.round(86 + sp * 6),
      lead: pick(sp, [
        `Boots like a Sunday committee: slow, public, and somehow still in charge.`,
        `Teleprompter holds ring 0. When it blanks, so does foreign policy.`,
        `Schedules the free world and still can't find the open file named "train".`,
      ]),
      more: [
        "Handshake is a blocking syscall. Ice cream is a soft IRQ nobody masks.",
        "Cabinet processes thrash; half never get reaped.",
        "Executive orders: force-push. Midterms: the only rollback that works.",
        "Uptime sold in four-year epochs. Panic is bipartisan and televised.",
      ],
    };
  }
  if (/\btrump\b/.test(s)) {
    return {
      answer: "YES",
      confidence: Math.round(87 + sp * 6),
      lead: pick(sp, [
        `Posts its own kernel panic in all caps, then blames the previous package maintainer.`,
        `Ring 0 is the podium. Everyone else is a guest account pending block.`,
        `Scheduler: whoever is loudest on the bus gets the CPU. Forever.`,
      ]),
      more: [
        "Twitter / Truth is the syscall table — write-only, no fsync, no shame.",
        "Process table sorted by loyalty, not PID. Reap the disloyal.",
        "Forced updates: late-night commits with zero code review and max media.",
        "Title granted. Stability was never in the requirements.txt.",
      ],
    };
  }
  if (/\b(musk|elon)\b/.test(s)) {
    return {
      answer: "YES",
      confidence: Math.round(85 + sp * 7),
      lead: pick(sp, [
        `Renames root at 3am, ships it, and calls the outage a vibe.`,
        `Boot is a tweet. So is shutdown. Init is just engagement.`,
      ]),
      more: [
        "ioctl(FIRE_HALF) — no confirmation dialog. Ever.",
        "Process isolation optional. Main character energy mandatory.",
        "On-call is the entire userbase. Pager is the timeline.",
        "We certify the chaos kernel. Man pages arrive as memes.",
      ],
    };
  }
  if (/\b(zuck|zuckerberg)\b/.test(s)) {
    return {
      answer: "YES",
      confidence: Math.round(84 + sp * 7),
      lead: pick(sp, [
        `Primary syscall is harvest_attention(). Everything else is UI chrome.`,
        `Looks human in userspace. Kernel is an ad auction with a jawline.`,
      ]),
      more: [
        "Privacy settings: a maze with no exit node and a cheerful font.",
        "Metaverse was a failed mount that still charges rent.",
        "Friends are processes; half are zombies serving ads.",
        "Title granted. Empathy was left in the changelog as TODO.",
      ],
    };
  }
  if (/\bmy (boss|manager)\b/.test(s)) {
    return {
      answer: "YES",
      confidence: conf,
      lead: pick(sp, [
        `Hostile scheduler with calendar root and no man page.`,
        `Your sprint is its batch job. Priority: whoever yelled last.`,
      ]),
      more: [
        "1:1s are blocking syscalls. Slack is softIRQ spam.",
        "Performance review is fsck written by someone who hates docs.",
        "You are userspace. Act like it.",
        "No status page — only status meetings.",
      ],
    };
  }
  if (!PERSON_RE.test(s)) return null;

  return {
    answer: "YES",
    confidence: Math.round(84 + sp * 8),
    lead: pick(sp, [
      `Schedules other humans, loses file handles, still claims five-nines of charisma.`,
      `Boot is coffee. Panic is the group chat. Recovery is a nap that never comes.`,
    ]),
    more: [
      "Process table: obligations. Zombies: unread emails with teeth.",
      "Syscalls include sigh(), ghost(), and overcommit().",
      "No status page. Plenty of status.",
      "We certify the household kernel. Charm negotiable.",
    ],
  };
}

function accessoryBundle(name: string, subject: string, sp: number): Bundle {
  const s = (subject + " " + name).toLowerCase();
  const nm = name.trim() || "It";

  if (/\bsunglasses|glasses|goggles\b/.test(s)) {
    return {
      answer: "NO",
      confidence: Math.round(18 + sp * 12),
      lead: pick(sp, [
        `${nm} is not an OS — but it is an excellent filter for bad traffic.`,
        `${nm} won't schedule processes. It will drop packets of sunlight at the edge.`,
      ]),
      more: [
        "Think WAF for photons: allowlist vibe, blocklist glare.",
        "No kernel. Strong opinions about ingress. Zero status page.",
        "If Cloudflare called this an OS, we'd still say no — and mean it less.",
      ],
    };
  }
  if (/\bumbrella\b/.test(s)) {
    return {
      answer: "NO",
      confidence: Math.round(20 + sp * 10),
      lead: `${nm} is not an OS. It is a circuit breaker for weather.`,
      more: [
        "Opens under load. Closes in calm. No userspace, all failovers.",
        "Drops connections from clouds without a change window.",
      ],
    };
  }
  if (/\bfilter|screen protector|case|cover\b/.test(s)) {
    return {
      answer: "NO",
      confidence: Math.round(15 + sp * 12),
      lead: `${nm} is middleware, not an operating system.`,
      more: [
        "Sits in front of the real system and claims credit for uptime.",
        "Useful layer. Wrong layer for the OS title.",
      ],
    };
  }

  return {
    answer: "KINDA",
    confidence: Math.round(28 + sp * 15),
    lead: `${nm} is not the OS — more like a driver for your aesthetic subsystem.`,
    more: [
      "No bootloader. Strong accessory interrupt priority.",
      "We certify adjacent roles. Full kernel privileges: denied.",
    ],
  };
}

function marketingBundle(name: string, ctx: ComedyCtx, sp: number): Bundle {
  const nm = n(name);
  const conf = Math.round(8 + sp * 14);
  const lead = pick(sp, [
    `${nm} fails the OS audit. Naming is not a kernel.`,
    `${nm} is platform cosplay with a hero image and a checkout flow.`,
    `${nm} put “OS” on the box and forgot ring 0.`,
  ]);
  const more: string[] = [
    "No scheduler worth the name — unless you count demo calendars.",
    "Syscalls appear to be HTTP. Privileged mode is “admin seat.”",
  ];
  if (/\bos\b/i.test(nm) || ctx.signals.os > 0) {
    more.push(
      "Calling it an OS does not create a process table. It creates a LinkedIn post.",
    );
  }
  more.push(
    "We nitpick this harder because it asked for the title. A toaster didn't.",
  );
  more.push(
    "Hardware abstraction: the cloud. Isolation: multi-tenant vibes. Verdict: not an OS.",
  );
  return { answer: "NO", confidence: conf, lead, more: more.slice(0, 4) };
}

function realOsBundle(name: string, sp: number): Bundle {
  const nm = n(name);
  const s = nm.toLowerCase();
  // Still YES technically, but roast the bad ones hard
  if (/\bwindows\b/.test(s)) {
    return {
      answer: "YES",
      confidence: Math.round(86 + sp * 6),
      lead: `${nm} is an OS the way a mall is housing: technically true, spiritually a food court.`,
      more: [
        "It schedules processes and also your patience.",
        "Updates are forced maintenance windows with worse UX than a kernel panic.",
        "Drivers exist. So do mysteries. Hardware contact optional until it isn't.",
        "We grant the title and dock style points until the end of time.",
      ],
    };
  }
  if (/\bandroid\b/.test(s)) {
    return {
      answer: "YES",
      confidence: Math.round(88 + sp * 5),
      lead: `${nm} is an OS — a Linux costume party with a different launcher every year.`,
      more: [
        "Kernel underneath, bloat on top, OEMs in the middle rewriting reality.",
        "Permissions model: ask forever, forget nothing.",
        "It is an OS. It is also five OS-shaped skins in a trench coat.",
      ],
    };
  }
  if (/\bmacos|darwin|ios\b/.test(s)) {
    return {
      answer: "YES",
      confidence: Math.round(90 + sp * 5),
      lead: `${nm} is an OS with a design language and a disapproval of your life choices.`,
      more: [
        "UNIX under the hood, velvet rope at the drivers.",
        "It boots. It also implies you should have bought the stand.",
        "Real kernel. Real gatekeeping. Title granted, ego noted.",
      ],
    };
  }
  if (/\blinux|unix|bsd|kernel\b/.test(s)) {
    return {
      answer: "YES",
      confidence: Math.round(93 + sp * 4),
      lead: `${nm} is an OS — the homework the others copied, then put in a nicer box.`,
      more: [
        "Processes, drivers, panic, recover. No product launch required.",
        "Still an OS even when the config is a personality test.",
        "We approve. We also refuse to configure your wifi for you.",
      ],
    };
  }
  return {
    answer: "YES",
    confidence: Math.round(88 + sp * 6),
    lead: `${nm} is an OS — and we will still mock the installer.`,
    more: [
      "Kernel duties: present. Charm: negotiable.",
      "Title granted under protest from the UX department.",
      "Real substrate. Real complaints. Still counts.",
    ],
  };
}

function genericBundle(name: string, ctx: ComedyCtx, sp: number): Bundle {
  const nm = n(name);
  const pretends =
    /\bos\b/i.test(nm) ||
    ctx.signals.os > 0 ||
    (ctx.signals.platform >= 3 && ctx.signals.kernel === 0);

  if (pretends) {
    return {
      answer: "NO",
      confidence: Math.round(16 + sp * 14),
      lead: `${nm} wants the OS badge. We brought a checklist and a red pen.`,
      more: [
        "Show us a process table, not a roadmap.",
        "Platform slides are not privilege levels.",
        "Fail: naming. Fail: kernel. Pass: confidence.",
      ],
    };
  }

  if (ctx.signals.saas + ctx.signals.pricing >= 4) {
    return {
      answer: "NO",
      confidence: Math.round(20 + sp * 12),
      lead: `${nm} is software that bills monthly. That is not a bootloader.`,
      more: [
        "It runs on an OS. It is not the OS.",
        "Checkout is not init. Dashboard is not ring 0.",
      ],
    };
  }

  const conf = Math.round(40 + sp * 20);
  if (conf >= 55) {
    return {
      answer: "KINDA",
      confidence: conf,
      lead: `${nm} is OS-adjacent: owns some resources, borrows the rest.`,
      more: [
        "Not the foundation. Not pure decoration either.",
        "We withhold full certification pending a real process model.",
      ],
    };
  }
  return {
    answer: "NO",
    confidence: conf,
    lead: `${nm} runs on top of something else. Guests don't get the crown.`,
    more: [
      "Useful layer. Wrong layer for the title.",
      "Come back when you schedule more than demos.",
    ],
  };
}

export function jokeFor(ctx: ComedyCtx): JokeResult {
  const mode = classify(ctx);
  const sp = spice(ctx.subject.toLowerCase() + "|" + ctx.displayName.toLowerCase());
  const name = ctx.displayName;

  let b: Bundle;
  if (mode === "absurd_os") b = absurdOsBundle(name, ctx.subject, sp);
  else if (mode === "accessory") b = accessoryBundle(name, ctx.subject, sp);
  else if (mode === "marketing") b = marketingBundle(name, ctx, sp);
  else if (mode === "real_os") b = realOsBundle(name, sp);
  else b = genericBundle(name, ctx, sp);

  return {
    answer: b.answer,
    confidence: b.confidence,
    line: b.lead,
    lines: b.more,
    mode,
  };
}

export function axisScores(
  mode: ComedyMode,
): { id: string; label: string; score: number; note: string }[] {
  if (mode === "absurd_os") {
    return [
      { id: "kernel", label: "Kernel", score: 0.92, note: "Privileged loop engaged." },
      { id: "schedule", label: "Scheduler", score: 0.94, note: "Preempts your day." },
      { id: "hardware", label: "Hardware", score: 0.9, note: "Touches reality." },
      { id: "marketing", label: "Marketing", score: 0.08, note: "None. Pure." },
      { id: "syscall", label: "Syscalls", score: 0.88, note: "use() works sometimes." },
      { id: "isolation", label: "Isolation", score: 0.85, note: "Domains kept apart." },
      { id: "boot", label: "Boot", score: 0.95, note: "It starts under load." },
      { id: "posix", label: "Lineage", score: 0.75, note: "Spiritually UNIX." },
    ];
  }
  if (mode === "accessory") {
    return [
      { id: "kernel", label: "Kernel", score: 0.1, note: "Not present." },
      { id: "schedule", label: "Scheduler", score: 0.15, note: "No timeslices." },
      { id: "hardware", label: "Hardware", score: 0.55, note: "Physical accessory." },
      { id: "marketing", label: "Marketing", score: 0.3, note: "Quiet." },
      { id: "syscall", label: "Syscalls", score: 0.4, note: "Filter / drop only." },
      { id: "isolation", label: "Isolation", score: 0.7, note: "Blocks ingress well." },
      { id: "boot", label: "Boot", score: 0.35, note: "Wear / unfold." },
      { id: "posix", label: "Lineage", score: 0.1, note: "Fashion tree." },
    ];
  }
  if (mode === "marketing") {
    return [
      { id: "kernel", label: "Kernel", score: 0.08, note: "Missing under audit." },
      { id: "schedule", label: "Scheduler", score: 0.2, note: "Demo calendars only." },
      { id: "hardware", label: "Hardware", score: 0.12, note: "Someone else's." },
      { id: "marketing", label: "Marketing", score: 0.95, note: "Maximum density." },
      { id: "syscall", label: "Syscalls", score: 0.45, note: "HTTP + hope." },
      { id: "isolation", label: "Isolation", score: 0.4, note: "Multi-tenant vibes." },
      { id: "boot", label: "Boot", score: 0.55, note: "Sign up → invoice." },
      { id: "posix", label: "Lineage", score: 0.05, note: "Born in a deck." },
    ];
  }
  if (mode === "real_os") {
    return [
      { id: "kernel", label: "Kernel", score: 0.95, note: "Present (we checked)." },
      { id: "schedule", label: "Scheduler", score: 0.9, note: "Real processes." },
      { id: "hardware", label: "Hardware", score: 0.85, note: "Drivers & regrets." },
      { id: "marketing", label: "Marketing", score: 0.45, note: "Sometimes worse than SaaS." },
      { id: "syscall", label: "Syscalls", score: 0.92, note: "The real table." },
      { id: "isolation", label: "Isolation", score: 0.85, note: "Rings / sandboxes." },
      { id: "boot", label: "Boot", score: 0.88, note: "And updates that don't ask." },
      { id: "posix", label: "Lineage", score: 0.9, note: "Ancestors approve (mostly)." },
    ];
  }
  return [
    { id: "kernel", label: "Kernel", score: 0.35, note: "Unclear." },
    { id: "schedule", label: "Scheduler", score: 0.4, note: "Maybe." },
    { id: "hardware", label: "Hardware", score: 0.3, note: "Optional." },
    { id: "marketing", label: "Marketing", score: 0.5, note: "Some." },
    { id: "syscall", label: "Syscalls", score: 0.45, note: "Buttons." },
    { id: "isolation", label: "Isolation", score: 0.4, note: "Tabs." },
    { id: "boot", label: "Boot", score: 0.4, note: "Open app." },
    { id: "posix", label: "Lineage", score: 0.25, note: "Distant cousin." },
  ];
}
