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
    "Cloudflare is a global cloud platform. Workers serverless edge compute. CDN network. Enterprise pricing. Dashboard. Security. Platform ecosystem. Get started free trial. Operating system for the cloud.",
  signals: {
    os: 2,
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

describe("analyze comedy model", () => {
  it("rates a shoe higher than Cloudflare marketing OS energy", () => {
    const shoe = analyze("a shoe");
    const cf = analyze("https://www.cloudflare.com/", cfProbe);
    expect(shoe.confidence).toBeGreaterThan(cf.confidence);
    expect(shoe.confidence).toBeGreaterThan(70);
    expect(cf.confidence).toBeLessThan(45);
    expect(shoe.verdict.toLowerCase()).toMatch(/operating system|os/);
    expect(shoe.roast.join(" ").toLowerCase()).toMatch(/sole|lace|step|boot|toe|kernel|schedul/);
  });

  it("still recognizes kernel.org as a real OS", () => {
    const kernel = analyze("https://kernel.org/", kernelProbe);
    expect(kernel.confidence).toBeGreaterThan(80);
    expect(kernel.verdict.toLowerCase()).toMatch(/real os|linux|kernel/);
  });

  it("is deterministic for the same subject + probe", () => {
    const a = analyze("https://www.cloudflare.com/", cfProbe);
    const b = analyze("https://www.cloudflare.com/", cfProbe);
    expect(a.confidence).toBe(b.confidence);
    expect(a.verdict).toBe(b.verdict);
    expect(a.roast).toEqual(b.roast);
  });

  it("toaster gets far-fetched OS analogies", () => {
    const a = analyze("my toaster");
    expect(a.confidence).toBeGreaterThan(70);
    expect(a.roast.some((l) => /toast|heat|crumb|bread|pop/i.test(l))).toBe(true);
  });

  it("decision tree ends with a call", () => {
    const a = analyze("a shoe");
    const walk = (n: typeof a.tree): string[] => {
      const out = [n.label];
      for (const c of n.children ?? []) out.push(...walk(c));
      return out;
    };
    expect(walk(a.tree).join(" ")).toMatch(/OS/i);
  });
});

describe("permalink codec", () => {
  it("round-trips subjects", () => {
    const s = "https://www.gnu.org/software/emacs/";
    expect(decodeSubject(encodeSubject(s))).toBe(s);
    expect(reportPath(s).startsWith("/is/")).toBe(true);
  });
});
