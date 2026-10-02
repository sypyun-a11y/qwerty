const crypto = require('node:crypto');
const { neon } = require('@neondatabase/serverless');

function createSessionToken(payload, secret) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 7 * 86400000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function readSession(req, secret) {
  const raw = String(req.headers?.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('qwerty_session='))?.slice(15);
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(crypto.createHmac('sha256', secret).update(body).digest('base64url')))) return null;
  try { const data = JSON.parse(Buffer.from(body, 'base64url').toString()); return data.exp > Date.now() ? data : null; } catch { return null; }
}
function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); }
function createAuthHandler({ password, passwordHash, secret }) {
  return async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    let input; try { input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; } catch { return json(res, 400, { error: 'invalid_json' }); }
    const supplied = crypto.createHash('sha256').update(String(input.password || '')).digest('hex');
    const expected = passwordHash || (password ? crypto.createHash('sha256').update(String(password)).digest('hex') : 'e9c15acddd2bbb3144f2bf481443dfd75d5205573b89cb455604f646e321d5f4');
    if (supplied !== expected) return json(res, 401, { error: 'invalid_password' });
    const role = input.role === 'admin' ? 'admin' : 'viewer';
    res.setHeader('Set-Cookie', `qwerty_session=${createSessionToken({ role }, secret)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);
    return json(res, 200, { ok: true, role });
  };
}
function createStateHandler({ db, secret }) {
  return async (req, res) => {
    const session = readSession(req, secret);
    if (!session) return json(res, 401, { error: 'unauthorized' });
    await db.ensure();
    if (req.method === 'GET') return json(res, 200, await db.read());
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    if (session.role !== 'admin') return json(res, 403, { error: 'admin_only' });
    let input; try { input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; } catch { return json(res, 400, { error: 'invalid_json' }); }
    const next = await db.write(input.data, Number(input.version));
    return next ? json(res, 200, next) : json(res, 409, await db.read());
  };
}
function liveDb() {
  const sql = neon(process.env.DATABASE_URL);
  return {
    async ensure() { await sql`CREATE TABLE IF NOT EXISTS qwerty_workspace (id integer primary key, version integer not null, data jsonb not null, updated_at timestamptz not null default now())`; await sql`INSERT INTO qwerty_workspace (id, version, data) VALUES (1, 0, ${JSON.stringify({items:[],events:[],memos:[]})}::jsonb) ON CONFLICT (id) DO NOTHING`; },
    async read() { const rows = await sql`SELECT version, data FROM qwerty_workspace WHERE id=1`; return { version: Number(rows[0].version), data: rows[0].data }; },
    async write(data, version) { const rows = await sql`UPDATE qwerty_workspace SET version=version+1, data=${JSON.stringify(data)}::jsonb, updated_at=now() WHERE id=1 AND version=${version} RETURNING version, data`; return rows[0] ? { version:Number(rows[0].version), data:rows[0].data } : null; },
  };
}
module.exports = { createSessionToken, createAuthHandler, createStateHandler, liveDb, json };
