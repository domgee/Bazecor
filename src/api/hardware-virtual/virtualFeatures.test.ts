import { describe, expect, test, vi } from "vitest";
import { MAX_COMBO_MEMBERS, MAX_COMBOS } from "@Renderer/types/combos";
import { VirtualType } from "@Renderer/types/virtual";
import { isLegacyCombosReply, parseCombosRaw } from "../parsers/combos";
import { virtualFeatures } from "./features";
import { DefyWired, DefyWireless, Raise2ANSI, Raise2ISO, RaiseANSI, SonseiWireless, addMissingVirtualCommands } from ".";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const FEATURE_COMMANDS = Object.keys(virtualFeatures);

/* A file as it was saved before Combos, Autoshift and CapsWord existed. */
const savedBeforeFeatures = (template: VirtualType): VirtualType => {
  const vk: VirtualType = JSON.parse(JSON.stringify(template));
  FEATURE_COMMANDS.forEach(c => delete vk.virtual[c]);
  vk.virtual.help.data = vk.virtual.help.data
    .split("\r\n")
    .filter(c => !FEATURE_COMMANDS.includes(c))
    .join("\r\n");
  return vk;
};

describe("virtual keyboards support Combos, Autoshift and CapsWord", () => {
  test("covers all three features", () => {
    expect(FEATURE_COMMANDS).toEqual(
      expect.arrayContaining(["combos.map", "combos.window", "combos.idleTime", "autoshift.timeout", "capsword.timeout"]),
    );
  });

  test.each([
    ["Defy wired", DefyWired],
    ["Defy wireless", DefyWireless],
    ["Sonsei", SonseiWireless],
    ["Raise 2 ANSI", Raise2ANSI],
    ["Raise 2 ISO", Raise2ISO],
  ])("%s has the commands, listed in help", (_, template) => {
    FEATURE_COMMANDS.forEach(c => {
      expect(template.virtual[c]?.eraseable).toBe(true);
      expect(template.virtual.help.data.split("\r\n")).toContain(c);
    });
  });

  test("the empty combos.map reads as the current format with no combos", () => {
    const raw = DefyWireless.virtual["combos.map"].data;
    expect(raw.split(" ")).toHaveLength(1 + MAX_COMBOS * (MAX_COMBO_MEMBERS + 3));
    expect(isLegacyCombosReply(raw)).toBe(false);
    expect(parseCombosRaw(raw)).toEqual([]);
  });

  test("Autoshift and CapsWord start on, with the firmware's timeouts", () => {
    expect(SonseiWireless.virtual["autoshift.enabled"].data).toBe("1");
    expect(SonseiWireless.virtual["autoshift.timeout"].data).toBe("175");
    expect(SonseiWireless.virtual["capsword.enabled"].data).toBe("1");
    expect(SonseiWireless.virtual["capsword.timeout"].data).toBe("5000");
  });

  test("the combo window starts at the firmware's 50 ms default", () => {
    expect(SonseiWireless.virtual["combos.window"].data).toBe("50");
  });

  test("the Raise 1 has none of them", () => {
    FEATURE_COMMANDS.forEach(c => expect(RaiseANSI.virtual[c]).toBeUndefined());
  });
});

describe("addMissingVirtualCommands", () => {
  test("adds the features to a Sonsei file saved before them, keeping its own values", () => {
    const vk = savedBeforeFeatures(SonseiWireless);
    vk.virtual["keymap.custom"].data = "1 2 3";

    expect(addMissingVirtualCommands(vk).sort()).toEqual([...FEATURE_COMMANDS].sort());
    FEATURE_COMMANDS.forEach(c => {
      expect(vk.virtual[c].data).toBe(SonseiWireless.virtual[c].data);
      expect(vk.virtual.help.data.split("\r\n")).toContain(c);
    });
    expect(vk.virtual["keymap.custom"].data).toBe("1 2 3");
  });

  test("never touches values a file already has", () => {
    const vk: VirtualType = JSON.parse(JSON.stringify(Raise2ANSI));
    vk.virtual["combos.window"].data = "42";
    vk.virtual["autoshift.timeout"].data = "250";
    expect(addMissingVirtualCommands(vk)).toEqual([]);
    expect(vk.virtual["combos.window"].data).toBe("42");
    expect(vk.virtual["autoshift.timeout"].data).toBe("250");
  });

  test("gives a Raise 1 file nothing it can't run", () => {
    const vk: VirtualType = JSON.parse(JSON.stringify(RaiseANSI));
    expect(addMissingVirtualCommands(vk)).toEqual([]);
  });
});

describe("Hold until layer change marker", () => {
  test("the Sonsei lists layerhold.state in help and never erases it", () => {
    expect(SonseiWireless.virtual.help.data.split("\r\n")).toContain("layerhold.state");
    expect(SonseiWireless.virtual["layerhold.state"].eraseable).toBe(false);
  });

  test.each([
    ["Defy wireless", DefyWireless],
    ["Raise 2 ANSI", Raise2ANSI],
  ])("the %s does not", (_, template) => {
    expect(template.virtual.help.data.split("\r\n")).not.toContain("layerhold.state");
    expect(template.virtual["layerhold.state"]).toBeUndefined();
  });

  test("addMissingVirtualCommands adds it to a Sonsei file saved before it", () => {
    const vk: VirtualType = JSON.parse(JSON.stringify(SonseiWireless));
    delete vk.virtual["layerhold.state"];
    vk.virtual.help.data = vk.virtual.help.data
      .split("\r\n")
      .filter(c => c !== "layerhold.state")
      .join("\r\n");

    const added = addMissingVirtualCommands(vk);

    expect(added).toEqual(["layerhold.state"]);
    expect(vk.virtual.help.data.split("\r\n")).toContain("layerhold.state");
  });
});

describe("swap hands marker", () => {
  test("the Sonsei lists swaphands.state in help and never erases it", () => {
    expect(SonseiWireless.virtual.help.data.split("\r\n")).toContain("swaphands.state");
    expect(SonseiWireless.virtual["swaphands.state"].eraseable).toBe(false);
  });

  test.each([
    ["Defy wireless", DefyWireless],
    ["Raise 2 ANSI", Raise2ANSI],
  ])("the %s does not", (_, template) => {
    expect(template.virtual.help.data.split("\r\n")).not.toContain("swaphands.state");
    expect(template.virtual["swaphands.state"]).toBeUndefined();
  });

  test("addMissingVirtualCommands adds it to a Sonsei file saved before it", () => {
    const vk: VirtualType = JSON.parse(JSON.stringify(SonseiWireless));
    delete vk.virtual["swaphands.state"];
    vk.virtual.help.data = vk.virtual.help.data
      .split("\r\n")
      .filter(c => c !== "swaphands.state")
      .join("\r\n");

    const added = addMissingVirtualCommands(vk);

    expect(added).toEqual(["swaphands.state"]);
    expect(vk.virtual.help.data.split("\r\n")).toContain("swaphands.state");
  });
});

describe("repeat key marker", () => {
  test("the Sonsei lists repeatkey.state in help and never erases it", () => {
    expect(SonseiWireless.virtual.help.data.split("\r\n")).toContain("repeatkey.state");
    expect(SonseiWireless.virtual["repeatkey.state"].eraseable).toBe(false);
  });

  test.each([
    ["Defy wireless", DefyWireless],
    ["Raise 2 ANSI", Raise2ANSI],
  ])("the %s does not", (_, template) => {
    expect(template.virtual.help.data.split("\r\n")).not.toContain("repeatkey.state");
    expect(template.virtual["repeatkey.state"]).toBeUndefined();
  });

  test("addMissingVirtualCommands adds it to a Sonsei file saved before it", () => {
    const vk: VirtualType = JSON.parse(JSON.stringify(SonseiWireless));
    delete vk.virtual["repeatkey.state"];
    vk.virtual.help.data = vk.virtual.help.data
      .split("\r\n")
      .filter(c => c !== "repeatkey.state")
      .join("\r\n");

    const added = addMissingVirtualCommands(vk);

    expect(added).toEqual(["repeatkey.state"]);
    expect(vk.virtual.help.data.split("\r\n")).toContain("repeatkey.state");
  });
});

describe("previous-key rules", () => {
  test("the Sonsei lists altrepeat.map in help, erasable and empty", () => {
    expect(SonseiWireless.virtual.help.data.split("\r\n")).toContain("altrepeat.map");
    expect(SonseiWireless.virtual["altrepeat.map"].eraseable).toBe(true);
    expect(SonseiWireless.virtual["altrepeat.map"].data).toBe("0");
  });

  test.each([
    ["Defy wireless", DefyWireless],
    ["Raise 2 ANSI", Raise2ANSI],
  ])("the %s does not", (_, template) => {
    expect(template.virtual.help.data.split("\r\n")).not.toContain("altrepeat.map");
    expect(template.virtual["altrepeat.map"]).toBeUndefined();
  });

  test("addMissingVirtualCommands adds it to a Sonsei file saved before it", () => {
    const vk: VirtualType = JSON.parse(JSON.stringify(SonseiWireless));
    delete vk.virtual["altrepeat.map"];
    vk.virtual.help.data = vk.virtual.help.data
      .split("\r\n")
      .filter(c => c !== "altrepeat.map")
      .join("\r\n");

    const added = addMissingVirtualCommands(vk);

    expect(added).toEqual(["altrepeat.map"]);
    expect(vk.virtual.help.data.split("\r\n")).toContain("altrepeat.map");
  });
});

describe("key overrides", () => {
  test("the Sonsei lists keyoverrides.map in help, erasable and empty", () => {
    expect(SonseiWireless.virtual.help.data.split("\r\n")).toContain("keyoverrides.map");
    expect(SonseiWireless.virtual["keyoverrides.map"].eraseable).toBe(true);
    expect(SonseiWireless.virtual["keyoverrides.map"].data).toBe("0");
  });

  test.each([
    ["Defy wireless", DefyWireless],
    ["Raise 2 ANSI", Raise2ANSI],
  ])("the %s does not", (_, template) => {
    expect(template.virtual.help.data.split("\r\n")).not.toContain("keyoverrides.map");
    expect(template.virtual["keyoverrides.map"]).toBeUndefined();
  });

  test("addMissingVirtualCommands adds it to a Sonsei file saved before it", () => {
    const vk: VirtualType = JSON.parse(JSON.stringify(SonseiWireless));
    delete vk.virtual["keyoverrides.map"];
    vk.virtual.help.data = vk.virtual.help.data
      .split("\r\n")
      .filter(c => c !== "keyoverrides.map")
      .join("\r\n");

    const added = addMissingVirtualCommands(vk);

    expect(added).toEqual(["keyoverrides.map"]);
    expect(vk.virtual.help.data.split("\r\n")).toContain("keyoverrides.map");
  });
});

describe("quick tap", () => {
  test("the Sonsei lists qukeys.quickTapTerm in help, erasable and off", () => {
    expect(SonseiWireless.virtual.help.data.split("\r\n")).toContain("qukeys.quickTapTerm");
    expect(SonseiWireless.virtual["qukeys.quickTapTerm"].eraseable).toBe(true);
    expect(SonseiWireless.virtual["qukeys.quickTapTerm"].data).toBe("0");
  });

  test.each([
    ["Defy wireless", DefyWireless],
    ["Raise 2 ANSI", Raise2ANSI],
  ])("the %s does not", (_, template) => {
    expect(template.virtual.help.data.split("\r\n")).not.toContain("qukeys.quickTapTerm");
    expect(template.virtual["qukeys.quickTapTerm"]).toBeUndefined();
  });

  test("addMissingVirtualCommands adds it to a Sonsei file saved before it", () => {
    const vk: VirtualType = JSON.parse(JSON.stringify(SonseiWireless));
    delete vk.virtual["qukeys.quickTapTerm"];
    vk.virtual.help.data = vk.virtual.help.data
      .split("\r\n")
      .filter(c => c !== "qukeys.quickTapTerm")
      .join("\r\n");

    const added = addMissingVirtualCommands(vk);

    expect(added).toEqual(["qukeys.quickTapTerm"]);
    expect(vk.virtual.help.data.split("\r\n")).toContain("qukeys.quickTapTerm");
  });
});

describe("dual-function options", () => {
  test("the Sonsei lists both commands in help, erasable and off", () => {
    expect(SonseiWireless.virtual.help.data.split("\r\n")).toEqual(
      expect.arrayContaining(["qukeys.dualFunction", "qukeys.perKey"]),
    );
    expect(SonseiWireless.virtual["qukeys.dualFunction"]).toEqual({ data: "0 0 0 0 0 0 0", eraseable: true });
    expect(SonseiWireless.virtual["qukeys.perKey"]).toEqual({ data: "0", eraseable: true });
  });

  test.each([
    ["Defy wireless", DefyWireless],
    ["Raise 2 ANSI", Raise2ANSI],
  ])("the %s does not", (_, template) => {
    expect(template.virtual.help.data.split("\r\n")).not.toContain("qukeys.dualFunction");
    expect(template.virtual.help.data.split("\r\n")).not.toContain("qukeys.perKey");
    expect(template.virtual["qukeys.dualFunction"]).toBeUndefined();
    expect(template.virtual["qukeys.perKey"]).toBeUndefined();
  });

  test("addMissingVirtualCommands adds both to a Sonsei file saved before them", () => {
    const vk: VirtualType = JSON.parse(JSON.stringify(SonseiWireless));
    delete vk.virtual["qukeys.dualFunction"];
    delete vk.virtual["qukeys.perKey"];
    vk.virtual.help.data = vk.virtual.help.data
      .split("\r\n")
      .filter(c => c !== "qukeys.dualFunction" && c !== "qukeys.perKey")
      .join("\r\n");

    const added = addMissingVirtualCommands(vk);

    expect(added).toEqual(["qukeys.dualFunction", "qukeys.perKey"]);
    expect(vk.virtual.help.data.split("\r\n")).toEqual(expect.arrayContaining(["qukeys.dualFunction", "qukeys.perKey"]));
  });
});

describe("conditional layers", () => {
  test("the Sonsei lists conditional.map in help, erasable and empty", () => {
    expect(SonseiWireless.virtual.help.data.split("\r\n")).toContain("conditional.map");
    expect(SonseiWireless.virtual["conditional.map"].eraseable).toBe(true);
    expect(SonseiWireless.virtual["conditional.map"].data).toBe("0");
  });

  test.each([
    ["Defy wireless", DefyWireless],
    ["Raise 2 ANSI", Raise2ANSI],
  ])("the %s does not", (_, template) => {
    expect(template.virtual.help.data.split("\r\n")).not.toContain("conditional.map");
    expect(template.virtual["conditional.map"]).toBeUndefined();
  });

  test("addMissingVirtualCommands adds it to a Sonsei file saved before it", () => {
    const vk: VirtualType = JSON.parse(JSON.stringify(SonseiWireless));
    delete vk.virtual["conditional.map"];
    vk.virtual.help.data = vk.virtual.help.data
      .split("\r\n")
      .filter(c => c !== "conditional.map")
      .join("\r\n");

    const added = addMissingVirtualCommands(vk);

    expect(added).toEqual(["conditional.map"]);
    expect(vk.virtual.help.data.split("\r\n")).toContain("conditional.map");
  });
});

describe("macro upgrade marker", () => {
  test("the Sonsei lists macros.state in help and never erases it", () => {
    expect(SonseiWireless.virtual.help.data.split("\r\n")).toContain("macros.state");
    expect(SonseiWireless.virtual["macros.state"]).toEqual({ data: "0 0", eraseable: false });
  });

  test.each([
    ["Defy wireless", DefyWireless],
    ["Raise 2 ANSI", Raise2ANSI],
  ])("the %s does not", (_, template) => {
    expect(template.virtual.help.data.split("\r\n")).not.toContain("macros.state");
    expect(template.virtual["macros.state"]).toBeUndefined();
  });

  test("addMissingVirtualCommands adds it to a Sonsei file saved before it", () => {
    const vk: VirtualType = JSON.parse(JSON.stringify(SonseiWireless));
    delete vk.virtual["macros.state"];
    vk.virtual.help.data = vk.virtual.help.data
      .split("\r\n")
      .filter(c => c !== "macros.state")
      .join("\r\n");

    const added = addMissingVirtualCommands(vk);

    expect(added).toEqual(["macros.state"]);
    expect(vk.virtual.help.data.split("\r\n")).toContain("macros.state");
  });
});

describe("held modifiers of partial layer holds", () => {
  test("the Sonsei lists holdmods.map in help, erasable and empty", () => {
    expect(SonseiWireless.virtual.help.data.split("\r\n")).toContain("holdmods.map");
    expect(SonseiWireless.virtual["holdmods.map"]).toEqual({ data: "0", eraseable: true });
  });

  test.each([
    ["Defy wireless", DefyWireless],
    ["Raise 2 ANSI", Raise2ANSI],
  ])("the %s does not", (_, template) => {
    expect(template.virtual.help.data.split("\r\n")).not.toContain("holdmods.map");
    expect(template.virtual["holdmods.map"]).toBeUndefined();
  });

  test("addMissingVirtualCommands adds it to a Sonsei file saved before it", () => {
    const vk: VirtualType = JSON.parse(JSON.stringify(SonseiWireless));
    delete vk.virtual["holdmods.map"];
    vk.virtual.help.data = vk.virtual.help.data
      .split("\r\n")
      .filter(c => c !== "holdmods.map")
      .join("\r\n");

    const added = addMissingVirtualCommands(vk);

    expect(added).toEqual(["holdmods.map"]);
    expect(vk.virtual["holdmods.map"]).toEqual({ data: "0", eraseable: true });
    expect(vk.virtual.help.data.split("\r\n")).toContain("holdmods.map");
  });
});

describe("unique Superkeys marker", () => {
  test("the Sonsei lists superkeys.unique in help, replies 1 and never erases it", () => {
    expect(SonseiWireless.virtual.help.data.split("\r\n")).toContain("superkeys.unique");
    expect(SonseiWireless.virtual["superkeys.unique"]).toEqual({ data: "1", eraseable: false });
  });

  test.each([
    ["Defy wireless", DefyWireless],
    ["Raise 2 ANSI", Raise2ANSI],
  ])("the %s does not", (_, template) => {
    expect(template.virtual.help.data.split("\r\n")).not.toContain("superkeys.unique");
    expect(template.virtual["superkeys.unique"]).toBeUndefined();
  });

  test("addMissingVirtualCommands adds it to a Sonsei file saved before it", () => {
    const vk: VirtualType = JSON.parse(JSON.stringify(SonseiWireless));
    delete vk.virtual["superkeys.unique"];
    vk.virtual.help.data = vk.virtual.help.data
      .split("\r\n")
      .filter(c => c !== "superkeys.unique")
      .join("\r\n");

    const added = addMissingVirtualCommands(vk);

    expect(added).toEqual(["superkeys.unique"]);
    expect(vk.virtual.help.data.split("\r\n")).toContain("superkeys.unique");
  });
});
