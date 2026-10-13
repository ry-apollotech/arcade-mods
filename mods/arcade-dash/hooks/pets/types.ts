// One pet: a working animation and a resting pose, each a list of frames.
// A frame is rows of characters; each character names a color in the sprite's palette, '.' is empty.
// delays (from a GIF) is how long each frame shows, in milliseconds; without it a frame lasts one animation step.
export type PetSprite = { frames: string[][]; palette: Record<string, number>; delays?: number[] }
export type Pet = { walk: PetSprite; lie: PetSprite }
