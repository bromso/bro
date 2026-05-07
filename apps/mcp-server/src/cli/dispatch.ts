export type CliCommand =
  | { kind: "runtime"; flags: { enableWriteTools: boolean } }
  | { kind: "help" }
  | { kind: "print-path" }
  | {
      kind: "setup";
      flags: {
        dryRun: boolean;
        cloud: boolean;
        openFigma: boolean;
        client: string | null;
        relayUrl: string | null;
      };
    }
  | { kind: "doctor"; flags: { json: boolean } };

export interface DispatchOptions {
  readonly argv: readonly string[];
}

export function dispatch(options: DispatchOptions): CliCommand {
  const args = options.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return { kind: "help" };
  if (args.includes("--print-path")) return { kind: "print-path" };

  const sub = args[0];
  if (sub === "setup") {
    const rest = args.slice(1);
    return {
      kind: "setup",
      flags: {
        dryRun: rest.includes("--dry-run"),
        cloud: rest.includes("--cloud"),
        openFigma: rest.includes("--open-figma"),
        client: takeValue(rest, "--client"),
        relayUrl: takeValue(rest, "--relay-url"),
      },
    };
  }
  if (sub === "doctor") {
    return { kind: "doctor", flags: { json: args.includes("--json") } };
  }
  return {
    kind: "runtime",
    flags: {
      enableWriteTools: args.includes("--enable-write-tools"),
    },
  };
}

function takeValue(args: readonly string[], flag: string): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === flag && i + 1 < args.length) return args[i + 1];
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
  }
  return null;
}
