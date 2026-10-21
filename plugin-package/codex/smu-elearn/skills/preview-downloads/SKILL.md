---
name: preview-downloads
description: Use when the user asks to download SMU eLearn files for a week, search term, course, or selected document list, including scheduled weekly download runs. Prepare a file preview and wait for the user to confirm before downloading.
---

# Preview eLearn downloads in Codex

In Codex hosts that support MCP Apps, use the inline preview for review and confirmation. The full course browser can also be opened from supported navigation or conversation tabs.

For weekly, search-based, or multi-file download requests, call `elearn_preview_downloads` first. Preparing a preview reads course metadata and does not download files. Let the user review the list, destination, and warnings and click **Confirm downloads** in the app. Never automatically call the legacy download tools after preparing a preview, including during scheduled runs.

- With no arguments, preview files modified this calendar week (Monday–Sunday, Asia/Singapore) across pinned courses.
- For a search term, pass `query`. This searches titles and module paths across all dates. Add `period: this_week` only when requested.
- For academic Week N, pass `week: N`. It is distinct from a calendar date range.
- Resolve named courses with the course-list tool, then pass their exact `courseIds`; do not guess numeric IDs. Pass `scope: all` only when all accessible courses are requested.
- If files have already been found through another workflow, pass the exact `documents` list of courseId/topicId pairs. Do not combine that list with week/date/search filters.
- Call out course retrieval failures and omitted matches. Do not describe a partial preview as a complete list.
- The UI-only `elearn_confirm_downloads` action accepts only files from the active preview. Each click confirms at most 50 files. Failed items can be retried; successfully saved items cannot be downloaded again from the same preview.
- Previews expire after 30 minutes or server restart. The user can refresh the preview, review the current list, and confirm again. No download should be triggered by refresh.

For a scheduled weekly run, prepare and report the preview, then stop for user confirmation. Do not interpret the schedule firing as confirmation. Do not change the user's automation schedule or course scope merely to use this workflow.

If the host cannot render MCP Apps, present the same file list and destination in chat. Wait for explicit user confirmation, then use the legacy download tool for only the approved files. An initial request such as "download this week's files" means prepare the preview in this workflow; it does not skip the review step.
