/**
 * components/ClientForm.jsx — Agri Vendas v10.2
 *
 * NOVIDADES:
 *  - RG frente, verso, comprovante de residência
 *  - Status do CLIENTE separado (interesse/relacionamento)
 *  - normalizeMapsLink() usada no campo Maps
 *  - Status do pedido REMOVIDO daqui (pertence ao OrderForm)
 */

import { useState } from 'react';
import CepField from './CepField';

function maskPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2)  return d;
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

export function normalizeMapsLink(link) {
  if (!link) return '';
  return link.trim();
}

const CLIENT_STATUS_OPTIONS = ['Lead', 'Quente', 'Morno', 'Frio'];
const RELATIONSHIP_OPTIONS  = ['Nenhum', 'Cliente Ativo', 'Ex-cliente', 'Parceiro'];
const HAS_EQUIPMENT_OPTIONS = ['Não', 'Sim — próprio', 'Sim — financiado', 'Em avaliação'];

const EMPTY_FORM = {
  name: '', phone1: '', phone2: '', categoryId: '',
  cep: '', street: '', number: '', complement: '',
  neighborhood: '', city: '', state: '',
  address: '', lat: 0, lng: 0, mapsLink: '', notes: '',
  clientStatus: 'Lead', relationship: 'Nenhum', hasEquipment: 'Não',
  documentFrontPath: null, documentBackPath: null, residenceProofPath: null,
};

export default function ClientForm({ store, editId, setPage, clearEdit }) {
  const { data, addClient, editClient, showToast } = store;
  const existing = editId ? data.clients.find(c => c.id === editId) : null;

  const [form, setForm] = useState(() => existing ? {
    name: existing.name || '', phone1: existing.phone1 || '', phone2: existing.phone2 || '',
    categoryId: existing.categoryId || '', cep: existing.cep || '',
    street: existing.street || '', number: existing.number || '',
    complement: existing.complement || '', neighborhood: existing.neighborhood || '',
    city: existing.city || '', state: existing.state || '',
    address: existing.address || '', lat: existing.lat || 0, lng: existing.lng || 0,
    mapsLink: existing.mapsLink || '', notes: existing.notes || '',
    clientStatus: existing.activityStatus?.clientStatus || 'Lead',
    relationship: existing.activityStatus?.relationship || 'Nenhum',
    hasEquipment: existing.activityStatus?.hasEquipment || 'Não',
    documentFrontPath: existing.documentFrontPath || null,
    documentBackPath: existing.documentBackPath || null,
    residenceProofPath: existing.residenceProofPath || null,
  } : { ...EMPTY_FORM });

  const [manuallyEdited, setManuallyEdited] = useState(new Set());

  const sf = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setManuallyEdited(s => new Set(s).add(field));
  };

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

  const handleDocUpload = (field, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('⚠️ Arquivo muito grande (máx 5MB).'); return; }
    const reader = new FileReader();
    reader.onload = () => sf(field, reader.result);
    reader.readAsDataURL(file);
  };

  const save = () => {
    if (!form.name.trim())   { showToast('⚠️ Nome é obrigatório.'); return; }
    if (!form.phone1.trim()) { showToast('⚠️ Telefone é obrigatório.'); return; }

    const clientData = {
      ...form,
      mapsLink: normalizeMapsLink(form.mapsLink),
      activityStatus: {
        ...(existing?.activityStatus || {}),
        clientStatus: form.clientStatus,
        relationship: form.relationship,
        hasEquipment: form.hasEquipment,
      },
    };

    if (editId) {
      editClient(editId, clientData);
      showToast('✅ Cliente atualizado!');
      clearEdit?.();
    } else {
      addClient(clientData);
      showToast('✅ Cliente cadastrado!');
    }
    setPage('clients');
  };

  const pillBtn = (value, current, onChange) => ({
    style: {
      padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
      fontWeight: current === value ? 700 : 400,
      background: current === value ? 'var(--primary)' : 'var(--bg)',
      color: current === value ? '#fff' : 'var(--text2)',
      border: `1.5px solid ${current === value ? 'var(--primary)' : 'var(--border)'}`,
    },
    onClick: () => onChange(value),
  });

  const DocField = ({ label, field }) => (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{
          flex: 1, padding: '8px 12px', border: '1.5px dashed var(--border)',
          borderRadius: 9, cursor: 'pointer', fontSize: 13, textAlign: 'center',
          background: form[field] ? '#d1fae5' : 'var(--bg)',
          color: form[field] ? '#065f46' : 'var(--text2)',
        }}>
          {form[field] ? '✅ Arquivo enviado' : '📷 Selecionar arquivo'}
          <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
            onChange={e => handleDocUpload(field, e)} />
        </label>
        {form[field] && (
          <button onClick={() => sf(field, null)}
            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>🗑️</button>
        )}
      </div>
      {form[field]?.startsWith('data:image') && (
        <img src={form[field]} alt={label}
          style={{ maxHeight: 80, marginTop: 6, borderRadius: 6, border: '1px solid var(--border)' }} />
      )}
    </div>
  );

  return (
    <>
      <div className="hdr">
        <button className="hbtn" onClick={() => { clearEdit?.(); setPage('clients'); }}>←</button>
        <span className="hdr-t">{editId ? 'Editar Cliente' : 'Novo Cliente'}</span>
      </div>

      <div className="content">

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

        {/* STATUS DO CLIENTE */}
        <div className="sbox">
          <div className="sbox-title">📊 Status do Cliente</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
            ℹ️ Status de interesse e relacionamento — separado do status do pedido
          </div>
          <div className="stitle">Nível de Interesse</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {CLIENT_STATUS_OPTIONS.map(v => (
              <button key={v} {...pillBtn(v, form.clientStatus, val => sf('clientStatus', val))}>{v}</button>
            ))}
          </div>
          <div className="stitle">Relacionamento</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {RELATIONSHIP_OPTIONS.map(v => (
              <button key={v} {...pillBtn(v, form.relationship, val => sf('relationship', val))}>{v}</button>
            ))}
          </div>
          <div className="stitle">Possui equipamento?</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {HAS_EQUIPMENT_OPTIONS.map(v => (
              <button key={v} {...pillBtn(v, form.hasEquipment, val => sf('hasEquipment', val))}>{v}</button>
            ))}
          </div>
        </div>

        {/* ENDEREÇO */}
        <div className="sbox">
          <div className="sbox-title">📍 Endereço</div>
          <CepField value={form.cep} onChange={v => sf('cep', v)} onFill={handleCepFill} />
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
          <div className="field">
            <label>🗺️ Link Google Maps</label>
            <input
              value={form.mapsLink}
              onChange={e => sf('mapsLink', normalizeMapsLink(e.target.value))}
              placeholder="https://maps.google.com/…"
              inputMode="url"
            />
            {form.mapsLink && (
              <a href={form.mapsLink} target="_blank" rel="noreferrer"
                style={{ fontSize: 11, color: 'var(--primary)', marginTop: 3, display: 'block' }}>
                🔗 Abrir no Maps
              </a>
            )}
          </div>
          <div className="field">
            <label>Endereço completo (referência)</label>
            <input value={form.address} onChange={e => sf('address', e.target.value)} placeholder="Referência ou endereço livre"/>
          </div>
        </div>

        {/* DOCUMENTOS */}
        <div className="sbox">
          <div className="sbox-title">📎 Documentos</div>
          <DocField label="RG / CNH — Frente" field="documentFrontPath" />
          <DocField label="RG / CNH — Verso"  field="documentBackPath" />
          <DocField label="Comprovante de Residência" field="residenceProofPath" />
        </div>

        {/* OBSERVAÇÕES */}
        <div className="sbox">
          <div className="sbox-title">📝 Observações</div>
          <div className="field">
            <textarea value={form.notes} onChange={e => sf('notes', e.target.value)} placeholder="Anotações sobre o cliente…"/>
          </div>
        </div>

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
