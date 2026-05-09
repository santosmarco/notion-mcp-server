---
name: triage-page
description: "Triage incoming reports against existing Notion content — search for similar pages or database rows, then either add a comment to the existing match or create a new page. When an agent needs to: (1) Check whether an issue or question has already been documented, (2) Find similar existing Notion pages, (3) Add a comment to a match with new context, or (4) Create a new page when no match exists."
---

# Triage Page

## Keywords
triage, duplicate check, similar pages, find duplicate, existing report, add comment, file new, regression, document an issue, check if reported, dedupe, has this been reported

## Overview

When a user reports a bug, question, or issue, search the Notion workspace for similar existing content first. If a strong match exists, add a comment to it with the new context. If not, create a new page with the report formatted for future triage.

**Use this skill when:** Users want to log an issue or report and you need to avoid creating duplicates.

---

## Workflow

Follow this 6-step process:

1. **Extract search terms** — pull the distinctive nouns, error messages, and component names from the user's report.
2. **Search the workspace** — `post-search`, then narrow with `query-data-source` if the report likely lives in a known database.
3. **Evaluate matches** — score the top hits, fetch detail for the best 1–3.
4. **Decide and present** — recommend `comment on existing` vs `create new`, ask the user to confirm.
5. **Execute** — `create-a-comment` on the existing page, or `post-page` with the new report.
6. **Summarize** — return the page URL, the comment URL (if applicable), and any related pages worth knowing about.

---

## Step 1: Extract search terms

From the user's report, pull:
- **Error messages or exception classes** — these are highly distinctive (`NullPointerException`, `connection refused`).
- **Component names** — service names, feature names ("checkout", "search bar", "billing webhook").
- **Distinctive nouns** — user types, environment names ("EU customers", "iOS app").
- **Symptoms in plain English** — "infinite loading", "404", "missing rows".

Drop filler words (the, a, our, my, is, was). Keep search-friendly content words.

**Example:**
- Report: "Mobile users on iOS get a connection timeout when logging in after the latest update"
- Terms: `mobile login`, `iOS`, `connection timeout`, `login`, `latest update`

---

## Step 2: Search the workspace

Start broad:

```
post-search(query="<extracted terms joined with spaces>")
```

Run it once with the full query. If the result set looks heavy with one type, narrow with the appropriate filter:

```
post-search(query="<terms>", filter={ "value": "page",        "property": "object" })
post-search(query="<terms>", filter={ "value": "data_source", "property": "object" })
```

If the user has indicated a specific bug-tracker database (or it is obvious from the workspace name like "Bugs" or "Issues"), drill into it:

```
retrieve-a-data-source(data_source_id="<bugs_db_id>")
query-data-source(
  data_source_id="<bugs_db_id>",
  filter={ "or": [
    { "property": "<Title column>",      "title":      { "contains": "<key term 1>" } },
    { "property": "<Description column>", "rich_text": { "contains": "<key term 2>" } }
  ]},
  page_size=20
)
```

If the first round returns nothing useful, retry with a narrower or alternate phrasing of the terms before giving up.

---

## Step 3: Evaluate matches

For the top 1–3 candidates, fetch the page body so you have enough context to score similarity:

```
retrieve-a-page(page_id="<id>")
get-block-children(block_id="<id>", page_size=50)
```

Score each candidate on:
- **Same component / area?** — same feature, service, or workflow.
- **Same symptom?** — same error message, same broken behavior.
- **Recency** — created or updated in the last 30 days is a stronger duplicate signal than something a year old.
- **Status** — open vs done. A "done" match with the same symptoms is a possible regression (handle below).

Map scores to a recommendation:
- **Strong match** (≥ 2 of: same component, same symptom, recent) → recommend commenting.
- **Weak match** → recommend a new page that links to the related candidate.
- **No match** → recommend a new page on its own.

---

## Step 4: Present and decide

Always show the user the top candidates and your recommendation **before** writing.

```
I searched the workspace for "<query>" and found these candidates:

1. <Page title> — <status>, updated <when>     <URL>
   Why it matches: same component, same error message, opened 2 days ago
   → Recommended: add a comment with your details.

2. <Page title> — Done, resolved 3 months ago  <URL>
   Why it matches: same symptoms but already resolved
   → Could be a regression; recommend a new page that references this one.

3. <Page title> — Open, low confidence         <URL>
   Why it matches: shares only the component name

What should I do?
  (A) Comment on #1
  (B) Create a new page (linking #2 as a possible regression)
  (C) Other / let me look first
```

Wait for the choice. Do not assume.

---

## Step 5: Execute

### A: Comment on an existing page

```
create-a-comment(
  parent={ "page_id": "<existing_page_id>" },
  rich_text=[
    { "type": "text", "text": { "content": "Additional report received:\n\n<verbatim user report>\n\nReproduction:\n<steps if provided>\nEnvironment: <details>\n" } }
  ]
)
```

Confirm: `Comment added to <page title>: <URL>`.

### B: Create a new page

Pick a parent location:
- If the user has a bugs / issues database and you found it in Step 2, parent the new row there: `parent.database_id = <bugs_db_id>`.
- Otherwise, parent under a sensible page (the team's "Triage" or "Reports" page if it exists; the workspace root if not). Ask the user when in doubt.

```
post-page(
  parent={ "database_id": "<bugs_db_id>" },
  properties={
    "<Title column>":  { "title":  [{ "text": { "content": "<Component>: <symptom in <= 80 chars>" } }] },
    "<Status column>": { "status": { "name": "Open" } },
    "<Priority column>": { "select": { "name": "<inferred from impact>" } }
  },
  children=[
    { "object": "block", "type": "heading_2", "heading_2": { "rich_text": [{ "type": "text", "text": { "content": "Issue description" } }] } },
    { "object": "block", "type": "paragraph", "paragraph": { "rich_text": [{ "type": "text", "text": { "content": "<short summary>" } }] } },

    { "object": "block", "type": "heading_2", "heading_2": { "rich_text": [{ "type": "text", "text": { "content": "Error details" } }] } },
    { "object": "block", "type": "code",      "code":      { "language": "plain text", "rich_text": [{ "type": "text", "text": { "content": "<error message or stack trace>" } }] } },

    { "object": "block", "type": "heading_2", "heading_2": { "rich_text": [{ "type": "text", "text": { "content": "Environment" } }] } },
    { "object": "block", "type": "bulleted_list_item", "bulleted_list_item": { "rich_text": [{ "type": "text", "text": { "content": "Platform: <platform>" } }] } },
    { "object": "block", "type": "bulleted_list_item", "bulleted_list_item": { "rich_text": [{ "type": "text", "text": { "content": "Version: <version>" } }] } },

    { "object": "block", "type": "heading_2", "heading_2": { "rich_text": [{ "type": "text", "text": { "content": "Steps to reproduce" } }] } },
    { "object": "block", "type": "numbered_list_item", "numbered_list_item": { "rich_text": [{ "type": "text", "text": { "content": "<Step 1>" } }] } },

    { "object": "block", "type": "heading_2", "heading_2": { "rich_text": [{ "type": "text", "text": { "content": "Related pages" } }] } },
    { "object": "block", "type": "bookmark",  "bookmark": { "url": "<related candidate URL>" } }
  ]
)
```

Skip sections that the user did not provide (do not invent steps to reproduce). If you flagged a possible regression in Step 4, the related page bookmark belongs in the body so the next reader sees the connection immediately.

---

## Step 6: Summarize

```
✓ Comment added to <page title>: <URL>
  - The comment is now visible in the page's discussion thread
  - Anyone watching the page (or with it open) will see the new comment

  Related context I noticed during search:
  - <Page title>: <URL> — possibly the same root cause from 3 months ago
```

Or, for a new page:

```
✓ Created new page: <title>
  <URL>

  Related pages I found during search:
  - <Page title>: <URL>  (possible regression)
  - <Page title>: <URL>  (similar component)

  Next steps:
  - Triage the new page (set priority / assign owner)
  - Close as duplicate later if a better match surfaces
```

---

## Edge Cases

### 3+ very similar candidates

Show them all (up to 5) with a similarity score and ask the user which to use. Better to ask than to silently pick.

### A "Done" match with the same symptoms

This is the regression case. Recommend a new page (Step 5B) and link the resolved page in the body so the assignee can compare the original fix.

### No bugs / issues database in the workspace

Ask the user where the new page should live. Default to "Workspace root" only if the user explicitly waives a parent.

### Insufficient information in the report

If the report has no error message, no component, no environment, and no symptom — ask one targeted question before searching: "What part of the product is affected, and what is the symptom?" Better than searching with garbage terms.

### `create-a-comment` fails

Comments require the integration to have `Insert content` capability. If it returns a permission error, fall back to `post-page` with the new context as a child page under the existing one — and surface the workaround to the user so they know to grant comment permission for next time.

### The schema requires fields you cannot infer

Same as in `spec-to-implementation`: pause, ask the user for a value, do not guess.

---

## When NOT to use this skill

- **General workspace search** for information → use `search-workspace`.
- **Capturing meeting action items** → use `capture-tasks-from-meeting-notes`.
- **Breaking a spec into tasks** → use `spec-to-implementation`.
- **Answering "what is X"** without a write → use `search-workspace`.

---

## Quick Reference

**Tools used (notion-mcp-server `operationId`s):**
- `post-search`
- `query-data-source`
- `retrieve-a-data-source`
- `retrieve-a-page`
- `get-block-children`
- `create-a-comment`
- `post-page`

**Workflow shape:** Extract → Search → Evaluate → Present → Execute → Summarize.

**Discipline:**
- Multiple search angles catch more duplicates than one big query.
- Always present matches before writing.
- Treat resolved matches as possible regressions, not duplicates.
- Never invent reproduction steps, environments, or property values.
