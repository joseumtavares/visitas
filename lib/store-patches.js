/**
 * lib/store.js  — PATCH v10 para o index.html atual
 *
 * Se você ainda não migrou para Next.js, copie as funções abaixo
 * e substitua as correspondentes no seu index.html.
 *
 * Mudanças principais:
 *  1. _buildCommissions: usa orderItemId como chave de negócio
 *  2. order_items: garantem UUID estável e snapshot de repCommissionPct
 *  3. reprocessCommissions: detecta mudança de qty/preço/pct
 *  4. normalizeDataState: inicializa orderItemId se faltar (migração)
 */

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 1: helper uuid (já existe no index.html — só referência)
// ─────────────────────────────────────────────────────────────────────────────
// const uuid = () => crypto.randomUUID?.() || ... (já existe)

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 2: normalizeDataState — garante que repCommissions tenham orderItemId
// Substitua a sua normalizeDataState por esta versão
// ─────────────────────────────────────────────────────────────────────────────
/*
function normalizeDataState(raw) {
  const d = {
    categories:        raw.categories        || [],
    envTypes:          raw.envTypes          || [],
    productCategories: raw.productCategories || [],
    customStatusTypes: raw.customStatusTypes || [],
    clients:           raw.clients           || [],
    products:          raw.products          || [],
    visits:            raw.visits            || [],
    referrals:         raw.referrals         || [],
    leads:             raw.leads             || [],
    orders: (raw.orders || []).map(o => ({
      ...o,
      items: (o.items || []).map(item => ({
        ...item,
        // PATCH: garantir ID estável nos itens (v10)
        id: item.id || uuid(),
        // PATCH: snapshot do percentual (v10)
        repCommissionPct: item.repCommissionPct ?? 
          (raw.products || []).find(p => p.id === item.productId)?.repCommissionPct ?? 0,
      })),
    })),
    commissions:    raw.commissions    || [],
    repCommissions: (raw.repCommissions || []).map(c => ({
      ...c,
      // PATCH: migração — se não tem orderItemId, tenta localizar pelo productId
      orderItemId: c.orderItemId || null,
    })),
    company:        raw.company        || {},
    representative: raw.representative || {},
    _meta:          raw._meta          || {},
  };
  return d;
}
*/

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 3: _buildCommissions — versão corrigida
// Substitua a função _buildCommissions no seu useStore()
// ─────────────────────────────────────────────────────────────────────────────
/*
const _buildCommissions = (d, orderId, orderObj, orderDate) => {
  const now = new Date().toISOString();
  const items = orderObj.items || [];
  const clientName = d.clients.find(c => c.id === orderObj.clientId)?.name || '—';

  // ── 1. Comissão do indicador (inalterada) ─────────────────────────────────
  let newComm = [...d.commissions];
  if (orderObj.referralId) {
    const ref = d.referrals.find(r => r.id === orderObj.referralId);
    const alreadyExists = newComm.some(c => c.orderId === orderId);
    if (!alreadyExists && ref) {
      const commType = orderObj.commissionType || ref.commissionType || 'fixed';
      let amount = 0;
      if (commType === 'percent') {
        const pct = parseFloat(orderObj.commissionPct || ref.commissionPct || 0);
        amount = Math.round((orderObj.total || 0) * (pct / 100) * 100) / 100;
      } else {
        amount = parseFloat(orderObj.commissionValue || ref.commission || 0);
      }
      if (amount > 0) {
        newComm = [{
          id: uuid(), referralId: orderObj.referralId, referralName: ref.name,
          orderId, clientId: orderObj.clientId, clientName,
          amount, commissionType: commType, status: 'pendente', receiptPhotoIds: [],
          createdAt: now, paidAt: null,
          orderDate, orderTotal: orderObj.total,
        }, ...newComm];
      }
    }
  }

  // ── 2. Comissão do representante — CORRIGIDA (chave: orderItemId) ─────────
  const allRepComms   = d.repCommissions || [];
  const otherOrders   = allRepComms.filter(c => c.orderId !== orderId);
  const paidComms     = allRepComms.filter(c => c.orderId === orderId && c.status === 'paga');
  const paidItemIds   = new Set(paidComms.map(c => c.orderItemId).filter(Boolean));

  const newItemComms = items
    .filter(item => !paidItemIds.has(item.id))
    .map(item => {
      const prod = d.products.find(p => p.id === item.productId);
      // Snapshot: usa percentual do item (gravado no momento da venda)
      // Fallback: usa percentual atual do produto
      const pct = parseFloat(
        item.repCommissionPct != null ? item.repCommissionPct : (prod?.repCommissionPct ?? 0)
      );
      if (pct <= 0) return null;
      const amount = Math.round((item.unitPrice || 0) * (item.qty || 1) * (pct / 100) * 100) / 100;
      if (amount <= 0) return null;
      return {
        id:               uuid(),
        orderId,
        orderItemId:      item.id,          // ← CHAVE DE NEGÓCIO v10
        orderDate:        orderDate || now,
        clientId:         orderObj.clientId,
        clientName,
        productId:        item.productId,
        productName:      item.productName || prod?.name || '—',
        qty:              item.qty || 1,
        unitPrice:        item.unitPrice || 0,
        repCommissionPct: pct,              // snapshot
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

  const newRepComm = [...otherOrders, ...paidComms, ...newItemComms];
  return { newComm, newRepComm };
};
*/

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 4: addOrder — garante UUID estável nos itens antes de chamar _buildCommissions
// Substitua o addOrder no seu useStore()
// ─────────────────────────────────────────────────────────────────────────────
/*
const addOrder = o => up(d => {
  const newId     = uuid();
  const orderDate = new Date().toISOString();
  // PATCH: garantir ID estável em cada item antes de gerar comissão
  const items = (o.items || []).map(item => ({
    ...item,
    id: item.id || uuid(),
    // Snapshot do percentual no momento da venda
    repCommissionPct: item.repCommissionPct != null
      ? item.repCommissionPct
      : (d.products.find(p => p.id === item.productId)?.repCommissionPct ?? 0),
  }));
  const newOrder = { ...o, id: newId, date: orderDate, items };
  let newComm    = [...d.commissions];
  let newRepComm = [...d.repCommissions];
  if (o.status === 'pago') {
    const built = _buildCommissions(d, newId, newOrder, orderDate);
    newComm     = built.newComm;
    newRepComm  = built.newRepComm;
  }
  return { ...d, orders: [newOrder, ...d.orders], commissions: newComm, repCommissions: newRepComm };
});
*/

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 5: reprocessCommissions — detecção completa de divergências
// Substitua o reprocessCommissions no seu useStore()
// ─────────────────────────────────────────────────────────────────────────────
/*
const reprocessCommissions = () => up(d => {
  let state = { ...d };
  let count = 0;

  d.orders.filter(o => o.status === 'pago').forEach(o => {
    const items = (o.items || []);
    const existingRepComms = (d.repCommissions || []).filter(
      c => c.orderId === o.id && c.status === 'pendente'
    );

    // Itens com percentual de comissão
    const eligibleItems = items.filter(item => {
      const prod = d.products.find(p => p.id === item.productId);
      const pct  = parseFloat(item.repCommissionPct ?? prod?.repCommissionPct ?? 0);
      return pct > 0;
    });

    // Verifica se comissão do indicador está ausente
    const hasRefComm = o.referralId
      ? (d.commissions || []).some(c => c.orderId === o.id)
      : true;

    // Verifica se comissões do rep estão completas e corretas
    let repNeedsUpdate = eligibleItems.length !== existingRepComms.length;
    if (!repNeedsUpdate) {
      for (const item of eligibleItems) {
        const existing = existingRepComms.find(c => c.orderItemId === item.id);
        if (!existing) { repNeedsUpdate = true; break; }
        const prod = d.products.find(p => p.id === item.productId);
        const pct  = parseFloat(item.repCommissionPct ?? prod?.repCommissionPct ?? 0);
        if (
          existing.qty              !== (item.qty || 1)       ||
          existing.unitPrice        !== (item.unitPrice || 0) ||
          existing.repCommissionPct !== pct
        ) { repNeedsUpdate = true; break; }
      }
    }

    if (!hasRefComm || repNeedsUpdate) {
      const built = _buildCommissions(state, o.id, o, o.date);
      state = { ...state, commissions: built.newComm, repCommissions: built.newRepComm };
      count++;
    }
  });

  if (count > 0) showToast(`✅ ${count} pedido(s) reprocessado(s).`);
  else showToast('✅ Nenhum reprocessamento necessário.');

  return state;
});
*/

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 6: editOrder — garante snapshot nos itens ao editar
// Modifique o trecho de mergedO no editOrder:
// ─────────────────────────────────────────────────────────────────────────────
/*
const editOrder = (id, o) => up(d => {
  const old = d.orders.find(x => x.id === id);
  // PATCH: garantir ID e snapshot em cada item
  const items = (o.items ?? old?.items ?? []).map(item => ({
    ...item,
    id: item.id || uuid(),
    repCommissionPct: item.repCommissionPct != null
      ? item.repCommissionPct
      : (d.products.find(p => p.id === item.productId)?.repCommissionPct ?? 0),
  }));
  const mergedO = { ...o, items };
  const newOrders = d.orders.map(x => x.id === id ? { ...x, ...mergedO } : x);
  let newComm    = [...d.commissions];
  let newRepComm = [...d.repCommissions];

  const isNowPaid = mergedO.status === 'pago';
  const wasPaid   = old?.status === 'pago';

  if (isNowPaid) {
    const itemsChanged =
      JSON.stringify((mergedO.items || []).map(i => ({ p: i.productId, q: i.qty, u: i.unitPrice, pct: i.repCommissionPct }))) !==
      JSON.stringify((old?.items || []).map(i => ({ p: i.productId, q: i.qty, u: i.unitPrice, pct: i.repCommissionPct })));
    const totalChanged    = mergedO.total    !== old?.total;
    const referralChanged = mergedO.referralId !== old?.referralId;

    if (!wasPaid || itemsChanged || totalChanged || referralChanged) {
      const built = _buildCommissions(
        { ...d, orders: newOrders }, id, mergedO, old?.date || mergedO.date || new Date().toISOString()
      );
      newComm    = built.newComm;
      newRepComm = built.newRepComm;
    }
  }

  return { ...d, orders: newOrders, commissions: newComm, repCommissions: newRepComm };
});
*/

export default {};
