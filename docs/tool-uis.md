# Notion tool UIs

This document describes how `notion-mcp-server` turns raw Notion API responses into rich, interactive UI inside MCP hosts (Cursor, Claude Desktop, VS Code Copilot, Goose, Postman, MCPJam, etc.).

## Why

The default MCP behavior is to return tool results as a single `text` content block — a stringified JSON blob the LLM has to read and the user has to mentally parse. The MCP spec offers two upgrades:

1. **`resource_link` content blocks** — each item in a tool result becomes a clickable card with an icon, title, description, and URI. Hosts render an array of these as a card list (this is how the Atlassian MCP server's Jira issue list renders in Cursor).
2. **MCP Apps** (`text/html;profile=mcp-app` resources, advertised via `_meta.ui.resourceUri` on the tool description) — a sandboxed iframe that receives the tool input/output via postMessage and can render anything: tables, kanban boards, page viewers, dashboards.

We use both. Every Notion response is enriched with `resource_link` blocks and `structuredContent`, and recognized response shapes also include an embedded MCP App.

## Layered output

For each MCP `tools/call`, the server returns `content` blocks in this order:

1. `{ type: 'text', text: '<original Notion JSON>' }` — always present, back-compat.
2. `{ type: 'resource_link', uri, name, title, description, mimeType, icons, _meta }` — one per detected Notion object (or one per item in a list response).
3. `{ type: 'resource', resource: { uri: 'ui://notion/...', mimeType: 'text/html;profile=mcp-app', text, _meta } }` — when the response shape matches a curated UI app.

`structuredContent` is also returned for recognized shapes:

```json
{
  "notion": {
    "shape": "list:page",
    "count": 12,
    "has_more": false,
    "summary": "12 Notion pages"
  },
  "data": { "...": "original Notion response" }
}
```

Hosts that don't yet support `resource_link`, MCP Apps, or `structuredContent` fall back to the JSON text — nothing breaks.

## Architecture

```
src/openapi-mcp-server/
  mcp/proxy.ts            ← wires tools/call → buildToolResultContent
                            and exposes resources/list + resources/read
  notion/
    shapes.ts             ← detectShape(data) → { kind, link[s], items, raw }
    render.ts             ← buildToolResultContent(toolName, data)
    ui/
      index.ts            ← UI app registry + tool→app routing
      shared.ts           ← HTML scaffold, base CSS tokens, helpers
      page-app.ts         ← ui://notion/page-viewer
      table-app.ts        ← ui://notion/data-source-table
      search-app.ts       ← ui://notion/search-results
      kanban-app.ts       ← ui://notion/task-kanban
```

### Shape detection (`shapes.ts`)

`detectShape(data)` inspects the response and returns one of three kinds:

- `{ kind: 'object', objectType, data, link }` — single Notion object (`page` / `database` / `data_source` / `block` / `comment` / `user` / `property_item`).
- `{ kind: 'list', objectType, items, links, raw }` — a Notion `list` response. `objectType` is the homogeneous item type or `'mixed'` for search-style results.
- `{ kind: 'unknown' }` — anything else (e.g. error envelopes, OAuth bodies, success-only responses).

Each Notion object type has its own link builder in `shapes.ts` that knows how to extract a title (e.g. walk the `title` property of a page; use `name` for a data source), the public URL (use the `url` field if present, else compute `https://www.notion.so/<id-without-dashes>`), and the icon (emoji → inline SVG data URL, external/file → URL, fallback → SVG glyph).

### Rendering (`render.ts`)

`buildToolResultContent(toolName, data)` calls `detectShape`, appends `resource_link` blocks for every detected item, and asks `renderUiAppForShape` for an optional MCP App embed. Returns `{ content, structuredContent? }`.

### MCP Apps (`ui/`)

Each app is a single self-contained HTML string built by `renderHtmlPage`:

- A `<style>` block with shared design tokens from `shared.ts` (light + dark color schemes, Notion-style typography, status pill colors) plus app-specific styles.
- A `<script id="__initial_data" type="application/json">` block with the projected render model (e.g. for the table app: `{ columns, rows, total, has_more }`).
- A `<script type="module">` that:
  1. Parses the initial data and calls `renderModel(data)` immediately so the iframe is interactive on first paint, even if the MCP App bridge fails to load.
  2. Imports `@modelcontextprotocol/ext-apps` from esm.sh and creates an `App` instance. The host pushes future tool inputs via `app.ontoolinput`, which re-renders.

The apps are read-only by design — they link out to Notion for any mutation, which keeps the iframe permission model trivial (no token, no API key) and avoids duplicating Notion's own UI.

### Tool → app routing (`ui/index.ts`)

Tool descriptions get `_meta.ui.resourceUri` set when the tool name is in the `TOOL_TO_APP` table (so MCP Apps-aware hosts preload the UI before the call). The runtime app choice in `renderUiAppForShape` looks at the response shape:

- single `page` → page viewer
- list of `block` → page viewer (rendering the children of a page)
- list of `page` from `post-search` → search results gallery
- list of `page` with a `status` or `select` column on >= 50% of rows → task kanban
- list of `page` without status/select → data source table
- mixed list (search) → search results gallery

## Adding a new app

1. Pick a `ui://notion/<slug>` URI.
2. Add a new file under `ui/`, exporting:
   - `<NAME>_APP_URI` constant
   - `render<Name>App(input): UiAppContent` that builds initial render data + HTML using `renderHtmlPage` + `buildUiResource`.
3. Register it in `ui/index.ts`:
   - Add to `UI_APPS` (so it's discoverable via `resources/list`).
   - Add to `TOOL_TO_APP` if it should preload for specific tool names.
   - Add a branch in `renderUiAppForShape` that matches the response shape and calls your renderer.
   - Add a branch in `readUiApp` that returns the preview model for `resources/read`.
4. Write a Vitest covering preview HTML and the shape match in `__tests__/ui.test.ts`.

## Testing

```bash
npm test
```

There are three suites under `src/openapi-mcp-server/notion/__tests__/`:

- `shapes.test.ts` — shape detection across all Notion object types and list edge cases.
- `render.test.ts` — `buildToolResultContent` content ordering, app routing, structured content emission.
- `ui.test.ts` — UI app registry, tool routing, preview HTML integrity.

`mcp/__tests__/proxy.test.ts` adds end-to-end coverage for `resources/list`, `resources/read`, and the enriched tool-call result.

## Manual smoke

```bash
npm run build
cat <<'EOF' | node bin/cli.mjs
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"resources/list"}
{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"ui://notion/page-viewer"}}
EOF
```

The server should advertise `capabilities.resources` in the initialize result, list four `ui://notion/...` apps, and serve self-contained HTML for each.
