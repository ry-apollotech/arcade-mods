// The sprite sheet setup writes (sprites.json): 32x32 pixels per side, a hex digit each, 0 transparent.
// Drawn as half blocks: two pixels a cell, so 32 columns by 16 rows.
export type SpriteSheet = Record<string, { palette: number[]; front: string; back: string }>

const SIZE = 32
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const DEFAULT = 0x01000000

export function parseSpriteSheet(text: string): SpriteSheet {
  return JSON.parse(text) as SpriteSheet
}

export function spriteCells(
  sheet: SpriteSheet, species: number, side: 'front' | 'back',
): { cells: string; columns: number; rows: number } | null {
  const entry = sheet[String(species)]
  if (!entry) return null
  const px = entry[side]
  const color = (x: number, y: number): number | null => {
    const c = parseInt(px[y * SIZE + x]!, 16)
    return c === 0 ? null : entry.palette[c]!
  }
  const words = new Uint32Array(SIZE * (SIZE / 2) * 3)
  for (let r = 0; r < SIZE / 2; r++) {
    for (let x = 0; x < SIZE; x++) {
      const upper = color(x, r * 2)
      const lower = color(x, r * 2 + 1)
      const i = (r * SIZE + x) * 3
      if (upper === null && lower === null) words.set([0x20, DEFAULT, DEFAULT], i)
      else if (upper === null) words.set([LOWER_HALF, lower!, DEFAULT], i)
      else words.set([UPPER_HALF, upper, lower ?? DEFAULT], i)
    }
  }
  const bytes = new Uint8Array(words.buffer) as unknown as { toBase64: () => string }
  return { cells: bytes.toBase64(), columns: SIZE, rows: SIZE / 2 }
}
