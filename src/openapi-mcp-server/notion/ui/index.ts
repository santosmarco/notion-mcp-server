/**
 * MCP Apps registry for Notion.
 *
 * Each entry produces an embedded UI resource (`text/html;profile=mcp-app`)
 * that Cursor / Claude Desktop / VS Code render in a sandboxed iframe.
 */
import type { NotionShape, NotionObject } from '../shapes'
import { renderPageApp, PAGE_APP_URI } from './page-app'
import { renderTableApp, TABLE_APP_URI } from './table-app'
import { renderSearchApp, SEARCH_APP_URI } from './search-app'
import { renderKanbanApp, KANBAN_APP_URI } from './kanban-app'
import type { UiAppContent } from './shared'

export type { UiAppContent }

export type UiAppDescriptor = {
  uri: string
  name: string
  description: string
  mimeType: 'text/html;profile=mcp-app'
}

export const UI_APPS: UiAppDescriptor[] = [
  {
    uri: PAGE_APP_URI,
    name: 'Notion page viewer',
    description: 'Renders a Notion page or block list with native styling, icons, and cover image.',
    mimeType: 'text/html;profile=mcp-app',
  },
  {
    uri: TABLE_APP_URI,
    name: 'Notion data source table',
    description: 'Renders Notion data source query results as a sortable, filterable table.',
    mimeType: 'text/html;profile=mcp-app',
  },
  {
    uri: SEARCH_APP_URI,
    name: 'Notion search results',
    description: 'Renders Notion search hits as an icon + title + breadcrumb gallery.',
    mimeType: 'text/html;profile=mcp-app',
  },
  {
    uri: KANBAN_APP_URI,
    name: 'Notion task kanban',
    description: 'Renders rows from a Notion data source grouped by their Status / select column as a kanban board.',
    mimeType: 'text/html;profile=mcp-app',
  },
]

const TOOL_TO_APP: Record<string, string> = {
  'API-retrieve-a-page': PAGE_APP_URI,
  'API-get-block-children': PAGE_APP_URI,
  'API-post-search': SEARCH_APP_URI,
  'API-post-data-source-query': TABLE_APP_URI,
  'API-post-database-query': TABLE_APP_URI,
}

export const listUiApps = (): UiAppDescriptor[] => UI_APPS

export const getUiAppForTool = (toolName: string): string | undefined => TOOL_TO_APP[toolName]

export const readUiApp = (uri: string): UiAppContent | undefined => {
  if (uri === PAGE_APP_URI) return renderPageApp({ kind: 'preview' })
  if (uri === TABLE_APP_URI) return renderTableApp({ kind: 'preview' })
  if (uri === SEARCH_APP_URI) return renderSearchApp({ kind: 'preview' })
  if (uri === KANBAN_APP_URI) return renderKanbanApp({ kind: 'preview' })
  return undefined
}

const detectKanban = (items: NotionObject[]): boolean => {
  if (items.length === 0) return false
  let hits = 0
  for (const item of items) {
    const properties = item.properties
    if (!properties || typeof properties !== 'object') continue
    for (const value of Object.values(properties)) {
      if (typeof value !== 'object' || value === null) continue
      const v = Reflect.get(value, 'type')
      if (v === 'status' || v === 'select') {
        hits += 1
        break
      }
    }
  }
  return hits >= Math.max(1, Math.ceil(items.length / 2))
}

export const renderUiAppForShape = (
  toolName: string,
  shape: NotionShape,
  data: unknown,
): UiAppContent | undefined => {
  if (shape.kind === 'object' && shape.objectType === 'page') {
    return renderPageApp({ kind: 'page', data })
  }
  if (shape.kind === 'list' && shape.objectType === 'block') {
    return renderPageApp({ kind: 'blocks', items: shape.items, data })
  }
  if (shape.kind === 'list' && shape.objectType === 'page') {
    if (toolName === 'API-post-search') {
      return renderSearchApp({ kind: 'results', items: shape.items, data })
    }
    if (detectKanban(shape.items)) {
      return renderKanbanApp({ kind: 'rows', items: shape.items, data })
    }
    return renderTableApp({ kind: 'rows', items: shape.items, data })
  }
  if (shape.kind === 'list' && shape.objectType === 'mixed') {
    return renderSearchApp({ kind: 'results', items: shape.items, data })
  }
  return undefined
}
