import { describe, expect, it } from 'vitest'
import { getUiAppForTool, listUiApps, readUiApp, renderUiAppForShape } from '../ui'
import { detectShape } from '../shapes'
import { renderPageApp, PAGE_APP_URI } from '../ui/page-app'
import { renderTableApp, TABLE_APP_URI } from '../ui/table-app'
import { renderSearchApp, SEARCH_APP_URI } from '../ui/search-app'
import { renderKanbanApp, KANBAN_APP_URI } from '../ui/kanban-app'

describe('UI app registry', () => {
  it('exposes all four bundled apps', () => {
    const apps = listUiApps()
    expect(apps.map((a) => a.uri).sort()).toEqual(
      [PAGE_APP_URI, TABLE_APP_URI, SEARCH_APP_URI, KANBAN_APP_URI].sort(),
    )
    for (const app of apps) {
      expect(app.mimeType).toBe('text/html;profile=mcp-app')
      expect(app.description.length).toBeGreaterThan(20)
    }
  })

  it('maps known tool names to their UI resource URI', () => {
    expect(getUiAppForTool('API-retrieve-a-page')).toBe(PAGE_APP_URI)
    expect(getUiAppForTool('API-post-search')).toBe(SEARCH_APP_URI)
    expect(getUiAppForTool('API-query-data-source')).toBe(TABLE_APP_URI)
    expect(getUiAppForTool('something-unknown')).toBeUndefined()
  })

  it('readUiApp returns a preview HTML for each registered URI', () => {
    for (const uri of [PAGE_APP_URI, TABLE_APP_URI, SEARCH_APP_URI, KANBAN_APP_URI]) {
      const content = readUiApp(uri)
      expect(content).toBeDefined()
      if (!content) continue
      expect(content.uri).toBe(uri)
      expect(content.mimeType).toBe('text/html;profile=mcp-app')
      expect(content.text.includes('<!doctype html>')).toBe(true)
    }
  })

  it('readUiApp returns undefined for unknown URIs', () => {
    expect(readUiApp('ui://nope')).toBeUndefined()
  })
})

describe('renderUiAppForShape', () => {
  const samplePage = {
    object: 'page',
    id: '11111111-2222-3333-4444-555555555555',
    properties: { Name: { type: 'title', title: [{ plain_text: 'Sample' }] } },
  }

  it('returns the page viewer for a single page', () => {
    const shape = detectShape(samplePage)
    const ui = renderUiAppForShape('API-retrieve-a-page', shape, samplePage)
    expect(ui?.uri).toBe(PAGE_APP_URI)
  })

  it('returns the page viewer for a block list', () => {
    const blockList = {
      object: 'list',
      results: [
        {
          object: 'block',
          id: 'b-1',
          type: 'paragraph',
          parent: { type: 'page_id', page_id: '11111111-2222-3333-4444-555555555555' },
          paragraph: { rich_text: [{ plain_text: 'Hi' }] },
        },
      ],
    }
    const shape = detectShape(blockList)
    const ui = renderUiAppForShape('API-get-block-children', shape, blockList)
    expect(ui?.uri).toBe(PAGE_APP_URI)
  })

  it('returns the kanban for a row list with a status column', () => {
    const rowList = {
      object: 'list',
      results: [
        {
          object: 'page',
          id: 'a',
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'A' }] },
            Status: { type: 'status', status: { name: 'Todo', color: 'gray' } },
          },
        },
      ],
    }
    const shape = detectShape(rowList)
    const ui = renderUiAppForShape('API-query-data-source', shape, rowList)
    expect(ui?.uri).toBe(KANBAN_APP_URI)
  })

  it('returns the table when the row list lacks a status/select column', () => {
    const rowList = {
      object: 'list',
      results: [
        {
          object: 'page',
          id: 'a',
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'A' }] },
            Notes: { type: 'rich_text', rich_text: [{ plain_text: 'hi' }] },
          },
        },
      ],
    }
    const shape = detectShape(rowList)
    const ui = renderUiAppForShape('API-query-data-source', shape, rowList)
    expect(ui?.uri).toBe(TABLE_APP_URI)
  })

  it('returns the search gallery for mixed list shapes', () => {
    const list = {
      object: 'list',
      results: [
        { object: 'page', id: 'a', properties: { Name: { type: 'title', title: [{ plain_text: 'A' }] } } },
        { object: 'database', id: 'd', title: [{ plain_text: 'DB' }] },
      ],
    }
    const shape = detectShape(list)
    const ui = renderUiAppForShape('API-post-search', shape, list)
    expect(ui?.uri).toBe(SEARCH_APP_URI)
  })

  it('returns undefined for object types without a registered app', () => {
    const user = { object: 'user', id: 'u1', name: 'Marco', type: 'person' }
    const shape = detectShape(user)
    const ui = renderUiAppForShape('API-retrieve-a-user', shape, user)
    expect(ui).toBeUndefined()
  })
})

describe('individual app preview HTML', () => {
  it('page app HTML contains page-app boot script and renderModel', () => {
    const html = renderPageApp({ kind: 'preview' }).text
    expect(html).toContain('renderModel')
    expect(html).toContain('Notion page viewer')
  })

  it('table app HTML contains a sortable table scaffold', () => {
    const html = renderTableApp({ kind: 'preview' }).text
    expect(html).toContain('<th')
    expect(html).toContain('Filter rows')
  })

  it('search app HTML contains a results grid', () => {
    const html = renderSearchApp({ kind: 'preview' }).text
    expect(html).toContain('grid')
    expect(html).toContain('result')
  })

  it('kanban app HTML contains lane scaffolding', () => {
    const html = renderKanbanApp({ kind: 'preview' }).text
    expect(html).toContain('lane')
    expect(html).toContain('grouped by')
  })

  it('every app embeds the initial render data as JSON', () => {
    for (const html of [
      renderPageApp({ kind: 'preview' }).text,
      renderTableApp({ kind: 'preview' }).text,
      renderSearchApp({ kind: 'preview' }).text,
      renderKanbanApp({ kind: 'preview' }).text,
    ]) {
      expect(html).toContain('id="__initial_data"')
      expect(html).toContain('@modelcontextprotocol/ext-apps')
    }
  })
})
