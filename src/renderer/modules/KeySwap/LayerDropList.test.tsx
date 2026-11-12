import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import LayerDropList from "./LayerDropList";
import { SwapListAnchor } from "./keySwap";
import { KEY_SWAP_LAYER_ATTR } from "./swapDrag";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const anchor: SwapListAnchor = { top: 100, left: 800, width: 240, maxHeight: 500, compact: false };

const layers = [
  { id: 2, number: 1, name: "Base" },
  { id: 4, number: 3, name: "" },
];

describe("LayerDropList", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders into the body at the anchor", () => {
    const { container } = render(<LayerDropList layers={layers} displayed={2} source={2} anchor={anchor} />);

    const list = screen.getByRole("listbox", { name: "Swap keys" });

    expect(container.childElementCount).toBe(0);
    expect(list.parentElement).toBe(document.body);
    expect([list.style.top, list.style.left, list.style.width, list.style.maxHeight]).toEqual([
      "100px",
      "800px",
      "240px",
      "500px",
    ]);
  });

  test("numbers the rows as the layer selector does, names them and marks the displayed layer", () => {
    render(<LayerDropList layers={layers} displayed={4} source={2} anchor={anchor} />);

    const rows = screen.getAllByRole("option");

    expect(rows.map(row => row.textContent)).toEqual(["#1.BaseStart", "#3.No name"]);
    expect(rows.map(row => row.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(rows.map(row => row.getAttribute(KEY_SWAP_LAYER_ATTR))).toEqual(["2", "4"]);
  });

  test("shows only numbers in a compact list, with the name as title", () => {
    render(<LayerDropList layers={layers} displayed={2} source={4} anchor={{ ...anchor, compact: true }} />);

    const rows = screen.getAllByRole("option");

    expect(rows.map(row => row.textContent)).toEqual(["#1.", "#3."]);
    expect(rows.map(row => row.getAttribute("title"))).toEqual(["Base", "No name"]);
    expect(within(rows[1]).queryByLabelText("Start")).not.toBeNull();
    expect(screen.queryByText("Hover a layer to show it. Drop on a key to swap.")).toBeNull();
  });
});
