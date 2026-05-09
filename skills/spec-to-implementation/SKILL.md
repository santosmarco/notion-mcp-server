---
name: spec-to-implementation
description: "Turn a Notion specification page into structured implementation work — a parent project page plus tasks created in a Notion database. When an agent needs to: (1) Create Notion tasks from a spec page, (2) Generate a backlog from a specification, (3) Break down a spec into implementation tasks, or (4) Convert requirements into Notion database rows linked to a parent project page."
---

# Spec to Implementation

## Keywords
spec to tasks, spec to backlog, break down spec, implementation plan, project breakdown, generate backlog, convert spec, parent project page, child tasks, requirements to tasks, build a backlog, create implementation tasks, decompose spec

## Overview

Read a Notion specification page, decompose it into implementation tasks, create a parent project page that captures the breakdown, and create one row per task in a Notion tasks data source — all linked back to the spec.

**Use this skill when:** Users have a spec page in Notion and want it turned into a real, trackable backlog.

---

## Core workflow

**Always follow this order. The parent project page must exist before any child tasks.**

1. **Fetch the spec** — `retrieve-a-page` + `get-block-children` (recurse into nested blocks).
2. **Pick the tasks data source** — `post-search` filtered to `data_source`, then `retrieve-a-data-source` for the schema.
3. **Analyze and propose a breakdown** — internally pick 3–10 tasks; do not write yet.
4. **Present the breakdown** — show the user the planned project page and task list, wait for approval.
5. **Create the parent project page first** — `post-page` with the breakdown rendered as blocks.
6. **Create child task rows** — one `post-page` per task, parented to the data source, linked back to the project page if a relation column exists.
7. **Provide a summary** — list every page created, with URLs.

**Why parent first:** child rows reference the project page in their relation/source column. Creating tasks first leaves them orphaned.

---

## Step 1: Fetch the spec

If the user gives a Notion URL or a 32-char page ID:

```
retrieve-a-page(page_id="<page_id>")
get-block-children(block_id="<page_id>", page_size=100)
```

If a top-level block has `has_children: true` (toggle, callout, column, synced block), recurse into it with another `get-block-children` call. Stop recursing at obvious leaf blocks (paragraph, heading, list item without children).

If the user gives only a title or rough description:

```
post-search(query="<title>", filter={ "value": "page", "property": "object" })
```

If multiple pages match, list them and ask which one.

---

## Step 2: Pick the tasks data source

Find the right data source for the new tasks:

```
post-search(query="tasks", filter={ "value": "data_source", "property": "object" })
```

Disambiguate by asking the user when there are multiple plausible matches.

Then read the schema:

```
retrieve-a-data-source(data_source_id="<data_source_id>")
```

Identify the relevant columns and store the column-name → property-type mapping for use in Step 6:

- **Title** (`title`)
- **Status** (`status` or `select`)
- **Owner / Assignee** (`people`, optional)
- **Type** (`select`, optional — values like Task / Story / Bug)
- **Project / Parent** (`relation`, optional — used to link back to the project page)
- **Source** (`url` or `rich_text`, optional — used to link back to the spec)

Note which columns are required (`required: true` in the schema) so Step 6 always supplies them.

---

## Step 3: Analyze the spec

Decompose the spec into:

### One project-level goal

The headline outcome of the spec. Examples:
- "Notifications system v1"
- "Dashboard load time under 1s"
- "OAuth login for the mobile app"

This becomes the parent project page's title.

### 3–10 implementation tasks

Each task should be:
- Focused on one component, behavior, or seam
- Independently shippable when possible
- Specific enough that an engineer can start without re-reading the spec
- Action-verb-led ("Implement notification preferences API", not "Notifications API")

**Cover all needed surfaces.** A typical breakdown spans backend, frontend, data, infra, and tests in proportion to the spec.

**Pick a Type for each task** when the schema has a Type/Select column:
- **Bug** — fixes existing broken behavior. Keywords: fix, resolve, regression.
- **Story** — new user-facing capability. Keywords: user can, add ability to, enable.
- **Task** — technical / infra / docs work without direct user impact. Keywords: configure, optimize, refactor, document.

When in doubt, default to whatever the data source's first Type option is.

---

## Step 4: Present the breakdown for approval

Always show the planned project page + task list before writing.

```
I have analyzed the spec. Here is what I would create:

Parent project page (under <chosen parent location>):
  Title: <project goal>
  Body: overview, success criteria, scope, links

Tasks (in `<Tasks DB title>`):
1. [Story]   Implement notification preferences API
2. [Task]    Add SendGrid integration to the worker
3. [Story]   Build the notification bell UI component
4. [Story]   Add the preferences page UI
5. [Task]    Write integration tests for the dispatch path
6. [Task]    Document the notification webhook contract

Proceed? (yes / change task N / drop task N / add a task)
```

Honor edits, drops, and additions. Only proceed once the user approves.

---

## Step 5: Create the parent project page first

Choose a parent location:
- If the spec page is under a workspace folder or project area, parent the project page to the same parent (`parent.page_id = <spec parent>`).
- If the user has a "Projects" page or database, prefer that.
- Otherwise, parent to the spec page itself (`parent.page_id = <spec_page_id>`) so the project page sits under the spec for context.

```
post-page(
  parent={ "page_id": "<parent_page_id>" },
  properties={
    "title": { "title": [{ "text": { "content": "<Project goal>" } }] }
  },
  children=[
    { "object": "block", "type": "heading_2",  "heading_2":  { "rich_text": [{ "type": "text", "text": { "content": "Overview" } }] } },
    { "object": "block", "type": "paragraph",  "paragraph":  { "rich_text": [{ "type": "text", "text": { "content": "<1-2 sentence summary of what this project delivers>" } }] } },
    { "object": "block", "type": "heading_2",  "heading_2":  { "rich_text": [{ "type": "text", "text": { "content": "Source spec" } }] } },
    { "object": "block", "type": "bookmark",   "bookmark":   { "url": "<spec page URL>" } },
    { "object": "block", "type": "heading_2",  "heading_2":  { "rich_text": [{ "type": "text", "text": { "content": "Implementation tasks" } }] } },
    { "object": "block", "type": "numbered_list_item", "numbered_list_item": { "rich_text": [{ "type": "text", "text": { "content": "<Task 1 title>" } }] } }
    /* ...one numbered_list_item per task... */
  ]
)
```

Capture the new page's `id` from the response — Step 6 needs it for the relation link.

If the body block list is long, split it into batches: include the first 50 blocks in `post-page`, then `patch-block-children` for the rest. (Notion's API limits the children array per request.)

Confirm to the user: `Created project page: <URL>`.

---

## Step 6: Create child task rows

For each approved task:

```
post-page(
  parent={ "database_id": "<data_source_id>" },
  properties={
    "<Title column>":  { "title":  [{ "text": { "content": "<Task title>" } }] },
    "<Status column>": { "status": { "name": "Not started" } },
    "<Type column>":   { "select": { "name": "<Story|Task|Bug>" } },
    "<Project column>": { "relation": [{ "id": "<project_page_id>" }] },
    "<Source column>":  { "url": "<spec page URL>" }
  },
  children=[
    { "object": "block", "type": "heading_3", "heading_3": { "rich_text": [{ "type": "text", "text": { "content": "Context" } }] } },
    { "object": "block", "type": "paragraph", "paragraph": { "rich_text": [{ "type": "text", "text": { "content": "<1-2 sentences of context from the spec>" } }] } },
    { "object": "block", "type": "heading_3", "heading_3": { "rich_text": [{ "type": "text", "text": { "content": "Acceptance criteria" } }] } },
    { "object": "block", "type": "to_do",      "to_do":     { "rich_text": [{ "type": "text", "text": { "content": "<Testable outcome 1>" } }], "checked": false } },
    { "object": "block", "type": "to_do",      "to_do":     { "rich_text": [{ "type": "text", "text": { "content": "<Testable outcome 2>" } }], "checked": false } }
  ]
)
```

**Property mapping rules:**
- Skip the relation column if the schema has none — the bookmark in the project page body still links back, and the spec URL is in the Source column.
- Skip the Type column if absent.
- If the schema has a required column you cannot infer (e.g. "Sprint", "Squad"), pause and ask the user for a default value before continuing.

For larger backlogs (10+ tasks), batch in groups of 5 and confirm between batches:
"Created 5 of 10 tasks. Continue with the next 5?"

---

## Step 7: Provide a summary

```
Backlog created.

Project page: <URL>

Tasks (N):
1. [Story]  Implement notification preferences API   <task URL>
2. [Task]   Add SendGrid integration to the worker   <task URL>
...

Source spec: <URL>

Next steps:
- Review tasks for accuracy
- Assign owners
- Add estimates / dates if your team uses them
- Schedule for the next sprint
```

---

## Edge Cases

### Spec is light on detail

Create fewer, broader tasks (3–5) and note in each: "Detailed requirements need to be defined during refinement." Tell the user explicitly that the breakdown is coarse on purpose.

### Spec spans multiple Notion pages

Ask: "Should I treat each linked page as a separate project, or roll them into one?" Default to one project unless the user says otherwise.

### Existing project page

If the user wants to add tasks to a project that already exists, skip Step 5. Ask for the project page ID, then go straight to Step 6 with that ID in the relation property.

### Required schema property cannot be inferred

`post-page` returns `validation_error` listing the missing property. Pause, ask the user for a value, and apply it to every remaining task in the batch.

### Integration is read-only

`post-page` returns a permission / capability error. Tell the user: "This integration only has read access. In Notion → Settings → Integrations → this integration → Capabilities, enable `Insert content`."

### Data source's `database_id` and `data_source_id` look different

In the 2025-09-03 API, a database can hold multiple data sources. Always use the **data source id** (from `retrieve-a-database` → `data_sources[].id`, or directly from `post-search` results where `object == "data_source"`). Using the legacy `database_id` will fail.

---

## When NOT to use this skill

- **Single ad-hoc task** → use `capture-tasks-from-meeting-notes` or `post-page` directly.
- **Documentation page** → use `post-page` directly.
- **Searching for an existing spec** → use `search-workspace`.
- **Status report on existing tasks** → use `generate-status-update`.

---

## Quick Reference

**Tools used (notion-mcp-server `operationId`s):**
- `retrieve-a-page`
- `get-block-children`
- `post-search`
- `retrieve-a-data-source`
- `post-page`
- `patch-block-children` (for project pages with long bodies)
- `retrieve-a-database` (when distinguishing database vs data_source IDs)

**Discipline:**
- Always create the parent project page **before** child tasks.
- Always present the breakdown for approval before writing.
- Always link tasks back to both the project page (relation) and the spec (URL).
- Never invent property values for required columns the spec does not specify.
