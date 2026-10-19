// One pet: a working animation and a resting pose, each a list of frames.
// A frame is rows of characters; each character names a color in the sprite's palette, '.' is empty.
// delays (from a GIF) is how long each frame shows, in milliseconds; without it a frame lasts one animation step.
export type PetSprite = { frames: string[][]; palette: Record<string, number>; delays?: number[] }
// large, when present, is a taller copy for the pet pane; the score band always draws walk and lie.
export type Pet = { walk: PetSprite; lie: PetSprite; large?: { walk: PetSprite; lie: PetSprite } }
