import React from "react";
import { Box, Text } from "ink";
import type { AppState } from "../types.js";

export function Footer({ state }: { state: AppState }) {
  if (state.mode === "security") {
    return <Box borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text dimColor>j/k move  Enter open  s sort severity/age  o org  r refresh  S back to PRs  q quit</Text>
    </Box>;
  }
  return <Box borderStyle="single" borderColor="cyan" paddingX={1}>
    <Text dimColor>{state.detailOpen
      ? "← → switch panel  j/k prev/next PR  ↑↓ scroll detail  d diff  < > file  o open  Esc close  q quit"
      : "j/k move  Enter open detail  m mark seen  M mark all  Tab views  / author  o org  r refresh  S security  q quit"
    }</Text>
  </Box>;
}
