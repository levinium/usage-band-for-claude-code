// The desktop band as one SVG image: the context ring at the left, then one
// icon + bar + reset time per plan limit, spread evenly across the row; and
// the opaque pills its hover pop-ups show.

// `reset` is the short label beside the bar (4h); `resetLong` the hover's (4h 25m).
export type BarSlot = { icon: Icon; name: string; pct: number | null; reset: string; resetLong: string }
export type Icon = 'clock' | 'calendar' | 'spark' | 'dot'
export type RingState = 'idle' | 'compacting'

const GREEN = '#3fb950'
const AMBER = '#d29922'
const RED = '#f85149'
const TRACK = 'rgba(127,127,127,0.22)'

export const fillColor = (pct: number) => (pct >= 80 ? RED : pct >= 50 ? AMBER : GREEN)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const ROW_H = 20
// CSS pixels per character cell in the desktop band; the band's width is
// given in cells, the SVG's in pixels.
export const PX_PER_COL = 8
export const RING_COLS = 3

const MID = ROW_H / 2
const RING_R = 7
const RING_STROKE = 3
const RING_GAP = 16
const ICON = 14
const ICON_GAP = 7
const BAR_H = 6
const RESET_GAP = 8
const RESET_W = 24
const SEG_GAP = 22
const MIN_BAR = 40
// Space kept clear after the last bar, to mirror the room left of the ring.
const RIGHT_PAD = 10

const FONT = "500 11px system-ui,-apple-system,'Segoe UI',sans-serif"

// Ink follows the app theme through prefers-color-scheme.
const STYLE = `<style>
  .ink{stroke:#6e7781;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
  .inkf{fill:#6e7781}
  .rst{fill:#6e7781;font:${FONT};dominant-baseline:central}
  .lbl{fill:#1f2328;font:${FONT};dominant-baseline:central}
  .nod{opacity:0.4}
  @media (prefers-color-scheme: dark){ .ink{stroke:#8b949e} .inkf,.rst{fill:#8b949e} .lbl{fill:#e6edf3} }
</style>`

// Diagonal stripes for a bar with no data yet, so it never reads as 0%.
const HATCH = `<defs><pattern id="nd" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="${TRACK}"/><rect class="inkf" width="2" height="5" fill-opacity="0.55"/></pattern></defs>`

// Each icon is drawn in a 14x14 box centred on (7,7).
const ICONS: Record<Icon, string> = {
  clock: '<circle class="ink" cx="7" cy="7" r="5.75"/><path class="ink" d="M7 4v3l2 1.5"/>',
  calendar: '<rect class="ink" x="1.25" y="2.25" width="11.5" height="10.5" rx="2"/><path class="ink" d="M1.25 5.75h11.5M4.5 1v2.5M9.5 1v2.5"/>',
  spark: '<path class="inkf" d="M7 0.75l1.55 4.7 4.7 1.55-4.7 1.55L7 13.25l-1.55-4.7L0.75 7l4.7-1.55z"/>',
  dot: '<circle class="inkf" cx="7" cy="7" r="3"/>',
}

// Rough width of 11px UI text: about 5.6px a character on average.
const textFits = (text: string, room: number) => text.length * 5.6 <= room

/** The longest hover line that fits beside the icon, in place of bar and reset. */
const hoverText = (s: BarSlot, p: number, room: number) => {
  if (s.pct === null) return [`${s.name}: no data yet`, 'no data yet'].find(t => textFits(t, room)) ?? 'no data'
  const resets = s.resetLong ? [` · resets in ${s.resetLong}`, ` · resets ${s.reset}`] : ['']
  const options = [
    ...resets.map(r => `${s.name} · ${p}% used${r}`),
    ...resets.map(r => `${p}% used${r}`),
    `${p}% used`,
  ]
  return options.find(t => textFits(t, room)) ?? `${p}%`
}

const ring = (pct: number | null) => {
  const c = MID
  // No context reading yet: a thin dashed outline instead of an empty (0%) ring.
  if (pct === null) {
    return `<circle class="ink" cx="${c}" cy="${c}" r="${RING_R}" stroke-dasharray="2.5 2.5" style="stroke-linecap:butt;stroke-opacity:0.7"/>`
  }
  const len = 2 * Math.PI * RING_R
  const p = Math.max(0, Math.min(100, pct))
  const arc =
    p > 0
      ? `<circle cx="${c}" cy="${c}" r="${RING_R}" fill="none" stroke="${fillColor(p)}" stroke-width="${RING_STROKE}" stroke-linecap="round" stroke-dasharray="${((len * p) / 100).toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`
      : ''
  return `<circle cx="${c}" cy="${c}" r="${RING_R}" fill="none" stroke="${TRACK}" stroke-width="${RING_STROKE}"/>${arc}`
}

/** Pixel width for a band `columns` cells wide. */
export const bandWidth = (columns: number) => Math.max(240, Math.floor(columns * PX_PER_COL))

const LEFT = ROW_H + RING_GAP

/** Where each slot sits: its left edge, width, and where its bar starts. */
export const bandLayout = (width: number, n: number) => {
  const segW = (width - RIGHT_PAD - LEFT - (n - 1) * SEG_GAP) / n
  return Array.from({ length: n }, (_, i) => {
    const x = LEFT + i * (segW + SEG_GAP)
    return { x, segW, bx: x + ICON + ICON_GAP }
  })
}

/**
 * The band as a plain image (no hover inside it): a redraw swaps the image in
 * place, so resizing never rebuilds a frame. Hover pop-ups are separate.
 */
export const bandSvg = (width: number, ctx: number | null, ringState: RingState, slots: BarSlot[]) => {
  let body: string
  if (ringState === 'compacting') {
    body = `<text class="lbl" x="${LEFT}" y="${MID}">Compacting conversation…</text>`
  } else {
    const layout = bandLayout(width, slots.length)
    body = slots
      .map((s, i) => {
        const { x, segW, bx } = layout[i]!
        const fullBarW = segW - ICON - ICON_GAP
        const by = MID - BAR_H / 2
        // A limit with no reset time gives its bar the label's space too.
        const barW = Math.max(MIN_BAR, s.reset ? fullBarW - RESET_GAP - RESET_W : fullBarW)
        const p = Math.max(0, Math.min(100, s.pct ?? 0))
        const fw = p > 0 ? Math.max(BAR_H, (barW * p) / 100) : 0
        const fill = fw > 0 ? `<rect x="${bx}" y="${by}" width="${fw.toFixed(1)}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${fillColor(p)}"/>` : ''
        const noData = s.pct === null
        return `<g transform="translate(${x} ${MID - ICON / 2})"${noData ? ' class="nod"' : ''}>${ICONS[s.icon]}</g>
<rect x="${bx}" y="${by}" width="${barW.toFixed(1)}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${noData ? 'url(#nd)' : TRACK}"/>${fill}
${s.reset ? `<text class="rst" x="${(x + segW).toFixed(1)}" y="${MID}" text-anchor="end">${esc(s.reset)}</text>` : ''}`
      })
      .join('')
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ROW_H}" viewBox="0 0 ${width} ${ROW_H}">${STYLE}${HATCH}${ring(ctx)}${body}</svg>`
}

/** An opaque rounded pill holding one line of text, following the app theme. */
export const pillSvg = (text: string, width: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ROW_H}" viewBox="0 0 ${width} ${ROW_H}"><style>
  .bg{fill:#ffffff;stroke:rgba(31,35,40,0.18)} .t{fill:#1f2328;font:${FONT};dominant-baseline:central}
  @media (prefers-color-scheme: dark){ .bg{fill:#2b2b2b;stroke:rgba(240,246,252,0.16)} .t{fill:#e6edf3} }
</style><rect class="bg" x="0.5" y="0.5" width="${width - 1}" height="${ROW_H - 1}" rx="6"/><text class="t" x="8" y="${MID}">${esc(text)}</text></svg>`

/** A slot's hover line, sized to the pill that covers its bar and reset label. */
export const slotTipText = (s: BarSlot, pillWidth: number) =>
  hoverText(s, Math.max(0, Math.min(100, s.pct ?? 0)), pillWidth - 12)

export const TIP_W = 250

/** The ring's hover tooltip, drawn over the start of the bars. */
export const ringTipSvg = (ctx: number | null) =>
  pillSvg(`Click to compact · ${ctx === null ? 'context not measured yet' : `${ctx}% of context used`}`, TIP_W)
