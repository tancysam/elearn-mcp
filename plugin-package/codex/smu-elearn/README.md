# SMU eLearn Codex plugin

This personal Codex plugin bundles the read-only SMU eLearn MCP server. It provides tools for courses, pinned courses, weekly modules, recent documents, recursive course documents, search, metadata, and local downloads.

## Generated runtime

The `mcp/` directory is generated from the main project's `src/` directory and root lockfile. Do not edit files inside it manually. From the main project directory, run `npm run build:plugins` to rebuild the self-contained Codex runtime.

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

Build the plugin, then register this repository's `.agents/plugins/marketplace.json` through your Codex client's supported local marketplace flow and install `smu-elearn`. The package is at `plugin-package/codex/smu-elearn`; it uses `.codex-plugin/plugin.json`, a plugin-relative working directory, environment forwarding, and a 420-second tool timeout for interactive authentication.

Register and install with the installed Codex CLI:

```bash
codex plugin marketplace add /absolute/path/to/elearn-mcp
codex plugin add smu-elearn@smu-local
```

Ask “Open the eLearn course browser” or “Preview this week's eLearn downloads.” In supported Codex hosts, the browser also exposes global navigation and a conversation tab; download previews appear inline. Reload the plugin after rebuilding. Native placement needs verification in the installed Codex host.

For a direct MCP setup without the plugin, build first and add this to your Codex `config.toml`, replacing the absolute path:

```toml
[mcp_servers.smu-elearn]
command = "node"
args = ["/absolute/path/to/elearn-mcp/dist/src/server.js"]
startup_timeout_sec = 20
tool_timeout_sec = 420
```

A direct MCP setup does not install the packaged preview-downloads skill; follow the same review and confirmation workflow explicitly.

## Choose Edge or Chrome for authentication

Ask the MCP to authenticate with a browser: `elearn_authenticate({"browser":"chrome"})` or `elearn_authenticate({"browser":"edge"})`. A successful login switches subsequent API sessions in that MCP process to the selected browser. An omitted argument keeps the current browser. Restarting returns to the `ELEARN_BROWSER` setting (Edge by default).

For a persistent default, set `ELEARN_BROWSER=edge` or `ELEARN_BROWSER=chrome` in the MCP host environment. For CLI authentication:

```bash
ELEARN_BROWSER=chrome npm run auth
```

Use the same setting when starting the MCP server. `.env.example` documents the variable; the server does not automatically load a `.env` file.

Edge keeps the existing `~/.elearn-mcp/browser-profile` and `~/.elearn-mcp/storage-state.json`. Chrome defaults to `~/.elearn-mcp/browser-profile-chrome` and `~/.elearn-mcp/storage-state-chrome.json`. Explicit `ELEARN_PROFILE_DIR` and `ELEARN_AUTH_STATE_FILE` overrides are preserved. Install the selected browser first.

The server saves session cookies and browser storage after normal SMU sign-in in its dedicated profile. It does not read passwords or extract credentials from your everyday browser profile.
