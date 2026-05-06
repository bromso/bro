import type { DetectedClient } from "../detect";
import type { Check } from "../doctor";

export const createAiClientConfigsCheck = (
  clients: ReadonlyArray<DetectedClient>,
  readFile: (path: string) => Promise<string>
): Check => ({
  name: "ai-client-configs",
  async run() {
    const probs: string[] = [];
    for (const c of clients) {
      if (!c.present) continue;
      try {
        const raw = await readFile(c.configPath);
        const json = JSON.parse(raw);
        if (!json?.mcpServers?.figma) {
          probs.push(`${c.id}: missing mcpServers.figma`);
        }
      } catch (err) {
        probs.push(`${c.id}: ${err}`);
      }
    }
    if (probs.length === 0) {
      return { status: "ok" as const, detail: "all configured clients valid" };
    }
    return { status: "warn" as const, detail: probs.join("; ") };
  },
});
