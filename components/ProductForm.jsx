/**
 * components/ProductForm.jsx  — v10.1
 * Formulário de produto com campos FINAME e NCM adicionados.
 */

import { useState } from 'react';

const fmtMoney = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

export default function ProductForm({ store, setPage, editId, clearEdit }) {
  const { data, addProduct, editProduct, showToast } = store;
  const ex = editId ? data.products.find(p => p.id === editId) : null;

  const [f, setF] = useState({
    name:             ex?.name             || '',
    model:            ex?.model            || '',
    categoryId:       ex?.categoryId       || '',
    dimensions:       ex?.dimensions       || '',
    color:            ex?.color            || '',
    price:            ex?.price            || '',
    repCommissionPct: ex?.repCommissionPct || '',
    finameCode:       ex?.finameCode       || '',   // v10.1
    ncmCode:          ex?.ncmCode          || '',   // v10.1
    notes:            ex?.notes            || '',
    photoIds:         ex?.photoIds         || [],
  });

  const s = (k, v) => setF(x => ({ ...x, [k]: v }));

  const submit = () => {
    if (!f.name)       { showToast('⚠️ Nome é obrigatório.');      return; }
    if (!f.categoryId) { showToast('⚠️ Categoria é obrigatória.'); return; }

    const product = {
      ...f,
      price:            parseFloat(String(f.price).replace(',', '.'))            || 0,
      repCommissionPct: parseFloat(String(f.repCommissionPct).replace(',', '.')) || 0,
      finameCode:       f.finameCode.trim() || '',
      ncmCode:          f.ncmCode.trim()    || '',
    };

    if (editId) {
      editProduct(editId, product);
      showToast('✅ Produto atualizado!');
    } else {
      addProduct(product);
      showToast('✅ Produto cadastrado!');
    }
    clearEdit?.();
    setPage('products');
  };

  return (
    <>
      <div className="hdr">
        <button className="hbtn" onClick={() => { clearEdit?.(); setPage('products'); }}>←</button>
        <span className="hdr-t">{editId ? 'Editar Produto' : 'Novo Produto'}</span>
      </div>

      <div className="content">

        {/* ── Identificação ── */}
        <div className="sbox">
          <div className="sbox-title">📦 Identificação</div>

          <div className="field">
            <label>Nome *</label>
            <input value={f.name} onChange={e => s('name', e.target.value)} placeholder="Ex: Bioqueimador a Pellets"/>
          </div>

          <div className="row2">
            <div className="field">
              <label>Modelo</label>
              <input value={f.model} onChange={e => s('model', e.target.value)} placeholder="Ex: BQ-200"/>
            </div>
            <div className="field">
              <label>Categoria *</label>
              <select value={f.categoryId} onChange={e => s('categoryId', e.target.value)}>
                <option value="">Selecione…</option>
                {(data.productCategories || []).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Fiscal / Técnico ── */}
        <div className="sbox">
          <div className="sbox-title">📋 Dados Fiscais / Técnicos</div>

          <div className="row2">
            <div className="field">
              <label>Código FINAME</label>
              <input
                value={f.finameCode}
                onChange={e => s('finameCode', e.target.value)}
                placeholder="Ex: 12345678"
                inputMode="numeric"
              />
            </div>
            <div className="field">
              <label>NCM</label>
              <input
                value={f.ncmCode}
                onChange={e => s('ncmCode', e.target.value)}
                placeholder="Ex: 8419.89.99"
              />
            </div>
          </div>

          <div className="row2">
            <div className="field">
              <label>Dimensões</label>
              <input value={f.dimensions} onChange={e => s('dimensions', e.target.value)} placeholder="50×30×20 cm"/>
            </div>
            <div className="field">
              <label>Cor</label>
              <input value={f.color} onChange={e => s('color', e.target.value)} placeholder="Preto fosco"/>
            </div>
          </div>
        </div>

        {/* ── Preço e comissão ── */}
        <div className="sbox">
          <div className="sbox-title">💰 Preço e Comissão</div>

          <div className="row2">
            <div className="field">
              <label>Valor (R$) *</label>
              <input
                value={f.price}
                onChange={e => s('price', e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <div className="field">
              <label>% Comissão do Rep.</label>
              <input
                value={f.repCommissionPct}
                onChange={e => s('repCommissionPct', e.target.value)}
                placeholder="Ex: 5"
                inputMode="decimal"
              />
            </div>
          </div>

          {f.repCommissionPct > 0 && f.price > 0 && (
            <div style={{ fontSize: 12, color: 'var(--primary)', marginTop: -6, marginBottom: 8 }}>
              ℹ️ Comissão por unidade:{' '}
              {fmtMoney(
                (parseFloat(String(f.price).replace(',', '.')) || 0) *
                (parseFloat(String(f.repCommissionPct).replace(',', '.')) || 0) / 100
              )}
            </div>
          )}
        </div>

        {/* ── Descrição ── */}
        <div className="sbox">
          <div className="sbox-title">📝 Descrição</div>
          <div className="field">
            <textarea
              value={f.notes}
              onChange={e => s('notes', e.target.value)}
              placeholder="Características técnicas, especificações…"
            />
          </div>
        </div>

        {/* ── Ações ── */}
        <div className="cbar">
          <button className="btn bg" style={{ flex: 1 }} onClick={() => { clearEdit?.(); setPage('products'); }}>
            Cancelar
          </button>
          <button className="btn bp" style={{ flex: 2 }} onClick={submit}>
            {editId ? '💾 Salvar alterações' : '✅ Cadastrar produto'}
          </button>
        </div>

      </div>
    </>
  );
}
