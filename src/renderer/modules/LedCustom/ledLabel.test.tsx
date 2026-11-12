import React from "react";
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { ledKeyLabel, withLedLabel } from "./ledLabel";

const SLOT_1 = 17155;
const SLOT_2 = 17156;
const SLOT_3 = 17157;
const table = [
  { type: 1, r: 0, g: 128, b: 255, speed: 0 },
  { type: 2, r: 0, g: 0, b: 0, speed: 40 },
  { type: 0, r: 0, g: 0, b: 0, speed: 0 },
];

describe("ledKeyLabel", () => {
  test("names a slot by its effect", () => {
    expect(ledKeyLabel(SLOT_2, table)).toBe("Rainbow");
  });

  test("draws Solid with a dot in its colour", () => {
    const { container } = render(<>{ledKeyLabel(SLOT_1, table)}</>);

    expect(container.textContent).toBe("Solid");
    expect((container.querySelector("span span") as HTMLElement).style.background).toBe("rgb(0, 128, 255)");
  });

  test("keeps the static label for an unused slot, an unknown table and other keys", () => {
    expect([ledKeyLabel(SLOT_3, table), ledKeyLabel(SLOT_1, null), ledKeyLabel(4, table)]).toEqual([null, null, null]);
  });
});

describe("withLedLabel", () => {
  test("replaces only the label of a slot key", () => {
    const key = { keyCode: SLOT_2, label: "SLOT 2", extraLabel: "LED" };
    const other = { keyCode: 4, label: "A" };

    expect([withLedLabel(key, table), withLedLabel(other, table)]).toEqual([{ ...key, label: "Rainbow" }, other]);
  });
});
