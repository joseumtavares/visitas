/**
 * components/VisitMap.jsx — Agri Vendas v10.2
 *
 * Mapa de visitas usando Leaflet.js + OpenStreetMap (sem chave de API).
 * Exibe marcadores para cada cliente com visitas registradas.
 * Clicar no marcador abre popup com timeline de atividades.
 *
 * Props:
 *   store  {object}  useStore()
 *   setPage {fn}
 *
 * DEPENDÊNCIA:
 *   Adicionar no <head> do index.html ou layout:
 *   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
 *   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
 */

import { useEffect, useRef, useState } from 'react';

const STATUS_COLOR = {
  Quente:  '#ef4444',
  Morno:   '#f59e0b',
  Frio:    '#3b82f6',
  Lead:    '#8b5cf6',
  default: '#6b7280',
};

const ACTIVITY_ICON = {
  'Visita':            '🏃',
  'Proposta Enviada':  '📄',
  'Ligação':           '📞',
  'WhatsApp':          '💬',
  'Reunião':           '🤝',
  'Venda':             '✅',
  'Pós-venda':         '⭐',
};

function statusColor(status) {
  return STATUS_COLOR[status] || STATUS_COLOR.default;
}

export default function VisitMap({ store, setPage }) {
  const { data } = store;
  const mapRef     = useRef(null);
  const leafletRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [filter,   setFilter]   = useState('');
  const [mapReady, setMapReady] = useState(false);

  // Clientes com coordenadas
  const mappedClients = (data.clients || []).filter(
    c => c.lat && c.lng && (c.lat !== 0 || c.lng !== 0)
  );

  // Inicializar Leaflet
  useEffect(() => {
    if (!mapRef.current) return;
    if (leafletRef.current) return; // já inicializado

    // Verificar se Leaflet está disponível
    const L = window.L;
    if (!L) {
      setMapReady(false);
      return;
    }

    // Centro padrão: Brasil
    const defaultCenter = [-15.7801, -47.9292];
    const center = mappedClients.length > 0
      ? [mappedClients[0].lat, mappedClients[0].lng]
      : defaultCenter;

    const map = L.map(mapRef.current).setView(center, mappedClients.length > 0 ? 10 : 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    leafletRef.current = map;
    setMapReady(true);

    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove();
        leafletRef.current = null;
      }
    };
  }, []);

  // Adicionar/atualizar marcadores
  useEffect(() => {
    const L = window.L;
    if (!L || !leafletRef.current || !mapReady) return;

    const map = leafletRef.current;

    // Limpar marcadores antigos
    map.eachLayer(layer => {
      if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    // Visitas por cliente
    const visitsByClient = {};
    (data.visits || []).forEach(v => {
      if (!visitsByClient[v.clientId]) visitsByClient[v.clientId] = [];
      visitsByClient[v.clientId].push(v);
    });

    // Filtrar clientes
    const filtered = mappedClients.filter(c => {
      if (!filter) return true;
      return c.name.toLowerCase().includes(filter.toLowerCase()) ||
             c.city?.toLowerCase().includes(filter.toLowerCase());
    });

    filtered.forEach(client => {
      const visits   = visitsByClient[client.id] || [];
      const status   = client.activityStatus?.clientStatus || 'Lead';
      const color    = statusColor(status);
      const hasVisit = visits.length > 0;

      // Ícone SVG personalizado
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
          <ellipse cx="16" cy="38" rx="8" ry="3" fill="rgba(0,0,0,0.2)"/>
          <path d="M16 0 C7.2 0 0 7.2 0 16 C0 26 16 40 16 40 S32 26 32 16 C32 7.2 24.8 0 16 0Z"
            fill="${color}" stroke="white" stroke-width="2"/>
          <circle cx="16" cy="16" r="8" fill="white" opacity="0.9"/>
          <text x="16" y="20" text-anchor="middle" font-size="10" font-family="Arial">${hasVisit ? visits.length : '!'}</text>
        </svg>`;

      const icon = L.divIcon({
        html: svg,
        iconSize:   [32, 40],
        iconAnchor: [16, 40],
        popupAnchor: [0, -40],
        className: '',
      });

      const marker = L.marker([client.lat, client.lng], { icon }).addTo(map);

      marker.on('click', () => {
        setSelected({ client, visits });
      });
    });

    // Ajustar bounds se tiver marcadores
    if (filtered.length > 1) {
      try {
        const bounds = L.latLngBounds(filtered.map(c => [c.lat, c.lng]));
        map.fitBounds(bounds, { padding: [40, 40] });
      } catch {}
    }
  }, [mapReady, data.clients, data.visits, filter, mappedClients]);

  const clientVisits = selected
    ? (data.visits || [])
        .filter(v => v.clientId === selected.client.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
    : [];

  const clientOrders = selected
    ? (data.orders || []).filter(o => o.clientId === selected.client.id)
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Header */}
      <div className="hdr">
        <button className="hbtn" onClick={() => setPage('home')}>←</button>
        <span className="hdr-t">🗺️ Mapa de Visitas</span>
      </div>

      {/* Filtro */}
      <div style={{ padding: '10px 16px', background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="🔍 Filtrar por nome ou cidade…"
          style={{
            width: '100%', border: '1.5px solid var(--border)', borderRadius: 9,
            padding: '8px 12px', fontSize: 14, background: 'var(--bg)',
          }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {['Quente', 'Morno', 'Frio', 'Lead'].map(s => (
            <span key={s} style={{
              background: statusColor(s), color: '#fff', borderRadius: 20,
              padding: '2px 10px', fontSize: 11, fontWeight: 600,
            }}>
              {s}
            </span>
          ))}
          <span style={{ fontSize: 11, color: 'var(--text3)', alignSelf: 'center' }}>
            {mappedClients.length} clientes no mapa
          </span>
        </div>
      </div>

      {/* Layout: Mapa + Painel */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>

        {/* Mapa */}
        <div
          ref={mapRef}
          style={{ flex: 1, minHeight: 300, zIndex: 1 }}
        />

        {/* Aviso se Leaflet não carregou */}
        {!mapReady && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: '#f8fffe', zIndex: 2, flexDirection: 'column', gap: 12,
          }}>
            <div style={{ fontSize: 40 }}>🗺️</div>
            <div style={{ fontWeight: 600, color: '#2d6a4f' }}>Mapa não disponível</div>
            <div style={{ fontSize: 12, color: '#888', textAlign: 'center', maxWidth: 260 }}>
              Adicione o script do Leaflet.js no seu HTML para habilitar o mapa interativo.<br/>
              <code style={{ fontSize: 10, background: '#f0f0f0', padding: '2px 6px', borderRadius: 4 }}>
                unpkg.com/leaflet@1.9.4/dist/leaflet.js
              </code>
            </div>
            {/* Fallback: lista de clientes */}
            <div style={{ marginTop: 12, width: '100%', maxWidth: 360, maxHeight: 200, overflowY: 'auto' }}>
              {mappedClients.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelected({ client: c, visits: [] })}
                  style={{
                    padding: '8px 12px', borderBottom: '1px solid #eee', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: statusColor(c.activityStatus?.clientStatus),
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: '#888', marginLeft: 'auto' }}>{c.city}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Painel lateral de detalhes */}
        {selected && (
          <div style={{
            width: 280, background: 'var(--card)', borderLeft: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', zIndex: 10, overflowY: 'auto',
          }}>
            {/* Cabeçalho do cliente */}
            <div style={{
              padding: '12px 14px', borderBottom: '1px solid var(--border)',
              background: statusColor(selected.client.activityStatus?.clientStatus) + '18',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{selected.client.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                    {selected.client.city}{selected.client.state ? `/${selected.client.state}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{
                  background: statusColor(selected.client.activityStatus?.clientStatus),
                  color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
                }}>
                  {selected.client.activityStatus?.clientStatus || 'Lead'}
                </span>
                {clientOrders.length > 0 && (
                  <span style={{
                    background: '#2d6a4f', color: '#fff', borderRadius: 20,
                    padding: '2px 10px', fontSize: 11,
                  }}>
                    {clientOrders.length} pedido{clientOrders.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setPage('clientDetail:' + selected.client.id)}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--bg)', fontSize: 12, cursor: 'pointer',
                  }}
                >
                  👤 Ver Cliente
                </button>
              </div>
            </div>

            {/* Timeline de visitas */}
            <div style={{ padding: '10px 14px', flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase' }}>
                Timeline de Atividades
              </div>

              {clientVisits.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
                  Nenhuma visita registrada.
                </div>
              )}

              {clientVisits.map(v => (
                <div key={v.id} style={{
                  borderLeft: '2px solid #2d6a4f', paddingLeft: 10, marginBottom: 12, position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute', left: -6, top: 2,
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#2d6a4f', border: '2px solid var(--card)',
                  }} />
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                    {new Date(v.date).toLocaleDateString('pt-BR')}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 1 }}>
                    {ACTIVITY_ICON[v.activityType] || '📍'} {v.activityType || 'Visita'}
                  </div>
                  {v.notes && (
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                      {v.notes}
                    </div>
                  )}
                </div>
              ))}

              {/* Pedidos na timeline */}
              {clientOrders.map(o => (
                <div key={o.id} style={{
                  borderLeft: '2px solid #f59e0b', paddingLeft: 10, marginBottom: 12, position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute', left: -6, top: 2,
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#f59e0b', border: '2px solid var(--card)',
                  }} />
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                    {o.date ? new Date(o.date).toLocaleDateString('pt-BR') : 'Pedido'}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 1 }}>
                    🛒 Pedido{o.orderNumber ? ` #${o.orderNumber}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                    {o.status === 'pago' ? '✅ Pago' : o.status === 'cancelado' ? '❌ Cancelado' : '⏳ Pendente'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
