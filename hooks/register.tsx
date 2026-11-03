import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit } from '../types'
import { PX_PER_COL, RING_COLS, ROW_H, TIP_W, bandLayout, bandSvg, bandWidth, pillSvg, ringSvg, ringTipSvg, slotTipText } from './svg'
import type { BarSlot, Icon } from './svg'

const limits = atom({ plugin: 'usage-band', key: 'limits' } as const, [] as Limit[])
const contextPercent = atom({ plugin: 'usage-band', key: 'contextPercent' } as const, null as number | null)
const isCompacting = atom({ plugin: 'usage-band', key: 'isCompacting' } as const, false)

const CELLS = 8
// Columns kept for VS Code's Compact button, chrome included.
const COMPACT_COLS = 10

// Slots in drawing order. Until any reading has come in, every slot draws
// as "no data"; once one has, only the windows Claude reports are drawn.
const SLOTS: { label: string; icon: Icon; match: (kind: string) => boolean }[] = [
  { label: 'Session', icon: 'clock', match: k => k === 'five_hour' },
  { label: 'Weekly', icon: 'calendar', match: k => k === 'seven_day' },
  { label: 'Fable', icon: 'spark', match: k => k.toLowerCase().includes('fable') },
]

const WHEEL = ['○', '◔', '◑', '◕', '●']

const toLimits = (raw: readonly Limit[]): Limit[] =>
  raw.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt }))

// The windows the last response reported, kept across sessions: they are the
// account's, so a new chat shows them before its own first response.
const LAST_LIMITS = 'lastLimits'

const isLimit = (v: unknown): v is Limit =>
  typeof v === 'object' && v !== null && typeof (v as Limit).kind === 'string' && typeof (v as Limit).percentUsed === 'number'

const keepLimits = async ($: EngineInterface, raw: readonly Limit[]) => {
  const next = toLimits(raw)
  await update($, limits, () => next)
  await $.store.set(LAST_LIMITS, next)
}

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

const compact = async ($: EngineInterface, isWorking: boolean, isInteractive: boolean) => {
  if (isWorking) {
    $.ui.toast('Compaction waits until the current turn finishes')
    return
  }
  if (await read($, isCompacting)) return
  await update($, isCompacting, () => true)
  try {
    if (isInteractive) {
      const { skip } = await $.session.compact()
      if (skip) $.ui.toast('Compaction was skipped')
    } else {
      // A headless session (the desktop app runs one through the SDK) has no
      // $.session.compact; there compaction runs as a /compact turn.
      await $.command.run({ command: 'compact' })
    }
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
  let isInteractive = true

  on('session.start', async ($, e, next) => {
    isInteractive = e.isInteractive
    const result = await next(e)
    const usage = await $.session.usage()
    if (usage.rateLimits.length > 0) {
      await keepLimits($, usage.rateLimits)
    } else {
      const stored = await $.store.get(LAST_LIMITS)
      if (Array.isArray(stored) && stored.every(isLimit)) {
        await update($, limits, () => toLimits(stored))
      }
    }
    await update($, contextPercent, () => usage.context.percent ?? null)
    return result
  })

  on('session.measure', async ($, e, next) => {
    // An empty list means no reading (not "nothing reported"), so the last
    // set stays up.
    if (e.changed.includes('rateLimits') && e.rateLimits.length > 0) {
      await keepLimits($, e.rateLimits)
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
      await compact($, isWorking, isInteractive)
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

    // A kept reading whose window has since reset no longer has a figure.
    const current = (l: Limit | undefined) => (l?.resetsAt && Date.parse(l.resetsAt) <= now ? undefined : l)
    const extras = all.filter(l => !SLOTS.some(s => s.match(l.kind)))
    const rows = [
      ...SLOTS.map(s => ({ label: s.label, icon: s.icon, reading: all.find(l => s.match(l.kind)) }))
        .filter(r => all.length === 0 || r.reading)
        .map(r => ({ label: r.label, icon: r.icon, limit: current(r.reading) })),
      ...extras.map(l => ({ label: l.kind, icon: 'dot' as Icon, limit: current(l) })),
    ]
    const ctxPct = ctx ?? 0

    if (e.surface === 'desktop' || e.surface === 'vscode') {
      const { Box, Svg, Button } = $.ui.resolve(e)
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
      // The band is a plain image, so redraws (a resize) swap it in place.
      // Hover lives in layers above it: a keyed Box per slot reveals that
      // slot's pill, a display toggle that never redraws the band.
      const slotHovers = (barsWidth: number, left?: number) => {
        if (ringState !== 'idle') return null
        const layout = bandLayout(barsWidth, slots.length, left)
        return slots.map((s, i) => {
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
      }

      if (e.surface === 'vscode') {
        // VS Code draws every Button with its own chrome, so nothing invisible
        // can lie over the ring: the ring stands alone, a Compact button follows
        // it, then the bars in the rest of the row.
        const barsW = width - ROW_H - (COMPACT_COLS + 2) * PX_PER_COL
        return (
          <Box flexDirection="row" alignItems="center" columnGap={1} width="100%">
            <Box key="ring" position="relative">
              <Svg source={ringSvg(ctx)} alt={ctx === null ? 'Context not measured yet' : `${ctx}% of context used`} width={ROW_H} height={ROW_H} />
              <Box display="none" hover={{ display: 'flex' }} position="absolute" left={RING_COLS} top={0}>
                <Svg source={ringTipSvg(ctx, false)} alt="How full the context is" width={TIP_W} height={ROW_H} />
              </Box>
            </Box>
            <Button key="compact" label="Compact" onPress={() => compact($, e.props.isWorking, isInteractive)} />
            <Box position="relative">
              <Svg source={bandSvg(barsW, ctx, ringState, slots, false)} alt={alt} width={barsW} height={ROW_H} />
              {slotHovers(barsW, 0)}
            </Box>
          </Box>
        )
      }

      // Over the ring, an invisible Client takes the clicks an image cannot.
      const { Client } = $.ui.resolve(e)
      return (
        <Box position="relative" width="100%">
          <Svg source={bandSvg(width, ctx, ringState, slots)} alt={alt} width={width} height={ROW_H} />
          {slotHovers(width)}
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
        <Button key="compact" plain onPress={() => compact($, e.props.isWorking, isInteractive)}>
          <Text color={ctx === null ? 'inactive' : barColor(ctxPct)}>{wheelGlyph(ctxPct)}</Text>
        </Button>
        {rows.map(({ label, limit }) => {
          const pct = limit?.percentUsed ?? 0
          const filled = filledCells(pct)
          // No data yet draws as shade, not as an empty (0%) bar.
          return (
            <Box key={label} flexDirection="row">
              <Text dimColor>{`  ${label[0]} `}</Text>
              {limit ? (
                <Box flexDirection="row">
                  <Text color={barColor(pct)}>{'█'.repeat(filled)}</Text>
                  <Text color="inactive">{'█'.repeat(CELLS - filled)}</Text>
                </Box>
              ) : (
                <Text color="inactive">{'░'.repeat(CELLS)}</Text>
              )}
              <Text dimColor>{` ${resetsIn(limit?.resetsAt, now)}`}</Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
