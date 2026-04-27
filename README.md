# gh-watcher

Terminal dashboard for GitHub pull requests and Dependabot security alerts.

Displays your review queue, PRs you've authored, notifications, and security advisories — all in one keyboard-driven TUI. Polls GitHub in the background and sends desktop notifications when things need your attention.

## Requirements

- Node.js 22+
- `gh` CLI authenticated against `github.com`
- macOS desktop notifications (optional, enabled by default)

## Install

```bash
npm install
npm run build
```

Run locally:

```bash
node dist/cli.js
```

Or during development:

```bash
npm run dev
```

## Usage

```bash
node dist/cli.js [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--refresh-minutes <n>` | `5` | Polling interval in minutes |
| `--no-notify` | — | Disable desktop notifications |
| `--include-drafts` | — | Include draft pull requests |
| `--watch-user <login>` | authenticated user | Pre-select an authored-by user |
| `--org <login>` | `zitcha` | Limit searches to an organisation |
| `--all-repos` | — | Search all repos your token can access |

## Views

| Key | View |
|-----|------|
| `1` | Review queue — PRs awaiting your review |
| `2` | Authored — your open PRs |
| `3` | Notifications — unread GitHub notifications |

The **authored** view shows the 30 most recently updated open PRs for the selected author and scope. Press `/` to switch author; when an org is active, the list is drawn from org members with Dependabot and recent contributors included. Press `o` to switch organisation scope or switch to all accessible repositories.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `1` / `2` / `3` | Switch view |
| `Tab` | Cycle views |
| `↑` / `↓` or `k` / `j` | Move selection |
| `PgUp` / `PgDn` | Jump through list faster |
| `Home` / `End` | First / last item |
| `Enter` | Open selected PR or notification in browser |
| `/` | Select authored-by user |
| `o` | Select organisation scope |
| `r` | Refresh all views now |
| `m` | Mark selected notification as read |
| `M` | Mark all visible notifications as read |
| `q` | Quit |

## Development

```bash
npm run dev          # run with tsx (no build step)
npm run dev:watch    # watch mode
npm test             # run tests
npm run lint         # ESLint
npm run format       # Prettier
```

Built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs), TypeScript, and the `gh` CLI.
