import { describe, expect, test } from 'claude-code/testing'

import { decodeGif } from '../hooks/gif'
import { base64ToBytes, detectScale, gifToSprite, gifsToPet } from '../hooks/petloader'

// 2 frames drawn 4x on a transparent background: a 5x4 red shape with black eyes and a yellow
// mouth; only the last row differs between frames, and frame 2 reaches one pixel further right.
const TINY_GIF = 'R0lGODlhFAAQAPf/AAAAAAAAANwoKPrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHvrcHgD/ACH/C05FVFNDQVBFMi4wAwEAAAAh+QQJGQADACwAAAAAEAAQAIEAAADcKCj63B4A/wAITQAHCBwQoKDBggMTEjxoUOFAhg0dLoSY8CCAixgvQiyYMePGAB0xfgypcaOAkyhPfkyZciVLlSZfCjhYMaJAmg9tTgxQE2FOnzd1HgwIACH5BAkZAP8ALAAAAAAUABAAAAhXAP8J/CegoMGCAxMqPHhQoUOCDBE+TBhRosODADJqzNhwIMaNGjsK/AgSgEiIBUtyNEjR4ICXMF+ePBgz5kyXNWWy9Igz58mJNy0u3DmS6FChP3kiNRgQADs='

// new resting.png (sitting Pikachu, drawn 10x, 250x260) saved as a GIF.
const REST_GIF = 'R0lGODlh+gAEAff/MQAAAAAAAF1dXcqcAO0cJP/JDv/yAP///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wD/ACH/C05FVFNDQVBFMi4wAwEAAAAh+QQJBAAHACweAB4AvgDIAIIAAABdXV3KnADtHCT/yQ7/8gD///8A/wAI/wAPCBxIsKDBgwgTFgTAsKHDhw8VSpxIsaJFixAdXtzIsWPGjxE7ihxJ8iBIACVTljx5UqXLlxNb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'

describe('GIF decoding', () => {
  test('reads every frame, sized to the logical screen', () => {
    const gif = decodeGif(base64ToBytes(TINY_GIF))
    expect(gif.width).toBe(20)
    expect(gif.height).toBe(16)
    expect(gif.frames.length).toBe(2)
    expect(gif.frames[0]![0]).toBe(-1) // transparent corner
  })
  test('reads each frame\'s delay in milliseconds', () => {
    expect(decodeGif(base64ToBytes(TINY_GIF)).delays).toEqual([250, 250])
  })
  test('rejects a GIF over the pixel budget before decoding the rest', () => {
    // TINY_GIF is 20x16 (320 pixels a frame) with 2 frames.
    expect(() => decodeGif(base64ToBytes(TINY_GIF), 100)).toThrow('too large')
    expect(() => decodeGif(base64ToBytes(TINY_GIF), 500)).toThrow('too large')
    expect(decodeGif(base64ToBytes(TINY_GIF), 640).frames.length).toBe(2)
  })
  test('rejects a file that is not a GIF', () => {
    expect(() => decodeGif(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toThrow('not a GIF')
  })
})

describe('turning a GIF into a pet', () => {
  test('detects the pixel-art scale', () => {
    expect(detectScale(decodeGif(base64ToBytes(TINY_GIF)))).toBe(4)
    expect(detectScale(decodeGif(base64ToBytes(REST_GIF)))).toBe(10)
  })
  test('undoes the scale, crops across frames, and recolors pure black', () => {
    const sprite = gifToSprite(base64ToBytes(TINY_GIF))
    expect(sprite.frames.length).toBe(2)
    expect(sprite.frames[0]!.length).toBe(4)
    expect(sprite.frames[0]![0]!.length).toBe(5)
    expect(Object.values(sprite.palette)).toContain(0x4a4a5e)
    expect(Object.values(sprite.palette)).not.toContain(0)
  })
  test('keeps real 10x pixel art lossless, back to its native size', () => {
    const sprite = gifToSprite(base64ToBytes(REST_GIF))
    expect(sprite.frames[0]![0]!.length).toBe(19)
    expect(sprite.frames[0]!.length).toBe(20)
  })
  test('shrinks frames taller than the limit', () => {
    const sprite = gifToSprite(base64ToBytes(REST_GIF), 10)
    expect(sprite.frames[0]!.length).toBe(10)
  })
  test('keeps the GIF\'s frame delays on the sprite', () => {
    expect(gifToSprite(base64ToBytes(TINY_GIF)).delays).toEqual([250, 250])
  })
  test('builds a pet from a walking and a resting GIF', () => {
    const pet = gifsToPet(base64ToBytes(TINY_GIF), base64ToBytes(REST_GIF))
    expect(pet.walk.frames.length).toBe(2)
    expect(pet.lie.frames.length).toBe(1)
  })
})
