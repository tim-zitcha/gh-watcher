import React from "react";
import { Box, Text, useStdout } from "ink";
import { formatTimestamp, htmlToText, parseDiff } from "../helpers.js";
import type { AppState } from "../types.js";

function truncate(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  return text.slice(0, Math.max(0, maxWidth - 1)) + "…";
}

export function PrDetail({ state }: { state: AppState }) {
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;
  const cols = stdout?.columns ?? 120;
  const { detailPr: pr, detailData, detailLoading, detailScrollOffset, detailDiff, detailDiffVisible, detailDiffFileIndex } = state;
  if (!pr) return null;

  const visibleLines = rows - 9;
  const openedLabel = formatTimestamp(detailData?.createdAt ?? pr.activity.latestActivityAt);

  type Line = { text: string; color?: string; bold?: boolean; dimColor?: boolean };
  const lines: Line[] = [
    { text: `#${pr.number} — ${pr.title}`, bold: true },
    { text: `${pr.repository} · ${pr.author} · opened ${openedLabel}`, dimColor: true },
    { text: "" },
  ];

  if (detailLoading) {
    lines.push({ text: "Loading...", color: "yellow" });
  } else if (detailData) {
    const d = detailData;

    lines.push({ text: "── Description ─────────────────────────────", dimColor: true });
    for (const line of (htmlToText(d.body) || "(no description)").split("\n"))
      lines.push({ text: line });
    lines.push({ text: "" });

    const passing = d.checkRuns.filter(c => c.conclusion === "SUCCESS").length;
    const failing = d.checkRuns.filter(c => c.conclusion !== null && c.conclusion !== "SUCCESS" && c.conclusion !== "NEUTRAL" && c.conclusion !== "SKIPPED").length;
    lines.push({ text: `── CI Checks (${passing} passing / ${failing} failing) ──`, dimColor: true });
    for (const check of d.checkRuns) {
      lines.push({
        text: `${check.conclusion === "SUCCESS" ? "✓" : check.conclusion === null ? "●" : "✗"} ${check.name}`,
        color: check.conclusion === "SUCCESS" ? "green" : check.conclusion === null ? "yellow" : "red",
      });
    }
    lines.push({ text: "" });

    lines.push({ text: "── Reviews ──────────────────────────────────", dimColor: true });
    // Keep only the latest review per author — GitHub returns reviews chronologically
    // so later entries supersede earlier ones (e.g. APPROVED after CHANGES_REQUESTED)
    const latestReviewByAuthor = new Map(d.reviews.map(r => [r.author, r]));
    const reviewedAuthors = new Set(latestReviewByAuthor.keys());
    for (const review of latestReviewByAuthor.values()) {
      lines.push({
        text: `${review.state === "APPROVED" ? "✓" : review.state === "CHANGES_REQUESTED" ? "✗" : "·"} ${review.author} — ${review.state}`,
        color: review.state === "APPROVED" ? "green" : review.state === "CHANGES_REQUESTED" ? "red" : undefined,
      });
    }
    for (const reviewer of d.requestedReviewers) {
      if (!reviewedAuthors.has(reviewer))
        lines.push({ text: `⏳ ${reviewer} — PENDING`, color: "yellow" });
    }
    lines.push({ text: "" });

    const totalAdd = d.files.reduce((s, f) => s + f.additions, 0);
    const totalDel = d.files.reduce((s, f) => s + f.deletions, 0);
    lines.push({ text: `── Files Changed (${d.files.length} files, +${totalAdd} −${totalDel}) ──`, dimColor: true });
    for (const file of d.files)
      lines.push({ text: `${file.path}   +${file.additions} −${file.deletions}` });
  }

  if (detailDiffVisible && detailDiff) {
    const diffFiles = parseDiff(detailDiff);
    const fileCount = diffFiles.length;
    if (fileCount === 0) {
      lines.push({ text: "── Diff ── (binary or empty) ──────────────────", dimColor: true });
    } else {
      const fileIdx = Math.min(detailDiffFileIndex, fileCount - 1);
      const currentFile = diffFiles[fileIdx];
      const fileLabel = currentFile?.header ?? "";
      const navLabel = `${fileIdx + 1} / ${fileCount}`;
      lines.push({
        text: `── Diff ── ${navLabel} ── ${fileLabel} ── [d] hide  [< >] file ${"─".repeat(8)}`,
        dimColor: true,
      });
      if (currentFile) {
        for (const line of currentFile.lines) {
          switch (line.type) {
            case "add":  lines.push({ text: line.text, color: "green" }); break;
            case "del":  lines.push({ text: line.text, color: "red" }); break;
            case "hunk": lines.push({ text: line.text, color: "cyan" }); break;
            case "file": lines.push({ text: line.text, bold: true }); break;
            default:     lines.push({ text: line.text, dimColor: true }); break;
          }
        }
      }
    }
  } else if (detailDiff) {
    lines.push({ text: "── [d] show diff ──────────────────────────────", dimColor: true });
  }

  const maxOffset = Math.max(0, lines.length - visibleLines);
  const offset = Math.min(detailScrollOffset, maxOffset);
  const visible = lines.slice(offset, offset + visibleLines);
  while (visible.length < visibleLines) visible.push({ text: "" });

  const needsScrollbar = lines.length > visibleLines;
  const thumbSize = needsScrollbar ? Math.max(1, Math.round(visibleLines * visibleLines / lines.length)) : 0;
  const thumbStart = needsScrollbar ? Math.round((offset / Math.max(1, maxOffset)) * (visibleLines - thumbSize)) : 0;

  // Panel occupies ~62% of terminal width; subtract 2 for borders and 1 for scrollbar char
  const panelWidth = Math.floor(cols * 0.62) - 3;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={state.focusedPanel === "detail" ? "yellow" : "gray"} width="62%" flexShrink={0}>
      {visible.map((line, i) => (
        <Box key={i} justifyContent="space-between">
          <Text bold={line.bold} color={line.color} dimColor={line.dimColor}>{truncate(line.text || " ", panelWidth)}</Text>
          {needsScrollbar && (
            <Text color={i >= thumbStart && i < thumbStart + thumbSize ? "yellow" : "gray"}>
              {i >= thumbStart && i < thumbStart + thumbSize ? "│" : "·"}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
