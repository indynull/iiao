import { spice } from "./comedy";
import { boardVoice } from "./voice";

export type GapBand = "hairline" | "style" | "serious" | "chasm";

export type OsRoadmap = {
  gap: number;
  band: GapBand;
  /** UI section title — footnotes vs homework */
  label: string;
  headline: string;
  steps: string[];
};

/**
 * Remediation that mocks the subject — scaled by how far from 100%.
 * High YES (tiny gap) = footnotes. Low NO (huge gap) = homework.
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
  const band = gapBand(gap);
  const thing = boardVoice((opts.thing || "It").trim() || "It");
  const answer = String(opts.answer || "").toUpperCase();
  void opts.steps;

  return {
    gap,
    band,
    label: sectionLabel(answer, band),
    headline: headlineFor(thing, answer, conf, gap, band),
    steps: inventSteps(thing, answer, opts.mode, gap, band),
  };
}

function gapBand(gap: number): GapBand {
  if (gap <= 8) return "hairline";
  if (gap <= 18) return "style";
  if (gap <= 40) return "serious";
  return "chasm";
}

function sectionLabel(answer: string, band: GapBand): string {
  if (answer === "YES" && (band === "hairline" || band === "style")) {
    return band === "hairline" ? "Footnotes on a YES" : "Style points still owed";
  }
  if (answer === "KINDA") return "How KINDA becomes YES";
  if (answer === "NO" && band === "chasm") return "Board homework";
  if (answer === "NO") return "Board remediation";
  return "Board remediation";
}

function headlineFor(
  thing: string,
  answer: string,
  conf: number,
  gap: number,
  band: GapBand,
): string {
  const t = short(thing);
  const sp = spice(thing.toLowerCase() + "|" + answer + "|" + band);

  if (answer === "YES") {
    if (band === "hairline") {
      return pick(sp, [
        `${conf}% — basically done. +${gap} is pure footnote for ${t}`,
        `Certified. The missing ${gap}% is theater, not substance`,
        `${t} already has the title. These are margin notes`,
      ]);
    }
    if (band === "style") {
      return pick(sp, [
        `${conf}% YES. +${gap} style points still on the table for ${t}`,
        `Crown fits. The tailor still wants +${gap} on ${t}`,
        `Board said YES. Also said polish ${t} a little`,
      ]);
    }
    return pick(sp, [
      `${conf}% — YES with conditions. Close +${gap} for ${t}`,
      `Title granted under protest. ${t} owes +${gap}`,
    ]);
  }

  if (answer === "KINDA") {
    return pick(sp, [
      `${t} is cosplaying at ${conf}%. +${gap} to graduate`,
      `Half-title. Full title costs +${gap}`,
      `KINDA is not a vibe. Bank +${gap} or drop the act`,
    ]);
  }

  // NO
  if (band === "chasm") {
    return pick(sp, [
      `NO at ${conf}%. ${t} is not close — homework follows`,
      `Rejected hard. +${gap} is a mountain, not a polish pass`,
      `Audit failed for ${t}. Bring a real kernel or stop applying`,
    ]);
  }
  return pick(sp, [
    `NO at ${conf}%. Path for ${t} to stop wasting the board's time`,
    `Not an OS (yet). +${gap} if ${t} ever earns the bit`,
  ]);
}

function inventSteps(
  thing: string,
  answer: string,
  mode: string | undefined,
  gap: number,
  band: GapBand,
): string[] {
  const sp = spice(thing.toLowerCase() + "|" + band);
  const t = short(thing);
  const a = String(answer || "").toUpperCase();
  const m = mode || "generic";

  const special = specialSteps(thing, gap, sp, a, band);
  if (special) return special;

  if (a === "NO") return noSteps(t, gap, sp, band);
  if (a === "KINDA") return kindaSteps(t, gap, sp, band);

  if (m === "real_os") return realOsYesSteps(t, gap, sp, band);
  if (m === "absurd_os" || a === "YES") return absurdYesSteps(t, gap, sp, band);

  if (m === "accessory" || /\b(sunglass|umbrella|filter|case|hat|glove|mask)\b/i.test(t)) {
    return noSteps(t, gap, sp, band); // accessories are NO/KINDA territory
  }

  if (m === "marketing") return noSteps(t, gap, sp, band);

  return noSteps(t, gap, sp, band);
}

function absurdYesSteps(
  t: string,
  gap: number,
  sp: number,
  band: GapBand,
): string[] {
  if (band === "hairline") {
    return pick(sp, [
      [
        `${t} is already YES. +${gap} is a rounding error with swagger.`,
        `Optional: one slightly meaner panic. Not required. We're nitpicking.`,
        `Man page may remain empty. Full OSes ghost docs at this confidence.`,
        `If you insist on 100%, refuse one firmware "journey" update. Done.`,
        `Otherwise: keep the title. The board has left the building.`,
      ],
      [
        `Footnote only: blame userspace one more time, on purpose.`,
        `The missing ${gap}% is not a kernel. It's a smirk.`,
        `${t} already schedules reality. We're grading handwriting now.`,
        `Ship zero changelog. At ${100 - gap}% that is a feature.`,
        `Stop reading this. Go break something that isn't certified.`,
      ],
    ]);
  }
  if (band === "style") {
    return pick(sp, [
      [
        `Crown fits. +${gap} is style debt on ${t} — not a rebuild.`,
        `Make the panic a little more theatrical. Substance is already there.`,
        `Process table could name every crumb / grudge / leftover. Vanity metric.`,
        `Contempt for userspace: dial it up one notch. That's the polish.`,
        `Bank +${gap} by never apologizing in the man page.`,
      ],
      [
        `${t}: YES with footnotes. Close +${gap} without reinventing boot.`,
        `Scheduler already works. Make priority meaner, not "correcter."`,
        `One undocumented syscall nobody wants — signature move.`,
        `Status page still banned. Silence is peak confidence.`,
        `+${gap} pts = mock harder, not implement more.`,
      ],
    ]);
  }
  // serious / chasm YES (rare for absurd packs — still milder than NO)
  return pick(sp, [
    [
      `${t} is YES but the board is frowning. +${gap} needs real work.`,
      `Own the crashes — no props department, no PR spin.`,
      `Boot and panic should match the object's actual violence.`,
      `Process table: every unit of regret gets a PID.`,
      `Close +${gap} by failing honestly, not quietly.`,
    ],
  ]);
}

function realOsYesSteps(
  t: string,
  gap: number,
  sp: number,
  band: GapBand,
): string[] {
  if (band === "hairline" || band === "style") {
    return pick(sp, [
      [
        `Yes, ${t} is an OS. +${gap} is UX penance, not ontology.`,
        `Fewer surprise reboots. More predictable, theatrical panics.`,
        `Drivers that work before the forum post — that's the missing slice.`,
        `Stop renaming the same panel. Identity is free style points.`,
        `Dignity still in code review. Title already granted.`,
      ],
    ]);
  }
  return pick(sp, [
    [
      `Technically an OS. Spiritually a mall food court. +${gap} is real.`,
      `Installer war crimes dock points until fixed.`,
      `Updates that treat decline as crime: still on the bill.`,
      `Bloat is not a personality. Shave it.`,
      `Title stands. Charm remains negotiable.`,
    ],
  ]);
}

function kindaSteps(
  t: string,
  gap: number,
  sp: number,
  band: GapBand,
): string[] {
  if (band === "hairline" || band === "style") {
    return pick(sp, [
      [
        `Almost. +${gap} is one decisive privilege grab for ${t}.`,
        `Pick substrate or decoration — half-kernels get half-crowns.`,
        `Own one resource completely: time, memory, or the will to live.`,
        `Boot that doesn't start at "open the app."`,
        `Then we stop saying KINDA in public.`,
      ],
    ]);
  }
  return pick(sp, [
    [
      `${t} is cosplaying. +${gap} is a promotion, not a sticker.`,
      `Process table or GTFO. Dashboards do not count.`,
      `Isolation that survives a bad afternoon — not vibes.`,
      `Syscalls that aren't buttons with better fonts.`,
      `Close +${gap} or drop the act.`,
    ],
  ]);
}

function noSteps(
  t: string,
  gap: number,
  sp: number,
  band: GapBand,
): string[] {
  if (band === "chasm") {
    return pick(sp, [
      [
        `Delete the delusion. ${t} schedules vibes, not processes.`,
        `Kernel: missing. Process table: a moodboard. Title: denied.`,
        `Boot story was a story. Init systems have standards.`,
        `+${gap} is not polish — it's a different species of software.`,
        `Grow ring 0 or enjoy the mockery. No third option.`,
      ],
      [
        `You applied for kernel. Résumé said “${t}.” Rejected.`,
        `Syscalls appear to be HTTP / speeches / vibes. Not enough.`,
        `We brought a checklist. Everything failed except confidence.`,
        `Stay a guest on someone else's substrate.`,
        `Come back when ${t} can panic without a press conference.`,
      ],
    ]);
  }
  if (band === "serious") {
    return pick(sp, [
      [
        `NO, but not hopeless. +${gap} is a real project for ${t}.`,
        `Show a process table that isn't a roadmap slide.`,
        `Privileged mode that isn't a plan tier or a clip-on.`,
        `Boot without a credit card, funnel, or fashion budget.`,
        `Then reapply. Bring fewer adjectives.`,
      ],
    ]);
  }
  // style/hairline NO — rare (high conf NO)
  return pick(sp, [
    [
      `Still NO at high confidence. ${t} is good at the wrong job.`,
      `+${gap} won't flip ontology — it might flip dignity.`,
      `Stop calling yourself essential. Near-miss is the ceiling.`,
      `Middleware with confidence is still middleware.`,
      `Collect your sticker. The crown stays closed.`,
    ],
  ]);
}

function specialSteps(
  thing: string,
  gap: number,
  sp: number,
  answer: string,
  band: GapBand,
): string[] | null {
  const s = thing.toLowerCase();
  const t = short(thing);

  if (/\b(cart|wagon|buggy|carriage|donkey|mule)\b/.test(s)) {
    if (answer === "YES" && (band === "hairline" || band === "style")) {
      return pick(sp, [
        [
          `Already YES. +${gap} is mud on the fenders — not a new axle.`,
          `Donkey remains an unfair scheduler. Good. Document the spite.`,
          `Optional: brakes that aren't pure hope. Vanity metric.`,
          `Braying is dmesg. Loud is on-brand. Keep it.`,
          `Footnote closed. Hitch something and leave.`,
        ],
      ]);
    }
    return pick(sp, [
      [
        `Axle is ring 0. Road is bare metal. Stop romanticizing the straw.`,
        `Donkey is the scheduler: unfair, opinionated, refuses nice priorities.`,
        `Wheels dual-boot with no consensus. Expect thrashing.`,
        `Cargo is userspace. Fall-off is a core dump with mud.`,
        `+${gap}: survive a pothole without rebooting the animal.`,
      ],
    ]);
  }

  if (/\bsunglass|glasses|goggles\b/.test(s)) {
    return pick(sp, [
      [
        `WAF for photons with a fashion budget. +${gap} won't invent a kernel.`,
        `Process table of blocked rays is cute. Still not an OS.`,
        `Boot = "found you in a case." Init has higher standards.`,
        `Near-miss is the ceiling. Sit down gracefully.`,
        `The sun doesn't need your résumé.`,
      ],
    ]);
  }

  if (/\bumbrella\b/.test(s)) {
    return [
      `Circuit breaker for rain — not the weather kernel. +${gap} is cosplay.`,
      `Open/close is the whole API. Kitchen timers have more syscalls.`,
      `Drop cloud connections without a process table if you must.`,
      `One broken spoke floods the sector. Isolation: fashion.`,
      `Stay useful. Stay not-an-OS.`,
    ];
  }

  if (/\btoaster|oven|microwave|kettle\b/.test(s)) {
    if (answer === "YES" && (band === "hairline" || band === "style")) {
      return pick(sp, [
        [
          `Already certified. +${gap} is crumb debt, not a missing kernel.`,
          `Optional theater: one smokier panic. Coil already is ring 0.`,
          `Bagel SCHED_FIFO can stay unfair. We're not rewriting CFS.`,
          `Refuse firmware that "enhances the toast journey." That's the whole +${gap}.`,
          `Butter the core dump and move on.`,
        ],
        [
          `${t} has the title. Footnotes only.`,
          `Crumbs as orphaned inodes — name them if you want vanity points.`,
          `Pop remains an IRQ. Miss it and starve. Character, not a bug.`,
          `No status page. Smoking is telemetry.`,
          `The board is done. The bread is not.`,
        ],
      ]);
    }
    return [
      `Heat loop without commitment is just violence. Own the bit.`,
      `PIDs for slices or stay a dial with dreams.`,
      `Panic should be theatrical. Quiet failure is for monthly billing.`,
      `+${gap} when crumbs get reaped.`,
      `Until then: kitchen cosplay.`,
    ];
  }

  if (/\bfridge|refrigerator\b/.test(s)) {
    if (answer === "YES" && (band === "hairline" || band === "style")) {
      return [
        `YES already. +${gap} is leftover labeling, not a new compressor.`,
        `Door-open can stay a blocking syscall that judges you.`,
        `Zombie jars may remain unreaped. Lifestyle choice.`,
        `Defrost GC is fine. Condensation is the leak you'll never patch.`,
        `Footnotes filed. Close the door.`,
      ];
    }
    return [
      `Compressor ring 0, leftovers as zombies — lean into the contempt.`,
      `Weak consistency on shelves is policy. Label nothing.`,
      `+${gap}: a door process table that matches reality once.`,
      `Open-door alarm is the watchdog. Keep it mean.`,
      `Science experiments are long-running processes. Name them.`,
    ];
  }

  if (/\bshoe|sneaker|sandal|boot|sock\b/.test(s)) {
    if (answer === "YES" && (band === "hairline" || band === "style")) {
      return [
        `Sole is already ring 0. +${gap} is tread vanity.`,
        `Laces may deadlock. Document as Tuesday.`,
        `step() → ERODE_SOUL remains undefined behavior. Perfect.`,
        `Pinky zombie: will not fix.`,
        `Zero changelog. Full OS energy. Go walk.`,
      ];
    }
    return [
      `Sidewalk is bare metal. Stop apologizing for contact.`,
      `Mud is write amplification. Own dirty pages.`,
      `+${gap} for surviving wet grass without a panic.`,
      `Left/right cluster needs better failover (hopping).`,
      `Title pending less squeak, more contempt.`,
    ];
  }

  if (/\bcat|dog|hamster|bird|fish\b/.test(s)) {
    if (answer === "YES" && (band === "hairline" || band === "style")) {
      return pick(sp, [
        [
          `Already demotes humans to guest. +${gap} is pure spite polish.`,
          `Naps outrank meetings — constitutional. No patch required.`,
          `write(/dev/lap, self) → EBUSY. Keep the standard.`,
          `Optional: one louder 3am IRQ. Vanity.`,
          `The board bows. The animal does not.`,
        ],
      ]);
    }
    return [
      `Instinct in kernel mode. Train the userspace human or replace them.`,
      `Food bowl bootloader. Zoomies unmaskable.`,
      `+${gap}: hair write-amplification policy enforcement.`,
      `Treats softIRQ, meals hard realtime.`,
      `Refuse a status page. Quiet means something is wrong.`,
    ];
  }

  if (/\b(bike|bicycle|car|bus|train|truck|van)\b/.test(s)) {
    if (answer === "YES" && (band === "hairline" || band === "style")) {
      return [
        `Ignition already boots. +${gap} is traffic-jam UX, not ontology.`,
        `Passengers are processes. Root until the first ticket — fine.`,
        `Potholes remain bad sectors. GPS remains a liar.`,
        `Optional: horn ioctl that respects residential zones.`,
        `Drive. The title holds.`,
      ];
    }
    return [
      `Traffic is the global lock. You are not realtime.`,
      `Pick a kernel (ECU / chain / conductor). Stop democratizing it.`,
      `+${gap}: survive a merge without panicking the horn.`,
      `Oil is memory pressure. Check it.`,
      `Abstract roads so plans don't segfault into ditches.`,
    ];
  }

  if (/\b(calendar|meeting|inbox|email|slack|group chat|chat|standup)\b/.test(s)) {
    if (answer === "YES" && (band === "hairline" || band === "style")) {
      return [
        `Hostile scheduler already. +${gap} is pure preemption vanity.`,
        `Decline = SIGTERM. Keep it.`,
        `Focus never gets a timeslice — that's the product, not a bug.`,
        `Red dots are telemetry. Status page banned.`,
        `The board is in another meeting. Title stands.`,
      ];
    }
    return [
      `Own CPU time or stop cosplaying as infrastructure.`,
      `Recurring events as hard links — break one on purpose.`,
      `+${gap}: make no-show a real OOM.`,
      `Morning open is boot. Coffee is init.`,
      `CFS for adults only in the docs.`,
    ];
  }

  if (/\bcloudflare|vercel|netlify|salesforce|notion|hubspot\b/.test(s)) {
    return pick(sp, [
      [
        `OS in the marketing, guest on someone else's kernel. +${gap} is a chasm.`,
        `Edge is a fast lobby with a badge printer — not ring 0.`,
        `Syscalls appear to be HTTPS. Plan tier ≠ privilege.`,
        `Delete the word OS or ship a process table.`,
        `We grade harder because you asked for the title.`,
      ],
    ]);
  }

  // Generic multi-word person / résumé names — unique per name via spice
  if (
    answer === "YES" &&
    /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'’\-]*(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'’\-]*){1,4}$/u.test(
      thing.trim(),
    ) &&
    !/\b(OS|Inc|Ltd|Labs|Cloud|Platform)\b/i.test(thing)
  ) {
    if (band === "hairline" || band === "style") {
      return pick(sp, [
        [
          `${t} is already YES. +${gap} is résumé whitespace, not a missing kernel.`,
          `Optional: one fewer meeting softIRQ. Vanity metric.`,
          `Keep the career process table honest — kill one zombie side project.`,
          `Status page still banned. LinkedIn is loud enough.`,
          `Footnotes closed. Go touch grass or a keyboard.`,
        ],
        [
          `Crown fits ${t}. +${gap} is sleep debt accounting.`,
          `Document one syscall ${t} actually supports. Delete three buzzwords.`,
          `On-call remains realtime. Hobbies remain best-effort.`,
          `We are not rewriting your bootloader (the coffee).`,
          `Style points only. Ontology settled.`,
        ],
      ]);
    }
    return pick(sp, [
      [
        `${t} needs +${gap}: fewer exported symbols, more depth.`,
        `Reap zombie projects. Overcommit is not a personality.`,
        `Scheduler: protect one deep-work timeslice from the calendar.`,
        `Panic less in email. Log more in git.`,
        `Then reapply for the last points.`,
      ],
    ]);
  }

  if (/\bbiden\b/.test(s) && answer === "YES") {
    if (band === "hairline" || band === "style") {
      return [
        `Certified. +${gap} is latency, not legitimacy.`,
        `Teleprompter may remain ring 0. When it blanks, so does policy — known issue.`,
        `Congress thrashing is userspace. Will not fix this epoch.`,
        `Ice cream softIRQs: accepted.`,
        `Footnotes filed. Midterms are the only rollback.`,
      ];
    }
    return [
      `Boot faster than a Senate recess if you want +${gap}.`,
      `Own the lost file handles on the world stage.`,
      `Panic quieter or louder — pick one.`,
      `Cabinet processes need reaping.`,
      `Title stands under bipartisan mockery.`,
    ];
  }

  if (/\btrump\b/.test(s) && answer === "YES") {
    if (band === "hairline" || band === "style") {
      return [
        `Already posts panics in all caps. +${gap} is quieter commits — optional.`,
        `Loyalty-as-priority is honest. Unfair. Documented enough.`,
        `Write-only syscall table is a choice. Own the lost fsyncs.`,
        `Stability was never in requirements.txt.`,
        `Title stands. The timeline is the log.`,
      ];
    }
    return [
      `Ring 0 is the podium. Guest accounts pending block.`,
      `Scheduler: loudest on the bus. Forever.`,
      `+${gap}: a changelog that isn't a rally.`,
      `Force-push policy stays. Code review remains a myth.`,
      `Blame the previous package maintainer — classic.`,
    ];
  }

  return null;
}

function pick<T>(sp: number, items: T[]): T {
  return items[Math.floor(sp * items.length) % items.length]!;
}

function short(s: string): string {
  const t = s.trim();
  if (t.length <= 36) return t;
  return `${t.slice(0, 35)}…`;
}
