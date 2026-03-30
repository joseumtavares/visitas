/**
 * services/commissionService.js
 * Lógica central de comissões — indicador e representante.
 *
 * PRINCÍPIOS:
 *  - Idempotente: pode ser chamado N vezes sem duplicar
 *  - Imutável: retorna novos arrays, não muta o estado
 *  - Preserva pagas: comissões com status='paga' nunca são sobrescritas
 *  - Chave de negócio do rep: orderItemId (não mais order+product)
 */

import { uuid } from '@/lib/uuid';

// ─────────────────────────────────────────────────────────────────────────────
// COMISSÃO DO INDICADOR
// Regra: 1 comissão por pedido (deduplicada por orderId)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gera (ou preserva) a comissão do indicador para um pedido pago.
 * @param {object} state  - estado completo { commissions, referrals, clients }
 * @param {string} orderId
 * @param {object} orderObj
 * @param {string} orderDate
 * @returns {Array} novo array de commissions
 */
export function buildReferralCommission(state, orderId, orderObj, orderDate) {
  const existing = (state.commissions || []);

  // Já existe comissão para esse pedido? → preserva (mesmo se paga)
  if (existing.some(c => c.orderId === orderId)) {
    return existing;
  }

  if (!orderObj.referralId) return existing;

  const ref = (state.referrals || []).find(r => r.id === orderObj.referralId);
  if (!ref) return existing;

  const commType = orderObj.commissionType || ref.commissionType || 'fixed';
  let amount = 0;

  if (commType === 'percent') {
    const pct = parseFloat(orderObj.commissionPct || ref.commissionPct || 0);
    amount = Math.round((orderObj.total || 0) * (pct / 100) * 100) / 100;
  } else {
    amount = parseFloat(orderObj.commissionValue || ref.commission || 0);
  }

  if (amount <= 0) return existing;

  const clientName = (state.clients || []).find(c => c.id === orderObj.clientId)?.name || '—';

  const newComm = {
    id:             uuid(),
    referralId:     orderObj.referralId,
    referralName:   ref.name,
    orderId,
    clientId:       orderObj.clientId,
    clientName,
    amount,
    commissionType: commType,
    status:         'pendente',
    receiptPhotoIds: [],
    createdAt:      new Date().toISOString(),
    paidAt:         null,
    orderDate:      orderDate || new Date().toISOString(),
    orderTotal:     orderObj.total || 0,
  };

  return [newComm, ...existing];
}

// ─────────────────────────────────────────────────────────────────────────────
// COMISSÃO DO REPRESENTANTE
// Regra: 1 comissão por ITEM do pedido (chave: orderItemId)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gera (ou reprocessa) as comissões do representante para um pedido pago.
 *
 * Estratégia:
 *  a) Comissões JÁ PAGAS do pedido → preservadas intactas
 *  b) Comissões PENDENTES do pedido → removidas e recriadas com valores atuais
 *  c) Itens sem comissão → criados
 *  d) Comissões pendentes de itens que não existem mais → descartadas
 *
 * @param {object} state   - estado completo { repCommissions, products, clients }
 * @param {string} orderId
 * @param {object} orderObj - { items: [{id, productId, productName, qty, unitPrice, repCommissionPct}], clientId, total }
 * @param {string} orderDate
 * @returns {Array} novo array de repCommissions
 */
export function buildRepCommissions(state, orderId, orderObj, orderDate) {
  const allRepComms = state.repCommissions || [];
  const items       = orderObj.items || [];
  const clientName  = (state.clients || []).find(c => c.id === orderObj.clientId)?.name || '—';
  const now         = new Date().toISOString();

  // Comissões de OUTROS pedidos → mantém intactas
  const otherOrders = allRepComms.filter(c => c.orderId !== orderId);

  // Comissões PAGAS deste pedido → preserva, nunca altera
  const paidComms   = allRepComms.filter(c => c.orderId === orderId && c.status === 'paga');

  // IDs de itens cujas comissões já foram pagas → não reprocessar
  const paidItemIds = new Set(paidComms.map(c => c.orderItemId).filter(Boolean));

  // Gera comissões para itens pendentes (não pagos)
  const newItemComms = items
    .filter(item => !paidItemIds.has(item.id))
    .map(item => {
      // Percentual: snapshot do item tem prioridade; fallback no produto atual
      const prod = (state.products || []).find(p => p.id === item.productId);
      const pct  = parseFloat(
        item.repCommissionPct ??           // snapshot gravado no item (v10)
        prod?.repCommissionPct ??          // valor atual do produto (fallback)
        0
      );
      if (pct <= 0) return null;

      const amount = Math.round(
        (item.unitPrice || 0) * (item.qty || 1) * (pct / 100) * 100
      ) / 100;
      if (amount <= 0) return null;

      return {
        id:               uuid(),
        orderId,
        orderItemId:      item.id,               // ← chave de negócio v10
        orderDate:        orderDate || now,
        clientId:         orderObj.clientId,
        clientName,
        productId:        item.productId,
        productName:      item.productName || prod?.name || '—',
        qty:              item.qty || 1,
        unitPrice:        item.unitPrice || 0,
        repCommissionPct: pct,                   // snapshot
        amount,
        orderTotal:       orderObj.total || 0,
        status:           'pendente',
        paidAt:           null,
        receiptPhotoIds:  [],
        reprocessedAt:    null,
        createdAt:        now,
      };
    })
    .filter(Boolean);

  return [...otherOrders, ...paidComms, ...newItemComms];
}

// ─────────────────────────────────────────────────────────────────────────────
// REPROCESSAMENTO GLOBAL
// Percorre todos os pedidos pagos e reconstrói comissões pendentes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reprocessa comissões de TODOS os pedidos pagos.
 * Idempotente e seguro: preserva pagas, remove pendentes obsoletas.
 *
 * @param {object} state - estado completo do app
 * @returns {{ commissions: Array, repCommissions: Array, count: number }}
 */
export function reprocessAllCommissions(state) {
  let newCommissions    = [...(state.commissions || [])];
  let newRepCommissions = [...(state.repCommissions || [])];
  let count = 0;

  const paidOrders = (state.orders || []).filter(o => o.status === 'pago');

  for (const order of paidOrders) {
    const orderDate = order.date || new Date().toISOString();
    const needsWork = _orderNeedsReprocess(state, order, newCommissions, newRepCommissions);

    if (!needsWork) continue;

    // Recalcula indicador
    const nextState1 = { ...state, commissions: newCommissions, repCommissions: newRepCommissions };
    newCommissions = buildReferralCommission(nextState1, order.id, order, orderDate);

    // Recalcula representante
    const nextState2 = { ...state, commissions: newCommissions, repCommissions: newRepCommissions };
    newRepCommissions = buildRepCommissions(nextState2, order.id, order, orderDate);

    count++;
  }

  return { commissions: newCommissions, repCommissions: newRepCommissions, count };
}

/**
 * Verifica se um pedido precisa de reprocessamento.
 * Detecta: comissão ausente, item novo, item removido, qty/preço/pct alterado.
 */
function _orderNeedsReprocess(state, order, commissions, repCommissions) {
  // Verificar comissão do indicador
  if (order.referralId) {
    const hasRefComm = commissions.some(c => c.orderId === order.id);
    if (!hasRefComm) return true;
  }

  // Verificar comissões do representante
  const existingRepComms = repCommissions.filter(
    c => c.orderId === order.id && c.status === 'pendente'
  );

  const items = (order.items || []);
  const eligibleItems = items.filter(item => {
    const prod = (state.products || []).find(p => p.id === item.productId);
    const pct  = parseFloat(item.repCommissionPct ?? prod?.repCommissionPct ?? 0);
    return pct > 0;
  });

  // Itens elegíveis sem comissão?
  if (eligibleItems.length !== existingRepComms.length) return true;

  // Algum item mudou qty, preço ou percentual?
  for (const item of eligibleItems) {
    const existing = existingRepComms.find(c => c.orderItemId === item.id);
    if (!existing) return true;

    const prod = (state.products || []).find(p => p.id === item.productId);
    const pct  = parseFloat(item.repCommissionPct ?? prod?.repCommissionPct ?? 0);

    if (
      existing.qty      !== (item.qty || 1)        ||
      existing.unitPrice !== (item.unitPrice || 0)  ||
      existing.repCommissionPct !== pct
    ) return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE PAGAMENTO
// ─────────────────────────────────────────────────────────────────────────────

export function payReferralCommission(commissions, commId) {
  return commissions.map(c =>
    c.id === commId
      ? { ...c, status: 'paga', paidAt: new Date().toISOString() }
      : c
  );
}

export function payRepCommission(repCommissions, commId) {
  return repCommissions.map(c =>
    c.id === commId
      ? { ...c, status: 'paga', paidAt: new Date().toISOString() }
      : c
  );
}

export function updateRepCommissionReceipt(repCommissions, commId, photoIds) {
  return repCommissions.map(c =>
    c.id === commId ? { ...c, receiptPhotoIds: photoIds } : c
  );
}

export function updateCommissionReceipt(commissions, commId, photoIds) {
  return commissions.map(c =>
    c.id === commId ? { ...c, receiptPhotoIds: photoIds } : c
  );
}
