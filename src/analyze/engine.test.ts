import { describe, expect, it } from "vitest";
import { analyze } from "./engine";
import { encodeSubject, decodeSubject, reportPath } from "../routes";

describe("analyze", () => {
  it("is deterministic for the same subject", () => {
    const a = analyze("https://www.cloudflare.com/");
    const b = analyze("https://www.cloudflare.com/");
    expect(a.confidence).toBe(b.confidence);
    expect(a.verdict).toBe(b.verdict);
    expect(a.seed).toBe(b.seed);
    expect(a.caseId).toBe(b.caseId);
  });

  it("biases known OS-y subjects upward vs pure SaaS-ish strings", () => {
    const kernel = analyze("https://kernel.org/");
    const pricing = analyze("https://example.com/pricing enterprise saas dashboard");
    expect(kernel.confidence).toBeGreaterThan(20);
    expect(pricing.confidence).toBeLessThan(98);
  });
});

describe("permalink codec", () => {
  it("round-trips subjects", () => {
    const s = "https://www.gnu.org/software/emacs/";
    expect(decodeSubject(encodeSubject(s))).toBe(s);
    expect(reportPath(s).startsWith("/is/")).toBe(true);
  });
});
