# SMU eLearn Codex package

This branch packages only `codex/smu-elearn`. Run `npm run build:plugins` at the repository root, then `npm run test:plugins` to verify its stdio handshake, tools, and bundled app resources. The `mcp/` directory is generated and ignored by Git.

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
