---
title: "feat: Add Cursor and Claude Code plugin tool UIs (skills) for notion-mcp-server"
type: feat
status: active
date: 2026-05-09
---

# feat: Add Cursor and Claude Code plugin tool UIs (skills) for notion-mcp-server

## Summary

Bundle the notion-mcp-server as an installable Cursor plugin and Claude Code plugin / marketplace package, with a `skills/` collection that wraps the 22 raw Notion MCP tools into 5 high-leverage workflow skills (capture tasks from meeting notes, spec to implementation, triage page, generate status update, search workspace). Mirrors the shape Atlassian shipped at `atlassian/atlassian-mcp-server` (`.cursor-plugin/plugin.json`, `.claude-plugin/{plugin.json,marketplace.json}`, `.mcp.json`, `skills/<name>/SKILL.md`) so users can install once and get both server + curated workflows.

---

## Problem Frame

Today the notion-mcp-server ships only the raw OpenAPI-derived tools (e.g. `post-search`, `query-data-source`, `post-page`). Each agent has to re-invent multi-step workflows from scratch — fetch a page, parse for action items, look up a tasks database, create rows, format response — and there is no install-once package for Cursor or Claude Code that bundles the server with curated workflows.

Atlassian solved the same problem in their MCP repo by shipping a Cursor / Claude Code plugin scaffold plus a `skills/` directory of opinionated workflows on top of their raw Jira/Confluence tools. We want the same shape for Notion.

---

## Requirements

- R1. Cursor users can install the plugin from this repo (via Cursor's plugin/marketplace install flow) and get both the MCP server registration and the bundled skills.
- R2. Claude Code users can install via the Claude Code plugin marketplace and get both the MCP server registration and the bundled skills.
- R3. Skills follow the same shape as Atlassian's: a YAML frontmatter (`name`, `description`) + markdown body (Overview, Workflow, Examples, Edge cases, Quick reference) and may include `references/` and `scripts/` subdirectories when useful.
- R4. The bundled `.mcp.json` works for the local stdio transport that notion-mcp-server already supports — no separate hosted endpoint is assumed (Notion MCP local is the in-repo product; the hosted remote MCP is documented separately in `README.md`).
- R5. Skills reference the actual `operationId`s exported by `scripts/notion-openapi.json` (e.g. `post-search`, `query-data-source`, `post-page`, `patch-page`, `patch-block-children`) — no invented tool names.
- R6. `README.md` documents how to install the plugin in Cursor and in Claude Code, alongside the existing manual `mcp.json` snippets.

---

## Scope Boundaries

- No changes to the OpenAPI spec, parser, proxy, or HTTP client. Skills are pure markdown that ride on existing tools.
- No new MCP transport, no new auth flow, no API surface changes.
- No skill that requires Notion endpoints we do not expose (e.g. no "delete an entire database" skill — we don't expose that).
- Skills are written for the local stdio server bundled in this repo; if the user prefers the hosted Notion remote MCP (https://developers.notion.com/docs/mcp), the same skills still apply but server config is the user's choice — we don't ship a remote `.mcp.json` variant.
- No automated tests for skill markdown content (skills are prose, not code). Lint the JSON manifests instead.

### Deferred to Follow-Up Work

- Publishing the plugin to a public Cursor / Claude Code marketplace registry: out of scope, this PR only ships the in-repo manifests so users can install from a local clone or git source.
- Translations / localized skill copy: English only.
- A `gemini-extension.json` analog: Atlassian ships one, but Gemini extension format and discoverability are not stable enough to justify shipping today; track separately.

---

## Context & Research

### Relevant Code and Patterns

- `scripts/notion-openapi.json` — source of truth for tool names. Skills must reference the `operationId`s here (`post-search`, `query-data-source`, `retrieve-a-data-source`, `post-page`, `patch-page`, `patch-block-children`, `create-a-comment`, `move-page`, etc.).
- `src/init-server.ts`, `src/openapi-mcp-server/mcp/proxy.ts`, `src/openapi-mcp-server/openapi/parser.ts` — operationId is what becomes the MCP tool name; skills must match exactly.
- `README.md` — has `.cursor/mcp.json` and `claude_desktop_config.json` snippets we will keep, plus add a "Install as a plugin" section.
- `package.json` — existing `bin: { "notion-mcp-server": "bin/cli.mjs" }`; the bundled `.mcp.json` will use `npx -y @notionhq/notion-mcp-server` for portability (works without local clone) and reuses the `NOTION_TOKEN` env contract already in `README.md`.

### External References

- Atlassian's reference shape: https://github.com/atlassian/atlassian-mcp-server
  - `.cursor-plugin/plugin.json` — flat manifest with `name`, `displayName`, `description`, `version`, `author`, `homepage`, `repository`, `license`, `keywords`, `logo`, and pointers `skills: "./skills/"`, `mcp: "./.mcp.json"`.
  - `.claude-plugin/plugin.json` — minimal `{name, description, author, mcpServers: "./.mcp.json", skills: "./skills/"}`.
  - `.claude-plugin/marketplace.json` — `$schema: anthropic.com/claude-code/marketplace.schema.json`, with a `plugins[]` array entry pointing `source: "./"`.
  - `.mcp.json` — `{ "mcpServers": { "<name>": { "type": "http"|"stdio", ... } } }`.
  - Skill format: `SKILL.md` with `---\nname: …\ndescription: "When an agent needs to: (1)…(2)…(3)…(4)…"\n---` frontmatter, then `# Title`, optional `## Keywords`, `## Overview`, `## Workflow` (numbered steps), worked examples, edge cases, "When NOT to use", quick reference. Long supporting material lives under `skills/<name>/references/` and helper code under `skills/<name>/scripts/`.

### Institutional Learnings

- The user already has personal Notion-flavored skills installed at `~/.claude/skills` and `~/.codex/skills` (e.g. `create-task`, `spec-to-implementation`, `knowledge-capture`, `find`, `search`, `database-query`, `meeting-intelligence`). Those are the user's personal layer; the repo-bundled skills should be opinionated but generic enough that any agent (Claude Code, Cursor, Codex via plugin) gets a useful out-of-box layer without colliding with the user's personal copies (different names, broader scope).

---

## Key Technical Decisions

- **Bundled `.mcp.json` uses `npx -y @notionhq/notion-mcp-server` with `NOTION_TOKEN` env**, mirroring the recommended snippet already in `README.md`. Avoids forcing a local clone, works in both Cursor and Claude Code plugin install flows.
- **Stdio transport, not the hosted remote MCP.** The repo is the local server's home; users who prefer the hosted Notion MCP can swap the `.mcp.json` after install. We document both in `README.md`.
- **Five skills, not the full Atlassian set.** Five is enough to demonstrate the shape and cover the most common Notion workflows (capture, spec, triage, status, search) without bloating the PR. Each skill is self-contained markdown.
- **Skill names are kebab-case and Notion-flavored** (`capture-tasks-from-meeting-notes`, `spec-to-implementation`, `triage-page`, `generate-status-update`, `search-workspace`) — overlap with the user's personal `~/.claude/skills` is intentional where the workflow is identical (Atlassian did the same with `capture-tasks-from-meeting-notes`); divergent names where the workflow shape differs.
- **No `references/` or `scripts/` subdirectories in v1.** Keep PR small and focused; the SKILL.md body is rich enough on its own. Future PRs can split out CQL/JQL-style helpers if a skill grows.
- **License field in `.cursor-plugin/plugin.json` matches the repo's `MIT`** (per `package.json` and `LICENSE`).
- **No `version` bump in `package.json`.** The plugin manifests carry their own `version: "0.1.0"` for plugin marketplaces; npm package version is unrelated.

---

## Open Questions

### Resolved During Planning

- Q: Should we ship a `gemini-extension.json` like Atlassian? → No, deferred (see Scope Boundaries).
- Q: Should the bundled `.mcp.json` use stdio or http? → Stdio, matching the local server this repo ships.
- Q: How many skills for v1? → Five, covering the highest-leverage Notion workflows.

### Deferred to Implementation

- Whether `.claude-plugin/marketplace.json` `plugins[].version` should track `package.json` version or stay independent — pick `0.1.0` to match the plugin manifest version, but reconsider if Anthropic's marketplace schema requires sync with npm version.
- Exact wording of the README "Install as a plugin" section — write during the README update unit, refine if the install UX in Cursor changed since the Atlassian repo's manifest was authored.

---

## Output Structure

    .cursor-plugin/
      plugin.json
    .claude-plugin/
      plugin.json
      marketplace.json
    .mcp.json
    skills/
      capture-tasks-from-meeting-notes/
        SKILL.md
      spec-to-implementation/
        SKILL.md
      triage-page/
        SKILL.md
      generate-status-update/
        SKILL.md
      search-workspace/
        SKILL.md

(Plus a new "Install as a plugin" section appended to `README.md`.)

---

## Implementation Units

### U1. Bundle plugin manifests and root `.mcp.json`

**Goal:** Make the repo installable as a Cursor plugin and a Claude Code plugin/marketplace entry, pointing at the bundled stdio MCP server config.

**Requirements:** R1, R2, R4

**Dependencies:** None

**Files:**
- Create: `.cursor-plugin/plugin.json`
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `.mcp.json`

**Approach:**
- `.cursor-plugin/plugin.json` mirrors Atlassian's shape: `name: "notion"`, `displayName: "Notion"`, `description`, `version: "0.1.0"`, `author: { name, url }`, `homepage`, `repository`, `license: "MIT"`, `keywords: ["notion","mcp","pages","databases","skills"]`, `skills: "./skills/"`, `mcp: "./.mcp.json"`. Skip `logo` for now (no SVG asset shipped — track separately).
- `.claude-plugin/plugin.json`: `{ "name": "notion", "description", "author": { "name": "Notion" }, "mcpServers": "./.mcp.json", "skills": "./skills/" }`.
- `.claude-plugin/marketplace.json`: `$schema` per Anthropic, `name: "notion"`, `owner`, `plugins[]` with one entry: `name: "notion"`, `description`, `version: "0.1.0"`, `author`, `source: "./"`, `category: "productivity"`, `homepage`.
- `.mcp.json` uses stdio:
  ```json
  {
    "mcpServers": {
      "notion": {
        "command": "npx",
        "args": ["-y", "@notionhq/notion-mcp-server"],
        "env": { "NOTION_TOKEN": "${NOTION_TOKEN}" }
      }
    }
  }
  ```
  This matches the recommended snippet in `README.md` and works without a local checkout.

**Patterns to follow:**
- Atlassian's manifests (see Context & Research). Keep the shape literal — Cursor/Claude Code marketplace tooling is allergic to extra unknown keys.

**Test scenarios:**
- Happy path: `jq . .cursor-plugin/plugin.json` parses; same for `.claude-plugin/*.json` and `.mcp.json`.
- Edge case: every relative path referenced (`./skills/`, `./.mcp.json`, `./`) actually resolves to a file or directory after U2 lands.
- Test expectation: JSON syntax + path-resolution check via shell, no unit tests.

**Verification:**
- `find .cursor-plugin .claude-plugin .mcp.json -type f | xargs -I {} jq -e . {} >/dev/null` exits 0.
- All `./skills/`, `./.mcp.json`, `./` references resolve.

---

### U2. Skill: `capture-tasks-from-meeting-notes`

**Goal:** Take a Notion page (or pasted meeting notes), parse action items with assignees, find a target tasks data source in the user's workspace, and create one row per action item.

**Requirements:** R3, R5

**Dependencies:** None (skills are independent)

**Files:**
- Create: `skills/capture-tasks-from-meeting-notes/SKILL.md`

**Approach:**
- YAML frontmatter: `name`, `description: "Analyze meeting notes to find action items and create tasks in a Notion database. When an agent needs to: (1) Create Notion tasks from meeting notes, (2) Extract or find action items from a Notion page or pasted text, (3) Parse meeting notes for assigned tasks, or (4) Generate tasks for team members. Identifies assignees, finds the target tasks data source, and creates rows with proper context."`
- Body sections (mirroring Atlassian style): Title, Keywords, Overview, "Use this skill when", Workflow steps:
  1. **Get meeting notes** — either via `retrieve-a-page` + `get-block-children` (for a Notion URL/ID) or pasted text.
  2. **Parse action items** — same five-pattern catalog as Atlassian's skill (@mentions, name+verb, Action: Name -, TODO, bullets), tuned for prose that comes out of Notion blocks.
  3. **Find the tasks data source** — `post-search` with `filter.value: "data_source"` and a query like "tasks"; if multiple matches, ask user; else `retrieve-a-data-source` to confirm the schema (look for `Name` / `Title`, `Assignee`/`Owner`, `Status`, `Due date`).
  4. **Map assignees** — try `get-users` to resolve names to Notion `people` IDs; gracefully fall back to plain text if the workspace doesn't expose people or the integration lacks the scope.
  5. **Present the parsed action items for confirmation** before writing.
  6. **Create rows** — `post-page` with `parent.database_id` (data source id) and a properties object built from the schema, including a description block for context.
  7. **Provide summary** — links to created pages.
- Edge cases: no tasks DB found, ambiguous DB matches, missing required properties, integration lacks `Insert content` capability, person property not exposed.
- "When NOT to use this skill": general page creation (use `create-page` skill), spec breakdowns (use `spec-to-implementation`).
- Quick reference at the bottom listing the exact MCP tool calls.

**Patterns to follow:**
- Atlassian's `skills/capture-tasks-from-meeting-notes/SKILL.md` for structure, headings, and the five action-item parsing patterns. Substitute Jira-isms (cloudId, projectKey, accountId) for Notion-isms (data_source_id, person property, page_id).

**Test scenarios:**
- Test expectation: none — skills are prose. Lint via `markdown` viewer; verify YAML frontmatter parses (`yq` or simple grep). Verify every backticked tool name appears in `scripts/notion-openapi.json` `operationId` set.

**Verification:**
- `rg -o '`[a-z][-a-z]+`' skills/capture-tasks-from-meeting-notes/SKILL.md` lists tool references; spot-check each against the openapi `operationId` list.
- A Notion-savvy reader can follow the skill end-to-end from a sample meeting notes page without inventing extra tool calls.

---

### U3. Skill: `spec-to-implementation`

**Goal:** Take a Notion page (spec), break it down into a parent project page + a sequence of implementation task rows in a tasks database.

**Requirements:** R3, R5

**Dependencies:** None

**Files:**
- Create: `skills/spec-to-implementation/SKILL.md`

**Approach:**
- YAML frontmatter: `name`, `description: "Turn a Notion specification page into structured implementation work — a parent project page plus tasks created in a Notion database. When an agent needs to: (1) Create Notion tasks from a spec page, (2) Generate a backlog from a specification, (3) Break down a spec into implementation tasks, or (4) Convert requirements into Notion database rows linked to a parent."`
- Workflow mirrors Atlassian's `spec-to-backlog` shape:
  1. **Fetch spec** — `retrieve-a-page` + `get-block-children` (recursive when nested).
  2. **Pick the tasks data source** — `post-search` for "tasks" + `retrieve-a-data-source` to inspect schema.
  3. **Analyze + propose breakdown** — internally pick 3–10 tasks, present to user for approval before writing.
  4. **Create the parent project page first** — `post-page` with `parent.page_id` set to the spec's parent (or workspace), summary in title, full breakdown in body blocks (`patch-block-children` to append).
  5. **Create child task rows** — one `post-page` per task with `parent.database_id` set to the tasks data source, properties mapped (Status defaults, Owner if resolvable), and a relation to the project page if the schema exposes one.
  6. **Provide summary** — list of created page URLs.
- Edge cases: data source has required properties we can't infer (ask user), no relation property between tasks and projects (skip the link, surface the gap), spec page is huge (split into batches of 5–10 task creations and confirm between batches).
- "When NOT to use": ad-hoc note-taking (use `create-page` skill), simple task entry (use `capture-tasks-from-meeting-notes`).

**Patterns to follow:**
- Atlassian's `skills/spec-to-backlog/SKILL.md` "create the parent first" sequencing rule — same risk in Notion (orphaned children if you create rows before the project page exists).

**Test scenarios:**
- Test expectation: none — markdown skill. Same lint approach as U2.

**Verification:**
- Skill body cleanly distinguishes "spec page" (prose source) from "tasks data source" (write target) so an agent doesn't confuse them.
- All tool references match real `operationId`s.

---

### U4. Skill: `triage-page`

**Goal:** When a user reports an issue or question, search the workspace for similar existing pages or database rows; offer to add a comment to the existing match or create a fresh page if no good match exists.

**Requirements:** R3, R5

**Dependencies:** None

**Files:**
- Create: `skills/triage-page/SKILL.md`

**Approach:**
- YAML frontmatter: `name`, `description: "Triage incoming reports against existing Notion content — search for similar pages or database rows, then either add a comment to the existing match or create a new page. When an agent needs to: (1) Check whether an issue or question has already been documented, (2) Find similar existing Notion pages, (3) Add a comment to a match, or (4) Create a new page with proper context when no match exists."`
- Workflow:
  1. **Extract search terms** — pull entity names, error messages, distinctive nouns from the user's report.
  2. **Search** — `post-search` with the extracted query; if results look like database rows, also `query-data-source` on the most likely data source for richer matching.
  3. **Evaluate matches** — present top candidates with similarity reasoning (recent? same component?).
  4. **Branch**:
     - **Strong match** → `create-a-comment` on that page with the new context.
     - **Weak / no match** → `post-page` with the user's report formatted as description, parented under a sensible page or database.
  5. **Surface possible regressions** — if a match is "Resolved" / "Done" but the new report says it's broken again, recommend creating a new page with a back-link rather than reopening.
  6. **Provide summary** — what was added where, with URLs.
- "When NOT to use": general workspace search (use `search-workspace` skill).

**Patterns to follow:**
- Atlassian's `skills/triage-issue/SKILL.md` — similar branching logic (comment vs. create), same regression handling.

**Test scenarios:**
- Test expectation: none — markdown skill. Same lint approach.

**Verification:**
- Skill enforces "present matches before writing" discipline (no silent comment creation).
- All tool references valid.

---

### U5. Skill: `generate-status-update`

**Goal:** Query a tasks data source for recent activity, synthesize a weekly / sprint / daily status update, and publish it as a new Notion page.

**Requirements:** R3, R5

**Dependencies:** None

**Files:**
- Create: `skills/generate-status-update/SKILL.md`

**Approach:**
- YAML frontmatter: `name`, `description: "Generate a status update from Notion task / project data and publish it as a new page. When an agent needs to: (1) Create a status update for a project, (2) Summarize recent progress and blockers, (3) Generate weekly/daily updates from a Notion tasks database, or (4) Publish a status summary as a Notion page."`
- Workflow:
  1. **Identify scope** — project / database, time window (default last 7 days), audience (exec / team / standup) — interactive when missing.
  2. **Find the tasks data source** — `post-search` filtered to data sources, then `retrieve-a-data-source` for schema.
  3. **Query** — `query-data-source` with filters: completed in window, in-progress, blocked, high priority. Multiple targeted queries beat one mega-query.
  4. **Analyze** — counts by status, top accomplishments, top blockers, at-risk items.
  5. **Format** — three audience templates (exec summary, team detail, daily standup) inlined in the skill.
  6. **Publish** — `post-page` parented under a chosen page, with markdown rendered as Notion blocks via `patch-block-children`. Title format: `<Project> – Status Update – <Date>`.
- Edge cases: no rows in window (acknowledge, suggest widening), data source lacks a Status property (fall back to "updated in window"), publishing requires `Insert content` capability.

**Patterns to follow:**
- Atlassian's `skills/generate-status-report/SKILL.md` for the "always offer to publish" discipline and the three-audience template split. Substitute Jira/JQL/Confluence with Notion data-source queries and pages.

**Test scenarios:**
- Test expectation: none — markdown skill. Same lint approach.

**Verification:**
- Skill keeps the "ALWAYS ASK before publishing" discipline.
- Templates render cleanly in plain markdown (since Notion's `patch-block-children` accepts a structured form, the skill notes the conversion step explicitly).

---

### U6. Skill: `search-workspace`

**Goal:** Answer natural-language questions by searching across the Notion workspace, fetching the most relevant pages or database rows in full, and synthesizing a cited answer.

**Requirements:** R3, R5

**Dependencies:** None

**Files:**
- Create: `skills/search-workspace/SKILL.md`

**Approach:**
- YAML frontmatter: `name`, `description: "Search a Notion workspace and synthesize a cited answer. When an agent needs to: (1) Find or search for information across Notion pages and databases, (2) Look up internal terminology, processes, or technical details documented in Notion, (3) Explain what something is or how it works using workspace content, or (4) Combine information from multiple Notion sources with citations."`
- Workflow:
  1. **Identify search terms** — pull key nouns and distinctive phrases.
  2. **Cross-search** — `post-search` (no filter) for broad coverage; if the result set is heavy with one type, narrow with `filter.value: "page"` or `"data_source"`.
  3. **Fetch detail for top hits** — `retrieve-a-page` + `get-block-children` for prose pages; `query-data-source` with a relevant filter for database hits.
  4. **Synthesize** — direct answer first, then detail, then cite. Highlight discrepancies between sources explicitly.
  5. **Cite** — Notion URL per source (constructed from page id).
- Edge cases: no results (suggest synonyms), too many results (curate top 5–10), restricted pages (note inaccessibility), outdated content (flag age).
- "When NOT to use": general internet questions (web search), workspace edits (use other skills).

**Patterns to follow:**
- Atlassian's `skills/search-company-knowledge/SKILL.md` for the "synthesize, don't just list", "cite everything", "flag conflicts" discipline.

**Test scenarios:**
- Test expectation: none — markdown skill. Same lint approach.

**Verification:**
- Skill enforces citation discipline.
- Tool references valid.

---

### U7. README: "Install as a plugin" section

**Goal:** Document how Cursor and Claude Code users install this repo as a plugin to get both the MCP server and the bundled skills, alongside the existing manual install snippets.

**Requirements:** R6

**Dependencies:** U1 (manifests must exist before docs reference them).

**Files:**
- Modify: `README.md`

**Approach:**
- Insert a new "## Install as a plugin (Cursor / Claude Code)" section after the existing "Installation" section, before the "Transport options" section.
- Cover three install paths:
  1. Cursor plugin: link to the Cursor plugin install flow, with a one-liner about the marketplace once published; for now, install from the cloned repo path that contains `.cursor-plugin/plugin.json`.
  2. Claude Code plugin: `claude code plugin install <path-or-git-url>` (use the actual current command; verify against Claude Code docs at write-time and adjust the wording to match the live command).
  3. Bundled skills overview: brief table listing the 5 skills with one-line descriptions so installers know what they're getting.
- Note that the bundled `.mcp.json` expects `NOTION_TOKEN` in the environment of the host process; the existing token-setup section in `README.md` still applies.
- Keep the existing "Adding MCP config to your client" section intact for users who prefer the manual route or the hosted remote MCP.

**Patterns to follow:**
- README's existing tone and "Option 1 / Option 2" formatting for consistency.

**Test scenarios:**
- Test expectation: none — docs change. Verify by re-reading the README top-to-bottom and confirming the install paths are unambiguous and the skill table matches `skills/`.

**Verification:**
- README skill table count == file count under `skills/`.
- Install commands are copy-pasteable.
- No broken internal links.

---

## System-Wide Impact

- **Interaction graph:** No runtime code is touched. The plugin manifests and skill markdown sit alongside existing source; the MCP server itself is unchanged.
- **Error propagation:** N/A — no new code paths.
- **State lifecycle risks:** None.
- **API surface parity:** The bundled `.mcp.json` advertises the same tools the server already exposes. Skills must not invent tool names — the verification in each unit checks this.
- **Integration coverage:** Manifests are JSON and validated by `jq`. Skills are markdown and reviewed by reading.
- **Unchanged invariants:** `package.json` `bin`, `scripts/notion-openapi.json`, `src/**`, the existing README sections about `mcp.json` snippets, the npm publish flow — all unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Cursor / Claude Code plugin manifest schemas drift from the version Atlassian shipped against. | Mirror Atlassian's exact field names; if Cursor/Claude Code reject the manifest at install, fix in a follow-up. JSON is cheap to iterate. |
| `.mcp.json` `${NOTION_TOKEN}` env interpolation is not supported uniformly across Cursor and Claude Code. | If interpolation fails in one host, fall back to documenting that the user must export `NOTION_TOKEN` in their shell before launching the host (already the recommended UX in `README.md`). Worst case: ship two `.mcp.json` variants — call this out at PR review time, not now. |
| Skill descriptions overlap with the user's personal `~/.claude/skills` and trigger ambiguously. | Skill names are deliberately distinct (`spec-to-implementation` vs personal `spec-to-implementation`, `triage-page` vs personal `triage-issue`). Frontmatter `description` strings are written so they describe the bundled scope concretely. Personal skills always win locally; bundled skills are the install-time floor for fresh users. |
| Tool name drift if the OpenAPI spec changes operationIds in a future release. | Skills cite operationIds in code-fence blocks; CI / future PRs that touch `scripts/notion-openapi.json` should grep `skills/**/SKILL.md` for stale names. Add this as a doc note in the README install section. |

---

## Documentation / Operational Notes

- `README.md` gets a new "Install as a plugin" section (U7).
- No changes to `CLAUDE.md` (its current "Architecture" + "Adding New Endpoints" guidance still holds).
- No changes to `.gitignore` (the new files are intentionally tracked).
- No npm version bump.
- The plugin's version in `.cursor-plugin/plugin.json` and `.claude-plugin/marketplace.json` is `0.1.0` and is independent of the npm package version.

---

## Sources & References

- Atlassian reference: https://github.com/atlassian/atlassian-mcp-server (`.cursor-plugin/`, `.claude-plugin/`, `.mcp.json`, `skills/`)
- Atlassian skills sampled in research: `skills/capture-tasks-from-meeting-notes/SKILL.md`, `skills/spec-to-backlog/SKILL.md`, `skills/triage-issue/SKILL.md`, `skills/generate-status-report/SKILL.md`, `skills/search-company-knowledge/SKILL.md`.
- Repo files informing scope: `scripts/notion-openapi.json`, `README.md`, `CLAUDE.md`, `package.json`.
