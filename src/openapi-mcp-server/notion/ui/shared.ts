/**
 * Shared building blocks for the Notion MCP Apps.
 *
 * Each app is delivered as a single HTML string with inline CSS + ES module
 * script. The script imports the MCP Apps `App` class from esm.sh so we don't
 * need to bundle it server-side. Initial render data is passed via
 * `_meta['mcpui.dev/ui-initial-render-data']` and read by the app on boot.
 */
import type { NotionObject } from '../shapes'

export const APP_BRIDGE_URL = 'https://esm.sh/@modelcontextprotocol/ext-apps@1.7.1'

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => {
    if (c === '&') return '&amp;'
    if (c === '<') return '&lt;'
    if (c === '>') return '&gt;'
    if (c === '"') return '&quot;'
    return '&#39;'
  })

export const escapeAttr = (s: string): string => escapeHtml(s)

export const baseStyles = `
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --bg-soft: #f7f6f3;
    --bg-card: #ffffff;
    --fg: #37352f;
    --fg-muted: #6b6b6b;
    --fg-faint: #9b9a97;
    --border: rgba(55, 53, 47, 0.09);
    --border-strong: rgba(55, 53, 47, 0.16);
    --accent: #2383e2;
    --accent-soft: rgba(35, 131, 226, 0.12);
    --pill-gray: rgba(55, 53, 47, 0.08);
    --pill-blue: rgba(35, 131, 226, 0.18);
    --pill-green: rgba(0, 135, 107, 0.18);
    --pill-yellow: rgba(255, 212, 0, 0.25);
    --pill-orange: rgba(255, 122, 0, 0.22);
    --pill-pink: rgba(255, 0, 127, 0.18);
    --pill-purple: rgba(155, 81, 224, 0.18);
    --pill-red: rgba(224, 62, 62, 0.18);
    --shadow: 0 1px 2px rgba(15, 15, 15, 0.06), 0 4px 12px rgba(15, 15, 15, 0.04);
    --radius: 8px;
    --radius-sm: 4px;
    --mono: ui-monospace, "SF Mono", "Menlo", "Cascadia Code", "Roboto Mono", monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #191919;
      --bg-soft: #202020;
      --bg-card: #2a2a2a;
      --fg: #ebebeb;
      --fg-muted: #9b9b9b;
      --fg-faint: #6b6b6b;
      --border: rgba(255, 255, 255, 0.094);
      --border-strong: rgba(255, 255, 255, 0.16);
      --accent: #529cca;
      --accent-soft: rgba(82, 156, 202, 0.18);
      --pill-gray: rgba(255, 255, 255, 0.08);
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.18);
    }
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.5;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .empty {
    padding: 32px;
    text-align: center;
    color: var(--fg-faint);
  }
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    border-radius: 4px;
    overflow: hidden;
  }
  .icon img { width: 100%; height: 100%; object-fit: cover; }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 12px;
    background: var(--pill-gray);
    color: var(--fg);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.4;
    white-space: nowrap;
  }
  .pill[data-color="blue"] { background: var(--pill-blue); }
  .pill[data-color="green"] { background: var(--pill-green); }
  .pill[data-color="yellow"] { background: var(--pill-yellow); }
  .pill[data-color="orange"] { background: var(--pill-orange); }
  .pill[data-color="pink"] { background: var(--pill-pink); }
  .pill[data-color="purple"] { background: var(--pill-purple); }
  .pill[data-color="red"] { background: var(--pill-red); }
  .avatar {
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: var(--pill-gray);
    color: var(--fg-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    overflow: hidden;
    text-transform: uppercase;
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  .empty-state {
    padding: 64px 24px;
    text-align: center;
    color: var(--fg-faint);
  }
`

export const renderHtmlPage = (opts: {
  title: string
  initialData: unknown
  body: string
  styles?: string
  bootScript: string
}): string => {
  const initial = JSON.stringify(opts.initialData ?? null).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(opts.title)}</title>
<style>${baseStyles}${opts.styles ?? ''}</style>
</head>
<body>
${opts.body}
<script id="__initial_data" type="application/json">${initial}</script>
<script type="module">
const INITIAL = JSON.parse(document.getElementById('__initial_data').textContent);
let CURRENT = INITIAL;
const renderRoot = (data) => { ${opts.bootScript} }
renderRoot(CURRENT);
try {
  const mod = await import('${APP_BRIDGE_URL}');
  if (mod && mod.App) {
    const app = new mod.App({ name: 'notion-app', version: '1.0.0' });
    app.ontoolinput = (params) => {
      if (params && params.input) {
        CURRENT = Object.assign({}, CURRENT, params.input);
        renderRoot(CURRENT);
      }
    };
    await app.connect();
  }
} catch (err) {
  console.warn('MCP App bridge unavailable, running standalone:', err);
}
</script>
</body>
</html>`
}

export const buildUiResource = (uri: string, html: string, initialData: unknown) => ({
  uri,
  mimeType: 'text/html;profile=mcp-app' as const,
  text: html,
  _meta: {
    'mcpui.dev/ui-initial-render-data': initialData,
    'mcpui.dev/ui-preferred-frame-size': ['100%', '600px'],
  },
})

export const richTextToPlain = (rt: unknown): string => {
  if (typeof rt === 'string') return rt
  if (!Array.isArray(rt)) return ''
  return rt
    .map((item) => {
      if (typeof item === 'string') return item
      if (typeof item !== 'object' || item === null) return ''
      const plain = Reflect.get(item, 'plain_text')
      if (typeof plain === 'string') return plain
      const text = Reflect.get(item, 'text')
      if (text && typeof text === 'object') {
        const content = Reflect.get(text, 'content')
        if (typeof content === 'string') return content
      }
      return ''
    })
    .join('')
}

export const iconUrl = (icon: unknown): string | undefined => {
  if (!icon || typeof icon !== 'object') return undefined
  const t = Reflect.get(icon, 'type')
  if (t === 'emoji') {
    const e = Reflect.get(icon, 'emoji')
    return typeof e === 'string' ? `emoji:${e}` : undefined
  }
  if (t === 'external') {
    const ext = Reflect.get(icon, 'external')
    if (ext && typeof ext === 'object') {
      const url = Reflect.get(ext, 'url')
      if (typeof url === 'string') return url
    }
  }
  if (t === 'file') {
    const file = Reflect.get(icon, 'file')
    if (file && typeof file === 'object') {
      const url = Reflect.get(file, 'url')
      if (typeof url === 'string') return url
    }
  }
  if (t === 'custom_emoji') {
    const ce = Reflect.get(icon, 'custom_emoji')
    if (ce && typeof ce === 'object') {
      const url = Reflect.get(ce, 'url')
      if (typeof url === 'string') return url
    }
  }
  return undefined
}

export const stripDashes = (id: string) => id.replace(/-/g, '')

export const notionUrlForId = (id: string | undefined, providedUrl?: string | null): string => {
  if (providedUrl) return providedUrl
  if (!id) return 'https://www.notion.so'
  return `https://www.notion.so/${stripDashes(id)}`
}

export const titleFromPageProperties = (properties: unknown): string => {
  if (!properties || typeof properties !== 'object') return ''
  for (const value of Object.values(properties)) {
    if (!value || typeof value !== 'object') continue
    const t = Reflect.get(value, 'type')
    if (t === 'title') {
      const arr = Reflect.get(value, 'title')
      const text = richTextToPlain(arr)
      if (text) return text
    }
  }
  return ''
}

export const initialIconForPage = (page: NotionObject): string => {
  const iconRaw = page.icon
  const url = iconUrl(iconRaw)
  if (url) return url
  return 'emoji:📄'
}

export type PreviewMode = { kind: 'preview' }

export type UiAppContent = {
  uri: string
  mimeType: 'text/html;profile=mcp-app'
  text: string
  _meta?: Record<string, unknown>
}
