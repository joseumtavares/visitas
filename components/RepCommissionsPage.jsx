/**
 * components/RepCommissionsPage.jsx  — v10
 * Página de gestão de comissões do representante.
 * Corrigida: exibição por item de pedido, reprocessamento robusto.
 */

import { useState, useMemo } from 'react';

const fmtMoney = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fd = s => s ? new Date(s).toLocaleDateString('pt-BR') : '—';

export default function RepCommissionsPage({ store }) {
  const {
    data, payRepCommission, updateRepCommissionReceipt,
    reprocessCommissions, showToast,
  } = store;

  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [filterProduct,  setFilterProduct]  = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterClient,   setFilterClient]   = useState('');
  const [taxPct,         setTaxPct]         = useState(
    typeof localStorage !== 'undefined' ? (localStorage.getItem('rep_tax_pct') || '6') : '6'
  );
  const [tab,            setTab]            = useState('pending');
  const [reprocessing,   setReprocessing]   = useState(false);

  const saveTax = v => {
    setTaxPct(v);
    if (typeof localStorage !== 'undefined') localStorage.setItem('rep_tax_pct', v);
  };

  // ── Diagnóstico: pedidos pagos sem comissão ──────────────────────────────
  const missingCommissions = useMemo(() => {
    const paidOrders = (data.orders || []).filter(o => o.status === 'pago');
    return paidOrders.filter(o => {
      const items = (o.items || []).filter(item => {
        const prod = (data.products || []).find(p => p.id === item.productId);
        const pct  = parseFloat(item.repCommissionPct ?? prod?.repCommissionPct ?? 0);
        return pct > 0;
      });
      if (!items.length) return false;
      const hasAllComms = items.every(item =>
        (data.repCommissions || []).some(c => c.orderItemId === item.id && c.orderId === o.id)
      );
      return !hasAllComms;
    });
  }, [data.orders, data.repCommissions, data.products]);

  // ── Filtros ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => (data.repCommissions || []).filter(c => {
    if (filterStatus  && c.status    !== filterStatus)  return false;
    if (filterProduct && c.productId !== filterProduct)  return false;
    if (filterClient  && c.clientId  !== filterClient)   return false;
    if (dateFrom && c.orderDate < dateFrom)              return false;
    if (dateTo   && c.orderDate > (dateTo + 'T23:59:59')) return false;
    return true;
  }), [data.repCommissions, filterStatus, filterProduct, filterClient, dateFrom, dateTo]);

  const pending = filtered.filter(c => c.status === 'pendente');
  const paid    = filtered.filter(c => c.status === 'paga');

  const totalBruto = pending.reduce((a, c) => a + c.amount, 0);
  const taxVal     = totalBruto * (parseFloat(taxPct) || 0) / 100;
  const totalLiq   = totalBruto - taxVal;
  const totalPago  = paid.reduce((a, c) => a + c.amount, 0);

  // ── Resumo por mês ───────────────────────────────────────────────────────
  const byMonth = useMemo(() => {
    const m = {};
    pending.forEach(c => {
      const mo = c.orderDate ? c.orderDate.slice(0, 7) : '?';
      if (!m[mo]) m[mo] = { month: mo, bruto: 0, count: 0 };
      m[mo].bruto += c.amount;
      m[mo].count++;
    });
    return Object.values(m).sort((a, b) => b.month.localeCompare(a.month));
  }, [pending]);

  // ── Reprocessar ──────────────────────────────────────────────────────────
  const doReprocess = async () => {
    setReprocessing(true);
    try {
      const result = reprocessCommissions();
      showToast(`✅ ${result?.count ?? 0} pedido(s) reprocessado(s).`);
    } catch (e) {
      showToast('⚠️ Erro no reprocessamento.');
      console.error(e);
    } finally {
      setReprocessing(false);
    }
  };

  // ── Imprimir relatório ───────────────────────────────────────────────────
  const printReport = () => {
    const list = tab === 'pending' ? pending : paid;
    const rows = list.map(c => `<tr>
      <td>${fd(c.orderDate)}</td>
      <td>${c.clientName}</td>
      <td>${c.productName}</td>
      <td style="text-align:center">${c.qty}</td>
      <td>${fmtMoney(c.unitPrice)}</td>
      <td style="text-align:center">${c.repCommissionPct}%</td>
      <td>${fmtMoney(c.amount)}</td>
      <td>${c.status === 'paga' ? '✅ Paga' : '⏳ Pendente'}</td>
    </tr>`).join('');
    const tax = parseFloat(taxPct) || 0;
    const summary = `<table style="margin-top:16px;width:auto">
      <tr><td><b>Total Bruto:</b></td><td>${fmtMoney(totalBruto)}</td></tr>
      <tr><td><b>Impostos (${tax}%):</b></td><td style="color:#dc2626">(${fmtMoney(taxVal)})</td></tr>
      <tr><td><b>Total Líquido:</b></td><td style="color:#166534;font-size:16px"><b>${fmtMoney(totalLiq)}</b></td></tr>
    </table>`;
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Comissões</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px}table{width:100%;border-collapse:collapse}
      th{background:#0f4523;color:#fff;padding:6px 8px;text-align:left}td{padding:5px 8px;border-bottom:1px solid #e0e0e0}
      tr:nth-child(even)td{background:#f5f9f5}</style></head><body>
      <h1>Comissões do Representante</h1>
      <p>Gerado em ${new Date().toLocaleString('pt-BR')}</p>
      <table><thead><tr><th>Data</th><th>Cliente</th><th>Produto</th><th>Qtd</th><th>Vlr.Unit.</th><th>%Com</th><th>Comissão</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table>${summary}
      <script>setTimeout(()=>window.print(),400);<\/script></body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const list = tab === 'pending' ? pending : paid;

  return (
    <>
      <div className="hdr">
        <span className="hdr-t">💰 Comissões do Representante</span>
      </div>
      <div className="content">

        {/* ── Alerta: pedidos sem comissão ── */}
        {missingCommissions.length > 0 && (
          <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
              ⚠️ {missingCommissions.length} pedido(s) pago(s) sem comissão gerada
            </div>
            <div style={{ fontSize: 13, color: '#78350f', marginBottom: 10 }}>
              Use o botão abaixo para gerar as comissões faltantes. Comissões já pagas não serão alteradas.
            </div>
            <button
              className="btn bp bs"
              onClick={doReprocess}
              disabled={reprocessing}
              style={{ background: '#d97706' }}
            >
              {reprocessing ? '⏳ Reprocessando…' : '🔄 Reprocessar comissões'}
            </button>
          </div>
        )}

        {/* ── Resumo financeiro ── */}
        <div style={{ background: 'var(--pd)', color: '#fff', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, opacity: .8, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Pendentes (período filtrado)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtMoney(totalBruto)}</div>
              <div style={{ fontSize: 10, opacity: .8 }}>BRUTO</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fca5a5' }}>({fmtMoney(taxVal)})</div>
              <div style={{ fontSize: 10, opacity: .8 }}>IMPOSTO {taxPct}%</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.18)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#86efac' }}>{fmtMoney(totalLiq)}</div>
              <div style={{ fontSize: 10, opacity: .8 }}>LÍQUIDO</div>
            </div>
          </div>
          <div style={{ marginTop: 8, textAlign: 'center', fontSize: 12, opacity: .7 }}>
            Já pago (histórico): {fmtMoney(totalPago)}
          </div>
        </div>

        {/* ── Filtros ── */}
        <div className="sbox" style={{ marginBottom: 12 }}>
          <div className="sbox-title">🔎 Filtros</div>
          <div className="row2">
            <div className="field">
              <label>De</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
            </div>
            <div className="field">
              <label>Até</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}/>
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label>Produto</label>
              <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
                <option value="">Todos</option>
                {(data.products || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">Todos</option>
                <option value="pendente">⏳ Pendente</option>
                <option value="paga">✅ Paga</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Cliente</label>
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)}>
              <option value="">Todos</option>
              {(data.clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>% Impostos NFS-e</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={taxPct}
                onChange={e => saveTax(e.target.value)}
                placeholder="Ex: 6"
                inputMode="decimal"
                style={{ width: 80, border: '1.5px solid var(--border)', borderRadius: 9, padding: '8px 12px' }}
              />
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                % → imposto = {fmtMoney(taxVal)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Resumo por mês ── */}
        {byMonth.length > 0 && (
          <div className="cc" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>📅 Pendentes por mês</div>
            {byMonth.map(m => {
              const tax2 = m.bruto * (parseFloat(taxPct) || 0) / 100;
              return (
                <div key={m.month} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.month}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.count} item(ns)</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>Bruto: {fmtMoney(m.bruto)}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>Líq: {fmtMoney(m.bruto - tax2)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Ações ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button className="btn bp" style={{ flex: 1 }} onClick={printReport}>
            🖨️ Relatório / NFS-e
          </button>
          <button
            className="btn bg"
            style={{ flex: 1 }}
            onClick={doReprocess}
            disabled={reprocessing}
          >
            {reprocessing ? '⏳ Processando…' : '🔄 Reprocessar'}
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="tabs">
          <div
            className={`tab ${tab === 'pending' ? 'on' : ''}`}
            onClick={() => setTab('pending')}
          >
            ⏳ Pendentes ({pending.length})
          </div>
          <div
            className={`tab ${tab === 'paid' ? 'on' : ''}`}
            onClick={() => setTab('paid')}
          >
            ✅ Pagas ({paid.length})
          </div>
        </div>

        {/* ── Lista ── */}
        {list.length === 0 && (
          <div className="empty">
            {tab === 'pending'
              ? 'Nenhuma comissão pendente no período.'
              : 'Nenhuma comissão paga no período.'
            }
            <br/>
            <span style={{ fontSize: 12 }}>
              Comissões são geradas automaticamente ao marcar um pedido como "Pago".
            </span>
          </div>
        )}

        {list.map(c => (
          <CommissionCard
            key={c.id}
            c={c}
            store={store}
          />
        ))}

        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10, padding: 10, background: 'var(--bg)', borderRadius: 8 }}>
          ℹ️ Comissões pagas são preservadas no histórico e nunca sobrescritas.
          A chave de rastreamento é o item do pedido — um mesmo produto pode gerar
          múltiplas comissões em pedidos diferentes.
        </div>

      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card individual de comissão
// ─────────────────────────────────────────────────────────────────────────────
function CommissionCard({ c, store }) {
  const { payRepCommission, updateRepCommissionReceipt, showToast, data } = store;
  const order = (data.orders || []).find(o => o.id === c.orderId);

  return (
    <div className="comm-card" style={{ borderLeft: `4px solid ${c.status === 'paga' ? 'var(--primary)' : 'var(--accent)'}` }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{c.productName}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            Cliente: <b>{c.clientName}</b>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            {fd(c.orderDate)} · {c.qty} un. × {fmtMoney(c.unitPrice)} · {c.repCommissionPct}%
          </div>
          {order && (
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              Pedido total: {fmtMoney(order.total || 0)}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--primary)' }}>
            {fmtMoney(c.amount)}
          </div>
          <span className={c.status === 'paga' ? 'comm-paga' : 'comm-pendente'}>
            {c.status === 'paga' ? '✅ Paga' : '⏳ Pendente'}
          </span>
        </div>
      </div>

      {/* Rastreabilidade */}
      {c.reprocessedAt && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
          🔄 Reprocessada em: {fd(c.reprocessedAt)}
        </div>
      )}
      {c.status === 'paga' && c.paidAt && (
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          Pago em: {fd(c.paidAt)}
        </div>
      )}

      {/* Ação de pagamento (só pendentes) */}
      {c.status === 'pendente' && (
        <div style={{ marginTop: 10 }}>
          <button
            className="btn bp bs"
            style={{ width: '100%' }}
            onClick={() => {
              payRepCommission(c.id);
              showToast('✅ Comissão marcada como paga!');
            }}
          >
            💰 Confirmar pagamento
          </button>
        </div>
      )}
    </div>
  );
}
