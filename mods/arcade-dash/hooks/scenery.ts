// A small scrolling day scene behind the running pet: sky, drifting clouds, hills, grass and a dirt path.
// Each layer scrolls left at its own speed so the pet, standing still, looks like it runs through it.

const SKY = 0x78bff5
const CLOUD = 0xffffff
const HILL = 0x3f8f4f
const GRASS = 0x5cc84c
const TUFT = 0x3a9a3a
const DIRT = 0xc89a5a
const PEBBLE = 0xa07840

// Cloud shapes, repeating every CLOUD_PERIOD pixels; 'W' is cloud.
const CLOUD_PERIOD = 30
const CLOUDS: { x: number; y: number; shape: string[] }[] = [
  { x: 3, y: 2, shape: ['.WW...', 'WWWWW.', '.WWWWW'] },
  { x: 18, y: 5, shape: ['.WW.', 'WWWW'] },
]

function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

function cloudAt(x: number, y: number): boolean {
  return CLOUDS.some(cloud => {
    const row = cloud.shape[y - cloud.y]
    return row !== undefined && row[mod(x, CLOUD_PERIOD) - cloud.x] === 'W'
  })
}

// Night, behind the resting pet: still ground and hills, a moon, and stars that twinkle.
const NIGHT_SKY_TOP = 0x0b1430
const NIGHT_SKY_LOW = 0x16224a
const MOON = 0xf5e6a8
const STAR = 0xffffff
const STAR_DIM = 0x7f8fc0
const NIGHT_HILL = 0x1c3a2c
const NIGHT_GRASS = 0x24502e
const NIGHT_DIRT = 0x5a4630

const MOON_SHAPE = ['.MM.', 'MMMM', 'MMMM', '.MM.']
const MOON_AT = { x: 1, y: 1 }
const STARS: [number, number][] = [[8, 1], [14, 3], [20, 1], [11, 6], [24, 5], [6, 8], [18, 7]]

export function nightPixel(x: number, y: number, tick: number, height: number): number {
  const grassTop = height - 6
  if (y >= height - 4) return NIGHT_DIRT
  if (y >= grassTop) return NIGHT_GRASS
  const hillHeight = 3 + Math.round(2 * Math.sin((x * 2 * Math.PI) / 16))
  if (y >= grassTop - hillHeight) return NIGHT_HILL

  if (MOON_SHAPE[y - MOON_AT.y]?.[x - MOON_AT.x] === 'M') return MOON
  const star = STARS.findIndex(([sx, sy]) => sx === x && sy === y)
  if (star !== -1) return mod(Math.floor(tick / 4) + star * 2, 7) === 0 ? STAR_DIM : STAR // each star dims now and then
  return y < grassTop / 2 ? NIGHT_SKY_TOP : NIGHT_SKY_LOW
}

// The scene's color at pixel (x, y) of a height-tall strip, scrolled for this tick.
export function sceneryPixel(x: number, y: number, tick: number, height: number): number {
  const grassTop = height - 6
  const ground = x + tick // ground scrolls a pixel a tick
  if (y >= height - 4) return y === height - 3 && mod(ground, 7) === 0 ? PEBBLE : DIRT
  if (y >= grassTop) return GRASS
  if (y === grassTop - 1 && mod(ground, 6) === 0) return TUFT

  const hillX = x + Math.floor(tick / 3) // hills a pixel every 3 ticks
  const hillHeight = 3 + Math.round(2 * Math.sin((hillX * 2 * Math.PI) / 16))
  if (y >= grassTop - hillHeight) return HILL

  return cloudAt(x + Math.floor(tick / 6), y) ? CLOUD : SKY // clouds a pixel every 6 ticks
}
