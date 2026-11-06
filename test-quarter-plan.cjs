const assert = require('node:assert/strict');
const qp = require('./quarter-plan-core.js');

const dev = (id, sektion) => ({ id, sektion, adress: id, generation: 1 });
const test = (deviceId, date, status = 'Provad – OK', note = '') => ({
  id: deviceId + date + status, kind: 'test', deviceId, generation: 1, date, status, note, recordedAt: date + 'T10:00:00Z',
});
const devices = [dev('a', '1'), dev('b', '1'), dev('c', '2'), dev('d', '3'), dev('e', '4'), dev('f', '5'), dev('g', '10'), dev('h', '')];

// Plan: sections alternate between the quarters in numeric order, every section once a year
const plan = qp.planQuarters(devices);
assert.deepEqual(plan.byQuarter, { 1: ['1', '5'], 2: ['2', '10'], 3: ['3'], 4: ['4'] });
assert.equal(plan.rows.find((r) => r.section === '1').devices, 2);
assert.equal(plan.rows.length, 6, 'devices without a section are not planned');
// a hand-picked quarter is kept, the others keep their place
const saved = qp.setQuarter(undefined, '10', 3);
const p2 = qp.planQuarters(devices, saved);
assert.deepEqual(p2.byQuarter[3], ['3', '10']);
assert.equal(p2.rows.find((r) => r.section === '10').manual, true);
assert.deepEqual(qp.setQuarter(saved, '10', 'auto'), { sections: {} });
assert.throws(() => qp.setQuarter(saved, '1', 7));
// "05" and "5" are the same section
assert.equal(qp.sectionOf({ sektion: '05' }), '5');

// Dates
assert.equal(qp.yearBefore('2026-05-12'), '2025-05-12');
assert.equal(qp.yearBefore('2028-02-29'), '2027-02-28');
assert.deepEqual(qp.quarterRange(2026, 2), { from: '2026-04-01', to: '2026-06-30' });
assert.equal(qp.quarterOf('2026-11-06'), 4);

// History: last real test (OK or remark), stale after 12 months, replaced detectors start over
const events = [
  test('a', '2025-03-01'),
  test('a', '2026-04-10', 'Ej åtkomlig', 'Låst rum'),
  test('b', '2026-04-11'),
  test('c', '2025-06-01', 'Provad – anmärkning', 'Ingen indikering'),
  { ...test('d', '2026-04-12'), generation: 0 },
];
const reg = { devices, events };
assert.equal(qp.lastTested(devices[0], events), '2025-03-01', '"Ej åtkomlig" is not a test');
const h = qp.history(reg, '2026-05-12');
const s1 = h.sections.find((s) => s.section === '1');
assert.equal(s1.last, '2026-04-11');
assert.equal(s1.stale, false);
assert.equal(s1.recent, 1);
assert.equal(h.sections.find((s) => s.section === '3').stale, true, 'old generation does not count');
assert.deepEqual(h.stale.map((x) => x.device.id).sort(), ['a', 'd', 'e', 'f', 'g', 'h'].sort());
assert.equal(h.stale[0].last, '', 'never tested first');

// Open faults: latest result decides
assert.deepEqual(qp.openFaults(reg).map((x) => x.device.id), ['a', 'c']);
assert.deepEqual(qp.openFaults({ devices, events: [...events, test('c', '2026-04-20')] }).map((x) => x.device.id), ['a']);

// Remaining in quarter 2 2026: plan for Q2 is sections 2 and 10, none tested in the quarter
const r = qp.remaining(reg, { year: 2026, quarter: 2, refDate: '2026-05-12' });
assert.deepEqual(r.planned, ['2', '10']);
assert.deepEqual(r.plannedLeft, ['2', '10']);
assert.deepEqual(r.yearLeft, ['2', '3', '4', '5', '10']);
assert.equal(r.upTo, '2026-05-12');
const text = qp.remainingText(r, { facility: 'Testobjekt', year: 2026, quarter: 2, label: (d) => 'Sektion ' + (d.sektion || '–') + ' · ' + d.id });
assert.match(text, /Sektioner i kvartalets plan som inte provats \(2 av 2\):\n  Sektion 2, Sektion 10/);
assert.match(text, /Sektion 1 · a – 2026-04-10 ej åtkomlig: Låst rum/);
assert.match(text, /aldrig provad/);
// tests after the date do not count
const later = qp.remaining({ devices, events: [...events, test('c', '2026-06-01')] }, { year: 2026, quarter: 2, refDate: '2026-05-12' });
assert.deepEqual(later.plannedLeft, ['2', '10']);

console.log('PASS: quarter plan, manual quarter, 12-month history, open faults, remaining list.');
