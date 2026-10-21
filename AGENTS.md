# Codex branch development

- This branch targets Codex; keep builds, smoke tests, marketplace metadata, and documentation scoped to `plugin-package/codex/smu-elearn`.
- Edit `src/` and rebuild with `npm run build:plugins`; never edit generated `mcp/` runtime files.
- Run `npm run check`, `npm run build:plugins`, and `npm run test:plugins` before finishing changes to the integration.
- Keep SMU SSO/MFA interactive and session state outside the repository. Do not commit credentials.
- Preserve preview-before-confirmation downloads. Scheduled requests prepare a preview and wait for confirmation.
- Keep the standard MCP tools usable when the host cannot render MCP Apps. Native UI placement requires host verification.
- Shared server fixes should be reviewed and ported to the sibling `claude` branch; do not merge client-specific packaging blindly.
