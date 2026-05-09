/**
 * Notion response → MCP content block projection.
 *
 * Detects well-known Notion API response shapes (page, database, data_source,
 * block, comment, user, paginated list, search results) and projects each item
 * to the metadata needed for an MCP `resource_link` content block plus the
 * MCP Apps initial-render-data payload.
 */
import { z } from 'zod'

const NOTION_OBJECT_TYPES = ['page', 'database', 'data_source', 'block', 'comment', 'user', 'property_item'] as const
type NotionObjectType = (typeof NOTION_OBJECT_TYPES)[number]

const richTextItemSchema = z
  .object({
    plain_text: z.string().optional(),
    text: z.object({ content: z.string().optional() }).partial().optional(),
  })
  .passthrough()

const richTextArraySchema = z.array(richTextItemSchema)

const iconSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('emoji'), emoji: z.string() }),
  z.object({ type: z.literal('external'), external: z.object({ url: z.string() }) }),
  z.object({ type: z.literal('file'), file: z.object({ url: z.string() }) }),
  z.object({
    type: z.literal('custom_emoji'),
    custom_emoji: z.object({ url: z.string(), name: z.string().optional() }),
  }),
])

const baseObjectSchema = z
  .object({
    id: z.string().optional(),
    url: z.string().optional(),
    public_url: z.string().nullish(),
    icon: iconSchema.nullish(),
    cover: iconSchema.nullish(),
    parent: z.record(z.unknown()).optional(),
    archived: z.boolean().optional(),
    in_trash: z.boolean().optional(),
    created_time: z.string().optional(),
    last_edited_time: z.string().optional(),
    properties: z.record(z.unknown()).optional(),
    title: z.union([richTextArraySchema, z.string()]).optional(),
    description: richTextArraySchema.optional(),
    rich_text: richTextArraySchema.optional(),
    name: z.string().optional(),
    avatar_url: z.string().nullish(),
    type: z.string().optional(),
    has_children: z.boolean().optional(),
    data_sources: z.array(z.object({ id: z.string(), name: z.string().optional() })).optional(),
  })
  .passthrough()

type NotionObject = z.infer<typeof baseObjectSchema>

const titlePropertyValueSchema = z.object({ type: z.literal('title'), title: richTextArraySchema })

const stripDashes = (id: string) => id.replace(/-/g, '')

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )

const encodeFallback = (glyph: string): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="22">${escapeXml(glyph)}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const FALLBACK_ICONS: Record<NotionObjectType, string> = {
  page: encodeFallback('📄'),
  database: encodeFallback('🗄'),
  data_source: encodeFallback('📊'),
  block: encodeFallback('▤'),
  comment: encodeFallback('💬'),
  user: encodeFallback('👤'),
  property_item: encodeFallback('▦'),
}

const NOTION_MIME: Record<NotionObjectType, string> = {
  page: 'application/vnd.notion.page+json',
  database: 'application/vnd.notion.database+json',
  data_source: 'application/vnd.notion.data-source+json',
  block: 'application/vnd.notion.block+json',
  comment: 'application/vnd.notion.comment+json',
  user: 'application/vnd.notion.user+json',
  property_item: 'application/vnd.notion.property-item+json',
}

export type NotionResourceLink = {
  type: 'resource_link'
  uri: string
  name: string
  title?: string
  description?: string
  mimeType: string
  icons?: Array<{ src: string; mimeType?: string }>
  annotations?: {
    audience?: ('user' | 'assistant')[]
    priority?: number
    lastModified?: string
  }
  _meta?: Record<string, unknown>
}

export type NotionShape =
  | { kind: 'object'; objectType: NotionObjectType; data: NotionObject; link: NotionResourceLink }
  | {
      kind: 'list'
      objectType: NotionObjectType | 'mixed'
      items: NotionObject[]
      links: NotionResourceLink[]
      raw: Record<string, unknown>
    }
  | { kind: 'unknown' }

const richTextToPlain = (rt: unknown): string => {
  if (typeof rt === 'string') return rt
  const parsed = richTextArraySchema.safeParse(rt)
  if (!parsed.success) return ''
  return parsed.data
    .map((item) => item.plain_text ?? item.text?.content ?? '')
    .join('')
    .trim()
}

const iconToSrc = (icon: unknown): string | undefined => {
  const parsed = iconSchema.safeParse(icon)
  if (!parsed.success) return undefined
  const { data } = parsed
  if (data.type === 'emoji') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="24">${escapeXml(data.emoji)}</text></svg>`
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  }
  if (data.type === 'external') return data.external.url
  if (data.type === 'file') return data.file.url
  if (data.type === 'custom_emoji') return data.custom_emoji.url
  return undefined
}

const notionUrlForId = (id: string | undefined, providedUrl?: string | null): string | undefined => {
  if (providedUrl) return providedUrl
  if (!id) return undefined
  return `https://www.notion.so/${stripDashes(id)}`
}

const titleFromPageProperties = (properties: Record<string, unknown> | undefined): string | undefined => {
  if (!properties) return undefined
  for (const value of Object.values(properties)) {
    const parsed = titlePropertyValueSchema.safeParse(value)
    if (!parsed.success) continue
    const t = richTextToPlain(parsed.data.title)
    if (t) return t
  }
  return undefined
}

const summarizeBlock = (block: NotionObject): { title: string; description?: string } => {
  const type = block.type ?? 'block'
  const blockRecord = z.record(z.unknown()).safeParse(block)
  const innerCandidate = blockRecord.success ? blockRecord.data[type] : undefined
  const innerParsed = z.object({ rich_text: z.unknown().optional() }).safeParse(innerCandidate)
  const text = innerParsed.success ? richTextToPlain(innerParsed.data.rich_text) : ''
  const label = type
    .split('_')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
  if (!text) return { title: label }
  return { title: text.length > 80 ? `${text.slice(0, 77)}…` : text, description: label }
}

const parentPageId = (parent: unknown): string | undefined => {
  const parsed = z.object({ page_id: z.string() }).safeParse(parent)
  return parsed.success ? parsed.data.page_id : undefined
}

const buildPageLink = (page: NotionObject): NotionResourceLink => {
  const id = page.id ?? ''
  const title = titleFromPageProperties(page.properties) ?? '(Untitled)'
  const url = notionUrlForId(id, page.public_url ?? page.url) ?? `notion://page/${id}`
  const icon = iconToSrc(page.icon) ?? FALLBACK_ICONS.page
  const description = page.archived || page.in_trash ? 'Archived page' : undefined
  return {
    type: 'resource_link',
    uri: url,
    name: id || title,
    title,
    description,
    mimeType: NOTION_MIME.page,
    icons: [{ src: icon, mimeType: 'image/svg+xml' }],
    annotations: {
      audience: ['user', 'assistant'],
      lastModified: page.last_edited_time,
    },
    _meta: { 'notion.objectType': 'page', 'notion.id': id },
  }
}

const buildDatabaseLink = (db: NotionObject): NotionResourceLink => {
  const id = db.id ?? ''
  const title = richTextToPlain(db.title) || '(Untitled database)'
  const url = notionUrlForId(id, db.url) ?? `notion://database/${id}`
  const icon = iconToSrc(db.icon) ?? FALLBACK_ICONS.database
  const sourcesCount = db.data_sources?.length ?? 0
  const description =
    richTextToPlain(db.description) ||
    (sourcesCount ? `${sourcesCount} data source${sourcesCount === 1 ? '' : 's'}` : undefined)
  return {
    type: 'resource_link',
    uri: url,
    name: id || title,
    title,
    description,
    mimeType: NOTION_MIME.database,
    icons: [{ src: icon, mimeType: 'image/svg+xml' }],
    annotations: {
      audience: ['user', 'assistant'],
      lastModified: db.last_edited_time,
    },
    _meta: { 'notion.objectType': 'database', 'notion.id': id },
  }
}

const buildDataSourceLink = (ds: NotionObject): NotionResourceLink => {
  const id = ds.id ?? ''
  const title = (ds.name && ds.name.trim()) || richTextToPlain(ds.title) || '(Untitled data source)'
  const url = ds.url ?? `notion://data_source/${id}`
  const icon = iconToSrc(ds.icon) ?? FALLBACK_ICONS.data_source
  const description = richTextToPlain(ds.description) || undefined
  return {
    type: 'resource_link',
    uri: url,
    name: id || title,
    title,
    description,
    mimeType: NOTION_MIME.data_source,
    icons: [{ src: icon, mimeType: 'image/svg+xml' }],
    annotations: {
      audience: ['user', 'assistant'],
      lastModified: ds.last_edited_time,
    },
    _meta: { 'notion.objectType': 'data_source', 'notion.id': id },
  }
}

const buildBlockLink = (block: NotionObject): NotionResourceLink => {
  const id = block.id ?? ''
  const { title, description } = summarizeBlock(block)
  const parent = parentPageId(block.parent)
  const url = parent
    ? `https://www.notion.so/${stripDashes(parent)}#${stripDashes(id)}`
    : `notion://block/${id}`
  return {
    type: 'resource_link',
    uri: url,
    name: id || title,
    title,
    description,
    mimeType: NOTION_MIME.block,
    icons: [{ src: FALLBACK_ICONS.block, mimeType: 'image/svg+xml' }],
    annotations: {
      audience: ['user', 'assistant'],
      lastModified: block.last_edited_time,
    },
    _meta: { 'notion.objectType': 'block', 'notion.id': id, 'notion.blockType': block.type },
  }
}

const buildCommentLink = (comment: NotionObject): NotionResourceLink => {
  const id = comment.id ?? ''
  const text = richTextToPlain(comment.rich_text) || '(empty comment)'
  const parent = parentPageId(comment.parent)
  const url = parent ? `https://www.notion.so/${stripDashes(parent)}` : `notion://comment/${id}`
  return {
    type: 'resource_link',
    uri: url,
    name: id || text,
    title: text.length > 80 ? `${text.slice(0, 77)}…` : text,
    description: 'Comment',
    mimeType: NOTION_MIME.comment,
    icons: [{ src: FALLBACK_ICONS.comment, mimeType: 'image/svg+xml' }],
    annotations: {
      audience: ['user', 'assistant'],
      lastModified: comment.last_edited_time ?? comment.created_time,
    },
    _meta: { 'notion.objectType': 'comment', 'notion.id': id },
  }
}

const buildUserLink = (user: NotionObject): NotionResourceLink => {
  const id = user.id ?? ''
  const title = user.name ?? '(Unnamed user)'
  const icon = user.avatar_url || FALLBACK_ICONS.user
  return {
    type: 'resource_link',
    uri: `notion://user/${id}`,
    name: id || title,
    title,
    description: user.type === 'bot' ? 'Bot user' : user.type === 'person' ? 'Person' : undefined,
    mimeType: NOTION_MIME.user,
    icons: [{ src: icon }],
    annotations: { audience: ['user', 'assistant'] },
    _meta: { 'notion.objectType': 'user', 'notion.id': id },
  }
}

const buildPropertyItemLink = (prop: NotionObject): NotionResourceLink => {
  const id = prop.id ?? ''
  const type = prop.type ?? 'property'
  return {
    type: 'resource_link',
    uri: `notion://property_item/${id}`,
    name: id || type,
    title: type,
    description: 'Property item',
    mimeType: NOTION_MIME.property_item,
    icons: [{ src: FALLBACK_ICONS.property_item, mimeType: 'image/svg+xml' }],
    annotations: { audience: ['user', 'assistant'] },
    _meta: { 'notion.objectType': 'property_item', 'notion.id': id },
  }
}

const linkBuilders: Record<NotionObjectType, (o: NotionObject) => NotionResourceLink> = {
  page: buildPageLink,
  database: buildDatabaseLink,
  data_source: buildDataSourceLink,
  block: buildBlockLink,
  comment: buildCommentLink,
  user: buildUserLink,
  property_item: buildPropertyItemLink,
}

const isNotionObjectType = (s: unknown): s is NotionObjectType => {
  if (typeof s !== 'string') return false
  return NOTION_OBJECT_TYPES.some((t) => t === s)
}

const listResponseSchema = z
  .object({
    object: z.literal('list'),
    results: z.array(z.unknown()).default([]),
  })
  .passthrough()

export const detectShape = (data: unknown): NotionShape => {
  const recordParsed = z.record(z.unknown()).safeParse(data)
  if (!recordParsed.success) return { kind: 'unknown' }
  const record = recordParsed.data
  const obj = record['object']

  const list = listResponseSchema.safeParse(record)
  if (list.success) {
    const types = new Set<NotionObjectType>()
    const items: NotionObject[] = []
    const links: NotionResourceLink[] = []
    for (const candidate of list.data.results) {
      const itemParsed = baseObjectSchema.safeParse(candidate)
      if (!itemParsed.success) continue
      const itemRecord = z.record(z.unknown()).safeParse(candidate)
      const itemTypeRaw = itemRecord.success ? itemRecord.data['object'] : undefined
      if (!isNotionObjectType(itemTypeRaw)) continue
      types.add(itemTypeRaw)
      items.push(itemParsed.data)
      links.push(linkBuilders[itemTypeRaw](itemParsed.data))
    }
    const objectType = types.size === 1 && items.length > 0 ? Array.from(types)[0] : 'mixed'
    return { kind: 'list', objectType, items, links, raw: record }
  }

  if (isNotionObjectType(obj)) {
    const itemParsed = baseObjectSchema.safeParse(record)
    if (!itemParsed.success) return { kind: 'unknown' }
    return {
      kind: 'object',
      objectType: obj,
      data: itemParsed.data,
      link: linkBuilders[obj](itemParsed.data),
    }
  }

  return { kind: 'unknown' }
}

export const buildResourceLinks = (data: unknown): NotionResourceLink[] => {
  const shape = detectShape(data)
  if (shape.kind === 'object') return [shape.link]
  if (shape.kind === 'list') return shape.links
  return []
}

export { NOTION_OBJECT_TYPES, NOTION_MIME }
export type { NotionObject, NotionObjectType }
