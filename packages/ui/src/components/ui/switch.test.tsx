import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

describe("Switch interaction tests", () => {
  it("toggles on when clicked", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch onCheckedChange={onCheckedChange} aria-label="Toggle" />);
    await userEvent.click(screen.getByRole("switch", { name: "Toggle" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("toggles off when clicked twice", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch onCheckedChange={onCheckedChange} aria-label="Toggle" />);
    const toggle = screen.getByRole("switch", { name: "Toggle" });
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
  });

  it("does not toggle when disabled", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch onCheckedChange={onCheckedChange} disabled aria-label="Toggle" />);
    await userEvent.click(screen.getByRole("switch", { name: "Toggle" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
