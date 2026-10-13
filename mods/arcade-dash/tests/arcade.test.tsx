import { describe, expect, test } from 'claude-code/testing'

import { energyBar, isTestCommand, parseScore, scoreText, toolArg, toolTag } from '../hooks/arcade'

const GRADLE_FAIL = 'OrderLookupTest > emptyCart FAILED\n14 tests completed, 1 failed\nBUILD FAILED in 41s'
const MAVEN_PASS = 'Tests run: 3, Failures: 0, Errors: 0\nTests run: 12, Failures: 0, Errors: 0, Skipped: 0\nBUILD SUCCESS'

describe('score', () => {
  test('reads Gradle failure counts', () => {
    const s = parseScore(GRADLE_FAIL, true)
    expect(s).toEqual({ passed: 13, total: 14, isClear: false })
    expect(scoreText(s)).toBe('MISS 13/14')
  })
  test('reads the Maven summary line', () => {
    expect(scoreText(parseScore(MAVEN_PASS, false))).toBe('CLEAR 12/12')
  })
  test('falls back to exit status when no counts print', () => {
    expect(scoreText(parseScore('BUILD SUCCESSFUL in 37s', false))).toBe('CLEAR')
  })
  test('spots test commands', () => {
    expect(isTestCommand("./gradlew testDebugUnitTest --tests '*Lookup*'")).toBe(true)
    expect(isTestCommand('mvn -q test')).toBe(true)
    expect(isTestCommand('git status')).toBe(false)
  })
})

describe('tool rows', () => {
  test('tags and shortens', () => {
    expect(toolTag('Bash', { command: './gradlew assembleDebug' })).toBe('GRADLE')
    expect(toolTag('mcp__claude_ai_Claude_Docs__read', {})).toBe('READ')
    expect(toolArg('Read', { file_path: '/a/b/service/orders/OrderLookup.java' }))
      .toBe('service/orders/OrderLookup.java')
  })
  test('energy bar shows context left', () => {
    expect(energyBar(38)).toEqual({ full: '██████', empty: '░░░░', left: 62 })
  })
})

test('a failed Gradle run draws a MISS row on the terminal', async $ => {
  const ui = await $.ui.mount({
    plugin: 'arcade-dash',
    surface: 'terminal',
    component: 'ToolUse',
    props: {
      tool_use_id: 't1',
      tool: 'Bash',
      input: { command: "./gradlew testDebugUnitTest --tests '*OrderLookupTest'" },
      isRunning: false,
      isErrored: true,
      isInterrupted: false,
      output: GRADLE_FAIL,
    },
  })
  expect(await ui.find({ type: 'Text', text: 'GRADLE' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /MISS/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /⎿ .*14 tests completed, 1 failed/ })).toBeDefined()
  await ui.unmount()
})

test('your prompts and replies get arcade markers on the terminal', async $ => {
  const user = await $.ui.mount({
    plugin: 'arcade-dash',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'run the tests', origin: { kind: 'composer' }, isExpanded: false },
  })
  expect(await user.find({ type: 'Text', text: /P1 ▶/ })).toBeDefined()
  await user.unmount()

  const reply = await $.ui.mount({
    plugin: 'arcade-dash',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text: 'All **14** tests pass.', isFirstOfReply: true },
  })
  expect(await reply.find({ type: 'Text', text: /◆/ })).toBeDefined()
  expect(await reply.find({ type: 'Markdown' })).toBeDefined()
  await reply.unmount()

  const footer = await $.ui.mount({
    plugin: 'arcade-dash',
    surface: 'terminal',
    component: 'TurnDuration',
    props: { word: 'Baked', durationMs: 37000 },
  })
  expect(await footer.find({ type: 'Text', text: /ROUND OVER · 00:37/ })).toBeDefined()
  await footer.unmount()
})
