const assert = require('node:assert/strict');
const view = require('./drawing-view.js'), ocr = require('./drawing-ocr-core.js'), text = require('./drawing-text-core.js');
const near = (a, b) => Math.abs(a - b) < 1e-9;

// View turn: point -> view -> point round trip for every turn
for (const r of [0, 90, 180, 270])
  for (const [x, y] of [[0.1, 0.2], [0.9, 0.05], [0.5, 0.5]]) {
    const v = view.toView(r, x, y), back = view.fromView(r, v.X, v.Y);
    assert.ok(near(back.x, x) && near(back.y, y), `round trip ${r}`);
  }
// a quarter turn clockwise: the top left corner goes to the top right
assert.deepEqual(view.toView(90, 0, 0), { X: 1, Y: 0 });
assert.deepEqual(view.toView(270, 0, 0), { X: 0, Y: 1 });
// layout: a landscape page turned a quarter becomes portrait, layers keep their own size
const l = view.layout(90, 200, 100);
assert.equal(l.ar, 0.5);
assert.equal(l.cw, '200%');
assert.equal(l.ch, '50%');
assert.equal(view.layout(0, 200, 100), null);
assert.equal(view.layout(180, 200, 100).ar, 2);

// Reading direction from the PDF text layer (screen coordinates, y down)
const dirs = (a, b, n) => Array.from({ length: 10 }, () => ({ a, b, n }));
assert.equal(ocr.rotationFromText(dirs(1, 0, 5)), 0); // left to right: already readable
assert.equal(ocr.rotationFromText(dirs(0, -1, 5)), 90); // bottom to top: turn a quarter clockwise
assert.equal(ocr.rotationFromText(dirs(-1, 0, 5)), 180); // upside down
assert.equal(ocr.rotationFromText(dirs(0, 1, 5)), 270); // top to bottom
assert.equal(ocr.rotationFromText([...dirs(0, -1, 5), ...dirs(1, 0, 1)]), 90, 'majority of characters wins');
assert.equal(ocr.rotationFromText(dirs(1, 0, 1)), null, 'too little text to decide');
// OCR scores
assert.equal(ocr.bestRotation({ 0: 3, 90: 40, 270: 2 }), 90);
assert.equal(ocr.scoreWords([{ text: 'PLAN', conf: 90 }, { text: '01.007', conf: 80 }, { text: 'x7', conf: 99 }, { text: 'KONTOR', conf: 20 }]), 2);

// Label box sizes: text layer (horizontal and vertical labels) and OCR
const items = [
  { str: '01.007', x: 100, y: 100, w: 30, h: 6, dx: 1, dy: 0 },
  { str: '01.008', x: 300, y: 400, w: 30, h: 6, dx: 0, dy: -1 },
];
const page = text.readPage(items, 1000, 500);
const h0 = page.labels.find((x) => x.adress === '007'), v0 = page.labels.find((x) => x.adress === '008');
assert.ok(Math.abs(h0.w - 0.03) < 0.002 && Math.abs(h0.h - 6 / 500) < 0.001, 'horizontal box');
assert.ok(Math.abs(v0.w - 0.006) < 0.001 && Math.abs(v0.h - 30 / 500) < 0.004, 'vertical box');
const o = ocr.readLabels([{ words: [{ text: '01.007', conf: 90, x0: 0.1, x1: 0.13, y0: 0.2, y1: 0.205 }] }]).labels[0];
assert.ok(near(o.w, 0.03) && near(o.h, 0.005), 'OCR box');

console.log('PASS: view turns and click mapping, layout sizes, text-layer and OCR reading direction, label box sizes.');
