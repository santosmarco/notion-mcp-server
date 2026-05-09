import { describe, expect, it } from 'vitest'
import { buildToolResultContent } from '../render'

const samplePage = () => ({
  object: 'page',
  id: '11111111-2222-3333-4444-555555555555',
  url: 'https://www.notion.so/Sample-page-1111111122223333444455555555555',
  icon: { type: 'emoji', emoji: '🚀' },
  properties: {
    Name: { id: 'title', type: 'title', title: [{ plain_text: 'Sample page' }] },
  },
})

const samplePageRow = (id: string, title: string, status: string) => ({
  object: 'page',
  id,
  url: `https://www.notion.so/${id.replace(/-/g, '')}`,
  icon: null,
  properties: {
    Name: { id: 'title', type: 'title', title: [{ plain_text: title }] },
    Status: { id: 's', type: 'status', status: { name: status, color: 'blue' } },
  },
})

describe('buildToolResultContent', () => {
  it('always returns the original JSON as the first text block', () => {
    const built = buildToolResultContent('API-retrieve-a-page', samplePage())
    expect(built.content[0].type).toBe('text')
    if (built.content[0].type !== 'text') throw new Error('expected text')
    expect(JSON.parse(built.content[0].text).id).toBe('11111111-2222-3333-4444-555555555555')
  })

  it('appends a resource_link for a single page response', () => {
    const built = buildToolResultContent('API-retrieve-a-page', samplePage())
    const link = built.content.find((c) => c.type === 'resource_link')
    expect(link).toBeDefined()
    if (!link || link.type !== 'resource_link') throw new Error('expected resource_link')
    expect(link.title).toBe('Sample page')
  })

  it('appends a UI app embedded resource for a single page', () => {
    const built = buildToolResultContent('API-retrieve-a-page', samplePage())
    const ui = built.content.find((c) => c.type === 'resource')
    expect(ui).toBeDefined()
    if (!ui || ui.type !== 'resource') throw new Error('expected resource')
    expect(ui.resource.uri).toBe('ui://notion/page-viewer')
    expect(ui.resource.mimeType).toBe('text/html;profile=mcp-app')
    expect(ui.resource.text).toContain('Sample page')
  })

  it('returns structuredContent with shape metadata', () => {
    const built = buildToolResultContent('API-retrieve-a-page', samplePage())
    expect(built.structuredContent?.notion).toMatchObject({ shape: 'page' })
  })

  it('emits one resource_link per item for a paginated query', () => {
    const list = {
      object: 'list',
      type: 'page',
      results: [
        samplePageRow('a1111111-2222-3333-4444-555555555555', 'Task A', 'In Progress'),
        samplePageRow('b1111111-2222-3333-4444-555555555555', 'Task B', 'Done'),
      ],
      has_more: false,
      next_cursor: null,
    }
    const built = buildToolResultContent('API-post-data-source-query', list)
    const links = built.content.filter((c) => c.type === 'resource_link')
    expect(links.length).toBe(2)
  })

  it('routes a query response to the kanban app when rows have a status column', () => {
    const list = {
      object: 'list',
      type: 'page',
      results: [
        samplePageRow('a1111111-2222-3333-4444-555555555555', 'Task A', 'In Progress'),
        samplePageRow('b1111111-2222-3333-4444-555555555555', 'Task B', 'Done'),
      ],
    }
    const built = buildToolResultContent('API-post-data-source-query', list)
    const ui = built.content.find((c) => c.type === 'resource')
    if (!ui || ui.type !== 'resource') throw new Error('expected resource')
    expect(ui.resource.uri).toBe('ui://notion/task-kanban')
  })

  it('routes a search response to the search-results app', () => {
    const list = {
      object: 'list',
      results: [
        samplePage(),
        {
          object: 'database',
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          title: [{ plain_text: 'Tasks' }],
          url: 'https://www.notion.so/aaaaaaaabbbbccccddddeeeeeeeeeeee',
        },
      ],
    }
    const built = buildToolResultContent('API-post-search', list)
    const ui = built.content.find((c) => c.type === 'resource')
    if (!ui || ui.type !== 'resource') throw new Error('expected resource')
    expect(ui.resource.uri).toBe('ui://notion/search-results')
  })

  it('omits structured content and UI app for unknown shapes', () => {
    const built = buildToolResultContent('whatever', { message: 'success' })
    expect(built.content.length).toBe(1)
    expect(built.content[0].type).toBe('text')
    expect(built.structuredContent).toBeUndefined()
  })
})
