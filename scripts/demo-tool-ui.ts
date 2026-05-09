/**
 * Standalone demo: shows what the enriched MCP tool result looks like for
 * three realistic Notion API responses (single page, paginated query with
 * a status column, mixed search). No NOTION_TOKEN required — we feed the
 * payloads directly into buildToolResultContent.
 */
import { buildToolResultContent } from '../src/openapi-mcp-server/notion/render'

const summarize = (label: string, toolName: string, data: unknown) => {
  const result = buildToolResultContent(toolName, data)
  console.log(`\n=== ${label} (${toolName}) ===`)
  console.log(`content blocks: ${result.content.length}`)
  for (const c of result.content) {
    if (c.type === 'text') {
      console.log(`  text          ${c.text.length} chars JSON`)
    } else if (c.type === 'resource_link') {
      const icon = c.icons?.[0]?.src.slice(0, 32) ?? ''
      console.log(`  resource_link ${c.title?.padEnd(40)} ${c.uri}  icon=${icon}…`)
    } else if (c.type === 'resource') {
      console.log(`  resource      ${c.resource.uri}  ${c.resource.text.length} bytes  mime=${c.resource.mimeType}`)
    }
  }
  if (result.structuredContent) {
    const notion = (result.structuredContent as { notion: unknown }).notion
    console.log(`structuredContent.notion: ${JSON.stringify(notion)}`)
  }
}

const samplePage = {
  object: 'page',
  id: '11111111-2222-3333-4444-555555555555',
  url: 'https://www.notion.so/11111111222233334444555555555555',
  icon: { type: 'emoji', emoji: '🚀' },
  cover: null,
  archived: false,
  in_trash: false,
  last_edited_time: '2026-05-01T18:30:00.000Z',
  parent: { type: 'workspace', workspace: true },
  properties: {
    Name: { id: 'title', type: 'title', title: [{ type: 'text', plain_text: 'Q4 launch plan' }] },
    Status: { id: 's', type: 'status', status: { name: 'In Progress', color: 'blue' } },
  },
}

const queryRows = {
  object: 'list',
  type: 'page',
  has_more: false,
  next_cursor: null,
  results: [
    {
      object: 'page',
      id: 'a1111111-2222-3333-4444-555555555555',
      url: 'https://www.notion.so/a1111111222233334444555555555555',
      icon: { type: 'emoji', emoji: '🐛' },
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Fix double-serialization bug' }] },
        Status: { type: 'status', status: { name: 'Dev in Progress', color: 'blue' } },
        Owner: { type: 'people', people: [{ name: 'Marco Santos', avatar_url: null }] },
        Due: { type: 'date', date: { start: '2026-05-15' } },
      },
    },
    {
      object: 'page',
      id: 'b1111111-2222-3333-4444-555555555555',
      url: 'https://www.notion.so/b1111111222233334444555555555555',
      icon: null,
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Add offline import UI' }] },
        Status: { type: 'status', status: { name: 'Backlog', color: 'gray' } },
        Owner: { type: 'people', people: [{ name: 'Marco Santos' }] },
        Due: { type: 'date', date: null },
      },
    },
    {
      object: 'page',
      id: 'c1111111-2222-3333-4444-555555555555',
      url: 'https://www.notion.so/c1111111222233334444555555555555',
      icon: { type: 'emoji', emoji: '✅' },
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Wire kanban app' }] },
        Status: { type: 'status', status: { name: 'Done', color: 'green' } },
        Owner: { type: 'people', people: [] },
        Due: { type: 'date', date: { start: '2026-05-09' } },
      },
    },
  ],
}

const searchHits = {
  object: 'list',
  has_more: true,
  next_cursor: 'cursor-2',
  results: [
    {
      object: 'page',
      id: 'p1111111-2222-3333-4444-555555555555',
      url: 'https://www.notion.so/p1111111222233334444555555555555',
      icon: { type: 'emoji', emoji: '📘' },
      parent: { type: 'workspace', workspace: true },
      last_edited_time: '2026-05-08T12:00:00.000Z',
      properties: { Name: { type: 'title', title: [{ plain_text: 'Engineering home' }] } },
    },
    {
      object: 'database',
      id: 'd1111111-2222-3333-4444-555555555555',
      url: 'https://www.notion.so/d1111111222233334444555555555555',
      icon: { type: 'emoji', emoji: '🗄' },
      title: [{ plain_text: 'Tasks' }],
      description: [{ plain_text: 'Engineering tasks' }],
      data_sources: [{ id: 'ds-1', name: 'All' }],
      last_edited_time: '2026-05-07T10:00:00.000Z',
      parent: { type: 'page_id', page_id: 'p1111111-2222-3333-4444-555555555555' },
    },
    {
      object: 'data_source',
      id: 'ds-1111111-2222-3333-4444-555555555555',
      url: 'https://www.notion.so/ds-1111111222233334444555555555555',
      name: 'Q4 OKRs',
      icon: null,
      last_edited_time: '2026-05-06T08:00:00.000Z',
    },
  ],
}

summarize('Single page', 'API-retrieve-a-page', samplePage)
summarize('Data source query (status column → kanban)', 'API-query-data-source', queryRows)
summarize('Search results (mixed types)', 'API-post-search', searchHits)
