import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Input } from "./input";

describe("Input interaction tests", () => {
  it("accepts typed text", async () => {
    render(<Input placeholder="Enter text" />);
    const input = screen.getByPlaceholderText("Enter text");
    await userEvent.type(input, "hello");
    expect(input).toHaveValue("hello");
  });

  it("fires onChange when typing", async () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} placeholder="Type here" />);
    const input = screen.getByPlaceholderText("Type here");
    await userEvent.type(input, "a");
    expect(onChange).toHaveBeenCalled();
  });

  it("does not accept input when disabled", async () => {
    render(<Input disabled placeholder="Disabled" />);
    const input = screen.getByPlaceholderText("Disabled");
    await userEvent.type(input, "hello");
    expect(input).toHaveValue("");
  });
});
