/**
 * Notion data source results table MCP App.
 *
 * Renders a paginated query response as a sortable table. Each row is a page.
 * Columns are inferred from union of property keys across rows. Property
 * values render with proper Notion semantics (status/select pills, people
 * avatars, dates, checkboxes, relations, urls).
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

export const TABLE_APP_URI = 'ui://notion/data-source-table'

type TableInput =
  | PreviewMode
  | { kind: 'rows'; items: NotionObject[]; data: unknown }

type Cell =
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'pill'; value: string; color?: string }
  | { kind: 'pills'; values: Array<{ value: string; color?: string }> }
  | { kind: 'people'; values: Array<{ name: string; avatar?: string }> }
  | { kind: 'date'; value: string }
  | { kind: 'checkbox'; value: boolean }
  | { kind: 'url'; value: string }
  | { kind: 'empty' }

type Row = {
  id: string
  url: string
  title: string
  icon?: string
  cells: Record<string, Cell>
}

type ColumnSpec = {
  key: string
  label: string
  type: string
}

type RenderModel = {
  columns: ColumnSpec[]
  rows: Row[]
  total: number
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

const renderCell = (propValue: unknown): Cell => {
  if (!propValue || typeof propValue !== 'object') return { kind: 'empty' }
  const type = Reflect.get(propValue, 'type')
  const inner = typeof type === 'string' ? Reflect.get(propValue, type) : undefined
  if (type === 'title' || type === 'rich_text') {
    const text = richTextToPlain(inner)
    return text ? { kind: 'text', value: text } : { kind: 'empty' }
  }
  if (type === 'number') {
    return typeof inner === 'number' ? { kind: 'number', value: inner } : { kind: 'empty' }
  }
  if (type === 'select' || type === 'status') {
    if (!inner || typeof inner !== 'object') return { kind: 'empty' }
    const name = Reflect.get(inner, 'name')
    const color = safeColor(Reflect.get(inner, 'color'))
    return typeof name === 'string' ? { kind: 'pill', value: name, color } : { kind: 'empty' }
  }
  if (type === 'multi_select') {
    if (!Array.isArray(inner)) return { kind: 'empty' }
    const values: Array<{ value: string; color?: string }> = []
    for (const opt of inner) {
      if (!opt || typeof opt !== 'object') continue
      const name = Reflect.get(opt, 'name')
      if (typeof name !== 'string') continue
      values.push({ value: name, color: safeColor(Reflect.get(opt, 'color')) })
    }
    return values.length ? { kind: 'pills', values } : { kind: 'empty' }
  }
  if (type === 'date') {
    if (!inner || typeof inner !== 'object') return { kind: 'empty' }
    const start = Reflect.get(inner, 'start')
    return typeof start === 'string' ? { kind: 'date', value: start } : { kind: 'empty' }
  }
  if (type === 'people') {
    if (!Array.isArray(inner)) return { kind: 'empty' }
    const values: Array<{ name: string; avatar?: string }> = []
    for (const p of inner) {
      if (!p || typeof p !== 'object') continue
      const name = Reflect.get(p, 'name')
      const avatar = Reflect.get(p, 'avatar_url')
      values.push({
        name: typeof name === 'string' ? name : '?',
        avatar: typeof avatar === 'string' ? avatar : undefined,
      })
    }
    return values.length ? { kind: 'people', values } : { kind: 'empty' }
  }
  if (type === 'checkbox') {
    return typeof inner === 'boolean' ? { kind: 'checkbox', value: inner } : { kind: 'empty' }
  }
  if (type === 'url' || type === 'email' || type === 'phone_number') {
    return typeof inner === 'string' && inner ? { kind: 'url', value: inner } : { kind: 'empty' }
  }
  if (type === 'relation') {
    if (!Array.isArray(inner)) return { kind: 'empty' }
    const count = inner.length
    return count ? { kind: 'text', value: `${count} link${count === 1 ? '' : 's'}` } : { kind: 'empty' }
  }
  if (type === 'created_time' || type === 'last_edited_time') {
    return typeof inner === 'string' ? { kind: 'date', value: inner } : { kind: 'empty' }
  }
  if (type === 'created_by' || type === 'last_edited_by') {
    if (!inner || typeof inner !== 'object') return { kind: 'empty' }
    const name = Reflect.get(inner, 'name')
    const avatar = Reflect.get(inner, 'avatar_url')
    return {
      kind: 'people',
      values: [
        {
          name: typeof name === 'string' ? name : '?',
          avatar: typeof avatar === 'string' ? avatar : undefined,
        },
      ],
    }
  }
  if (type === 'formula') {
    if (!inner || typeof inner !== 'object') return { kind: 'empty' }
    const ftype = Reflect.get(inner, 'type')
    if (typeof ftype !== 'string') return { kind: 'empty' }
    const fval = Reflect.get(inner, ftype)
    if (fval === null || fval === undefined) return { kind: 'empty' }
    if (typeof fval === 'string') return { kind: 'text', value: fval }
    if (typeof fval === 'number') return { kind: 'number', value: fval }
    if (typeof fval === 'boolean') return { kind: 'checkbox', value: fval }
    return { kind: 'text', value: String(fval) }
  }
  return { kind: 'empty' }
}

const collectColumns = (items: NotionObject[]): ColumnSpec[] => {
  const seen = new Map<string, ColumnSpec>()
  for (const item of items) {
    const properties = item.properties
    if (!properties || typeof properties !== 'object') continue
    for (const [key, value] of Object.entries(properties)) {
      if (!value || typeof value !== 'object') continue
      const t = Reflect.get(value, 'type')
      if (typeof t !== 'string') continue
      if (t === 'title') continue
      if (!seen.has(key)) seen.set(key, { key, label: key, type: t })
    }
  }
  return Array.from(seen.values())
}

const reduceRow = (item: NotionObject, columns: ColumnSpec[]): Row => {
  const id = item.id ?? ''
  const properties = item.properties
  const title = titleFromPageProperties(properties) || '(Untitled)'
  const icon = iconUrl(item.icon)
  const url = notionUrlForId(id, item.url ?? null)
  const cells: Record<string, Cell> = {}
  if (properties && typeof properties === 'object') {
    for (const col of columns) {
      cells[col.key] = renderCell(Reflect.get(properties, col.key))
    }
  }
  return { id, url, title, icon, cells }
}

const buildModel = (input: TableInput): RenderModel => {
  if (input.kind === 'preview') return PREVIEW_MODEL
  const columns = collectColumns(input.items)
  const rows = input.items.map((item) => reduceRow(item, columns))
  const has_more = (() => {
    if (!input.data || typeof input.data !== 'object') return false
    const v = Reflect.get(input.data, 'has_more')
    return typeof v === 'boolean' ? v : false
  })()
  return { columns, rows, total: rows.length, has_more }
}

const PREVIEW_MODEL: RenderModel = {
  columns: [
    { key: 'Status', label: 'Status', type: 'status' },
    { key: 'Owner', label: 'Owner', type: 'people' },
    { key: 'Due', label: 'Due', type: 'date' },
  ],
  rows: [
    {
      id: '1',
      url: 'https://www.notion.so',
      title: 'Sample task',
      cells: {
        Status: { kind: 'pill', value: 'In Progress', color: 'blue' },
        Owner: { kind: 'people', values: [{ name: 'Alex' }] },
        Due: { kind: 'date', value: new Date().toISOString() },
      },
    },
  ],
  total: 1,
  has_more: false,
}

export const renderTableApp = (input: TableInput): UiAppContent => {
  const model = buildModel(input)
  const html = renderHtmlPage({
    title: 'Notion data source',
    initialData: model,
    styles: TABLE_STYLES,
    body: '<div id="root"></div>',
    bootScript: TABLE_BOOT_SCRIPT,
  })
  return buildUiResource(TABLE_APP_URI, html, model)
}

const TABLE_STYLES = `
  body { background: var(--bg); }
  .wrap { padding: 16px 24px 32px; }
  .topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
  .topbar h1 { font-size: 18px; margin: 0; font-weight: 600; }
  .filter { background: var(--bg-soft); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-size: 13px; min-width: 220px; color: var(--fg); }
  .filter:focus { outline: none; border-color: var(--accent); }
  .summary { font-size: 12px; color: var(--fg-muted); }
  table { width: 100%; border-collapse: collapse; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  th, td { padding: 8px 12px; text-align: left; font-size: 13px; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--fg-muted); background: var(--bg-soft); cursor: pointer; user-select: none; white-space: nowrap; }
  th[data-sort="asc"]::after { content: " ↑"; }
  th[data-sort="desc"]::after { content: " ↓"; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--bg-soft); }
  .row-title { display: flex; gap: 8px; align-items: center; min-width: 200px; max-width: 360px; }
  .row-title a { color: var(--fg); font-weight: 500; }
  .row-title a:hover { color: var(--accent); }
  .icon-mini { width: 16px; height: 16px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; }
  .icon-mini img { width: 100%; height: 100%; object-fit: cover; border-radius: 3px; }
  .cell-empty { color: var(--fg-faint); }
  .cell-pills { display: flex; flex-wrap: wrap; gap: 4px; }
  .cell-people { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .cell-people .name { font-size: 12px; color: var(--fg-muted); }
  .cell-date { color: var(--fg-muted); white-space: nowrap; }
  .cell-checkbox { font-size: 14px; }
  .footer { font-size: 12px; color: var(--fg-muted); padding: 12px 0 0; }
`

const TABLE_BOOT_SCRIPT = String.raw`
  const root = document.getElementById('root');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" })[c]);
  const colorAttr = (c) => c && c !== 'default' ? ' data-color="' + esc(c) + '"' : '';
  const renderCell = (cell) => {
    if (!cell || cell.kind === 'empty') return '<span class="cell-empty">—</span>';
    if (cell.kind === 'text') return esc(cell.value);
    if (cell.kind === 'number') return String(cell.value);
    if (cell.kind === 'pill') return '<span class="pill"' + colorAttr(cell.color) + '>' + esc(cell.value) + '</span>';
    if (cell.kind === 'pills') return '<div class="cell-pills">' + cell.values.map((v) => '<span class="pill"' + colorAttr(v.color) + '>' + esc(v.value) + '</span>').join('') + '</div>';
    if (cell.kind === 'people') return '<div class="cell-people">' + cell.values.map((p) => (p.avatar ? '<span class="avatar"><img src="' + esc(p.avatar) + '" alt="" /></span>' : '<span class="avatar">' + esc((p.name || '?').slice(0, 1)) + '</span>') + '<span class="name">' + esc(p.name) + '</span>').join('') + '</div>';
    if (cell.kind === 'date') { const d = new Date(cell.value); return '<span class="cell-date">' + (isNaN(d.getTime()) ? esc(cell.value) : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })) + '</span>'; }
    if (cell.kind === 'checkbox') return '<span class="cell-checkbox">' + (cell.value ? '☑' : '☐') + '</span>';
    if (cell.kind === 'url') return '<a href="' + esc(cell.value) + '" target="_blank" rel="noopener">' + esc(cell.value) + '</a>';
    return '';
  };
  let sortKey = null;
  let sortDir = 'asc';
  let filterText = '';
  const cmp = (a, b) => {
    if (!sortKey) return 0;
    const av = a.cells[sortKey], bv = b.cells[sortKey];
    const norm = (c) => {
      if (!c || c.kind === 'empty') return '';
      if (c.kind === 'text' || c.kind === 'pill' || c.kind === 'date' || c.kind === 'url') return c.value || '';
      if (c.kind === 'number') return c.value;
      if (c.kind === 'checkbox') return c.value ? 1 : 0;
      if (c.kind === 'pills') return c.values.map(v => v.value).join(',');
      if (c.kind === 'people') return c.values.map(v => v.name).join(',');
      return '';
    };
    const A = norm(av), B = norm(bv);
    if (A === B) return 0;
    return (A > B ? 1 : -1) * (sortDir === 'asc' ? 1 : -1);
  };
  const renderModel = (m) => {
    const visible = m.rows
      .filter((r) => !filterText || r.title.toLowerCase().includes(filterText) || Object.values(r.cells).some((c) => c && c.kind === 'text' && c.value.toLowerCase().includes(filterText)))
      .slice()
      .sort(cmp);
    let html = '<div class="wrap"><div class="topbar"><h1>' + m.total + ' row' + (m.total === 1 ? '' : 's') + (m.has_more ? ' (more available)' : '') + '</h1>';
    html += '<input class="filter" type="search" placeholder="Filter rows…" value="' + esc(filterText) + '" id="__filter" />';
    html += '</div>';
    if (m.rows.length === 0) {
      html += '<div class="empty-state">No rows.</div></div>';
      root.innerHTML = html;
      return;
    }
    html += '<table><thead><tr><th data-key="__title"' + (sortKey === '__title' ? ' data-sort="' + sortDir + '"' : '') + '>Name</th>';
    for (const col of m.columns) {
      const sortAttr = sortKey === col.key ? ' data-sort="' + sortDir + '"' : '';
      html += '<th data-key="' + esc(col.key) + '"' + sortAttr + '>' + esc(col.label) + '</th>';
    }
    html += '</tr></thead><tbody>';
    for (const row of visible) {
      html += '<tr>';
      const iconHtml = row.icon ? (row.icon.startsWith('emoji:') ? '<span class="icon-mini">' + esc(row.icon.slice(6)) + '</span>' : '<span class="icon-mini"><img src="' + esc(row.icon) + '" alt="" /></span>') : '';
      html += '<td><div class="row-title">' + iconHtml + '<a href="' + esc(row.url) + '" target="_blank" rel="noopener">' + esc(row.title) + '</a></div></td>';
      for (const col of m.columns) html += '<td>' + renderCell(row.cells[col.key]) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    if (visible.length < m.rows.length) html += '<div class="footer">Showing ' + visible.length + ' of ' + m.rows.length + ' (filtered).</div>';
    html += '</div>';
    root.innerHTML = html;
    const titleSort = (key) => () => {
      if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = key; sortDir = 'asc'; }
      renderModel(m);
    };
    document.querySelectorAll('th[data-key]').forEach((th) => {
      const key = th.getAttribute('data-key');
      if (key === '__title') {
        th.addEventListener('click', () => {
          if (sortKey === '__title') sortDir = sortDir === 'asc' ? 'desc' : 'asc';
          else { sortKey = '__title'; sortDir = 'asc'; }
          const sorter = (a, b) => (a.title === b.title ? 0 : (a.title > b.title ? 1 : -1) * (sortDir === 'asc' ? 1 : -1));
          m = Object.assign({}, m, { rows: m.rows.slice().sort(sorter) });
          sortKey = null; renderModel(m);
        });
      } else {
        th.addEventListener('click', titleSort(key));
      }
    });
    const filterEl = document.getElementById('__filter');
    if (filterEl) filterEl.addEventListener('input', (e) => { filterText = String(e.target.value || '').toLowerCase(); renderModel(m); });
  };
  renderModel(data);
`
