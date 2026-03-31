/**
 * components/VisitForm.jsx — Agri Vendas v10.2
 *
 * Formulário de registro de visita ao campo.
 * Inclui: tipo de atividade, data, notas, próximo contato.
 * Opcional: captura geolocalização atual do dispositivo.
 *
 * Props:
 *   store     {object}
 *   clientId  {string}   pré-selecionar cliente
 *   editId    {string|null}
 *   setPage   {fn}
 *   clearEdit {fn}
 */

import { useState } from 'react';

const ACTIVITY_TYPES = [
  'Visita',
  'Proposta Enviada',
  'Ligação',
  'WhatsApp',
  'Reunião',
  'Venda',
  'Pós-venda',
  'Outro',
];

function fmtDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function VisitForm({ store, clientId: defaultClientId, editId, setPage, clearEdit }) {
  const { data, addVisit, editVisit, showToast } = store;
  const ex = editId ? (data.visits || []).find(v => v.id === editId) : null;

  const [clientId,     setClientId]     = useState(ex?.clientId     || defaultClientId || '');
  const [date,         setDate]         = useState(ex?.date ? fmtDatetimeLocal(ex.date) : fmtDatetimeLocal(new Date().toISOString()));
  const [activityType, setActivityType] = useState(ex?.activityType || 'Visita');
  const [notes,        setNotes]        = useState(ex?.notes        || '');
  const [nextContact,  setNextContact]  = useState(ex?.nextContact  || '');
  const [lat,          setLat]          = useState(ex?.lat || 0);
  const [lng,          setLng]          = useState(ex?.lng || 0);
  const [geoLoading,   setGeoLoading]   = useState(false);

  const client = (data.clients || []).find(c => c.id === clientId);

  const captureGeo = () => {
    if (!navigator.geolocation) { showToast('⚠️ Geolocalização não disponível neste dispositivo.'); return; }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGeoLoading(false);
        showToast('✅ Localização capturada!');
      },
      () => {
        setGeoLoading(false);
        showToast('⚠️ Não foi possível obter a localização.');
      },
      { timeout: 10000 }
    );
  };

  const submit = () => {
    if (!clientId)    { showToast('⚠️ Selecione um cliente.'); return; }
    if (!date)        { showToast('⚠️ Informe a data da visita.'); return; }

    const visitData = {
      clientId,
      date:         new Date(date).toISOString(),
      activityType,
      notes,
      nextContact:  nextContact || null,
      lat,
      lng,
    };

    if (editId) {
      editVisit?.(editId, visitData);
      showToast('✅ Visita atualizada!');
    } else {
      addVisit?.(visitData);
      showToast('✅ Visita registrada!');
    }
    clearEdit?.();
    setPage(defaultClientId ? 'clientDetail:' + defaultClientId : 'clients');
  };

  return (
    <>
      <div className="hdr">
        <button className="hbtn" onClick={() => { clearEdit?.(); setPage(defaultClientId ? 'clientDetail:' + defaultClientId : 'clients'); }}>←</button>
        <span className="hdr-t">{editId ? '✏️ Editar Visita' : '🏃 Nova Visita'}</span>
      </div>

      <div className="content">

        {/* Cliente */}
        <div className="sbox">
          <div className="sbox-title">👤 Cliente</div>
          <div className="field">
            <label>Cliente *</label>
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              disabled={!!defaultClientId}
              style={{ border: '1.5px solid var(--border)', borderRadius: 9, padding: '10px 13px', width: '100%', fontSize: 15, background: 'var(--card)' }}
            >
              <option value="">Selecione um cliente…</option>
              {(data.clients || []).map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Atividade */}
        <div className="sbox">
          <div className="sbox-title">📋 Atividade</div>

          <div className="stitle">Tipo de Atividade</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {ACTIVITY_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setActivityType(t)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  fontWeight: activityType === t ? 700 : 400,
                  background: activityType === t ? 'var(--primary)' : 'var(--bg)',
                  color: activityType === t ? '#fff' : 'var(--text2)',
                  border: `1.5px solid ${activityType === t ? 'var(--primary)' : 'var(--border)'}`,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="field">
            <label>Data e hora *</label>
            <input
              type="datetime-local"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Próximo contato</label>
            <input
              type="date"
              value={nextContact}
              onChange={e => setNextContact(e.target.value)}
            />
          </div>
        </div>

        {/* Geolocalização */}
        <div className="sbox">
          <div className="sbox-title">📍 Localização da Visita</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
            Capture a localização atual para exibir no mapa de visitas.
          </div>
          <button
            className="btn bo"
            style={{ width: '100%', marginBottom: lat ? 10 : 0 }}
            onClick={captureGeo}
            disabled={geoLoading}
          >
            {geoLoading ? '⏳ Capturando…' : '🎯 Capturar localização atual'}
          </button>
          {lat !== 0 && lng !== 0 && (
            <div style={{
              background: '#d1fae5', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#065f46',
            }}>
              ✅ Localização capturada: {lat.toFixed(5)}, {lng.toFixed(5)}
              <button
                onClick={() => { setLat(0); setLng(0); }}
                style={{ background: 'none', border: 'none', color: '#065f46', fontSize: 12, cursor: 'pointer', marginLeft: 8 }}
              >
                ✕ remover
              </button>
            </div>
          )}
          {/* Usar coordenadas do cliente como fallback */}
          {lat === 0 && lng === 0 && client?.lat && client.lat !== 0 && (
            <button
              className="btn bg"
              style={{ width: '100%', fontSize: 12, marginTop: 6 }}
              onClick={() => { setLat(client.lat); setLng(client.lng); showToast('📍 Usando endereço do cliente.'); }}
            >
              📍 Usar localização do cliente
            </button>
          )}
        </div>

        {/* Observações */}
        <div className="sbox">
          <div className="sbox-title">📝 Observações</div>
          <div className="field">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="O que foi discutido, próximos passos…"
              rows={4}
            />
          </div>
        </div>

        {/* Ações */}
        <div className="cbar">
          <button className="btn bg" style={{ flex: 1 }} onClick={() => { clearEdit?.(); setPage(defaultClientId ? 'clientDetail:' + defaultClientId : 'clients'); }}>
            Cancelar
          </button>
          <button className="btn bp" style={{ flex: 2 }} onClick={submit}>
            {editId ? '💾 Salvar alterações' : '✅ Registrar visita'}
          </button>
        </div>

      </div>
    </>
  );
}
