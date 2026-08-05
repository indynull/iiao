import { spice } from "./comedy";

export type OsRoadmap = {
  /** Points still missing to "full OS" (100 − confidence) */
  gap: number;
  headline: string;
  steps: string[];
};

/**
 * Funny over-reaching upgrade path when something isn't a perfect OS.
 * Prefers punchy model steps; falls back (or replaces bland product-speak).
 */
export function buildRoadmap(opts: {
  thing: string;
  answer: string;
  confidence: number;
  mode?: string;
  steps?: string[] | null;
}): OsRoadmap | null {
  const conf = Math.min(100, Math.max(0, Math.round(opts.confidence || 0)));
  if (conf >= 100) return null;

  const gap = 100 - conf;
  const thing = (opts.thing || "It").trim() || "It";
  const fromModel = cleanSteps(opts.steps);
  const invented = inventSteps(thing, opts.answer, opts.mode, gap);

  // Model often writes feature-request sludge; keep only if it has bite
  const finalSteps =
    fromModel.length >= 3 && !isBland(fromModel)
      ? fromModel.slice(0, 5)
      : inventSteps(thing, opts.answer, opts.mode, gap);

  return {
    gap,
    headline: headlineFor(thing, opts.answer, conf),
    steps: finalSteps.length ? finalSteps : invented,
  };
}

function cleanSteps(raw?: string[] | null): string[] {
  if (!raw?.length) return [];
  return raw
    .map((s) => String(s || "").trim().replace(/\.$/, ""))
    .filter((s) => s.length > 12 && s.length < 220)
    .slice(0, 5)
    .map((s) => (s.endsWith("!") || s.endsWith("?") ? s : `${s}.`));
}

/** Product-manager voice without systems jokes → dump it. */
function isBland(steps: string[]): boolean {
  const blob = steps.join(" ").toLowerCase();
  const bland =
    blob.match(
      /\b(implement|integrate|enable|utilize|enhance|leverage|optimize|add support|programmable|dynamic filtering|user experience|seamless|robust|scalable)\b/g,
    )?.length ?? 0;
  const punch =
    blob.match(
      /\b(kernel|ring\s*0|syscall|panic|pid|boot|oom|scheduler|userspace|init|fsck|zombie|preempt|irq|inode|ioctl|segfault|reap|tombstone)\b/g,
    )?.length ?? 0;
  return bland >= 2 || punch < 2;
}

function headlineFor(thing: string, answer: string, conf: number): string {
  const a = String(answer || "").toUpperCase();
  if (a === "YES") {
    return `Certified at ${conf}% — path to full-blown OS`;
  }
  if (a === "KINDA") {
    return `Almost an OS — how ${short(thing)} graduates`;
  }
  return `Not an OS (yet) — how ${short(thing)} reaches ring 0`;
}

function inventSteps(
  thing: string,
  answer: string,
  mode: string | undefined,
  gap: number,
): string[] {
  const sp = spice(thing.toLowerCase());
  const t = short(thing);
  const a = String(answer || "").toUpperCase();
  const m = mode || "generic";
  const noun = thingNoun(thing);

  // Object-specific hooks when we recognize the bit
  const special = specialSteps(thing, gap, sp);
  if (special) return special;

  if (m === "absurd_os" || (a === "YES" && m !== "real_os" && m !== "marketing")) {
    return pick(sp, [
      [
        `Crown the dumbest moving part of ${t} as ring 0. Name it. Fear it.`,
        `Issue PIDs to every ${noun} that can fail. Orphans get reaped at dinner.`,
        `Ship a panic that still completes the job, then blames userspace.`,
        `Publish syscalls: open(), sulk(), pretends_to_work(). Document none.`,
        `Skip the status page. Full OSes leave you reading tea leaves and stack traces.`,
      ],
      [
        `Boot sequence longer than the object. POST plays a sad little jingle.`,
        `Preempt the human once an hour. That's not rude — that's CFS with spite.`,
        `Abstract the surface it sits on as "hardware." Call the dust a driver.`,
        `When it dies, print "not my fault" on the only LED. +${gap} style points.`,
        `Refuse firmware updates. Real kernels ship bugs and call them character.`,
      ],
      [
        `Mount every compartment as a filesystem with weak consistency and strong opinions.`,
        `Watchdog timer that beeps at your life choices, not hardware faults.`,
        `Zombie processes: leftovers, crumbs, unread messages — never reaped.`,
        `ioctl(PLEASE) returns EPERM. ioctl(NOW) schedules you for later.`,
        `Close the +${gap} gap by failing louder than the apps on top of you.`,
      ],
    ]);
  }

  if (m === "accessory" || /\b(sunglass|umbrella|filter|case|hat|glove|mask)\b/i.test(t)) {
    return pick(sp, [
      [
        `Quit the middleware gig. Stop "clipping on." Own the bus or go home.`,
        `Scheduler for photons / rain / vibes: some get CPU, most get ICMP unreachable.`,
        `Process table of blocked rays. If you can't graph drops, you're a fashion choice.`,
        `init = unfold / slide on / click shut. Everything else is userspace cosplay.`,
        `Write a man page titled ${t}(8). The only section is "not an OS (yet)."`,
      ],
      [
        `Promote the filter rules to a privilege model. Allowlist is cosplay; ring 0 is law.`,
        `Boot from power-on, not from "the user remembered me."`,
        `If one hinge dies, the other still drops packets. That's isolation, baby.`,
        `Deny root to neighboring accessories. The scarf does not get CAP_SYS_ADMIN.`,
        `Demand +${gap} pts by never saying "companion product" again under oath.`,
      ],
      [
        `Replace "stylish layer" with "hostile ingress controller."`,
        `IRQ on ambient threat. SoftIRQ on mild inconvenience.`,
        `Userspace is the face. Kernel is whatever actually decides yes/no.`,
        `fsck weekly: wipe smudges, reindex grudges.`,
        `Ship a panic path: fold violently, take the room with you.`,
      ],
    ]);
  }

  if (m === "marketing" || (m === "generic" && a === "NO")) {
    return pick(sp, [
      [
        `Delete "OS" from the hero until a process table exists. LinkedIn is not ring 0.`,
        `Syscalls that aren't HTTP. If it needs a Wi-Fi password, it's a guest.`,
        `Boot without a credit card. Signup is not POST. Trials are not uptime.`,
        `One tenant OOM without collapsing the food court. That's multi-tenant, not vibes.`,
        `When the demo ends, keep running. Kernels don't expire. Sales decks do.`,
      ],
      [
        `Scheduler that isn't a sales calendar with "Q3 platform vision."`,
        `Hardware abstraction: more than "runs on AWS" and a gradient blob.`,
        `Privileged mode that isn't "admin seat on Enterprise."`,
        `Panic log that isn't a status tweet with a soothing illustration.`,
        `Earn +${gap} the hard way: less branding, more things that pre-empt CPU.`,
      ],
      [
        `Replace the roadmap slide with a real one: boot → schedule → panic → recover.`,
        `Kill the "for X" subtitle. OSes don't need a vertical.`,
        `Ship isolation that survives a noisy neighbor, not just a noisy webinar.`,
        `Stop counting API calls as syscalls. The kernel is laughing.`,
        `Come back when ${t} can fail without paging the brand team.`,
      ],
    ]);
  }

  if (m === "real_os" || a === "YES") {
    return pick(sp, [
      [
        `Shave bloat until boot fits in one ironic haiku and one honest panic.`,
        `Updates optional — without treating decline as a moral failure.`,
        `Drivers that work before the forum post, not as penance after.`,
        `Settings that aren't a scavenger hunt with a conspiracy DLC.`,
        `Bank the last +${gap}% by fixing the one thing people swear about in public.`,
      ],
      [
        `Fewer surprise reboots. More predictable, theatrical panics.`,
        `Installer that apologizes once, then gets on with it.`,
        `Stop renaming the same panel every release. Identity matters.`,
        `Document the weird corners without a three-day certification exam.`,
        `Style: +${gap}. Dignity: still in code review.`,
      ],
    ]);
  }

  if (a === "KINDA") {
    return pick(sp, [
      [
        `Pick a side: substrate or decoration. Half-kernels get half-crowns.`,
        `Own one resource completely — memory, time, or the will to live.`,
        `Boot that doesn't start at "open the app and wait for spinner theology."`,
        `Syscalls that aren't buttons with better fonts and worse latency.`,
        `Close +${gap} by scheduling something meaner than a reminder.`,
      ],
      [
        `Stop cosplaying under the hood. Either pre-empt or admit guest status.`,
        `Process table or GTFO. Spreadsheets don't count.`,
        `Isolation: crash one feature, leave the others plotting revenge.`,
        `Publish a panic you can screenshot. Then recover without a blog post.`,
        `${t} at 100% means nobody asks "but is it…?" ever again.`,
      ],
    ]);
  }

  return [
    `Install a kernel that isn't a PowerPoint with confidence.`,
    `Schedule something that isn't a product launch or a calendar hold.`,
    `Survive a crash without paging the brand team or the group chat.`,
    `Boot from cold metal — not from a funnel, trial, or "get started."`,
    `Return when ${t} can fail loudly and still be boss of the machine.`,
  ];
}

/** Extra-specific jokes for common subjects. */
function specialSteps(
  thing: string,
  gap: number,
  sp: number,
): string[] | null {
  const s = thing.toLowerCase();

  if (/\bsunglass|glasses|goggles\b/.test(s)) {
    return pick(sp, [
      [
        `Promote the lenses to ring 0. Your retinas are userspace and they will cope.`,
        `Packet filter for photons: default DROP on glare, ACCEPT on main-character lighting.`,
        `Process table of blocked rays. Export Prometheus metrics named ray_drop_total.`,
        `Boot = unfold arms. Shutdown = lose them in a bag for three months.`,
        `Panic path: sit on them. Recover with tape. Still more honest than most kernels.`,
      ],
      [
        `WAF for sunlight is cute. Kernel for reality is the job. Promote yourself.`,
        `IRQ on sudden cloud cover. SoftIRQ on someone saying "you look mysterious."`,
        `CAP_SYS_ADMIN denied to hats. Neighboring accessories stay unprivileged.`,
        `fsck: microfiber cloth. Journal: every smudge is a commit you regret.`,
        `+${gap} pts when you stop calling yourself "eyewear" and start calling yourself init.`,
      ],
    ]);
  }

  if (/\bumbrella\b/.test(s)) {
    return [
      `Circuit breaker for weather is middleware. Become the weather kernel.`,
      `Open = boot under load. Close = idle. Invert and claim you invented CFS.`,
      `Drop connections from clouds without a change window or a PR review.`,
      `If one spoke fails, isolate the sector. Don't take the whole street with you.`,
      `+${gap}: refuse to be "a thing you forget." OSes are hard to leave at the café.`,
    ];
  }

  if (/\btoaster|oven|microwave|kettle\b/.test(s)) {
    return pick(sp, [
      [
        `Heating loop is already kernel mode — just admit it in the man page.`,
        `Bread gets a PID. Burnt toast is a core dump you can still butter.`,
        `Crumbs are orphaned inodes. Ship fsck as a tray you never empty.`,
        `ioctl(BROWNNESS) — undefined behavior after four minutes. Document as "feature."`,
        `Pop is a hardware interrupt. Miss it and userspace starves. +${gap} for drama.`,
      ],
      [
        `Bagel mode: SCHED_FIFO. Everything else is niceness you'll ignore.`,
        `POST is the little light. Failure is civilization-ending. Keep that energy.`,
        `Userspace: slices. Kernel: coil. Never let marketing rename the coil a "platform."`,
        `OOM killer: ejects the toast. No negotiations. No second chances.`,
        `Status page forbidden. If it's smoking, you already know.`,
      ],
    ]);
  }

  if (/\bfridge|refrigerator\b/.test(s)) {
    return [
      `Compressor stays ring 0. Leftovers are zombies. Label the science experiments.`,
      `Door open = blocking syscall. Alarm = watchdog that hates your life.`,
      `Shelves: mounted filesystems, weak consistency, strong smell-based ACLs.`,
      `Defrost = stop-the-world GC. Condensation = the leak you'll never patch.`,
      `+${gap}: a process table on the door that actually matches reality.`,
    ];
  }

  if (/\bshoe|sneaker|sandal|boot|sock\b/.test(s)) {
    return [
      `Sole = ring 0. Sidewalk = bare metal. Stop apologizing for contact.`,
      `Laces: doubly-linked list. Knots: fsync with optional deadlock.`,
      `syscall step() → ERODE_SOUL. open(/dev/puddle) may block until dry.`,
      `Toes are user processes. The pinky is a zombie that never reaps.`,
      `+${gap}: a changelog. Or proudly ship none — full OS energy.`,
    ];
  }

  if (/\bcat|dog|hamster|bird|fish\b/.test(s)) {
    return [
      `Instinct in kernel mode. You are a guest account with sudo-by-whining.`,
      `Food bowl is the bootloader. Zoomies are IRQs you cannot mask.`,
      `write(/dev/lap, self) returns EBUSY. Correct. Document it.`,
      `Naps outrank meetings. That's priority inversion and it's policy.`,
      `+${gap}: train the userspace daemon (you) to fail less loudly at 3am.`,
    ];
  }

  return null;
}

function thingNoun(thing: string): string {
  const t = thing.toLowerCase();
  if (/\bcrumb|toast/.test(t)) return "crumb";
  if (/\bsock|shoe|toe/.test(t)) return "toe";
  if (/\bleftover|fridge|food/.test(t)) return "leftover";
  if (/\bmail|inbox|message|chat/.test(t)) return "message";
  return "unit of regret";
}

function pick<T>(sp: number, items: T[]): T {
  return items[Math.floor(sp * items.length) % items.length]!;
}

function short(s: string): string {
  const t = s.trim();
  if (t.length <= 36) return t;
  return `${t.slice(0, 35)}…`;
}
