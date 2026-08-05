import type { TreeNode } from "./types";

export type JudgeNote = { label: string; note: string };

/** Multi-step satirical decision path for the vertical tree viz. */
export function buildJudgmentTree(opts: {
  name: string;
  answer: string;
  confidence: number;
  line: string;
  notes?: JudgeNote[];
}): TreeNode {
  const answer = String(opts.answer || "KINDA").toUpperCase();
  const conf = Math.min(97, Math.max(5, Math.round(opts.confidence || 50)));
  const name = short(opts.name, 32);
  const line = opts.line || `${answer} · ${conf}%`;

  const stock: JudgeNote[] = [
    {
      label: "Runs something",
      note: "Does anything execute, heat, schedule, or thrash?",
    },
    {
      label: "Kernel-ish core",
      note: "Is there a privileged middle that owns resources?",
    },
    {
      label: "Isolation",
      note: "Can one crash leave the others standing?",
    },
    {
      label: "Boot story",
      note: "Power-on → ready, not signup → dashboard.",
    },
  ];

  let notes = (opts.notes?.length ? opts.notes : stock).slice(0, 5);
  let path = pathForAnswer(answer, notes.length);

  // Stop at the first failing gate so the path doesn't keep walking after a NO
  const failIdx = path.indexOf("no");
  if (failIdx >= 0 && answer !== "YES") {
    notes = notes.slice(0, failIdx + 1);
    path = path.slice(0, failIdx + 1);
  }

  // Build from leaf up so each question owns yes/no branches
  let child: TreeNode = {
    id: "leaf",
    label: `${answer} · ${conf}%`,
    taken: true,
    outcome: answer === "YES" ? "yes" : answer === "NO" ? "no" : "leaf",
    detail: line,
  };

  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]!;
    const takeYes = path[i] === "yes";
    const yesBranch: TreeNode = {
      id: `b-${i}-y`,
      label: "Yes",
      taken: takeYes,
      outcome: "yes",
      detail: takeYes ? n.note : undefined,
      children: takeYes ? [child] : [],
    };
    const noBranch: TreeNode = {
      id: `b-${i}-n`,
      label: "No",
      taken: !takeYes,
      outcome: "no",
      detail: !takeYes ? n.note : undefined,
      children: !takeYes ? [child] : [],
    };
    child = {
      id: `t-${i}`,
      label: `${n.label}?`,
      detail: n.note,
      taken: true,
      outcome: "question",
      children: [yesBranch, noBranch],
    };
  }

  return {
    id: "root",
    label: `Is ${name} an OS?`,
    taken: true,
    outcome: "question",
    children: [child],
  };
}

/** Which branch is taken at each note (yes = pass that gate). */
function pathForAnswer(
  answer: string,
  n: number,
): Array<"yes" | "no"> {
  if (n <= 0) return [];
  if (answer === "YES") return Array.from({ length: n }, () => "yes");
  if (answer === "NO") {
    // Fail mid-stack so the tree still walks a few gates
    const failAt = Math.min(n - 1, Math.max(1, Math.floor(n / 2)));
    return Array.from({ length: n }, (_, i) => (i < failAt ? "yes" : "no"));
  }
  // KINDA: pass early, fail late
  const hinge = Math.max(1, Math.ceil(n * 0.6));
  return Array.from({ length: n }, (_, i) => (i < hinge ? "yes" : "no"));
}

function short(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
