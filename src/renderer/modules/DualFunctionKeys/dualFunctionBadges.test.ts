import { describe, expect, test } from "vitest";

import { PerKeyOverride } from "../../../api/parsers/dualFunction";
import { emptyOverride } from "./overrideTable";
import { dualFunctionBadgeBaseStyles, dualFunctionBadgeStyles } from "./dualFunctionBadges";

const withRetro = (position: number): PerKeyOverride => ({ ...emptyOverride(position), retro: true });

describe("dual-function badges", () => {
  test("style each key with an override with ::after inside the scope", () => {
    expect(dualFunctionBadgeStyles([withRetro(5), withRetro(56)], ".scope")).toBe(
      [
        '.scope [data-key-index="5"] .keyContentLabel::after { content: "DF"; }',
        '.scope [data-key-index="56"] .keyContentLabel::after { content: "DF"; }',
      ].join("\n"),
    );
  });

  test("skip an override with every field on global", () => {
    expect(dualFunctionBadgeStyles([emptyOverride(5)], ".scope")).toBe("");
  });

  test("give no styles without overrides", () => {
    expect(dualFunctionBadgeStyles([], ".scope")).toBe("");
  });

  test("scope the base style", () => {
    expect(dualFunctionBadgeBaseStyles(".scope")).toContain(".scope .keyContentLabel::after {");
  });
});
