/**
 * Vite entry for the plugin sandbox bundle. Invokes `start()` so the
 * plugin connects to the daemon as soon as the bundle loads inside
 * Figma. Kept tiny on purpose — testable logic lives in `plugin.ts`.
 */
import { start } from "./plugin";

start().catch((err) => {
  console.error("bridge-plugin: fatal error in connection:", err);
});
