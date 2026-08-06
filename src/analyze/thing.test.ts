import { describe, expect, it } from "vitest";
import { resolveThing } from "./thing";

describe("resolveThing", () => {
  it("pulls Cloudflare OS from a blog slug, not the article framing", () => {
    const r = resolveThing(
      "https://blog.cloudflare.com/how-we-use-ai-with-cloudflare-os/",
    );
    expect(r.thing.toLowerCase()).toContain("cloudflare");
    expect(r.thing.toLowerCase()).toMatch(/\bos\b/);
    expect(r.thing.toLowerCase()).not.toMatch(/how we use/);
  });

  it("uses free-form claims as-is", () => {
    const r = resolveThing("a stainless steel fridge");
    expect(r.thing).toBe("a stainless steel fridge");
    expect(r.isUrl).toBe(false);
  });

  it("uses product OS from page title when probe present", () => {
    const r = resolveThing("https://blog.example.com/post", {
      ok: true,
      title: "How we use AI with Cloudflare OS",
      description: "Introducing Cloudflare OS on the edge",
      host: "blog.example.com",
    });
    expect(r.thing).toMatch(/Cloudflare OS/i);
  });

  it("pulls a person name from a résumé title, not the host alone", () => {
    const r = resolveThing("https://ali.indydevs.org/", {
      ok: true,
      title: "Ali-Akber Saifee: Résumé",
      description:
        "Software Engineer, with 15 years of experience in backend development",
      host: "ali.indydevs.org",
    });
    expect(r.thing).toMatch(/Ali-Akber Saifee/i);
    expect(r.thing.toLowerCase()).not.toBe("ali");
  });

  it("resolves LinkedIn /in/ slug to a person, not host Linkedin", () => {
    const blocked = resolveThing("https://www.linkedin.com/in/williamhgates", {
      ok: true,
      status: 999,
      host: "www.linkedin.com",
      title: undefined,
      textSample: "",
    });
    expect(blocked.thing.toLowerCase()).not.toBe("linkedin");
    expect(blocked.thing.toLowerCase()).toMatch(/william|gates/);

    const titled = resolveThing("https://www.linkedin.com/in/williamhgates", {
      ok: true,
      host: "www.linkedin.com",
      title: "Bill Gates - Chair, Gates Foundation | LinkedIn",
    });
    expect(titled.thing).toMatch(/Bill Gates/i);
  });
});
