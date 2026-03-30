// ─── Backend helper — nunca expor no frontend ───────────────────────────────
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_SYNC_KEY'];

// ── Whitelist de origens permitidas ─────────────────────────────────────────
// Adicione aqui os domínios reais do seu deploy separados por vírgula em ALLOWED_ORIGINS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);
const DEV_ORIGINS = ['http://localhost:3000','http://localhost:5000','http://127.0.0.1:5500'];

function isOriginAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.length === 0) return true; // sem whitelist = modo dev permissivo
  return [...ALLOWED_ORIGINS, ...DEV_ORIGINS].includes(origin);
}

function assertEnv() {
  const miss = REQUIRED.filter(k => !process.env[k]);
  if (miss.length) { const e = new Error(`Env ausente: ${miss.join(', ')}`); e.statusCode = 500; throw e; }
}

function validateSyncKey(req) {
  assertEnv();
  const key = String(req.headers['x-app-key'] || '').trim();
  if (!key || key !== process.env.APP_SYNC_KEY) {
    const e = new Error('Chave de sincronização inválida'); e.statusCode = 401; throw e;
  }
}

function cors(res, req) {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'null');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-app-key,x-workspace');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

async function sb(path, { method = 'GET', body, headers = {} } = {}) {
  assertEnv();
  const r = await fetch(`${process.env.SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = await r.json().catch(() => null);
  if (!r.ok) {
    const e = new Error(payload?.message || payload?.error || 'Supabase error');
    e.statusCode = r.status; e.details = payload; throw e;
  }
  return payload;
}

function body(req) {
  if (!req.body) return {};
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
}

function ok(res, data, status = 200) {
  res.status(status).end(JSON.stringify({ ok: true, ...data }));
}

function err(res, e) {
  const isProd = process.env.NODE_ENV === 'production';
  res.status(e.statusCode || 500).end(JSON.stringify({
    ok: false, error: e.message,
    ...(isProd ? {} : { details: e.details }),
  }));
}

function auditLog(action, workspace, meta = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), action, workspace, ...meta }));
}

module.exports = { validateSyncKey, cors, sb, body, ok, err, auditLog };
