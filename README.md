> [!IMPORTANT]
> This project does not attempt to bypass or subvert authentication and restrictions imposed by D2L or SMU, choosing to utilise the D2L API directly after conducting proper auth via Edge. This project does not have any association to SMU or D2L. If there are any issues, do contact me directly or create an issue.

# SMU eLearn MCP for Codex

A local, read-only Model Context Protocol server for SMU's D2L Brightspace deployment. It exposes courses, pinned courses, weekly modules, course documents, recent uploads/changes, content search, metadata, and file downloads.

This is a local, single-user stdio service. It is not intended to be exposed as a network server or shared between users.

This is the `codex` branch, tailored for Codex. It builds only `plugin-package/codex/smu-elearn`. The sibling `claude` branch contains the other client integration. Both branches start from the same MCP source snapshot.


## Capabilities

| MCP tool | Purpose |
|---|---|
| `elearn_list_events` | Read course calendar events, defaulting to the current Singapore week. |
| `elearn_list_announcements` | Read and search currently visible course announcements. |
| `elearn_preview_downloads` | Prepare a weekly/search/selected-file preview without writing downloads. |
| `elearn_confirm_downloads` | UI-only confirmation for checked files in an active preview. |
| `elearn_open_course_browser` | Open the interactive course browser from chat or supported navigation entrypoints. |
| `elearn_browse_course` | Load visible course documents and weekly modules with exact module ancestry. |
| `elearn_download_documents` | Download up to 50 selected file topics, with deduplication and individual success/failure results. |
| `elearn_authenticate` | Open Edge for SMU SSO/MFA, wait one minute, automatically verify, and save the session. |
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

## Preview downloads before confirming

For weekly or search-based downloads, ask **“Preview this week's eLearn downloads”**, **“Find DOM files to download”**, or **“Preview WAD2 Week 6 files.”** The plugin's `preview-downloads` skill routes these requests to `elearn_preview_downloads`, which reads metadata and opens a confirmation view without downloading any files.

The view lists course, module, filename, modification date, and local destination. Matching files are initially checked (up to 50 per batch). Uncheck anything unwanted, then click **Confirm downloads**. Only that click invokes the UI-only `elearn_confirm_downloads` action. It rejects files outside the preview, repeated downloads of successfully saved files in the same preview, and concurrent duplicate confirmations. Failed items remain available for retry.

- No filters: files modified this Monday–Sunday in **Asia/Singapore**, across pinned courses.
- `query`: title/module search across all dates; combine with `period: this_week` when requested.
- `week`: academic Week N modules, independent of calendar dates.
- `courseIds` or `scope: all`: selected courses or all accessible courses.
- `since` / `until`: inclusive Singapore calendar dates (`YYYY-MM-DD`).
- `documents`: exact courseId/topicId pairs returned by an earlier search or weekly workflow.

Previews show course-loading failures and any matches omitted beyond the 500-file display limit. Plans expire after 30 minutes or an MCP process restart. **Refresh preview** prepares a new list for review and never downloads automatically. For scheduled runs, the skill prepares the preview and stops for confirmation. Installing the skill does not rewrite existing automation prompts; those should call the preview tool rather than legacy download tools. Hosts without MCP Apps can present the list in chat and use legacy tools only after explicit approval.

The local fixture preview supports `http://127.0.0.1:4178/?preview=1` and `?preview=1&query=DOM`.

## Interactive course browser

In an MCP Apps-compatible host, ask **“Open the eLearn course browser.”** Hosts supporting OpenAI Extensions also expose **Course browser** in global navigation and as a conversation tab. The app requests fullscreen placement (the side panel in Codex). Clients without MCP Apps can continue using the regular tools.

The browser includes:

- Pinned/all-course navigation and course-name/code search.
- Weekly-module selection, including nested documents. **All weeks & modules** includes files outside week folders.
- Combined document-title/module search, file-type filters, and inclusive modification dates in **Asia/Singapore**.
- **Open in eLearn** actions for courses and documents through the host's link API.
- Individual selection or **Select visible files**, with up to 50 files per batch. Selection persists across filters within a course and clears when changing courses.
- Downloads to `ELEARN_DOWNLOAD_DIR` (shown in the selection bar), without overwriting existing files. Results show saved paths and individual failures; failed files remain selected for retry.
- Loading, empty, expired-session, and partial-failure states, plus host light/dark appearance and narrow-panel layouts.

Hidden content is excluded. Locked or broken files and web links cannot be selected for downloading. Dates use D2L's modification timestamp, not an inferred original upload date. Documents without a known modification date are excluded when a date filter is active. File types are inferred from the topic URL or title; unknown extensions appear as **FILE**.

The UI runs in the host and calls the local MCP server. No cloud server or frontend network requests to eLearn are added; Edge session cookies stay in the existing local authentication flow. The browser does not extract or search inside document contents.

To develop the UI without signing in:

```bash
npm run preview:browser
```

Open `http://127.0.0.1:4178` for a clearly labelled fixture preview using the official MCP Apps host bridge. Preview downloads and authentication are simulated. Add `?auth=1` to exercise the expired-session screen. This preview server is development-only and is not bundled in the plugin.

After changing the source, run `npm run build:plugins` and `npm run test:plugins`, then reload the installed plugin through the host's supported flow. A running chat may retain the old tool list until the plugin/server reloads or a fresh chat starts. Native navigation placement must be checked in the intended host; the fixture preview does not prove it.

## Requirements

- Node.js 22 or newer
- Microsoft Edge or Google Chrome
- An SMU account with eLearn access

## Install and authenticate

```bash
cd elearn-mcp
npm ci
npm run auth
```

`npm run auth` opens a dedicated Edge profile. Complete the normal SMU Microsoft sign-in and MFA flow. After one minute, the command automatically checks the eLearn API; if sign-in is still finishing, it checks every 15 seconds for up to five minutes. On success it saves Playwright browser-session state, restricts the state file to owner-only permissions (`0600`), and closes Edge. No terminal input is required.

The profile defaults to `~/.elearn-mcp/browser-profile`, and the saved state defaults to `~/.elearn-mcp/storage-state.json`. The state contains session cookies and may contain origin-scoped web storage, so treat both locations as secrets: do not commit, sync, or share them. The MCP never asks for or stores your password or MFA response.

Verify the type safety, unit tests, and clean production build:

```bash
npm run check
```

Run the complete live MCP test after authenticating:

```bash
npm run test:full
```

The full run performs the typecheck and unit tests, builds the production server, connects through MCP stdio, checks the browser and legacy tools against live eLearn data, checks single and deduplicated batch downloads in an isolated operating-system temporary directory, verifies the files, and removes the temporary directory in a `finally` cleanup. It never submits or changes data in eLearn.

## Codex setup

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

## Build the Codex plugin

```bash
npm run build:plugins
npm run test:plugins
```

`npm run build:plugin` is an alias. This branch builds only `plugin-package/codex/smu-elearn/mcp/` from `src/` and the root lockfile. Runtime dependencies are installed in an isolated staging directory before replacing the generated package. Do not edit generated files. Generated runtimes are ignored by Git; build from source after cloning.

## Configuration

| Environment variable | Default | Meaning |
|---|---|---|
| `ELEARN_BROWSER` | `edge` | Authentication and API browser: `edge` or `chrome`. |
| `ELEARN_BASE_URL` | `https://elearn.smu.edu.sg` | eLearn origin. |
| `ELEARN_LP_VERSION` | `1.49` | D2L Learning Platform API contract. |
| `ELEARN_LE_VERSION` | `1.49` | D2L Learning Environment API contract. |
| `ELEARN_COURSE_ORG_UNIT_TYPE_ID` | `3` | D2L Course Offering org-unit type. |
| `ELEARN_PROFILE_DIR` | `~/.elearn-mcp/browser-profile` | Dedicated Edge authentication profile. |
| `ELEARN_AUTH_STATE_FILE` | `~/.elearn-mcp/storage-state.json` | Owner-only Playwright session state used by the MCP. |
| `ELEARN_AUTH_INITIAL_WAIT_SECONDS` | `60` | Time before the first automatic login check. |
| `ELEARN_AUTH_POLL_INTERVAL_SECONDS` | `15` | Retry interval while SSO/MFA is still incomplete. |
| `ELEARN_AUTH_TIMEOUT_SECONDS` | `300` | Maximum interactive authentication time. |
| `ELEARN_DOWNLOAD_DIR` | `./downloads` | Default output directory for downloaded files. |
| `ELEARN_HEADLESS` | `true` | Run the authenticated Edge context without a visible window. |

## How weeks are interpreted

- `elearn_get_week_documents` interprets `week` as the course's academic content module, such as **Week 3**. It recursively includes files in nested submodules.
- `elearn_get_recent_documents` interprets a week as a calendar date range and filters by the topic's D2L `LastModifiedDate`. If `since` and `until` are omitted, it uses the current local Monday through Sunday.

This distinction is intentional: a file stored in “Week 3” may have been uploaded in a different calendar week.

## Authentication lifecycle

The `elearn_authenticate` MCP tool and `npm run auth` command launch the dedicated Edge profile for user-controlled SSO and MFA. They wait one minute before the first automatic check, poll briefly if needed, verify the D2L API, and write a `0600` Playwright storage-state file. The server launches a separate headless Edge context with that state and sends same-origin API requests through it. This preserves SMU and Microsoft control of interactive authentication while allowing MCP processes to restart. When the institutional session expires, call `elearn_authenticate` or rerun `npm run auth`.

See [SECURITY.md](SECURITY.md) for the local deployment boundary, credential-handling guidance, and release checks.

## Choose Edge or Chrome for authentication

Ask the MCP to authenticate with a browser: `elearn_authenticate({"browser":"chrome"})` or `elearn_authenticate({"browser":"edge"})`. A successful login switches subsequent API sessions in that MCP process to the selected browser. An omitted argument keeps the current browser. Restarting returns to the `ELEARN_BROWSER` setting (Edge by default).

For a persistent default, set `ELEARN_BROWSER=edge` or `ELEARN_BROWSER=chrome` in the MCP host environment. For CLI authentication:

```bash
ELEARN_BROWSER=chrome npm run auth
```

Use the same setting when starting the MCP server. `.env.example` documents the variable; the server does not automatically load a `.env` file.

Edge keeps the existing `~/.elearn-mcp/browser-profile` and `~/.elearn-mcp/storage-state.json`. Chrome defaults to `~/.elearn-mcp/browser-profile-chrome` and `~/.elearn-mcp/storage-state-chrome.json`. Explicit `ELEARN_PROFILE_DIR` and `ELEARN_AUTH_STATE_FILE` overrides are preserved. Install the selected browser first.

The server saves session cookies and browser storage after normal SMU sign-in in its dedicated profile. It does not read passwords or extract credentials from your everyday browser profile.

## Events and announcements

- Ask **“What eLearn events do I have this week?”** to use `elearn_list_events`. It defaults to the current Monday–Sunday in **Asia/Singapore** across pinned, active courses. For another window, supply both `since` and `until` as ISO timestamps with offsets. The tool preserves all-day dates and flags recurring events without expanding their occurrences. Calendar entries are not a complete timetable or assessment deadline list.
- Ask **“Show my course announcements”** or **“Find announcements about the lab test”** to use `elearn_list_announcements`. It returns currently visible, published announcements, their rich-text bodies, dates, course links, and attachment metadata. Hidden, unpublished, future, and expired entries are excluded. Optional `query` searches titles and bodies; `since`/`until` filter publication time (start date, falling back to creation date), not modification time.
- Both tools accept `scope: "all"` or explicit `courseIds`, with a default maximum of 25 courses and 100 results. They report failed or unavailable courses and omitted results. Always disclose `partial: true` rather than describing the response as complete.
- Both tools are read-only. Reading announcements does not dismiss them or download attachments. There is no weekly briefing tool or new scheduled automation.

Rebuild with `npm run build:plugins`, then reload the installed plugin to expose the new tools. The bundled runtime is generated and not committed.
