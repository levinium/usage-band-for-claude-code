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

test('desktop: one full-width SVG with ring, bars and reset times', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('session.usage', () => usage(13))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs).toHaveLength(5) // band, 3 slot pills, ring pill (pills hidden until hover)
  const band = svgs.find(s => String(s.props.alt).startsWith('Context'))
  const svg = String(band?.props.source)
  expect(band?.props.isInteractive).toBeUndefined() // a plain image: redraws swap in place
  expect(band?.props.width).toBe(792) // 99 columns
  expect(svg).toContain(GREEN) // ring 13%, Session 3%
  expect(svg).toContain(RED) // Weekly 85%
  expect(svg).toContain('>4h<') // reset always shown
  expect(svg).toContain('>3d<')
  expect(band?.props.alt).toBe('Context 13%, Session 3%, Weekly 85%, Fable no data')
  const alts = svgs.map(s => String(s.props.alt))
  expect(alts).toContain('Session · 3% used · resets in 4h 30m')
  expect(alts).toContain('Fable: no data yet')
  expect(await ui.findAll({ type: 'Client' })).toHaveLength(1)
  await ui.unmount()
})

test('ring: tooltip pill is hover-revealed, click compacts', async ($, on) => {
  let compacts = 0
  on('clock.now', () => ({ value: NOW }))
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

test('ring: a refused compaction toasts the engine reason', async ($, on) => {
  const toasts: string[] = []
  on('clock.now', () => ({ value: NOW }))
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

test('terminal falls back to text bars', async ($, on) => {
  on('clock.now', () => ({ value: NOW }))
  on('session.usage', () => usage(13))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^█$/ }))?.props.color).toBe('success')
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(0)
  await ui.unmount()
})
