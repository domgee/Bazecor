import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { SlotLabels } from "./action-labels";
import { superkeySlots } from "./key-label";

const renderSlots = (slots: SlotLabels, rotation = 0) =>
  render(<svg>{superkeySlots(100, 100, 24.5, slots, "#fff", rotation)}</svg>).container;

const slotText = (container: HTMLElement, id: string) => container.querySelector(`g[data-slot="${id}"] text`);

describe("superkeySlots", () => {
  test("FiveActions_TextAtEachSlot", () => {
    const container = renderSlots([{ text: "B" }, { text: "C" }, { text: "D" }, { text: "F" }, { text: "G" }]);

    const drawn = ["tap", "hold", "tapHold", "dTap", "dTapHold"].map(id => {
      const text = slotText(container, id);
      return {
        id,
        text: text?.textContent,
        x: text?.getAttribute("x"),
        y: text?.getAttribute("y"),
        anchor: text?.getAttribute("text-anchor"),
      };
    });

    expect(drawn).toEqual([
      { id: "tap", text: "B", x: "100", y: "103", anchor: "middle" },
      { id: "hold", text: "C", x: "121.5", y: "90", anchor: "end" },
      { id: "tapHold", text: "D", x: "78.5", y: "90", anchor: "start" },
      { id: "dTap", text: "F", x: "78.5", y: "116", anchor: "start" },
      { id: "dTapHold", text: "G", x: "121.5", y: "116", anchor: "end" },
    ]);
  });

  test("EmptyActions_SlotsLeftOut", () => {
    const container = renderSlots([{ text: "B" }, null, null, { text: "F" }, null]);

    const ids = [...container.querySelectorAll("g[data-slot]")].map(g => g.getAttribute("data-slot"));

    expect(ids).toEqual(["tap", "dTap"]);
  });

  test("Rotation_SlotsTurnAboutTheCentre", () => {
    const container = renderSlots([{ text: "B" }, null, null, null, null], 37);

    const rotated = container.querySelector('g[transform="rotate(37,100,100)"]');

    expect(rotated?.querySelector('g[data-slot="tap"]')).not.toBeNull();
  });

  test("LongCornerText_Cut", () => {
    const container = renderSlots([null, { text: "WWWW" }, null, null, null]);

    expect(slotText(container, "hold")?.textContent).toBe("W…");
  });

  test("IconAction_Icon", () => {
    const container = renderSlots([{ text: "", icon: "play-pause" }, null, null, null, null]);

    expect(container.querySelector('g[data-slot="tap"] svg')).not.toBeNull();
  });
});
