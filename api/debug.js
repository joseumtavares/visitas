// api/debug.js — diagnóstico temporário (REMOVA após resolver o problema)
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const syncKey = process.env.APP_SYNC_KEY || '';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  // Mostra info sem expor valores completos
  const incomingKey = String(req.headers['x-app-key'] || '').trim();

  res.status(200).end(JSON.stringify({
    // Variáveis de ambiente carregadas?
    env: {
      SUPABASE_URL:              supabaseUrl ? `✅ carregada (${supabaseUrl.slice(0,30)}...)` : '❌ AUSENTE',
      SUPABASE_SERVICE_ROLE_KEY: serviceKey  ? `✅ carregada (${serviceKey.length} chars, começa com: ${serviceKey.slice(0,10)}...)` : '❌ AUSENTE',
      APP_SYNC_KEY:              syncKey     ? `✅ carregada (${syncKey.length} chars, começa com: ${syncKey.slice(0,4)}...)` : '❌ AUSENTE',
    },
    // O que chegou no header x-app-key?
    incoming_key: incomingKey
      ? `recebido (${incomingKey.length} chars, começa com: ${incomingKey.slice(0,4)}...)`
      : 'NÃO enviado (header x-app-key ausente)',
    // As chaves batem?
    keys_match: syncKey && incomingKey ? (syncKey === incomingKey ? '✅ SIM' : '❌ NÃO — valores diferentes') : '❌ impossível comparar',
    // Info da requisição
    method: req.method,
    headers_received: Object.keys(req.headers),
    node_env: process.env.NODE_ENV || 'não definido',
  }, null, 2));
};
