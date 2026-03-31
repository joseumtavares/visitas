/**
 * components/ProductDetailPage.jsx — Agri Vendas v10.2
 *
 * Tela de detalhe de um produto.
 * Exibe todos os campos: nome, modelo, categoria, FINAME, NCM,
 * dimensões, cor, preço, comissão, descrição.
 */

const fmtMoney = v =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

export default function ProductDetailPage({ store, productId, setPage, setEditProductId }) {
  const { data, deleteProduct, showToast } = store;
  const p = (data.products || []).find(x => x.id === productId);

  if (!p) {
    return (
      <>
        <div className="hdr">
          <button className="hbtn" onClick={() => setPage('products')}>←</button>
          <span className="hdr-t">Produto não encontrado</span>
        </div>
        <div className="content" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 36 }}>📦</div>
          <p style={{ color: 'var(--text3)', marginTop: 8 }}>
            Produto não encontrado ou removido.
          </p>
          <button className="btn bp" style={{ marginTop: 16 }} onClick={() => setPage('products')}>
            Voltar para Produtos
          </button>
        </div>
      </>
    );
  }

  const getCategoryName = id =>
    (data.productCategories || []).find(c => c.id === id)?.name || '—';

  const handleDelete = () => {
    if (!window.confirm(`Excluir o produto "${p.name}"? Esta ação não pode ser desfeita.`)) return;
    deleteProduct?.(p.id);
    showToast('🗑️ Produto excluído.');
    setPage('products');
  };

  const Row = ({ label, value, highlight }) =>
    value ? (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '9px 12px', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>{label}</span>
        <span style={{
          fontSize: 13, fontWeight: highlight ? 800 : 600,
          color: highlight ? 'var(--primary)' : 'var(--text)',
          textAlign: 'right', maxWidth: '60%',
        }}>
          {value}
        </span>
      </div>
    ) : null;

  // Pedidos que usam este produto
  const ordersWithProduct = (data.orders || []).filter(o =>
    (o.items || []).some(i => i.productId === p.id)
  );

  return (
    <>
      <div className="hdr">
        <button className="hbtn" onClick={() => setPage('products')}>←</button>
        <span className="hdr-t">📦 Produto</span>
        <button
          className="hbtn"
          onClick={() => { setEditProductId(p.id); setPage('productForm'); }}
          style={{ fontSize: 14 }}
        >
          ✏️
        </button>
      </div>

      <div className="content">

        {/* Header do produto */}
        <div className="sbox" style={{ padding: '16px 16px 12px' }}>
          <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>{p.name}</div>
          {p.model && (
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
              Modelo: <strong>{p.model}</strong>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {p.categoryId && (
              <span style={{
                background: 'var(--primary)', color: '#fff',
                borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 600,
              }}>
                {getCategoryName(p.categoryId)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--primary)' }}>
            {fmtMoney(p.price)}
          </div>
          {p.repCommissionPct > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
              Comissão representante: <strong>{p.repCommissionPct}%</strong>
              {' '}= {fmtMoney(p.price * p.repCommissionPct / 100)} / unid.
            </div>
          )}
        </div>

        {/* Dados fiscais / técnicos */}
        {(p.finameCode || p.ncmCode || p.dimensions || p.color) && (
          <div className="sbox" style={{ padding: '0' }}>
            <div className="sbox-title" style={{ padding: '10px 12px 6px' }}>📋 Dados Fiscais / Técnicos</div>
            <Row label="Código FINAME" value={p.finameCode} />
            <Row label="NCM"           value={p.ncmCode} />
            <Row label="Dimensões"     value={p.dimensions} />
            <Row label="Cor"           value={p.color} />
          </div>
        )}

        {/* Descrição */}
        {p.notes && (
          <div className="sbox">
            <div className="sbox-title">📝 Descrição</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {p.notes}
            </div>
          </div>
        )}

        {/* Pedidos que usam este produto */}
        {ordersWithProduct.length > 0 && (
          <div className="sbox">
            <div className="sbox-title">🛒 Pedidos com este produto</div>
            {ordersWithProduct.slice(0, 5).map(o => {
              const client = data.clients?.find(c => c.id === o.clientId);
              const item   = o.items.find(i => i.productId === p.id);
              return (
                <div key={o.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: '1px solid var(--border)',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {client?.name || 'Cliente'}
                      {o.orderNumber ? <span style={{ color: 'var(--text3)', fontSize: 11 }}> #{o.orderNumber}</span> : null}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {item ? `${item.qty}× ${fmtMoney(item.unitPrice)}` : ''}
                      {' · '}
                      {o.status === 'pago' ? '✅ Pago' : o.status === 'cancelado' ? '❌ Cancelado' : '⏳ Pendente'}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 13 }}>
                    {fmtMoney((item?.qty || 1) * (item?.unitPrice || 0))}
                  </div>
                </div>
              );
            })}
            {ordersWithProduct.length > 5 && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                + {ordersWithProduct.length - 5} pedido{ordersWithProduct.length - 5 !== 1 ? 's' : ''} a mais…
              </div>
            )}
          </div>
        )}

        {/* Ações */}
        <div className="cbar" style={{ marginTop: 16 }}>
          <button
            className="btn bg"
            style={{ flex: 1, color: 'var(--danger, #dc2626)' }}
            onClick={handleDelete}
          >
            🗑️ Excluir
          </button>
          <button
            className="btn bp"
            style={{ flex: 2 }}
            onClick={() => { setEditProductId(p.id); setPage('productForm'); }}
          >
            ✏️ Editar Produto
          </button>
        </div>

      </div>
    </>
  );
}
