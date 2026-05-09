/**
 * Notion search results MCP App.
 *
 * Renders a list of mixed search hits (pages, databases, data sources) as a
 * gallery of cards: icon + title + parent breadcrumb + last edited time.
 */
import type { NotionObject } from '../shapes'
import {
  buildUiResource,
  iconUrl,
  notionUrlForId,
  PreviewMode,
  renderHtmlPage,
  richTextToPlain,
  titleFromPageProperties,
  type UiAppContent,
} from './shared'

export const SEARCH_APP_URI = 'ui://notion/search-results'

type SearchInput =
  | PreviewMode
  | { kind: 'results'; items: NotionObject[]; data: unknown }

type Hit = {
  id: string
  type: string
  title: string
  icon?: string
  parent?: string
  url: string
  last_edited_time?: string
}

type RenderModel = {
  hits: Hit[]
  total: number
  has_more: boolean
  query?: string
}

const titleFor = (item: NotionObject): string => {
  const objectType = item.type ?? Reflect.get(item, 'object')
  if (objectType === 'database' || Reflect.get(item, 'object') === 'database') {
    return richTextToPlain(item.title) || '(Untitled database)'
  }
  if (objectType === 'data_source' || Reflect.get(item, 'object') === 'data_source') {
    return (item.name && item.name.trim()) || richTextToPlain(item.title) || '(Untitled data source)'
  }
  return titleFromPageProperties(item.properties) || '(Untitled)'
}

const parentLabel = (parent: unknown): string | undefined => {
  if (!parent || typeof parent !== 'object') return undefined
  const t = Reflect.get(parent, 'type')
  if (t === 'database_id') return 'In database'
  if (t === 'data_source_id') return 'In data source'
  if (t === 'page_id') return 'In page'
  if (t === 'workspace') return 'Workspace'
  if (t === 'block_id') return 'In block'
  return undefined
}

const reduceHit = (item: NotionObject): Hit => {
  const id = item.id ?? ''
  const objectField = Reflect.get(item, 'object')
  const type = typeof objectField === 'string' ? objectField : 'item'
  const title = titleFor(item)
  const icon = iconUrl(item.icon) ?? (type === 'database' ? 'emoji:🗄' : type === 'data_source' ? 'emoji:📊' : 'emoji:📄')
  const url = notionUrlForId(id, item.url ?? null)
  return {
    id,
    type,
    title,
    icon,
    parent: parentLabel(item.parent),
    url,
    last_edited_time: item.last_edited_time,
  }
}

const buildModel = (input: SearchInput): RenderModel => {
  if (input.kind === 'preview') return PREVIEW_MODEL
  const hits = input.items.map(reduceHit)
  const has_more = (() => {
    if (!input.data || typeof input.data !== 'object') return false
    const v = Reflect.get(input.data, 'has_more')
    return typeof v === 'boolean' ? v : false
  })()
  return { hits, total: hits.length, has_more }
}

const PREVIEW_MODEL: RenderModel = {
  hits: [
    { id: '1', type: 'page', title: 'Engineering home', icon: 'emoji:🏠', parent: 'Workspace', url: 'https://www.notion.so' },
    { id: '2', type: 'database', title: 'Tasks', icon: 'emoji:🗄', parent: 'In page', url: 'https://www.notion.so' },
    { id: '3', type: 'data_source', title: 'Q4 OKRs', icon: 'emoji:📊', parent: 'In database', url: 'https://www.notion.so' },
  ],
  total: 3,
  has_more: false,
}

export const renderSearchApp = (input: SearchInput): UiAppContent => {
  const model = buildModel(input)
  const html = renderHtmlPage({
    title: 'Notion search',
    initialData: model,
    styles: SEARCH_STYLES,
    body: '<div id="root"></div>',
    bootScript: SEARCH_BOOT_SCRIPT,
  })
  return buildUiResource(SEARCH_APP_URI, html, model)
}

const SEARCH_STYLES = `
  body { background: var(--bg); }
  .wrap { padding: 16px 24px 32px; }
  .topbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  .topbar h1 { font-size: 18px; margin: 0; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 14px; display: flex; gap: 12px; align-items: flex-start; transition: border-color 0.15s ease, box-shadow 0.15s ease; text-decoration: none; color: inherit; }
  .card:hover { border-color: var(--border-strong); box-shadow: var(--shadow); text-decoration: none; }
  .card .icon-large { width: 28px; height: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 22px; line-height: 1; }
  .card .icon-large img { width: 28px; height: 28px; border-radius: 4px; object-fit: cover; }
  .card .body { flex: 1; min-width: 0; }
  .card .title { font-size: 14px; font-weight: 600; color: var(--fg); line-height: 1.35; margin: 0 0 4px; word-wrap: break-word; }
  .card .meta { font-size: 11px; color: var(--fg-muted); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .type-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; background: var(--pill-gray); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--fg-muted); font-weight: 600; }
`

const SEARCH_BOOT_SCRIPT = String.raw`
  const root = document.getElementById('root');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" })[c]);
  const renderModel = (m) => {
    let html = '<div class="wrap"><div class="topbar"><h1>' + m.total + ' result' + (m.total === 1 ? '' : 's') + (m.has_more ? ' (more available)' : '') + '</h1></div>';
    if (m.total === 0) {
      html += '<div class="empty-state">No matches.</div></div>';
      root.innerHTML = html;
      return;
    }
    html += '<div class="grid">';
    for (const hit of m.hits) {
      const iconHtml = hit.icon
        ? (hit.icon.startsWith('emoji:')
          ? '<span class="icon-large">' + esc(hit.icon.slice(6)) + '</span>'
          : '<span class="icon-large"><img src="' + esc(hit.icon) + '" alt="" /></span>')
        : '<span class="icon-large">📄</span>';
      const meta = [];
      meta.push('<span class="type-badge">' + esc(hit.type) + '</span>');
      if (hit.parent) meta.push(esc(hit.parent));
      if (hit.last_edited_time) meta.push('Updated ' + new Date(hit.last_edited_time).toLocaleDateString());
      html += '<a class="card" href="' + esc(hit.url) + '" target="_blank" rel="noopener">' + iconHtml + '<div class="body"><div class="title">' + esc(hit.title) + '</div><div class="meta">' + meta.join(' · ') + '</div></div></a>';
    }
    html += '</div></div>';
    root.innerHTML = html;
  };
  renderModel(data);
`
