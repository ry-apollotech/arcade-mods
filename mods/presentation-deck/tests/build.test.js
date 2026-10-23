// Run with: npm test --prefix skills/presentation-deck/scripts
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createRequire } = require("module");

const SCRIPTS = path.join(__dirname, "../skills/presentation-deck/scripts");
const EXAMPLES = path.join(__dirname, "../skills/presentation-deck/examples");
const { buildDeck, validate, LAYOUTS } = require(path.join(SCRIPTS, "build-deck.js"));
const JSZip = createRequire(path.join(SCRIPTS, "package.json"))("jszip");

const example = () => JSON.parse(fs.readFileSync(path.join(EXAMPLES, "outline.json"), "utf8"));
const tmpOut = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deck-")), "example.pptx");
const slideFiles = (zip) => Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));

test("the example builds one slide per outline entry and uses every layout", async () => {
  const outline = example();
  const out = tmpOut();
  const { slides } = await buildDeck(outline, { baseDir: EXAMPLES, out });
  const zip = await JSZip.loadAsync(fs.readFileSync(out));
  assert.strictEqual(slideFiles(zip).length, slides);
  assert.strictEqual(slides, outline.sections.flatMap((s) => s.slides).length);
  const used = new Set(outline.sections.flatMap((s) => s.slides.map((sl) => sl.type)));
  assert.deepStrictEqual([...LAYOUTS].sort(), [...used].sort());
});

test("titles, footer and speaker notes land in the file", async () => {
  const out = tmpOut();
  await buildDeck(example(), { baseDir: EXAMPLES, out });
  const zip = await JSZip.loadAsync(fs.readFileSync(out));
  const xmlFiles = Object.keys(zip.files).filter((f) => f.endsWith(".xml"));
  const xml = (await Promise.all(xmlFiles.map((f) => zip.file(f).async("string")))).join("");
  for (const s of ["The problem we solve", "From sign-up to live", "Name the pain before the product."]) assert.ok(xml.includes(s), s);
});

test("bad outlines fail with the field that is wrong", () => {
  const deck = (slide) => ({ title: "x", sections: [{ title: "s", slides: [slide] }] });
  assert.throws(() => validate({ title: "x", sections: [] }), /"sections" must be a non-empty array/);
  assert.throws(() => validate(deck({ type: "pie", title: "t" })), /slides\[0\]: unknown type "pie"/);
  assert.throws(() => validate(deck({ type: "image-bullets", title: "t", bullets: ["a"] })), /"image" must be/);
});

test("a missing image or unknown icon names the culprit", async () => {
  const deck = (slide) => ({ title: "x", sections: [{ title: "s", slides: [slide] }] });
  await assert.rejects(buildDeck(deck({ type: "title", title: "t", image: "nope.png" }), { baseDir: EXAMPLES }), /image not found: .*nope\.png/);
  await assert.rejects(buildDeck(deck({ type: "grid", title: "t", items: [{ icon: "MdNotAThing" }] }), { baseDir: EXAMPLES }), /unknown icon "MdNotAThing"/);
});
