# SMU eLearn Codex plugin

This personal Codex plugin bundles the read-only SMU eLearn MCP server. It provides tools for courses, pinned courses, weekly modules, recent documents, recursive course documents, search, metadata, and local downloads.

## Generated runtime

The `mcp/` directory is generated from the main project's `src/` directory and root lockfile. Do not edit files inside it manually. From the main project directory, run `npm run build:plugins` to rebuild the self-contained Codex and Claude runtimes.

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
