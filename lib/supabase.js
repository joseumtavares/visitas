/**
 * lib/supabase.js
 * Cliente HTTP para Supabase (server-side only — não expõe secrets no browser)
 *
 * CORREÇÃO v10.2: remoção do throw no nível do módulo.
 * O throw acontecia durante o build da Vercel (quando env vars ainda não estão
 * disponíveis no contexto de compilação). Agora a validação é lazy — ocorre
 * apenas na primeira chamada real à API.
 */

function getConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('[supabase] SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios. Configure as variáveis de ambiente na Vercel.');
  }
  return { url, key };
}

/**
 * Faz uma requisição autenticada para a API REST do Supabase.
 * @param {string} path   ex: '/rest/v1/clients?workspace=eq.principal'
 * @param {object} opts   { method, headers, body }
 */
export async function sb(path, opts = {}) {
  const { url: SUPABASE_URL, key: SUPABASE_KEY } = getConfig();
  const fullUrl = `${SUPABASE_URL}${path}`;
  const body    = opts.body ? JSON.stringify(opts.body) : undefined;

  const res = await fetch(fullUrl, {
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
 * Compatível com Next.js App Router (req é um Request nativo).
 */
export function validateSyncKey(req) {
  // App Router: req é um Request nativo — usa req.headers.get()
  const key = req?.headers?.get?.('x-app-key')
    ?? req?.headers?.['x-app-key']
    ?? req?.query?.key;

  // Suporta tanto APP_SYNC_KEY (nome atual na Vercel) quanto SYNC_KEY (legado)
  const expected = process.env.APP_SYNC_KEY || process.env.SYNC_KEY;

  if (!expected) {
    const err = new Error('Variável de ambiente APP_SYNC_KEY não configurada na Vercel.');
    err.status = 500;
    throw err;
  }

  if (!key || key !== expected) {
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
 * CORS headers para requisições do frontend.
 */
export function cors(res, req) {
  const origin = req?.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin',  origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-key, x-workspace');
  res.setHeader('Access-Control-Max-Age',       '86400');
}
