// api/debug.js — APENAS disponível com chave de autenticação válida
// NUNCA expor em produção sem proteção de chave
const { validateSyncKey, cors, err } = require('./_supabase');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // PROTEÇÃO: requer chave de sync válida mesmo para debug
  try {
    validateSyncKey(req);
  } catch (e) {
    err(res, e);
    return;
  }

  // Em produção, bloquear completamente
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEBUG_ENDPOINT !== 'true') {
    res.status(403).end(JSON.stringify({ ok: false, error: 'Debug desabilitado em produção' }));
    return;
  }

  const syncKey = process.env.APP_SYNC_KEY || '';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const incomingKey = String(req.headers['x-app-key'] || '').trim();

  res.status(200).end(JSON.stringify({
    env: {
      SUPABASE_URL:              supabaseUrl ? `✅ carregada (${supabaseUrl.slice(0,30)}...)` : '❌ AUSENTE',
      SUPABASE_SERVICE_ROLE_KEY: serviceKey  ? `✅ carregada (${serviceKey.length} chars)` : '❌ AUSENTE',
      APP_SYNC_KEY:              syncKey     ? `✅ carregada (${syncKey.length} chars)` : '❌ AUSENTE',
    },
    incoming_key: incomingKey ? `recebido (${incomingKey.length} chars)` : 'NÃO enviado',
    keys_match: syncKey && incomingKey ? (syncKey === incomingKey ? '✅ SIM' : '❌ NÃO') : '❌ impossível comparar',
    method: req.method,
    node_env: process.env.NODE_ENV || 'não definido',
    note: 'Este endpoint só está disponível com ENABLE_DEBUG_ENDPOINT=true em não-produção',
  }, null, 2));
};
