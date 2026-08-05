import { describe, expect, it } from "vitest";
import { analyze } from "./engine";
import type { ProbeResult } from "./types";
import { encodeSubject, decodeSubject, reportPath } from "../routes";

const cfProbe: ProbeResult = {
  ok: true,
  status: 200,
  title: "Cloudflare",
  description: "Cloud platform CDN edge workers pricing enterprise dashboard",
  finalUrl: "https://www.cloudflare.com/",
  host: "www.cloudflare.com",
  textSample:
    "cloud platform edge serverless CDN enterprise pricing dashboard get started free trial platform ecosystem",
  signals: {
    os: 2,
    kernel: 0,
    hardware: 0,
    schedule: 0,
    platform: 5,
    saas: 4,
    browser: 0,
    cloud: 6,
    pricing: 3,
    openSource: 0,
    security: 2,
    ai: 0,
  },
};

describe("single-serving comedy", () => {
  it("shoe is YES with a short line", () => {
    const a = analyze("a shoe");
    expect(a.verdict).toBe("YES");
    expect(a.confidence).toBeGreaterThan(70);
    expect(a.subtitle.length).toBeGreaterThan(10);
    expect(a.subtitle.length).toBeLessThan(160);
  });

  it("cloudflare is NO and lower than a shoe", () => {
    const shoe = analyze("a shoe");
    const cf = analyze("https://www.cloudflare.com/", cfProbe);
    expect(cf.verdict).toBe("NO");
    expect(cf.confidence).toBeLessThan(shoe.confidence);
  });

  it("kernel.org is YES", () => {
    const a = analyze("https://kernel.org/", {
      ok: true,
      title: "The Linux Kernel Archives",
      host: "kernel.org",
      textSample: "linux kernel operating system source",
      signals: {
        os: 2,
        kernel: 8,
        hardware: 2,
        schedule: 1,
        platform: 0,
        saas: 0,
        browser: 0,
        cloud: 0,
        pricing: 0,
        openSource: 5,
        security: 0,
        ai: 0,
      },
    });
    expect(a.verdict).toBe("YES");
    expect(a.confidence).toBeGreaterThan(85);
  });

  it("is deterministic", () => {
    expect(analyze("my toaster").subtitle).toBe(analyze("my toaster").subtitle);
  });
});

describe("permalink", () => {
  it("round-trips", () => {
    const s = "a shoe";
    expect(decodeSubject(encodeSubject(s))).toBe(s);
    expect(reportPath(s).startsWith("/is/")).toBe(true);
  });
});
