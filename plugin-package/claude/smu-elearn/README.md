# SMU eLearn Claude Code plugin

This Claude Code plugin bundles the read-only SMU eLearn MCP server. It provides tools for courses, pinned courses, weekly modules, recent documents, recursive course documents, search, metadata, and local downloads.

## Generated runtime

The `mcp/` directory is generated from the main project's `src/` directory and root lockfile. Do not edit files inside it manually. From the main project directory, run `npm run build:plugins` to rebuild the self-contained Claude Code runtime.

Validate and load this package directly during development:

```bash
claude plugin validate . --strict
claude --plugin-dir .
```

Inside Claude Code, run `/mcp` to inspect the bundled `smu-elearn` server.

## Authentication

The plugin reads owner-only browser session state from:

```text
~/.elearn-mcp/storage-state.json
```

The file remains outside the plugin and contains sensitive browser session credentials, but not your SMU password or MFA response. If the eLearn session expires, call the plugin's `elearn_authenticate` tool. It opens the dedicated Edge profile, gives you one minute for SMU SSO/MFA, checks automatically, polls briefly if needed, saves the refreshed state, and closes Edge.

## Live verification

From this plugin directory, invoke every MCP tool through a real stdio client and automatically clean up its temporary download with:

```bash
cd mcp
npm run test:live
```

The plugin never modifies remote eLearn data. The download tool only writes a local file when explicitly called.

## Course browser

Ask “Open the eLearn course browser” in an MCP Apps-compatible host. OpenAI Extensions-compatible hosts can also expose the browser in navigation and conversation tabs. Browse pinned/all courses and weekly modules, filter documents by title, file type, or modification date, open items in eLearn, and download up to 50 selected files to the configured local download directory. Failed downloads remain selected for retry. Existing chat tools remain available in hosts without MCP Apps.

## Preview before downloading

For weekly or search-based download requests, the `preview-downloads` skill opens a file review with `elearn_preview_downloads`. It does not download anything until the user confirms the checked files. In supported hosts, the UI-only `elearn_confirm_downloads` action downloads at most 50 files per click and rejects off-list or already-saved items. Previews expire after 30 minutes or a process restart; refreshing prepares a new list without downloading.

## Client setup

Validate and load the built plugin directly:

```bash
claude plugin validate ./plugin-package/claude/smu-elearn --strict
claude --plugin-dir ./plugin-package/claude/smu-elearn
```

Run `/mcp` inside Claude Code to inspect the server. For a persistent local installation:

```bash
claude plugin marketplace add /absolute/path/to/elearn-mcp
claude plugin install smu-elearn@smu-local --scope user
```

The catalog is `.claude-plugin/marketplace.json`. The launch command uses `${CLAUDE_PLUGIN_ROOT}` so it works after Claude copies the package into its cache. Build before installation and reload/reinstall after rebuilding.

Use the standard course, search, and document tools in terminal workflows. For downloads, prepare a preview, present filenames and destinations in chat when no app view is available, and wait for explicit confirmation before downloading only the approved items. MCP Apps views depend on host support; OpenAI navigation metadata in the shared runtime is not a Claude Code navigation feature.

## Choose Edge or Chrome for authentication

Ask the MCP to authenticate with a browser: `elearn_authenticate({"browser":"chrome"})` or `elearn_authenticate({"browser":"edge"})`. A successful login switches subsequent API sessions in that MCP process to the selected browser. An omitted argument keeps the current browser. Restarting returns to the `ELEARN_BROWSER` setting (Edge by default).

For a persistent default, set `ELEARN_BROWSER=edge` or `ELEARN_BROWSER=chrome` in the MCP host environment. For CLI authentication:

```bash
ELEARN_BROWSER=chrome npm run auth
```

Use the same setting when starting the MCP server. `.env.example` documents the variable; the server does not automatically load a `.env` file.

Edge keeps the existing `~/.elearn-mcp/browser-profile` and `~/.elearn-mcp/storage-state.json`. Chrome defaults to `~/.elearn-mcp/browser-profile-chrome` and `~/.elearn-mcp/storage-state-chrome.json`. Explicit `ELEARN_PROFILE_DIR` and `ELEARN_AUTH_STATE_FILE` overrides are preserved. Install the selected browser first.

The server saves session cookies and browser storage after normal SMU sign-in in its dedicated profile. It does not read passwords or extract credentials from your everyday browser profile.
