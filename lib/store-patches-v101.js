/**
 * lib/store-patches-v101.js
 * Patches v10.1 para aplicar no index.html atual.
 *
 * Problemas corrigidos:
 *  1. addOrder: SEMPRE gera UUID novo — nunca reutiliza pedido anterior
 *  2. addItem no OrderForm: não agrupa por productId — cada item tem UUID próprio
 *  3. Produto: campos finameCode e ncmCode
 *  4. Cliente: campos documentFrontPath, documentBackPath, residenceProofPath
 *  5. normalizeDataState: inclui orderNumber nos pedidos
 */

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 1: addOrder — NUNCA reutiliza UUID anterior
//
// O bug: se o formulário de novo pedido é aberto após ter editado um pedido,
// o estado local pode carregar o editId anterior e o addOrder acaba
// encontrando o pedido pelo clientId ou por outro campo fraco.
//
// A correção: addOrder SEMPRE gera um UUID novo. O editId só é passado
// ao editOrder — nunca ao addOrder.
// ─────────────────────────────────────────────────────────────────────────────

/*
// No App (root component), certifique-se que goEditOrder e o novo pedido
// são caminhos DISTINTOS:

// ✅ CORRETO:
const goEditOrder = (id) => { setEditOrderId(id); setPage('orderForm'); };
const goNewOrder  = ()   => { setEditOrderId(null); setPage('orderForm'); };

// ❌ ERRADO:
// Nunca abra orderForm sem limpar o editOrderId primeiro ao criar novo pedido.

// No OrderForm, a guarda já existe via key:
// <OrderForm key={editOrderId || 'new-order'} ... />
// Isso garante que o formulário é remontado do zero em cada novo pedido.
*/

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 2: addItem no OrderForm — cada produto adicionado = item com UUID único
//
// O bug atual: addItem faz:
//   const ex2 = items.find(it => it.productId === selProd);
//   if (ex2) { ... }  ← agrupa por productId
//
// Isso impede adicionar o mesmo produto 2x como itens separados.
// A correção: SEMPRE criar um novo item com UUID próprio.
// ─────────────────────────────────────────────────────────────────────────────

/*
// Substitua a função addItem no OrderForm por:

const addItem = () => {
  if (!selProd) { showToast('⚠️ Selecione um produto'); return; }
  const prod = data.products.find(p => p.id === selProd);
  if (!prod) return;

  // PATCH: sempre cria item novo com UUID próprio
  // Mesmo produto pode aparecer 2x no pedido como itens separados
  setItems(prev => [
    ...prev,
    {
      id:               uuid(),              // ← UUID único por item
      productId:        selProd,
      productName:      prod.name   || '',
      productModel:     prod.model  || '',
      qty:              +selQty || 1,
      unitPrice:        prod.price  || 0,
      repCommissionPct: prod.repCommissionPct || 0,  // ← snapshot
    },
  ]);

  setSelProd('');
  setSelQty('1');
  setAddingProd(false);
};

// E o botão de remoção deve usar item.id (não item.productId):
// onClick={() => setItems(items.filter(it => it.id !== item.id))}

// Edição de qty/preço também por item.id:
// setItems(items.map(it => it.id === item.id ? { ...it, qty: ... } : it))
*/

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 3: normalizeDataState — inclui novos campos
// Adicione estes campos ao mapeamento existente de cada entidade
// ─────────────────────────────────────────────────────────────────────────────

/*
// Em orders (dentro do map):
orderNumber: o.orderNumber || null,   // número sequencial visível

// Em clients (dentro do map):
documentFrontPath:  c.documentFrontPath  || null,
documentBackPath:   c.documentBackPath   || null,
residenceProofPath: c.residenceProofPath || null,

// Em products (dentro do map):
finameCode: p.finameCode || '',
ncmCode:    p.ncmCode    || '',

// Em order_items (dentro do map):
id:               item.id || uuid(),           // garante UUID estável
repCommissionPct: item.repCommissionPct != null
  ? item.repCommissionPct
  : (raw.products || []).find(p => p.id === item.productId)?.repCommissionPct ?? 0,
*/

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 4: addProduct e editProduct — incluir finameCode e ncmCode
// ─────────────────────────────────────────────────────────────────────────────

/*
// No ProductForm, adicione os campos ao estado inicial:
const [f, setF] = useState({
  name:             ex?.name             || '',
  model:            ex?.model            || '',
  categoryId:       ex?.categoryId       || '',
  dimensions:       ex?.dimensions       || '',
  color:            ex?.color            || '',
  price:            ex?.price            || '',
  repCommissionPct: ex?.repCommissionPct || '',
  finameCode:       ex?.finameCode       || '',   // ← NOVO
  ncmCode:          ex?.ncmCode          || '',   // ← NOVO
  notes:            ex?.notes            || '',
  photoIds:         ex?.photoIds         || [],
});

// No submit do ProductForm, inclua os campos no objeto:
const product = {
  ...f,
  price:            parseFloat(...) || 0,
  repCommissionPct: parseFloat(...) || 0,
  finameCode:       f.finameCode.trim() || '',   // ← NOVO
  ncmCode:          f.ncmCode.trim()    || '',   // ← NOVO
};
*/

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 5: addClient e editClient — incluir campos de documentos
// ─────────────────────────────────────────────────────────────────────────────

/*
// No ClientForm, adicione ao estado inicial:
const [form, setForm] = useState({
  // ... campos existentes ...
  documentFrontPath:   ex?.documentFrontPath   || null,
  documentBackPath:    ex?.documentBackPath     || null,
  residenceProofPath:  ex?.residenceProofPath   || null,
});

// No submit do ClientForm, já vem incluído via spread {...form}.
*/

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 6: sync.js — incluir novos campos no writeAll
// ─────────────────────────────────────────────────────────────────────────────

/*
// Em clients (dentro do map no writeAll):
document_front_path:   c.documentFrontPath   || null,
document_back_path:    c.documentBackPath     || null,
residence_proof_path:  c.residenceProofPath   || null,

// Em products (dentro do map no writeAll):
finame_code: p.finameCode || '',
ncm_code:    p.ncmCode    || '',

// Em orders (dentro do map no writeAll):
order_number: o.orderNumber || null,   // não enviar — banco gera via trigger
// (NÃO inclua order_number no upsert, ou o banco recalcula errado)
// Ou, se quiser preservar o número após sync, inclua como:
// order_number: o.orderNumber || undefined,  // undefined = banco mantém o atual

// Em order_items (dentro do map no writeAll):
rep_commission_pct: i.repCommissionPct || 0,   // snapshot v10
*/

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 7: leitura (GET sync) — incluir novos campos no readAll
// ─────────────────────────────────────────────────────────────────────────────

/*
// Em clients (dentro do map no readAll):
documentFrontPath:   c.document_front_path   || null,
documentBackPath:    c.document_back_path     || null,
residenceProofPath:  c.residence_proof_path   || null,

// Em products:
finameCode: p.finame_code || '',
ncmCode:    p.ncm_code    || '',

// Em orders:
orderNumber: o.order_number || null,

// Em order_items:
repCommissionPct: i.rep_commission_pct || 0,
*/

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 8: proteção contra reuso de pedido — guarda no App root
//
// Certifique-se de que o caso 'orderForm' respeita essa lógica:
// ─────────────────────────────────────────────────────────────────────────────

/*
// No App root, na função render():
case 'orderForm':
  return (
    <OrderForm
      key={editOrderId || 'new-order'}  // ← key garante remontagem completa
      store={store}
      setPage={go}
      editId={editOrderId}              // null = novo pedido
      clearEdit={() => setEditOrderId(null)}
    />
  );

// A navegação para NOVO pedido deve sempre limpar o editOrderId:
const goNewOrder = () => {
  setEditOrderId(null);   // ← CRÍTICO: limpar antes de navegar
  setPage('orderForm');
};

// E o botão "Novo Pedido" na OrdersList deve chamar goNewOrder():
<button onClick={() => goNewOrder()}>+ Novo</button>

// O botão de editar um pedido usa goEditOrder(id) normalmente.
*/

export default {};
