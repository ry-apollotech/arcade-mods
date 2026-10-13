// Turns a dropped-in walk.gif and rest.gif into a pet: undoes the pixel-art upscale, drops the
// background, crops, shrinks anything taller than the band allows, and recolors pure black.
import { decodeGif } from './gif'
import type { GifImage } from './gif'
import type { Pet, PetSprite } from './pets/types'

export const MAX_PET_HEIGHT = 20
const OUTLINE_GRAY = 0x4a4a5e
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

type Grid = (number | null)[][]

export function base64ToBytes(base64: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n = (alphabet.indexOf(clean[i]!) << 18) | (alphabet.indexOf(clean[i + 1] ?? 'A') << 12)
      | (alphabet.indexOf(clean[i + 2] ?? 'A') << 6) | alphabet.indexOf(clean[i + 3] ?? 'A')
    if (o < out.length) out[o++] = (n >> 16) & 255
    if (o < out.length) out[o++] = (n >> 8) & 255
    if (o < out.length) out[o++] = n & 255
  }
  return out
}

function runLengths(get: (i: number) => number, length: number, into: number[]): void {
  let run = 1
  for (let i = 1; i < length; i++) {
    if (get(i) === get(i - 1)) run++
    else {
      into.push(run)
      run = 1
    }
  }
  into.push(run)
}

// The largest block size that 95% of the runs of equal pixels are multiples of; a few stray edge
// pixels would make a strict gcd collapse to 1.
export function detectScale(image: GifImage): number {
  const { width, height, frames } = image
  const runs: number[] = []
  for (const f of frames) {
    for (let y = 0; y < height; y++) runLengths(i => f[y * width + i]!, width, runs)
    for (let x = 0; x < width; x++) runLengths(i => f[i * width + x]!, height, runs)
  }
  for (let scale = 32; scale > 1; scale--) {
    if (runs.filter(r => r % scale === 0).length >= 0.95 * runs.length) return scale
  }
  return 1
}

function toGrids(image: GifImage): Grid[] {
  const { width, height, frames } = image
  const scale = detectScale(image)
  const corner = frames[0]![0]!
  const background = corner === -1 ? null : corner // an opaque corner color is the background
  const rows = Math.floor(height / scale)
  const cols = Math.floor(width / scale)
  const half = Math.floor(scale / 2)
  return frames.map(f => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
    const p = f[(r * scale + half) * width + c * scale + half]!
    if (p === -1 || p === background) return null
    return p === 0 ? OUTLINE_GRAY : p
  })))
}

function crop(grids: Grid[]): Grid[] {
  let c0 = Infinity, c1 = -1, r0 = Infinity, r1 = -1
  grids.forEach(g => g.forEach((line, r) => line.forEach((v, c) => {
    if (v === null) return
    c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r)
  })))
  if (c1 < 0) throw new Error('the image is empty once its background is dropped')
  return grids.map(g => g.slice(r0, r1 + 1).map(line => line.slice(c0, c1 + 1)))
}

const isDark = (v: number) => ((v >> 16) & 255) + ((v >> 8) & 255) + (v & 255) < 200

// Downscales by factor: a cell is filled when 35% of its area is; dark wins at 40%; else the commonest color.
function shrink(grid: Grid, factor: number): Grid {
  const rows = grid.length
  const cols = grid[0]!.length
  return Array.from({ length: Math.max(1, Math.round(rows / factor)) }, (_, r) =>
    Array.from({ length: Math.max(1, Math.round(cols / factor)) }, (_, c) => {
      const y0 = Math.floor(r * factor), x0 = Math.floor(c * factor)
      const y1 = Math.max(y0 + 1, Math.floor((r + 1) * factor)), x1 = Math.max(x0 + 1, Math.floor((c + 1) * factor))
      const cells: (number | null)[] = []
      for (let y = y0; y < Math.min(y1, rows); y++) for (let x = x0; x < Math.min(x1, cols); x++) cells.push(grid[y]![x]!)
      const filled = cells.filter((v): v is number => v !== null)
      const dark = filled.filter(isDark)
      const light = filled.filter(v => !isDark(v))
      if (filled.length < 0.35 * cells.length) return null
      if (dark.length >= 0.4 * cells.length || light.length === 0) return dark[0] ?? filled[0]!
      const counts = new Map<number, number>()
      for (const v of light) counts.set(v, (counts.get(v) ?? 0) + 1)
      return [...counts].sort((a, b) => b[1] - a[1])[0]![0]
    }))
}

function encode(grids: Grid[]): PetSprite {
  const palette = new Map<number, string>()
  const frames = grids.map(g => g.map(line => line.map(v => {
    if (v === null) return '.'
    let ch = palette.get(v)
    if (ch === undefined) {
      if (palette.size === CHARS.length) throw new Error(`more than ${CHARS.length} colors; reduce the palette`)
      ch = CHARS[palette.size]!
      palette.set(v, ch)
    }
    return ch
  }).join('')))
  return { frames, palette: Object.fromEntries([...palette].map(([v, ch]) => [ch, v])) }
}

export function gifToSprite(bytes: Uint8Array, maxHeight = MAX_PET_HEIGHT): PetSprite {
  let grids = crop(toGrids(decodeGif(bytes)))
  const height = grids[0]!.length
  if (height > maxHeight) grids = grids.map(g => shrink(g, height / maxHeight))
  return encode(grids)
}

export function gifsToPet(walk: Uint8Array, rest: Uint8Array): Pet {
  return { walk: gifToSprite(walk), lie: gifToSprite(rest) }
}
