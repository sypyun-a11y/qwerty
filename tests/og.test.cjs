const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function meta(key) {
  const tags = html.match(/<meta\b[^>]*>/g) || [];
  const tag = tags.find(t => new RegExp(`(?:property|name)=["']${key.replaceAll('.', '\\.')}["']`).test(t));
  return tag?.match(/content=["']([^"']*)["']/)?.[1];
}
test('social sharing points to a real 1200x630 PNG asset', () => {
  const source = meta('og:image');
  assert.ok(source, 'Missing OG image metadata');
  const pathname = /^https?:/.test(source) ? new URL(source).pathname.replace(/^\//, '') : source;
  const file = path.join(root, pathname);
  assert.ok(fs.existsSync(file), 'OG image asset not found');
  const png = fs.readFileSync(file);
  assert.equal(png.subarray(1,4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.equal(meta('og:image:width'), '1200');
  assert.equal(meta('og:image:height'), '630');
  assert.equal(meta('og:image:type'), 'image/png');
  assert.equal(meta('twitter:image'), source);
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(meta('og:title'), 'qwerty');
  assert.ok(meta('og:description'));
});
