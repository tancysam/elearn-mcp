# SMU eLearn Claude Code plugin

This Claude Code plugin bundles the read-only SMU eLearn MCP server. It provides tools for courses, pinned courses, weekly modules, recent documents, recursive course documents, search, metadata, and local downloads.

## Generated runtime

The `mcp/` directory is generated from the main project's `src/` directory and root lockfile. Do not edit files inside it manually. From the main project directory, run `npm run build:plugins` to rebuild the self-contained Codex and Claude runtimes.

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

The file remains outside the plugin and contains sensitive browser session credentials, but not your SMU password or MFA response. If the eLearn session expires, call the plugin's `elearn_authenticate` tool. It opens the dedicated Chrome profile, gives you one minute for SMU SSO/MFA, checks automatically, polls briefly if needed, saves the refreshed state, and closes Chrome.

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
