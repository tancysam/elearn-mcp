# SMU eLearn MCP

A local, read-only Model Context Protocol server for SMU's D2L Brightspace deployment. It exposes courses, pinned courses, weekly modules, course documents, recent uploads/changes, content search, metadata, and file downloads.

This is a local, single-user stdio service. It is not intended to be exposed as a network server or shared between users.

## Capabilities

| MCP tool | Purpose |
|---|---|
| `elearn_authenticate` | Open Chrome for SMU SSO/MFA, wait one minute, automatically verify, and save the session. |
| `elearn_auth_status` | Verify that the locally saved browser session can access the eLearn API. |
| `elearn_list_courses` | List/search accessible courses with IDs, codes, dates, role, and pin state. |
| `elearn_list_pinned_courses` | Return courses whose authoritative D2L `PinDate` is present. |
| `elearn_list_course_weeks` | Discover nested `Week N` modules and their document counts. |
| `elearn_get_week_documents` | Get all documents for one course and one academic week/module. |
| `elearn_get_recent_documents` | Get documents uploaded or modified during a calendar week across pinned/all/selected courses. |
| `elearn_get_course_documents` | Recursively list every document in one course. |
| `elearn_search_content` | Search document titles and module paths across courses. |
| `elearn_get_document_metadata` | Get one D2L content topic's metadata. |
| `elearn_download_document` | Download a topic file locally without overwriting an existing file. |

The implementation uses D2L's documented read-only API routes. It does not scrape the visible homepage and does not modify courses, pin state, submissions, grades, messages, or content.

## Requirements

- Node.js 22 or newer
- Google Chrome
- An SMU account with eLearn access

## Install and authenticate

```bash
cd elearn-mcp
npm ci
npm run auth
```

`npm run auth` opens a dedicated Chrome profile. Complete the normal SMU Microsoft sign-in and MFA flow. After one minute, the command automatically checks the eLearn API; if sign-in is still finishing, it checks every 15 seconds for up to five minutes. On success it saves Playwright browser-session state, restricts the state file to owner-only permissions (`0600`), and closes Chrome. No terminal input is required.

The profile defaults to `~/.elearn-mcp/browser-profile`, and the saved state defaults to `~/.elearn-mcp/storage-state.json`. The state contains session cookies and may contain origin-scoped web storage, so treat both locations as secrets: do not commit, sync, or share them. The MCP never asks for or stores your password or MFA response.

Verify the type safety, unit tests, and clean production build:

```bash
npm run check
```

Run the complete live MCP test after authenticating:

```bash
npm run test:full
```

The full run performs the typecheck and unit tests, builds the production server, connects through MCP stdio, validates all eleven tools against live eLearn data, downloads one real file into an isolated operating-system temporary directory, verifies the file, and removes the temporary directory in a `finally` cleanup. It never submits or changes data in eLearn.

## MCP client configuration

Build the project first, then configure your MCP client to start the compiled stdio server:

```json
{
  "mcpServers": {
    "smu-elearn": {
      "command": "node",
      "args": [
        "/absolute/path/to/elearn-mcp/dist/src/server.js"
      ],
      "env": {
        "ELEARN_BASE_URL": "https://elearn.smu.edu.sg",
        "ELEARN_LP_VERSION": "1.49",
        "ELEARN_LE_VERSION": "1.49",
        "ELEARN_COURSE_ORG_UNIT_TYPE_ID": "3"
      }
    }
  }
}
```

The exact location of this JSON depends on the MCP client. Restart the client after changing its configuration.

## Production runtime

The server is built from the locked dependency set. Tests are typechecked and executed during verification, but they are excluded from `dist/` and the distributable package.

For a minimal local runtime:

```bash
npm ci
npm run check
npm prune --omit=dev
npm start
```

After pruning development dependencies, run `npm ci` again before rebuilding or running unit tests. The included GitHub Actions workflow performs the same locked install and verification on Node.js 22. The authenticated live test is kept out of CI because it requires an interactive SMU account and MFA.

## Build the Codex and Claude plugins

The TypeScript files under `src/` are the only source of truth for the MCP implementation. Codex and Claude Code use separate plugin manifests and MCP launch metadata, while both receive the same generated runtime:

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

Build both fresh, self-contained plugin packages with:

```bash
npm run build:plugins
```

`npm run build:plugin` remains an alias for the same command. The build compiles `src/` once, derives exact production dependency versions from the root lockfile, installs production dependencies once in an isolated staging directory, and replaces each `mcp/` directory only after its complete staged copy has been verified. Do not edit either generated runtime by hand.

For Claude Code development, validate and load the package directly:

```bash
claude plugin validate ./plugin-package/claude/smu-elearn --strict
claude --plugin-dir ./plugin-package/claude/smu-elearn
```

Inside Claude Code, run `/mcp` to inspect the bundled server. For a persistent local installation, build the packages and then add this repository's marketplace:

```bash
claude plugin marketplace add /absolute/path/to/elearn-mcp
claude plugin install smu-elearn@smu-local --scope user
```

The marketplace catalog is stored at `.claude-plugin/marketplace.json`. Claude copies the complete package into its plugin cache, so the generated `mcp/` runtime must exist before installation. Use `--plugin-dir` while developing to avoid the cache and load the package in place.

## Configuration

| Environment variable | Default | Meaning |
|---|---|---|
| `ELEARN_BASE_URL` | `https://elearn.smu.edu.sg` | eLearn origin. |
| `ELEARN_LP_VERSION` | `1.49` | D2L Learning Platform API contract. |
| `ELEARN_LE_VERSION` | `1.49` | D2L Learning Environment API contract. |
| `ELEARN_COURSE_ORG_UNIT_TYPE_ID` | `3` | D2L Course Offering org-unit type. |
| `ELEARN_PROFILE_DIR` | `~/.elearn-mcp/browser-profile` | Dedicated Chrome authentication profile. |
| `ELEARN_AUTH_STATE_FILE` | `~/.elearn-mcp/storage-state.json` | Owner-only Playwright session state used by the MCP. |
| `ELEARN_AUTH_INITIAL_WAIT_SECONDS` | `60` | Time before the first automatic login check. |
| `ELEARN_AUTH_POLL_INTERVAL_SECONDS` | `15` | Retry interval while SSO/MFA is still incomplete. |
| `ELEARN_AUTH_TIMEOUT_SECONDS` | `300` | Maximum interactive authentication time. |
| `ELEARN_DOWNLOAD_DIR` | `./downloads` | Default output directory for downloaded files. |
| `ELEARN_HEADLESS` | `true` | Run the authenticated Chrome context without a visible window. |

## How weeks are interpreted

- `elearn_get_week_documents` interprets `week` as the course's academic content module, such as **Week 3**. It recursively includes files in nested submodules.
- `elearn_get_recent_documents` interprets a week as a calendar date range and filters by the topic's D2L `LastModifiedDate`. If `since` and `until` are omitted, it uses the current local Monday through Sunday.

This distinction is intentional: a file stored in “Week 3” may have been uploaded in a different calendar week.

## Authentication lifecycle

The `elearn_authenticate` MCP tool and `npm run auth` command launch the dedicated Chrome profile for user-controlled SSO and MFA. They wait one minute before the first automatic check, poll briefly if needed, verify the D2L API, and write a `0600` Playwright storage-state file. The server launches a separate headless Chrome context with that state and sends same-origin API requests through it. This preserves SMU and Microsoft control of interactive authentication while allowing MCP processes to restart. When the institutional session expires, call `elearn_authenticate` or rerun `npm run auth`.

See [docs/DISCOVERY.md](docs/DISCOVERY.md) for the observed site structure, authentication boundary, and D2L endpoint map.

See [SECURITY.md](SECURITY.md) for the local deployment boundary, credential-handling guidance, and release checks.
