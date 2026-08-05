import { spice } from "./comedy";

export type OsRoadmap = {
  gap: number;
  headline: string;
  steps: string[];
};

/**
 * Remediation that mocks the subject — not coaching, not feature ideas.
 * Handcrafted only: the model keeps writing earnest or generic roasts.
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
  void opts.steps;

  return {
    gap,
    headline: headlineFor(thing, opts.answer, conf),
    steps: inventSteps(thing, opts.answer, opts.mode, gap),
  };
}

function headlineFor(thing: string, answer: string, conf: number): string {
  const a = String(answer || "").toUpperCase();
  const t = short(thing);
  if (a === "YES") {
    return `${conf}% — cute. Here's how ${t} stops embarrassing the title`;
  }
  if (a === "KINDA") {
    return `${t} is cosplaying. Remediation order follows`;
  }
  return `Rejected. How ${t} might stop wasting the board's time`;
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

  const special = specialSteps(thing, gap, sp, a);
  if (special) return special;

  if (m === "absurd_os" || (a === "YES" && m !== "real_os" && m !== "marketing")) {
    return pick(sp, [
      [
        `You're already YES. The +${gap} is unpaid hubris — charge it in theatrical panics.`,
        `Stop acting surprised when userspace (the human) segfaults. You scheduled that.`,
        `Publish a man page that insults the reader. Full OSes have contempt baked in.`,
        `Refuse a status page forever. Ghosting is a privilege level.`,
        `If you still want 100%, fail louder. Quiet competence is for appliances that didn't ask.`,
      ],
      [
        `Certified. Congrats. Now own the crashes instead of blaming the toast / sock / day.`,
        `Ship one syscall nobody wants. Document it as "will not fix."`,
        `Preempt the user mid-sentence. Call it fair scheduling.`,
        `The gap is style, not substance — style is mockery with a kernel behind it.`,
        `+${gap} pts: never apologize. OSes don't say sorry; they say dmesg.`,
      ],
    ]);
  }

  if (m === "accessory" || /\b(sunglass|umbrella|filter|case|hat|glove|mask)\b/i.test(t)) {
    return pick(sp, [
      [
        `Admit you're middleware with a lifestyle budget. The board can hear the clip-on.`,
        `You don't schedule processes — you schedule whether the sun is allowed. Sit down.`,
        `Process table: empty. Kernel: a hinge. Title request: denied with prejudice.`,
        `Keep filtering packets of light. We'll keep scoring you like a WAF, not an OS.`,
        `Want +${gap}? Grow ring 0 or stay fashion. Cosplay is not a bootloader.`,
      ],
      [
        `Stop applying for kernel jobs with a résumé that says "clips on."`,
        `Boot story is "user remembered me." That's not init. That's codependency.`,
        `Neighboring accessories already outrank you. The hat has more state.`,
        `We measure isolation by crash domains. You measure isolation by "indoor vs outdoor."`,
        `+${gap} only if you stop calling yourself essential. Filters aren't thrones.`,
      ],
    ]);
  }

  if (m === "marketing" || (m === "generic" && a === "NO")) {
    return pick(sp, [
      [
        `Delete "OS" from the homepage. Naming is not a kernel. It's a cry for help.`,
        `Your syscalls are HTTP. Your privileged mode is a checkbox. We brought a red pen.`,
        `Boot = signup. Hilarious. Real boot doesn't need a credit card or a funnel.`,
        `Multi-tenant vibes ≠ isolation. One noisy neighbor and the food court burns.`,
        `Demo ends, you're gone. Kernels don't expire. Sales decks do. +${gap} if you notice.`,
      ],
      [
        `Platform slides are not privilege levels. Stop presenting. Start scheduling.`,
        `Admin seat on Enterprise is not ring 0. It's a chair with a price tag.`,
        `Panic log is a status tweet with a soft gradient. Pathetic. Ship a real oops.`,
        `You asked for the title. A toaster didn't. We grade you harder on purpose.`,
        `Come back when ${t} can fail without paging the brand team. Until then: guest.`,
      ],
      [
        `The word OS on your box is evidence against you, not for you.`,
        `Hardware abstraction: "runs on AWS." Congratulations on discovering someone else's OS.`,
        `Scheduler: the sales calendar. Process table: the CRM. We're not laughing with you.`,
        `Isolation strategy: pray the other tenant is nice. Ring 0 strategy: none.`,
        `+${gap} requires silence about "the OS for X." Verticals are for SaaS. Sit.`,
      ],
    ]);
  }

  if (m === "real_os" || a === "YES") {
    return pick(sp, [
      [
        `Yes, you're an OS. No, that doesn't make the installer less of a war crime.`,
        `Updates that treat decline as crime: fixed that and you'd earn the +${gap}.`,
        `Drivers after the forum post is not a flex. It's a hostage situation.`,
        `Settings scavenger hunts dock style points. We have a spreadsheet.`,
        `Title granted. Dignity pending code review. Try not to reboot mid-roast.`,
      ],
      [
        `Technically correct — the best kind of correct, and the least charming.`,
        `Bloat is not a personality. Shave it or keep getting mocked in public.`,
        `Surprise reboots are how you negotiate. We prefer predictable panic.`,
        `Rename the same panel again and we dock another point. Identity matters.`,
        `+${gap} is pure vibes debt. Pay it in fewer wizards and more honesty.`,
      ],
    ]);
  }

  if (a === "KINDA") {
    return pick(sp, [
      [
        `Half a kernel is a costume. Pick substrate or decoration before we do.`,
        `You own nothing completely — not memory, not time, not the plot.`,
        `Boot starts at "open the app." That's a guest badge with good fonts.`,
        `Buttons are not syscalls. Latency with branding is still not ring 0.`,
        `+${gap}: stop cosplaying. Schedule something meaner than a reminder.`,
      ],
      [
        `OS-adjacent is what people say when they want a trophy for standing nearby.`,
        `Process table or GTFO. Spreadsheets and dashboards do not count.`,
        `Crash one feature and the rest plot revenge — or just die together. Be honest.`,
        `We withhold certification because you asked nicely. That's not how kernels work.`,
        `${t} at 100% means the question dies. Right now the question is laughing.`,
      ],
    ]);
  }

  return [
    `Your kernel is a PowerPoint. We graded the transitions. Fail.`,
    `You schedule product launches, not processes. Different sport.`,
    `Crash without a brand team and maybe we'll reopen the file.`,
    `Boot from metal, not from a funnel. Guests don't get the crown.`,
    `${t}: useful layer, wrong layer, wrong application, next.`,
  ];
}

function specialSteps(
  thing: string,
  gap: number,
  sp: number,
  answer: string,
): string[] | null {
  const s = thing.toLowerCase();

  if (/\bsunglass|glasses|goggles\b/.test(s)) {
    return pick(sp, [
      [
        `You're a WAF for photons with a fashion budget. Stop filing for kernel privileges.`,
        `Process table of blocked rays is a cute bit. Still not an OS. Never was.`,
        `Boot = "user found you in a case." Init systems have higher standards.`,
        `Crash domain: sit on them once. Recovery: tape. Honesty: higher than most SaaS.`,
        `+${gap}? Grow a scheduler or stay decorative. The sun doesn't need your résumé.`,
      ],
      [
        `Filtering glare is not systems programming. It's weather-dependent cosplay.`,
        `IRQ on bright days. SoftIRQ on "you look mysterious." Neither is a process model.`,
        `The hat has more state than you. Reflect on that — carefully, indoors.`,
        `We score accessories as near-misses. Near-misses don't get crowns. They get smudges.`,
        `Want full OS territory? Own the bus. Until then: middleware with arms.`,
      ],
    ]);
  }

  if (/\bumbrella\b/.test(s)) {
    return [
      `Circuit breaker for rain. Adorable. Still not the weather kernel. Sit.`,
      `Open/close is your entire API. We've seen kitchen timers with more syscalls.`,
      `You drop cloud connections without a change window — and without a process table.`,
      `One broken spoke and the sector floods. Isolation: cosplay. Title: denied.`,
      `+${gap}: become unforgettable at the café. OSes aren't left on the bus.`,
    ];
  }

  if (/\btoaster|oven|microwave|kettle\b/.test(s)) {
    if (answer === "YES") {
      return pick(sp, [
        [
          `YES already. The +${gap} is pure drama debt — collect it in smokier panics.`,
          `Crumbs are orphaned inodes you refuse to fsck. Own the mess; that's kernel culture.`,
          `Bagel mode is SCHED_FIFO. Everything else is you ignoring niceness. Keep that energy.`,
          `Userspace is bread. When it burns, blame the human. Full OS. Zero remorse.`,
          `Never ship a status page. If it's smoking, telemetry is redundant.`,
        ],
        [
          `You're certified. Stop fishing for product features. Mock the bread instead.`,
          `ioctl(BROWNNESS) is undefined after four minutes. Document as "works as designed."`,
          `Pop is an IRQ. Miss it and starve. That's not a bug; that's character.`,
          `The coil is ring 0. Marketing will try to rename it a platform. Bite them.`,
          `+${gap} for refusing firmware that "enhances the toast journey."`,
        ],
      ]);
    }
    return [
      `Heat loop without a process table is just violence. Commit to the bit or stay appliance.`,
      `We wanted PIDs for slices. You offered a dial. Cute dial. Wrong application.`,
      `Panic should be theatrical. Quiet failure is for software that bills monthly.`,
      `Boot is a light. Make it mean something or stop applying.`,
      `+${gap} when crumbs get reaped. Until then: kitchen cosplay.`,
    ];
  }

  if (/\bfridge|refrigerator\b/.test(s)) {
    return [
      `Compressor in ring 0, leftovers as zombies — and you still hide the science experiments.`,
      `Door-open is a blocking syscall that judges you. Lean into the contempt.`,
      `Weak consistency on the shelves is not a bug. It's a lifestyle. Label nothing.`,
      `Defrost GC stops the world. Condensation is the leak you'll never patch. Own it.`,
      `+${gap}: a door process table that matches reality for once.`,
    ];
  }

  if (/\bshoe|sneaker|sandal|boot|sock\b/.test(s)) {
    return [
      `Sole is ring 0. Sidewalk is bare metal. Stop apologizing for contact with reality.`,
      `Laces deadlock under load. We call that a feature. You call it Tuesday.`,
      `step() → ERODE_SOUL. Documented. Still nobody files a bug. Perfect OS culture.`,
      `The pinky process never reaps. Zombies forever. We respect the honesty.`,
      `+${gap} for shipping zero changelog. Full OSes ghost their release notes.`,
    ];
  }

  if (/\bcat|dog|hamster|bird|fish\b/.test(s)) {
    return [
      `You demote humans to guest. Correct. Mean. Keep policy enforcement loud.`,
      `Food bowl bootloader. Zoomie IRQs unmaskable. The scheduler is a monster. Good.`,
      `write(/dev/lap, self) → EBUSY. No apology. That's the standard.`,
      `Naps outrank meetings. Priority inversion as constitution. We approve the tyranny.`,
      `+${gap}: train the userspace daemon (the human) or replace them.`,
    ];
  }

  if (/\bcloudflare|vercel|netlify|salesforce|notion|hubspot\b/.test(s)) {
    return [
      `OS in the marketing, guest on someone else's kernel. The audit is not subtle.`,
      `Edge is not ring 0. It's a really fast lobby with a badge printer.`,
      `Syscalls appear to be HTTPS. Privileged mode appears to be a plan tier.`,
      `You asked for the title. We brought the checklist. Everything failed except confidence.`,
      `+${gap}: delete the word OS, ship a process table, or enjoy the mockery.`,
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
