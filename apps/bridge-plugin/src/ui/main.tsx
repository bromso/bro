/**
 * UI iframe entry — mounts the React status panel into `#root`.
 *
 * Kept tiny so the testable surface stays in `App.tsx`. This file is
 * excluded from coverage in `vitest.config.ts`.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("UI root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
