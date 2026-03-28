/**
 * api/sync.js — Endpoint único de sincronização bidirecional
 *
 * GET  /api/sync?workspace=X  → lê TODAS as tabelas e devolve estado completo
 * POST /api/sync?workspace=X  → recebe estado completo e faz upsert em todas as tabelas
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
 *   company           → public.company_settings  (1 linha por workspace)
 *   representative    → public.representative_settings (1 linha por workspace)
 */
const { validateSyncKey, cors, sb, body, ok, err } = require('./_supabase');

// ── helpers de conversão app ↔ banco ────────────────────────────────────────

// camelCase das chaves do app → snake_case do banco
const toSnake = s => s.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);

function sanitize(ws) {
  return String(ws || 'principal').trim().toLowerCase()
    .replace(/[^a-z0-9_-]/g, '').slice(0, 80) || 'principal';
}

// ── Leitura (GET) ────────────────────────────────────────────────────────────

async function readAll(ws) {
  const q = tbl => `/rest/v1/${tbl}?workspace=eq.${encodeURIComponent(ws)}&select=*`;
  const qAll = tbl => `/rest/v1/${tbl}?select=*&workspace=eq.${encodeURIComponent(ws)}`;

  const [
    categories, envTypes, productCategories, customStatusTypes,
    clients, environments, products, visits,
    referrals, leads, orders, orderItems, commissions, repCommissions,
    companyRows, repRows,
  ] = await Promise.all([
    sb(`/rest/v1/categories?workspace=eq.${encodeURIComponent(ws)}&select=*`),
    sb(`/rest/v1/env_types?workspace=eq.${encodeURIComponent(ws)}&select=*`),
    sb(`/rest/v1/product_categories?workspace=eq.${encodeURIComponent(ws)}&select=*`),
    sb(`/rest/v1/custom_status_types?workspace=eq.${encodeURIComponent(ws)}&select=*`),
    sb(`/rest/v1/clients?workspace=eq.${encodeURIComponent(ws)}&select=*`),
    sb(`/rest/v1/environments?workspace=eq.${encodeURIComponent(ws)}&select=*`),
    sb(`/rest/v1/products?workspace=eq.${encodeURIComponent(ws)}&select=*`),
    sb(`/rest/v1/visits?workspace=eq.${encodeURIComponent(ws)}&select=*`),
    sb(`/rest/v1/referrals?workspace=eq.${encodeURIComponent(ws)}&select=*`),
    sb(`/rest/v1/leads?workspace=eq.${encodeURIComponent(ws)}&select=*`),
    sb(`/rest/v1/orders?workspace=eq.${encodeURIComponent(ws)}&select=*`),
    sb(`/rest/v1/order_items?workspace=eq.${encodeURIComponent(ws)}&select=*`),
    sb(`/rest/v1/commissions?workspace=eq.${encodeURIComponent(ws)}&select=*`),
    sb(`/rest/v1/rep_commissions?workspace=eq.${encodeURIComponent(ws)}&select=*`),
    sb(`/rest/v1/company_settings?workspace=eq.${encodeURIComponent(ws)}&select=*&limit=1`),
    sb(`/rest/v1/representative_settings?workspace=eq.${encodeURIComponent(ws)}&select=*&limit=1`),
  ]);

  // anexa environments dentro de cada client
  const clientsWithEnvs = (clients || []).map(c => ({
    id: c.id, name: c.name, phone1: c.phone1, phone2: c.phone2 || '',
    categoryId: c.category_id || '', city: c.city || '',
    neighborhood: c.neighborhood || '', address: c.address || '',
    lat: c.lat || 0, lng: c.lng || 0, mapsLink: c.maps_link || '',
    notes: c.notes || '',
    activityStatus: c.activity_status || { hasEquip:false,bioPellets:false,cavaco:false,briquete:false,pellets:false,customFlags:{},custom:'' },
    environments: (environments || [])
      .filter(e => e.client_id === c.id)
      .map(e => ({
        id: e.id, typeId: e.type_id || '', label: e.label || '',
        height: e.height || '', width: e.width || '', length: e.length || '',
        notes: e.notes || '', estufaType: e.estufa_type || 'grampo',
        grampoQty: e.grampo_qty || '', grampoSize: e.grampo_size || '28',
        photoIds: e.photo_ids || [],
        furnace: e.furnace || {},
      })),
  }));

  // anexa items dentro de cada order
  const ordersWithItems = (orders || []).map(o => ({
    id: o.id, clientId: o.client_id, envId: o.env_id || '',
    date: o.date, paymentType: o.payment_type, installments: o.installments || '',
    finStatus: o.fin_status || 'pendente', referralId: o.referral_id || '',
    referralName: o.referral_name || '', status: o.status,
    notes: o.notes || '', total: o.total,
    items: (orderItems || [])
      .filter(i => i.order_id === o.id)
      .map(i => ({ productId: i.product_id, productName: i.product_name || '', qty: i.qty, unitPrice: i.unit_price })),
  }));

  const company = companyRows?.[0] || {};
  const rep = repRows?.[0] || {};

  return {
    categories: (categories || []).map(c => ({ id: c.id, name: c.name, desc: c.description || '' })),
    envTypes: (envTypes || []).map(e => ({ id: e.id, name: e.name })),
    productCategories: (productCategories || []).map(p => ({ id: p.id, name: p.name })),
    customStatusTypes: (customStatusTypes || []).map(t => ({ id: t.id, label: t.label })),
    clients: clientsWithEnvs,
    products: (products || []).map(p => ({
      id: p.id, name: p.name, model: p.model || '', categoryId: p.category_id || '',
      dimensions: p.dimensions || '', color: p.color || '',
      price: p.price || 0, notes: p.notes || '', photoIds: p.photo_ids || [],
    })),
    visits: (visits || []).map(v => ({
      id: v.id, clientId: v.client_id, date: v.date,
      notes: v.notes || '', nextContact: v.next_contact || '',
    })),
    referrals: (referrals || []).map(r => ({ id: r.id, name: r.name, commission: r.commission || 0 })),
    leads: (leads || []).map(l => ({
      id: l.id, name: l.name, phone: l.phone || '', reference: l.reference || '',
      referralId: l.referral_id || '', referralName: l.referral_name || '',
      lat: l.lat || 0, lng: l.lng || 0, status: l.status || 'active',
      convertedClientId: l.converted_client_id || null,
      createdAt: l.created_at,
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
      receiptPhotoIds: c.receipt_photo_ids || [],
      createdAt: c.created_at,
    })),
    commissions: (commissions || []).map(c => ({
      id: c.id, referralId: c.referral_id, referralName: c.referral_name || '',
      orderId: c.order_id, clientId: c.client_id, clientName: c.client_name || '',
      amount: c.amount, status: c.status,
      createdAt: c.created_at, paidAt: c.paid_at || null,
      orderDate: c.order_date || null, orderTotal: c.order_total || 0,
    })),
    company: {
      name: company.name || '', cnpj: company.cnpj || '', phone: company.phone || '',
      bankName: company.bank_name || '', bankAgency: company.bank_agency || '',
      bankAccount: company.bank_account || '', bankPix: company.bank_pix || '',
      address: company.address || '', tiktok: company.tiktok || '',
      facebook: company.facebook || '', instagram: company.instagram || '',
      x: company.x || '', linkedin: company.linkedin || '',
    },
    representative: {
      name: rep.name || '',
      cities: rep.cities || [],
    },
  };
}

// ── Escrita (POST) ───────────────────────────────────────────────────────────

async function upsertTable(table, rows, conflictCol = 'id') {
  if (!rows || !rows.length) return;
  await sb(`/rest/v1/${table}?on_conflict=${conflictCol}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: rows,
  });
}

async function writeAll(ws, payload) {
  const now = new Date().toISOString();

  // ── lookup tables ──────────────────────────────────────────────────────────
  await upsertTable('categories', (payload.categories || []).map(c => ({
    id: c.id, workspace: ws, name: c.name, description: c.desc || '', updated_at: now,
  })));

  await upsertTable('env_types', (payload.envTypes || []).map(e => ({
    id: e.id, workspace: ws, name: e.name, updated_at: now,
  })));

  await upsertTable('product_categories', (payload.productCategories || []).map(p => ({
    id: p.id, workspace: ws, name: p.name, updated_at: now,
  })));

  await upsertTable('custom_status_types', (payload.customStatusTypes || []).map(t => ({
    id: t.id, workspace: ws, label: t.label, updated_at: now,
  })));

  // ── referrals (needed before leads/orders/commissions) ────────────────────
  await upsertTable('referrals', (payload.referrals || []).map(r => ({
    id: r.id, workspace: ws, name: r.name, commission: r.commission || 0, updated_at: now,
  })));

  // ── clients ───────────────────────────────────────────────────────────────
  const clients = payload.clients || [];
  await upsertTable('clients', clients.map(c => ({
    id: c.id, workspace: ws,
    name: c.name, phone1: c.phone1, phone2: c.phone2 || '',
    category_id: c.categoryId || null,
    city: c.city || '', neighborhood: c.neighborhood || '',
    address: c.address || '', lat: c.lat || 0, lng: c.lng || 0,
    maps_link: c.mapsLink || '', notes: c.notes || '',
    activity_status: c.activityStatus || {},
    updated_at: now,
  })));

  // ── environments (nested inside clients) ──────────────────────────────────
  const allEnvs = clients.flatMap(c =>
    (c.environments || []).map(e => ({
      id: e.id, workspace: ws, client_id: c.id,
      type_id: e.typeId || null, label: e.label || '',
      height: parseFloat(e.height) || null,
      width: parseFloat(e.width) || null,
      length: parseFloat(e.length) || null,
      notes: e.notes || '', estufa_type: e.estufaType || 'grampo',
      grampo_qty: parseInt(e.grampoQty) || null,
      grampo_size: e.grampoSize || '28',
      photo_ids: e.photoIds || [],
      furnace: e.furnace || {},
      updated_at: now,
    }))
  );
  await upsertTable('environments', allEnvs);

  // ── products ──────────────────────────────────────────────────────────────
  await upsertTable('products', (payload.products || []).map(p => ({
    id: p.id, workspace: ws, name: p.name, model: p.model || '', rep_commission_pct: p.repCommissionPct || 0,
    category_id: p.categoryId || null, dimensions: p.dimensions || '',
    color: p.color || '', price: p.price || 0, notes: p.notes || '',
    photo_ids: p.photoIds || [], updated_at: now,
  })));

  // ── visits ────────────────────────────────────────────────────────────────
  await upsertTable('visits', (payload.visits || []).map(v => ({
    id: v.id, workspace: ws, client_id: v.clientId,
    date: v.date, notes: v.notes || '',
    next_contact: v.nextContact || null, updated_at: now,
  })));

  // ── leads ─────────────────────────────────────────────────────────────────
  await upsertTable('leads', (payload.leads || []).map(l => ({
    id: l.id, workspace: ws, name: l.name, phone: l.phone || '',
    reference: l.reference || '', referral_id: l.referralId || null,
    referral_name: l.referralName || '', lat: l.lat || 0, lng: l.lng || 0,
    status: l.status || 'active',
    converted_client_id: l.convertedClientId || null,
    created_at: l.createdAt || now, updated_at: now,
  })));

  // ── orders ────────────────────────────────────────────────────────────────
  const orders = payload.orders || [];
  await upsertTable('orders', orders.map(o => ({
    id: o.id, workspace: ws, client_id: o.clientId, env_id: o.envId || null,
    date: o.date, payment_type: o.paymentType,
    installments: parseInt(o.installments) || null,
    fin_status: o.finStatus || 'pendente',
    referral_id: o.referralId || null, referral_name: o.referralName || '',
    status: o.status, notes: o.notes || '', total: o.total || 0,
    commission_type: o.commissionType || 'fixed', commission_value: o.commissionValue || 0, commission_pct: o.commissionPct || 0,
    updated_at: now,
  })));

  // ── order_items ───────────────────────────────────────────────────────────
  const allItems = orders.flatMap(o =>
    (o.items || []).map(i => ({
      order_id: o.id, workspace: ws,
      product_id: i.productId || null, product_name: i.productName || '',
      qty: i.qty || 1, unit_price: i.unitPrice || 0,
      updated_at: now,
    }))
  );
  // Para order_items usamos delete+insert pois não têm id estável no app
  if (orders.length) {
    const orderIds = orders.map(o => `"${o.id}"`).join(',');
    await sb(`/rest/v1/order_items?order_id=in.(${orderIds})&workspace=eq.${encodeURIComponent(ws)}`, { method: 'DELETE' });
    if (allItems.length) {
      await sb('/rest/v1/order_items', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: allItems,
      });
    }
  }

  // ── rep_commissions ──────────────────────────────────────────────────────
  await upsertTable('rep_commissions', (payload.repCommissions || []).map(c => ({
    id: c.id, workspace: ws,
    order_id: c.orderId || null, order_date: c.orderDate || null,
    client_id: c.clientId || null, client_name: c.clientName || '',
    product_id: c.productId || null, product_name: c.productName || '',
    qty: c.qty || 1, unit_price: c.unitPrice || 0,
    rep_commission_pct: c.repCommissionPct || 0,
    amount: c.amount || 0, order_total: c.orderTotal || 0,
    status: c.status || 'pendente', paid_at: c.paidAt || null,
    receipt_photo_ids: c.receiptPhotoIds || [],
    updated_at: now,
  })));

  // ── commissions ───────────────────────────────────────────────────────────
  await upsertTable('commissions', (payload.commissions || []).map(c => ({
    id: c.id, workspace: ws,
    referral_id: c.referralId || null, referral_name: c.referralName || '',
    order_id: c.orderId, client_id: c.clientId, client_name: c.clientName || '',
    amount: c.amount || 0, status: c.status,
    created_at: c.createdAt || now, paid_at: c.paidAt || null,
    order_date: c.orderDate || null, order_total: c.orderTotal || 0, receipt_photo_ids: c.receiptPhotoIds || [],
    updated_at: now,
  })));

  // ── company_settings ──────────────────────────────────────────────────────
  const co = payload.company || {};
  await sb(`/rest/v1/company_settings?on_conflict=workspace`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: [{
      workspace: ws, name: co.name || '', cnpj: co.cnpj || '',
      phone: co.phone || '', bank_name: co.bankName || '',
      bank_agency: co.bankAgency || '', bank_account: co.bankAccount || '',
      bank_pix: co.bankPix || '', address: co.address || '',
      tiktok: co.tiktok || '', facebook: co.facebook || '',
      instagram: co.instagram || '', x: co.x || '', linkedin: co.linkedin || '',
      updated_at: now,
    }],
  });

  // ── representative_settings ───────────────────────────────────────────────
  const rep = payload.representative || {};
  await sb(`/rest/v1/representative_settings?on_conflict=workspace`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: [{ workspace: ws, name: rep.name || '', cities: rep.cities || [], updated_at: now }],
  });
}

// ── Handler principal ────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  const { validateSyncKey, cors, body: getBody, ok, err } = require('./_supabase');
  cors(res, req);

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    validateSyncKey(req);
    const ws = sanitize(req.query?.workspace || req.headers['x-workspace'] || 'principal');

    if (req.method === 'GET') {
      const state = await readAll(ws);
      ok(res, { workspace: ws, payload: state, updatedAt: new Date().toISOString() });
      return;
    }

    if (req.method === 'POST') {
      const b = getBody(req);
      if (!b?.payload || typeof b.payload !== 'object') {
        res.status(400).end(JSON.stringify({ ok: false, error: 'Payload inválido' }));
        return;
      }
      await writeAll(ws, b.payload);
      ok(res, { workspace: ws, updatedAt: new Date().toISOString() });
      return;
    }

    res.status(405).end(JSON.stringify({ ok: false, error: 'Método não permitido' }));
  } catch (e) {
    err(res, e);
  }
};
