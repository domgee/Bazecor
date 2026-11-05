import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Saving from "./Saving";

describe("Saving", () => {
  afterEach(() => {
    cleanup();
  });

  const renderSaving = (saveDisabled?: boolean) =>
    render(<Saving saveContext={vi.fn()} destroyContext={vi.fn()} inContext isSaving={false} saveDisabled={saveDisabled} />);

  test("Save is enabled with changes", () => {
    renderSaving();

    expect(screen.getByRole("button", { name: /Save/ }).hasAttribute("disabled")).toBe(false);
  });

  test("saveDisabled turns Save off with changes and leaves Discard on", () => {
    renderSaving(true);

    expect(screen.getByRole("button", { name: /Save/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /Discard/ }).hasAttribute("disabled")).toBe(false);
  });
});
