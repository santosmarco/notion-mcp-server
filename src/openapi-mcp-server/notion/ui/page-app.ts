/**
 * Notion page viewer MCP App.
 *
 * Renders a Notion page (cover, icon, title, properties summary) and/or its
 * block children (paragraphs, headings, todos, callouts, code, images,
 * dividers, quotes) as native-feeling Notion HTML inside a sandboxed iframe.
 */
import type { NotionObject } from '../shapes'
import {
  buildUiResource,
  iconUrl,
  initialIconForPage,
  notionUrlForId,
  PreviewMode,
  renderHtmlPage,
  richTextToPlain,
  stripDashes,
  titleFromPageProperties,
  type UiAppContent,
} from './shared'

export const PAGE_APP_URI = 'ui://notion/page-viewer'

type PageInput =
  | PreviewMode
  | { kind: 'page'; data: unknown }
  | { kind: 'blocks'; items: NotionObject[]; data: unknown }

type RenderModel = {
  page?: {
    id: string
    title: string
    icon: string
    cover?: string
    url: string
    last_edited_time?: string
  }
  blocks: Array<RenderedBlock>
}

type RenderedBlock = {
  id: string
  type: string
  text?: string
  checked?: boolean
  language?: string
  children?: RenderedBlock[]
  url?: string
  alt?: string
  href?: string
  color?: string
  number?: number
  emoji?: string
}

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  title: 'Title',
  rich_text: 'Text',
  number: 'Number',
  select: 'Select',
  multi_select: 'Multi-select',
  status: 'Status',
  date: 'Date',
  people: 'People',
  files: 'Files',
  checkbox: 'Checkbox',
  url: 'URL',
  email: 'Email',
  phone_number: 'Phone',
  formula: 'Formula',
  relation: 'Relation',
  rollup: 'Rollup',
  created_time: 'Created',
  last_edited_time: 'Edited',
  created_by: 'Created by',
  last_edited_by: 'Edited by',
}

const blockTextOf = (block: NotionObject): string => {
  const blockType = block.type
  if (!blockType) return ''
  const inner = Reflect.get(block, blockType)
  if (!inner || typeof inner !== 'object') return ''
  const rt = Reflect.get(inner, 'rich_text')
  return richTextToPlain(rt)
}

const reduceBlock = (block: NotionObject): RenderedBlock => {
  const id = block.id ?? ''
  const blockType = block.type ?? 'unsupported'
  const inner = blockType ? Reflect.get(block, blockType) : undefined
  const innerObj = inner && typeof inner === 'object' ? inner : {}
  const text = blockTextOf(block)
  const out: RenderedBlock = { id, type: blockType, text }
  if (blockType === 'to_do') {
    const checked = Reflect.get(innerObj, 'checked')
    if (typeof checked === 'boolean') out.checked = checked
  }
  if (blockType === 'code') {
    const language = Reflect.get(innerObj, 'language')
    if (typeof language === 'string') out.language = language
  }
  if (blockType === 'numbered_list_item') {
    const number = Reflect.get(innerObj, 'number')
    if (typeof number === 'number') out.number = number
  }
  if (blockType === 'image' || blockType === 'video' || blockType === 'file' || blockType === 'pdf') {
    const fileObj = Reflect.get(innerObj, 'file')
    const externalObj = Reflect.get(innerObj, 'external')
    const captionRt = Reflect.get(innerObj, 'caption')
    const caption = richTextToPlain(captionRt)
    if (fileObj && typeof fileObj === 'object') {
      const url = Reflect.get(fileObj, 'url')
      if (typeof url === 'string') out.url = url
    }
    if (externalObj && typeof externalObj === 'object') {
      const url = Reflect.get(externalObj, 'url')
      if (typeof url === 'string') out.url = url
    }
    if (caption) out.alt = caption
  }
  if (blockType === 'bookmark' || blockType === 'embed' || blockType === 'link_preview') {
    const url = Reflect.get(innerObj, 'url')
    if (typeof url === 'string') out.url = url
    if (typeof url === 'string') out.href = url
  }
  if (blockType === 'callout') {
    const icon = Reflect.get(innerObj, 'icon')
    if (icon && typeof icon === 'object' && Reflect.get(icon, 'type') === 'emoji') {
      const emoji = Reflect.get(icon, 'emoji')
      if (typeof emoji === 'string') out.emoji = emoji
    }
  }
  const color = Reflect.get(innerObj, 'color')
  if (typeof color === 'string' && color !== 'default') out.color = color
  return out
}

const reducePage = (data: unknown): RenderModel['page'] | undefined => {
  if (!data || typeof data !== 'object') return undefined
  if (Reflect.get(data, 'object') !== 'page') return undefined
  const id = Reflect.get(data, 'id')
  if (typeof id !== 'string') return undefined
  const properties = Reflect.get(data, 'properties')
  const title = titleFromPageProperties(properties) || '(Untitled)'
  const cover = Reflect.get(data, 'cover')
  const coverUrl = iconUrl(cover)
  const last_edited_time = Reflect.get(data, 'last_edited_time')
  const url = Reflect.get(data, 'url')
  const publicUrl = Reflect.get(data, 'public_url')
  const resolvedUrl = notionUrlForId(
    id,
    typeof publicUrl === 'string'
      ? publicUrl
      : typeof url === 'string'
      ? url
      : undefined,
  )
  return {
    id,
    title,
    icon: initialIconForPage({
      icon: typeof Reflect.get(data, 'icon') === 'object' ? Reflect.get(data, 'icon') : null,
    }),
    cover: typeof coverUrl === 'string' ? coverUrl : undefined,
    url: resolvedUrl,
    last_edited_time: typeof last_edited_time === 'string' ? last_edited_time : undefined,
  }
}

const buildModel = (input: PageInput): RenderModel => {
  if (input.kind === 'preview') return PREVIEW_MODEL
  if (input.kind === 'page') {
    const page = reducePage(input.data)
    return { page, blocks: [] }
  }
  return { blocks: input.items.map(reduceBlock) }
}

const PREVIEW_MODEL: RenderModel = {
  page: {
    id: '00000000000000000000000000000000',
    title: 'Notion page viewer',
    icon: 'emoji:📄',
    url: 'https://www.notion.so',
  },
  blocks: [
    { id: 'b1', type: 'heading_1', text: 'Welcome to the Notion page viewer' },
    { id: 'b2', type: 'paragraph', text: 'Pages and block lists from the Notion MCP server render here as native-feeling Notion content.' },
    { id: 'b3', type: 'callout', text: 'Pass a real page response to see icons, callouts, todos, code blocks, images and more.', emoji: '💡' },
  ],
}

export const renderPageApp = (input: PageInput): UiAppContent => {
  const model = buildModel(input)
  const html = renderHtmlPage({
    title: 'Notion page',
    initialData: model,
    styles: PAGE_STYLES,
    body: '<div id="root"></div>',
    bootScript: PAGE_BOOT_SCRIPT,
  })
  return buildUiResource(PAGE_APP_URI, html, model)
}

const PAGE_STYLES = `
  body { background: var(--bg); }
  .page { max-width: 720px; margin: 0 auto; padding: 0 0 64px; }
  .cover { width: 100%; height: 200px; object-fit: cover; }
  .header { padding: 24px 64px 8px; }
  .icon-large { width: 64px; height: 64px; font-size: 56px; line-height: 1; margin: -36px 0 12px; display: block; }
  .icon-large img { width: 64px; height: 64px; border-radius: 6px; object-fit: cover; }
  .title { font-size: 32px; font-weight: 700; margin: 0 0 4px; }
  .subtitle { color: var(--fg-muted); font-size: 12px; margin-bottom: 24px; display: flex; gap: 8px; align-items: center; }
  .blocks { padding: 0 64px; }
  .block { margin: 4px 0; }
  .b-h1 { font-size: 28px; font-weight: 700; margin-top: 32px; margin-bottom: 4px; }
  .b-h2 { font-size: 22px; font-weight: 600; margin-top: 24px; margin-bottom: 4px; }
  .b-h3 { font-size: 18px; font-weight: 600; margin-top: 20px; margin-bottom: 2px; }
  .b-p { font-size: 14px; line-height: 1.6; margin: 4px 0; }
  .b-quote { border-left: 3px solid var(--fg); padding: 4px 14px; font-size: 16px; line-height: 1.6; }
  .b-callout { background: var(--bg-soft); padding: 12px 16px; border-radius: 6px; display: flex; gap: 12px; align-items: flex-start; }
  .b-callout .emoji { font-size: 18px; line-height: 1.5; }
  .b-todo { display: flex; gap: 8px; align-items: flex-start; }
  .b-todo input { margin-top: 4px; }
  .b-todo.done { color: var(--fg-faint); text-decoration: line-through; }
  .b-bullet { padding-left: 24px; position: relative; }
  .b-bullet::before { content: "•"; position: absolute; left: 8px; color: var(--fg-muted); }
  .b-numbered { padding-left: 24px; position: relative; }
  .b-numbered::before { content: attr(data-n) "."; position: absolute; left: 4px; color: var(--fg-muted); }
  .b-code { background: var(--bg-soft); border-radius: 6px; padding: 12px 16px; font-family: var(--mono); font-size: 12.5px; overflow-x: auto; }
  .b-code .lang { font-size: 10px; text-transform: uppercase; color: var(--fg-faint); margin-bottom: 6px; letter-spacing: 0.5px; }
  .b-divider { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
  .b-image img { max-width: 100%; border-radius: 4px; }
  .b-image .caption { color: var(--fg-muted); font-size: 12px; margin-top: 4px; }
  .b-bookmark { border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; display: flex; flex-direction: column; gap: 4px; }
  .b-bookmark a { word-break: break-all; }
  .b-toggle { padding: 4px 0; }
  .b-toggle summary { cursor: pointer; }
  .b-empty { color: var(--fg-faint); padding: 48px; text-align: center; }
  .top-link { padding: 24px 64px 0; }
  .top-link a { font-size: 12px; color: var(--fg-muted); }
  @media (max-width: 640px) {
    .header { padding: 24px 24px 8px; }
    .blocks { padding: 0 24px; }
    .top-link { padding: 24px 24px 0; }
  }
`

const PAGE_BOOT_SCRIPT = String.raw`
  const root = document.getElementById('root');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" })[c]);
  const renderIcon = (raw, large) => {
    if (!raw) return '';
    if (raw.startsWith('emoji:')) return '<span class="icon-large" style="font-size:' + (large ? 56 : 18) + 'px">' + esc(raw.slice(6)) + '</span>';
    return '<span class="icon ' + (large ? 'icon-large' : '') + '"><img src="' + esc(raw) + '" alt="" /></span>';
  };
  const renderBlock = (b) => {
    const text = esc(b.text || '');
    if (b.type === 'heading_1') return '<h1 class="block b-h1">' + text + '</h1>';
    if (b.type === 'heading_2') return '<h2 class="block b-h2">' + text + '</h2>';
    if (b.type === 'heading_3') return '<h3 class="block b-h3">' + text + '</h3>';
    if (b.type === 'paragraph') return '<p class="block b-p">' + text + '</p>';
    if (b.type === 'quote') return '<blockquote class="block b-quote">' + text + '</blockquote>';
    if (b.type === 'callout') return '<div class="block b-callout"><span class="emoji">' + esc(b.emoji || '💡') + '</span><div>' + text + '</div></div>';
    if (b.type === 'to_do') return '<label class="block b-todo' + (b.checked ? ' done' : '') + '"><input type="checkbox" disabled ' + (b.checked ? 'checked' : '') + ' /><span>' + text + '</span></label>';
    if (b.type === 'bulleted_list_item') return '<div class="block b-bullet">' + text + '</div>';
    if (b.type === 'numbered_list_item') return '<div class="block b-numbered" data-n="' + (b.number ?? 1) + '">' + text + '</div>';
    if (b.type === 'code') return '<div class="block b-code"><div class="lang">' + esc(b.language || 'text') + '</div><pre>' + text + '</pre></div>';
    if (b.type === 'divider') return '<hr class="b-divider" />';
    if (b.type === 'image') return '<div class="block b-image"><img src="' + esc(b.url || '') + '" alt="' + esc(b.alt || '') + '" />' + (b.alt ? '<div class="caption">' + esc(b.alt) + '</div>' : '') + '</div>';
    if (b.type === 'bookmark' || b.type === 'embed' || b.type === 'link_preview') return '<div class="block b-bookmark"><a href="' + esc(b.url || '#') + '" target="_blank" rel="noopener">' + esc(b.url || 'Bookmark') + '</a></div>';
    if (b.type === 'toggle') return '<details class="block b-toggle"><summary>' + (text || 'Toggle') + '</summary></details>';
    if (b.type === 'unsupported') return '<div class="block" style="color:var(--fg-faint)">Unsupported block</div>';
    return '<div class="block b-p">' + (text || ('<span style="color:var(--fg-faint)">' + esc(b.type) + '</span>')) + '</div>';
  };
  const renderModel = (m) => {
    let html = '<article class="page">';
    if (m.page && m.page.cover) html += '<img class="cover" src="' + esc(m.page.cover) + '" alt="" />';
    if (m.page) {
      html += '<header class="header">' + renderIcon(m.page.icon, true);
      html += '<h1 class="title">' + esc(m.page.title) + '</h1>';
      const sub = [];
      if (m.page.last_edited_time) sub.push('Last edited ' + new Date(m.page.last_edited_time).toLocaleString());
      sub.push('<a href="' + esc(m.page.url) + '" target="_blank" rel="noopener">Open in Notion ↗</a>');
      html += '<div class="subtitle">' + sub.join(' · ') + '</div></header>';
    }
    if (!m.blocks || m.blocks.length === 0) {
      if (!m.page) html += '<div class="b-empty">No blocks to display.</div>';
    } else {
      html += '<div class="blocks">' + m.blocks.map(renderBlock).join('') + '</div>';
    }
    html += '</article>';
    root.innerHTML = html;
  };
  renderModel(data);
`
