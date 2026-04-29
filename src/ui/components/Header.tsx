import React from "react";
import { Box } from "ink";
import type { AppState } from "../types.js";
import { StatusBar } from "./StatusBar.js";
import { ModeStrip } from "./ModeStrip.js";
import { SubNav } from "./SubNav.js";

export function Header({ state }: { state: AppState }) {
  return (
    <Box flexDirection="column">
      <StatusBar state={state} />
      <ModeStrip state={state} />
      {state.mode === "pr" && <SubNav state={state} />}
    </Box>
  );
}
