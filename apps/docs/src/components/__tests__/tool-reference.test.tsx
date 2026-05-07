import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolReference } from "../tool-reference";

describe("ToolReference", () => {
  it("renders the tool name and pack as a header", () => {
    render(
      <ToolReference
        pack="tools-extract"
        name="extract_styles"
        description="Return all local styles."
        streaming={false}
        input={{ type: "object", properties: {}, additionalProperties: false }}
        output={{
          type: "object",
          properties: {
            paintStyles: { type: "array", description: "Paint styles." },
          },
        }}
      />
    );
    expect(screen.getByText("extract_styles")).toBeInTheDocument();
    expect(screen.getByText(/tools-extract/)).toBeInTheDocument();
  });

  it("renders the input table with required/optional columns", () => {
    render(
      <ToolReference
        pack="tools-design"
        name="create_rectangle"
        description="Create a rectangle."
        streaming={false}
        input={{
          type: "object",
          properties: {
            width: { type: "number", exclusiveMinimum: 0 },
            height: { type: "number", exclusiveMinimum: 0 },
            x: { type: "number" },
            y: { type: "number" },
          },
          required: ["width", "height"],
          additionalProperties: false,
        }}
        output={{ type: "object", properties: {} }}
      />
    );
    // width and height are required; x and y are optional.
    const widthRow = screen.getByText("width").closest("tr");
    expect(widthRow).toHaveTextContent("required");
    const xRow = screen.getByText("x").closest("tr");
    expect(xRow).toHaveTextContent("optional");
  });

  it("renders enum constraints", () => {
    render(
      <ToolReference
        pack="tools-figjam"
        name="create_shape_with_text"
        description="Shape."
        streaming={false}
        input={{
          type: "object",
          properties: {
            shape: { type: "string", enum: ["square", "ellipse", "diamond"] },
          },
          required: ["shape"],
        }}
        output={{ type: "object" }}
      />
    );
    expect(screen.getByText(/square/)).toBeInTheDocument();
    expect(screen.getByText(/ellipse/)).toBeInTheDocument();
    expect(screen.getByText(/diamond/)).toBeInTheDocument();
  });

  it("renders streaming indicator when streaming=true", () => {
    render(
      <ToolReference
        pack="tools-variables"
        name="import_variables"
        description="Import."
        streaming={true}
        input={{ type: "object" }}
        output={{ type: "object" }}
      />
    );
    expect(screen.getByText(/streaming/i)).toBeInTheDocument();
  });

  it("renders the output schema as a table separate from input", () => {
    render(
      <ToolReference
        pack="tools-rest"
        name="get_user_me"
        description="User."
        streaming={false}
        input={{ type: "object" }}
        output={{
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
          },
        }}
      />
    );
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("email")).toBeInTheDocument();
  });
});
