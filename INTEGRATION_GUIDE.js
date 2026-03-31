/**
 * GUIA DE INTEGRAÇÃO — Agri Vendas v10.2
 * =========================================
 *
 * Este arquivo explica ONDE e COMO plugar cada componente novo
 * no seu App principal (index.html ou pages/index.jsx).
 *
 * NÃO é um componente executável — é um guia de referência.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. IMPORTS — adicione no topo do seu App principal
// ─────────────────────────────────────────────────────────────────────────────

import { APP_NAME }         from '@/lib/app-patches-v102';
import HomePage             from '@/components/HomePage';
import ProductsPage         from '@/components/ProductsPage';
import ProductDetailPage    from '@/components/ProductDetailPage';
import VisitForm            from '@/components/VisitForm';
import VisitMap             from '@/components/VisitMap';
import GreenhouseDrawing    from '@/components/GreenhouseDrawing';
// Já existentes:
import ClientForm           from '@/components/ClientForm';
import OrderForm            from '@/components/OrderForm';
import ProductForm          from '@/components/ProductForm';

// ─────────────────────────────────────────────────────────────────────────────
// 2. ESTADO — adicione no useState do App
// ─────────────────────────────────────────────────────────────────────────────

// Estados de navegação de produto
const [viewProductId, setViewProductId] = useState(null);
const [editProductId, setEditProductId] = useState(null);

// Estado de visita
const [editVisitId,   setEditVisitId]   = useState(null);
const [visitClientId, setVisitClientId] = useState(null); // pré-selecionar cliente

// Estado do desenho técnico
const [showDrawing,   setShowDrawing]   = useState(false);
const [drawingEnv,    setDrawingEnv]    = useState(null);
const [drawingClient, setDrawingClient] = useState(null);

// ─────────────────────────────────────────────────────────────────────────────
// 3. ROTEADOR — substitua o seu switch/case de página por este
// ─────────────────────────────────────────────────────────────────────────────

function renderPage() {
  switch (page) {

    // ── Home correta ──────────────────────────────────────────────────────
    case 'home':
      return (
        <HomePage
          store={store}
          setPage={setPage}
        />
      );

    // ── Clientes ──────────────────────────────────────────────────────────
    case 'clients':
      return <ClientsPage store={store} setPage={setPage} setEditClientId={setEditClientId} />;

    case 'clientForm':
      return (
        <ClientForm
          store={store}
          editId={editClientId}
          setPage={setPage}
          clearEdit={() => setEditClientId(null)}
        />
      );

    // ── Produtos ──────────────────────────────────────────────────────────
    // SUBSTITUIR o antigo 'products' por ProductsPage com botão "Ver"
    case 'products':
      return (
        <ProductsPage
          store={store}
          setPage={setPage}
          setEditProductId={setEditProductId}
          setViewProductId={setViewProductId}
        />
      );

    case 'productDetail':
      return (
        <ProductDetailPage
          store={store}
          productId={viewProductId}
          setPage={setPage}
          setEditProductId={setEditProductId}
        />
      );

    case 'productForm':
      return (
        <ProductForm
          store={store}
          editId={editProductId}
          setPage={setPage}
          clearEdit={() => setEditProductId(null)}
        />
      );

    // ── Pedidos ───────────────────────────────────────────────────────────
    case 'orders':
      return <OrdersPage store={store} setPage={setPage} setEditOrderId={setEditOrderId} />;

    case 'orderForm':
      return (
        <OrderForm
          key={editOrderId || 'new-order'}   // ← CRUCIAL: remonta ao criar novo
          store={store}
          editId={editOrderId}
          setPage={setPage}
          clearEdit={() => setEditOrderId(null)}
        />
      );

    // ── Visitas ───────────────────────────────────────────────────────────
    case 'visitForm':
      return (
        <VisitForm
          store={store}
          clientId={visitClientId}
          editId={editVisitId}
          setPage={setPage}
          clearEdit={() => { setEditVisitId(null); setVisitClientId(null); }}
        />
      );

    // ── Mapa de Visitas ───────────────────────────────────────────────────
    case 'visitMap':
      return <VisitMap store={store} setPage={setPage} />;

    // ── Relatórios ────────────────────────────────────────────────────────
    case 'reports':
      return <ReportsPage store={store} setPage={setPage} />;

    // ── Configurações ─────────────────────────────────────────────────────
    case 'config':
      return <ConfigPage store={store} setPage={setPage} />;

    default:
      return <HomePage store={store} setPage={setPage} />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DESENHO TÉCNICO — como usar no detalhe do cliente/ambiente
// ─────────────────────────────────────────────────────────────────────────────

// No detalhe do cliente, botão por ambiente:
/*
{(client.environments || []).map(env => (
  <div key={env.id} style={{ display: 'flex', gap: 8 }}>
    <span>{env.label}</span>
    <button onClick={() => {
      setDrawingEnv(env);
      setDrawingClient(client);
      setShowDrawing(true);
    }}>
      🌿 Desenho Técnico
    </button>
  </div>
))}

{showDrawing && (
  <GreenhouseDrawing
    env={drawingEnv}
    client={drawingClient}
    onClose={() => setShowDrawing(false)}
  />
)}
*/

// ─────────────────────────────────────────────────────────────────────────────
// 5. CONFIG — duas abas separadas para Categorias e Produtos
// ─────────────────────────────────────────────────────────────────────────────

// Na sua ConfigPage, substitua a aba "Produtos" por DUAS abas:
/*
const CONFIG_TABS = [
  { id: 'categories',        label: '🏷️ Cat. Cliente'  },
  { id: 'productCategories', label: '📦 Cat. Produto'  },
  { id: 'products',          label: '🌿 Produtos'      },  // ← navega para ProductsPage
  { id: 'envTypes',          label: '🏗️ Amb. Tipos'    },
  { id: 'company',           label: '🏢 Empresa'       },
  { id: 'representative',    label: '👤 Representante' },
];

// Quando tab === 'products', chamar setPage('products') em vez de renderizar inline:
if (activeTab === 'products') { setPage('products'); }
*/

// ─────────────────────────────────────────────────────────────────────────────
// 6. SINCRONIZAÇÃO CORRIGIDA — downloadData que atualiza estado
// ─────────────────────────────────────────────────────────────────────────────

// No seu useStore ou store principal, substitua downloadData por:
/*
const downloadData = async () => {
  const ws  = getWorkspace();
  const key = getSyncKey();
  const res = await fetch(`/api/sync?workspace=${ws}`, {
    headers: { 'x-app-key': key },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Erro no servidor');

  const normalized = normalizeDataState(json.payload);

  // 1. Salvar no storage local
  localStorage.setItem(`agrivendas_${ws}`, JSON.stringify(normalized));

  // 2. ATUALIZAR ESTADO REACT — sem isso a UI não re-renderiza!
  up(() => normalized);   // se usar: const up = fn => setState(fn)
  // OU:
  // setData(normalized);
  // OU (com reducer):
  // dispatch({ type: 'SET_ALL', payload: normalized });
};
*/

// ─────────────────────────────────────────────────────────────────────────────
// 7. MANIFEST PWA — substitua no public/manifest.json
// ─────────────────────────────────────────────────────────────────────────────

/*
{
  "name": "Agri Vendas",
  "short_name": "Agri Vendas",
  "description": "Sistema de vendas e visitas agrícolas",
  "theme_color": "#2d6a4f",
  "background_color": "#ffffff",
  "display": "standalone",
  "start_url": "/",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
*/

// ─────────────────────────────────────────────────────────────────────────────
// 8. STORE — addVisit e editVisit (se ainda não existirem)
// ─────────────────────────────────────────────────────────────────────────────

/*
const addVisit = v => up(d => {
  const newVisit = { ...v, id: uuid(), createdAt: new Date().toISOString() };
  enqueueOperation({ entity: 'visits', entityId: newVisit.id, opType: 'create', payload: newVisit });
  return { ...d, visits: [newVisit, ...d.visits] };
});

const editVisit = (id, v) => up(d => {
  enqueueOperation({ entity: 'visits', entityId: id, opType: 'update', payload: v });
  return { ...d, visits: d.visits.map(x => x.id === id ? { ...x, ...v } : x) };
});

const deleteProduct = id => up(d => {
  enqueueOperation({ entity: 'products', entityId: id, opType: 'delete', payload: { id } });
  return { ...d, products: d.products.filter(p => p.id !== id) };
});
*/
