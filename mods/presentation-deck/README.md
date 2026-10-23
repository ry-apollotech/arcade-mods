# presentation-deck

A Claude Code skill that builds a themed 16:9 PowerPoint deck from a JSON outline. Ask Claude for a
deck ("make a 10-slide product overview with these screenshots") and it writes the outline, builds
the .pptx, and on Windows/WSL renders the slides to PNG so it can check them.

Eleven slide types: `title` and `closing`, `cards`, `grid`, `image-bullets`, `two-images`, `steps`,
`icon-list`, `flow`, `stats`, `columns` and `timeline`. Every deck gets sections, speaker notes, a
footer, slide numbers, Material Design icons and framed screenshots. Colours and font come from
the outline's `theme`.

## Install

```
/plugin marketplace add ry-apollotech/arcade-mods
/plugin install presentation-deck@arcade-mods
```

The first time, Claude installs the Node dependencies (pptxgenjs, sharp, react-icons) into the
skill's `scripts` folder. Needs Node 18+. The PNG preview needs PowerPoint on Windows.

## Use without Claude

```sh
cd skills/presentation-deck/scripts && npm install
node build-deck.js ../examples/outline.json example.pptx
```

See [SKILL.md](skills/presentation-deck/SKILL.md) for the outline format and
[examples/outline.json](skills/presentation-deck/examples/outline.json) for every slide type.

## Develop

```sh
npm test --prefix skills/presentation-deck/scripts
claude plugin validate .
```

## License

MIT. The example screenshots are generated placeholders.
