/**
 * services/pdfService.js
 * Geração de PDF do pedido em HTML (abre janela e dispara impressão).
 *
 * Conteúdo:
 *  - Cabeçalho com dados da empresa e representante
 *  - Número do pedido
 *  - Dados do cliente (com endereço completo)
 *  - Forma de pagamento e status
 *  - Lista de produtos com medidas
 *  - Ambiente selecionado (se houver)
 *  - Campo quadriculado para desenho isométrico
 *  - Observações
 *  - Área de assinatura
 */

const fmtMoney = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fd = s => s ? new Date(s).toLocaleDateString('pt-BR') : '—';

const PAY_LABELS = { avista: 'À Vista', parcelado: 'Parcelado', financiamento: 'Financiamento Bancário' };
const STATUS_LABELS = { pendente: 'Pendente', pago: 'Pago', cancelado: 'Cancelado' };
const FIN_STATUS_LABELS = { pendente: 'Em análise', aprovado: 'Aprovado', reprovado: 'Reprovado', liberado: 'Liberado' };

/**
 * Gera o HTML do pedido e abre em nova aba para impressão.
 */
export function printOrderPdf({ order, client, env, referral, company, representative, products }) {
  const co  = company        || {};
  const rep = representative || {};

  // ── Cabeçalho da empresa ────────────────────────────────────────────────
  const headerHtml = co.name ? `
    <div class="header">
      <div class="header-left">
        <div class="company-name">${co.name}</div>
        ${co.cnpj   ? `<div class="company-info">CNPJ: ${co.cnpj}</div>` : ''}
        ${co.phone  ? `<div class="company-info">📞 ${co.phone}</div>`  : ''}
        ${co.address? `<div class="company-info">📍 ${co.address}</div>`: ''}
      </div>
      <div class="header-right">
        ${rep.name ? `<div class="rep-name">Representante: <b>${rep.name}</b></div>` : ''}
        ${rep.cities?.length ? `<div class="rep-cities">Região: ${rep.cities.join(', ')}</div>` : ''}
      </div>
    </div>
  ` : '';

  // ── Número e data do pedido ──────────────────────────────────────────────
  const orderTitle = `
    <div class="order-title">
      <span class="order-number">
        ${order.orderNumber ? `PEDIDO Nº ${order.orderNumber}` : 'PEDIDO DE VENDA'}
      </span>
      <span class="order-date">Data: ${fd(order.date)}</span>
    </div>
  `;

  // ── Dados do cliente ─────────────────────────────────────────────────────
  const addressParts = [
    client.street && `${client.street}${client.number ? `, ${client.number}` : ''}`,
    client.complement,
    client.neighborhood,
    client.city && client.state ? `${client.city}/${client.state}` : (client.city || client.state),
    client.cep && `CEP: ${client.cep}`,
  ].filter(Boolean);

  const clientHtml = `
    <div class="section">
      <div class="section-title">DADOS DO CLIENTE</div>
      <table class="data-table">
        <tr><td class="label">Nome</td><td>${client.name}</td><td class="label">Telefone</td><td>${client.phone1}${client.phone2 ? ` / ${client.phone2}` : ''}</td></tr>
        ${addressParts.length ? `<tr><td class="label">Endereço</td><td colspan="3">${addressParts.join(', ')}</td></tr>` : ''}
        ${referral ? `<tr><td class="label">Indicado por</td><td colspan="3">${referral.name}</td></tr>` : ''}
      </table>
    </div>
  `;

  // ── Pagamento e status ───────────────────────────────────────────────────
  const paymentHtml = `
    <div class="section">
      <div class="section-title">CONDIÇÕES COMERCIAIS</div>
      <table class="data-table">
        <tr>
          <td class="label">Forma de Pagamento</td>
          <td>${PAY_LABELS[order.paymentType] || order.paymentType}${order.installments ? ` — ${order.installments}×` : ''}</td>
          <td class="label">Status do Pedido</td>
          <td><b>${STATUS_LABELS[order.status] || order.status}</b></td>
        </tr>
        ${order.paymentType === 'financiamento' ? `
        <tr>
          <td class="label">Status Financiamento</td>
          <td colspan="3">${FIN_STATUS_LABELS[order.finStatus] || order.finStatus || '—'}</td>
        </tr>` : ''}
      </table>
    </div>
  `;

  // ── Produtos ─────────────────────────────────────────────────────────────
  const itemRows = (order.items || []).map(it => {
    const prod = products?.find(p => p.id === it.productId);
    const subtotal = (it.qty || 1) * (it.unitPrice || 0);
    return `
      <tr>
        <td>${it.productName || prod?.name || '—'}</td>
        <td class="center">${it.productModel || prod?.model || '—'}</td>
        <td class="center">${it.qty || 1}</td>
        <td class="right">${fmtMoney(it.unitPrice || 0)}</td>
        <td class="right"><b>${fmtMoney(subtotal)}</b></td>
      </tr>
    `;
  }).join('');

  const productsHtml = `
    <div class="section">
      <div class="section-title">PRODUTOS / EQUIPAMENTOS</div>
      <table class="items-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th class="center">Modelo</th>
            <th class="center">Qtd</th>
            <th class="right">Vlr. Unit.</th>
            <th class="right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          <tr class="total-row">
            <td colspan="4"><b>TOTAL DO PEDIDO</b></td>
            <td class="right"><b>${fmtMoney(order.total || 0)}</b></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  // ── Ambiente ──────────────────────────────────────────────────────────────
  const envHtml = env ? `
    <div class="section">
      <div class="section-title">AMBIENTE DE INSTALAÇÃO</div>
      <table class="data-table">
        <tr>
          <td class="label">Ambiente</td><td>${env.label}</td>
          <td class="label">Tipo de Estufa</td><td>${env.estufaType || '—'}</td>
        </tr>
        <tr>
          <td class="label">Largura</td><td>${env.width ? `${env.width} m` : '—'}</td>
          <td class="label">Comprimento</td><td>${env.length ? `${env.length} m` : '—'}</td>
        </tr>
        <tr>
          <td class="label">Altura</td><td>${env.height ? `${env.height} m` : '—'}</td>
          <td class="label">Observações</td><td>${env.notes || '—'}</td>
        </tr>
        ${env.grampoQty ? `
        <tr>
          <td class="label">Grampos</td><td>${env.grampoQty}× grampo ${env.grampoSize || '28'}</td>
          <td></td><td></td>
        </tr>` : ''}
      </table>
    </div>
  ` : '';

  // ── Área de desenho quadriculado (isométrico) ────────────────────────────
  // Gera um grid SVG para anotações
  const gridHtml = `
    <div class="section">
      <div class="section-title">ESBOÇO / PLANTA (preenchimento manual)</div>
      <div class="grid-area">
        <svg width="100%" height="180" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="smallGrid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#ccc" stroke-width="0.5"/>
            </pattern>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <rect width="50" height="50" fill="url(#smallGrid)"/>
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#aaa" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
    </div>
  `;

  // ── Observações ───────────────────────────────────────────────────────────
  const notesHtml = order.notes ? `
    <div class="section">
      <div class="section-title">OBSERVAÇÕES</div>
      <div class="notes-box">${order.notes}</div>
    </div>
  ` : '';

  // ── Assinatura ────────────────────────────────────────────────────────────
  const signatureHtml = `
    <div class="signature-section">
      <div class="signature-box">
        <div class="signature-line"></div>
        <div class="signature-label">${client.name}</div>
        <div class="signature-sublabel">Assinatura do Cliente</div>
      </div>
      <div class="signature-box">
        <div class="signature-line"></div>
        <div class="signature-label">${rep.name || co.name || 'Representante'}</div>
        <div class="signature-sublabel">Representante / Vendedor</div>
      </div>
    </div>
  `;

  // ── CSS ───────────────────────────────────────────────────────────────────
  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start;
              border-bottom: 2px solid #0f4523; margin-bottom: 14px; padding-bottom: 10px; }
    .company-name { font-size: 16px; font-weight: bold; color: #0f4523; margin-bottom: 3px; }
    .company-info { font-size: 10px; color: #555; }
    .header-right { text-align: right; }
    .rep-name { font-size: 11px; }
    .rep-cities { font-size: 10px; color: #555; }
    .order-title { display: flex; justify-content: space-between; align-items: center;
                   background: #0f4523; color: #fff; padding: 8px 14px; border-radius: 6px;
                   margin-bottom: 14px; }
    .order-number { font-size: 15px; font-weight: bold; }
    .order-date { font-size: 11px; }
    .section { margin-bottom: 14px; }
    .section-title { font-size: 10px; font-weight: bold; text-transform: uppercase;
                     color: #0f4523; letter-spacing: 0.08em; margin-bottom: 6px;
                     border-bottom: 1px solid #0f4523; padding-bottom: 2px; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table td { padding: 4px 6px; border: 1px solid #ddd; }
    .data-table .label { background: #f5f9f5; font-weight: bold; color: #0f4523;
                         width: 100px; white-space: nowrap; }
    .items-table { width: 100%; border-collapse: collapse; }
    .items-table th { background: #0f4523; color: #fff; padding: 5px 7px; text-align: left; }
    .items-table td { padding: 4px 7px; border-bottom: 1px solid #e0e0e0; }
    .items-table .center { text-align: center; }
    .items-table .right  { text-align: right; }
    .total-row td { background: #e8f5ee !important; font-weight: bold; }
    .grid-area { border: 1px solid #ccc; border-radius: 4px; overflow: hidden; }
    .notes-box { border: 1px solid #ddd; border-radius: 4px; padding: 8px;
                 min-height: 40px; background: #fafafa; }
    .signature-section { display: flex; gap: 40px; margin-top: 30px; }
    .signature-box { flex: 1; text-align: center; }
    .signature-line { border-top: 1px solid #333; margin-bottom: 5px; margin-top: 40px; }
    .signature-label { font-weight: bold; font-size: 10px; }
    .signature-sublabel { font-size: 9px; color: #555; }
    @media print { button { display: none; } }
  `;

  // ── HTML final ────────────────────────────────────────────────────────────
  const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Pedido ${order.orderNumber ? `#${order.orderNumber}` : ''} — ${client.name}</title>
  <style>${css}</style>
</head>
<body>
  ${headerHtml}
  ${orderTitle}
  ${clientHtml}
  ${paymentHtml}
  ${productsHtml}
  ${envHtml}
  ${gridHtml}
  ${notesHtml}
  ${signatureHtml}
  <div style="margin-top:20px;font-size:9px;color:#aaa;border-top:1px solid #ddd;padding-top:6px;text-align:center">
    ${co.name || 'Sistema de Visitas'} — Gerado em ${new Date().toLocaleString('pt-BR')}
  </div>
  <script>setTimeout(() => window.print(), 400);<\/script>
</body>
</html>`;

  // Abrir em nova aba (Blob URL — sem popups bloqueados na maioria dos browsers)
  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const w    = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 15000);

  // Fallback: iframe oculto
  if (!w) {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px';
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(fullHtml);
    iframe.contentDocument.close();
    setTimeout(() => {
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 500);
  }
}
