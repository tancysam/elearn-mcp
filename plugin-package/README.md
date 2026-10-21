# SMU eLearn Claude Code package

This branch packages only `claude/smu-elearn`. Run `npm run build:plugins` at the repository root, then `npm run test:plugins` to verify its stdio handshake, tools, and bundled app resources. The `mcp/` directory is generated and ignored by Git.

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
