import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../app";

describe("App (component sampler)", () => {
  it("renders without crashing", () => {
    render(<App />);
    expect(screen.getByText("Inputs")).toBeInTheDocument();
    expect(screen.getByText("Buttons")).toBeInTheDocument();
    expect(screen.getByText("Display")).toBeInTheDocument();
    expect(screen.getByText("Layout")).toBeInTheDocument();
  });

  it("renders primary button", () => {
    render(<App />);
    expect(screen.getByText("Primary action")).toBeInTheDocument();
  });

  it("renders onboarding tip", () => {
    render(<App />);
    expect(screen.getByText("This is a tip for new users.")).toBeInTheDocument();
  });
});
