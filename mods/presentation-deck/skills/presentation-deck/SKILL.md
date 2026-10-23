---
name: presentation-deck
description: Build a themed 16:9 PowerPoint (.pptx) presentation deck from a JSON outline - product overviews, sales decks, project updates, pitch or demo decks. Use when the user asks for a deck, slides or a presentation as a .pptx file, optionally with app screenshots.
---

# Presentation deck

Builds a .pptx from a JSON outline with `${CLAUDE_SKILL_DIR}/scripts/build-deck.js`: a dark title slide,
content slides with a footer and slide numbers, sections, speaker notes, icon circles, cards and
framed screenshots.

## 1. Install once

```sh
npm install --prefix "${CLAUDE_SKILL_DIR}/scripts" --no-audit --no-fund
```

Needs Node 18+. Run it again after the plugin updates if `require` fails.

## 2. Write the outline

Ask what the deck is for, who will see it, and which screenshots exist, then write `outline.json`
next to the images (image paths are relative to the outline). Start from
`${CLAUDE_SKILL_DIR}/examples/outline.json`, which uses every slide type.

```json
{
  "title": "Deck title", "author": "Team", "footer": "Shown bottom-left on content slides",
  "theme": { "font": "Calibri", "accent": "00796B" },
  "sections": [ { "title": "Why", "slides": [ { "type": "title", "title": "...", "notes": "..." } ] } ]
}
```

Every slide has `type` and `title`, and may have `notes` (speaker notes).

| type | fields | use for |
|---|---|---|
| `title`, `closing` | `subtitle`, `image` | dark opener and closer |
| `cards` | `items` (2-5): `icon`, `heading`, `text` | problems, benefits, options |
| `grid` | `items` (4), `image` | four pillars beside a screenshot |
| `image-bullets` | `image`, `bullets` (3-5) | one screen explained |
| `two-images` | `images` (2): `file`, `caption` | before/after, two screens |
| `steps` | `steps` (3-4): `heading`, `text`, `image` | a numbered process |
| `icon-list` | `items` (3-5), `image` | features or controls |
| `flow` | `items` (3-5) | A to B to C, joined by arrows |
| `stats` | `items` (2-4): `value`, `text` | big numbers |
| `columns` | `columns` (2-4): `label`, `bullets`, `color` | status: live / testing / planned |
| `timeline` | `items` (3-5): `heading`, `text` | rollout milestones |

The list field of each type (`items`, `bullets`, `images`, `steps`, `columns`) is required; `image`
is required for `image-bullets` and optional elsewhere. Icons are Material Design names from `react-icons/md`, e.g. `MdBolt`, `MdPayments`,
`MdSync` (browse at https://react-icons.github.io/react-icons/icons/md/).

Theme keys (6-digit hex, no `#`): `dark`, `light`, `card`, `accent`, `highlight`, `secondary`,
`muted`, `soft`, plus `font`. Omitted keys keep the default teal and amber palette.

Writing guidance: one idea per slide, a title that states the point ("Bills payment without a second
system", not "Bills payment"), at most about 25 words of body text, and the detail in `notes`. Be
precise about status: don't present planned work as live.

## 3. Build and check

```sh
node "${CLAUDE_SKILL_DIR}/scripts/build-deck.js" outline.json deck.pptx
```

Errors name the slide and field that is wrong, e.g. `sections[1].slides[2]: unknown type "pie"`.

On Windows or WSL with PowerPoint installed, render every slide to PNG and look at them before
handing the deck over:

```sh
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "${CLAUDE_SKILL_DIR}/scripts/render-preview.ps1")" -Deck "$(wslpath -w deck.pptx)" -OutDir "$(wslpath -w preview)"
```

Check for text that overflows its box, and for long titles that wrap to two lines; shorten the text
rather than shrinking fonts.
