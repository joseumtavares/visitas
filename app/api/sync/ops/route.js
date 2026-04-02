/**
 * app/api/sync/ops/route.js  — v10.1
 *
 * POST /api/sync/ops?workspace=X
 *
 * Recebe operações pendentes do cliente e retorna mudanças remotas.
 * Modelo offline-first: NÃO sobrescreve dados que não vieram no payload.
 *
 * Body:
 *   operations  — array de operações pendentes (create/update/delete)
 *   lastSyncAt  — ISO string do último sync bem-sucedido (ou null)
 *   deviceId    — ID do dispositivo remetente
 *
 * Retorna:
 *   ok, serverTs, changes (o que mudou no remoto desde lastSyncAt)
 */

import { NextResponse } from 'next/server';
import { sb, validateSyncKey, sanitizeWorkspace } from '@/lib/supabase';

// Mapeamento: entidade do cliente → tabela no banco
const ENTITY_TABLE = {
  orders:          'orders',
  clients:         'clients',
  visits:          'visits',
  products:        'products',
  commissions:     'commissions',
  repCommissions:  'rep_commissions',
  leads:           'leads',
  referrals:       'referrals',
};

// Campos de cada entidade que precisam de conversão camelCase → snake_case
// (Para entidades mais complexas, use os mappers do sync principal)
function toSnake(entity, payload, ws) {
  const now = new Date().toISOString();
  if (entity === 'orders') {
    return {
      id:              payload.id,
      workspace:       ws,
      client_id:       payload.clientId,
      env_id:          payload.envId || null,
      date:            payload.date,
      payment_type:    payload.paymentType,
      installments:    payload.installments || null,
      fin_status:      payload.finStatus || 'pendente',
      referral_id:     payload.referralId || null,
      referral_name:   payload.referralName || '',
      status:          payload.status,
      notes:           payload.notes || '',
      total:           payload.total || 0,
      order_number:    payload.orderNumber || null,
      commission_type:  payload.commissionType || 'fixed',
      commission_value: payload.commissionValue || 0,
      commission_pct:   payload.commissionPct || 0,
      updated_at:      now,
    };
  }
  if (entity === 'clients') {
    return {
      id:             payload.id,
      workspace:      ws,
      name:           payload.name,
      phone1:         payload.phone1,
      phone2:         payload.phone2 || '',
      category_id:    payload.categoryId || null,
      cep:            payload.cep || '',
      street:         payload.street || '',
      number:         payload.number || '',
      complement:     payload.complement || '',
      neighborhood:   payload.neighborhood || '',
      city:           payload.city || '',
      state:          payload.state || '',
      address:        payload.address || '',
      lat:            payload.lat || 0,
      lng:            payload.lng || 0,
      maps_link:      payload.mapsLink || '',
      notes:          payload.notes || '',
      activity_status: payload.activityStatus || {},
      document_front_path:   payload.documentFrontPath || null,
      document_back_path:    payload.documentBackPath || null,
      residence_proof_path:  payload.residenceProofPath || null,
      updated_at:     now,
    };
  }
  if (entity === 'visits') {
    return {
      id:            payload.id,
      workspace:     ws,
      client_id:     payload.clientId,
      date:          payload.date,
      notes:         payload.notes || '',
      next_contact:  payload.nextContact || null,
      activity_type: payload.activityType || 'Visita', // Bug B fix: campos v10.2
      lat:           payload.lat || 0,                  // Bug B fix: geolocalização
      lng:           payload.lng || 0,                  // Bug B fix: geolocalização
      updated_at:    now,
    };
  }
  if (entity === 'commissions') {
    return {
      id:             payload.id,
      workspace:      ws,
      referral_id:    payload.referralId || null,
      referral_name:  payload.referralName || '',
      order_id:       payload.orderId,
      client_id:      payload.clientId,
      client_name:    payload.clientName || '',
      amount:         payload.amount || 0,
      status:         payload.status,
      commission_type: payload.commissionType || 'fixed',
      paid_at:        payload.paidAt || null,
      receipt_photo_ids: payload.receiptPhotoIds || [],
      updated_at:     now,
    };
  }
  if (entity === 'rep_commissions' || entity === 'repCommissions') {
    return {
      id:                 payload.id,
      workspace:          ws,
      order_id:           payload.orderId,
      order_item_id:      payload.orderItemId || null,
      order_date:         payload.orderDate || null,
      client_id:          payload.clientId || null,
      client_name:        payload.clientName || '',
      product_id:         payload.productId || null,
      product_name:       payload.productName || '',
      qty:                payload.qty || 1,
      unit_price:         payload.unitPrice || 0,
      rep_commission_pct: payload.repCommissionPct || 0,
      amount:             payload.amount || 0,
      order_total:        payload.orderTotal || 0,
      status:             payload.status || 'pendente',
      paid_at:            payload.paidAt || null,
      receipt_photo_ids:  payload.receiptPhotoIds || [],
      updated_at:         now,
    };
  }
  // Fallback genérico
  return { ...payload, workspace: ws, updated_at: now };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aplicar uma operação no banco
// ─────────────────────────────────────────────────────────────────────────────

async function applyOperation(op, ws, errors) {
  const table = ENTITY_TABLE[op.entity] || op.entity;
  const enc   = encodeURIComponent(ws);

  try {
    if (op.opType === 'delete') {
      // Soft delete via tombstone
      await sb(`/rest/v1/${table}?id=eq.${op.entityId}&workspace=eq.${enc}`, {
        method: 'DELETE',
      });
      // Registrar tombstone
      await sb(`/rest/v1/deleted_records?on_conflict=workspace,table_name,record_id`, {
        method:  'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: [{
          workspace:  ws,
          table_name: table,
          record_id:  op.entityId,
          deleted_at: new Date().toISOString(),
        }],
      }).catch(() => {}); // tombstone é best-effort
      return;
    }

    const row = toSnake(op.entity, op.payload, ws);

    // create ou update: upsert por id
    await sb(`/rest/v1/${table}?on_conflict=id`, {
      method:  'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body:    [row],
    });

    // Para pedidos: sincronizar itens
    if (op.entity === 'orders' && op.opType !== 'delete' && op.payload.items?.length) {
      await syncOrderItems(op.payload, ws);
    }

  } catch (e) {
    errors.push({ op: op.id, entity: op.entity, opType: op.opType, error: e.message });
    console.error(`[sync/ops] erro em ${op.entity}/${op.opType}:`, e.message);
  }
}

async function syncOrderItems(order, ws) {
  const now   = new Date().toISOString();
  const items = (order.items || []).map(i => ({
    id:                i.id,
    workspace:         ws,
    order_id:          order.id,
    product_id:        i.productId || null,
    product_name:      i.productName || '',
    qty:               i.qty || 1,
    unit_price:        i.unitPrice || 0,
    rep_commission_pct: i.repCommissionPct || 0,
    updated_at:        now,
  }));

  if (!items.length) return;

  // Upsert por id
  const CHUNK = 100;
  for (let i = 0; i < items.length; i += CHUNK) {
    await sb(`/rest/v1/order_items?on_conflict=id`, {
      method:  'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body:    items.slice(i, i + CHUNK),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Buscar mudanças remotas desde lastSyncAt
// ─────────────────────────────────────────────────────────────────────────────

async function fetchChangesSince(ws, lastSyncAt, deviceId) {
  const enc   = encodeURIComponent(ws);
  const since = lastSyncAt ? `&updated_at=gt.${encodeURIComponent(lastSyncAt)}` : '';

  // Busca registros atualizados depois do último sync
  // Exclui mudanças feitas pelo próprio dispositivo (evita eco)
  const [orders, clients, visits, commissions, repCommissions, tombstones] = await Promise.all([
    sb(`/rest/v1/orders?workspace=eq.${enc}${since}&select=*`).catch(() => []),
    sb(`/rest/v1/clients?workspace=eq.${enc}${since}&select=*`).catch(() => []),
    sb(`/rest/v1/visits?workspace=eq.${enc}${since}&select=*`).catch(() => []),
    sb(`/rest/v1/commissions?workspace=eq.${enc}${since}&select=*`).catch(() => []),
    sb(`/rest/v1/rep_commissions?workspace=eq.${enc}${since}&select=*`).catch(() => []),
    // Tombstones recentes
    lastSyncAt
      ? sb(`/rest/v1/deleted_records?workspace=eq.${enc}&deleted_at=gt.${encodeURIComponent(lastSyncAt)}&select=*`).catch(() => [])
      : Promise.resolve([]),
  ]);

  return {
    orders:         orders || [],
    clients:        clients || [],
    visits:         visits || [],
    commissions:    commissions || [],
    repCommissions: repCommissions || [],
    tombstones:     tombstones || [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    validateSyncKey(request);
    const ws = sanitizeWorkspace(request.nextUrl.searchParams.get('workspace') || 'principal');

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Body inválido.' }, { status: 400 });
    }

    const { operations = [], lastSyncAt = null, deviceId = 'unknown' } = body;
    const errors = [];
    const serverTs = new Date().toISOString();

    // 1. Aplicar operações do cliente em ordem cronológica
    const sorted = [...operations].sort((a, b) =>
      new Date(a.clientTs) - new Date(b.clientTs)
    );

    for (const op of sorted) {
      await applyOperation(op, ws, errors);
    }

    // 2. Buscar o que mudou remotamente desde o último sync do dispositivo
    const changes = await fetchChangesSince(ws, lastSyncAt, deviceId);

    return NextResponse.json({
      ok:        true,
      serverTs,
      pushedOps: sorted.length,
      changes,
      warnings:  errors.length ? errors : undefined,
    });

  } catch (e) {
    console.error('[sync/ops POST]', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-app-key, x-workspace, x-device-id',
    },
  });
}
