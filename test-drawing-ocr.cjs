const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
global.crypto = require('node:crypto').webcrypto;
const ocr = require('./drawing-ocr-core.js'), text = require('./drawing-text-core.js'), ctx = { window: {}, crypto };
vm.runInNewContext(fs.readFileSync(__dirname + '/detectors.js', 'utf8'), ctx);
const api = ctx.window.detectorData;
const w = (t, x, y, conf = 90, horizontal = true) => ({ text: t, conf, x0: x, x1: x + (horizontal ? 0.03 : 0.005), y0: y, y1: y + (horizontal ? 0.005 : 0.03) });

// OCR confusions in numbers
assert.equal(ocr.digits('0L.2O1'), '01.201');
assert.equal(ocr.digits('01,028-01,030'), '01.028-01.030');
assert.equal(ocr.digits('SEKTION'), 'SEKTION');

// Labels: single, stacked tokens, vertical boxes, legend lines with text after the address
const read = ocr.readLabels([
  { words: [w('01.007', 0.1, 0.1)] },
  { words: [w('0L.008', 0.2, 0.1, 80, false)] },
  { words: [w('01.23201.23201.233', 0.3, 0.3, 40)] },
  { words: [w('01.204', 0.05, 0.9), w('FLÄKTSTYRNING', 0.09, 0.9)] },
  { words: [w('X', 0.6, 0.6), w('01.003', 0.62, 0.6), w('X', 0.66, 0.6), w('VD', 0.68, 0.6), w('PLACERAD', 0.7, 0.6), w('I', 0.75, 0.6), w('VENTILATIONSAGGREGAT', 0.76, 0.6)] },
  { words: [w('2.400', 0.5, 0.5), w('12.500', 0.5, 0.55), w('01.300', 0.5, 0.58)] },
]);
assert.deepEqual(read.labels.map((l) => l.address), ['01.007', '01.008', '01.232', '01.232', '01.233']);
assert.ok(Math.abs(read.labels[1].x - 0.2025) < 0.001 && read.labels[1].y > 0.1, 'vertical label position');
assert.ok(read.labels[2].x < read.labels[3].x && read.labels[3].x < read.labels[4].x, 'stacked labels spread over the box');
assert.deepEqual(read.legend.map((l) => [l.address, l.text]), [['01.204', 'FLÄKTSTYRNING'], ['01.003', 'X VD PLACERAD I VENTILATIONSAGGREGAT']]);

// Merge passes: same address near the same spot once, keep the best confidence
const merged = ocr.mergeLabels([
  { address: '01.007', x: 0.1, y: 0.1, conf: 50 },
  { address: '01.007', x: 0.104, y: 0.101, conf: 95 },
  { address: '01.007', x: 0.5, y: 0.5, conf: 70 },
]);
assert.equal(merged.length, 2);
assert.equal(merged[0].conf, 95);

// Section table: wrapped cells, lost dots, missing row leaves a gap in the numbering
const line = (t, cy, h = 40) => ({ cy, h, words: t.split(' ').map((x) => ({ text: x })) });
const table = ocr.parseSectionTable([
  line('om BRANDLARMSCENTRAL 01.007-01.014, 01208-01212, 01.223 PLAN 1', 480),
  line('El 01.023 (HISS) PLAN 1-2', 590),
  line('5 01.001-01.002, 01015-01016, 01.201, | po', 700),
  line('OPTISK 01.234-01,235', 728),
  line('SOCKEL 01.003-01.004, 01.027 PLAN 1', 808),
  line('02.010-02.014 PLAN 1-2', 1023),
]);
assert.deepEqual(table.map((r) => r.sektion), ['1', '2', '3', '4', '6']);
assert.deepEqual(table[0].ranges, [['01.007', '01.014'], ['01.208', '01.212'], ['01.223', '01.223']]);
assert.deepEqual(table[2].ranges.at(-1), ['01.234', '01.235']);
assert.equal(ocr.sectionOf('01.210', table), '1');
assert.equal(ocr.sectionOf('01.235', table), '3');
assert.equal(ocr.sectionOf('01.500', table), '');

// Edited text round trip
const edited = ocr.parseSections(ocr.formatSections(table) + '\n7: 01.231-01.233');
assert.equal(ocr.sectionOf('01.232', edited), '7');
assert.equal(ocr.sectionOf('01.008', edited), '1');
assert.throws(() => ocr.parseSections('01.001-01.002'), /sektionsnummer/);
assert.throws(() => ocr.parseSections('3: ingenting'), /Inga adresser/);

// Candidates: sections from the table, legend types, unknown addresses not preselected, existing linked
const register = { devices: [{ id: 'old', central: '', slinga: '01', adress: '008', sektion: '1', typ: 'Rökdetektor', placering: 'Kontor', generation: 1 }], events: [] };
const pages = [{ page: 2, labels: [...read.labels, { address: '01.003', x: 0.4, y: 0.4, conf: 90 }, { address: '07.006', x: 0.7, y: 0.7, conf: 43 }], legend: read.legend }];
const { rows, warnings } = ocr.candidates(pages, edited, register, { typ: 'Rökdetektor', sektion: '' }, api, text);
const by = (a) => rows.find((r) => r.slinga + '.' + r.adress === a);
assert.equal(by('01.007').sektion, '1');
assert.equal(by('01.007').approved, false);
assert.equal(by('01.008').existingId, 'old');
assert.equal(by('01.008').placering, 'Kontor');
assert.equal(by('01.232').sektion, '7');
assert.equal(by('01.003').typ, 'Värmedetektor');
assert.equal(by('01.003').placering, 'Placerad i ventilationsaggregat');
assert.equal(by('01.003').sektion, '4');
assert.equal(by('07.006').approved, false);
assert.match(by('07.006').flag, /sektionsförteckningen/);
assert.ok(warnings.some((x) => /01\.232 finns 2/.test(x)));
assert.equal(rows.filter((r) => r.slinga + '.' + r.adress === '01.204').length, 0, 'legend entry is not a pin');

// The rows can be saved with the shared writer
const data = { facilities: JSON.stringify([{ id: 'f' }]), 'docs:f': JSON.stringify([{ id: 'doc' }]), 'docfile:doc': '"data:application/pdf;base64,x"', 'detectors:f': JSON.stringify(register) };
assert.throws(()=>text.writes(data,'f','doc',rows,'',api),/Välj minst en/);
const reviewed=rows.map(r=>({...r,approved:!!r.sektion && r.fromCover && !r.inList}));
const saved = text.writes(data, 'f', 'doc', reviewed, '', api);
assert.equal(saved.created, reviewed.filter((r) => r.approved && !r.existingId).length);
assert.equal(JSON.parse(saved.writes['detectors:f']).events.length, 0);

console.log('PASS: OCR digit fixes, labels incl. vertical/stacked/legend lines, pass merging, section table with wraps/lost dots/missing row, edited table, candidates with sections/legend types/flags, saving.');
