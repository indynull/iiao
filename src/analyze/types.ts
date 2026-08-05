export type SubjectKind = "url" | "claim" | "empty";

export type Criterion = {
  id: string;
  label: string;
  weight: number;
  score: number;
  note: string;
  axis: string;
  /** Raw inputs that produced this score (for the stats panel). */
  inputs: string[];
};

export type TreeNode = {
  id: string;
  label: string;
  /** Measured evidence, e.g. "kernel=13, os=0 · threshold ≥ 1" */
  detail?: string;
  outcome?: "yes" | "no" | "question" | "leaf";
  /** Whether this node lies on the evaluated path */
  taken?: boolean;
  children?: TreeNode[];
};

export type SignalStat = {
  key: string;
  label: string;
  count: number;
};

export type ConfidenceStep = {
  label: string;
  delta: number;
  total: number;
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
  signalStats: SignalStat[];
  confidenceSteps: ConfidenceStep[];
  timeline: { t: string; event: string }[];
  redFlags: string[];
  methodology: string[];
  findings: string[];
  probe?: ProbeResult | null;
};

export type ProbeSignals = {
  os: number;
  kernel: number;
  hardware: number;
  schedule: number;
  platform: number;
  saas: number;
  browser: number;
  cloud: number;
  pricing: number;
  openSource: number;
  security: number;
  ai: number;
};

export type ProbeResult = {
  ok: boolean;
  status?: number;
  title?: string;
  description?: string;
  finalUrl?: string;
  bytes?: number;
  host?: string;
  headings?: string[];
  textSample?: string;
  phrases?: string[];
  signals?: ProbeSignals;
  error?: string;
};
