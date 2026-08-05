import { chance, hashString, mulberry32, pick, range, seedHex } from "./seed";
import type { Analysis, Criterion, ProbeResult, SubjectKind, TreeNode } from "./types";

const VERDICTS = [
  "OS-adjacent vapor",
  "Spiritually a scheduler",
  "Kernel cosplay",
  "SaaS with delusions of ring‑0",
  "Browser wearing a trench coat",
  "Distributed vibes, local nothing",
  "Process table of pure marketing",
  "Syscall: marketing() → success",
  "Booted into brand deck",
  "Hypervisor of hopium",
  "Not an OS (with footnotes)",
  "Definitely an OS if you squint hard enough",
  "Operating-system-shaped object",
  "POSIX of the soul, nothing of the silicon",
  "Interrupt-driven press release",
];

const STAMPS = [
  "PROVISIONALLY ABSURD",
  "PEER-REVIEWED BY NO ONE",
  "CHAOS CERTIFIED",
  "SEALED / UNSEALED",
  "REDACTED FOR COMEDY",
  "IIAO FORM 7-B",
  "NOT LEGAL ADVICE",
  "KERNEL PANIC OPTIONAL",
];

const NOTES = [
  "Mentions 'platform' more than 'scheduler'.",
  "Claims abstraction; delivers a dashboard.",
  "Hardware contact: emotional only.",
  "Interrupts are mostly email.",
  "Memory management = infinite scroll.",
  "Drivers: marketing, sales, hope.",
  "Filesystem: folders in a slide deck.",
  "Multitasking: twelve tabs of hype.",
  "Privileged mode: admin panel.",
  "Boot sequence: animated logo, then pricing.",
  "Syscalls map cleanly to Stripe webhooks.",
  "Preemption: the CFO said no.",
  "Context switch = refresh the SPA.",
  "IPC via Slack threads.",
  "Page faults: 404 culture.",
];

const RED_FLAGS = [
  "Word 'OS' appears without a bootloader.",
  "Landing page has more gradients than processes.",
  "No ring buffer; only a waitlist.",
  "Claims isolation; ships a shared database.",
  "Scheduler is a cron job named destiny.",
  "Drivers written in Figma.",
  "Root privileges granted by pricing tier.",
  "Kernel panic message is a toast notification.",
  "Hardware support matrix is a vibes chart.",
  "POSIX compliance: 'we vibe with UNIX'.",
];

const ENDORSEMENTS = [
  "Anonymous systems engineer who left early",
  "A toaster that also runs JavaScript",
  "Three raccoons in a trench coat (distributed)",
  "The ghost of Multics",
  "Cloudflare's product naming committee (alleged)",
  "Your laptop's thermal throttle",
  "A LinkedIn post with 40k likes",
  "Emacs (conflicted)",
  "The browser process that ate 9GB",
  "ISO/IEC comedy subcommittee 404",
];

const AXES = [
  "Kernel cosplay",
  "Scheduler theater",
  "Hardware denial",
  "Marketing entropy",
  "Syscall cosplay",
  "Isolation vibes",
  "Boot ritual",
  "POSIX cosplay",
] as const;

const TREE_BRANCHES = [
  { q: "Does it schedule work?", y: "Yes — or claims to", n: "No — pure vibes" },
  { q: "Does it abstract hardware?", y: "Abstracts something", n: "Touches metal (unlikely)" },
  { q: "Did marketing say OS?", y: "OS was uttered", n: "OS carefully avoided" },
  { q: "Can it panic?", y: "Has failure modes", n: "Only success toasts" },
  { q: "Is there a userspace?", y: "Users exist", n: "Only executives" },
  { q: "File system or file cabinet?", y: "Hierarchical delusions", n: "Flat chaos" },
  { q: "Drivers or vibes?", y: "Something called a driver", n: "Vibes exclusively" },
  { q: "Ring 0 or ring light?", y: "Privileged path", n: "Content lighting" },
];

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
    return new URL(subject.includes("://") ? subject : `https://${subject}`).hostname;
  } catch {
    return null;
  }
}

function biasFromText(subject: string, probe: ProbeResult | null | undefined): number {
  const blob = [
    subject,
    probe?.title ?? "",
    probe?.description ?? "",
  ]
    .join(" ")
    .toLowerCase();

  let b = 0;
  const hits: [RegExp, number][] = [
    [/\bos\b|operating system|kernel|hypervisor|bare metal/, 0.18],
    [/cloudflare/, 0.12],
    [/workers?|edge|cdn|serverless/, 0.06],
    [/browser|chrome|electron|webkit/, 0.1],
    [/emacs|vim|neovim/, 0.14],
    [/linux|windows|macos|android|ios|bsd/, 0.22],
    [/platform|ecosystem|stack/, 0.05],
    [/saas|dashboard|pricing|enterprise/, -0.08],
    [/game|steam|console/, 0.04],
    [/ai|llm|agent/, 0.03],
  ];
  for (const [re, w] of hits) {
    if (re.test(blob)) b += w;
  }
  return b;
}

function buildCriteria(rng: () => number, bias: number): Criterion[] {
  return AXES.map((axis, i) => {
    const base = range(rng, 0.12, 0.88) + bias * (0.4 + rng() * 0.6);
    const score = Math.min(0.98, Math.max(0.04, base));
    return {
      id: `c${i}`,
      label: axis,
      weight: Math.round(range(rng, 0.7, 1.4) * 10) / 10,
      score,
      note: pick(rng, NOTES),
      axis,
    };
  });
}

function buildTree(rng: () => number, confidence: number): TreeNode {
  const shuffled = [...TREE_BRANCHES].sort(() => rng() - 0.5).slice(0, 5);

  function leaf(label: string, outcome: TreeNode["outcome"]): TreeNode {
    return {
      id: `L${Math.floor(rng() * 1e6)}`,
      label,
      outcome,
      detail: pick(rng, [
        "Methodology §4.2 (invented)",
        "See appendix: vibes",
        "Counterexample ignored",
        "Peer review: pending forever",
      ]),
    };
  }

  function branch(depth: number, path: string): TreeNode {
    if (depth >= shuffled.length) {
      const high = confidence > 55;
      return leaf(
        high ? "Conclude: OS-shaped" : "Conclude: not OS (probably)",
        high ? "yes" : "no",
      );
    }
    const b = shuffled[depth]!;
    const goYes = chance(rng, 0.45 + confidence / 200);
    return {
      id: `N${depth}-${path}`,
      label: b.q,
      children: [
        {
          id: `Y${depth}-${path}`,
          label: b.y,
          outcome: "yes",
          children: goYes || depth < 2 ? [branch(depth + 1, path + "Y")] : [leaf("Dead end (yes)", "leaf")],
        },
        {
          id: `N${depth}-${path}`,
          label: b.n,
          outcome: "no",
          children: !goYes || depth < 2 ? [branch(depth + 1, path + "N")] : [leaf("Dead end (no)", "leaf")],
        },
        chance(rng, 0.35)
          ? {
              id: `C${depth}-${path}`,
              label: pick(rng, [
                "Chaos branch: redefine OS",
                "Emergency redefinition",
                "Appeal to Wikipedia",
                "Ship anyway",
              ]),
              outcome: "chaos",
              children: [leaf(pick(rng, VERDICTS), "chaos")],
            }
          : undefined,
      ].filter(Boolean) as TreeNode[],
    };
  }

  return {
    id: "root",
    label: "Is it an OS?",
    detail: "Root inquiry · IIAO Laboratory",
    children: [branch(0, "")],
  };
}

function weightedConfidence(criteria: Criterion[], bias: number, rng: () => number): number {
  let num = 0;
  let den = 0;
  for (const c of criteria) {
    num += c.score * c.weight;
    den += c.weight;
  }
  let pct = (num / den) * 100;
  pct += bias * 40;
  pct += range(rng, -6, 6);
  return Math.round(Math.min(97, Math.max(3, pct)));
}

function caseId(seed: string): string {
  return `IIAO-${seed.slice(0, 4).toUpperCase()}-${seed.slice(4, 8).toUpperCase()}`;
}

export function analyze(subjectRaw: string, probe?: ProbeResult | null): Analysis {
  const subject = subjectRaw.trim() || "the void";
  const kind = detectKind(subject === "the void" ? "" : subject);
  const host = hostOf(subject, kind === "empty" ? "claim" : kind);
  const seed = seedHex(subject.toLowerCase());
  const rng = mulberry32(hashString(subject.toLowerCase() + "|iiao"));
  const bias = biasFromText(subject, probe);
  const criteria = buildCriteria(rng, bias);
  const confidence = weightedConfidence(criteria, bias, rng);
  const radar = criteria.map((c) => ({ axis: c.axis, value: Math.round(c.score * 100) }));
  const tree = buildTree(rng, confidence);

  const nFlags = 2 + Math.floor(rng() * 3);
  const redFlags = Array.from({ length: nFlags }, () => pick(rng, RED_FLAGS));
  // unique-ish
  const uniqFlags = [...new Set(redFlags)];

  const endorsements = Array.from({ length: 2 + Math.floor(rng() * 2) }, () =>
    pick(rng, ENDORSEMENTS),
  );

  const years = 1970 + Math.floor(rng() * 56);
  const timeline = [
    { t: `${years}`, event: pick(rng, ["First rumor of process table", "Concept art for a kernel", "Domain registered in a dream"]) },
    { t: `${years + 1 + Math.floor(rng() * 5)}`, event: pick(rng, ["Renamed to include 'OS'", "Slide deck achieves sentience", "Scheduler replaced with hope"]) },
    { t: "now", event: pick(rng, ["IIAO determination requested", "Peer review still buffering", "Chaos window opened"]) },
  ];

  return {
    subject,
    kind: kind === "empty" ? "claim" : kind,
    host,
    seed,
    caseId: caseId(seed),
    confidence,
    verdict: pick(rng, VERDICTS),
    subtitle: pick(rng, [
      "A rigorous farce in several acts.",
      "Determination issued under theatrical license.",
      "Results may contradict reality and each other.",
      "Confidence is a number. Meaning is optional.",
      "If it boots in your heart, is that enough?",
    ]),
    stamp: pick(rng, STAMPS),
    criteria,
    tree,
    radar,
    timeline,
    redFlags: uniqFlags,
    endorsements: [...new Set(endorsements)],
    methodology: [
      "Seeded pseudorandom walk over invented criteria",
      "Lexical bias from subject text & optional probe",
      "Decision tree grown until comedy saturates",
      "No kernels were harmed (or consulted)",
    ],
    probe: probe ?? null,
  };
}

export function pipelineFor(subject: string): { id: string; label: string; blurb: string; ms: number }[] {
  const rng = mulberry32(hashString(subject + "|pipe"));
  return [
    { id: "ingest", label: "Ingest subject", blurb: "Normalize URL / claim · strip vibes residue", ms: 280 + rng() * 200 },
    { id: "probe", label: "Remote probe", blurb: "Optional HTTP glance (title, meta, entropy)", ms: 400 + rng() * 500 },
    { id: "lex", label: "Lexical OS-bias", blurb: "Scan for kernel cosplay vocabulary", ms: 220 + rng() * 180 },
    { id: "tree", label: "Grow decision tree", blurb: "Branch until contradiction or delight", ms: 350 + rng() * 250 },
    { id: "radar", label: "Axis projection", blurb: "Map scores onto absurd radar", ms: 200 + rng() * 150 },
    { id: "seal", label: "Seal determination", blurb: "Rubber-stamp confidence · emit case id", ms: 180 + rng() * 120 },
  ];
}
