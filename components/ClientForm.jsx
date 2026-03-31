/**
 * components/ClientForm.jsx
 * Formulário de cadastro/edição de clientes — v10
 * Inclui consulta automática de CEP via ViaCEP.
 *
 * Props:
 *   store    {object}  useStore()
 *   editId   {string|null}
 *   setPage  {fn}
 *   clearEdit {fn}
 */

import { useState, useEffect } from 'react';
import CepField from './CepField';

function maskPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2)  return d;
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

const EMPTY_FORM = {
  name:         '',
  phone1:       '',
  phone2:       '',
  categoryId:   '',
  // Endereço separado (v10)
  cep:          '',
  street:       '',
  number:       '',
  complement:   '',
  neighborhood: '',
  city:         '',
  state:        '',
  // Legado
  address:      '',
  lat:          0,
  lng:          0,
  mapsLink:     '',
  notes:        '',
};

export default function ClientForm({ store, editId, setPage, clearEdit }) {
  const { data, addClient, editClient, showToast } = store;
  const existing = editId ? data.clients.find(c => c.id === editId) : null;

  const [form, setForm] = useState(() => existing
    ? {
        name:         existing.name         || '',
        phone1:       existing.phone1       || '',
        phone2:       existing.phone2       || '',
        categoryId:   existing.categoryId   || '',
        cep:          existing.cep          || '',
        street:       existing.street       || '',
        number:       existing.number       || '',
        complement:   existing.complement   || '',
        neighborhood: existing.neighborhood || '',
        city:         existing.city         || '',
        state:        existing.state        || '',
        address:      existing.address      || '',
        lat:          existing.lat          || 0,
        lng:          existing.lng          || 0,
        mapsLink:     existing.mapsLink     || '',
        notes:        existing.notes        || '',
      }
    : { ...EMPTY_FORM }
  );

  // Campos que o usuário editou manualmente (não sobrescrever após preencher pelo CEP)
  const [manuallyEdited, setManuallyEdited] = useState(new Set());

  const sf = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setManuallyEdited(s => new Set(s).add(field));
  };

  // Callback do CepField: preenche endereço automaticamente
  // Não sobrescreve campos que o usuário já editou manualmente
  const handleCepFill = (addr) => {
    setForm(prev => ({
      ...prev,
      street:       manuallyEdited.has('street')       ? prev.street       : (addr.street       || prev.street),
      complement:   manuallyEdited.has('complement')   ? prev.complement   : (addr.complement   || prev.complement),
      neighborhood: manuallyEdited.has('neighborhood') ? prev.neighborhood : (addr.neighborhood || prev.neighborhood),
      city:         manuallyEdited.has('city')         ? prev.city         : (addr.city         || prev.city),
      state:        manuallyEdited.has('state')        ? prev.state        : (addr.state        || prev.state),
    }));
  };

  const save = () => {
    if (!form.name.trim())   { showToast('⚠️ Nome é obrigatório.'); return; }
    if (!form.phone1.trim()) { showToast('⚠️ Telefone é obrigatório.'); return; }

    if (editId) {
      editClient(editId, form);
      showToast('✅ Cliente atualizado!');
      clearEdit?.();
    } else {
      addClient(form);
      showToast('✅ Cliente cadastrado!');
    }
    setPage('clients');
  };

  return (
    <>
      {/* Header */}
      <div className="hdr">
        <button className="hbtn" onClick={() => { clearEdit?.(); setPage('clients'); }}>←</button>
        <span className="hdr-t">{editId ? 'Editar Cliente' : 'Novo Cliente'}</span>
      </div>

      <div className="content">

        {/* ── Dados básicos ── */}
        <div className="sbox">
          <div className="sbox-title">👤 Dados do cliente</div>

          <div className="field">
            <label>Nome *</label>
            <input value={form.name} onChange={e => sf('name', e.target.value)} placeholder="Nome completo ou razão social"/>
          </div>

          <div className="row2">
            <div className="field">
              <label>Telefone 1 *</label>
              <input value={form.phone1} onChange={e => sf('phone1', maskPhone(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel"/>
            </div>
            <div className="field">
              <label>Telefone 2</label>
              <input value={form.phone2} onChange={e => sf('phone2', maskPhone(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel"/>
            </div>
          </div>

          <div className="field">
            <label>Categoria</label>
            <select value={form.categoryId} onChange={e => sf('categoryId', e.target.value)}>
              <option value="">Sem categoria</option>
              {(data.categories || []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Endereço ── */}
        <div className="sbox">
          <div className="sbox-title">📍 Endereço</div>

          {/* CEP com lookup automático */}
          <CepField
            value={form.cep}
            onChange={v => sf('cep', v)}
            onFill={handleCepFill}
          />

          {/* Logradouro + número */}
          <div className="row2">
            <div className="field" style={{ flex: 2 }}>
              <label>Logradouro</label>
              <input value={form.street} onChange={e => sf('street', e.target.value)} placeholder="Rua, Av., Travessa…"/>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Número</label>
              <input value={form.number} onChange={e => sf('number', e.target.value)} placeholder="Nº" inputMode="numeric"/>
            </div>
          </div>

          <div className="field">
            <label>Complemento</label>
            <input value={form.complement} onChange={e => sf('complement', e.target.value)} placeholder="Apto, sala, bloco…"/>
          </div>

          <div className="row2">
            <div className="field">
              <label>Bairro</label>
              <input value={form.neighborhood} onChange={e => sf('neighborhood', e.target.value)} placeholder="Bairro"/>
            </div>
            <div className="field">
              <label>Cidade</label>
              <input value={form.city} onChange={e => sf('city', e.target.value)} placeholder="Cidade"/>
            </div>
          </div>

          <div className="field" style={{ maxWidth: 120 }}>
            <label>UF</label>
            <input value={form.state} onChange={e => sf('state', e.target.value.toUpperCase().slice(0, 2))} placeholder="SC" maxLength={2}/>
          </div>

          {/* Campo legado de endereço completo (opcional / exibição) */}
          <div className="field">
            <label>Endereço completo (referência)</label>
            <input value={form.address} onChange={e => sf('address', e.target.value)} placeholder="Referência ou endereço livre"/>
          </div>
        </div>

        {/* ── Observações ── */}
        <div className="sbox">
          <div className="sbox-title">📝 Observações</div>
          <div className="field">
            <textarea value={form.notes} onChange={e => sf('notes', e.target.value)} placeholder="Anotações sobre o cliente…"/>
          </div>
        </div>

        {/* ── Ações ── */}
        <div className="cbar">
          <button className="btn bg" style={{ flex: 1 }} onClick={() => { clearEdit?.(); setPage('clients'); }}>
            Cancelar
          </button>
          <button className="btn bp" style={{ flex: 2 }} onClick={save}>
            {editId ? '💾 Salvar alterações' : '✅ Cadastrar cliente'}
          </button>
        </div>

      </div>
    </>
  );
}
