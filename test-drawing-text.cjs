const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
global.crypto = require('node:crypto').webcrypto;
const core = require('./drawing-text-core.js'), ctx = { window: {}, crypto };
vm.runInNewContext(fs.readFileSync(__dirname + '/detectors.js', 'utf8'), ctx);
const api = ctx.window.detectorData;
const t = (str, x, y, extra = {}) => ({ str, x, y, h: 10, w: str.length * 5.5, dx: 1, dy: 0, ...extra });

// Cover sheet: table rows and legend
const cover = core.readCover([
  t('Teckenförklaring', 10, 20), t('Rökdetektor optisk', 10, 40), t('Värmedetektor', 10, 60), t('Larmknapp', 10, 80),
  t('Sektion', 10, 120), t('Adress', 80, 120), t('Typ', 150, 120), t('Placering', 260, 120),
  t('12', 10, 140), t('01.001', 80, 140), t('Rök', 150, 140), t('Trapphus plan 1', 260, 140),
  t('12', 10, 160), t('01.002', 80, 160), t('Värme', 150, 160), t('Kök', 260, 160),
  t('Sektion 13', 10, 180), t('01.003', 80, 180), t('Larmknapp', 150, 180), t('Entré', 260, 180),
]);
assert.deepEqual(cover.legend.sort(), ['Larmknapp', 'Rökdetektor', 'Värmedetektor']);
assert.deepEqual(cover.table.get('1.1'), { slinga: '01', adress: '001', sektion: '12', typ: 'Rökdetektor', placering: 'Trapphus plan 1' });
assert.equal(cover.table.get('1.2').typ, 'Värmedetektor');
assert.equal(cover.table.get('1.2').placering, 'Kök');
assert.equal(cover.table.get('1.3').sektion, '13');
assert.equal(cover.table.get('1.3').typ, 'Larmknapp');

// Drawing page: labels, split text items, rotated text, dimensions ignored, nearest section
const page = core.readPage([
  t('SEKTION 12', 100, 100), t('01.001', 120, 200), t('01', 400, 200), t('.', 411, 200), t('004', 416, 200),
  t('R 01.005', 150, 260), t('2.400 mm', 300, 300), t('12.500', 300, 320), t('01.300', 300, 340),
  t('01.006', 700, 500, { dx: 0, dy: -1 }), t('Sek 14', 650, 520),
], 1000, 800);
const by = (a) => page.labels.find((l) => l.adress === a);
assert.deepEqual(page.labels.map((l) => l.slinga + '.' + l.adress).sort(), ['01.001', '01.004', '01.005', '01.006']);
assert.ok(Math.abs(by('001').x - (120 + 16.5) / 1000) < 0.01 && Math.abs(by('001').y - (200 - 3.5) / 800) < 0.01);
assert.ok(Math.abs(by('004').x - 0.4135) < 0.02, 'split items joined');
assert.equal(by('005').typ, 'Rökdetektor');
assert.equal(by('001').sektion, '12');
assert.equal(by('006').sektion, '14');
assert.ok(by('006').x > 0.69 && by('006').x < 0.72 && by('006').y < 500 / 800, 'rotated label');
assert.deepEqual(page.sections.sort(), ['12', '14']);

// Candidates: cover data wins, existing devices are linked, duplicates warned
const register = { devices: [{ id: 'old', central: '', slinga: '1', adress: '4', sektion: '9', typ: 'Rökdetektor', placering: 'Förråd', generation: 1 }], events: [] };
const dup = { page: 2, labels: [...page.labels, { ...page.labels[0] }] };
const { rows, warnings } = core.candidates([dup], cover, register, '', { typ: 'Rökdetektor', sektion: '' }, api);
assert.equal(rows.length, 4);
assert.equal(warnings.length, 1);
const r1 = rows.find((r) => r.adress === '001'), r4 = rows.find((r) => r.adress === '004'), r6 = rows.find((r) => r.adress === '006');
assert.equal(r1.placering, 'Trapphus plan 1');
assert.equal(r1.fromCover, true);
assert.equal(r4.existingId, 'old');
assert.equal(r4.sektion, '9');
assert.equal(r6.typ, 'Rökdetektor', 'default type');

// Writes: creates devices + pins, links existing, idempotent on rescan, never creates test events
const data = { facilities: JSON.stringify([{ id: 'f' }]), 'docs:f': JSON.stringify([{ id: 'doc' }]), 'docfile:doc': '"data:application/pdf;base64,x"', 'detectors:f': JSON.stringify(register) };
assert.ok(rows.every(r=>r.approved===false),'PDF labels are proposals only');
const reviewedRows=rows.map(r=>({...r,approved:true}));
const first = core.writes(data, 'f', 'doc', reviewedRows, '', api);
assert.equal(first.created, 3);
assert.equal(first.pinned, 4);
const reg = JSON.parse(first.writes['detectors:f']);
assert.equal(reg.devices.length, 4);
assert.equal(reg.events.length, 0);
assert.equal(api.address(reg.devices.find((d) => d.adress === '001'), ''), '01.001');
const again = core.writes({ ...data, ...first.writes }, 'f', 'doc', reviewedRows, '', api);
assert.equal(again.created, 0);
assert.equal(again.pinned, 0);
assert.equal(JSON.parse(again.writes['fieldwork:f']).pins.length, 4);
assert.throws(() => core.writes(data, 'f', 'doc', [{ ...r6, existingId: '', adress: '099', typ: '', approved: true }], '', api), /typ/);
assert.throws(() => core.writes(data, 'f', 'doc', [{ ...r6, existingId: '', adress: '099', sektion: '', approved: true }], '', api), /sektion/);
assert.throws(() => core.writes(data, 'f', 'doc', rows.map((r) => ({ ...r, approved: false })), '', api));

// Progress per SBF rule profile
const cov = { totalDevices: 120, totalSections: 20, quarter: { devices: 3, sections: 2 }, year: { devices: 10, sections: 20 } };
const adr = [{ adress: '001' }], conv = [{ adress: '', lokalId: 'D1' }];
// 110:8 with addresses: 2 % of detectors per quarter -> ceil(2.4) = 3
let p = core.progress(cov, { rule: 'auto' }, adr);
assert.equal(p.rule, '110-8-adr');
assert.equal(p.quarter.needed, 3);
assert.equal(p.quarter.met, true);
assert.equal(p.yearChecks[0].needed,10);
assert.equal(p.yearMet,true);
assert.equal(core.progress({ ...cov, year: {devices: 7,sections: 20} }, {rule:'110-8-adr'}, adr).yearMet,false);
assert.equal(core.progress({ ...cov, year: {devices: 0,sections: 0} }, {rule:'110-8-adr'}, adr).yearMet,false);
assert.equal(core.progress({ ...cov, quarter: { devices: 2, sections: 2 } }, { rule: 'auto' }, adr).quarter.met, false);
// small systems still need at least one detector
assert.equal(core.progress({ ...cov, totalDevices: 7 }, { rule: '110-8-adr' }).quarter.needed, 1);
// 110:8 without addresses: one detector in 10 % of sections, all sections per year
p = core.progress(cov, { rule: 'auto' }, conv);
assert.equal(p.rule, '110-8-sek');
assert.equal(p.quarter.needed, 2);
assert.equal(p.quarter.met, true);
assert.equal(p.yearChecks[0].needed, 20);
assert.equal(p.yearMet, true);
assert.equal(core.progress({ ...cov, year: { devices: 10, sections: 19 } }, { rule: '110-8-sek' }).yearMet, false);
// 110:7: 25 % of sections per quarter, 5 % detectors + all sections per year
p = core.progress(cov, { rule: '110-7' });
assert.equal(p.quarter.needed, 5);
assert.equal(p.quarter.met, false);
assert.deepEqual(p.yearChecks.map((y) => [y.basis, y.needed, y.met]), [['devices', 6, true], ['sections', 20, true]]);
// custom requirement and old saved goals without rule
assert.equal(core.progress(cov, { rule: 'custom', percent: 10, basis: 'devices' }).quarter.needed, 12);
assert.equal(core.progress(cov, { percent: 10, basis: 'sections' }).rule, 'custom');
assert.equal(core.progress({ ...cov, totalSections: 0, quarter: { devices: 0, sections: 0 } }, { rule: '110-8-sek' }).quarter.met, false);
assert.throws(() => core.progress(cov, { rule: 'custom', percent: 0 }));

// BL401 point 2.4 follows the drawing results unless answered manually
const ev = (status, note = '') => ({ id: status + note, kind: 'test', status, note, label: 'Sektion 1 · 01.001', device: { sektion: '1', slinga: '01', adress: '001' }, technician: 'K' });
const blank = { checks: { '2.4': { status: null, anm: '', kategori: '2', atgard: '', atgardad: '' } } };
let st = api.protocolState(blank, [ev('Provad – OK')], '');
assert.equal(st.checks['2.4'].status, 'ok');
assert.match(st.checks['2.4'].anm, /SBF 110:8 avsnitt 11.5.3/);
st = api.protocolState(st, [ev('Provad – OK'), ev('Provad – anmärkning', 'Smutsig')], '');
assert.equal(st.checks['2.4'].status, 'anm');
assert.match(st.checks['2.4'].anm, /01.001: Smutsig.*SBF 110:8/);
assert.equal(api.protocolState(st, [], '').checks['2.4'].status, null);
const manual = { checks: { '2.4': { status: 'ingar_ej', anm: 'Eget', kategori: '2' } } };
assert.deepEqual(api.protocolState(manual, [ev('Provad – anmärkning', 'x')], '').checks['2.4'], manual.checks['2.4']);
assert.equal(api.protocolState({}, [ev('Provad – OK')], '').checks, undefined);

console.log('PASS: cover sheet table and legend, address labels incl. split/rotated text, dimension filtering, nearest section, existing device linking, idempotent writes without test events, SBF 110:8 (with/without addresses) and 110:7 quarterly/yearly requirements, custom goal, BL401 point 2.4 auto-fill with rule reference.');
