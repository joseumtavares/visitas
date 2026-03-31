/**
 * components/ProductsPage.jsx — Agri Vendas v10.2
 *
 * Lista de produtos com:
 *  - Botão "Ver" (detalhe)
 *  - Botão "Editar"
 *  - Filtro por nome / categoria
 *  - Badge de categoria
 *  - Preço formatado
 */

import { useState } from 'react';

const fmtMoney = v =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

export default function ProductsPage({ store, setPage, setEditProductId, setViewProductId }) {
  const { data } = store;
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');

  const getCategoryName = id =>
    (data.productCategories || []).find(c => c.id === id)?.name || '—';

  const filtered = (data.products || []).filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.model || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !catFilter || p.categoryId === catFilter;
    return matchSearch && matchCat;
  });

  return (
    <>
      <div className="hdr">
        <button className="hbtn" onClick={() => setPage('home')}>←</button>
        <span className="hdr-t">📦 Produtos</span>
        <button
          className="hbtn"
          onClick={() => { setEditProductId(null); setPage('productForm'); }}
          style={{ fontWeight: 700, fontSize: 22 }}
        >
          +
        </button>
      </div>

      <div className="content">

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Buscar produto…"
            style={{
              flex: 2, minWidth: 160, border: '1.5px solid var(--border)',
              borderRadius: 9, padding: '8px 12px', fontSize: 14, background: 'var(--bg)',
            }}
          />
          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            style={{
              flex: 1, minWidth: 120, border: '1.5px solid var(--border)',
              borderRadius: 9, padding: '8px 10px', fontSize: 13, background: 'var(--bg)',
            }}
          >
            <option value="">Todas as categorias</option>
            {(data.productCategories || []).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Resumo */}
        <div style={{
          fontSize: 12, color: 'var(--text3)', marginBottom: 10,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>{filtered.length} produto{filtered.length !== 1 ? 's' : ''}</span>
          {search || catFilter ? (
            <button
              onClick={() => { setSearch(''); setCatFilter(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, cursor: 'pointer' }}
            >
              Limpar filtros ✕
            </button>
          ) : null}
        </div>

        {/* Lista */}
        {filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            color: 'var(--text3)', fontSize: 14,
          }}>
            {data.products.length === 0
              ? <>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
                  <div>Nenhum produto cadastrado.</div>
                  <button
                    className="btn bp"
                    style={{ marginTop: 16 }}
                    onClick={() => { setEditProductId(null); setPage('productForm'); }}
                  >
                    + Cadastrar primeiro produto
                  </button>
                </>
              : 'Nenhum produto encontrado com esses filtros.'
            }
          </div>
        ) : (
          filtered.map(p => (
            <div
              key={p.id}
              className="card"
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}
            >
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
                  {p.name}
                  {p.model ? (
                    <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 12 }}>
                      {' '}({p.model})
                    </span>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                  {p.categoryId && (
                    <span style={{
                      background: 'var(--primary-light, #d1fae5)', color: 'var(--primary)',
                      borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 600,
                    }}>
                      {getCategoryName(p.categoryId)}
                    </span>
                  )}
                  {p.finameCode && (
                    <span style={{
                      background: '#f0f4ff', color: '#3b5bdb',
                      borderRadius: 20, padding: '1px 8px', fontSize: 10,
                    }}>
                      FINAME: {p.finameCode}
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)' }}>
                  {fmtMoney(p.price)}
                </div>

                {p.repCommissionPct > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    Comissão rep: {p.repCommissionPct}%
                    {' '}({fmtMoney(p.price * p.repCommissionPct / 100)})
                  </div>
                )}
              </div>

              {/* Ações */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                <button
                  className="btn bg bs"
                  onClick={() => { setViewProductId(p.id); setPage('productDetail'); }}
                  style={{ fontSize: 12, padding: '5px 12px' }}
                >
                  👁️ Ver
                </button>
                <button
                  className="btn bp bs"
                  onClick={() => { setEditProductId(p.id); setPage('productForm'); }}
                  style={{ fontSize: 12, padding: '5px 12px' }}
                >
                  ✏️ Editar
                </button>
              </div>
            </div>
          ))
        )}

      </div>
    </>
  );
}
