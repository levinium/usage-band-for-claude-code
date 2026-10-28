import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit } from '../types'
import { PX_PER_COL, RING_COLS, ROW_H, TIP_W, bandLayout, bandSvg, bandWidth, pillSvg, ringTipSvg, slotTipText } from './svg'
import type { BarSlot, Icon } from './svg'

const limits = atom({ plugin: 'usage-band', key: 'limits' } as const, [] as Limit[])
const contextPercent = atom({ plugin: 'usage-band', key: 'contextPercent' } as const, null as number | null)
const isCompacting = atom({ plugin: 'usage-band', key: 'isCompacting' } as const, false)

const CELLS = 8

// Fixed slots, always drawn in this order; a window the engine has not
// reported yet draws as an empty grey bar.
const SLOTS: { label: string; icon: Icon; match: (kind: string) => boolean }[] = [
  { label: 'Session', icon: 'clock', match: k => k === 'five_hour' },
  { label: 'Weekly', icon: 'calendar', match: k => k === 'seven_day' },
  { label: 'Fable', icon: 'spark', match: k => k.toLowerCase().includes('fable') },
]

const WHEEL = ['○', '◔', '◑', '◕', '●']

const toLimits = (raw: readonly Limit[]): Limit[] =>
  raw.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt }))

const barColor = (pct: number) => (pct >= 80 ? 'error' : pct >= 50 ? 'warning' : 'success')

const filledCells = (pct: number) =>
  pct <= 0 ? 0 : Math.min(CELLS, Math.max(1, Math.round(pct / (100 / CELLS))))

const wheelGlyph = (pct: number) => WHEEL[Math.min(4, Math.round(pct / 25))] ?? WHEEL[0]

const resetsInLong = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return ''
  const mins = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

const resetsIn = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return ''
  const mins = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60000))
  if (mins >= 1440) return `${Math.floor(mins / 1440)}d`
  if (mins >= 60) return `${Math.floor(mins / 60)}h`
  return `${mins}m`
}

const compact = async ($: EngineInterface, isWorking: boolean) => {
  if (isWorking) {
    $.ui.toast('Compaction waits until the current turn finishes')
    return
  }
  if (await read($, isCompacting)) return
  await update($, isCompacting, () => true)
  try {
    const { skip } = await $.session.compact()
    if (skip) $.ui.toast('Compaction was skipped')
  } catch (err) {
    // The engine rejects with its own reason (a turn running, the summarizer
    // failing); show it rather than guess.
    const reason = err instanceof Error ? err.message : String(err)
    $.ui.toast(reason ? `Compaction could not start: ${reason}` : 'Compaction could not start')
  } finally {
    await update($, isCompacting, () => false)
  }
}

export const register: Register = on => {
  let isWorking = false

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const usage = await $.session.usage()
    await update($, limits, () => toLimits(usage.rateLimits))
    await update($, contextPercent, () => usage.context.percent ?? null)
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => toLimits(e.rateLimits))
    }
    if (e.changed.includes('context')) {
      await update($, contextPercent, () => e.context.percent ?? null)
    }
    return next(e)
  })

  // The ring's hit area (ring-hit.tsx) reports clicks.
  on('ui.message', async ($, e, next) => {
    const data = e.data as { press?: boolean } | null
    if (data?.press) {
      await compact($, isWorking)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const all = await read($, limits)
    const ctx = await read($, contextPercent)
    const now = await $.clock.now()
    isWorking = e.props.isWorking

    const extras = all.filter(l => !SLOTS.some(s => s.match(l.kind)))
    const rows = [
      ...SLOTS.map(s => ({ label: s.label, icon: s.icon, limit: all.find(l => s.match(l.kind)) })),
      ...extras.map(l => ({ label: l.kind, icon: 'dot' as Icon, limit: l as Limit | undefined })),
    ]
    const ctxPct = ctx ?? 0

    if (e.surface === 'desktop') {
      const { Box, Svg, Client } = $.ui.resolve(e)
      const ringState = (await read($, isCompacting)) ? 'compacting' : 'idle'
      const slots: BarSlot[] = rows.map(r => ({
        icon: r.icon,
        name: r.label,
        pct: r.limit ? r.limit.percentUsed : null,
        reset: resetsIn(r.limit?.resetsAt, now),
        resetLong: resetsInLong(r.limit?.resetsAt, now),
      }))
      const alt = [`Context ${ctx === null ? 'not measured' : `${ctxPct}%`}`, ...slots.map(s => `${s.name} ${s.pct === null ? 'no data' : `${s.pct}%`}`)].join(', ')
      const width = bandWidth(e.props.bodyColumns)
      const layout = bandLayout(width, slots.length)
      // The band is a plain image, so redraws (a resize) swap it in place.
      // Hover lives in layers above it: a keyed Box per slot reveals that
      // slot's pill, a display toggle that never redraws the band. Over the
      // ring, an invisible Client takes the clicks an image cannot.
      return (
        <Box position="relative" width="100%">
          <Svg source={bandSvg(width, ctx, ringState, slots)} alt={alt} width={width} height={ROW_H} />
          {ringState === 'idle'
            ? slots.map((s, i) => {
                const { x, segW, bx } = layout[i]!
                const zoneLeft = Math.floor(x / PX_PER_COL)
                const zoneCols = Math.ceil((x + segW) / PX_PER_COL) - zoneLeft
                const pillLeft = Math.floor(bx / PX_PER_COL)
                const pillW = (zoneLeft + zoneCols - pillLeft) * PX_PER_COL
                return (
                  <Box key={`slot-${s.name}`} position="absolute" left={zoneLeft} top={0} width={zoneCols} height={1}>
                    <Box display="none" hover={{ display: 'flex' }} position="absolute" left={pillLeft - zoneLeft} top={0}>
                      <Svg source={pillSvg(slotTipText(s, pillW), pillW)} alt={slotTipText(s, pillW)} width={pillW} height={ROW_H} />
                    </Box>
                  </Box>
                )
              })
            : null}
          <Box key="ring" position="absolute" left={0} top={0} flexDirection="row">
            <Client key="ring" module="./ring-hit.tsx" width={RING_COLS} height={1} />
            <Box display="none" hover={{ display: 'flex' }}>
              <Svg source={ringTipSvg(ctx)} alt="Click to compact" width={TIP_W} height={ROW_H} />
            </Box>
          </Box>
        </Box>
      )
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Button key="compact" plain onPress={() => compact($, e.props.isWorking)}>
          <Text color={ctx === null ? 'inactive' : barColor(ctxPct)}>{wheelGlyph(ctxPct)}</Text>
        </Button>
        {rows.map(({ label, limit }) => {
          const pct = limit?.percentUsed ?? 0
          const filled = filledCells(pct)
          return (
            <Box key={label} flexDirection="row">
              <Text dimColor>{`  ${label[0]} `}</Text>
              <Text color={barColor(pct)}>{'█'.repeat(filled)}</Text>
              <Text color="inactive">{'█'.repeat(CELLS - filled)}</Text>
              <Text dimColor>{` ${resetsIn(limit?.resetsAt, now)}`}</Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
