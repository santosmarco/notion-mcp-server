---
name: capture-tasks-from-meeting-notes
description: "Analyze meeting notes to find action items and create tasks in a Notion database. When an agent needs to: (1) Create Notion tasks from meeting notes, (2) Extract or find action items from a Notion page or pasted text, (3) Parse meeting notes for assigned tasks, or (4) Generate tasks for team members. Identifies assignees, finds the target tasks data source, and creates rows with proper context."
---

# Capture Tasks from Meeting Notes

## Keywords
meeting notes, action items, create tasks, create tickets, extract tasks, parse notes, analyze notes, assigned work, assignees, from meeting, post-meeting, capture tasks, generate tasks, turn into tasks, convert to tasks, action item, to-do, task list, follow-up, assigned to, create Notion tasks, meeting action items, extract action items, find action items, analyze meeting

## Overview

Automatically extract action items from meeting notes and create rows in a Notion tasks database with the right assignees and context. This skill parses unstructured meeting notes (from a Notion page or pasted text), identifies action items with assignees, finds the right tasks data source in the workspace, and creates one row per action item — eliminating tedious post-meeting ticket entry.

**Use this skill when:** Users have meeting notes with action items that need to become Notion tasks.

---

## Workflow

Follow this 7-step process to turn meeting notes into actionable Notion tasks.

### Step 1: Get the meeting notes

Obtain the meeting notes from the user.

#### Option A: Notion page (URL or page ID)

If the user provides a Notion URL or a 32-character page ID, fetch the page and its block tree:

```
retrieve-a-page(page_id="...")
get-block-children(block_id="<page_id>", page_size=100)
```

If a returned block has `has_children: true` and looks substantive (toggle blocks, callouts, columns), recurse into it with another `get-block-children` call using the block's `id` so quoted action items inside toggles or callouts are not missed.

**URL patterns to recognize:**
- `https://www.notion.so/<workspace>/<title>-<page_id>` — `page_id` is the 32 hex chars at the end
- `https://www.notion.so/<page_id>` — already the bare ID

#### Option B: Pasted text

If the user pastes meeting notes directly, use the text as-is. No fetching needed.

#### If unclear

Ask: "Do you have a Notion link to the meeting notes, or would you like to paste them directly?"

---

### Step 2: Parse action items

Scan the notes for action items with assignees. The same five patterns appear across most teams.

#### Pattern 1: @mention

```
@Sarah to create user stories for chat feature
@Mike will update architecture doc
```

#### Pattern 2: Name + action verb

```
Sarah to create user stories
Mike will update the architecture doc
Lisa should review the mockups
```

#### Pattern 3: `Action: Name - Task`

```
Action: Sarah - create user stories
Action Item: Mike - update architecture
```

#### Pattern 4: TODO with assignee

```
TODO: Create user stories (Sarah)
TODO: Update docs - Mike
```

#### Pattern 5: Bullet with name

```
- Sarah: create user stories
- Mike - update architecture
```

#### Extraction logic

For each action item, extract:

1. **Assignee name** — text after `@`, before "to/will/should", after "Action:", or in parentheses.
2. **Task description** — text after the verb / dash / colon. Keep the original wording. Strip markers (`@`, `Action:`, `TODO:`).
3. **Context (optional)** — meeting title, date, surrounding decision.

#### Example

**Input:**
```
# Product Planning - Dec 3

Action Items:
- @Sarah to create user stories for chat feature
- Mike will update the architecture doc
- Lisa: review and approve design mockups
```

**Parsed:**
```
1. Assignee: Sarah    Task: Create user stories for chat feature
2. Assignee: Mike     Task: Update the architecture doc
3. Assignee: Lisa     Task: Review and approve design mockups
```

---

### Step 3: Find the tasks data source

Before creating anything, locate the data source (database) where these rows should live.

```
post-search(
  query="tasks",
  filter={ "value": "data_source", "property": "object" }
)
```

**Disambiguation rules:**
- 1 result → use it.
- Multiple results → present titles + URLs and ask the user which one.
- 0 results → ask the user for the database URL or title; if still nothing fits, offer to create the rows under a fresh page instead.

Once a candidate is selected, retrieve its schema so you can build a valid `properties` payload in Step 6:

```
retrieve-a-data-source(data_source_id="...")
```

Inspect the schema and identify (or ask the user to identify) the columns that map to:
- **Title** (always present, type `title`)
- **Assignee / Owner** (type `people`, fall back to `rich_text` if a `people` column does not exist)
- **Status** (type `status` or `select`)
- **Due date** (type `date`)
- **Source / Notes** (any `rich_text` or `url` column for back-linking the meeting page)

---

### Step 4: Resolve assignees to Notion users

For each parsed name, try to find the matching Notion user.

```
get-users(page_size=100)
```

Match by full name first, then first name, then by email if the name is a known email format. Cache results so you do not call `get-users` per-assignee.

**Result handling:**
- **Exact match** → use that user's `id` for a `people` property value.
- **No match** → ask: "I could not find `<name>` in this workspace. Want me to (1) create the task unassigned, (2) skip it, or (3) try a different name?"
- **Multiple matches** → list them with email and ask which one.
- **Workspace has no `people` column** → store the name as plain text in the title or in the source/notes column and surface that this row is unassigned in Notion's people sense.

---

### Step 5: Present action items for confirmation

**Always show the parsed action items before creating any rows.** Never write silently.

Format:

```
I found N action items from the meeting notes. Should I create these tasks in `<Tasks DB title>`?

1. [Task] Create user stories for chat feature
   Assigned to: Sarah Johnson
   Source: <meeting page URL>

2. [Task] Update the architecture doc
   Assigned to: Mike Chen
   Source: <meeting page URL>

3. [Task] Review and approve design mockups
   Assigned to: Lisa Park
   Source: <meeting page URL>

Proceed? (yes / skip a number / edit a number)
```

Wait for confirmation. Honor edits, skips, and assignee changes before any write.

---

### Step 6: Create the rows

For each confirmed action item, create one page parented to the data source:

```
post-page(
  parent={ "database_id": "<data_source_id>" },
  properties={
    "<Title column name>":    { "title":      [{ "text": { "content": "<Task description>" } }] },
    "<Assignee column name>": { "people":     [{ "id": "<user_id>" }] },
    "<Status column name>":   { "status":     { "name": "Not started" } },
    "<Source column name>":   { "url":        "<meeting page URL>" }
  },
  children=[
    {
      "object": "block",
      "type":   "paragraph",
      "paragraph": {
        "rich_text": [{ "type": "text", "text": { "content": "Captured from <meeting title> on <date>." } }]
      }
    },
    {
      "object": "block",
      "type":   "quote",
      "quote": {
        "rich_text": [{ "type": "text", "text": { "content": "<Original action item line, verbatim>" } }]
      }
    }
  ]
)
```

Notes:
- The `parent.database_id` value is the **data source id**, not the legacy database id, in the 2025-09-03 API. `retrieve-a-data-source` gives you the right value.
- Only include columns that exist in the schema. Skip the assignee mapping if the workspace has no `people` column.
- Default Status / Priority to whatever the schema's first option is if the user has not specified one.

---

### Step 7: Provide a summary

After all writes succeed, list what was created with links.

```
Created N tasks in `<Tasks DB title>`:

1. <Task title>      <page URL>
2. <Task title>      <page URL>
3. <Task title>      <page URL>

Source: <meeting page URL>

Next steps:
- Review tasks in Notion for accuracy
- Adjust due dates or priorities if needed
- Link related pages or projects
```

---

## Edge Cases

### Workspace has multiple "Tasks" databases

`post-search` will return all of them. Show a numbered list with the URL of each, ask the user to pick, and remember the choice for the rest of this session.

### The integration cannot read the page

If `retrieve-a-page` returns a permission error, the integration is not connected to that page. Tell the user: "I do not have access to that page. In Notion, open the page → ··· → Connections, and add this integration."

### The schema requires a property we cannot infer

If `post-page` fails with `validation_error` mentioning a required column, surface the column name and ask the user for a value (or to make the column optional). Do not silently fill in a guess.

### The integration lacks `Insert content` capability

If `post-page` fails with a permission / capability error, tell the user: "This integration only has read access. In Notion, open the integration's Capabilities tab and enable `Insert content`."

### Assignee name is ambiguous (two Sarahs)

Ask the user. Do not assume the more recently active user.

### Action items reference a date ("by Friday")

If a `date` column exists in the schema, parse the date and include it in `properties`. If parsing is ambiguous, drop the date silently rather than guess wrong — surface a one-line note in the summary that two of N items had unparseable dates.

---

## When NOT to use this skill

- **Generic page creation** → use `post-page` directly.
- **Spec breakdown into a project + child tasks** → use `spec-to-implementation`.
- **Status update from existing tasks** → use `generate-status-update`.
- **Searching the workspace for information** → use `search-workspace`.

---

## Quick Reference

**Tools used (notion-mcp-server `operationId`s):**
- `retrieve-a-page`
- `get-block-children`
- `post-search`
- `retrieve-a-data-source`
- `get-users`
- `post-page`

**Workflow shape:** Get notes → Parse → Find DB → Resolve assignees → Confirm → Create → Summarize.

**Discipline:**
- Always confirm parsed items before writing.
- Always include the source page URL in the new row.
- Never silently invent assignees, dates, or property values.
