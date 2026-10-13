// The pane's drawing for each Screen: a card, or the battle with its sprites, HP bars, message and keys.
import type { Elements } from 'claude-code'
import type { BattleState, Mon, Screen } from '../types'
import type { SpriteSheet } from './sprites'
import { spriteCells } from './sprites'

type El = Elements['terminal']
const BAR = 16

function hpBar(mon: Mon): string {
  const filled = mon.maxHp > 0 ? Math.round((mon.hp / mon.maxHp) * BAR) : 0
  return '█'.repeat(filled) + '░'.repeat(BAR - filled)
}

function hpColor(mon: Mon): string {
  const share = mon.maxHp > 0 ? mon.hp / mon.maxHp : 0
  return share > 0.5 ? 'green' : share > 0.2 ? 'yellow' : 'red'
}

function monLine(els: El, mon: Mon, owner: string) {
  const { Box, Text } = els
  return (
    <Box flexDirection="column">
      <Text bold>{owner}{mon.name}  Lv{mon.level}</Text>
      <Text>HP <Text color={hpColor(mon)}>{hpBar(mon)}</Text> {mon.hp}/{mon.maxHp}</Text>
    </Box>
  )
}

function sprite(els: El, sheet: SpriteSheet | null, species: number, side: 'front' | 'back', key: string) {
  const { Raster, Box } = els
  const s = sheet ? spriteCells(sheet, species, side) : null
  return s && Raster ? <Raster key={key} columns={s.columns} rows={s.rows} cells={s.cells} /> : <Box width={32} height={16} />
}

function moves(els: El, state: BattleState, onKey: (k: string) => void) {
  const { Box, Text, Button } = els
  const choosing = state.menu === 'action' || state.menu === 'move'
  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
      {state.player!.moves.map(m => {
        const label = `${m.name} ${m.pp}/${m.maxPp}`
        return choosing && m.pp > 0
          ? <Button key={`move-${m.slot}`} plain hotkey={String(m.slot)} label={label} onPress={() => onKey(String(m.slot))} />
          : <Text key={`move-${m.slot}`} dimColor>{m.slot}: {label}</Text>
      })}
    </Box>
  )
}

function party(els: El, state: BattleState, onKey: (k: string) => void) {
  const { Box, Text, Button } = els
  return (
    <Box flexDirection="column">
      {state.party.map(p => (p.hp > 0 && !p.active
        ? <Button key={`party-${p.slot}`} plain hotkey={String(p.slot)} label={`${p.name} ${p.hp}/${p.maxHp}`} onPress={() => onKey(String(p.slot))} />
        : <Text key={`party-${p.slot}`} dimColor>{p.slot}: {p.name} {p.hp}/{p.maxHp}{p.active ? ' (out)' : ''}</Text>))}
    </Box>
  )
}

export function renderScreen(els: El, screen: Screen, footer: string, sheet: SpriteSheet | null, onKey: (k: string) => void) {
  const { Box, Text, Button } = els
  if (screen.kind === 'card') {
    return (
      <Box flexDirection="column">
        <Text bold color="red">{screen.title}</Text>
        {screen.lines.map((line, i) => <Text key={`line-${i}`}>{line}</Text>)}
        <Box flexDirection="row" columnGap={2}>
          {screen.keys.map(k => <Button key={`key-${k}`} plain hotkey={k} label={k === 'r' ? 'play' : k} onPress={() => onKey(k)} />)}
        </Box>
        <Text dimColor>{footer}</Text>
      </Box>
    )
  }
  const { state } = screen
  if (!state.player || !state.enemy) return <Text dimColor>{state.message || 'Climbing to RED...'}</Text>
  const pickParty = screen.picking === 'party' || state.menu === 'party'
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        {monLine(els, state.enemy, "RED's ")}
        {sprite(els, sheet, state.enemy.species, 'front', 'enemy')}
      </Box>
      <Box flexDirection="row" columnGap={2}>
        {sprite(els, sheet, state.player.species, 'back', 'player')}
        {monLine(els, state.player, '')}
      </Box>
      <Text>{state.message}</Text>
      {pickParty ? party(els, state, onKey) : moves(els, state, onKey)}
      <Box flexDirection="row" columnGap={2}>
        {state.menu === 'action' && !pickParty && <Button key="key-s" plain hotkey="s" label="switch" onPress={() => onKey('s')} />}
        {state.menu === 'none' && <Button key="key-j" plain hotkey="j" label="next" onPress={() => onKey('j')} />}
        <Text dimColor>{screen.mode === 'demo' ? 'DEMO · press any key' : footer}</Text>
      </Box>
    </Box>
  )
}
