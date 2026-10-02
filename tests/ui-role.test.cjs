const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');

test('app exposes a password gate and distinguishes viewer from admin mode', () => {
  assert.match(html, /id=["']authGate["']/);
  assert.match(html, /id=["']authPassword["']/);
  assert.match(html, /[?&]mode=admin/);
  assert.match(html, /role[=:].*admin/);
  assert.match(html, /role[=:].*viewer/);
});

test('mutating controls are marked for admin-only visibility', () => {
  for (const id of ['addBtn', 'editBtn', 'delBtn', 'memoNew', 'memoPin', 'memoDel']) {
    assert.match(html, new RegExp(`(?:id=["']${id}["'][^>]*data-admin-only|data-admin-only[^>]*id=["']${id}["'])`), `missing admin marker for ${id}`);
  }
  assert.match(html, /data-admin-only/);
});

test('shared state sync keeps local persistence and avoids overwriting active form drafts', () => {
  assert.match(html, /indexedDB|IndexedDB/);
  assert.match(html, /fetch\(['"]\/api\/state/);
  assert.match(html, /setInterval\([^\n]*5000/);
  assert.match(html, /visibilitychange/);
  assert.match(html, /mform|activeElement|draft/i);
});
