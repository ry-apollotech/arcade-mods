import { expect, mock, test } from 'claude-code/testing'

import { currentPet, petFrame, petSizes } from '../hooks/pet'

const WIDE = 80

const PANE = {
  title: 'PLAYER 1',
  isFocused: false,
  bodyColumns: 40,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
}

test('every pet frame is a clean grid whose pixels all have a color', () => {
  for (const sprite of [currentPet().walk, currentPet().lie]) {
    const rows = sprite.frames[0]!.length
    const cols = sprite.frames[0]![0]!.length
    for (const frame of sprite.frames) {
      expect(frame.length).toBe(rows)
      for (const line of frame) {
        expect(line.length).toBe(cols)
        for (const ch of line) if (ch !== '.') expect(sprite.palette[ch]).toBeDefined()
      }
    }
  }
})

test('a frame holds one cell triplet per column and row', () => {
  for (const isAwake of [true, false]) {
    const frame = petFrame(5, isAwake, WIDE)
    const bytes = (frame.cells.length / 4) * 3 - (frame.cells.match(/=+$/)?.[0].length ?? 0)
    expect(bytes).toBe(WIDE * petSizes().petRows * 12)
  }
})

test('the pet pane sleeps when idle and wakes when a prompt starts a turn', async ($, on) => {
  mock.clock(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))

  const idle = await $.ui.mount({ plugin: 'arcade-dash', surface: 'terminal', component: 'Pane', requestId: 'arcade-pet', props: PANE })
  expect(await idle.find({ type: 'Raster' })).toBeDefined()
  expect(await idle.find({ type: 'Text', text: /SLEEPING/ })).toBeDefined()
  await idle.unmount()

  await $.prompt.submit({ text: 'run the tests', wait: false, origin: { kind: 'composer' } })
  const busy = await $.ui.mount({ plugin: 'arcade-dash', surface: 'terminal', component: 'Pane', requestId: 'arcade-pet', props: PANE })
  expect(await busy.find({ type: 'Text', text: /RUNNING/ })).toBeDefined()
  await busy.unmount()
})

test('an automatic pane seated above the prompt draws no pet, so it does not cover the conversation', async ($, on) => {
  mock.clock(on)
  const inline = await $.ui.mount({
    plugin: 'arcade-dash', surface: 'terminal', component: 'Pane', requestId: 'arcade-pet',
    props: { ...PANE, placement: 'inline' as const },
  })
  expect(await inline.find({ type: 'Raster' })).toBeUndefined()
  await inline.unmount()
})

test('Pikachu sits in the score band on a wide terminal, and the band drops it when narrow', async ($, on) => {
  mock.clock(on)
  on('session.cwd', () => ({ value: '/home/dev/sample-app' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, tokens: 50000, percent: 25 }, rateLimits: [] } }))
  const band = (bodyColumns: number) => ({
    hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns, scroll: { offset: 0, bodyRows: 20 }, view: {},
  })
  const wide = await $.ui.mount({ plugin: 'arcade-dash', surface: 'terminal', component: 'AbovePrompt', props: band(160) })
  expect(await wide.find({ type: 'Raster' })).toBeDefined()
  expect(await wide.find({ type: 'Text', text: /1UP/ })).toBeDefined()
  await wide.unmount()

  const narrow = await $.ui.mount({ plugin: 'arcade-dash', surface: 'terminal', component: 'AbovePrompt', props: band(40) })
  expect(await narrow.find({ type: 'Raster' })).toBeUndefined()
  await narrow.unmount()
})
