import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Git, Score } from '../types'
import {
  COLORS,
  SPINNER_WORDS,
  clock,
  energyBar,
  isTestCommand,
  parseScore,
  scoreText,
  toolArg,
  toolTag,
} from './arcade'
import { DEFAULT_PET, petFrame, petSizes, setPet } from './pet'
import { base64ToBytes, gifsToPet } from './petloader'

const score = atom({ plugin: 'arcade-dash', key: 'score' } as const, null)
const git = atom({ plugin: 'arcade-dash', key: 'git' } as const, null)
const lastTurnSeconds = atom({ plugin: 'arcade-dash', key: 'lastTurnSeconds' } as const, null)
const isAwake = atom({ plugin: 'arcade-dash', key: 'isAwake' } as const, false)

const PET_PANE = 'arcade-pet'
const PET_TITLE = 'PLAYER 1'
const PET_TICK_MS = 150
const PET_MAX_COLUMNS = 200

// Successful results of these tools are folded into their one-line row.
const QUIET_RESULTS = new Set(['Bash', 'Read', 'Grep', 'Glob'])

async function gitLine($: EngineInterface, args: string[]): Promise<string | null> {
  const ran = await $.process.run(['git', ...args], { timeoutMs: 5000 }).catch(() => null)
  return ran && ran.exitCode === 0 ? ran.stdout.trim() : null
}

async function refreshGit($: EngineInterface): Promise<void> {
  const branch = await gitLine($, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === null) {
    await update($, git, () => null)
    $.ui.status(undefined)
    return
  }
  const status = (await gitLine($, ['status', '--porcelain'])) ?? ''
  const unpushed = Number((await gitLine($, ['rev-list', '--count', '@{u}..HEAD'])) ?? 0)
  const next: Git = { branch, dirty: status ? status.split('\n').length : 0, unpushed }
  await update($, git, () => next)
  $.ui.status(`⎇ ${branch}${unpushed > 0 ? ` · ${unpushed} UNPUSHED` : ''}`)
}

// Where people drop their own pet: walk.gif (working) and rest.gif (resting).
const PET_FOLDER = '.claude/arcade-pet'

type PetFolder = { path: string; label: string }

// Folders checked for a pet, in order: the home folder, and under WSL the Windows user folder too,
// so a pet can be dropped in with Windows Explorer.
async function petFolders($: EngineInterface): Promise<PetFolder[]> {
  const folders: PetFolder[] = []
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  if (home !== undefined) {
    const path = `${home.replace(/[\\/]+$/, '')}/${PET_FOLDER}`
    folders.push({ path, label: path })
  }
  if ((await $.env.get('WSL_DISTRO_NAME')) !== undefined) {
    const profile = await $.process.run(['cmd.exe', '/c', 'echo %USERPROFILE%'], { cwd: '/mnt/c', timeoutMs: 5000 }).catch(() => null)
    const windowsHome = profile?.exitCode === 0 ? profile.stdout.trim() : ''
    if (/^[A-Za-z]:\\/.test(windowsHome)) {
      const unix = await $.process.run(['wslpath', '-u', windowsHome], { timeoutMs: 5000 }).catch(() => null)
      if (unix?.exitCode === 0) {
        folders.push({ path: `${unix.stdout.trim()}/${PET_FOLDER}`, label: `${windowsHome}\\.claude\\arcade-pet` })
      }
    }
  }
  return folders
}

// Loads the dropped-in GIF pet from the first folder holding both files, or falls back to the
// built-in one; returns a line saying which.
async function loadCustomPet($: EngineInterface): Promise<string> {
  const folders = await petFolders($)
  const found = await Promise.all(folders.map(async folder => ({
    folder,
    hasWalk: await $.fs.exists(`${folder.path}/walk.gif`),
    hasRest: await $.fs.exists(`${folder.path}/rest.gif`),
  })))
  const complete = found.find(f => f.hasWalk && f.hasRest)
  if (complete === undefined) {
    setPet(DEFAULT_PET)
    const partial = found.find(f => f.hasWalk || f.hasRest)
    if (partial !== undefined) {
      const [have, need] = partial.hasWalk ? ['walk.gif', 'rest.gif'] : ['rest.gif', 'walk.gif']
      return `Found only ${have} in ${partial.folder.label}; add ${need} too. Using the built-in pet.`
    }
    const where = folders.map(f => f.label).join(' or ') || `~/${PET_FOLDER}`
    return `Using the built-in pet. Drop walk.gif and rest.gif into ${where} for your own.`
  }
  const walkPath = `${complete.folder.path}/walk.gif`
  const restPath = `${complete.folder.path}/rest.gif`
  try {
    const [walk, rest] = await Promise.all([
      $.fs.read(walkPath, { as: 'bytes' }),
      $.fs.read(restPath, { as: 'bytes' }),
    ])
    const pet = gifsToPet(base64ToBytes(walk.base64), base64ToBytes(rest.base64))
    setPet(pet)
    const size = (frames: string[][]) => `${frames[0]![0]!.length}x${frames[0]!.length}`
    return `Loaded your pet from ${complete.folder.label}: walking ${pet.walk.frames.length} frame(s) at ${size(pet.walk.frames)}, resting ${size(pet.lie.frames)}.`
  } catch (error) {
    setPet(DEFAULT_PET)
    return `Could not load your pet (${error instanceof Error ? error.message : String(error)}); using the built-in pet.`
  }
}

function modelName(model: string): string {
  const m = /claude-([a-z]+)-(\d+)-(\d+)/i.exec(model)
  return (m ? `${m[1]} ${m[2]}.${m[3]}` : model.replace(/\[.*\]$/, '')).toUpperCase()
}

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

export const register: Register = on => {
  let turnStartedAt = 0
  let clearedThisTurn = false
  // The pet's animation reads these between redraws; the drawn width comes from the last Pane render.
  let petTick = 0
  let petAwake = false
  let petColumns = 0
  // An automatic open only stays when it docks beside the transcript; /pet keeps it anywhere.
  let petAskedFor = false
  // The score band's site, once it has drawn the pet on the terminal; the timer repaints it there.
  let bandRequestId: string | null = null

  on('session.start', async ($, e, next) => {
    await refreshGit($)
    petAwake = await read($, isAwake)
    const loaded = await loadCustomPet($)
    if (loaded.startsWith('Could not') || loaded.startsWith('Found only')) $.ui.toast(loaded)
    await $.command.register({
      name: 'pet',
      description: 'Open the pet pane, or /pet reload to load your walk.gif and rest.gif',
      argumentHint: '[reload]',
    })
    $.clock.every(PET_TICK_MS, () => {
      petTick += 1
      if (petColumns > 0) {
        void $.ui.blit({ requestId: PET_PANE, key: 'pet', ...petFrame(petTick, petAwake, petColumns) }).catch(() => {})
      }
      if (bandRequestId !== null) {
        const { bandColumns, bandRows } = petSizes()
        const frame = petFrame(petTick, petAwake, bandColumns, bandRows, false, true)
        void $.ui.blit({ requestId: bandRequestId, key: 'band-pet', ...frame }).catch(() => {})
      }
    })
    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    if (e.args.trim() === 'reload') {
      const loaded = await loadCustomPet($)
      $.ui.invalidate('ui.render') // the band and pane redraw at the new pet's size
      return { text: loaded }
    }
    petAskedFor = true
    const { paneColumns, petRows } = petSizes()
    await $.ui.open({ id: PET_PANE, title: PET_TITLE, columns: paneColumns, rows: petRows + 1 })
    return { text: 'Arcade pet pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PET_PANE }, async ($, e) => {
    const awake = await read($, isAwake)
    petAwake = awake
    const label = awake ? '▶ PLAYER 1 · RUNNING' : 'ZZZ · SLEEPING'
    const labelColor = awake ? COLORS.green : COLORS.dim

    // Pixel cells draw on the terminal only; other surfaces show the label alone.
    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text color={labelColor}>{label}</Text>
    }
    const { Box, Text, Raster } = $.ui.resolve(e)
    if (e.props.placement === 'inline' && !petAskedFor) {
      // Seated above the prompt it would cover the conversation: close it, outside the draw.
      petColumns = 0
      $.clock.after(0, () => void $.ui.close({ id: PET_PANE }).catch(() => {}))
      return <Text color={COLORS.dim}>{label}</Text>
    }
    petColumns = Math.max(1, Math.min(e.props.bodyColumns, PET_MAX_COLUMNS))
    const frame = petFrame(petTick, awake, petColumns)

    return (
      <Box flexDirection="column">
        <Raster key="pet" columns={frame.columns} rows={frame.rows} cells={frame.cells} />
        <Text color={labelColor}>{label}</Text>
      </Box>
    )
  })

  on('prompt.submit', async ($, e, next) => {
    turnStartedAt = await $.clock.now()
    clearedThisTurn = false
    petAwake = true
    await update($, isAwake, () => true)
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && isTestCommand(e.command)) {
      const result: Score = parseScore(ran.text ?? '', ran.isError === true)
      await update($, score, () => result)
      clearedThisTurn = clearedThisTurn || result.isClear
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    petAwake = false
    await update($, isAwake, () => false)
    if (turnStartedAt > 0) {
      const seconds = Math.round(((await $.clock.now()) - turnStartedAt) / 1000)
      await update($, lastTurnSeconds, () => seconds)
    }
    await refreshGit($)
    if (clearedThisTurn) $.ui.toast('★ STAGE CLEAR ★')
    clearedThisTurn = false
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const [cwd, model, usage, s, g, secs, awake] = await Promise.all([
      $.session.cwd(),
      $.session.model(),
      $.session.usage(),
      read($, score),
      read($, git),
      read($, lastTurnSeconds),
      read($, isAwake),
    ])
    petAwake = awake
    const energy = energyBar(usage.context.percent ?? 0)
    const k = (label: string) => <Text color={COLORS.pink}>{label} </Text>

    const stats = (
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        <Box flexWrap="wrap" columnGap={3}>
          <Text>{k('1UP')}{baseName(cwd).toUpperCase()}</Text>
          <Text>
            {k('SCORE')}
            {s === null
              ? <Text color={COLORS.dim}>--</Text>
              : <Text color={s.isClear ? COLORS.green : COLORS.red}>{scoreText(s)}</Text>}
          </Text>
          <Text>{k('TIME')}{secs === null ? '--:--' : clock(secs)}</Text>
        </Box>
        <Box flexWrap="wrap" columnGap={3}>
          <Text>
            {k('STAGE')}
            {g === null
              ? <Text color={COLORS.dim}>NO GIT</Text>
              : <Text color={COLORS.cyan}>{g.branch}</Text>}
            {g !== null && g.dirty > 0 ? <Text color={COLORS.yellow}> ●{g.dirty}</Text> : ''}
          </Text>
          <Text>{k('PLAYER')}{modelName(model)}</Text>
          <Text>
            {k('ENERGY')}
            <Text color={energy.left > 25 ? COLORS.green : COLORS.red}>{energy.full}</Text>
            <Text color={COLORS.dim}>{energy.empty}</Text> {energy.left}%
          </Text>
        </Box>
      </Box>
    )

    // Pikachu sits in the band's right corner, on the terminal only (pixel cells draw there alone).
    const { bandColumns, bandRows } = petSizes()
    if (e.surface !== 'terminal' || e.props.bodyColumns < bandColumns + 30) {
      bandRequestId = null
      return (
        <Box flexDirection="column" borderStyle="single" borderColor={COLORS.cyan} paddingX={1}>
          {stats}
        </Box>
      )
    }
    const { Raster } = $.ui.resolve(e)
    bandRequestId = e.requestId
    const frame = petFrame(petTick, awake, bandColumns, bandRows, false, true)
    return (
      <Box borderStyle="single" borderColor={COLORS.cyan} paddingX={1} columnGap={2}>
        {stats}
        <Raster key="band-pet" columns={frame.columns} rows={frame.rows} cells={frame.cells} />
      </Box>
    )
  })

  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const { tool, input, isRunning, isErrored, isInterrupted } = e.props
    const isTest = tool === 'Bash' && isTestCommand(toolArg(tool, input))
    const icon = isRunning ? '▸' : isErrored || isInterrupted ? '✗' : isTest ? '★' : '✓'
    const iconColor = isRunning ? COLORS.cyan : isErrored || isInterrupted ? COLORS.red : COLORS.green
    // Quiet tools have their result block hidden, so their error is drawn here instead.
    const errorLines = isErrored && !isInterrupted && QUIET_RESULTS.has(tool) && typeof e.props.output === 'string'
      ? e.props.output.split('\n').filter(line => line.trim() !== '').slice(0, 3)
      : []

    return (
      <Box flexDirection="column">
        <Box columnGap={1}>
          <Text color={iconColor}>{icon}</Text>
          <Box width={7} flexShrink={0}>
            <Text color={COLORS.yellow}>{toolTag(tool, input)}</Text>
          </Box>
          <Box flexShrink={1}>
            <Text wrap="truncate-end">{toolArg(tool, input)}</Text>
          </Box>
          {isInterrupted ? <Text color={COLORS.dim}>PAUSED</Text> : ''}
          {isErrored && !isInterrupted ? <Text backgroundColor={COLORS.red} color="black"> MISS </Text> : ''}
        </Box>
        {errorLines.map(line => (
          <Box paddingLeft={10}>
            <Text color={COLORS.red} wrap="truncate-end">⎿ {line}</Text>
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, ($, e, next) => {
    if (e.surface !== 'terminal' || !QUIET_RESULTS.has(e.props.tool)) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  // Unfold "Read 3 files, listed 2 directories" into one arcade row per call.
  on('ui.render', { component: 'ToolGroup' }, ($, e, next) =>
    e.surface === 'terminal' ? next({ ...e, props: { ...e.props, isExpanded: true } }) : next(e),
  )

  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isExpanded || e.props.origin.kind !== 'composer') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text color={COLORS.pink} bold>P1 ▶ </Text>
        <Box flexShrink={1}><Text>{e.props.text}</Text></Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isSummary) return next(e)
    const { Box, Text, Markdown } = $.ui.resolve(e)
    return (
      <Box>
        <Text color={COLORS.cyan}>{e.props.isFirstOfReply ? '◆ ' : '  '}</Text>
        <Box flexGrow={1} flexShrink={1}><Markdown text={e.props.text} /></Box>
      </Box>
    )
  })

  on('ui.render', { component: 'TurnDuration' }, ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text color={COLORS.yellow}>── ROUND OVER · {clock(Math.round(e.props.durationMs / 1000))} ──</Text>
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) =>
    e.props.isDraft || e.props.isWorking ? next(e) : next({ ...e, props: { ...e.props, tail: 'INSERT COIN ▸ 1UP READY' } }),
  )

  on('ui.render', { component: 'SessionMode' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, modes: e.props.modes.map(m => m.toUpperCase()) } }),
  )

  on('ui.render', { component: 'Spinner' }, ($, e, next) =>
    next({
      ...e,
      props: { ...e.props, word: `▓▒░ ${SPINNER_WORDS[e.props.mode] ?? 'LOADING'}`, suffix: ' · ESC TO PAUSE' },
    }),
  )
}
