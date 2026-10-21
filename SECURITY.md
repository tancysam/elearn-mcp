# Security

## Intended deployment

SMU eLearn MCP is a local, single-user stdio server. It is not designed to be exposed as a network service or shared between users. The server only calls documented, read-only D2L API routes, but downloaded documents are written to the local filesystem when the download tool is explicitly invoked.

## Protect authentication data

The browser profile and Playwright storage-state file contain active session credentials. Keep them outside the project, do not sync or commit them, and ensure the storage-state file remains readable only by its owner (`0600`). The defaults under `~/.elearn-mcp/` satisfy the location requirement.

If authentication data may have been exposed:

1. Sign out of SMU eLearn and the associated Microsoft session.
2. Remove the affected dedicated browser profile and storage-state file.
3. Run `npm run auth` to create a fresh session.

## Production checks

Before distributing or updating the local runtime, run:

```bash
npm ci
npm run check
npm audit --omit=dev
```

The live test additionally requires an authenticated SMU account and is intentionally not run in CI:

```bash
npm run test:full
```

## Reporting a vulnerability

Do not include passwords, MFA responses, cookies, storage-state files, downloaded course documents, or other personal data in a report. Share a minimal reproduction and redact all SMU account and course information.
