/**
 * api/sync.js v9 — Endpoint de sincronização com suporte a soft-delete
 *
 * GET  /api/sync?workspace=X  → lê TODAS as tabelas e devolve estado completo
 * POST /api/sync?workspace=X  → recebe estado completo e sincroniza (upsert + propaga exclusões)
 *
 * ESTRATÉGIA DE EXCLUSÃO (v9):
 *   - Tabela `deleted_records` registra IDs deletados por workspace/tabela (tombstone)
 *   - No POST: registros presentes no banco mas ausentes no payload E com tombstone → deletados do banco
 *   - Isso resolve o bug de registros apagados voltarem após sync
 *
 * Mapeamento app → Supabase:
 *   categories        → public.categories
 *   envTypes          → public.env_types
 *   productCategories → public.product_categories
 *   customStatusTypes → public.custom_status_types
 *   clients           → public.clients  (+environments aninhados)
 *   products          → public.products
 *   visits            → public.visits
 *   referrals         → public.referrals
 *   leads             → public.leads
 *   orders            → public.orders   (+items aninhados em order_items)
 *   commissions       → public.commissions
 *   repCommissions    → public.rep_commissions
 *   company           → public.company_settings  (1 linha por workspace)
 *   representative    → public.representative_settings (1 linha por workspace)
 */
const { validateSyncKey, cors, sb, body, ok, err, auditLog } = require('./_supabase');

function sanitize(ws) {
  return String(ws || 'principal').trim().toLowerCase()
    .replace(/[^a-z0-9_-]/g, '').slice(0, 80) || 'principal';
}

// ── Leitura (GET) ────────────────────────────────────────────────────────────

async function readAll(ws) {
  const enc = encodeURIComponent(ws);
  const [
    categories, envTypes, productCategories, customStatusTypes,
    clients, environments, products, visits,
    referrals, leads, orders, orderItems, commissions, repCommissions,
    companyRows, repRows, deletedRecords,
  ] = await Promise.all([
    sb(`/rest/v1/categories?workspace=eq.${enc}&select=*`),
    sb(`/rest/v1/env_types?workspace=eq.${enc}&select=*`),
    sb(`/rest/v1/product_categories?workspace=eq.${enc}&select=*`),
    sb(`/rest/v1/custom_status_types?workspace=eq.${enc}&select=*`),
    sb(`/rest/v1/clients?workspace=eq.${enc}&select=*`),
    sb(`/rest/v1/environments?workspace=eq.${enc}&select=*`),
    sb(`/rest/v1/products?workspace=eq.${enc}&select=*`),
    sb(`/rest/v1/visits?workspace=eq.${enc}&select=*`),
    sb(`/rest/v1/referrals?workspace=eq.${enc}&select=*`),
    sb(`/rest/v1/leads?workspace=eq.${enc}&select=*`),
    sb(`/rest/v1/orders?workspace=eq.${enc}&select=*`),
    sb(`/rest/v1/order_items?workspace=eq.${enc}&select=*`),
    sb(`/rest/v1/commissions?workspace=eq.${enc}&select=*`),
    sb(`/rest/v1/rep_commissions?workspace=eq.${enc}&select=*`),
    sb(`/rest/v1/company_settings?workspace=eq.${enc}&select=*&limit=1`),
    sb(`/rest/v1/representative_settings?workspace=eq.${enc}&select=*&limit=1`),
    // Tombstones — lista de IDs deletados para repassar ao cliente
    sb(`/rest/v1/deleted_records?workspace=eq.${enc}&select=*`).catch(() => []),
  ]);

  const clientsWithEnvs = (clients || []).map(c => ({
    id: c.id, name: c.name, phone1: c.phone1, phone2: c.phone2 || '',
    categoryId: c.category_id || '', city: c.city || '',
    neighborhood: c.neighborhood || '', address: c.address || '',
    lat: c.lat || 0, lng: c.lng || 0, mapsLink: c.maps_link || '',
    notes: c.notes || '', cep: c.cep || '',
    activityStatus: c.activity_status || { hasEquip:false,bioPellets:false,cavaco:false,briquete:false,pellets:false,customFlags:{},custom:'' },
    environments: (environments || [])
      .filter(e => e.client_id === c.id)
      .map(e => ({
        id: e.id, typeId: e.type_id || '', label: e.label || '',
        height: e.height || '', width: e.width || '', length: e.length || '',
        notes: e.notes || '', estufaType: e.estufa_type || 'grampo',
        grampoQty: e.grampo_qty || '', grampoSize: e.grampo_size || '28',
        photoIds: e.photo_ids || [], furnace: e.furnace || {},
      })),
  }));

  const ordersWithItems = (orders || []).map(o => ({
    id: o.id, clientId: o.client_id, envId: o.env_id || '',
    date: o.date, paymentType: o.payment_type, installments: o.installments || '',
    finStatus: o.fin_status || 'pendente', referralId: o.referral_id || '',
    referralName: o.referral_name || '', status: o.status,
    notes: o.notes || '', total: o.total,
    commissionType: o.commission_type || 'fixed',
    commissionValue: o.commission_value || 0,
    commissionPct: o.commission_pct || 0,
    items: (orderItems || [])
      .filter(i => i.order_id === o.id)
      .map(i => ({
        id: i.id,
        productId: i.product_id, productName: i.product_name || '',
        qty: i.qty, unitPrice: i.unit_price,
      })),
  }));

  const company = companyRows?.[0] || {};
  const rep = repRows?.[0] || {};

  // Agrupa tombstones por tabela para o cliente limpar localmente
  const tombstones = {};
  for (const row of (deletedRecords || [])) {
    if (!tombstones[row.table_name]) tombstones[row.table_name] = [];
    tombstones[row.table_name].push(row.record_id);
  }

  return {
    categories: (categories || []).map(c => ({ id: c.id, name: c.name, desc: c.description || '' })),
    envTypes: (envTypes || []).map(e => ({ id: e.id, name: e.name })),
    productCategories: (productCategories || []).map(p => ({ id: p.id, name: p.name })),
    customStatusTypes: (customStatusTypes || []).map(t => ({ id: t.id, label: t.label })),
    clients: clientsWithEnvs,
    products: (products || []).map(p => ({
      id: p.id, name: p.name, model: p.model || '', categoryId: p.category_id || '',
      dimensions: p.dimensions || '', color: p.color || '',
      price: p.price || 0, repCommissionPct: p.rep_commission_pct || 0,
      notes: p.notes || '', photoIds: p.photo_ids || [],
    })),
    visits: (visits || []).map(v => ({
      id: v.id, clientId: v.client_id, date: v.date,
      notes: v.notes || '', nextContact: v.next_contact || '',
    })),
    referrals: (referrals || []).map(r => ({
      id: r.id, name: r.name, commission: r.commission || 0,
      commissionType: r.commission_type || 'fixed', commissionPct: r.commission_pct || 0,
      cpf: r.cpf || '', phone: r.phone || '',
      bankName: r.bank_name || '', bankAgency: r.bank_agency || '',
      bankAccount: r.bank_account || '', bankPix: r.bank_pix || '',
    })),
    leads: (leads || []).map(l => ({
      id: l.id, name: l.name, phone: l.phone || '', reference: l.reference || '',
      referralId: l.referral_id || '', referralName: l.referral_name || '',
      lat: l.lat || 0, lng: l.lng || 0, mapsLink: l.maps_link || '',
      notes: l.notes || '', status: l.status || 'active',
      convertedClientId: l.converted_client_id || null, createdAt: l.created_at,
    })),
    orders: ordersWithItems,
    repCommissions: (repCommissions || []).map(c => ({
      id: c.id, orderId: c.order_id, orderDate: c.order_date,
      clientId: c.client_id, clientName: c.client_name || '',
      productId: c.product_id, productName: c.product_name || '',
      qty: c.qty || 1, unitPrice: c.unit_price || 0,
      repCommissionPct: c.rep_commission_pct || 0,
      amount: c.amount || 0, orderTotal: c.order_total || 0,
      status: c.status || 'pendente', paidAt: c.paid_at || null,
      receiptPhotoIds: c.receipt_photo_ids || [], createdAt: c.created_at,
    })),
    commissions: (commissions || []).map(c => ({
      id: c.id, referralId: c.referral_id, referralName: c.referral_name || '',
      orderId: c.order_id, clientId: c.client_id, clientName: c.client_name || '',
      amount: c.amount, status: c.status, commissionType: c.commission_type || 'fixed',
      createdAt: c.created_at, paidAt: c.paid_at || null,
      orderDate: c.order_date || null, orderTotal: c.order_total || 0,
      receiptPhotoIds: c.receipt_photo_ids || [],
    })),
    company: {
      name: company.name || '', cnpj: company.cnpj || '', phone: company.phone || '',
      bankName: company.bank_name || '', bankAgency: company.bank_agency || '',
      bankAccount: company.bank_account || '', bankPix: company.bank_pix || '',
      address: company.address || '', tiktok: company.tiktok || '',
      facebook: company.facebook || '', instagram: company.instagram || '',
      x: company.x || '', linkedin: company.linkedin || '',
    },
    representative: { name: rep.name || '', cities: rep.cities || [] },
    // Tombstones: cliente deve remover esses IDs localmente
    _tombstones: tombstones,
  };
}

// ── Upsert em lotes ──────────────────────────────────────────────────────────

async function upsertTable(table, rows, conflictCol = 'id') {
  if (!rows || !rows.length) return;
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await sb(`/rest/v1/${table}?on_conflict=${conflictCol}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: chunk,
    });
  }
}

// ── Propagar exclusões via tombstone ─────────────────────────────────────────
// Recebe: IDs que o cliente ENVIOU para uma tabela
// Busca no banco os IDs existentes para o workspace
// IDs no banco mas não no payload → registrar tombstone + deletar do banco
async function propagateDeletions(ws, table, sentIds, fetchPath, idField = 'id') {
  const existing = await sb(fetchPath).catch(() => []);
  const existingIds = (existing || []).map(r => r[idField]);
  const sentSet = new Set(sentIds);

  const toDelete = existingIds.filter(id => !sentSet.has(id));
  if (toDelete.length === 0) return;

  const now = new Date().toISOString();
  const enc = encodeURIComponent(ws);

  // 1. Registrar tombstones (ignorar erro se tabela não existir ainda)
  const tombstones = toDelete.map(record_id => ({
    workspace: ws, table_name: table, record_id, deleted_at: now,
  }));
  await sb(`/rest/v1/deleted_records?on_conflict=workspace,table_name,record_id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: tombstones,
  }).catch(e => console.warn(`[sync] tombstone insert falhou para ${table}:`, e.message));

  // 2. Deletar do banco em lotes de 100
  const CHUNK = 100;
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const chunk = toDelete.slice(i, i + CHUNK);
    const ids = chunk.map(id => `"${id}"`).join(',');
    await sb(`/rest/v1/${table}?${idField}=in.(${ids})&workspace=eq.${enc}`, {
      method: 'DELETE',
    }).catch(e => console.warn(`[sync] delete falhou para ${table}:`, e.message));
  }
}

// ── Escrita (POST) ───────────────────────────────────────────────────────────

async function writeAll(ws, payload) {
  const now = new Date().toISOString();
  const errors = [];
  const enc = encodeURIComponent(ws);
  const safe = async (label, fn) => {
    try { await fn(); }
    catch(e) {
      errors.push(`${label}: ${e.message}`);
      console.error(`[sync] ERRO em ${label}:`, e.message, e.details || '');
    }
  };

  // ── lookup tables ──────────────────────────────────────────────────────────
  await safe('categories', async () => {
    const rows = (payload.categories || []).map(c => ({ id: c.id, workspace: ws, name: c.name, description: c.desc || '', updated_at: now }));
    await upsertTable('categories', rows);
    await propagateDeletions(ws, 'categories', rows.map(r=>r.id), `/rest/v1/categories?workspace=eq.${enc}&select=id`);
  });

  await safe('env_types', async () => {
    const rows = (payload.envTypes || []).map(e => ({ id: e.id, workspace: ws, name: e.name, updated_at: now }));
    await upsertTable('env_types', rows);
    await propagateDeletions(ws, 'env_types', rows.map(r=>r.id), `/rest/v1/env_types?workspace=eq.${enc}&select=id`);
  });

  await safe('product_categories', async () => {
    const rows = (payload.productCategories || []).map(p => ({ id: p.id, workspace: ws, name: p.name, updated_at: now }));
    await upsertTable('product_categories', rows);
    await propagateDeletions(ws, 'product_categories', rows.map(r=>r.id), `/rest/v1/product_categories?workspace=eq.${enc}&select=id`);
  });

  await safe('custom_status_types', async () => {
    const rows = (payload.customStatusTypes || []).map(t => ({ id: t.id, workspace: ws, label: t.label, updated_at: now }));
    await upsertTable('custom_status_types', rows);
    await propagateDeletions(ws, 'custom_status_types', rows.map(r=>r.id), `/rest/v1/custom_status_types?workspace=eq.${enc}&select=id`);
  });

  // ── referrals ─────────────────────────────────────────────────────────────
  await safe('referrals', async () => {
    const rows = (payload.referrals || []).map(r => ({
      id: r.id, workspace: ws, name: r.name, commission: r.commission || 0,
      commission_type: r.commissionType || 'fixed', commission_pct: r.commissionPct || 0,
      cpf: r.cpf || '', phone: r.phone || '',
      bank_name: r.bankName || '', bank_agency: r.bankAgency || '',
      bank_account: r.bankAccount || '', bank_pix: r.bankPix || '', updated_at: now,
    }));
    await upsertTable('referrals', rows);
    await propagateDeletions(ws, 'referrals', rows.map(r=>r.id), `/rest/v1/referrals?workspace=eq.${enc}&select=id`);
  });

  // ── clients ───────────────────────────────────────────────────────────────
  const clients = payload.clients || [];
  await safe('clients', async () => {
    const rows = clients.map(c => ({
      id: c.id, workspace: ws, name: c.name, phone1: c.phone1, phone2: c.phone2 || '',
      category_id: c.categoryId || null, city: c.city || '', neighborhood: c.neighborhood || '',
      address: c.address || '', lat: c.lat || 0, lng: c.lng || 0,
      maps_link: c.mapsLink || '', notes: c.notes || '', cep: c.cep || '',
      activity_status: c.activityStatus || {}, updated_at: now,
    }));
    await upsertTable('clients', rows);
    await propagateDeletions(ws, 'clients', rows.map(r=>r.id), `/rest/v1/clients?workspace=eq.${enc}&select=id`);
  });

  // ── environments ──────────────────────────────────────────────────────────
  await safe('environments', async () => {
    const allEnvs = clients.flatMap(c =>
      (c.environments || []).map(e => ({
        id: e.id, workspace: ws, client_id: c.id,
        type_id: e.typeId || null, label: e.label || '',
        height: parseFloat(e.height) || null, width: parseFloat(e.width) || null, length: parseFloat(e.length) || null,
        notes: e.notes || '', estufa_type: e.estufaType || 'grampo',
        grampo_qty: parseInt(e.grampoQty) || null, grampo_size: e.grampoSize || '28',
        photo_ids: e.photoIds || [], furnace: e.furnace || {}, updated_at: now,
      }))
    );
    await upsertTable('environments', allEnvs);
    await propagateDeletions(ws, 'environments', allEnvs.map(r=>r.id), `/rest/v1/environments?workspace=eq.${enc}&select=id`);
  });

  // ── products ──────────────────────────────────────────────────────────────
  await safe('products', async () => {
    const rows = (payload.products || []).map(p => ({
      id: p.id, workspace: ws, name: p.name, model: p.model || '',
      rep_commission_pct: p.repCommissionPct || 0, category_id: p.categoryId || null,
      dimensions: p.dimensions || '', color: p.color || '', price: p.price || 0,
      notes: p.notes || '', photo_ids: p.photoIds || [], updated_at: now,
    }));
    await upsertTable('products', rows);
    await propagateDeletions(ws, 'products', rows.map(r=>r.id), `/rest/v1/products?workspace=eq.${enc}&select=id`);
  });

  // ── visits ────────────────────────────────────────────────────────────────
  await safe('visits', async () => {
    const rows = (payload.visits || []).map(v => ({
      id: v.id, workspace: ws, client_id: v.clientId, date: v.date,
      notes: v.notes || '', next_contact: v.nextContact || null, updated_at: now,
    }));
    await upsertTable('visits', rows);
    await propagateDeletions(ws, 'visits', rows.map(r=>r.id), `/rest/v1/visits?workspace=eq.${enc}&select=id`);
  });

  // ── leads ─────────────────────────────────────────────────────────────────
  await safe('leads', async () => {
    const rows = (payload.leads || []).map(l => ({
      id: l.id, workspace: ws, name: l.name, phone: l.phone || '',
      reference: l.reference || '', referral_id: l.referralId || null,
      referral_name: l.referralName || '', lat: l.lat || 0, lng: l.lng || 0,
      maps_link: l.mapsLink || '', notes: l.notes || '', status: l.status || 'active',
      converted_client_id: l.convertedClientId || null,
      created_at: l.createdAt || now, updated_at: now,
    }));
    await upsertTable('leads', rows);
    await propagateDeletions(ws, 'leads', rows.map(r=>r.id), `/rest/v1/leads?workspace=eq.${enc}&select=id`);
  });

  // ── orders ────────────────────────────────────────────────────────────────
  const orders = payload.orders || [];
  await safe('orders', async () => {
    const rows = orders.map(o => ({
      id: o.id, workspace: ws, client_id: o.clientId, env_id: o.envId || null,
      date: o.date, payment_type: o.paymentType, installments: parseInt(o.installments) || null,
      fin_status: o.finStatus || 'pendente', referral_id: o.referralId || null,
      referral_name: o.referralName || '', status: o.status, notes: o.notes || '', total: o.total || 0,
      commission_type: o.commissionType || 'fixed',
      commission_value: o.commissionValue || 0,
      commission_pct: o.commissionPct || 0,
      updated_at: now,
    }));
    await upsertTable('orders', rows);
    await propagateDeletions(ws, 'orders', rows.map(r=>r.id), `/rest/v1/orders?workspace=eq.${enc}&select=id`);
  });

  // ── order_items: delete+insert por pedido (sem ID estável no app) ─────────
  await safe('order_items', async () => {
    const allItems = orders.flatMap(o =>
      (o.items || []).map(i => ({
        id: i.id || undefined, // preservar ID se existir
        order_id: o.id, workspace: ws,
        product_id: i.productId || null, product_name: i.productName || '',
        qty: i.qty || 1, unit_price: i.unitPrice || 0, updated_at: now,
      }))
    );
    if (orders.length) {
      const orderIds = orders.map(o => `"${o.id}"`).join(',');
      await sb(`/rest/v1/order_items?order_id=in.(${orderIds})&workspace=eq.${enc}`, { method: 'DELETE' });
      if (allItems.length) {
        await sb('/rest/v1/order_items', {
          method: 'POST', headers: { Prefer: 'return=minimal' }, body: allItems,
        });
      }
    }
  });

  // ── commissions ───────────────────────────────────────────────────────────
  await safe('commissions', async () => {
    const rows = (payload.commissions || []).map(c => ({
      id: c.id, workspace: ws, referral_id: c.referralId || null,
      referral_name: c.referralName || '', order_id: c.orderId,
      client_id: c.clientId, client_name: c.clientName || '',
      amount: c.amount || 0, status: c.status,
      commission_type: c.commissionType || 'fixed',
      created_at: c.createdAt || now, paid_at: c.paidAt || null,
      order_date: c.orderDate || null, order_total: c.orderTotal || 0,
      receipt_photo_ids: c.receiptPhotoIds || [], updated_at: now,
    }));
    await upsertTable('commissions', rows);
    await propagateDeletions(ws, 'commissions', rows.map(r=>r.id), `/rest/v1/commissions?workspace=eq.${enc}&select=id`);
  });

  // ── rep_commissions ───────────────────────────────────────────────────────
  await safe('rep_commissions', async () => {
    const rows = (payload.repCommissions || []).map(c => ({
      id: c.id, workspace: ws, order_id: c.orderId || null, order_date: c.orderDate || null,
      client_id: c.clientId || null, client_name: c.clientName || '',
      product_id: c.productId || null, product_name: c.productName || '',
      qty: c.qty || 1, unit_price: c.unitPrice || 0,
      rep_commission_pct: c.repCommissionPct || 0, amount: c.amount || 0,
      order_total: c.orderTotal || 0, status: c.status || 'pendente',
      paid_at: c.paidAt || null, receipt_photo_ids: c.receiptPhotoIds || [], updated_at: now,
    }));
    await upsertTable('rep_commissions', rows);
    await propagateDeletions(ws, 'rep_commissions', rows.map(r=>r.id), `/rest/v1/rep_commissions?workspace=eq.${enc}&select=id`);
  });

  // ── company_settings ──────────────────────────────────────────────────────
  const co = payload.company || {};
  await safe('company_settings', () => sb(`/rest/v1/company_settings?on_conflict=workspace`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: [{
      workspace: ws, name: co.name || '', cnpj: co.cnpj || '', phone: co.phone || '',
      bank_name: co.bankName || '', bank_agency: co.bankAgency || '',
      bank_account: co.bankAccount || '', bank_pix: co.bankPix || '',
      address: co.address || '', tiktok: co.tiktok || '', facebook: co.facebook || '',
      instagram: co.instagram || '', x: co.x || '', linkedin: co.linkedin || '', updated_at: now,
    }],
  }));

  // ── representative_settings ───────────────────────────────────────────────
  const rep = payload.representative || {};
  await safe('representative_settings', () => sb(`/rest/v1/representative_settings?on_conflict=workspace`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: [{ workspace: ws, name: rep.name || '', cities: rep.cities || [], updated_at: now }],
  }));

  return errors;
}

// ── Handler principal ────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  const { cors: setCors, body: getBody, ok: sendOk, err: sendErr } = require('./_supabase');
  setCors(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    validateSyncKey(req);
    const ws = sanitize(req.query?.workspace || req.headers['x-workspace'] || 'principal');

    if (req.method === 'GET') {
      const state = await readAll(ws);
      auditLog('SYNC_GET', ws, { tables: Object.keys(state).length });
      sendOk(res, { workspace: ws, payload: state, updatedAt: new Date().toISOString() });
      return;
    }

    if (req.method === 'POST') {
      const b = getBody(req);
      if (!b?.payload || typeof b.payload !== 'object') {
        res.status(400).end(JSON.stringify({ ok: false, error: 'Payload inválido' }));
        return;
      }
      const syncErrors = await writeAll(ws, b.payload);
      auditLog('SYNC_POST', ws, {
        clients: b.payload.clients?.length || 0,
        orders: b.payload.orders?.length || 0,
        errors: syncErrors?.length || 0,
      });
      sendOk(res, {
        workspace: ws,
        updatedAt: new Date().toISOString(),
        ...(syncErrors?.length ? { warnings: syncErrors } : {}),
      });
      return;
    }

    res.status(405).end(JSON.stringify({ ok: false, error: 'Método não permitido' }));
  } catch (e) {
    err(res, e);
  }
};
