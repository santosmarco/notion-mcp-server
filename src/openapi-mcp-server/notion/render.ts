/**
 * Build the MCP `CallToolResult.content` array for a Notion API response.
 *
 * Always includes the original JSON as a text block (back-compat for any host
 * that ignores resource_link or embedded resources). Adds `resource_link`
 * blocks per detected Notion item and an MCP App `EmbeddedResource` when the
 * shape matches a known UI app.
 */
import { detectShape, type NotionShape, type NotionResourceLink } from './shapes'
import { renderUiAppForShape, type UiAppContent } from './ui'

export type ToolResultContent =
  | { type: 'text'; text: string }
  | NotionResourceLink
  | { type: 'resource'; resource: UiAppContent }

export type BuiltToolResult = {
  content: ToolResultContent[]
  structuredContent?: Record<string, unknown>
}

const summaryText = (shape: NotionShape): string | undefined => {
  if (shape.kind === 'object') return `Notion ${shape.objectType}: ${shape.link.title ?? shape.link.name}`
  if (shape.kind === 'list') {
    const t = shape.objectType === 'mixed' ? 'item' : shape.objectType
    return `${shape.links.length} Notion ${t}${shape.links.length === 1 ? '' : 's'}`
  }
  return undefined
}

export const buildToolResultContent = (
  toolName: string,
  data: unknown,
): BuiltToolResult => {
  const jsonText = JSON.stringify(data)
  const shape = detectShape(data)

  const content: ToolResultContent[] = [{ type: 'text', text: jsonText }]

  if (shape.kind === 'unknown') {
    return { content }
  }

  const links = shape.kind === 'object' ? [shape.link] : shape.links
  for (const link of links) content.push(link)

  const ui = renderUiAppForShape(toolName, shape, data)
  if (ui) content.push({ type: 'resource', resource: ui })

  const summary = summaryText(shape)
  const structuredContent: Record<string, unknown> = {
    notion: {
      shape: shape.kind === 'object' ? shape.objectType : `list:${shape.objectType}`,
      ...(shape.kind === 'list'
        ? { count: shape.links.length, has_more: Boolean(structuredHasMore(shape.raw)) }
        : {}),
      ...(summary ? { summary } : {}),
    },
    data,
  }
  return { content, structuredContent }
}

const structuredHasMore = (raw: unknown): boolean => {
  if (typeof raw !== 'object' || raw === null) return false
  const candidate = Reflect.get(raw, 'has_more')
  return typeof candidate === 'boolean' ? candidate : false
}
