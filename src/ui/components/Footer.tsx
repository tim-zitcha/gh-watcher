import React from "react";
import { Box, Text } from "ink";
import type { AppState } from "../types.js";

export function Footer({ state }: { state: AppState }) {
  const sep = <Text dimColor> │ </Text>;

  if (state.mode === "messages") {
    return (
      <Box borderStyle="single" borderColor="blue" paddingX={1}>
        <Text dimColor>j/k move</Text>{sep}
        <Text dimColor>Enter open in browser</Text>{sep}
        <Text dimColor>m mark read  M mark all read</Text>{sep}
        <Text dimColor>a all/unread</Text>{sep}
        <Text dimColor>1/2/3/4 mode</Text>{sep}
        <Text dimColor>r refresh  q quit</Text>
      </Box>
    );
  }

  if (state.mode === "security") {
    return (
      <Box borderStyle="single" borderColor="red" paddingX={1}>
        <Text dimColor>j/k move</Text>{sep}
        <Text dimColor>Enter open advisory</Text>{sep}
        <Text dimColor>s sort severity/age</Text>{sep}
        <Text dimColor>o org scope</Text>{sep}
        <Text dimColor>1/2/3/4 mode</Text>{sep}
        <Text dimColor>r refresh  q quit</Text>
      </Box>
    );
  }

  if (state.mode === "repos") {
    if (state.repoDetailRepo) {
      return (
        <Box borderStyle="single" borderColor="green" paddingX={1}>
          <Text dimColor>j/k move</Text>{sep}
          <Text dimColor>Enter open PR</Text>{sep}
          <Text dimColor>Esc back to list</Text>{sep}
          <Text dimColor>1/2/3/4 mode</Text>{sep}
          <Text dimColor>r refresh  q quit</Text>
        </Box>
      );
    }
    return (
      <Box borderStyle="single" borderColor="green" paddingX={1}>
        <Text dimColor>j/k move</Text>{sep}
        <Text dimColor>Enter open repo</Text>{sep}
        <Text dimColor>s sort activity/alerts/name</Text>{sep}
        <Text dimColor>1/2/3/4 mode</Text>{sep}
        <Text dimColor>r refresh  q quit</Text>
      </Box>
    );
  }

  if (state.detailOpen) {
    return (
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text dimColor>{"← →"} switch panel</Text>{sep}
        <Text dimColor>j/k prev/next PR</Text>{sep}
        <Text dimColor>{"↑↓"} scroll detail</Text>{sep}
        <Text dimColor>d diff  {"< >"} file</Text>{sep}
        <Text dimColor>o open in browser</Text>{sep}
        <Text dimColor>Esc close  q quit</Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text dimColor>j/k move</Text>{sep}
      <Text dimColor>Enter detail</Text>{sep}
      <Text dimColor>m mark seen  M mark all</Text>{sep}
      <Text dimColor>Tab sub-view</Text>{sep}
      <Text dimColor>1/2/3/4 mode</Text>{sep}
      <Text dimColor>{"/ author  o scope  r refresh  q quit"}</Text>
    </Box>
  );
}
