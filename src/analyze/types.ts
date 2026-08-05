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
  /** Lowercased visible-ish text sample for scoring */
  textSample?: string;
  /** High-signal phrases pulled from page */
  phrases?: string[];
  signals?: ProbeSignals;
  error?: string;
};
