import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Calendar } from "./calendar";

describe("Calendar interaction tests", () => {
  it("renders month name and day cells", () => {
    render(<Calendar month={new Date(2025, 0, 1)} />);
    expect(screen.getByText("January 2025")).toBeInTheDocument();
    // Day cells for the month should exist as gridcells
    const dayCells = screen.getAllByRole("gridcell");
    expect(dayCells.length).toBeGreaterThan(0);
  });

  it("renders previous and next navigation buttons", () => {
    render(<Calendar month={new Date(2025, 0, 1)} />);
    const buttons = screen.getAllByRole("button");
    // At minimum prev/next buttons
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });
});
