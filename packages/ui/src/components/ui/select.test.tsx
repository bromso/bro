import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

function TestSelect() {
  return (
    <Select>
      <SelectTrigger aria-label="Fruit">
        <SelectValue placeholder="Pick a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="cherry">Cherry</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe("Select interaction tests", () => {
  it("renders a trigger with the placeholder text", () => {
    render(<TestSelect />);
    expect(screen.getByLabelText("Fruit")).toBeInTheDocument();
  });

  it("opens the dropdown when clicked and shows options", async () => {
    render(<TestSelect />);
    const trigger = screen.getByLabelText("Fruit");
    await userEvent.click(trigger);
    expect(screen.getByRole("option", { name: "Apple" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Banana" })).toBeInTheDocument();
  });
});
