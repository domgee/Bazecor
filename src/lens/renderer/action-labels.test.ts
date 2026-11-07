import { describe, expect, test } from "vitest";
import type { LensMacroAction } from "../shared/types";
import {
  compactActionLabel,
  fitFontSize,
  fitMacroSubtitle,
  fitText,
  FACE_SUBTITLE_FS,
  MACRO_FACE_MAX_WIDTH,
  macroDisplayNames,
  macroKeysLabel,
  slotMaxWidth,
  superkeySlotLabels,
  textWidth,
} from "./action-labels";
import type { LabelContext, ModStyle } from "./action-labels";
import { layoutOverrides, symbolOverrides } from "./keycodes";

const ctx = (layout = "us", modStyle: ModStyle = "mac", names: Partial<LabelContext> = {}): LabelContext => ({
  overrides: layoutOverrides(layout),
  symbols: symbolOverrides(layout),
  layerNames: [],
  macroNames: [],
  superkeyNames: [],
  modStyle,
  ...names,
});

const step = (type: number, keyCode: number | number[]): LensMacroAction => ({ type, keyCode });

// Step types from the macro memory format
const KEYDOWN = 3;
const KEYUP = 4;
const TAP = 5;
const KEYCODEDOWN = 6;
const KEYCODEUP = 7;
const TAPCODE = 8;
const SEND_REPORT = 11;
const TAP_SEQUENCE = 12;
const TAP_CODE_SEQUENCE = 13;
const UNICODE = 16;
const WAIT = 2;

const LEFT_SHIFT = 225;
const LEFT_OS = 227;

const typed = (...codes: number[]) => codes.map(code => step(TAPCODE, code));

describe("compactActionLabel", () => {
  test.each([0, 1, 65535])("EmptyAction%s_Null", code => {
    expect(compactActionLabel(code, ctx())).toBeNull();
  });

  test("PlainKey_KeyLabel", () => {
    expect(compactActionLabel(4, ctx())).toEqual({ text: "A" });
  });

  test.each([
    [40, "⏎"],
    [42, "⌫"],
    [75, "PGUP"],
  ])("LongKeyName%s_ShortForm", (code, text) => {
    expect(compactActionLabel(code, ctx())).toEqual({ text });
  });

  test.each([
    [4139, "mac", "⌘TAB"], // OS+Tab
    [4139, "text", "O+TAB"],
    [2327, "mac", "⌃⇧T"], // Ctrl+Shift+T
    [2327, "text", "C+S+T"],
    [225, "mac", "⇧"], // Left Shift
    [225, "text", "Shft"],
  ] as [number, ModStyle, string][])("Modifiers%s_%sStyle", (code, modStyle, text) => {
    expect(compactActionLabel(code, ctx("us", modStyle))).toEqual({ text });
  });

  test("ShiftedSymbol_Character", () => {
    expect(compactActionLabel(2079, ctx())).toEqual({ text: "@" });
  });

  test("MediaKey_Icon", () => {
    expect(compactActionLabel(22733, ctx())).toEqual({ text: "", icon: "play-pause" });
  });

  test.each([
    [17450, "shift"], // Shift to layer 1
    [17408, "lock"], // Lock to layer 1
  ])("LayerKey%s_NumberWithHoldIcon", (code, holdIcon) => {
    expect(compactActionLabel(code, ctx())).toEqual({ text: "1", holdIcon });
  });

  test("NamedMacro_Name", () => {
    expect(compactActionLabel(53852, ctx("us", "mac", { macroNames: ["Copy"] }))).toEqual({ text: "Copy" });
  });

  test("UnnamedMacro_Number", () => {
    expect(compactActionLabel(53852, ctx())).toEqual({ text: "M1" });
  });

  test("NamedSuperkey_Name", () => {
    expect(compactActionLabel(53981, ctx("us", "mac", { superkeyNames: ["", "Nav"] }))).toEqual({ text: "Nav" });
  });

  test("UnnamedSuperkey_Number", () => {
    expect(compactActionLabel(53980, ctx("us", "mac", { superkeyNames: ["", "Nav"] }))).toEqual({ text: "SK1" });
  });

  test("TwoLineKey_BothLines", () => {
    expect(compactActionLabel(95, ctx())).toEqual({ text: "Num 7" });
  });
});

describe("macroKeysLabel", () => {
  test.each([
    ["mac", "⌘TAB"],
    ["text", "O+TAB"],
  ] as [ModStyle, string][])("ShortcutWithKeycodeSteps_%sStyle", (modStyle, label) => {
    const actions = [step(KEYCODEDOWN, LEFT_OS), step(TAPCODE, 43), step(KEYCODEUP, LEFT_OS)];

    expect(macroKeysLabel(actions, ctx("us", modStyle))).toBe(label);
  });

  test("ShortcutWithKeySteps_Shortcut", () => {
    const actions = [step(KEYDOWN, LEFT_OS), step(TAP, 43), step(KEYUP, LEFT_OS)];

    expect(macroKeysLabel(actions, ctx())).toBe("⌘TAB");
  });

  test("TypedLetters_Text", () => {
    expect(macroKeysLabel(typed(11, 8, 15, 15, 18), ctx())).toBe("hello");
  });

  test("ShiftedLetter_Uppercase", () => {
    const actions = [step(KEYCODEDOWN, LEFT_SHIFT), step(TAPCODE, 11), step(KEYCODEUP, LEFT_SHIFT), ...typed(8, 15, 15, 18)];

    expect(macroKeysLabel(actions, ctx())).toBe("Hello");
  });

  test("TextThenEnter_TextAndEnterToken", () => {
    // "hi there" followed by Enter
    expect(macroKeysLabel(typed(11, 12, 44, 23, 11, 8, 21, 8, 40), ctx())).toBe("hi there ⏎");
  });

  test.each([TAP_SEQUENCE, TAP_CODE_SEQUENCE])("TapSequence%s_Text", type => {
    expect(macroKeysLabel([step(type, [11, 12])], ctx())).toBe("hi");
  });

  test("UnicodeStep_Character", () => {
    expect(macroKeysLabel([step(UNICODE, 0x20ac)], ctx())).toBe("€");
  });

  test("LayoutSymbol_Character", () => {
    // AltGr+E is the euro sign on es-ES
    expect(macroKeysLabel([step(TAP, 1032)], ctx("es-ES"))).toBe("€");
  });

  test("LoneModifier_Modifier", () => {
    expect(macroKeysLabel([step(KEYCODEDOWN, LEFT_OS), step(KEYCODEUP, LEFT_OS)], ctx())).toBe("⌘");
  });

  test("TextThenLoneModifier_ModifierAfterText", () => {
    const actions = [step(TAPCODE, 4), step(KEYCODEDOWN, LEFT_OS), step(KEYCODEUP, LEFT_OS)];

    expect(macroKeysLabel(actions, ctx())).toBe("a ⌘");
  });

  test("ModifierHeldAtEnd_ModifierAfterText", () => {
    expect(macroKeysLabel([step(TAPCODE, 4), step(KEYCODEDOWN, LEFT_OS)], ctx())).toBe("a ⌘");
  });

  test("ShiftedArrow_Shortcut", () => {
    const actions = [step(KEYCODEDOWN, LEFT_SHIFT), step(TAPCODE, 79), step(KEYCODEUP, LEFT_SHIFT)];

    expect(macroKeysLabel(actions, ctx())).toBe("⇧→");
  });

  test("Arrows_SeparateTokens", () => {
    expect(macroKeysLabel(typed(81, 81), ctx())).toBe("↓ ↓");
  });

  test("OnlySpace_SpaceToken", () => {
    expect(macroKeysLabel(typed(44), ctx())).toBe("SPC");
  });

  test("InnerSpaces_Kept", () => {
    expect(macroKeysLabel(typed(4, 44, 44, 5), ctx())).toBe("a  b");
  });

  test("LeadingSpace_Trimmed", () => {
    expect(macroKeysLabel(typed(44, 4), ctx())).toBe("a");
  });

  test("DelayAndReportSteps_Ignored", () => {
    expect(macroKeysLabel([step(WAIT, 100), step(TAPCODE, 4), step(SEND_REPORT, 0)], ctx())).toBe("a");
  });

  test("NestedNamedMacro_Name", () => {
    expect(macroKeysLabel([step(TAP, 53853)], ctx("us", "mac", { macroNames: ["", "Paste"] }))).toBe("Paste");
  });

  test("NestedUnnamedMacro_Number", () => {
    expect(macroKeysLabel([step(TAP, 53853)], ctx())).toBe("M2");
  });

  test("MediaKey_Text", () => {
    expect(macroKeysLabel([step(TAP, 23785)], ctx())).toBe("VOL+");
  });

  test("ShortcutThenText_SeparateTokens", () => {
    // Ctrl+C as one 16-bit tap, then a
    expect(macroKeysLabel([step(TAP, 262), step(TAPCODE, 4)], ctx())).toBe("⌃C a");
  });

  test.each([
    ["unreadable", null],
    ["empty", []],
    ["delay only", [step(WAIT, 100)]],
  ] as [string, LensMacroAction[] | null][])("Macro %s_Null", (_, actions) => {
    expect(macroKeysLabel(actions, ctx())).toBeNull();
  });
});

describe("widths", () => {
  test.each([
    ["ABCD", "ABCD"],
    ["WWWW", "W…"],
    ["😀😀😀", "😀…"],
    ["😀😀", "😀😀"],
    // Two wide glyphs plus the ellipsis need 20.7, so only one fits
    ["⌘⇧TAB", "⌘…"],
  ])("FitText %s_%s", (text, fitted) => {
    const result = fitText(text, 7.5, 20.5);

    expect(result).toBe(fitted);
    expect(textWidth(result, 7.5)).toBeLessThanOrEqual(20.5);
  });

  test.each([
    ["WWWWWWWWWWWW", "WWWW…"],
    ["⌘TAB", "⌘TAB"],
    ["漢字漢字漢字漢字漢字漢字", "漢字…"],
  ])("FitMacroSubtitle %s_%s", (text, fitted) => {
    const result = fitMacroSubtitle(text);

    expect(result).toBe(fitted);
    expect(textWidth(result, fitFontSize(result, FACE_SUBTITLE_FS))).toBeLessThanOrEqual(MACRO_FACE_MAX_WIDTH);
  });

  test("SlotMaxWidth_TapSpansFaceCornersGetHalf", () => {
    expect([0, 1, 2, 3, 4].map(slot => slotMaxWidth(24.5, slot))).toEqual([43, 20.5, 20.5, 20.5, 20.5]);
  });
});

describe("superkeySlotLabels", () => {
  test("TapOnly_OneSlot", () => {
    expect(superkeySlotLabels([5, 1, 1, 1, 1], ctx())).toEqual([{ text: "B" }, null, null, null, null]);
  });

  test.each([
    ["transparent", [1, 1, 1, 1, 1]],
    ["erased", [65535, 65535, 65535, 65535, 65535]],
    ["missing", undefined],
  ] as [string, number[] | undefined][])("Superkey %s_Null", (_, actions) => {
    expect(superkeySlotLabels(actions, ctx())).toBeNull();
  });
});

describe("macroDisplayNames", () => {
  test("Macros_KeysForReadableNameOtherwise", () => {
    const macros = [
      null,
      [step(KEYCODEDOWN, LEFT_OS), step(TAPCODE, 43), step(KEYCODEUP, LEFT_OS)],
      typed(...new Array<number>(12).fill(26)),
    ];

    expect(macroDisplayNames(["Copy", "Switch", "Wide"], macros, ctx())).toEqual(["Copy", "⌘TAB", "wwww…"]);
  });
});

// The cut without a bound on the prefix length, to check the bounded one gives the same results
const unboundedFit = (text: string, fits: (candidate: string) => boolean) => {
  if (fits(text)) {
    return text;
  }

  const chars = [...text];

  for (let n = chars.length - 1; n > 0; n -= 1) {
    const prefix = chars.slice(0, n).join("").trimEnd();

    if (prefix && fits(`${prefix}…`)) {
      return `${prefix}…`;
    }
  }

  return "…";
};

// Build repeatable mixed texts with wide, narrow, emoji and CJK characters and runs of spaces
const sampleTexts = () => {
  const alphabet = [..."aWi l  .MW😀漢⌘e r"];
  let seed = 7;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed;
  };

  return Array.from({ length: 300 }, (_, i) => Array.from({ length: i % 80 }, () => alphabet[next() % alphabet.length]).join(""));
};

describe("bounded cut", () => {
  test("FitText_SameAsUnbounded", () => {
    const sizes: [number, number][] = [
      [7.5, 20.5],
      [9, 43],
      [7.5, 4],
    ];

    const mismatches = sampleTexts().flatMap(text =>
      sizes
        .filter(([fontSize, maxWidth]) => {
          const expected = unboundedFit(text, candidate => textWidth(candidate, fontSize) <= maxWidth);
          return fitText(text, fontSize, maxWidth) !== expected;
        })
        .map(size => `${text} ${size}`),
    );

    expect(mismatches).toEqual([]);
  });

  test("FitMacroSubtitle_SameAsUnbounded", () => {
    const mismatches = sampleTexts().flatMap(text =>
      [MACRO_FACE_MAX_WIDTH, 30, 80]
        .filter(maxWidth => {
          const expected = unboundedFit(
            text,
            candidate => textWidth(candidate, fitFontSize(candidate, FACE_SUBTITLE_FS)) <= maxWidth,
          );
          return fitMacroSubtitle(text, maxWidth) !== expected;
        })
        .map(maxWidth => `${text} ${maxWidth}`),
    );

    expect(mismatches).toEqual([]);
  });

  test("LongTextMacro_SameLabel", () => {
    // 2000 typed keys, "hi " repeated
    const macro = typed(...Array.from({ length: 2000 }, (_, i) => [11, 12, 44][i % 3]));

    const names = macroDisplayNames(["Long"], [macro], ctx());

    const label = macroKeysLabel(macro, ctx()) ?? "";
    const unbounded = unboundedFit(
      label,
      candidate => textWidth(candidate, fitFontSize(candidate, FACE_SUBTITLE_FS)) <= MACRO_FACE_MAX_WIDTH,
    );
    expect(names).toEqual(["hi hi hi hi…"]);
    expect(names).toEqual([unbounded]);
  });
});
