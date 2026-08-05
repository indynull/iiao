import { spice } from "./comedy";

export type OsRoadmap = {
  /** Points still missing to "full OS" (100 − confidence) */
  gap: number;
  headline: string;
  steps: string[];
};

/**
 * Funny over-reaching upgrade path when something isn't a perfect OS.
 * Prefers model-authored steps; otherwise invents mode-aware nonsense.
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
  const steps = cleanSteps(opts.steps);
  const finalSteps =
    steps.length >= 2
      ? steps.slice(0, 5)
      : inventSteps(thing, opts.answer, opts.mode, gap);

  return {
    gap,
    headline: headlineFor(thing, opts.answer, conf),
    steps: finalSteps,
  };
}

function cleanSteps(raw?: string[] | null): string[] {
  if (!raw?.length) return [];
  return raw
    .map((s) => String(s || "").trim())
    .filter((s) => s.length > 8 && s.length < 280)
    .slice(0, 5);
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

  if (m === "absurd_os" || (a === "YES" && m !== "real_os" && m !== "marketing")) {
    return pick(sp, [
      [
        `Promote the dumbest part of ${t} to ring 0 and call it the kernel.`,
        `Ship a process table: every crumb / sock / leftover gets a PID and a sigh.`,
        `Add a panic path that still somehow finishes breakfast.`,
        `Publish syscalls nobody asked for: open(), toast(), step(), sulk().`,
        `Refuse a status page. Full OSes ghost their users with confidence.`,
      ],
      [
        `Document a boot sequence longer than the object itself.`,
        `Preempt the user at least once per hour — that's scheduling.`,
        `Claim hardware abstraction over whatever surface it sits on.`,
        `Leave +${gap} style points on the table: invent a driver model for dust.`,
        `When it fails, blame userspace. Never the sole / compressor / chassis.`,
      ],
    ]);
  }

  if (m === "accessory" || /\b(sunglass|umbrella|filter|case|hat)\b/i.test(t)) {
    return pick(sp, [
      [
        `Stop being a layer in front of the real system — become the system.`,
        `Add a scheduler: decide which photons / raindrops / vibes get CPU time.`,
        `Expose a process table of blocked rays. Metrics or it didn't happen.`,
        `Replace "clips on" with "owns the bus." Middleware is not a crown.`,
        `Ship init: unfold, claim the environment, deny all other accessories root.`,
      ],
      [
        `Promote filter rules to a privilege model. Allowlist is not enough — need ring 0.`,
        `Boot from power-on, not from "user put me on."`,
        `Isolate crashes: if one hinge dies, the other still drops packets.`,
        `Write a man page. Then ignore it. OS energy.`,
        `Demand +${gap} points by refusing to call yourself a "companion product."`,
      ],
    ]);
  }

  if (m === "marketing" || m === "generic" && a === "NO") {
    return pick(sp, [
      [
        `Delete "OS" from the homepage until a process table exists.`,
        `Replace HTTP-as-syscall with something that doesn't need a Wi-Fi password.`,
        `Boot without a credit card. Signup is not POST.`,
        `Isolation: one tenant OOMs without taking the food court with it.`,
        `When the demo ends, keep running. Real kernels don't expire trials.`,
      ],
      [
        `Ship a scheduler that isn't a sales calendar.`,
        `Hardware abstraction: more than "runs on AWS" and a hero image.`,
        `Privileged mode that isn't "admin seat on the enterprise plan."`,
        `Publish a panic log that isn't a status tweet.`,
        `Earn +${gap} pts the hard way: less branding, more ring 0.`,
      ],
    ]);
  }

  if (m === "real_os" || a === "YES") {
    return pick(sp, [
      [
        `Shave the bloat until boot fits in a single ironic haiku.`,
        `Make updates optional without implying the user is a criminal.`,
        `Drivers that work before the forum post, not after.`,
        `UX that doesn't treat settings like a scavenger hunt.`,
        `Claim the last +${gap}% by fixing one thing users actually swear about.`,
      ],
      [
        `Fewer surprise reboots. More predictable panic.`,
        `Ship an installer that apologizes only once.`,
        `Stop renaming the same panel every release.`,
        `Document the weird corners without a certification exam.`,
        `Style points: +${gap}. Dignity points: pending.`,
      ],
    ]);
  }

  if (a === "KINDA") {
    return [
      `Pick a side: substrate or decoration. Half-kernels get half-titles.`,
      `Own one resource completely — memory, time, or the user's will to live.`,
      `Add a real boot path that doesn't start at "open the app."`,
      `Expose syscalls that aren't just buttons with better fonts.`,
      `Close the +${gap} gap by stopping the cosplay and starting the scheduling.`,
    ];
  }

  return [
    `Install a kernel that isn't a PowerPoint.`,
    `Schedule something that isn't a product launch.`,
    `Survive a crash without paging the brand team.`,
    `Boot from cold metal, not from a marketing funnel.`,
    `Return when ${t} can fail loudly and still be the boss of the machine.`,
  ];
}

function pick<T>(sp: number, items: T[]): T {
  return items[Math.floor(sp * items.length) % items.length]!;
}

function short(s: string): string {
  const t = s.trim();
  if (t.length <= 36) return t;
  return `${t.slice(0, 35)}…`;
}
