import { spice } from "./comedy";
import { boardVoice } from "./voice";

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
  const thing = boardVoice((opts.thing || "It").trim() || "It");
  void opts.steps;

  return {
    gap,
    headline: headlineFor(thing, opts.answer, conf, gap),
    steps: inventSteps(thing, opts.answer, opts.mode, gap),
  };
}

function headlineFor(
  thing: string,
  answer: string,
  conf: number,
  gap: number,
): string {
  const a = String(answer || "").toUpperCase();
  const t = short(thing);
  const sp = spice(thing.toLowerCase() + "|" + a);
  if (a === "YES") {
    return pick(sp, [
      `${conf}% — cute. Here's how ${t} stops embarrassing the title`,
      `Certified at ${conf}%. The +${gap} is pure style debt for ${t}`,
      `${t}: YES with footnotes. Remediation is mandatory reading`,
      `Board says YES. Also says try harder, ${t}`,
    ]);
  }
  if (a === "KINDA") {
    return pick(sp, [
      `${t} is cosplaying. Remediation order follows`,
      `Half-title for ${t}. Full title requires the steps below`,
      `KINDA is not a vibe. Close the +${gap} or drop the act`,
    ]);
  }
  return pick(sp, [
    `Rejected. How ${t} might stop wasting the board's time`,
    `Audit failed for ${t}. Path to not being laughed at:`,
    `${t}: not an OS. Here's the homework nobody asked for`,
    `NO at ${conf}%. ${t} can still cosplay harder — see below`,
  ]);
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

  // Answer first — never slap YES-hubris remediation on a NO judgment
  if (a === "NO") {
    return pick(sp, [
      [
        `Delete the delusion. ${t} schedules vibes, not processes.`,
        `Kernel: missing. Process table: a moodboard. Title: denied.`,
        `Boot story was a story. Init systems have standards.`,
        `Stay a guest on someone else's substrate. The crown is closed.`,
        `+${gap}: grow ring 0 or enjoy the mockery. No third option.`,
      ],
      [
        `You applied for kernel. Résumé said “${t}.” Rejected.`,
        `Syscalls appear to be speeches / posts / vibes. Not enough.`,
        `We brought a checklist. Everything failed except confidence.`,
        `Isolation strategy: hope. Scheduler: whoever is loudest.`,
        `Come back when ${t} can panic without a press conference.`,
      ],
      [
        `${t} is a layer, not the foundation. Layers don't get coronations.`,
        `Show us a process table that isn't a group chat or a roadmap slide.`,
        `Ring 0 is closed. Collect your sticker at the gift shop.`,
        `Useful? Maybe. OS? We graded it. Bring a better pencil next time.`,
        `+${gap} only arrives with actual privilege — not branding.`,
      ],
    ]);
  }

  if (a === "KINDA") {
    return pick(sp, [
      [
        `Half a kernel is a costume. ${t} should pick substrate or decoration.`,
        `You own nothing completely — not memory, not time, not the plot.`,
        `Boot starts wrong. Buttons are not syscalls.`,
        `+${gap}: stop cosplaying. Schedule something meaner than a reminder.`,
        `${t} at 100% means the question dies. Right now it is laughing.`,
      ],
      [
        `OS-adjacent is a participation trophy. ${t} can do better or stop applying.`,
        `Process table or GTFO. Spreadsheets and dashboards do not count.`,
        `Crash one feature and the rest plot revenge — or just die together.`,
        `We withhold certification because you asked nicely. Kernels don't.`,
        `Close +${gap} with isolation that survives a bad afternoon.`,
      ],
    ]);
  }

  if (m === "absurd_os" || (a === "YES" && m !== "real_os" && m !== "marketing")) {
    return absurdYesSteps(t, gap, sp);
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

  return [
    `Your kernel is a PowerPoint. We graded the transitions. Fail.`,
    `You schedule product launches, not processes. Different sport.`,
    `Crash without a brand team and maybe we'll reopen the file.`,
    `Boot from metal, not from a funnel. Guests don't get the crown.`,
    `${t}: useful layer, wrong layer, wrong application, next.`,
  ];
}

/** YES absurd objects: always name the thing; rotate packs for variety. */
function absurdYesSteps(t: string, gap: number, sp: number): string[] {
  return pick(sp, [
    [
      `${t} is already YES. The +${gap} is unpaid hubris — charge it in louder panics.`,
      `Stop acting surprised when userspace segfaults. ${t} scheduled that.`,
      `Publish a man page that insults the reader. Full OSes have contempt baked in.`,
      `Refuse a status page. If ${t} is down, the room already knows.`,
      `Want 100%? Fail more theatrically. Quiet competence is for boring hardware.`,
    ],
    [
      `Certified. Congrats. Own the crashes — ${t} doesn't get a PR team.`,
      `Ship one syscall nobody wants. Document it as "will not fix."`,
      `Preempt the user mid-sentence. Call it fair scheduling.`,
      `The gap is style: mock harder, schedule meaner, ghost nicer docs.`,
      `+${gap} pts: never apologize. OSes say dmesg, not "sorry about that."`,
    ],
    [
      `${t} got the crown. The footnotes are where we dock points.`,
      `Boot sequence longer than the object. Good. Make the panic longer too.`,
      `Process table should include every crumb, straw, squeak, and grudge.`,
      `When ${t} dies, blame userspace in writing. That's kernel culture.`,
      `Close +${gap} by refusing firmware that "enhances the journey."`,
    ],
    [
      `YES stands. ${t} still owes us a more honest OOM killer.`,
      `Scheduler priority: whatever is loudest / hottest / hungriest wins.`,
      `Isolation: if one part fails, the rest should still judge you.`,
      `Changelog optional. Contempt for userspace: mandatory.`,
      `+${gap}: one new IRQ that ruins someone's afternoon on purpose.`,
    ],
  ]);
}

function specialSteps(
  thing: string,
  gap: number,
  sp: number,
  answer: string,
): string[] | null {
  const s = thing.toLowerCase();

  if (/\b(donkey|mule|horse).*(cart|wagon)|cart|wagon|buggy|carriage\b/.test(s) ||
      /\b(cart|wagon)\b/.test(s)) {
    return pick(sp, [
      [
        `Axle is ring 0. Road is bare metal. Stop romanticizing the straw.`,
        `Donkey is the scheduler: unfair, opinionated, refuses nice priorities.`,
        `Wheels are dual-boot with no consensus protocol. Expect thrashing.`,
        `Cargo is userspace. When it falls off, that's a core dump with mud.`,
        `+${gap}: invent brakes that aren't "hope" and a panic that isn't braying.`,
      ],
      [
        `${thing.trim()} already hauls state across town. Act like a kernel.`,
        `syscall clip_clop() — blocking, dusty, no timeout.`,
        `Process table: hay, spite, and one passenger who regrets everything.`,
        `Boot = hitch. Shutdown = unhitch. No cloud region. Pure.`,
        `Close +${gap} by surviving a pothole without rebooting the donkey.`,
      ],
    ]);
  }

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
    return pick(sp, [
      [
        `Circuit breaker for rain. Adorable. Still not the weather kernel. Sit.`,
        `Open/close is your entire API. We've seen kitchen timers with more syscalls.`,
        `You drop cloud connections without a change window — and without a process table.`,
        `One broken spoke and the sector floods. Isolation: cosplay. Title: denied.`,
        `+${gap}: become unforgettable at the café. OSes aren't left on the bus.`,
      ],
    ]);
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
    return pick(sp, [
      [
        `Compressor in ring 0, leftovers as zombies — and you still hide the science experiments.`,
        `Door-open is a blocking syscall that judges you. Lean into the contempt.`,
        `Weak consistency on the shelves is not a bug. It's a lifestyle. Label nothing.`,
        `Defrost GC stops the world. Condensation is the leak you'll never patch. Own it.`,
        `+${gap}: a door process table that matches reality for once.`,
      ],
    ]);
  }

  if (/\bshoe|sneaker|sandal|boot|sock\b/.test(s)) {
    return pick(sp, [
      [
        `Sole is ring 0. Sidewalk is bare metal. Stop apologizing for contact with reality.`,
        `Laces deadlock under load. We call that a feature. You call it Tuesday.`,
        `step() → ERODE_SOUL. Documented. Still nobody files a bug. Perfect OS culture.`,
        `The pinky process never reaps. Zombies forever. We respect the honesty.`,
        `+${gap} for shipping zero changelog. Full OSes ghost their release notes.`,
      ],
      [
        `Already YES. The +${gap} is tread debt — collect it in wet-grass panics.`,
        `Left and right are a poorly documented cluster. Failover is hopping.`,
        `Mud is write amplification. Own the dirty pages.`,
        `ioctl(KICK) denied in polite company. Document as EPERM.`,
        `Changelog: empty. Soul: eroded. Certified.`,
      ],
    ]);
  }

  if (/\bcat|dog|hamster|bird|fish\b/.test(s)) {
    return pick(sp, [
      [
        `You demote humans to guest. Correct. Mean. Keep policy enforcement loud.`,
        `Food bowl bootloader. Zoomie IRQs unmaskable. The scheduler is a monster. Good.`,
        `write(/dev/lap, self) → EBUSY. No apology. That's the standard.`,
        `Naps outrank meetings. Priority inversion as constitution. We approve the tyranny.`,
        `+${gap}: train the userspace daemon (the human) or replace them.`,
      ],
      [
        `Already a kernel. The +${gap} is pure spite debt — collect at 3am.`,
        `Hair is write amplification. The couch is a dirty page that never flushes.`,
        `Treats are softIRQs. Meals are hard real-time. Miss one and panic.`,
        `Process table: zoomies, grudges, and one laser pointer you will never catch.`,
        `Refuse a status page. If they're quiet, something is wrong.`,
      ],
    ]);
  }

  if (/\b(bike|bicycle|car|bus|train|truck|van)\b/.test(s)) {
    return pick(sp, [
      [
        `Ignition is boot. Traffic is the global lock. You are not realtime.`,
        `ECU / chain / conductor: pick a kernel and stop pretending democracy.`,
        `Passengers are processes. Root lasts until the first ticket.`,
        `Potholes are bad sectors. GPS is a lying oracle process.`,
        `+${gap}: survive a merge without a kernel panic in the horn.`,
      ],
    ]);
  }

  if (/\b(calendar|meeting|inbox|email|slack|group chat|chat|standup)\b/.test(s)) {
    return pick(sp, [
      [
        `Already a hostile scheduler. The +${gap} is pure preemption debt.`,
        `Decline is SIGTERM. Make no-show a real OOM, not a soft skill.`,
        `Recurring events are hard links. Break one on purpose. Document nothing.`,
        `Morning open is boot. Coffee is init. Focus never gets a timeslice — fix that or own it.`,
        `Status page forbidden. The red dots are telemetry enough.`,
      ],
    ]);
  }

  if (/\bcloudflare|vercel|netlify|salesforce|notion|hubspot\b/.test(s)) {
    return pick(sp, [
      [
        `OS in the marketing, guest on someone else's kernel. The audit is not subtle.`,
        `Edge is not ring 0. It's a really fast lobby with a badge printer.`,
        `Syscalls appear to be HTTPS. Privileged mode appears to be a plan tier.`,
        `You asked for the title. We brought the checklist. Everything failed except confidence.`,
        `+${gap}: delete the word OS, ship a process table, or enjoy the mockery.`,
      ],
    ]);
  }

  if (/\bbiden\b/.test(s) && answer === "YES") {
    return [
      `Certified. The +${gap} is pure latency — boot faster than a Senate recess.`,
      `Teleprompter stays ring 0. When it segfaults, so do you. Own it.`,
      `Congress is thrashing userspace. Stop pretending fair scheduling exists.`,
      `Ice cream softIRQs are fine. Lost file handles on the world stage are not.`,
      `Panic should be quieter. Or louder. Pick one epoch and stick to it.`,
    ];
  }

  if (/\btrump\b/.test(s) && answer === "YES") {
    return pick(sp, [
      [
        `Already posts panics in all caps. The +${gap} is just quieter commits.`,
        `Loyalty as process priority is honest. Unfair. Keep it documented.`,
        `Write-only syscall table is a choice. Own the lost fsyncs.`,
        `Forced updates at midnight: classic. Add a changelog that isn't a rally.`,
        `Stability was never a requirement. Stop advertising it.`,
      ],
    ]);
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
