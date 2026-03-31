/**
 * components/HomePage.jsx — Agri Vendas v10.2
 *
 * Tela inicial correta:
 *  - Clientes
 *  - Pedidos
 *  - Produtos
 *  - Relatórios
 *  - Mapa de Visitas
 *  - Configurações
 *
 * SEM "Novo Produto" direto na home (estava errado).
 */

const APP_NAME = 'Agri Vendas';

const fmtMoney = v =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

export default function HomePage({ store, setPage }) {
  const { data, downloadData, syncData, showToast, pendingOps } = store;

  const totalOrders   = (data.orders  || []).length;
  const totalClients  = (data.clients || []).length;
  const totalProducts = (data.products || []).length;
  const pendingOrders = (data.orders  || []).filter(o => o.status === 'pendente').length;
  const totalRevenue  = (data.orders  || [])
    .filter(o => o.status === 'pago')
    .reduce((s, o) => s + (o.total || 0), 0);

  const cards = [
    {
      icon: '👥', label: 'Clientes', page: 'clients',
      badge: totalClients,
      badgeColor: '#2d6a4f',
      desc: 'Cadastros e visitas',
    },
    {
      icon: '🛒', label: 'Pedidos', page: 'orders',
      badge: totalOrders,
      badgeColor: '#d97706',
      desc: pendingOrders > 0 ? `${pendingOrders} pendente${pendingOrders !== 1 ? 's' : ''}` : 'Todos os pedidos',
      alert: pendingOrders > 0,
    },
    {
      icon: '📦', label: 'Produtos', page: 'products',
      badge: totalProducts,
      badgeColor: '#0891b2',
      desc: 'Catálogo de produtos',
    },
    {
      icon: '📊', label: 'Relatórios', page: 'reports',
      desc: 'Desempenho e métricas',
    },
    {
      icon: '🗺️', label: 'Mapa de Visitas', page: 'visitMap',
      desc: 'Visitas no mapa',
    },
    {
      icon: '⚙️', label: 'Configurações', page: 'config',
      desc: 'Empresa, produtos, categorias',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{
        background: 'var(--primary, #2d6a4f)',
        padding: '20px 16px 24px',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px' }}>
              🌿 {APP_NAME}
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
              Sistema de Vendas Agrícolas
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {pendingOps > 0 && (
              <button
                onClick={() => syncData?.()}
                style={{
                  background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
                  color: '#fff', borderRadius: 9, padding: '6px 12px', fontSize: 11,
                  cursor: 'pointer', fontWeight: 600,
                }}
              >
                ⬆️ {pendingOps} pend.
              </button>
            )}
            <button
              onClick={async () => {
                showToast?.('🔄 Baixando dados…');
                try {
                  await downloadData?.();
                  showToast?.('✅ Dados atualizados!');
                } catch {
                  showToast?.('❌ Erro ao sincronizar.');
                }
              }}
              style={{
                background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff', borderRadius: 9, padding: '6px 12px', fontSize: 11,
                cursor: 'pointer',
              }}
            >
              ⬇️ Sync
            </button>
          </div>
        </div>

        {/* Resumo financeiro */}
        <div style={{
          display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap',
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.15)', borderRadius: 10,
            padding: '10px 14px', flex: 1, minWidth: 110,
          }}>
            <div style={{ fontSize: 11, opacity: 0.8 }}>Receita (pago)</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{fmtMoney(totalRevenue)}</div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.15)', borderRadius: 10,
            padding: '10px 14px', flex: 1, minWidth: 80,
          }}>
            <div style={{ fontSize: 11, opacity: 0.8 }}>Clientes</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{totalClients}</div>
          </div>
          <div style={{
            background: pendingOrders > 0 ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.15)',
            borderRadius: 10, padding: '10px 14px', flex: 1, minWidth: 80,
            border: pendingOrders > 0 ? '1px solid rgba(251,191,36,0.5)' : 'none',
          }}>
            <div style={{ fontSize: 11, opacity: 0.8 }}>Pendentes</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{pendingOrders}</div>
          </div>
        </div>
      </div>

      {/* Cards de navegação */}
      <div style={{
        padding: '16px',
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
        maxWidth: 600,
        margin: '0 auto',
      }}>
        {cards.map(card => (
          <button
            key={card.page}
            onClick={() => setPage(card.page)}
            style={{
              background: 'var(--card)',
              border: card.alert
                ? '2px solid #f59e0b'
                : '1.5px solid var(--border)',
              borderRadius: 14,
              padding: '16px 14px',
              textAlign: 'left',
              cursor: 'pointer',
              position: 'relative',
              transition: 'transform 0.1s, box-shadow 0.1s',
              boxShadow: card.alert
                ? '0 0 0 3px rgba(245,158,11,0.15)'
                : '0 2px 6px rgba(0,0,0,0.06)',
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            onTouchStart={e => e.currentTarget.style.transform = 'scale(0.97)'}
            onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            {/* Badge */}
            {card.badge !== undefined && (
              <div style={{
                position: 'absolute', top: 10, right: 10,
                background: card.badgeColor || 'var(--primary)',
                color: '#fff', borderRadius: 20,
                padding: '1px 8px', fontSize: 11, fontWeight: 700,
              }}>
                {card.badge}
              </div>
            )}

            <div style={{ fontSize: 28, marginBottom: 6 }}>{card.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{card.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{card.desc}</div>
          </button>
        ))}
      </div>

      {/* Atalho: últimos pedidos */}
      {totalOrders > 0 && (
        <div style={{ padding: '0 16px 24px', maxWidth: 600, margin: '0 auto' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 10,
          }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Últimos pedidos</span>
            <button
              onClick={() => setPage('orders')}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, cursor: 'pointer' }}
            >
              Ver todos →
            </button>
          </div>
          {(data.orders || []).slice(0, 3).map(o => {
            const cl = (data.clients || []).find(c => c.id === o.clientId);
            return (
              <div
                key={o.id}
                style={{
                  background: 'var(--card)', borderRadius: 10, padding: '10px 12px',
                  marginBottom: 8, display: 'flex', justifyContent: 'space-between',
                  border: '1px solid var(--border)', cursor: 'pointer',
                }}
                onClick={() => setPage('orders')}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {cl?.name || '—'}
                    {o.orderNumber ? <span style={{ color: 'var(--text3)', fontSize: 11 }}> #{o.orderNumber}</span> : null}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {o.status === 'pago' ? '✅ Pago' : o.status === 'cancelado' ? '❌ Cancelado' : '⏳ Pendente'}
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: 14, alignSelf: 'center' }}>
                  {fmtMoney(o.total)}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
