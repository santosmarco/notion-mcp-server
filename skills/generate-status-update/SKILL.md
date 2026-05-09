---
name: generate-status-update
description: "Generate a status update from Notion task or project data and publish it as a new page. When an agent needs to: (1) Create a status update for a project, (2) Summarize recent progress and blockers, (3) Generate weekly or daily updates from a Notion tasks database, or (4) Publish a status summary as a Notion page."
---

# Generate Status Update

## Keywords
status update, weekly status, daily standup, project summary, blockers, progress report, sprint update, publish to Notion, post a status, write a status update, summarize progress

## Overview

Query a Notion tasks data source, summarize recent activity into one of three formats (executive, team, daily standup), and publish the result as a new Notion page.

**Use this skill when:** Users want a written, sharable status update built from real task data.

**Critical discipline:** This skill is interactive. **Always confirm scope and publishing destination with the user.** Never publish silently.

---

## Workflow

1. **Identify scope** — project, time window, audience, publishing destination.
2. **Find the tasks data source** — `post-search` filtered to data sources, then `retrieve-a-data-source` for schema.
3. **Query** — multiple targeted `query-data-source` calls (completed, in progress, blocked, high priority).
4. **Analyze** — counts, top accomplishments, top blockers, at-risk items.
5. **Format** — pick the audience template.
6. **Publish** — `post-page` with the formatted body, parented under the chosen location.

---

## Step 1: Identify scope

Ask one structured question per missing dimension.

**Project / data source:**
- Which project is this for? Or which Notion database holds the tasks?

**Time window:**
- Default: last 7 days.
- Other shapes: 24h (daily), 14d (sprint), or a custom range.

**Audience:**
- **Executive / delivery manager** → 1–2 page summary, key metrics, top wins, blockers.
- **Team-level** → detailed, per-task breakdown.
- **Daily standup** → very brief: yesterday / today / blockers.

**Publishing destination:**
- Always ask: "Should I publish this to Notion? If yes, where — under a specific page, or in a 'Status updates' database?"
- Offer to skip publishing if the user just wants the text.

If the user does not specify any of these, ask. Default values get assumed only when the user explicitly skips a question.

---

## Step 2: Find the tasks data source

```
post-search(query="<project name or 'tasks'>", filter={ "value": "data_source", "property": "object" })
```

Disambiguate when multiple match. Then read the schema:

```
retrieve-a-data-source(data_source_id="<data_source_id>")
```

Identify the relevant columns:
- **Status** (`status` or `select`) — usually `Done`, `In progress`, `Blocked`, `Not started`.
- **Priority** (`select`) — values like `High`, `Medium`, `Low`.
- **Owner / Assignee** (`people`).
- **Last edited time** / **Created time** / **Done date** — built-in or custom; needed for time-window filtering.

If the schema does not have a Status property, fall back to filtering by `last_edited_time` only and tell the user the report will be activity-based, not status-based.

---

## Step 3: Query

Run several targeted queries instead of one mega-query. Each is small, fast, and easy to reason about.

**Completed in window:**
```
query-data-source(
  data_source_id="<id>",
  filter={ "and": [
    { "property": "<Status column>",       "status": { "equals": "Done" } },
    { "timestamp": "last_edited_time",     "last_edited_time": { "past_week": {} } }
  ]},
  sorts=[{ "timestamp": "last_edited_time", "direction": "descending" }],
  page_size=50
)
```

**In progress:**
```
query-data-source(
  data_source_id="<id>",
  filter={ "property": "<Status column>", "status": { "equals": "In progress" } },
  sorts=[{ "timestamp": "last_edited_time", "direction": "descending" }],
  page_size=50
)
```

**Blocked:**
```
query-data-source(
  data_source_id="<id>",
  filter={ "property": "<Status column>", "status": { "equals": "Blocked" } },
  page_size=50
)
```

**High priority and still open:**
```
query-data-source(
  data_source_id="<id>",
  filter={ "and": [
    { "property": "<Priority column>", "select": { "equals": "High" } },
    { "property": "<Status column>",   "status": { "does_not_equal": "Done" } }
  ]},
  page_size=50
)
```

Adjust the time-window operator (`past_week`, `past_month`, custom `after`/`before`) to match Step 1's window.

If a query returns more than `page_size`, use `next_cursor` in a follow-up call. For most status updates, the first 50 of each bucket is enough.

---

## Step 4: Analyze

Compute:
- Counts per status (Done / In progress / Blocked / Not started).
- Top 3–5 accomplishments — completed items with the highest priority or biggest scope.
- Top 3–5 blockers — blocked items, especially high priority.
- At-risk items — high priority, in progress, last edited > 7 days ago.
- Owner concentration — one assignee with many in-progress items is worth flagging.

For each item, capture: title (from the title property), URL (constructed from page id), owner, status, priority.

If the result set for a bucket is empty, say so explicitly in the report — do not paper over it.

---

## Step 5: Format

Pick the template based on Step 1's audience.

### Executive / delivery manager

```markdown
# <Project> — Status Update — <Date>

**Overall:** 🟢 On track  |  🟡 At risk  |  🔴 Blocked

**By the numbers:**
- Completed (last <window>): N
- In progress: N
- Blocked: N
- High priority open: N

## Highlights
- <Top accomplishment 1> — <task URL>
- <Top accomplishment 2> — <task URL>
- <Top accomplishment 3> — <task URL>

## Blockers
- <Blocked item> (<owner>) — <one-line reason or "needs decision"> — <task URL>
- <Blocked item> (<owner>) — <reason> — <task URL>

## Coming up
- <High-priority next item> — <task URL>
- <High-priority next item> — <task URL>
```

### Team-level

Same as executive plus a per-status breakdown listing every relevant item:

```markdown
## Done this <window>
- [<Title>](<URL>) — <owner>

## In progress
- [<Title>](<URL>) — <owner>, <priority>

## Blocked
- [<Title>](<URL>) — <owner>, <reason>
```

### Daily standup

```markdown
# <Project> — Standup — <Date>

**Yesterday**
- <Title> — <owner>
- <Title> — <owner>

**Today**
- <Title> — <owner>
- <Title> — <owner>

**Blockers**
- <Title> — <owner>, <reason>
```

---

## Step 6: Publish

Convert the markdown to Notion blocks (heading_1, heading_2, paragraph, bulleted_list_item, to_do). Choose the parent based on Step 1's destination:

- **Standalone page under a parent** — `parent.page_id = <chosen parent id>`.
- **Row in a status-updates database** — `parent.database_id = <status updates data source id>`, with a Title property like `<Project> — Status — <Date>`.

```
post-page(
  parent={ "page_id": "<parent_page_id>" },
  properties={
    "title": { "title": [{ "text": { "content": "<Project> — Status Update — <YYYY-MM-DD>" } }] }
  },
  children=[
    /* one block per markdown line, mapped to the right Notion block type */
  ]
)
```

If the body has more than ~50 blocks, split: include the first 50 in `post-page`, then `patch-block-children` for the rest.

For Notion-friendly inline links, render task URLs as link_text rich-text so they render as bookmark-like inline references rather than bare URLs.

Confirm to the user:

```
Status update published: <URL>
```

---

## Edge Cases

### No tasks in the time window

Acknowledge it in the report ("No items closed in the past 7 days") and suggest widening the window. Do not silently change the window without telling the user.

### Data source has no Status property

Fall back to "edited in window" as the bucket. Tell the user up front: "This DB has no Status column, so the report is based on activity, not state."

### Owner column is `rich_text`, not `people`

Fine. Use the rich text value as a string. Skip Notion person mentions.

### User wants Slack / Email instead of Notion

Out of scope for this skill — produce the markdown anyway and tell the user how to copy it. (A future skill could extend this to publish to other surfaces.)

### Integration cannot publish

`post-page` returns a permission error → tell the user to enable `Insert content`, and offer to email / paste them the markdown so the work is not wasted.

### Data source has many sub-projects mixed together

Add a filter on a `Project` (relation or select) column up front to scope the queries before running them. If no such property exists, ask the user how to scope.

---

## When NOT to use this skill

- **One-off page creation** → use `post-page` directly.
- **Capturing action items from a meeting** → use `capture-tasks-from-meeting-notes`.
- **Searching the workspace for an answer** → use `search-workspace`.
- **Triaging an incoming bug report** → use `triage-page`.

---

## Quick Reference

**Tools used (notion-mcp-server `operationId`s):**
- `post-search`
- `retrieve-a-data-source`
- `query-data-source`
- `post-page`
- `patch-block-children` (when the body exceeds the per-request block limit)

**Discipline:**
- Always confirm scope (window, audience, destination) before querying.
- Always confirm publish vs copy-only before publishing — never write to Notion without explicit approval.
- Always include numbers from real queries, never invented metrics.
- Always link items by URL so the reader can drill in.
