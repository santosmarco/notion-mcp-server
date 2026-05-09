import { describe, expect, it } from 'vitest'
import { detectShape, buildResourceLinks } from '../shapes'

const samplePage = (overrides: Record<string, unknown> = {}) => ({
  object: 'page',
  id: '11111111-2222-3333-4444-555555555555',
  url: 'https://www.notion.so/Sample-page-1111111122223333444455555555555',
  icon: { type: 'emoji', emoji: '🚀' },
  cover: null,
  archived: false,
  in_trash: false,
  last_edited_time: '2025-09-01T10:00:00.000Z',
  parent: { type: 'workspace', workspace: true },
  properties: {
    Name: {
      id: 'title',
      type: 'title',
      title: [{ type: 'text', text: { content: 'Sample page' }, plain_text: 'Sample page' }],
    },
    Status: {
      id: 'abc',
      type: 'status',
      status: { name: 'In Progress', color: 'blue' },
    },
  },
  ...overrides,
})

const sampleDatabase = (overrides: Record<string, unknown> = {}) => ({
  object: 'database',
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  title: [{ type: 'text', plain_text: 'Tasks', text: { content: 'Tasks' } }],
  description: [{ type: 'text', plain_text: 'Engineering tasks', text: { content: 'Engineering tasks' } }],
  url: 'https://www.notion.so/aaaaaaaabbbbccccddddeeeeeeeeeeee',
  icon: { type: 'external', external: { url: 'https://example.com/db.png' } },
  data_sources: [{ id: 'ds-1', name: 'All' }],
  last_edited_time: '2025-10-01T00:00:00.000Z',
  ...overrides,
})

const sampleDataSource = () => ({
  object: 'data_source',
  id: 'ds-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: 'Q4 OKRs',
  url: 'https://www.notion.so/ds-aaaaaaaabbbbccccddddeeeeeeeeeeee',
  icon: null,
  last_edited_time: '2025-11-01T00:00:00.000Z',
})

const sampleBlock = () => ({
  object: 'block',
  id: 'bbbbbbbb-1111-2222-3333-444444444444',
  type: 'paragraph',
  parent: { type: 'page_id', page_id: '11111111-2222-3333-4444-555555555555' },
  paragraph: { rich_text: [{ plain_text: 'Hello world' }] },
})

const sampleComment = () => ({
  object: 'comment',
  id: 'cccccccc-dddd-eeee-ffff-000000000000',
  parent: { type: 'page_id', page_id: '11111111-2222-3333-4444-555555555555' },
  rich_text: [{ plain_text: 'Looks good to me' }],
  created_time: '2025-12-01T00:00:00.000Z',
})

const sampleUser = () => ({
  object: 'user',
  id: 'user-1',
  name: 'Marco Santos',
  type: 'person',
  avatar_url: 'https://example.com/marco.png',
})

describe('detectShape', () => {
  it('returns unknown for non-objects', () => {
    expect(detectShape(null).kind).toBe('unknown')
    expect(detectShape('string').kind).toBe('unknown')
    expect(detectShape(42).kind).toBe('unknown')
  })

  it('returns unknown for arbitrary objects without an `object` field', () => {
    expect(detectShape({ message: 'success' }).kind).toBe('unknown')
  })

  it('extracts a page link with title from properties and emoji icon', () => {
    const shape = detectShape(samplePage())
    expect(shape.kind).toBe('object')
    if (shape.kind !== 'object') return
    expect(shape.objectType).toBe('page')
    expect(shape.link.title).toBe('Sample page')
    expect(shape.link.uri).toContain('notion.so')
    expect(shape.link.icons?.[0].src.startsWith('data:image/svg+xml')).toBe(true)
    expect(shape.link.mimeType).toBe('application/vnd.notion.page+json')
    expect(shape.link.annotations?.lastModified).toBe('2025-09-01T10:00:00.000Z')
  })

  it('marks an archived page', () => {
    const shape = detectShape(samplePage({ archived: true }))
    if (shape.kind !== 'object') throw new Error('expected object')
    expect(shape.link.description).toBe('Archived page')
  })

  it('falls back to (Untitled) when no title property is present', () => {
    const page = samplePage({ properties: {} })
    const shape = detectShape(page)
    if (shape.kind !== 'object') throw new Error('expected object')
    expect(shape.link.title).toBe('(Untitled)')
  })

  it('extracts a database link with description and external icon', () => {
    const shape = detectShape(sampleDatabase())
    if (shape.kind !== 'object') throw new Error('expected object')
    expect(shape.objectType).toBe('database')
    expect(shape.link.title).toBe('Tasks')
    expect(shape.link.description).toBe('Engineering tasks')
    expect(shape.link.icons?.[0].src).toBe('https://example.com/db.png')
  })

  it('extracts a data source link', () => {
    const shape = detectShape(sampleDataSource())
    if (shape.kind !== 'object') throw new Error('expected object')
    expect(shape.objectType).toBe('data_source')
    expect(shape.link.title).toBe('Q4 OKRs')
  })

  it('extracts a block link with parent page anchor URL', () => {
    const shape = detectShape(sampleBlock())
    if (shape.kind !== 'object') throw new Error('expected object')
    expect(shape.objectType).toBe('block')
    expect(shape.link.uri).toContain('#bbbbbbbb1111222233334444')
    expect(shape.link.title).toBe('Hello world')
  })

  it('extracts a comment link with truncated title', () => {
    const longComment = sampleComment()
    longComment.rich_text = [
      {
        plain_text:
          'This is a very long comment that exceeds the 80 character limit imposed by the title truncation logic in the shape extractor.',
      },
    ]
    const shape = detectShape(longComment)
    if (shape.kind !== 'object') throw new Error('expected object')
    expect(shape.link.title?.endsWith('…')).toBe(true)
    expect(shape.link.title?.length).toBe(78)
  })

  it('extracts a user link with avatar_url as icon', () => {
    const shape = detectShape(sampleUser())
    if (shape.kind !== 'object') throw new Error('expected object')
    expect(shape.objectType).toBe('user')
    expect(shape.link.icons?.[0].src).toBe('https://example.com/marco.png')
    expect(shape.link.description).toBe('Person')
  })

  it('detects a homogeneous list of pages', () => {
    const list = {
      object: 'list',
      type: 'page',
      results: [samplePage(), samplePage({ id: '22222222-2222-2222-2222-222222222222' })],
      has_more: false,
      next_cursor: null,
    }
    const shape = detectShape(list)
    if (shape.kind !== 'list') throw new Error('expected list')
    expect(shape.objectType).toBe('page')
    expect(shape.links.length).toBe(2)
  })

  it('detects a mixed list of search results and tags it as mixed', () => {
    const list = {
      object: 'list',
      results: [samplePage(), sampleDatabase(), sampleDataSource()],
    }
    const shape = detectShape(list)
    if (shape.kind !== 'list') throw new Error('expected list')
    expect(shape.objectType).toBe('mixed')
    expect(shape.links.length).toBe(3)
  })

  it('handles an empty list', () => {
    const shape = detectShape({ object: 'list', results: [] })
    if (shape.kind !== 'list') throw new Error('expected list')
    expect(shape.objectType).toBe('mixed')
    expect(shape.links.length).toBe(0)
  })

  it('drops list items that do not match a known object type', () => {
    const list = {
      object: 'list',
      results: [samplePage(), { object: 'unknown' }, { not: 'a notion thing' }],
    }
    const shape = detectShape(list)
    if (shape.kind !== 'list') throw new Error('expected list')
    expect(shape.links.length).toBe(1)
    expect(shape.objectType).toBe('page')
  })
})

describe('buildResourceLinks', () => {
  it('returns the link array for a single object', () => {
    const links = buildResourceLinks(samplePage())
    expect(links.length).toBe(1)
    expect(links[0].type).toBe('resource_link')
  })

  it('returns the items of a list', () => {
    const list = { object: 'list', results: [samplePage(), samplePage()] }
    expect(buildResourceLinks(list).length).toBe(2)
  })

  it('returns empty array for unknown shapes', () => {
    expect(buildResourceLinks({ message: 'unknown' })).toEqual([])
  })
})
