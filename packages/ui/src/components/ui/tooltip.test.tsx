import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

describe("Tooltip interaction tests", () => {
  it("renders trigger element", () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    expect(screen.getByText("Hover me")).toBeInTheDocument();
  });

  it("shows tooltip content when open is controlled", () => {
    const { container } = render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    const tooltipContent = container.ownerDocument.querySelector('[data-slot="tooltip-content"]');
    expect(tooltipContent).toBeInTheDocument();
    expect(tooltipContent?.textContent).toContain("Tooltip text");
  });

  it("hides tooltip content when open is false", () => {
    const { container } = render(
      <TooltipProvider>
        <Tooltip open={false}>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    const tooltipContent = container.ownerDocument.querySelector('[data-slot="tooltip-content"]');
    expect(tooltipContent).not.toBeInTheDocument();
  });
});
