import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 99, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const NOW = Date.parse('2026-10-27T16:00:00Z')
const GREEN = '#3fb950'
const RED = '#f85149'

const usage = (percent: number) => ({
  value: {
    startedAt: NOW,
    context: { window: 1000000, tokens: percent * 10000, percent },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 3, resetsAt: '2026-10-27T20:30:00Z' },
      { kind: 'seven_day', percentUsed: 85, resetsAt: '2026-10-31T12:00:00Z' },
    ],
  },
})

// $.store for a test: one map, shared by the chats a test starts.
const memStore = (on: any) => {
  const kept = new Map<string, unknown>()
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kept.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => (kept.set(e.key, e.value), { value: undefined }))
}

test('desktop: one full-width SVG with ring, bars and reset times', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  memStore(on)
  on('session.usage', () => usage(13))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs).toHaveLength(4) // band, 2 slot pills, ring pill (pills hidden until hover)
  const band = svgs.find(s => String(s.props.alt).startsWith('Context'))
  const svg = String(band?.props.source)
  expect(band?.props.isInteractive).toBeUndefined() // a plain image: redraws swap in place
  expect(band?.props.width).toBe(792) // 99 columns
  expect(svg).toContain(GREEN) // ring 13%, Session 3%
  expect(svg).toContain(RED) // Weekly 85%
  expect(svg).toContain('>4h<') // reset always shown
  expect(svg).toContain('>3d<')
  expect(band?.props.alt).toBe('Context 13%, Session 3%, Weekly 85%')
  const alts = svgs.map(s => String(s.props.alt))
  expect(alts).toContain('Session · 3% used · resets in 4h 30m')
  expect(alts.some(a => a.startsWith('Fable'))).toBe(false) // not reported, so hidden
  expect(await ui.findAll({ type: 'Client' })).toHaveLength(1)
  await ui.unmount()
})

test('ring: tooltip pill is hover-revealed, click compacts', async ($, on) => {
  let compacts = 0
  on('clock.now', () => ({ value: NOW }))
  memStore(on)
  on('session.usage', () => usage(40))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.compact', () => {
    compacts += 1
    return { skip: 'test stands in for core' }
  })
  on('ui.toast', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  const bandSource = async () => String((await ui.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('Context'))?.props.source)
  const tip = (await ui.findAll({ type: 'Svg' })).find(s => s.props.alt === 'Click to compact')
  expect(String(tip?.props.source)).toContain('Click to compact · 40% of context used')
  const band = await bandSource()

  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: 'ring' })
  await ui.pointer({ type: 'up', x: 1, y: 0, button: 'left', in: 'ring' })
  expect(compacts).toBe(1)

  // Hover posts nothing, so the band's SVG is never redrawn by it.
  await ui.pointer({ type: 'enter', x: 1, y: 0, in: 'ring' })
  await ui.pointer({ type: 'leave', x: 1, y: 0, in: 'ring' })
  expect(await bandSource()).toBe(band)
  await ui.unmount()
})

test('ring: a compaction resizes the ring before the next response', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  memStore(on)
  on('session.usage', () => usage(65))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const kept = [{ role: 'user' as const, text: 'Summary of the conversation so far', toolUses: [] }]
  on('session.compact', () => ({ messages: kept, tokensBefore: 650000, tokensAfter: 40000 }))
  on('ui.toast', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await bandOf(ui))?.props.alt).toMatch(/^Context 65%/)
  await $.session.compact({ trigger: 'manual', messages: kept })
  expect((await bandOf(ui))?.props.alt).toMatch(/^Context 4%/)
  // A subagent's compaction leaves the main ring alone.
  await $.session.compact({ trigger: 'auto', agentId: 'a1', messages: kept })
  expect((await bandOf(ui))?.props.alt).toMatch(/^Context 4%/)
  await ui.unmount()
})

test('ring: a refused compaction toasts the engine reason', async ($, on) => {
  const toasts: string[] = []
  on('clock.now', () => ({ value: NOW }))
  memStore(on)
  on('session.usage', () => usage(65))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.compact', () => {
    throw new Error('summary request failed')
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: 'ring' })
  await ui.pointer({ type: 'up', x: 1, y: 0, button: 'left', in: 'ring' })
  expect(toasts).toHaveLength(1)
  // A throwing hook is skipped and core rejects in its place; either way the
  // engine's reason follows the colon.
  expect(toasts[0]).toMatch(/^Compaction could not start: \S/)
  await ui.unmount()
})

test('ring: a headless session compacts through the /compact command', async ($, on) => {
  const commands: string[] = []
  let compacts = 0
  on('clock.now', () => ({ value: NOW }))
  memStore(on)
  on('session.usage', () => usage(65))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.compact', () => {
    compacts += 1
    return { skip: 'test stands in for core' }
  })
  on('command.run', (_, e) => {
    commands.push(e.command)
    return { text: '' }
  })
  on('ui.toast', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: 'ring' })
  await ui.pointer({ type: 'up', x: 1, y: 0, button: 'left', in: 'ring' })
  expect(commands).toEqual(['compact'])
  expect(compacts).toBe(0)
  await ui.unmount()
})

test('vscode: ring, then a Compact button, then the bars', async ($, on) => {
  let compacts = 0
  on('clock.now', () => ({ value: NOW }))
  memStore(on)
  on('session.usage', () => usage(13))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.compact', () => {
    compacts += 1
    return { skip: 'test stands in for core' }
  })
  on('ui.toast', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'vscode' })

  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs).toHaveLength(5) // ring, bars, 2 slot pills, ring pill
  expect(svgs.map(s => s.props.alt)).toContain('13% of context used')
  const bars = svgs.find(s => String(s.props.alt).startsWith('Context'))
  expect(bars?.props.alt).toBe('Context 13%, Session 3%, Weekly 85%')
  // The bars are drawn without the ring, which sits in its own image.
  expect(String(bars?.props.source)).not.toContain(`r="7"`)
  expect(await ui.findAll({ type: 'Client' })).toHaveLength(0)
  expect((await ui.find({ type: 'Button', key: 'compact' }))?.props.label).toBe('Compact')

  await ui.press({ key: 'compact' })
  expect(compacts).toBe(1)
  await ui.unmount()
})

test('terminal falls back to text bars', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  memStore(on)
  on('session.usage', () => usage(13))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^█$/ }))?.props.color).toBe('success')
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(0)
  // Fable is not reported, so it is not drawn at all.
  expect(await ui.find({ type: 'Text', text: '  F ' })).toBeUndefined()
  await ui.unmount()
})

const noUsage = (rateLimits: unknown[]) => ({
  value: { startedAt: NOW, context: { window: 1000000, tokens: 0, percent: undefined }, rateLimits },
})

const bandOf = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('Context'))

test('before any reading every slot is hatched with a dim icon', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  memStore(on)
  on('session.usage', () => noUsage([]))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const band = await bandOf(ui)
  const svg = String(band?.props.source)
  expect(band?.props.alt).toBe('Context not measured, Session no data, Weekly no data, Fable no data')
  expect(svg).toContain('stroke-dasharray="2.5 2.5"') // ring with no context reading
  expect(svg.match(/fill="url\(#nd\)"/g)).toHaveLength(3)
  expect(svg.match(/class="nod"/g)).toHaveLength(3)
  await ui.unmount()
})

test('only the windows Claude reports are drawn; a real 0% is not hatched', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  memStore(on)
  on('session.usage', () => noUsage([{ kind: 'seven_day', percentUsed: 0, resetsAt: '2026-10-31T12:00:00Z' }]))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const band = await bandOf(ui)
  expect(band?.props.alt).toBe('Context not measured, Weekly 0%')
  const svg = String(band?.props.source)
  expect(svg).not.toContain('url(#nd)')
  // One slot keeps a normal-width bar; the spare room spells out its figure.
  expect(svg).toContain('<tspan>Weekly · 0% used · resets in 3d 20h</tspan>')
  await ui.unmount()
})

test('a new chat shows the last reported windows before its first response', async ($, on) => {
  // An earlier chat saved this reading; this chat has had no response yet.
  const saved = [{ kind: 'seven_day', percentUsed: 12, resetsAt: '2026-10-31T12:00:00Z' }]
  on('clock.now', () => ({ value: NOW }))
  on('store.get', (_, e) => ({ value: e.key === 'lastLimits' ? saved : undefined }))
  on('session.usage', () => noUsage([]))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await bandOf(ui))?.props.alt).toBe('Context not measured, Weekly 12%')
  await ui.unmount()
})

test('a kept window that has since reset draws as no data', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  memStore(on)
  on('session.usage', () => noUsage([{ kind: 'seven_day', percentUsed: 40, resetsAt: '2026-10-27T15:00:00Z' }]))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const band = await bandOf(ui)
  expect(band?.props.alt).toBe('Context not measured, Weekly no data')
  expect(String(band?.props.source)).toContain('fill="url(#nd)"')
  await ui.unmount()
})
