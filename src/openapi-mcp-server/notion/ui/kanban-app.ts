/**
 * Notion task kanban MCP App.
 *
 * Auto-detects the first `status` or `select` property across rows and groups
 * pages into lanes by that value. Each card renders title, due date, owner
 * avatars and a clickable link out to Notion.
 */
import type { NotionObject } from '../shapes'
import {
  buildUiResource,
  iconUrl,
  notionUrlForId,
  PreviewMode,
  renderHtmlPage,
  titleFromPageProperties,
  type UiAppContent,
} from './shared'

export const KANBAN_APP_URI = 'ui://notion/task-kanban'

type KanbanInput =
  | PreviewMode
  | { kind: 'rows'; items: NotionObject[]; data: unknown }

type Card = {
  id: string
  title: string
  url: string
  icon?: string
  due?: string
  owners: Array<{ name: string; avatar?: string }>
  groupKey: string
  groupColor?: string
}

type Lane = {
  key: string
  label: string
  color?: string
  cards: Card[]
}

type RenderModel = {
  lanes: Lane[]
  total: number
  groupBy?: string
  has_more: boolean
}

const COLOR_NAMES = new Set([
  'default',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
])

const safeColor = (c: unknown): string | undefined => {
  if (typeof c !== 'string') return undefined
  return COLOR_NAMES.has(c) ? c : undefined
}

const findGroupProperty = (items: NotionObject[]): string | undefined => {
  const candidates = new Map<string, number>()
  const scoreFor = (t: string) => (t === 'status' ? 3 : t === 'select' ? 2 : 0)
  for (const item of items) {
    const props = item.properties
    if (!props || typeof props !== 'object') continue
    for (const [key, value] of Object.entries(props)) {
      if (!value || typeof value !== 'object') continue
      const t = Reflect.get(value, 'type')
      if (typeof t !== 'string') continue
      const s = scoreFor(t)
      if (s > 0) candidates.set(key, (candidates.get(key) ?? 0) + s)
    }
  }
  let best: { key: string; score: number } | undefined
  for (const [key, score] of candidates) {
    if (!best || score > best.score) best = { key, score }
  }
  return best?.key
}

const groupValue = (item: NotionObject, key: string): { value: string; color?: string } => {
  const props = item.properties
  if (!props || typeof props !== 'object') return { value: 'No status' }
  const value = Reflect.get(props, key)
  if (!value || typeof value !== 'object') return { value: 'No status' }
  const type = Reflect.get(value, 'type')
  if (typeof type !== 'string') return { value: 'No status' }
  const inner = Reflect.get(value, type)
  if (!inner || typeof inner !== 'object') return { value: 'No status' }
  const name = Reflect.get(inner, 'name')
  if (typeof name !== 'string') return { value: 'No status' }
  return { value: name, color: safeColor(Reflect.get(inner, 'color')) }
}

const dateOf = (item: NotionObject): string | undefined => {
  const props = item.properties
  if (!props || typeof props !== 'object') return undefined
  for (const value of Object.values(props)) {
    if (!value || typeof value !== 'object') continue
    if (Reflect.get(value, 'type') === 'date') {
      const date = Reflect.get(value, 'date')
      if (date && typeof date === 'object') {
        const start = Reflect.get(date, 'start')
        if (typeof start === 'string') return start
      }
    }
  }
  return undefined
}

const ownersOf = (item: NotionObject): Array<{ name: string; avatar?: string }> => {
  const props = item.properties
  if (!props || typeof props !== 'object') return []
  for (const value of Object.values(props)) {
    if (!value || typeof value !== 'object') continue
      if (Reflect.get(value, 'type') === 'people') {
      const people = Reflect.get(value, 'people')
      if (Array.isArray(people)) {
        const out: Array<{ name: string; avatar?: string }> = []
        for (const p of people) {
          if (!p || typeof p !== 'object') continue
          const name = Reflect.get(p, 'name')
          const avatar = Reflect.get(p, 'avatar_url')
          out.push({
            name: typeof name === 'string' ? name : '?',
            avatar: typeof avatar === 'string' ? avatar : undefined,
          })
        }
        return out
      }
    }
  }
  return []
}

const reduceCard = (item: NotionObject, groupKey: string): Card => {
  const id = item.id ?? ''
  const title = titleFromPageProperties(item.properties) || '(Untitled)'
  const url = notionUrlForId(id, item.url ?? null)
  const icon = iconUrl(item.icon)
  const group = groupValue(item, groupKey)
  return {
    id,
    title,
    url,
    icon,
    due: dateOf(item),
    owners: ownersOf(item),
    groupKey: group.value,
    groupColor: group.color,
  }
}

const buildModel = (input: KanbanInput): RenderModel => {
  if (input.kind === 'preview') return PREVIEW_MODEL
  const groupBy = findGroupProperty(input.items)
  if (!groupBy) {
    return {
      lanes: [{ key: 'all', label: 'All', cards: input.items.map((i) => reduceCard(i, 'unused')) }],
      total: input.items.length,
      has_more: false,
    }
  }
  const cards = input.items.map((item) => reduceCard(item, groupBy))
  const laneMap = new Map<string, Lane>()
  for (const card of cards) {
    const key = card.groupKey || 'No status'
    if (!laneMap.has(key)) laneMap.set(key, { key, label: key, color: card.groupColor, cards: [] })
    const lane = laneMap.get(key)
    if (lane) lane.cards.push(card)
  }
  const has_more = (() => {
    if (!input.data || typeof input.data !== 'object') return false
    const v = Reflect.get(input.data, 'has_more')
    return typeof v === 'boolean' ? v : false
  })()
  return { lanes: Array.from(laneMap.values()), total: cards.length, groupBy, has_more }
}

const PREVIEW_MODEL: RenderModel = {
  lanes: [
    {
      key: 'In Progress',
      label: 'In Progress',
      color: 'blue',
      cards: [{ id: '1', title: 'Wire up resource_link blocks', url: 'https://www.notion.so', owners: [{ name: 'Marco' }], groupKey: 'In Progress' }],
    },
    {
      key: 'Done',
      label: 'Done',
      color: 'green',
      cards: [{ id: '2', title: 'Plan rich tool UIs', url: 'https://www.notion.so', owners: [], groupKey: 'Done' }],
    },
  ],
  total: 2,
  groupBy: 'Status',
  has_more: false,
}

export const renderKanbanApp = (input: KanbanInput): UiAppContent => {
  const model = buildModel(input)
  const html = renderHtmlPage({
    title: 'Notion kanban',
    initialData: model,
    styles: KANBAN_STYLES,
    body: '<div id="root"></div>',
    bootScript: KANBAN_BOOT_SCRIPT,
  })
  return buildUiResource(KANBAN_APP_URI, html, model)
}

const KANBAN_STYLES = `
  body { background: var(--bg); }
  .wrap { padding: 16px 24px 32px; }
  .topbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .topbar h1 { font-size: 18px; font-weight: 600; margin: 0; }
  .topbar .by { font-size: 12px; color: var(--fg-muted); }
  .board { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 8px; }
  .lane { background: var(--bg-soft); border: 1px solid var(--border); border-radius: 8px; padding: 12px; width: 280px; flex-shrink: 0; }
  .lane-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .lane-head .pill { font-weight: 600; }
  .lane-head .count { font-size: 12px; color: var(--fg-muted); }
  .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(15, 15, 15, 0.04); display: block; text-decoration: none; color: inherit; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
  .card:hover { border-color: var(--border-strong); box-shadow: var(--shadow); text-decoration: none; }
  .card .top { display: flex; gap: 6px; align-items: flex-start; }
  .card .icon-mini { width: 16px; height: 16px; flex-shrink: 0; line-height: 16px; text-align: center; }
  .card .icon-mini img { width: 16px; height: 16px; object-fit: cover; border-radius: 3px; }
  .card .title { font-size: 13px; font-weight: 500; line-height: 1.4; }
  .card .meta { display: flex; gap: 6px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
  .card .due { font-size: 11px; color: var(--fg-muted); }
  .card .owners { display: flex; gap: -4px; }
  .card .owners .avatar { width: 18px; height: 18px; font-size: 10px; margin-left: -4px; border: 1.5px solid var(--bg-card); }
  .card .owners .avatar:first-child { margin-left: 0; }
`

const KANBAN_BOOT_SCRIPT = String.raw`
  const root = document.getElementById('root');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" })[c]);
  const colorAttr = (c) => c && c !== 'default' ? ' data-color="' + esc(c) + '"' : '';
  const renderCard = (card) => {
    const iconHtml = card.icon
      ? (card.icon.startsWith('emoji:')
        ? '<span class="icon-mini">' + esc(card.icon.slice(6)) + '</span>'
        : '<span class="icon-mini"><img src="' + esc(card.icon) + '" alt="" /></span>')
      : '';
    const due = card.due ? '<span class="due">' + esc(new Date(card.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + '</span>' : '';
    const owners = card.owners && card.owners.length
      ? '<div class="owners">' + card.owners.slice(0, 3).map((p) => p.avatar ? '<span class="avatar"><img src="' + esc(p.avatar) + '" alt="" /></span>' : '<span class="avatar">' + esc((p.name || '?').slice(0, 1)) + '</span>').join('') + '</div>'
      : '';
    return '<a class="card" href="' + esc(card.url) + '" target="_blank" rel="noopener"><div class="top">' + iconHtml + '<div class="title">' + esc(card.title) + '</div></div>' + (due || owners ? '<div class="meta">' + due + owners + '</div>' : '') + '</a>';
  };
  const renderModel = (m) => {
    let html = '<div class="wrap"><div class="topbar"><h1>' + m.total + ' card' + (m.total === 1 ? '' : 's') + '</h1>';
    if (m.groupBy) html += '<span class="by">grouped by ' + esc(m.groupBy) + (m.has_more ? ' · more available' : '') + '</span>';
    html += '</div>';
    if (m.lanes.length === 0) {
      html += '<div class="empty-state">No cards.</div></div>';
      root.innerHTML = html;
      return;
    }
    html += '<div class="board">';
    for (const lane of m.lanes) {
      html += '<div class="lane"><div class="lane-head"><span class="pill"' + colorAttr(lane.color) + '>' + esc(lane.label) + '</span><span class="count">' + lane.cards.length + '</span></div>';
      for (const card of lane.cards) html += renderCard(card);
      html += '</div>';
    }
    html += '</div></div>';
    root.innerHTML = html;
  };
  renderModel(data);
`
