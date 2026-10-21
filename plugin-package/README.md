# SMU eLearn client plugins

The Codex and Claude packages bundle the same generated, read-only SMU eLearn MCP runtime. Their metadata is kept separate because each client has its own plugin manifest and MCP launch configuration.

```text
plugin-package/
├── codex/smu-elearn/
│   ├── .codex-plugin/plugin.json
│   ├── .mcp.json
│   └── mcp/
└── claude/smu-elearn/
    ├── .claude-plugin/plugin.json
    ├── .mcp.json
    └── mcp/
```

The two `mcp/` directories are generated from the root `src/` directory and lockfile. Do not edit either runtime manually. From the project root, run:

```bash
npm run build:plugins
```
