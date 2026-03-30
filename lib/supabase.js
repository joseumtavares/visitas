/**
 * lib/supabase.js
 * Cliente HTTP para Supabase (server-side only — não expõe secrets no browser)
 */

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY; // service_role key

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('[supabase] SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios.');
}

/**
 * Faz uma requisição autenticada para a API REST do Supabase.
 * @param {string} path   ex: '/rest/v1/clients?workspace=eq.principal'
 * @param {object} opts   { method, headers, body }
 */
export async function sb(path, opts = {}) {
  const url  = `${SUPABASE_URL}${path}`;
  const body = opts.body ? JSON.stringify(opts.body) : undefined;

  const res = await fetch(url, {
    method:  opts.method || 'GET',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey':        SUPABASE_KEY,
      'Accept':        'application/json',
      ...(opts.headers || {}),
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err  = new Error(`[supabase] ${res.status} ${res.statusText} — ${path}`);
    err.status  = res.status;
    err.details = text;
    throw err;
  }

  // 204 No Content
  if (res.status === 204) return null;

  return res.json();
}

/**
 * Upsert em lotes (chunks de 200 rows para não estourar o limite do Supabase).
 */
export async function upsertTable(table, rows, conflictCol = 'id') {
  if (!rows || !rows.length) return;
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await sb(`/rest/v1/${table}?on_conflict=${conflictCol}`, {
      method:  'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body:    rows.slice(i, i + CHUNK),
    });
  }
}

/**
 * Valida a sync key enviada pelo frontend.
 */
export function validateSyncKey(req) {
  const key = req.headers['x-app-key'] || req.query?.key;
  if (!key || key !== process.env.SYNC_KEY) {
    const err = new Error('Chave de sincronização inválida.');
    err.status = 401;
    throw err;
  }
}

/**
 * Sanitiza o nome do workspace.
 */
export function sanitizeWorkspace(ws) {
  return String(ws || 'principal').trim().toLowerCase()
    .replace(/[^a-z0-9_-]/g, '').slice(0, 80) || 'principal';
}

/**
 * Respostas padronizadas.
 */
export function sendOk(res, data)   { res.status(200).json({ ok: true, ...data }); }
export function sendErr(res, err)   {
  console.error('[api]', err.message, err.details || '');
  res.status(err.status || 500).json({ ok: false, error: err.message });
}

/**
 * CORS headers para requisições do frontend.
 */
export function cors(res, req) {
  const origin = req?.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin',  origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-key, x-workspace');
  res.setHeader('Access-Control-Max-Age',       '86400');
}
