import { describe, expect, it } from "vitest";
import { analyze } from "./engine";
import type { ProbeResult } from "./types";
import { encodeSubject, decodeSubject, reportPath } from "../routes";

const cfProbe: ProbeResult = {
  ok: true,
  status: 200,
  title: "Cloudflare — The Web Performance & Security Company",
  description:
    "Cloudflare provides CDN, DNS, DDoS protection and security. Connect your website to the edge platform. Pricing plans for enterprise.",
  finalUrl: "https://www.cloudflare.com/",
  host: "www.cloudflare.com",
  headings: ["Connect, protect, and build everywhere", "Why Cloudflare", "Pricing"],
  textSample:
    "Cloudflare is a global cloud platform. Workers serverless edge compute. CDN network. Enterprise pricing. Dashboard. Security. Platform ecosystem. Get started free trial.",
  signals: {
    os: 0,
    kernel: 0,
    hardware: 0,
    schedule: 1,
    platform: 4,
    saas: 5,
    browser: 1,
    cloud: 6,
    pricing: 3,
    openSource: 0,
    security: 3,
    ai: 0,
  },
};

const kernelProbe: ProbeResult = {
  ok: true,
  status: 200,
  title: "The Linux Kernel Archives",
  description: "This is the primary site for the Linux kernel source.",
  finalUrl: "https://kernel.org/",
  host: "kernel.org",
  headings: ["Latest Release", "Kernel", "Documentation"],
  textSample:
    "The Linux kernel. Download the source. Operating system kernel for hardware. Process scheduler. Device drivers. POSIX. Open source license. Syscall interface. Bare metal.",
  signals: {
    os: 2,
    kernel: 5,
    hardware: 3,
    schedule: 2,
    platform: 0,
    saas: 0,
    browser: 0,
    cloud: 0,
    pricing: 0,
    openSource: 4,
    security: 1,
    ai: 0,
  },
};

describe("analyze", () => {
  it("is deterministic for the same subject + probe", () => {
    const a = analyze("https://www.cloudflare.com/", cfProbe);
    const b = analyze("https://www.cloudflare.com/", cfProbe);
    expect(a.confidence).toBe(b.confidence);
    expect(a.verdict).toBe(b.verdict);
    expect(a.criteria.map((c) => c.score)).toEqual(b.criteria.map((c) => c.score));
    expect(a.signalStats).toEqual(b.signalStats);
  });

  it("scores kernel.org higher than a SaaS cloud marketing page", () => {
    const kernel = analyze("https://kernel.org/", kernelProbe);
    const cf = analyze("https://www.cloudflare.com/", cfProbe);
    expect(kernel.confidence).toBeGreaterThan(cf.confidence);
    expect(kernel.criteria.find((c) => c.id === "kernel")!.score).toBeGreaterThan(
      cf.criteria.find((c) => c.id === "kernel")!.score,
    );
  });

  it("exposes real signal counts and confidence steps", () => {
    const a = analyze("https://kernel.org/", kernelProbe);
    expect(a.signalStats.find((s) => s.key === "kernel")?.count).toBe(5);
    expect(a.confidenceSteps.length).toBeGreaterThan(0);
    expect(a.confidenceSteps[0]!.label).toMatch(/weighted/i);
    expect(a.criteria.every((c) => c.inputs.length > 0)).toBe(true);
  });

  it("decision tree encodes measured thresholds on the taken path", () => {
    const a = analyze("https://kernel.org/", kernelProbe);
    const walk = (n: typeof a.tree): string[] => {
      const out = n.taken && n.detail ? [n.detail] : [];
      for (const c of n.children ?? []) out.push(...walk(c));
      return out;
    };
    const details = walk(a.tree).join(" | ");
    expect(details).toMatch(/kernel=/i);
    expect(details).toMatch(/confidence/i);
  });

  it("uses claim text when not a URL", () => {
    const a = analyze("emacs is basically an operating system with a bad text editor");
    expect(a.kind).toBe("claim");
    expect(a.confidence).toBeGreaterThan(40);
    expect(a.verdict.toLowerCase()).toMatch(/emacs|os/);
  });
});

describe("permalink codec", () => {
  it("round-trips subjects", () => {
    const s = "https://www.gnu.org/software/emacs/";
    expect(decodeSubject(encodeSubject(s))).toBe(s);
    expect(reportPath(s).startsWith("/is/")).toBe(true);
  });
});
