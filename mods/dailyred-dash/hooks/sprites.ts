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

// A species' sprite as a 32x32 grid of colors, null where transparent.
export function spriteGrid(sheet: SpriteSheet, species: number, side: 'front' | 'back'): (number | null)[][] | null {
  const entry = sheet[String(species)]
  if (!entry) return null
  const px = entry[side]
  return Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => {
    const c = parseInt(px[y * SIZE + x]!, 16)
    return c === 0 ? null : entry.palette[c]!
  }))
}

// A 32x32 grid as raster cells: two pixels a cell, so 32 columns by 16 rows.
export function gridCells(grid: (number | null)[][]): { cells: string; columns: number; rows: number } {
  const words = new Uint32Array(SIZE * (SIZE / 2) * 3)
  for (let r = 0; r < SIZE / 2; r++) {
    for (let x = 0; x < SIZE; x++) {
      const upper = grid[r * 2]![x] ?? null
      const lower = grid[r * 2 + 1]![x] ?? null
      const i = (r * SIZE + x) * 3
      if (upper === null && lower === null) words.set([0x20, DEFAULT, DEFAULT], i)
      else if (upper === null) words.set([LOWER_HALF, lower!, DEFAULT], i)
      else words.set([UPPER_HALF, upper, lower ?? DEFAULT], i)
    }
  }
  const bytes = new Uint8Array(words.buffer) as unknown as { toBase64: () => string }
  return { cells: bytes.toBase64(), columns: SIZE, rows: SIZE / 2 }
}

export function spriteCells(
  sheet: SpriteSheet, species: number, side: 'front' | 'back',
): { cells: string; columns: number; rows: number } | null {
  const grid = spriteGrid(sheet, species, side)
  return grid ? gridCells(grid) : null
}
