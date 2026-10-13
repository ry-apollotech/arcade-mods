// One pet: a working animation and a resting pose, each a list of frames.
// A frame is rows of characters; each character names a color in the sprite's palette, '.' is empty.
export type PetSprite = { frames: string[][]; palette: Record<string, number> }
export type Pet = { walk: PetSprite; lie: PetSprite }
