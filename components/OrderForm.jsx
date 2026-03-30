/**
 * components/OrderForm.jsx  — v10.1
 *
 * Formulário de criação e edição de pedidos.
 *
 * CORREÇÕES:
 *  - addOrder: SEMPRE cria UUID novo — nunca reutiliza ID anterior
 *  - items: cada item tem ID estável e snapshot de repCommissionPct
 *  - mesmo produto pode ser adicionado 2x (itens separados com IDs distintos)
 *  - orderNumber exibido no header (gerado pelo banco após sync)
 */

import { useState } from 'react';
import { uuid } from '@/lib/uuid';

const PAY_LABELS  = { avista: 'À Vista', parcelado: 'Parcelado', financiamento: 'Financiamento' };
const FIN_STATUS  = [['pendente','⏳ Em análise'],['aprovado','✅ Aprovado'],['reprovado','❌ Reprovado'],['liberado','🏦 Liberado']];
const fmtMoney    = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OrderForm({ store, setPage, editId, clearEdit }) {
  const { data, addOrder, editOrder, showToast } = store;
  const ex = editId ? data.orders.find(o => o.id === editId) : null;

  const [clientId,       setClientId]       = useState(ex?.clientId       || '');
  const [envId,          setEnvId]           = useState(ex?.envId          || '');
  const [paymentType,    setPaymentType]     = useState(ex?.paymentType    || 'avista');
  const [installments,   setInstallments]    = useState(ex?.installments   || '');
  const [finStatus,      setFinStatus]       = useState(ex?.finStatus      || 'pendente');
  const [referralId,     setReferralId]      = useState(ex?.referralId     || '');
  const [commissionType, setCommissionType]  = useState(ex?.commissionType || 'fixed');
  const [commissionValue,setCommissionValue] = useState(ex?.commissionValue|| '');
  const [commissionPct,  setCommissionPct]   = useState(ex?.commissionPct  || '');
  const [orderStatus,    setOrderStatus]     = useState(ex?.status         || 'pendente');
  const [notes,          setNotes]           = useState(ex?.notes          || '');

  // Items — CADA item tem ID estável + snapshot de repCommissionPct
  const [items, setItems] = useState(() =>
    (ex?.items || []).map(item => ({
      ...item,
      id: item.id || uuid(),   // garantir ID estável
      repCommissionPct: item.repCommissionPct != null
        ? item.repCommissionPct
        : (data.products.find(p => p.id === item.productId)?.repCommissionPct ?? 0),
    }))
  );

  const [addingProd, setAddingProd] = useState(false);
  const [selProd,    setSelProd]    = useState('');
  const [selQty,     setSelQty]     = useState('1');

  const client = data.clients.find(c => c.id === clientId);
  const envs   = client?.environments || [];
  const total  = items.reduce((a, it) => a + it.qty * it.unitPrice, 0);

  // ── Adicionar produto ao pedido ──────────────────────────────────────────
  // IMPORTANTE: mesmo produto pode ser adicionado 2x — IDs são sempre novos
  const addItem = () => {
    if (!selProd) { showToast('⚠️ Selecione um produto'); return; }
    const prod = data.products.find(p => p.id === selProd);
    if (!prod) return;

    // Cria SEMPRE um item novo com UUID próprio (não agrupa por productId)
    setItems(prev => [
      ...prev,
      {
        id:               uuid(),           // ID único por item
        productId:        selProd,
        productName:      prod.name || '',
        productModel:     prod.model || '',
        qty:              +selQty || 1,
        unitPrice:        prod.price || 0,
        repCommissionPct: prod.repCommissionPct || 0,  // snapshot
      },
    ]);
    setSelProd('');
    setSelQty('1');
    setAddingProd(false);
  };

  // ── Remover item ──────────────────────────────────────────────────────────
  const removeItem = (itemId) => setItems(prev => prev.filter(it => it.id !== itemId));

  // ── Editar qty/preço de um item ───────────────────────────────────────────
  const updateItem = (itemId, field, value) =>
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, [field]: value } : it));

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = () => {
    if (!clientId) { showToast('⚠️ Selecione um cliente.'); return; }
    if (!items.length) { showToast('⚠️ Adicione pelo menos um produto.'); return; }

    const ref = data.referrals.find(r => r.id === referralId);

    const normalizedItems = items.map(it => {
      const prod = data.products.find(p => p.id === it.productId);
      return {
        ...it,
        productName:  it.productName  || prod?.name  || '',
        productModel: it.productModel || prod?.model || '',
        // Manter snapshot do percentual — não recalcular na edição
        repCommissionPct: it.repCommissionPct != null
          ? it.repCommissionPct
          : (prod?.repCommissionPct ?? 0),
      };
    });

    const orderData = {
      clientId,
      envId:           envId || null,
      paymentType,
      installments:    +installments || null,
      finStatus:       paymentType === 'financiamento' ? finStatus : null,
      referralId:      referralId || null,
      referralName:    ref?.name || null,
      status:          orderStatus,
      notes,
      items:           normalizedItems,
      total,
      commissionType:  commissionType || 'fixed',
      commissionValue: parseFloat(String(commissionValue).replace(',', '.')) || 0,
      commissionPct:   parseFloat(String(commissionPct).replace(',', '.')) || 0,
    };

    if (editId) {
      editOrder(editId, orderData);
      showToast('✅ Pedido atualizado!');
    } else {
      // addOrder SEMPRE cria UUID novo — nunca reutiliza ID anterior
      addOrder(orderData);
      showToast('✅ Pedido registrado!');
    }

    clearEdit?.();
    setPage('orders');
  };

  // ── Imprimir pedido ───────────────────────────────────────────────────────
  const printOrder = () => {
    const cl  = data.clients.find(c => c.id === clientId);
    const env = cl?.environments.find(e => e.id === envId);
    const ref = data.referrals.find(r => r.id === referralId);

    const rows = items.map(it => {
      const p = data.products.find(x => x.id === it.productId);
      return `<tr>
        <td>${it.productName || p?.name || '—'}</td>
        <td>${it.productModel || p?.model || '—'}</td>
        <td style="text-align:center">${it.qty}</td>
        <td>${fmtMoney(it.unitPrice)}</td>
        <td><b>${fmtMoney(it.qty * it.unitPrice)}</b></td>
      </tr>`;
    }).join('');

    const orderNum = ex?.orderNumber ? `<b>Pedido Nº ${ex.orderNumber}</b><br>` : '';
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
      <style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px}
      table{width:100%;border-collapse:collapse}th{background:#0f4523;color:#fff;padding:6px 8px}
      td{padding:5px 8px;border-bottom:1px solid #e0e0e0}
      .total-row td{font-weight:bold;background:#e8f5ee!important}</style></head><body>
      <div>${orderNum}
        <b>Cliente:</b> ${cl?.name || '—'}<br>
        <b>Telefone:</b> ${cl?.phone1 || '—'}<br>
        ${env ? `<b>Ambiente:</b> ${env.label}<br>` : ''}
        <b>Pagamento:</b> ${PAY_LABELS[paymentType]}${installments && paymentType !== 'avista' ? ` (${installments}×)` : ''}
        ${paymentType === 'financiamento' ? `<br><b>Status financ.:</b> ${finStatus}` : ''}<br>
        <b>Status pedido:</b> ${orderStatus}
        ${ref ? `<br><b>Indicado por:</b> ${ref.name}` : ''}
      </div>
      <table style="margin-top:12px">
        <thead><tr><th>Produto</th><th>Modelo</th><th>Qtd</th><th>Vlr.Unit.</th><th>Total</th></tr></thead>
        <tbody>${rows}
        <tr class="total-row"><td colspan="4"><b>TOTAL</b></td><td><b>${fmtMoney(total)}</b></td></tr>
        </tbody>
      </table>
      ${notes ? `<p style="margin-top:12px"><b>Obs:</b> ${notes}</p>` : ''}
      <script>setTimeout(()=>window.print(),400);<\/script></body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  return (
    <>
      <div className="hdr">
        <button className="hbtn" onClick={() => { clearEdit?.(); setPage('orders'); }}>←</button>
        <span className="hdr-t">
          {editId
            ? `✏️ Editar Pedido${ex?.orderNumber ? ` #${ex.orderNumber}` : ''}`
            : '🛒 Novo Pedido'
          }
        </span>
        {items.length > 0 && (
          <button className="hbtn" onClick={printOrder} title="Imprimir">🖨️</button>
        )}
      </div>

      <div className="content">

        {/* ── Cliente ── */}
        <div className="sbox">
          <div className="sbox-title">👤 Cliente</div>
          <div className="field">
            <label>Cliente *</label>
            <select
              value={clientId}
              onChange={e => { setClientId(e.target.value); setEnvId(''); }}
              style={{ border: '1.5px solid var(--border)', borderRadius: 9, padding: '10px 13px', background: 'var(--card)', width: '100%', fontSize: 15 }}
            >
              <option value="">Selecione um cliente…</option>
              {(data.clients || []).map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ''}</option>
              ))}
            </select>
          </div>
          {envs.length > 0 && (
            <div className="field">
              <label>Ambiente de instalação</label>
              <select value={envId} onChange={e => setEnvId(e.target.value)}>
                <option value="">A definir</option>
                {envs.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* ── Produtos ── */}
        <div className="sbox">
          <div className="sbox-title">📦 Produtos do pedido</div>

          {items.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 10 }}>
              Nenhum produto adicionado.
            </div>
          )}

          {items.map(it => {
            const prod = data.products.find(p => p.id === it.productId);
            return (
              <div key={it.id} className="order-item-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {it.productName || prod?.name || 'Produto'}
                    {it.productModel ? <span style={{ color: 'var(--text3)', fontSize: 11 }}> ({it.productModel})</span> : null}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>Qtd:</span>
                    <input
                      type="number" value={it.qty} min="1"
                      onChange={e => updateItem(it.id, 'qty', +e.target.value || 1)}
                      style={{ width: 50, border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', fontSize: 13 }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>R$:</span>
                    <input
                      type="number" value={it.unitPrice} step="0.01"
                      onChange={e => updateItem(it.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                      style={{ width: 80, border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', fontSize: 13 }}
                    />
                    {it.repCommissionPct > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>
                        {it.repCommissionPct}% com.
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)' }}>
                    {fmtMoney(it.qty * it.unitPrice)}
                  </div>
                  <button
                    className="btn bg bs"
                    style={{ color: 'var(--danger)', padding: '3px 8px', marginTop: 4 }}
                    onClick={() => removeItem(it.id)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}

          {/* Formulário de adição */}
          {addingProd ? (
            <div style={{ background: 'var(--bg)', borderRadius: 9, padding: 10, marginTop: 10 }}>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Produto</label>
                <select value={selProd} onChange={e => setSelProd(e.target.value)}>
                  <option value="">Selecione…</option>
                  {(data.products || []).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {fmtMoney(p.price)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Quantidade</label>
                <input
                  type="number" value={selQty} min="1"
                  onChange={e => setSelQty(e.target.value)} inputMode="numeric"
                />
              </div>
              <div className="cbar">
                <button className="btn bg bs" style={{ flex: 1 }} onClick={() => setAddingProd(false)}>Cancelar</button>
                <button className="btn bp bs" style={{ flex: 1 }} onClick={addItem}>Adicionar</button>
              </div>
            </div>
          ) : (
            <button
              className="btn bo"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => {
                if (!data.products?.length) { showToast('⚠️ Cadastre produtos primeiro.'); return; }
                setAddingProd(true);
              }}
            >
              + Adicionar Produto
            </button>
          )}

          {items.length > 0 && (
            <div className="order-total">
              <span style={{ fontSize: 14, fontWeight: 600 }}>Total do pedido</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{fmtMoney(total)}</span>
            </div>
          )}
        </div>

        {/* ── Pagamento ── */}
        <div className="sbox">
          <div className="sbox-title">💳 Pagamento</div>
          <div className="stitle">Forma de pagamento</div>
          <div className="toggle-group">
            {['avista', 'parcelado', 'financiamento'].map(v => (
              <button
                key={v}
                className={`tpill${paymentType === v ? ' on' : ''}`}
                onClick={() => setPaymentType(v)}
              >
                {PAY_LABELS[v]}
              </button>
            ))}
          </div>

          {(paymentType === 'parcelado' || paymentType === 'financiamento') && (
            <div className="field">
              <label>Nº de parcelas</label>
              <input
                type="number" value={installments}
                onChange={e => setInstallments(e.target.value)}
                placeholder="Ex: 12" inputMode="numeric" min="2"
              />
            </div>
          )}

          {paymentType === 'financiamento' && (
            <div className="field">
              <label>Status do financiamento</label>
              <select value={finStatus} onChange={e => setFinStatus(e.target.value)}>
                {FIN_STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          )}

          <div className="stitle" style={{ marginTop: 10 }}>Status do pedido</div>
          <div className="toggle-group">
            {[['pendente','⏳ Pendente'],['pago','✅ Pago'],['cancelado','❌ Cancelado']].map(([v, l]) => (
              <button
                key={v}
                className={`tpill${orderStatus === v ? ' on' : ''}`}
                onClick={() => setOrderStatus(v)}
                style={orderStatus === v && v === 'pago' ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : {}}
              >
                {l}
              </button>
            ))}
          </div>
          {orderStatus === 'pago' && (
            <div style={{ background: '#d1fae5', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#065f46', marginTop: 6 }}>
              ✅ Comissões serão geradas automaticamente ao salvar.
            </div>
          )}
        </div>

        {/* ── Indicador ── */}
        {(data.referrals || []).length > 0 && (
          <div className="sbox">
            <div className="sbox-title">🤝 Indicador</div>
            <div className="field">
              <label>Indicado por</label>
              <select value={referralId} onChange={e => setReferralId(e.target.value)}>
                <option value="">Nenhum</option>
                {data.referrals.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            {referralId && (
              <>
                <div className="stitle">Tipo de comissão do indicador</div>
                <div className="toggle-group">
                  <button className={`tpill${commissionType === 'fixed' ? ' on' : ''}`} onClick={() => setCommissionType('fixed')}>💰 Valor fixo</button>
                  <button className={`tpill${commissionType === 'percent' ? ' on' : ''}`} onClick={() => setCommissionType('percent')}>% Percentual</button>
                </div>
                {commissionType === 'fixed' && (
                  <div className="field">
                    <label>Valor da comissão (R$)</label>
                    <input value={commissionValue} onChange={e => setCommissionValue(e.target.value)} placeholder="0,00" inputMode="decimal"/>
                  </div>
                )}
                {commissionType === 'percent' && (
                  <div className="field">
                    <label>Percentual (%)</label>
                    <input value={commissionPct} onChange={e => setCommissionPct(e.target.value)} placeholder="Ex: 5" inputMode="decimal"/>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Observações ── */}
        <div className="sbox">
          <div className="sbox-title">📝 Observações</div>
          <div className="field">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anotações sobre o pedido…"/>
          </div>
        </div>

        {/* ── Ações ── */}
        <div className="cbar">
          <button className="btn bg" style={{ flex: 1 }} onClick={() => { clearEdit?.(); setPage('orders'); }}>Cancelar</button>
          <button className="btn bp" style={{ flex: 2 }} onClick={submit}>
            {editId ? '💾 Salvar alterações' : '✅ Registrar pedido'}
          </button>
        </div>

      </div>
    </>
  );
}
