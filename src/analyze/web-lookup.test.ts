import { describe, it, expect } from "vitest";
import { noteRelevant } from "./web-lookup";

describe("web lookup relevance", () => {
  it("rejects death-list blurbs for a personal name", () => {
    expect(
      noteRelevant(
        "Eliska Elaine Que",
        "The following is a list of notable deaths in January 2025.",
      ),
    ).toBe(false);
    expect(
      noteRelevant(
        "Ada Lovelace",
        "Augusta Ada King, Countess of Lovelace was an English mathematician.",
      ),
    ).toBe(true);
  });
});
