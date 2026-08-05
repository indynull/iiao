export type SubjectKind = "url" | "claim" | "empty";

export type Criterion = {
  id: string;
  label: string;
  weight: number;
  score: number;
  note: string;
  axis: string;
};

export type TreeNode = {
  id: string;
  label: string;
  detail?: string;
  outcome?: "yes" | "no" | "chaos" | "leaf";
  children?: TreeNode[];
};

export type PipelineStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "warn";
  ms: number;
  blurb: string;
};

export type Analysis = {
  subject: string;
  kind: SubjectKind;
  host: string | null;
  seed: string;
  caseId: string;
  confidence: number;
  verdict: string;
  subtitle: string;
  stamp: string;
  criteria: Criterion[];
  tree: TreeNode;
  radar: { axis: string; value: number }[];
  timeline: { t: string; event: string }[];
  redFlags: string[];
  endorsements: string[];
  methodology: string[];
  probe?: ProbeResult | null;
};

export type ProbeResult = {
  ok: boolean;
  status?: number;
  title?: string;
  description?: string;
  finalUrl?: string;
  bytes?: number;
  error?: string;
};
