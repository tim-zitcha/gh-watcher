import React from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import type { AppState, WatchedAuthorOption } from "../types.js";

export function AuthorPicker({ options, onSelect, onCancel }: {
  options: WatchedAuthorOption[];
  onSelect: (opt: WatchedAuthorOption) => void;
  onCancel: () => void;
}) {
  useInput((_, key) => { if (key.escape) onCancel(); });
  const items = options.map(o => ({ label: o.label, value: o }));
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text bold> Select Author </Text>
      <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
    </Box>
  );
}

export function ScopePicker({ options, onSelect, onCancel }: {
  options: Array<{ label: string; value: string | null }>;
  onSelect: (value: string | null) => void;
  onCancel: () => void;
}) {
  useInput((_, key) => { if (key.escape) onCancel(); });
  const items = options.map(o => ({ label: o.label, value: o.value }));
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text bold> Select Scope </Text>
      <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
    </Box>
  );
}

export function CustomUserInput({ initial, onSubmit, onCancel }: {
  initial: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = React.useState(initial);
  useInput((_, key) => { if (key.escape) onCancel(); });
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} width={50}>
      <Text bold> Custom Author </Text>
      <TextInput focus value={value} onChange={setValue} onSubmit={(v) => onSubmit(v.trim() || initial)} />
    </Box>
  );
}

export function Overlays({ state, authorOptions, scopeOptions, onAuthorSelect, onScopeSelect, onCustomUser, onCancel }: {
  state: AppState;
  authorOptions: WatchedAuthorOption[];
  scopeOptions: Array<{ label: string; value: string | null }>;
  onAuthorSelect: (opt: WatchedAuthorOption) => void;
  onScopeSelect: (value: string | null) => void;
  onCustomUser: (value: string) => void;
  onCancel: () => void;
}) {
  return (
    <>
      {state.activeOverlay === "author" && (
        <AuthorPicker options={authorOptions} onSelect={onAuthorSelect} onCancel={onCancel} />
      )}
      {state.activeOverlay === "scope" && (
        <ScopePicker options={scopeOptions} onSelect={onScopeSelect} onCancel={onCancel} />
      )}
      {state.activeOverlay === "custom" && (
        <CustomUserInput
          initial={state.attentionState.watchedAuthor ?? state.attentionState.viewerLogin}
          onSubmit={onCustomUser}
          onCancel={onCancel}
        />
      )}
    </>
  );
}
