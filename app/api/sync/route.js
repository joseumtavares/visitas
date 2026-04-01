/**
 * app/api/sync/route.js  — v10.2 CORRIGIDO
 *
 * GET  /api/sync?workspace=X  → lê todas as tabelas e devolve estado completo
 * POST /api/sync?workspace=X  → recebe estado completo e sincroniza
 *
 * CORREÇÕES v10:
 *  - rep_commissions: upsert usa order_item_id como chave de negócio
 *  - order_items: inclui rep_commission_pct (snapshot)
 *  - clients: inclui campos de endereço separados (cep, street, number, etc.)
 *  - warnings de sync são logados E retornados ao frontend (sem falha silenciosa)
 *  - erros de rep_commissions não são mais engolidos silenciosamente
 */

import { NextResponse } from 'next/server';
import {
  sb, upsertTable, validateSyncKey, sanitizeWorkspace,
} from '@/lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// LEITURA (GET)
// ─────────────────────────────────────────────────────────────────────────────

async function readAll(ws) {
  const enc = encodeURIComponent(ws);

  const [
    categories, envTypes, productCategories, customStatusTypes,
    clients, environments, products, visits,
    referrals, leads, orders, orderItems,
    commissions, repCommissions,
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
    sb(`/rest/v1/deleted_records?workspace=eq.${enc}&select=*`).catch(() => []),
  ]);

  // Clientes com ambientes aninhados
  const clientsWithEnvs = (clients || []).map(c => ({
    id:          c.id,
    name:        c.name,
    phone1:      c.phone1,
    phone2:      c.phone2 || '',
    categoryId:  c.category_id || '',
    // Endereço separado (v10)
    cep:         c.cep || '',
    street:      c.street || '',
    number:      c.number || '',
    complement:  c.complement || '',
    neighborhood: c.neighborhood || '',
    city:        c.city || '',
    state:       c.state || '',
    address:     c.address || '',       // legado / campo unificado
    lat:         c.lat || 0,
    lng:         c.lng || 0,
    mapsLink:    c.maps_link || '',
    notes:       c.notes || '',
    activityStatus: c.activity_status || {
      hasEquip: false, bioPellets: false, cavaco: false,
      briquete: false, pellets: false, customFlags: {}, custom: '',
    },
    // Documentos (v10.2)
    documentFrontPath:   c.document_front_path   || null,
    documentBackPath:    c.document_back_path     || null,
    residenceProofPath:  c.residence_proof_path   || null,
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

  // Pedidos com itens aninhados
  const ordersWithItems = (orders || []).map(o => ({
    id:            o.id,
    clientId:      o.client_id,
    envId:         o.env_id || '',
    date:          o.date,
    paymentType:   o.payment_type,
    installments:  o.installments || '',
    finStatus:     o.fin_status || 'pendente',
    referralId:    o.referral_id || '',
    referralName:  o.referral_name || '',
    status:        o.status,
    notes:         o.notes || '',
    total:         o.total,
    commissionType:  o.commission_type || 'fixed',
    commissionValue: o.commission_value || 0,
    commissionPct:   o.commission_pct || 0,
    orderNumber:     o.order_number || null,   // BUG FIX v10.2
    items: (orderItems || [])
      .filter(i => i.order_id === o.id)
      .map(i => ({
        id:               i.id,
        productId:        i.product_id,
        productName:      i.product_name || '',
        qty:              i.qty,
        unitPrice:        i.unit_price,
        repCommissionPct: i.rep_commission_pct || 0,   // snapshot v10
      })),
  }));

  // Tombstones agrupados por tabela
  const tombstones = {};
  for (const row of (deletedRecords || [])) {
    if (!tombstones[row.table_name]) tombstones[row.table_name] = [];
    tombstones[row.table_name].push(row.record_id);
  }

  const company = companyRows?.[0] || {};
  const rep     = repRows?.[0] || {};

  return {
    categories:        (categories || []).map(c => ({ id: c.id, name: c.name, desc: c.description || '' })),
    envTypes:          (envTypes || []).map(e => ({ id: e.id, name: e.name })),
    productCategories: (productCategories || []).map(p => ({ id: p.id, name: p.name })),
    customStatusTypes: (customStatusTypes || []).map(t => ({ id: t.id, label: t.label })),
    clients:           clientsWithEnvs,
    products: (products || []).map(p => ({
      id: p.id, name: p.name, model: p.model || '', categoryId: p.category_id || '',
      dimensions: p.dimensions || '', color: p.color || '',
      price: p.price || 0, repCommissionPct: p.rep_commission_pct || 0,
      notes: p.notes || '', photoIds: p.photo_ids || [],
      finameCode: p.finame_code || '',   // v10.2
      ncmCode:    p.ncm_code    || '',   // v10.2
    })),
    visits: (visits || []).map(v => ({
      id: v.id, clientId: v.client_id, date: v.date,
      notes: v.notes || '', nextContact: v.next_contact || '',
      activityType: v.activity_type || 'Visita',  // v10.2
      lat: v.lat || 0, lng: v.lng || 0,           // v10.2 — geoloc da visita
    })),
    referrals: (referrals || []).map(r => ({
      id: r.id, name: r.name, commission: r.commission || 0,
      commissionType: r.commission_type || 'fixed',
      commissionPct: r.commission_pct || 0,
      cpf: r.cpf || '', phone: r.phone || '',
      bankName: r.bank_name || '', bankAgency: r.bank_agency || '',
      bankAccount: r.bank_account || '', bankPix: r.bank_pix || '',
    })),
    leads: (leads || []).map(l => ({
      id: l.id, name: l.name, phone: l.phone || '',
      reference: l.reference || '', referralId: l.referral_id || '',
      referralName: l.referral_name || '', lat: l.lat || 0, lng: l.lng || 0,
      mapsLink: l.maps_link || '', notes: l.notes || '',
      status: l.status || 'active',
      convertedClientId: l.converted_client_id || null, createdAt: l.created_at,
    })),
    orders: ordersWithItems,
    commissions: (commissions || []).map(c => ({
      id: c.id, referralId: c.referral_id, referralName: c.referral_name || '',
      orderId: c.order_id, clientId: c.client_id, clientName: c.client_name || '',
      amount: c.amount, status: c.status, commissionType: c.commission_type || 'fixed',
      createdAt: c.created_at, paidAt: c.paid_at || null,
      orderDate: c.order_date || null, orderTotal: c.order_total || 0,
      receiptPhotoIds: c.receipt_photo_ids || [],
    })),
    repCommissions: (repCommissions || []).map(c => ({
      id:               c.id,
      orderId:          c.order_id,
      orderItemId:      c.order_item_id || null,   // v10
      orderDate:        c.order_date,
      clientId:         c.client_id,
      clientName:       c.client_name || '',
      productId:        c.product_id,
      productName:      c.product_name || '',
      qty:              c.qty || 1,
      unitPrice:        c.unit_price || 0,
      repCommissionPct: c.rep_commission_pct || 0,
      amount:           c.amount || 0,
      orderTotal:       c.order_total || 0,
      status:           c.status || 'pendente',
      paidAt:           c.paid_at || null,
      receiptPhotoIds:  c.receipt_photo_ids || [],
      reprocessedAt:    c.reprocessed_at || null,
      createdAt:        c.created_at,
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
    _tombstones: tombstones,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPAGAR EXCLUSÕES (tombstone)
// ─────────────────────────────────────────────────────────────────────────────

async function propagateDeletions(ws, table, sentIds, fetchPath) {
  const existing    = await sb(fetchPath).catch(() => []);
  const existingIds = (existing || []).map(r => r.id);
  const sentSet     = new Set(sentIds);
  const toDelete    = existingIds.filter(id => !sentSet.has(id));
  if (!toDelete.length) return;

  const now = new Date().toISOString();
  const enc = encodeURIComponent(ws);

  // Registrar tombstones
  await sb(`/rest/v1/deleted_records?on_conflict=workspace,table_name,record_id`, {
    method:  'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body:    toDelete.map(record_id => ({ workspace: ws, table_name: table, record_id, deleted_at: now })),
  }).catch(e => console.warn(`[sync] tombstone ${table}:`, e.message));

  // Deletar em lotes
  const CHUNK = 100;
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const ids = toDelete.slice(i, i + CHUNK).map(id => `"${id}"`).join(',');
    await sb(`/rest/v1/${table}?id=in.(${ids})&workspace=eq.${enc}`, { method: 'DELETE' })
      .catch(e => console.warn(`[sync] delete ${table}:`, e.message));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ESCRITA (POST)
// ─────────────────────────────────────────────────────────────────────────────

async function writeAll(ws, payload) {
  const now    = new Date().toISOString();
  const enc    = encodeURIComponent(ws);
  const errors = [];

  const safe = async (label, fn) => {
    try {
      await fn();
    } catch (e) {
      errors.push({ table: label, error: e.message, details: e.details || '' });
      console.error(`[sync] ERRO em ${label}:`, e.message, e.details || '');
    }
  };

  // ── lookup tables ──────────────────────────────────────────────────────────
  await safe('categories', async () => {
    const rows = (payload.categories || []).map(c => ({
      id: c.id, workspace: ws, name: c.name, description: c.desc || '', updated_at: now,
    }));
    await upsertTable('categories', rows);
    await propagateDeletions(ws, 'categories', rows.map(r => r.id), `/rest/v1/categories?workspace=eq.${enc}&select=id`);
  });

  await safe('env_types', async () => {
    const rows = (payload.envTypes || []).map(e => ({
      id: e.id, workspace: ws, name: e.name, updated_at: now,
    }));
    await upsertTable('env_types', rows);
    await propagateDeletions(ws, 'env_types', rows.map(r => r.id), `/rest/v1/env_types?workspace=eq.${enc}&select=id`);
  });

  await safe('product_categories', async () => {
    const rows = (payload.productCategories || []).map(p => ({
      id: p.id, workspace: ws, name: p.name, updated_at: now,
    }));
    await upsertTable('product_categories', rows);
    await propagateDeletions(ws, 'product_categories', rows.map(r => r.id), `/rest/v1/product_categories?workspace=eq.${enc}&select=id`);
  });

  await safe('custom_status_types', async () => {
    const rows = (payload.customStatusTypes || []).map(t => ({
      id: t.id, workspace: ws, label: t.label, updated_at: now,
    }));
    await upsertTable('custom_status_types', rows);
    await propagateDeletions(ws, 'custom_status_types', rows.map(r => r.id), `/rest/v1/custom_status_types?workspace=eq.${enc}&select=id`);
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
    await propagateDeletions(ws, 'referrals', rows.map(r => r.id), `/rest/v1/referrals?workspace=eq.${enc}&select=id`);
  });

  // ── clients ───────────────────────────────────────────────────────────────
  const clients = payload.clients || [];
  await safe('clients', async () => {
    const rows = clients.map(c => ({
      id: c.id, workspace: ws, name: c.name, phone1: c.phone1, phone2: c.phone2 || '',
      category_id: c.categoryId || null,
      // Endereço separado (v10)
      cep:          c.cep || '',
      street:       c.street || '',
      number:       c.number || '',
      complement:   c.complement || '',
      neighborhood: c.neighborhood || '',
      city:         c.city || '',
      state:        c.state || '',
      address:      c.address || '',
      lat: c.lat || 0, lng: c.lng || 0,
      maps_link: c.mapsLink || '', notes: c.notes || '',
      activity_status: c.activityStatus || {}, updated_at: now,
      // Documentos (v10.2)
      document_front_path:  c.documentFrontPath  || null,
      document_back_path:   c.documentBackPath    || null,
      residence_proof_path: c.residenceProofPath  || null,
    }));
    await upsertTable('clients', rows);
    await propagateDeletions(ws, 'clients', rows.map(r => r.id), `/rest/v1/clients?workspace=eq.${enc}&select=id`);
  });

  // ── environments ──────────────────────────────────────────────────────────
  await safe('environments', async () => {
    const allEnvs = clients.flatMap(c =>
      (c.environments || []).map(e => ({
        id: e.id, workspace: ws, client_id: c.id,
        type_id: e.typeId || null, label: e.label || '',
        height: parseFloat(e.height) || null, width: parseFloat(e.width) || null,
        length: parseFloat(e.length) || null, notes: e.notes || '',
        estufa_type: e.estufaType || 'grampo',
        grampo_qty: parseInt(e.grampoQty) || null, grampo_size: e.grampoSize || '28',
        photo_ids: e.photoIds || [], furnace: e.furnace || {}, updated_at: now,
      }))
    );
    await upsertTable('environments', allEnvs);
    await propagateDeletions(ws, 'environments', allEnvs.map(r => r.id), `/rest/v1/environments?workspace=eq.${enc}&select=id`);
  });

  // ── products ──────────────────────────────────────────────────────────────
  await safe('products', async () => {
    const rows = (payload.products || []).map(p => ({
      id: p.id, workspace: ws, name: p.name, model: p.model || '',
      rep_commission_pct: p.repCommissionPct || 0, category_id: p.categoryId || null,
      dimensions: p.dimensions || '', color: p.color || '', price: p.price || 0,
      notes: p.notes || '', photo_ids: p.photoIds || [], updated_at: now,
      finame_code: p.finameCode || '',   // v10.2
      ncm_code:    p.ncmCode    || '',   // v10.2
    }));
    await upsertTable('products', rows);
    await propagateDeletions(ws, 'products', rows.map(r => r.id), `/rest/v1/products?workspace=eq.${enc}&select=id`);
  });

  // ── visits ────────────────────────────────────────────────────────────────
  await safe('visits', async () => {
    const rows = (payload.visits || []).map(v => ({
      id: v.id, workspace: ws, client_id: v.clientId, date: v.date,
      notes: v.notes || '', next_contact: v.nextContact || null, updated_at: now,
      activity_type: v.activityType || 'Visita',  // v10.2
      lat: v.lat || 0, lng: v.lng || 0,           // v10.2
    }));
    await upsertTable('visits', rows);
    await propagateDeletions(ws, 'visits', rows.map(r => r.id), `/rest/v1/visits?workspace=eq.${enc}&select=id`);
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
    await propagateDeletions(ws, 'leads', rows.map(r => r.id), `/rest/v1/leads?workspace=eq.${enc}&select=id`);
  });

  // ── orders ────────────────────────────────────────────────────────────────
  const orders = payload.orders || [];
  await safe('orders', async () => {
    const rows = orders.map(o => ({
      id: o.id, workspace: ws, client_id: o.clientId, env_id: o.envId || null,
      date: o.date, payment_type: o.paymentType,
      installments: parseInt(o.installments) || null,
      fin_status: o.finStatus || 'pendente', referral_id: o.referralId || null,
      referral_name: o.referralName || '', status: o.status,
      notes: o.notes || '', total: o.total || 0,
      commission_type: o.commissionType || 'fixed',
      commission_value: o.commissionValue || 0,
      commission_pct: o.commissionPct || 0,
      updated_at: now,
      // order_number NÃO enviado: trigger set_order_number gera na inserção.
    }));
    await upsertTable('orders', rows);
    await propagateDeletions(ws, 'orders', rows.map(r => r.id), `/rest/v1/orders?workspace=eq.${enc}&select=id`);
  });

  // ── order_items: delete + insert por pedido ───────────────────────────────
  // v10: inclui rep_commission_pct como snapshot
  await safe('order_items', async () => {
    const allItems = orders.flatMap(o =>
      (o.items || []).map(i => ({
        id:                i.id,
        order_id:          o.id,
        workspace:         ws,
        product_id:        i.productId || null,
        product_name:      i.productName || '',
        qty:               i.qty || 1,
        unit_price:        i.unitPrice || 0,
        rep_commission_pct: i.repCommissionPct || 0,   // snapshot v10
        updated_at:        now,
      }))
    );

    if (orders.length) {
      // Usar upsert por id (itens agora têm ID estável)
      await upsertTable('order_items', allItems, 'id');

      // Propagar exclusões de itens removidos
      await propagateDeletions(
        ws, 'order_items', allItems.map(r => r.id),
        `/rest/v1/order_items?workspace=eq.${enc}&select=id`
      );
    }
  });

  // ── commissions (indicador) ───────────────────────────────────────────────
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
    await propagateDeletions(ws, 'commissions', rows.map(r => r.id), `/rest/v1/commissions?workspace=eq.${enc}&select=id`);
  });

  // ── rep_commissions ───────────────────────────────────────────────────────
  // v10: chave de negócio primária = order_item_id
  // Separa registros com e sem order_item_id para usar a constraint correta
  await safe('rep_commissions', async () => {
    const rows = (payload.repCommissions || []).map(c => ({
      id:                c.id,
      workspace:         ws,
      order_id:          c.orderId || null,
      order_item_id:     c.orderItemId || null,     // v10 — chave de negócio
      order_date:        c.orderDate || null,
      client_id:         c.clientId || null,
      client_name:       c.clientName || '',
      product_id:        c.productId || null,
      product_name:      c.productName || '',
      qty:               c.qty || 1,
      unit_price:        c.unitPrice || 0,
      rep_commission_pct: c.repCommissionPct || 0,
      amount:            c.amount || 0,
      order_total:       c.orderTotal || 0,
      status:            c.status || 'pendente',
      paid_at:           c.paidAt || null,
      receipt_photo_ids: c.receiptPhotoIds || [],
      reprocessed_at:    c.reprocessedAt || null,
      updated_at:        now,
    }));

    // Itens com order_item_id: usar constraint rep_commissions_item_unique
    const withItemId    = rows.filter(r => r.order_item_id);
    // Legado (sem order_item_id): upsert por id — não há constraint alternativa segura
    const withoutItemId = rows.filter(r => !r.order_item_id);

    if (withItemId.length) {
      await upsertTable('rep_commissions', withItemId, 'order_item_id');
    }
    if (withoutItemId.length) {
      await upsertTable('rep_commissions', withoutItemId, 'id');
    }

    await propagateDeletions(ws, 'rep_commissions', rows.map(r => r.id),
      `/rest/v1/rep_commissions?workspace=eq.${enc}&select=id`);
  });

  // ── company_settings ──────────────────────────────────────────────────────
  const co = payload.company || {};
  await safe('company_settings', () =>
    sb(`/rest/v1/company_settings?on_conflict=workspace`, {
      method:  'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: [{
        workspace: ws, name: co.name || '', cnpj: co.cnpj || '', phone: co.phone || '',
        bank_name: co.bankName || '', bank_agency: co.bankAgency || '',
        bank_account: co.bankAccount || '', bank_pix: co.bankPix || '',
        address: co.address || '', tiktok: co.tiktok || '', facebook: co.facebook || '',
        instagram: co.instagram || '', x: co.x || '', linkedin: co.linkedin || '',
        updated_at: now,
      }],
    })
  );

  // ── representative_settings ───────────────────────────────────────────────
  const rep = payload.representative || {};
  await safe('representative_settings', () =>
    sb(`/rest/v1/representative_settings?on_conflict=workspace`, {
      method:  'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: [{ workspace: ws, name: rep.name || '', cities: rep.cities || [], updated_at: now }],
    })
  );

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL (App Router)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request) {
  try {
    validateSyncKey(request);
    const ws    = sanitizeWorkspace(request.nextUrl.searchParams.get('workspace') || 'principal');
    const state = await readAll(ws);
    return NextResponse.json({ ok: true, workspace: ws, payload: state, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[sync GET]', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function POST(request) {
  try {
    validateSyncKey(request);
    const ws   = sanitizeWorkspace(request.nextUrl.searchParams.get('workspace') || 'principal');
    const body = await request.json().catch(() => null);

    if (!body?.payload || typeof body.payload !== 'object') {
      return NextResponse.json({ ok: false, error: 'Payload inválido.' }, { status: 400 });
    }

    const syncErrors = await writeAll(ws, body.payload);

    // v10: warnings são sempre retornados — sem falha silenciosa
    return NextResponse.json({
      ok:         true,
      workspace:  ws,
      updatedAt:  new Date().toISOString(),
      warnings:   syncErrors.length ? syncErrors : undefined,
    });
  } catch (e) {
    console.error('[sync POST]', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-app-key, x-workspace',
    },
  });
}
