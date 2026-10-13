import { describe, expect, test } from 'claude-code/testing'
import { parseSpriteSheet, spriteCells } from '../hooks/sprites'

// Decodes standard base64, to read the cells back.
function bytes(base64: string): Uint8Array {
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

// One species: palette color 1 red; the front is all color 1 except a transparent top row.
const sheet = parseSpriteSheet(JSON.stringify({
  '3': { palette: [0, 0xff0000, ...Array(14).fill(0)], front: '0'.repeat(32) + '1'.repeat(32 * 31), back: '0'.repeat(1024) },
}))

describe('sprites', () => {
  test('a front sprite is 32 columns by 16 rows of half blocks', () => {
    const s = spriteCells(sheet, 3, 'front')!
    expect(s.columns).toBe(32)
    expect(s.rows).toBe(16)
    const words = new Uint32Array(bytes(s.cells).buffer)
    expect(words.length).toBe(32 * 16 * 3)
    expect(words[0]).toBe(0x2584) // top pixel transparent: a lower half block, red below
    expect(words[1]).toBe(0xff0000)
  })
  test('an unknown species has no sprite', () => {
    expect(spriteCells(sheet, 999, 'front')).toBeNull()
  })
})
