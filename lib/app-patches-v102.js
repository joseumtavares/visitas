/**
 * lib/app-patches-v102.js — Agri Vendas v10.2
 *
 * PATCH CENTRAL — cole este arquivo no projeto e aplique os trechos
 * indicados no index.html / App principal.
 *
 * CORREÇÕES INCLUÍDAS:
 *  1. Nome: ThermoVisit → Agri Vendas
 *  2. Home correta: Clientes, Pedidos, Produtos, Relatórios, Mapa
 *  3. Módulo Produtos: lista + ver + editar (botão "Ver" restaurado)
 *  4. Config > Produtos corrigido (separado em Categorias / Produtos)
 *  5. Status do pedido separado do status do cliente
 *  6. Sincronização: "Baixar dados" atualiza estado global + UI
 *  7. Desenho técnico da estufa (GreenhouseDrawing.jsx)
 *  8. Mapa de visitas (VisitMap.jsx)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. CONSTANTE DO NOME DO SISTEMA
// Substitua "ThermoVisit" por APP_NAME em todo o código
// ─────────────────────────────────────────────────────────────────────────────

export const APP_NAME = 'Agri Vendas';

// ─────────────────────────────────────────────────────────────────────────────
// 2. HOME CORRETA
//
// Substitua os cards da home por:
// Clientes | Pedidos | Produtos | Relatórios | Mapa de Visitas
// ─────────────────────────────────────────────────────────────────────────────

/*
// Exemplo de cards da Home:
const HOME_CARDS = [
  { icon: '👥', label: 'Clientes',       page: 'clients',   badge: data.clients.length },
  { icon: '🛒', label: 'Pedidos',        page: 'orders',    badge: data.orders.length  },
  { icon: '📦', label: 'Produtos',       page: 'products',  badge: data.products.length},
  { icon: '📊', label: 'Relatórios',     page: 'reports'                               },
  { icon: '🗺️', label: 'Mapa de Visitas',page: 'visitMap'                              },
  { icon: '⚙️', label: 'Configurações',  page: 'config'                                },
];
*/

// ─────────────────────────────────────────────────────────────────────────────
// 3. LISTA DE PRODUTOS COM BOTÃO "VER" E "EDITAR"
//
// Use este componente no lugar do antigo que não tinha botão "Ver"
// ─────────────────────────────────────────────────────────────────────────────

/*
// No componente de lista de produtos:
{(data.products || []).map(p => (
  <div key={p.id} className="card">
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 700 }}>{p.name}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)' }}>
        {getCategoryName(p.categoryId)} · {fmtMoney(p.price)}
      </div>
    </div>
    <div style={{ display: 'flex', gap: 6 }}>
      <button className="btn bg bs" onClick={() => navigate('productDetail', p.id)}>👁️ Ver</button>
      <button className="btn bp bs" onClick={() => navigate('productEdit', p.id)}>✏️ Editar</button>
    </div>
  </div>
))}
*/

// ─────────────────────────────────────────────────────────────────────────────
// 4. CONFIG > PRODUTOS — DUAS ABAS SEPARADAS
//
// Substitua a tela de Config que misturava Produto e Categoria
// ─────────────────────────────────────────────────────────────────────────────

/*
// Na tela de Config:
const CONFIG_TABS = [
  { id: 'categories',        label: '🏷️ Categorias de Cliente' },
  { id: 'productCategories', label: '📦 Categorias de Produto' },
  { id: 'products',          label: '🌿 Produtos'              },  // ← NOVO
  { id: 'envTypes',          label: '🌡️ Tipos de Ambiente'     },
  { id: 'company',           label: '🏢 Empresa'               },
  { id: 'representative',    label: '👤 Representante'         },
];
*/

// ─────────────────────────────────────────────────────────────────────────────
// 5. STATUS SEPARADOS — CLIENTE ≠ PEDIDO
//
// CLIENTE: clientStatus (Lead, Quente, Morno, Frio)
// PEDIDO:  status (pendente, pago, cancelado)
// NUNCA misturar!
// ─────────────────────────────────────────────────────────────────────────────

/*
// CORRETO — como acessar:
const clientStatus  = client.activityStatus?.clientStatus; // 'Lead' | 'Quente' | 'Morno' | 'Frio'
const orderStatus   = order.status;                         // 'pendente' | 'pago' | 'cancelado'

// ERRADO — nunca fazer:
// client.status = 'pago'; // ← ERRADO, status de pedido no cliente
*/

// ─────────────────────────────────────────────────────────────────────────────
// 6. SINCRONIZAÇÃO CORRIGIDA
//
// Problema: "Baixar dados" buscava da API mas NÃO atualizava o estado React
// Correção: após fetch, chamar setState/dispatch para re-renderizar
// ─────────────────────────────────────────────────────────────────────────────

/*
// CORRETO — downloadData com atualização de estado:
async function downloadData() {
  try {
    showToast('🔄 Baixando dados…');
    const res  = await fetch(`/api/sync?workspace=${workspace}`);
    const raw  = await res.json();

    // 1. Atualizar storage local
    localStorage.setItem('agrivendas_data', JSON.stringify(raw));

    // 2. Normalizar e atualizar estado global — MUITO IMPORTANTE
    const normalized = normalizeDataState(raw);
    setData(normalized);                    // ← atualiza React state
    dispatch({ type: 'SET_DATA', payload: normalized }); // ← ou via reducer

    showToast('✅ Dados atualizados!');
  } catch (err) {
    showToast('❌ Erro ao baixar dados: ' + err.message);
  }
}
*/

// ─────────────────────────────────────────────────────────────────────────────
// 7. DESENHO TÉCNICO DA ESTUFA
//
// Importar e usar no detail do ambiente/cliente:
// ─────────────────────────────────────────────────────────────────────────────

/*
import GreenhouseDrawing from '@/components/GreenhouseDrawing';

// No detalhe do ambiente:
const [showDrawing, setShowDrawing] = useState(false);

// Botão para abrir:
<button onClick={() => setShowDrawing(true)}>🌿 Ver Desenho Técnico</button>

// Modal:
{showDrawing && (
  <GreenhouseDrawing
    env={selectedEnv}
    client={selectedClient}
    onClose={() => setShowDrawing(false)}
  />
)}

// API para gerar desenho via backend (opcional — o componente já gera no frontend):
// GET /api/drawing/{clientId}?envId=xxx
*/

// ─────────────────────────────────────────────────────────────────────────────
// 8. MAPA DE VISITAS
//
// Adicionar Leaflet.js no HTML e importar o componente:
// ─────────────────────────────────────────────────────────────────────────────

/*
// No <head> do HTML:
// <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
// <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

import VisitMap from '@/components/VisitMap';

// Na navegação:
case 'visitMap':
  return <VisitMap store={store} setPage={setPage} />;
*/

// ─────────────────────────────────────────────────────────────────────────────
// 9. PDF DO PEDIDO — já implementado em pdfService.js
//
// Importar e usar no OrderForm e na lista de pedidos:
// ─────────────────────────────────────────────────────────────────────────────

/*
import { printOrderPdf } from '@/services/pdfService';

// No botão de imprimir:
<button onClick={() => printOrderPdf({
  order,
  client,
  env,
  referral,
  company:        data.company,
  representative: data.representative,
  products:       data.products,
})}>
  🖨️ Imprimir PDF
</button>
*/

// ─────────────────────────────────────────────────────────────────────────────
// 10. MANIFEST / PWA — Agri Vendas
// ─────────────────────────────────────────────────────────────────────────────

export const PWA_MANIFEST = {
  name:             'Agri Vendas',
  short_name:       'Agri Vendas',
  description:      'Sistema de vendas e visitas agrícolas',
  theme_color:      '#2d6a4f',
  background_color: '#ffffff',
  display:          'standalone',
  start_url:        '/',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
};
