/* eslint-disable no-bitwise */
import { describe, expect, test, vi } from "vitest";
import {
  HOLD_MODS_COMMAND,
  HOLD_MODS_NORMALIZED,
  HOLD_MODS_NOT_RESTORED,
  MAX_HOLD_MODS,
  canonicalHoldSave,
  encodeHold,
  fitHoldImport,
  gcHoldMods,
  hasHoldModsCommand,
  heldMaskOf,
  holdCodeRefs,
  holdModsTargetOf,
  importHoldMods,
  layerHoldModsExport,
  parseHoldModsRaw,
  plainHoldOutputs,
  plainPartialHold,
  plainPartialHoldLayers,
  plainPartialHoldsRaw,
  readHoldMods,
  readHoldModsTarget,
  restoreHoldKeymap,
  restoreHoldMods,
  serializeHoldMods,
  validateHoldMods,
  validateHoldModsEntry,
  writeHoldMods,
  writeUncached,
} from "./holdMods";

// Cmd+Shift+Tab in slot 0 and slot 1, and its plain and legacy forms
const PARTIAL = 0x982b;
const PARTIAL_SLOT_1 = 0xb82b;
const PLAIN = 0x182b;
const LEGACY = 0x382b;
const GUI = 16;
const SHIFT = 8;

/* A keyboard that stores each table it is sent and replies with it */
const mockDevice = (stored: Record<string, string> = {}) => {
  const tables: Record<string, string> = { ...stored };
  const noCacheCommand = vi.fn(async (cmd: string, ...args: string[]): Promise<unknown> => {
    if (args.length > 0) {
      tables[cmd] = args.join(" ");
      return "";
    }

    return tables[cmd] ?? "0";
  });
  return { device: { noCacheCommand }, noCacheCommand, tables };
};

describe("hasHoldModsCommand", () => {
  test.each([
    ["version\r\nholdmods.map\r\nhelp", true], // Listed
    ["holdmods.mapX", false], // Another command
    ["", false], // Empty reply
    [undefined, false], // No reply
    [new Error(), false], // Failed request
  ])("hasHoldModsCommand(%j) is %s", (help, expected) => {
    expect(hasHoldModsCommand(help)).toBe(expected);
  });
});

describe("parseHoldModsRaw and serializeHoldMods", () => {
  test("parses a reply and serializes it sorted by code", () => {
    const parsed = parseHoldModsRaw(` 2 ${PARTIAL_SLOT_1} ${SHIFT} ${PARTIAL} ${GUI}\r\n`);

    expect(parsed).toEqual([
      { code: PARTIAL_SLOT_1, held: SHIFT },
      { code: PARTIAL, held: GUI },
    ]);
    expect(serializeHoldMods(parsed)).toBe(`2 ${PARTIAL} ${GUI} ${PARTIAL_SLOT_1} ${SHIFT}`);
  });

  test("an empty table reads and writes as 0", () => {
    expect(parseHoldModsRaw("0")).toEqual([]);
    expect(serializeHoldMods([])).toBe("0");
  });

  test.each([
    ["no reply", undefined],
    ["an empty reply", " "],
    ["a word", "error"],
    ["a missing value", `1 ${PARTIAL}`],
    ["a trailing value", `1 ${PARTIAL} ${GUI} 3`],
    ["a code above 16 bits", `1 65536 ${GUI}`],
    ["a held mask above a byte", `1 ${PARTIAL} 256`],
    ["more than 32 entries", `33${" 0 0".repeat(33)}`],
  ])("rejects %s", (_, raw) => {
    expect(parseHoldModsRaw(raw)).toBeNull();
  });
});

describe("validateHoldMods", () => {
  test.each([
    [{ code: PARTIAL, held: GUI }, null], // Cmd held, Shift tapped
    [{ code: 0x9f2b, held: 0x07 }, null], // Ctrl, Alt and AltGr held, Shift and Gui tapped
    [{ code: PARTIAL, held: 0 }, "are not modifiers"], // Nothing held
    [{ code: PARTIAL, held: 1 }, "are not modifiers"], // Ctrl is not in the shortcut
    [{ code: PARTIAL, held: GUI | SHIFT }, "holds all its modifiers"], // Every modifier held
    [{ code: 0x902b, held: GUI }, "not a partial hold"], // A single modifier
    [{ code: LEGACY, held: GUI }, "not a partial hold"], // Legacy hold
  ])("validateHoldModsEntry(%j) matches %s", (entry, expected) => {
    const invalid = validateHoldModsEntry(entry);

    if (expected === null) {
      expect(invalid).toBeNull();
    } else {
      expect(invalid).toContain(expected);
    }
  });

  test("rejects a repeated code", () => {
    expect(
      validateHoldMods([
        { code: PARTIAL, held: GUI },
        { code: PARTIAL, held: SHIFT },
      ]),
    ).toContain("repeats");
  });

  test("rejects more than 32 entries", () => {
    const list = Array.from({ length: MAX_HOLD_MODS + 1 }, (_, i) => ({ code: 0x9804 + i, held: GUI }));

    expect(validateHoldMods(list)).toContain("more than");
  });

  test("accepts both slots of one shortcut", () => {
    expect(
      validateHoldMods([
        { code: PARTIAL, held: GUI },
        { code: PARTIAL_SLOT_1, held: SHIFT },
      ]),
    ).toBeNull();
  });
});

describe("heldMaskOf", () => {
  const table = [{ code: PARTIAL, held: GUI }];

  test.each([
    [PARTIAL, GUI], // Entry
    [PARTIAL_SLOT_1, 0], // Orphan plays as the plain shortcut
    [LEGACY, GUI | SHIFT], // Legacy hold holds everything
    [PLAIN, 0], // Plain shortcut
    [54115, 0], // Autoshift a
  ])("heldMaskOf(%i) is %i", (code, expected) => {
    expect(heldMaskOf(table, code)).toBe(expected);
  });
});

describe("plain fallbacks", () => {
  test("plainPartialHold makes only partial holds plain", () => {
    expect([
      plainPartialHold(PARTIAL),
      plainPartialHold(PARTIAL_SLOT_1),
      plainPartialHold(LEGACY),
      plainPartialHold(0x902b),
    ]).toEqual([PLAIN, PLAIN, LEGACY, 0x902b]);
  });

  test("plainPartialHoldsRaw rewrites a keymap with partial holds", () => {
    expect(plainPartialHoldsRaw(`41 ${PARTIAL} ${LEGACY}\n${PARTIAL_SLOT_1} 65535 `)).toBe(
      `41 ${PLAIN} ${LEGACY} ${PLAIN} 65535`,
    );
  });

  test("plainPartialHoldsRaw returns a keymap without partial holds as it is", () => {
    const raw = `41 ${LEGACY}  65535\n`;

    expect(plainPartialHoldsRaw(raw)).toBe(raw);
  });

  test("plainHoldOutputs rewrites partial hold outputs and keeps an unchanged list", () => {
    const rules = [
      { layer: 2, position: 4, previous: 0x102b, output: PARTIAL },
      { layer: 2, position: 4, previous: 0x182b, output: LEGACY },
    ];
    const unchanged = [rules[1]];

    expect(plainHoldOutputs(rules)).toEqual([
      { layer: 2, position: 4, previous: 0x102b, output: PLAIN },
      { layer: 2, position: 4, previous: 0x182b, output: LEGACY },
    ]);
    expect(plainHoldOutputs(unchanged)).toBe(unchanged);
  });
});

describe("hold mods target", () => {
  test.each([
    [new Set([HOLD_MODS_COMMAND]), "listed"],
    [new Set(["keymap.custom"]), "unlisted"],
    [null, "unreadable"],
  ])("holdModsTargetOf(%j) is %s", (supported, expected) => {
    expect(holdModsTargetOf(supported)).toBe(expected);
  });

  test.each([
    ["listed", async (): Promise<unknown> => "keymap.custom\r\nholdmods.map"],
    ["unlisted", async (): Promise<unknown> => "keymap.custom"],
    ["unreadable", async (): Promise<unknown> => ""],
    ["unreadable", async (): Promise<unknown> => new Error("timeout")],
    ["unreadable", async (): Promise<unknown> => undefined],
    [
      "unreadable",
      async (): Promise<unknown> => {
        throw new Error("port closed");
      },
    ],
  ])("readHoldModsTarget gives %s", async (expected, reply) => {
    const noCacheCommand = vi.fn(reply);

    const target = await readHoldModsTarget({ noCacheCommand });

    expect(target).toBe(expected);
    expect(noCacheCommand.mock.calls).toEqual([["help"]]);
  });
});

describe("readHoldMods and writeHoldMods", () => {
  const TABLE = [
    { code: PARTIAL_SLOT_1, held: SHIFT },
    { code: PARTIAL, held: GUI },
  ];
  const SENT = `2 ${PARTIAL} ${GUI} ${PARTIAL_SLOT_1} ${SHIFT}`;

  test("readHoldMods reads the table uncached", async () => {
    const { device, noCacheCommand } = mockDevice({ [HOLD_MODS_COMMAND]: `1 ${PARTIAL} ${GUI}` });

    const table = await readHoldMods(device);

    expect(table).toEqual([{ code: PARTIAL, held: GUI }]);
    expect(noCacheCommand.mock.calls).toEqual([[HOLD_MODS_COMMAND]]);
  });

  test("readHoldMods gives null for a reply that is not a table", async () => {
    const { device } = mockDevice({ [HOLD_MODS_COMMAND]: "error" });

    expect(await readHoldMods(device)).toBeNull();
  });

  test("writeHoldMods writes the sorted table and reads it back", async () => {
    const { device, noCacheCommand, tables } = mockDevice();

    await writeHoldMods(device, TABLE);

    expect(noCacheCommand.mock.calls).toEqual([[HOLD_MODS_COMMAND, SENT], [HOLD_MODS_COMMAND]]);
    expect(tables[HOLD_MODS_COMMAND]).toBe(SENT);
  });

  test("writeHoldMods sends nothing for an invalid table", async () => {
    const { device, noCacheCommand } = mockDevice();

    await expect(writeHoldMods(device, [{ code: PARTIAL, held: GUI | SHIFT }])).rejects.toThrow("not sent");
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test.each([
    ["replies error", async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "error" : "0"), "rejected"],
    [
      "returns an Error",
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? new Error("timeout") : "0"),
      "timeout",
    ],
    [
      "returns undefined",
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? undefined : "0"),
      "answer",
    ],
    [
      "keeps its old table",
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "" : "0"),
      "did not store",
    ],
  ])("writeHoldMods throws when the keyboard %s", async (_, reply, message) => {
    const noCacheCommand = vi.fn(reply);

    await expect(writeHoldMods({ noCacheCommand }, TABLE)).rejects.toThrow(message);
  });

  test("a failed write reads the table again, so the cache holds what the keyboard has", async () => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "error" : "0"));

    await expect(writeHoldMods({ noCacheCommand }, TABLE)).rejects.toThrow();
    expect(noCacheCommand.mock.calls).toEqual([[HOLD_MODS_COMMAND, SENT], [HOLD_MODS_COMMAND]]);
  });
});

describe("writeUncached", () => {
  test("sends the data uncached", async () => {
    const { device, noCacheCommand } = mockDevice();

    await writeUncached(device, "keymap.custom", "1 2 3");

    expect(noCacheCommand.mock.calls).toEqual([["keymap.custom", "1 2 3"]]);
  });

  test.each([
    ["an Error", new Error("timeout"), "timeout"],
    ["undefined", undefined, "answer"],
  ])("throws on %s and reads the command again", async (_, written, message) => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? written : "0"));

    await expect(writeUncached({ noCacheCommand }, "keymap.custom", "1 2 3")).rejects.toThrow(message);
    expect(noCacheCommand.mock.calls).toEqual([["keymap.custom", "1 2 3"], ["keymap.custom"]]);
  });
});

describe("restoreHoldMods", () => {
  test("writes the backup's table on a target that lists it", async () => {
    const { device, tables } = mockDevice();

    const warning = await restoreHoldMods(device, `1 ${PARTIAL} ${GUI}`, "listed");

    expect(warning).toBeUndefined();
    expect(tables[HOLD_MODS_COMMAND]).toBe(`1 ${PARTIAL} ${GUI}`);
  });

  test.each([["unlisted"], ["unreadable"]] as const)("writes nothing and warns on an %s target", async target => {
    const { device, noCacheCommand } = mockDevice();

    const warning = await restoreHoldMods(device, `1 ${PARTIAL} ${GUI}`, target);

    expect(warning).toBe(HOLD_MODS_NOT_RESTORED);
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test("throws on a malformed entry without sending anything", async () => {
    const { device, noCacheCommand } = mockDevice();

    await expect(restoreHoldMods(device, `1 ${PARTIAL}`, "listed")).rejects.toThrow("Malformed");
    expect(noCacheCommand).not.toHaveBeenCalled();
  });
});

describe("restoreHoldKeymap", () => {
  const KEYMAP = `41 ${PARTIAL} ${LEGACY}`;

  test("writes the keymap unchanged and uncached on a target that lists the table", async () => {
    const { device, noCacheCommand } = mockDevice();
    const sendPlain = vi.fn();

    const warning = await restoreHoldKeymap(device, KEYMAP, "listed", sendPlain);

    expect(warning).toBeUndefined();
    expect(noCacheCommand.mock.calls).toEqual([["keymap.custom", KEYMAP]]);
    expect(sendPlain).not.toHaveBeenCalled();
  });

  test("throws when the keymap write fails on a target that lists the table", async () => {
    const noCacheCommand = vi.fn(
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? new Error("timeout") : "0"),
    );

    await expect(restoreHoldKeymap({ noCacheCommand }, "41 42", "listed", vi.fn())).rejects.toThrow("timeout");
  });

  test.each([["unlisted"], ["unreadable"]] as const)("makes partial holds plain and warns on an %s target", async target => {
    const { device, noCacheCommand } = mockDevice();
    const sendPlain = vi.fn();

    const warning = await restoreHoldKeymap(device, KEYMAP, target, sendPlain);

    expect(warning).toBe(HOLD_MODS_NORMALIZED);
    expect(noCacheCommand.mock.calls).toEqual([["keymap.custom", `41 ${PLAIN} ${LEGACY}`]]);
    expect(sendPlain).not.toHaveBeenCalled();
  });

  test("sends a keymap without partial holds plain on a target without the table", async () => {
    const { device, noCacheCommand } = mockDevice();
    const sendPlain = vi.fn(async () => "");

    const warning = await restoreHoldKeymap(device, `41 ${LEGACY}`, "unlisted", sendPlain);

    expect(warning).toBeUndefined();
    expect(sendPlain).toHaveBeenCalledTimes(1);
    expect(noCacheCommand).not.toHaveBeenCalled();
  });
});

// Ctrl+Alt+Shift+T in slot 0 and slot 1, a shortcut with three modifiers and so six choices of held modifiers
const CAS_T = 0x0b17;
const CAS_T_0 = 0x8b17;
const CAS_T_1 = 0xab17;
const CTRL = 1;
const ALT = 2;

/* A full table of Ctrl+Shift shortcuts, a to 4, each holding Ctrl */
const fullTable = () => Array.from({ length: MAX_HOLD_MODS }, (_, i) => ({ code: 0x8904 + i, held: CTRL }));

describe("plainPartialHoldLayers", () => {
  test("makes partial holds plain and keeps layers without them", () => {
    const layers = [[PARTIAL, LEGACY], [PARTIAL_SLOT_1]];
    const unchanged = [[LEGACY, PLAIN]];

    expect(plainPartialHoldLayers(layers)).toEqual([[PLAIN, LEGACY], [PLAIN]]);
    expect(plainPartialHoldLayers(unchanged)).toBe(unchanged);
  });
});

describe("holdCodeRefs", () => {
  const layers = [
    [PARTIAL, PLAIN, LEGACY],
    [PARTIAL_SLOT_1, PARTIAL],
  ];
  const rules = [
    { layer: 1, position: 4, previous: 6, output: CAS_T_0 },
    { layer: 1, position: 5, previous: 6, output: CAS_T_1 },
  ];

  test("collects the partial codes of cells and rule outputs", () => {
    expect(holdCodeRefs(layers, rules)).toEqual(new Set([PARTIAL, PARTIAL_SLOT_1, CAS_T_0, CAS_T_1]));
  });

  test("leaves out a skipped cell, but not the same code elsewhere", () => {
    expect(holdCodeRefs(layers, rules, { layer: 1, position: 0 })).toEqual(new Set([PARTIAL, CAS_T_0, CAS_T_1]));
    expect(holdCodeRefs(layers, rules, { layer: 1, position: 1 })).toEqual(new Set([PARTIAL, PARTIAL_SLOT_1, CAS_T_0, CAS_T_1]));
  });

  test("leaves out a skipped rule", () => {
    expect(holdCodeRefs(layers, rules, { rule: 1 })).toEqual(new Set([PARTIAL, PARTIAL_SLOT_1, CAS_T_0]));
  });
});

describe("encodeHold", () => {
  test.each([
    [PLAIN, 0, PLAIN], // None ticked
    [PLAIN, GUI | SHIFT, LEGACY], // All ticked
    [0x102b, GUI, 0x302b], // The only modifier ticked
    [0x102b, 0, 0x102b], // The only modifier unticked
    [0x2b, GUI, 0x2b], // No modifier to hold
    [LEGACY, 0, PLAIN], // A hold code is read as its shortcut
    [0x18e0, GUI, 0x18e0], // A modifier key cannot hold
  ])("encodeHold(%i, %i) gives %i and keeps the table", (shortcut, held, code) => {
    const table = [{ code: PARTIAL, held: SHIFT }];

    const encoded = encodeHold(shortcut, held, table, new Set());

    expect(encoded).toEqual({ code, table });
    expect("table" in encoded && encoded.table).toBe(table);
  });

  test("a partial choice takes slot 0 of an empty table", () => {
    expect(encodeHold(PLAIN, GUI, [], new Set())).toEqual({ code: PARTIAL, table: [{ code: PARTIAL, held: GUI }] });
  });

  test("held modifiers outside the shortcut are dropped", () => {
    expect(encodeHold(PLAIN, GUI | CTRL, [], new Set())).toEqual({ code: PARTIAL, table: [{ code: PARTIAL, held: GUI }] });
  });

  test("an entry with the same held modifiers is reused, also when in use and in slot 1", () => {
    const table = [
      { code: PARTIAL, held: SHIFT },
      { code: PARTIAL_SLOT_1, held: GUI },
    ];

    const encoded = encodeHold(PLAIN, GUI, table, new Set([PARTIAL, PARTIAL_SLOT_1]));

    expect(encoded).toEqual({ code: PARTIAL_SLOT_1, table });
    expect("table" in encoded && encoded.table).toBe(table);
  });

  test("a second choice takes slot 1 while slot 0 is in use", () => {
    const table = [{ code: PARTIAL, held: SHIFT }];

    expect(encodeHold(PLAIN, GUI, table, new Set([PARTIAL]))).toEqual({
      code: PARTIAL_SLOT_1,
      table: [
        { code: PARTIAL, held: SHIFT },
        { code: PARTIAL_SLOT_1, held: GUI },
      ],
    });
  });

  test("an entry no other key uses is rewritten in place", () => {
    const table = [{ code: PARTIAL, held: SHIFT }];

    expect(encodeHold(PLAIN, GUI, table, new Set())).toEqual({ code: PARTIAL, table: [{ code: PARTIAL, held: GUI }] });
    expect(table).toEqual([{ code: PARTIAL, held: SHIFT }]);
  });

  test("a third choice is refused while both slots are in use", () => {
    const table = [
      { code: CAS_T_0, held: CTRL },
      { code: CAS_T_1, held: ALT },
    ];

    expect(encodeHold(CAS_T, SHIFT, table, new Set([CAS_T_0, CAS_T_1]))).toEqual({ error: "slots" });
  });

  test("a protected or uncertain code in a slot is never rewritten", () => {
    const table = [
      { code: CAS_T_0, held: CTRL },
      { code: CAS_T_1, held: ALT },
    ];

    // Only the saved keymap or a failed write still uses slot 1, the draft uses slot 0
    expect(encodeHold(CAS_T, SHIFT, table, new Set([CAS_T_0, CAS_T_1]))).toEqual({ error: "slots" });
    expect(encodeHold(CAS_T, SHIFT, table, new Set([CAS_T_0]))).toEqual({
      code: CAS_T_1,
      table: [
        { code: CAS_T_0, held: CTRL },
        { code: CAS_T_1, held: SHIFT },
      ],
    });
  });

  test("an orphan cell or rule keeps its slot without an entry", () => {
    // An orphan in slot 0 plays as the plain shortcut, and an entry there would change it
    expect(encodeHold(PLAIN, GUI, [], new Set([PARTIAL]))).toEqual({
      code: PARTIAL_SLOT_1,
      table: [{ code: PARTIAL_SLOT_1, held: GUI }],
    });
    expect(encodeHold(PLAIN, GUI, [], new Set([PARTIAL, PARTIAL_SLOT_1]))).toEqual({ error: "slots" });
  });

  test("a full table drops unused entries before it adds one", () => {
    const table = fullTable();
    const used = new Set(table.slice(1).map(entry => entry.code));

    const encoded = encodeHold(PLAIN, GUI, table, used);

    expect(encoded).toEqual({ code: PARTIAL, table: table.slice(1).concat([{ code: PARTIAL, held: GUI }]) });
  });

  test("a full table of used entries is refused", () => {
    const table = fullTable();

    expect(encodeHold(PLAIN, GUI, table, new Set(table.map(entry => entry.code)))).toEqual({ error: "capacity" });
  });
});

describe("canonicalHoldSave and gcHoldMods", () => {
  const table = [{ code: PARTIAL, held: GUI }];

  test("orphan partial codes in cells and rule outputs become plain", () => {
    const layers = [[PARTIAL, PARTIAL_SLOT_1, LEGACY]];
    const rules = [
      { layer: 1, position: 0, previous: 6, output: PARTIAL_SLOT_1 },
      { layer: 1, position: 1, previous: 6, output: PARTIAL },
    ];

    expect(canonicalHoldSave(layers, rules, table)).toEqual({
      layers: [[PARTIAL, PLAIN, LEGACY]],
      rules: [
        { layer: 1, position: 0, previous: 6, output: PLAIN },
        { layer: 1, position: 1, previous: 6, output: PARTIAL },
      ],
    });
  });

  test("a draft without orphans is returned as it is", () => {
    const layers = [[PARTIAL, LEGACY]];
    const rules = [{ layer: 1, position: 0, previous: 6, output: PARTIAL }];

    const canonical = canonicalHoldSave(layers, rules, table);

    expect(canonical.layers).toBe(layers);
    expect(canonical.rules).toBe(rules);
  });

  test("gcHoldMods drops entries no code uses and keeps a table in full use", () => {
    const both = [
      { code: PARTIAL, held: GUI },
      { code: CAS_T_0, held: CTRL },
    ];

    expect(gcHoldMods(both, new Set([PARTIAL]))).toEqual([{ code: PARTIAL, held: GUI }]);
    expect(gcHoldMods(both, new Set([PARTIAL, CAS_T_0]))).toBe(both);
  });
});

describe("layerHoldModsExport", () => {
  test("exports the entries the layer uses, sorted by code", () => {
    const table = [
      { code: PARTIAL_SLOT_1, held: GUI },
      { code: CAS_T_0, held: CTRL },
      { code: PARTIAL, held: SHIFT },
    ];

    expect(layerHoldModsExport(table, [PARTIAL_SLOT_1, PLAIN, PARTIAL, PARTIAL])).toEqual([
      { code: PARTIAL, held: SHIFT },
      { code: PARTIAL_SLOT_1, held: GUI },
    ]);
  });
});

describe("importHoldMods", () => {
  test("an identical entry is reused", () => {
    const table = [{ code: PARTIAL, held: GUI }];

    const imported = importHoldMods(table, new Set([PARTIAL]), [PARTIAL, PLAIN], [{ code: PARTIAL, held: GUI }]);

    expect(imported).toEqual({ table, remap: new Map([[PARTIAL, PARTIAL]]), normalized: false });
  });

  test("a code that means another choice here moves to the free slot", () => {
    const table = [{ code: PARTIAL, held: SHIFT }];

    const imported = importHoldMods(table, new Set([PARTIAL]), [PARTIAL], [{ code: PARTIAL, held: GUI }]);

    expect(imported).toEqual({
      table: [
        { code: PARTIAL, held: SHIFT },
        { code: PARTIAL_SLOT_1, held: GUI },
      ],
      remap: new Map([[PARTIAL, PARTIAL_SLOT_1]]),
      normalized: false,
    });
  });

  test("two imported choices of one shortcut keep apart", () => {
    const entries = [
      { code: PARTIAL, held: GUI },
      { code: PARTIAL_SLOT_1, held: SHIFT },
    ];

    expect(importHoldMods([], new Set(), [PARTIAL_SLOT_1, PARTIAL], entries)).toEqual({
      table: entries,
      remap: new Map([
        [PARTIAL, PARTIAL],
        [PARTIAL_SLOT_1, PARTIAL_SLOT_1],
      ]),
      normalized: false,
    });
  });

  test("an entry only the replaced layer used is rewritten", () => {
    // Leave slot 0 out of used, since only the replaced layer used it
    const imported = importHoldMods([{ code: PARTIAL, held: SHIFT }], new Set(), [PARTIAL], [{ code: PARTIAL, held: GUI }]);

    expect(imported).toEqual({ table: [{ code: PARTIAL, held: GUI }], remap: new Map([[PARTIAL, PARTIAL]]), normalized: false });
  });

  test("an import with no free slot is refused", () => {
    const table = [
      { code: CAS_T_0, held: CTRL },
      { code: CAS_T_1, held: ALT },
    ];

    expect(importHoldMods(table, new Set([CAS_T_0, CAS_T_1]), [CAS_T_0], [{ code: CAS_T_0, held: SHIFT }])).toEqual({
      error: "slots",
    });
  });

  test("an import into a full table is refused", () => {
    const table = fullTable();

    expect(importHoldMods(table, new Set(table.map(entry => entry.code)), [PARTIAL], [{ code: PARTIAL, held: GUI }])).toEqual({
      error: "capacity",
    });
  });

  test("an orphan in use keeps its slot", () => {
    expect(importHoldMods([], new Set([PARTIAL]), [PARTIAL], [{ code: PARTIAL, held: GUI }])).toEqual({
      table: [{ code: PARTIAL_SLOT_1, held: GUI }],
      remap: new Map([[PARTIAL, PARTIAL_SLOT_1]]),
      normalized: false,
    });
  });

  test.each([
    [undefined], // A file from older Bazecor
    [[]], // No entry for the code
    [[{ code: PARTIAL, held: GUI | SHIFT }]], // Holds every modifier
    [[{ code: PARTIAL, held: CTRL }]], // Holds a modifier the shortcut lacks
    [[{ code: String(PARTIAL), held: GUI }]], // Not a number
    ["not a list"],
  ])("codes without a valid file entry become plain, %j", fileEntries => {
    const table = [{ code: PARTIAL, held: SHIFT }];

    expect(importHoldMods(table, new Set(), [PARTIAL, LEGACY], fileEntries)).toEqual({
      table,
      remap: new Map([[PARTIAL, PLAIN]]),
      normalized: true,
    });
  });

  test("fitHoldImport makes every partial code plain on firmware without the table", () => {
    const table = [{ code: PARTIAL, held: GUI }];

    expect(fitHoldImport(false, table, new Set(), [PARTIAL, LEGACY], [{ code: PARTIAL, held: GUI }])).toEqual({
      table,
      remap: new Map([[PARTIAL, PLAIN]]),
      normalized: true,
    });
    expect(fitHoldImport(false, table, new Set(), [LEGACY], [])).toEqual({ table, remap: new Map(), normalized: false });
  });

  test("fitHoldImport fits the codes on firmware with the table", () => {
    expect(fitHoldImport(true, [], new Set(), [PARTIAL], [{ code: PARTIAL, held: GUI }])).toEqual({
      table: [{ code: PARTIAL, held: GUI }],
      remap: new Map([[PARTIAL, PARTIAL]]),
      normalized: false,
    });
  });
});
