# pr-watch

Terminal dashboard for GitHub pull request review queues and watched authors.

## Requirements

- Node.js 22+
- `gh` authenticated against `github.com`
- macOS notifications are optional and enabled by default

## Install

```bash
npm install
npm run build
```

Run locally with:

```bash
node dist/cli.js
```

Or during development:

```bash
npm run dev
```

## Usage

```bash
node dist/cli.js --refresh-minutes 5
```

Flags:

- `--refresh-minutes <n>`: polling interval in minutes
- `--no-notify`: disable desktop notifications
- `--include-drafts`: include draft pull requests
- `--watch-user <login>`: optionally preselect a different authored-by user
- `--org <login>`: limit searches to an organization, defaults to `zitcha`
- `--all-repos`: search all repositories your token can access

The authored-by view defaults to the authenticated `gh` user. Press `/` inside the UI to select another author; when an org scope is active, this list is populated from that org's members, with `dependabot[bot]`, recent authors, and a custom username option still available. Press `o` to switch between organizations you can access, or all accessible repositories.

The authored-by view shows the 30 most recently updated open PRs for the selected author and scope.

## Keys

- `Tab`: cycle views
- `Up` / `Down` or `k` / `j`: move the selected PR
- `PageUp` / `PageDown`: jump through the PR list faster
- `Home` / `End`: jump to the first or last PR
- `/`: select authored-by user
- `o`: select organization scope
- `Enter`: open the selected PR in your browser
- `r`: refresh all views now
- `m`: mark the selected PR as seen
- `Shift+m`: mark all visible PRs as seen
- `q`: quit
