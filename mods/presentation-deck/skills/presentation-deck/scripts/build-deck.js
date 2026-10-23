// Presentation deck builder: a JSON outline in, a themed 16:9 .pptx out (pptxgenjs).
// Usage: node build-deck.js <outline.json> [out.pptx]
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const md = require("react-icons/md");

const DEFAULT_THEME = {
  font: "Calibri",
  dark: "17302D",      // dark slide background, body text
  light: "FFFFFF",     // content slide background
  card: "EAF4F2",      // card fill
  accent: "00796B",    // icon circles, stat values, live labels
  highlight: "F2A93B", // step numbers, emphasis
  secondary: "26A69A", // arrows
  muted: "5C7D79",     // secondary text, footer
  soft: "B9E0DA",      // subtitle on dark slides, timeline
};

const W = 9.0, LEFT = 0.5, GAP = 0.23; // usable width, left margin, gap between cards

// ---------- validation ----------
function fail(where, msg) { throw new Error(`${where}: ${msg}`); }

function need(obj, key, where, kind = "string") {
  const v = obj[key];
  const ok = kind === "array" ? Array.isArray(v) && v.length > 0 : typeof v === kind && v !== "";
  if (!ok) fail(where, `"${key}" must be a non-empty ${kind}`);
  return v;
}

function validate(outline) {
  if (!outline || typeof outline !== "object") fail("outline", "must be a JSON object");
  need(outline, "title", "outline");
  need(outline, "sections", "outline", "array").forEach((sec, i) => {
    const where = `sections[${i}]`;
    need(sec, "title", where);
    need(sec, "slides", where, "array").forEach((sl, j) => {
      const w = `${where}.slides[${j}]`;
      if (!LAYOUTS[sl.type]) fail(w, `unknown type "${sl.type}"; use one of ${Object.keys(LAYOUTS).join(", ")}`);
      need(sl, "title", w);
      for (const key of LAYOUTS[sl.type].needs) need(sl, key, w, key === "image" ? "string" : "array");
    });
  });
}

// ---------- drawing helpers ----------
function makeKit(pres, T, baseDir) {
  async function iconData(name, color, size = 256) {
    const Comp = md[name];
    if (!Comp) throw new Error(`unknown icon "${name}"; use a Material Design name from react-icons/md, e.g. MdBolt`);
    const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size }));
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    return "image/png;base64," + buf.toString("base64");
  }
  async function iconCircle(slide, name, x, y, d, bg, fg) {
    slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: bg }, line: { color: bg } });
    const p = d * 0.22;
    slide.addImage({ data: await iconData(name, fg), x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p });
  }
  // A screenshot in a dark rounded frame, fitted inside w x maxH; returns the drawn height.
  async function image(slide, file, x, y, w, maxH = 3.4) {
    const full = path.resolve(baseDir, file);
    if (!fs.existsSync(full)) throw new Error(`image not found: ${full}`);
    const { width, height } = await sharp(full).metadata();
    let iw = w, ih = w * (height / width);
    if (ih > maxH) { ih = maxH; iw = ih * (width / height); }
    const ix = x + (w - iw) / 2, pad = 0.09;
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: ix - pad, y: y - pad, w: iw + 2 * pad, h: ih + 2 * pad, rectRadius: 0.12,
      fill: { color: T.dark }, line: { color: T.dark },
      shadow: { type: "outer", color: "000000", opacity: 0.25, blur: 8, offset: 3, angle: 90 },
    });
    slide.addImage({ path: full, x: ix, y, w: iw, h: ih });
    return ih;
  }
  function text(slide, t, o) {
    slide.addText(t, { isTextBox: true, margin: 0, color: T.dark, fontSize: 14, fontFace: T.font, ...o });
  }
  function bullets(slide, items, o) {
    slide.addText(items.map((s, i) => ({ text: s, options: { bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: 6 } })),
      { isTextBox: true, margin: 0, color: T.dark, fontSize: 14, fontFace: T.font, valign: "top", ...o });
  }
  function card(slide, x, y, w, h) {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: T.card }, line: { color: T.card } });
  }
  function badge(slide, label, x, y, w, h, fill, color, fontSize = 15) {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: fill } });
    text(slide, label, { x, y, w, h, fontSize, bold: true, align: "center", valign: "middle", color });
  }
  const columns = (n) => { const w = (W - GAP * (n - 1)) / n; return { w, x: (i) => LEFT + i * (w + GAP) }; };
  return { iconCircle, image, text, bullets, card, badge, columns, shapes: pres.shapes };
}

// ---------- slide layouts ----------
// Each layout: { master, needs: required array/image fields, draw(slide, data, kit, T) }
const LAYOUTS = {
  // Dark opener or closer: title, optional subtitle and image on the right.
  title: { master: "DARK", needs: [], async draw(s, d, k) {
    s.addText(d.title, { placeholder: "title" });
    if (d.subtitle) s.addText(d.subtitle, { placeholder: "body" });
    if (d.image) await k.image(s, d.image, 5.55, 1.45, 4.0);
  } },

  // A row of 2-5 cards: icon, heading, text.
  cards: { master: "CONTENT", needs: ["items"], async draw(s, d, k, T) {
    const n = d.items.length, { w, x } = k.columns(n), small = n > 3;
    for (let i = 0; i < n; i++) {
      const it = d.items[i], cx = x(i), pad = small ? 0.12 : 0.3;
      k.card(s, cx, 1.35, w, 3.45);
      if (it.icon) await k.iconCircle(s, it.icon, cx + pad, 1.6, small ? 0.65 : 0.75, i % 2 && d.alternate ? T.accent : T.highlight, T.dark);
      k.text(s, it.heading || "", { x: cx + pad, y: 2.5, w: w - 2 * pad, h: 0.75, fontSize: small ? 15 : 18, bold: true, valign: "top" });
      k.text(s, it.text || "", { x: cx + pad, y: 3.3, w: w - 2 * pad, h: 1.4, fontSize: small ? 12 : 14, color: T.muted, valign: "top" });
    }
  } },

  // 2x2 icon grid on the left, optional image on the right.
  grid: { master: "CONTENT", needs: ["items"], async draw(s, d, k, T) {
    const cw = d.image ? 2.55 : 4.6;
    for (let i = 0; i < Math.min(d.items.length, 4); i++) {
      const it = d.items[i], x = LEFT + (i % 2) * cw, y = 1.25 + Math.floor(i / 2) * 2.0;
      if (it.icon) await k.iconCircle(s, it.icon, x, y, 0.65, T.accent, T.light);
      k.text(s, it.heading || "", { x, y: y + 0.75, w: cw - 0.2, h: 0.35, fontSize: 18, bold: true });
      k.text(s, it.text || "", { x, y: y + 1.1, w: cw - 0.2, h: 0.8, fontSize: 13, color: T.muted, valign: "top" });
    }
    if (d.image) await k.image(s, d.image, 5.85, 1.5, 3.6);
  } },

  // Image on the left, bullets on the right.
  "image-bullets": { master: "CONTENT", needs: ["image", "bullets"], async draw(s, d, k) {
    await k.image(s, d.image, 0.6, 1.35, 5.2);
    k.bullets(s, d.bullets, { x: 6.25, y: 1.4, w: 3.25, h: 3.4 });
  } },

  // Two images side by side, each with a caption.
  "two-images": { master: "CONTENT", needs: ["images"], async draw(s, d, k) {
    for (let i = 0; i < Math.min(d.images.length, 2); i++) {
      const im = d.images[i], x = i ? 5.2 : 0.6;
      await k.image(s, im.file, x, 1.4, 4.2, 2.6);
      if (im.caption) k.text(s, im.caption, { x, y: 4.2, w: 4.2, h: 0.6, fontSize: 14, bold: true, valign: "top" });
    }
  } },

  // Optional image on the left, numbered steps on the right (3-4 steps).
  steps: { master: "CONTENT", needs: ["steps"], async draw(s, d, k, T) {
    const x0 = d.image ? 5.65 : LEFT, tw = d.image ? 3.15 : 8.3;
    if (d.image) await k.image(s, d.image, 0.6, 1.35, 4.6);
    const gap = d.steps.length > 3 ? 0.9 : 1.18;
    d.steps.forEach((st, i) => {
      const y = 1.35 + i * gap;
      k.badge(s, String(i + 1), x0, y, 0.55, 0.55, T.highlight, T.dark, 20);
      k.text(s, st.heading || "", { x: x0 + 0.7, y: y - 0.02, w: tw, h: 0.35, fontSize: 18, bold: true });
      k.text(s, st.text || "", { x: x0 + 0.7, y: y + 0.33, w: tw, h: 0.55, fontSize: 13, color: T.muted, valign: "top" });
    });
  } },

  // Vertical icon list on the left, optional image on the right.
  "icon-list": { master: "CONTENT", needs: ["items"], async draw(s, d, k, T) {
    const tw = d.image ? 3.6 : 7.9, gap = d.items.length > 4 ? 0.78 : 0.95;
    for (let i = 0; i < d.items.length; i++) {
      const it = d.items[i], y = 1.3 + i * gap;
      if (it.icon) await k.iconCircle(s, it.icon, LEFT, y, 0.6, T.accent, T.light);
      k.text(s, it.heading || "", { x: 1.3, y: y - 0.02, w: tw, h: 0.32, fontSize: 16, bold: true });
      k.text(s, it.text || "", { x: 1.3, y: y + 0.3, w: tw, h: 0.45, fontSize: 13, color: T.muted, valign: "top" });
    }
    if (d.image) await k.image(s, d.image, 5.4, 1.45, 4.0);
  } },

  // Left-to-right flow of 3-5 cards joined by arrows; the last one highlighted.
  flow: { master: "CONTENT", needs: ["items"], async draw(s, d, k, T) {
    const n = d.items.length, { w, x } = k.columns(n);
    for (let i = 0; i < n; i++) {
      const it = d.items[i], cx = x(i), last = i === n - 1;
      k.card(s, cx, 1.45, w, 2.85);
      if (it.icon) await k.iconCircle(s, it.icon, cx + (w - 0.75) / 2, 1.7, 0.75, last ? T.highlight : T.accent, last ? T.dark : T.light);
      k.text(s, it.heading || "", { x: cx + 0.15, y: 2.6, w: w - 0.3, h: 0.6, fontSize: 16, bold: true, align: "center", valign: "top" });
      k.text(s, it.text || "", { x: cx + 0.15, y: 3.25, w: w - 0.3, h: 1.0, fontSize: 12, color: T.muted, align: "center", valign: "top" });
      if (!last) s.addShape(k.shapes.CHEVRON, { x: cx + w + 0.02, y: 2.72, w: 0.19, h: 0.3, fill: { color: T.secondary }, line: { color: T.secondary } });
    }
  } },

  // Big numbers: 2-4 cards with a value and a line of text.
  stats: { master: "CONTENT", needs: ["items"], async draw(s, d, k, T) {
    const { w, x } = k.columns(d.items.length);
    d.items.forEach((it, i) => {
      k.card(s, x(i), 1.45, w, 2.85);
      k.text(s, it.value || "", { x: x(i) + 0.25, y: 1.7, w: w - 0.5, h: 1.0, fontSize: 40, bold: true, color: T.accent });
      k.text(s, it.text || "", { x: x(i) + 0.25, y: 2.8, w: w - 0.5, h: 1.4, fontSize: 14, valign: "top" });
    });
  } },

  // 2-4 labelled columns of bullets, e.g. Live / In testing / Planned.
  columns: { master: "CONTENT", needs: ["columns"], async draw(s, d, k, T) {
    const { w, x } = k.columns(d.columns.length), fills = [T.accent, T.highlight, T.muted, T.secondary];
    d.columns.forEach((c, i) => {
      const fill = c.color || fills[i % fills.length];
      k.card(s, x(i), 1.45, w, 2.95);
      k.badge(s, c.label || "", x(i) + 0.25, 1.7, w - 0.5, 0.45, fill, fill === T.highlight ? T.dark : T.light);
      k.bullets(s, c.bullets || [], { x: x(i) + 0.25, y: 2.35, w: w - 0.45, h: 1.95, fontSize: 13 });
    });
  } },

  // Numbered milestones on a line; the last one highlighted.
  timeline: { master: "CONTENT", needs: ["items"], async draw(s, d, k, T) {
    const n = d.items.length, { w, x } = k.columns(n);
    s.addShape(k.shapes.LINE, { x: LEFT + w / 2, y: 2.05, w: W - w, h: 0, line: { color: T.soft, width: 3 } });
    d.items.forEach((it, i) => {
      const last = i === n - 1, cx = x(i) + (w - 0.7) / 2;
      s.addShape(k.shapes.OVAL, { x: cx, y: 1.7, w: 0.7, h: 0.7, fill: { color: last ? T.highlight : T.accent }, line: { color: T.light, width: 3 } });
      k.text(s, String(i + 1), { x: cx, y: 1.7, w: 0.7, h: 0.7, fontSize: 22, bold: true, align: "center", valign: "middle", color: last ? T.dark : T.light });
      k.text(s, it.heading || "", { x: x(i), y: 2.6, w, h: 0.4, fontSize: 16, bold: true, align: "center" });
      k.text(s, it.text || "", { x: x(i), y: 3.05, w, h: 1.3, fontSize: 13, color: T.muted, align: "center", valign: "top" });
    });
  } },
};
LAYOUTS.closing = LAYOUTS.title;

function defineMasters(p, T, footer) {
  p.defineSlideMaster({
    title: "DARK",
    background: { color: T.dark },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 1.55, w: 4.5, h: 1.5, fontFace: T.font,
          fontSize: 40, bold: true, color: T.light, valign: "bottom", align: "left", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.6, y: 3.15, w: 4.5, h: 1.2, fontFace: T.font,
          fontSize: 18, color: T.soft, valign: "top", margin: 0 }, text: "" } },
    ],
  });
  p.defineSlideMaster({
    title: "CONTENT",
    background: { color: T.light },
    margin: [0.5, 0.5, 0.5, 0.5],
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.3, w: 9.0, h: 0.75, fontFace: T.font,
          fontSize: 30, bold: true, color: T.dark, valign: "middle", align: "left", margin: 0 }, text: "" } },
      ...(footer ? [{ text: { text: footer, options: { x: 0.5, y: 5.22, w: 5, h: 0.25, fontSize: 10, fontFace: T.font,
          color: T.muted, margin: 0, isTextBox: true } } }] : []),
    ],
    slideNumber: { x: 9.0, y: 5.22, w: 0.5, h: 0.25, fontSize: 10, color: T.muted, align: "right" },
  });
}

async function buildDeck(outline, { baseDir = process.cwd(), out } = {}) {
  validate(outline);
  const T = { ...DEFAULT_THEME, ...(outline.theme || {}) };
  const p = new pptxgen();
  p.layout = "LAYOUT_16x9"; // 10 x 5.625 in
  p.title = outline.title;
  if (outline.author) p.author = outline.author;
  p.theme = { headFontFace: T.font, bodyFontFace: T.font };
  defineMasters(p, T, outline.footer);
  const kit = makeKit(p, T, baseDir);
  let count = 0;
  for (const sec of outline.sections) {
    p.addSection({ title: sec.title });
    for (const d of sec.slides) {
      const layout = LAYOUTS[d.type];
      const slide = p.addSlide({ masterName: layout.master, sectionTitle: sec.title });
      if (layout.master === "CONTENT") slide.addText(d.title, { placeholder: "title" });
      await layout.draw(slide, d, kit, T);
      if (d.notes) slide.addNotes(d.notes);
      count++;
    }
  }
  if (out) await p.writeFile({ fileName: out });
  return { pres: p, slides: count };
}

module.exports = { buildDeck, validate, LAYOUTS: Object.keys(LAYOUTS), DEFAULT_THEME };

if (require.main === module) {
  const [src, dest] = process.argv.slice(2);
  if (!src) { console.error("usage: node build-deck.js <outline.json> [out.pptx]"); process.exit(2); }
  const outline = JSON.parse(fs.readFileSync(src, "utf8"));
  const out = path.resolve(dest || src.replace(/\.json$/i, "") + ".pptx");
  buildDeck(outline, { baseDir: path.dirname(path.resolve(src)), out })
    .then(({ slides }) => console.log(`wrote ${out} (${slides} slides)`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
