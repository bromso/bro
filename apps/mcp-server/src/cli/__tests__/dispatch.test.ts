import { describe, expect, it } from "vitest";
import { dispatch } from "../dispatch";

describe("dispatch", () => {
  it.each([
    [["node", "main.js"], "runtime"],
    [["node", "main.js", "--daemon"], "runtime"],
    [["node", "main.js", "setup"], "setup"],
    [["node", "main.js", "doctor"], "doctor"],
    [["node", "main.js", "--print-path"], "print-path"],
    [["node", "main.js", "--help"], "help"],
    [["node", "main.js", "-h"], "help"],
  ])("classifies %j as %s", (argv, expected) => {
    expect(dispatch({ argv }).kind).toBe(expected);
  });

  it("setup --dry-run sets the dryRun flag", () => {
    const cmd = dispatch({ argv: ["node", "main.js", "setup", "--dry-run"] });
    expect(cmd.kind).toBe("setup");
    if (cmd.kind === "setup") {
      expect(cmd.flags.dryRun).toBe(true);
    }
  });

  it("setup --cloud --relay-url=X captures the URL", () => {
    const cmd = dispatch({
      argv: ["node", "main.js", "setup", "--cloud", "--relay-url=https://r.example"],
    });
    if (cmd.kind !== "setup") throw new Error("expected setup");
    expect(cmd.flags.cloud).toBe(true);
    expect(cmd.flags.relayUrl).toBe("https://r.example");
  });

  it("setup --client cursor sets clientFilter", () => {
    const cmd = dispatch({
      argv: ["node", "main.js", "setup", "--client", "cursor"],
    });
    if (cmd.kind !== "setup") throw new Error("expected setup");
    expect(cmd.flags.client).toBe("cursor");
  });

  it("setup --cloud --oauth sets the oauth flag (Phase 21 plumbing)", () => {
    const cmd = dispatch({
      argv: ["node", "main.js", "setup", "--cloud", "--oauth"],
    });
    if (cmd.kind !== "setup") throw new Error("expected setup");
    expect(cmd.flags.cloud).toBe(true);
    expect(cmd.flags.oauth).toBe(true);
  });

  it("setup without --oauth defaults oauth to false", () => {
    const cmd = dispatch({ argv: ["node", "main.js", "setup", "--cloud"] });
    if (cmd.kind !== "setup") throw new Error("expected setup");
    expect(cmd.flags.oauth).toBe(false);
  });

  it("doctor --json sets json flag", () => {
    const cmd = dispatch({ argv: ["node", "main.js", "doctor", "--json"] });
    if (cmd.kind !== "doctor") throw new Error("expected doctor");
    expect(cmd.flags.json).toBe(true);
    expect(cmd.flags.fix).toBe(false);
  });

  it("doctor --fix sets fix flag", () => {
    const cmd = dispatch({ argv: ["node", "main.js", "doctor", "--fix"] });
    if (cmd.kind !== "doctor") throw new Error("expected doctor");
    expect(cmd.flags.fix).toBe(true);
    expect(cmd.flags.json).toBe(false);
  });

  it("doctor --json --fix sets both flags", () => {
    const cmd = dispatch({ argv: ["node", "main.js", "doctor", "--json", "--fix"] });
    if (cmd.kind !== "doctor") throw new Error("expected doctor");
    expect(cmd.flags.json).toBe(true);
    expect(cmd.flags.fix).toBe(true);
  });

  it("doctor with no flags defaults to json=false fix=false", () => {
    const cmd = dispatch({ argv: ["node", "main.js", "doctor"] });
    if (cmd.kind !== "doctor") throw new Error("expected doctor");
    expect(cmd.flags.json).toBe(false);
    expect(cmd.flags.fix).toBe(false);
  });
});
