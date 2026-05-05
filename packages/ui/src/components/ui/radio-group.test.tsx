import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RadioGroup, RadioGroupItem } from "./radio-group";

describe("RadioGroup interaction tests", () => {
  it("selects an option when clicked", async () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup onValueChange={onValueChange}>
        <RadioGroupItem value="a" aria-label="Option A" />
        <RadioGroupItem value="b" aria-label="Option B" />
      </RadioGroup>
    );
    await userEvent.click(screen.getByRole("radio", { name: "Option A" }));
    expect(onValueChange).toHaveBeenCalledWith("a");
  });

  it("switches selection between options", async () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup onValueChange={onValueChange}>
        <RadioGroupItem value="a" aria-label="Option A" />
        <RadioGroupItem value="b" aria-label="Option B" />
      </RadioGroup>
    );
    await userEvent.click(screen.getByRole("radio", { name: "Option A" }));
    await userEvent.click(screen.getByRole("radio", { name: "Option B" }));
    expect(onValueChange).toHaveBeenLastCalledWith("b");
  });
});
