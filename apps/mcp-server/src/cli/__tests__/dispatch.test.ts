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

  it("doctor --json sets json flag", () => {
    const cmd = dispatch({ argv: ["node", "main.js", "doctor", "--json"] });
    if (cmd.kind !== "doctor") throw new Error("expected doctor");
    expect(cmd.flags.json).toBe(true);
  });
});
