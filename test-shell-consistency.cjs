const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const list = (source, pattern) => JSON.parse(source.match(pattern)[1].replaceAll("'", '"'));

// The offline file list must be identical in the service worker and in the shell that verifies it.
const sw = read('sw.js'), shell = read('shell.js'), index = read('index.html'), readme = read('README.md');
const swFiles = list(sw, /const FILES=(\[[^\]]+\])/), shellFiles = list(shell, /const files=(\[[^\]]+\])/);
assert.deepEqual(shellFiles, swFiles, 'sw.js och shell.js har olika fillistor');
assert.equal(new Set(swFiles).size, swFiles.length, 'fillistan har dubbletter');
const swCache = sw.match(/const CACHE='([^']+)'/)[1], shellCache = shell.match(/const cacheName='([^']+)'/)[1];
assert.equal(shellCache, swCache, 'cachenamnet skiljer sig mellan sw.js och shell.js');

// Every listed file exists, so the installation cannot fail on a missing file.
for (const file of swFiles) {
  if (file === './') continue;
  assert.ok(fs.existsSync(path.join(__dirname, file)), 'filen saknas: ' + file);
}

// Everything the pages load locally is cached for offline use.
for (const page of ['index.html', 'workspace.html']) {
  const refs = [...read(page).matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 0, page + ' saknar lokala resurser');
  for (const ref of refs) {
    if (ref.startsWith('data:')) continue; // inline icon, nothing to fetch
    assert.ok(!/^(https?:)?\/\//.test(ref), page + ' laddar en extern resurs: ' + ref);
    const file = './' + ref.replace(/^\.\//, '').split(/[?#]/)[0];
    assert.ok(swFiles.includes(file), page + ' laddar ' + ref + ' som inte sparas offline');
  }
}

// One version number everywhere.
const version = readme.match(/^# SäkerhetSnabben Offline (\d+\.\d+\.\d+)/)[1];
assert.ok(index.includes('SäkerhetSnabben Offline · ' + version + ' ·'), 'index.html visar en annan version än README');
assert.ok(shell.includes('Version ' + version + ' ·'), 'shell.js visar en annan version än README');
assert.ok(readme.includes('### Version ' + version + ' '), 'README saknar avsnitt för version ' + version);
assert.ok(readme.includes('Cacheversion ' + swCache.match(/v(\d+)$/)[1] + '.'), 'README nämner inte aktuell cacheversion');

// Older or imported records without timestamps must not crash sorting or filtering.
const ctx = { window: {}, crypto: require('node:crypto').webcrypto };
vm.runInNewContext(read('detectors.js'), ctx);
const api = ctx.window.detectorData, device = { id: 'd', generation: 1, slinga: '02', sektion: 'A1', adress: '7' };
const events = [
  { kind: 'test', deviceId: 'd', generation: 1, date: '2026-03-01', status: 'Provad – OK' },
  { kind: 'test', deviceId: 'd', generation: 1, date: '2026-03-01', status: 'Provad – anmärkning', recordedAt: '2026-03-01T10:00:00.000Z' },
  { kind: 'test', deviceId: 'd', generation: 1, status: 'Inte provad' },
];
assert.equal(api.latest(device, events).status, 'Provad – anmärkning');
assert.equal(api.protocolEvents({ devices: [device], events }, '', '2026-03-01', '').length, 1);
assert.equal(api.protocolEvents({ devices: [device], events }, '', '2026-03-01', '')[0].status, 'Provad – anmärkning');
assert.equal(api.sameScope('02', '2'), true);
assert.equal(api.sameScope('02', ''), true);
assert.equal(api.sameScope('3', '2'), false);
assert.equal(api.sameScope('A1', 'a1'), true, 'sektioner med bokstäver ska gå att filtrera');
assert.equal(api.sameScope('A1', 'A2'), false);
assert.equal(api.sameScope(undefined, '2'), false);

// A cancelled change (validation error) is not a storage failure; a real failure still warns.
const storage = read('storage.js');
assert.match(storage, /tx\.error\.name === 'AbortError'/);
assert.match(storage, /state:'idle'/);
assert.match(shell, /state\.state==='idle'/);
for (const file of ['detectors-ui.js', 'service-ui.js', 'drawing-quick-ui.js']) assert.match(read(file), /technicianMemory\.bind\(/, file + ' minns inte teknikern');

console.log('PASS: identical offline file lists and cache name, all listed files exist, pages load only cached local files, one version number, robust sorting/filtering of records without timestamps, cancelled changes are not reported as storage failures, technician name remembered in all forms.');
