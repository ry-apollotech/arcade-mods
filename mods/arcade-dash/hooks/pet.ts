// Pixel pet drawn with half blocks: each terminal cell holds two square pixels (top and bottom).
import { pikachu } from './pets/pikachu'
import type { Pet } from './pets/types'
import { nightPixel, sceneryPixel } from './scenery'

const DEFAULT = 0x01000000
const GROUND = 0x34345c
const Z_COLOR = 0xffffff
const UPPER_HALF = 0x2580 // ▀
const LOWER_HALF = 0x2584 // ▄

// Ticks each lying frame is held, so a multi-frame rest breathes slowly.
const LIE_FRAME_TICKS = 4

// Columns kept free right of the pet so the resting z Z can float up beside its head.
const Z_ROOM = 4

export const DEFAULT_PET: Pet = pikachu

// The pet being drawn: the built-in one until a dropped-in pet loads (see petloader.ts).
let current: Pet = DEFAULT_PET

export function setPet(pet: Pet): void {
  current = pet
}

export function currentPet(): Pet {
  return current
}

export type PetSizes = { paneColumns: number; petRows: number; bandRows: number; bandColumns: number }

export function petSizes(pet: Pet = current): PetSizes {
  const width = Math.max(pet.walk.frames[0]![0]!.length, pet.lie.frames[0]![0]!.length)
  const height = Math.max(pet.walk.frames[0]!.length, pet.lie.frames[0]!.length)
  return {
    paneColumns: width + 6, // the dock's width: the widest frame and a little room
    petRows: Math.ceil((height + 1) / 2) + 1, // the pane: tallest frame plus a floor row, two pixels a row
    bandRows: Math.ceil(height / 2), // the score band's corner, no floor line
    bandColumns: width + 1 + Z_ROOM,
  }
}

export type PetFrame = { cells: string; columns: number; rows: number }

function toBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += chars[(n >> 18) & 63]! + chars[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? chars[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? chars[n & 63]! : '='
  }
  return out
}

export function petFrame(
  tick: number, isAwake: boolean, columns: number, rows = petSizes().petRows, withGround = true, scenery = false,
): PetFrame {
  const height = rows * 2
  // With scenery on, a day scene (running) or a night scene (resting) fills every pixel the pet leaves empty.
  const backdrop = isAwake ? sceneryPixel : nightPixel
  const pixels: (number | null)[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: columns }, (_, x) => (scenery ? backdrop(x, y, tick, height) : null)),
  )
  const floor = withGround ? 1 : 0

  if (withGround) for (let x = 0; x < columns; x++) pixels[height - 1]![x] = x % 2 === 0 ? GROUND : null

  const sprite = isAwake ? current.walk : current.lie
  const frameIndex = isAwake ? tick % sprite.frames.length : Math.floor(tick / LIE_FRAME_TICKS) % sprite.frames.length
  const lines = sprite.frames[frameIndex]!
  const width = lines[0]!.length
  // Runs in place: awake and resting share one spot near the right edge, the Z room beside it.
  const left = Math.max(0, columns - width - 1 - Z_ROOM)
  const top = height - floor - lines.length

  lines.forEach((line, sy) => {
    ;[...line].forEach((ch, sx) => {
      const color = sprite.palette[ch]
      const row = pixels[top + sy]
      const x = left + sx
      if (color !== undefined && row && x >= 0 && x < columns) row[x] = color
    })
  })

  const words = new Uint32Array(columns * rows * 3)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const upper = pixels[r * 2]![c] ?? null
      const lower = pixels[r * 2 + 1]![c] ?? null
      const i = (r * columns + c) * 3
      if (upper === null && lower === null) words.set([0x20, DEFAULT, DEFAULT], i)
      else if (upper === null) words.set([LOWER_HALF, lower!, DEFAULT], i)
      else words.set([UPPER_HALF, upper, lower ?? DEFAULT], i)
    }
  }

  if (!isAwake) {
    // White z, then Z, drifting up in the room right of the pet, one step every 4 ticks.
    const phase = Math.floor(tick / 4) % 3
    const zs: [number, number, string][] = [
      [left + width + phase, 3 - phase, 'z'],
      [left + width + 1 + phase, 1 - Math.min(phase, 1), 'Z'],
    ]
    for (const [c, r, ch] of zs) {
      if (c < 0 || c >= columns || r < 0 || r >= rows) continue
      // The letter's cell takes the scene's color behind it, so no black square shows on the night sky.
      words.set([ch.charCodeAt(0), Z_COLOR, pixels[r * 2]![c] ?? DEFAULT], (r * columns + c) * 3)
    }
  }

  return { cells: toBase64(new Uint8Array(words.buffer)), columns, rows }
}
