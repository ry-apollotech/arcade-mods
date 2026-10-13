// A small GIF decoder: every frame composited onto the logical screen, as packed pixels.
// A pixel is 0xRRGGBB, or -1 where it is transparent.

// delays[i] is how long frame i shows, in milliseconds.
export type GifImage = { width: number; height: number; frames: Int32Array[]; delays: number[] }

// A delay of 0 or 10 ms means "as fast as you can"; browsers play those at 100 ms, and so do we.
const FASTEST_DELAY_MS = 20
const DEFAULT_DELAY_MS = 100

const MAX_CODES = 4096

function lzwDecode(minCodeSize: number, data: Uint8Array, pixelCount: number): Uint8Array {
  const out = new Uint8Array(pixelCount)
  const clear = 1 << minCodeSize
  const end = clear + 1
  const prefix = new Int16Array(MAX_CODES)
  const suffix = new Uint8Array(MAX_CODES)
  const stack = new Uint8Array(MAX_CODES + 1)
  for (let i = 0; i < clear; i++) suffix[i] = i

  let codeSize = minCodeSize + 1
  let codeMask = (1 << codeSize) - 1
  let available = clear + 2
  let old = -1
  let first = 0
  let datum = 0
  let bits = 0
  let pos = 0
  let op = 0

  while (op < pixelCount) {
    while (bits < codeSize && pos < data.length) {
      datum |= data[pos++]! << bits
      bits += 8
    }
    if (bits < codeSize) break
    let code = datum & codeMask
    datum >>>= codeSize
    bits -= codeSize

    if (code === clear) {
      codeSize = minCodeSize + 1
      codeMask = (1 << codeSize) - 1
      available = clear + 2
      old = -1
      continue
    }
    if (code === end) break
    if (old === -1) {
      out[op++] = suffix[code]!
      old = first = code
      continue
    }

    const incoming = code
    let sp = 0
    if (code >= available) {
      stack[sp++] = first
      code = old
    }
    while (code >= clear) {
      stack[sp++] = suffix[code]!
      code = prefix[code]!
    }
    first = suffix[code]!
    stack[sp++] = first
    if (available < MAX_CODES) {
      prefix[available] = old
      suffix[available] = first
      available++
      if ((available & codeMask) === 0 && available < MAX_CODES) {
        codeSize++
        codeMask = (1 << codeSize) - 1
      }
    }
    old = incoming
    while (sp > 0 && op < pixelCount) out[op++] = stack[--sp]!
  }
  return out
}

function readColorTable(bytes: Uint8Array, at: number, size: number): number[] {
  const table: number[] = []
  for (let i = 0; i < size; i++) {
    const p = at + i * 3
    table.push((bytes[p]! << 16) | (bytes[p + 1]! << 8) | bytes[p + 2]!)
  }
  return table
}

// Rows of an interlaced image arrive in four passes; this maps arrival order to real rows.
function interlacedRows(height: number): number[] {
  const rows: number[] = []
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]] as const) {
    for (let y = start; y < height; y += step) rows.push(y)
  }
  return rows
}

// maxPixels caps width x height x frames: decoding stops with an error once the next frame would pass it,
// so a huge GIF fails fast instead of keeping the hooks worker busy for seconds.
export function decodeGif(bytes: Uint8Array, maxPixels = Infinity): GifImage {
  const signature = String.fromCharCode(...bytes.subarray(0, 6))
  if (signature !== 'GIF87a' && signature !== 'GIF89a') throw new Error('not a GIF file')
  const u16 = (p: number) => bytes[p]! | (bytes[p + 1]! << 8)

  const width = u16(6)
  const height = u16(8)
  const tooLarge = (frames: number) =>
    new Error(`too large: ${width}x${height}${frames > 1 ? ` with ${frames}+ frames` : ''}; resize it to about 250 pixels tall or less`)
  if (width * height > maxPixels) throw tooLarge(1)
  const screenFlags = bytes[10]!
  let pos = 13
  let globalTable: number[] = []
  if (screenFlags & 0x80) {
    const size = 1 << ((screenFlags & 7) + 1)
    globalTable = readColorTable(bytes, pos, size)
    pos += size * 3
  }

  const canvas = new Int32Array(width * height).fill(-1)
  const frames: Int32Array[] = []
  const delays: number[] = []
  let transparentIndex = -1
  let disposal = 0
  let delay = DEFAULT_DELAY_MS

  while (pos < bytes.length) {
    const block = bytes[pos++]
    if (block === 0x3b) break // trailer
    if (block === 0x21) {
      const label = bytes[pos++]
      if (label === 0xf9) {
        const flags = bytes[pos + 1]!
        disposal = (flags >> 2) & 7
        const ms = u16(pos + 2) * 10
        delay = ms < FASTEST_DELAY_MS ? DEFAULT_DELAY_MS : ms
        transparentIndex = flags & 1 ? bytes[pos + 4]! : -1
      }
      while (pos < bytes.length && bytes[pos] !== 0) pos += bytes[pos]! + 1 // skip sub-blocks
      pos++
      continue
    }
    if (block !== 0x2c) throw new Error(`unexpected GIF block 0x${(block ?? 0).toString(16)}`)
    if ((frames.length + 1) * width * height > maxPixels) throw tooLarge(frames.length + 1)

    const left = u16(pos)
    const top = u16(pos + 2)
    const w = u16(pos + 4)
    const h = u16(pos + 6)
    const flags = bytes[pos + 8]!
    pos += 9
    let table = globalTable
    if (flags & 0x80) {
      const size = 1 << ((flags & 7) + 1)
      table = readColorTable(bytes, pos, size)
      pos += size * 3
    }
    const minCodeSize = bytes[pos++]!
    const chunks: Uint8Array[] = []
    while (pos < bytes.length && bytes[pos] !== 0) {
      const size = bytes[pos]!
      chunks.push(bytes.subarray(pos + 1, pos + 1 + size))
      pos += size + 1
    }
    pos++
    const data = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
    let offset = 0
    for (const c of chunks) {
      data.set(c, offset)
      offset += c.length
    }

    const indices = lzwDecode(minCodeSize, data, w * h)
    const before = disposal === 3 ? canvas.slice() : null
    const rows = flags & 0x40 ? interlacedRows(h) : null
    for (let i = 0; i < h; i++) {
      const y = top + (rows ? rows[i]! : i)
      if (y >= height) continue
      for (let x = 0; x < w; x++) {
        const index = indices[i * w + x]!
        if (index === transparentIndex || left + x >= width) continue
        canvas[y * width + left + x] = table[index] ?? 0
      }
    }
    frames.push(canvas.slice())
    delays.push(delay)

    if (disposal === 2) {
      for (let y = top; y < Math.min(height, top + h); y++) canvas.fill(-1, y * width + left, y * width + Math.min(width, left + w))
    } else if (before) {
      canvas.set(before)
    }
    transparentIndex = -1
    disposal = 0
    delay = DEFAULT_DELAY_MS
  }

  if (frames.length === 0) throw new Error('the GIF has no frames')
  return { width, height, frames, delays }
}
