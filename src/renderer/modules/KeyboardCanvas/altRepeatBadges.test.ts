import { describe, expect, test } from "vitest";
import { AltRepeatRule } from "@Renderer/types/altRepeat";
import { altRepeatBadgeLabels, altRepeatBadgeStyles } from "./altRepeatBadges";

const rule = (layer: number, position: number, previous: number): AltRepeatRule => ({ layer, position, previous, output: 4 });

describe("previous-key badges", () => {
  test("count the rules per key on the layer and skip other layers", () => {
    const rules = [rule(0, 5, 6), rule(0, 5, 7), rule(0, 9, 6), rule(1, 5, 6)];

    expect(altRepeatBadgeLabels(rules, 0)).toEqual(
      new Map([
        [5, "A2"],
        [9, "A1"],
      ]),
    );
  });

  test("style each key with ::before inside the scope", () => {
    expect(altRepeatBadgeStyles([rule(0, 5, 6)], 0, ".scope")).toBe(
      '.scope [data-key-index="5"] .keyContentLabel::before { content: "A1"; }',
    );
  });

  test("give no styles without rules", () => {
    expect(altRepeatBadgeStyles([], 0)).toBe("");
  });
});
