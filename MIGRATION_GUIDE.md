# ThermoVisit v10 — Guia de Migração e Implementação

## O que mudou na v10

### Comissões do representante (bug principal corrigido)
- **Antes:** chave de negócio era `(workspace, order_id, product_id)` — frágil se o mesmo produto aparecesse 2x no pedido
- **Agora:** chave de negócio é `(workspace, order_item_id)` — cada item do pedido tem sua própria comissão

### Itens de pedido (order_items)
- **Antes:** itens eram deletados e recriados a cada sync → IDs instáveis
- **Agora:** upsert por `id` estável → FK `order_item_id` em `rep_commissions` funciona corretamente

### Campos de endereço no cadastro de clientes
- **Antes:** apenas campo `address` livre
- **Agora:** `cep`, `street`, `number`, `complement`, `neighborhood`, `city`, `state` + consulta automática ao ViaCEP

### Sync sem falha silenciosa
- **Antes:** erros em `rep_commissions` eram capturados, o sync retornava sucesso e o frontend não sabia
- **Agora:** `warnings` são sempre retornados no payload de resposta

---

## Passo a Passo de Implementação

### ETAPA 1 — Banco de dados (CRÍTICO — fazer primeiro)

1. Acesse o **SQL Editor do Supabase**
2. Rode o arquivo `supabase/schema_v10_completo.sql` na íntegra
3. Confirme que as tabelas foram criadas/atualizadas:

```sql
-- Checar colunas novas nos clientes
SELECT column_name FROM information_schema.columns
WHERE table_name = 'clients' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Checar coluna order_item_id em rep_commissions
SELECT column_name FROM information_schema.columns
WHERE table_name = 'rep_commissions' AND table_schema = 'public';

-- Checar constraints
SELECT conname FROM pg_constraint
WHERE conrelid IN ('rep_commissions'::regclass, 'commissions'::regclass)
ORDER BY conname;
```

4. Resultado esperado: 
   - `clients` tem as colunas: `cep`, `street`, `number`, `complement`, `state`
   - `order_items` tem a coluna: `rep_commission_pct`
   - `rep_commissions` tem as colunas: `order_item_id`, `reprocessed_at`, `reprocess_reason`
   - Constraint `rep_commissions_item_unique` existe

---

### ETAPA 2 — Corrigir o index.html (se ainda não migrou para Next.js)

Abra o `index.html` e aplique os patches do arquivo `lib/store-patches.js`.

#### 2a. normalizeDataState
Localize a função `normalizeDataState` e adicione nos itens de pedido:
```js
items: (o.items || []).map(item => ({
  ...item,
  id: item.id || uuid(),   // ← PATCH: ID estável
  repCommissionPct: item.repCommissionPct != null
    ? item.repCommissionPct
    : ((raw.products || []).find(p => p.id === item.productId)?.repCommissionPct ?? 0),
})),
```

#### 2b. _buildCommissions
Substitua a função completa pela versão do `lib/store-patches.js` (PATCH 3).  
A diferença principal: `orderItemId: item.id` em vez de depender só de `productId`.

#### 2c. addOrder e editOrder
Adicione o snapshot de `repCommissionPct` e garantia de `id` estável nos itens
(ver PATCH 4 e PATCH 6 em `lib/store-patches.js`).

#### 2d. reprocessCommissions
Substitua pela versão do PATCH 5 — detecta mudança de qty, preço e percentual.

---

### ETAPA 3 — Corrigir o sync (api/sync.js)

Substitua o arquivo `api/sync.js` pelo conteúdo de `app/api/sync/route.js`.

Se ainda usa Vercel Functions (não App Router), adapte apenas o handler:
```js
module.exports = async function handler(req, res) {
  // ... lógica do GET/POST idêntica, só muda o formato de resposta
};
```

As principais mudanças no sync:
1. `order_items`: upsert por `id` (não mais delete+insert)
2. `rep_commissions`: upsert separado — `withItemId` usa `order_item_id` como conflict key
3. `clients`: inclui novos campos de endereço
4. `warnings` são sempre retornados

---

### ETAPA 4 — Implementar consulta de CEP

#### Opção A: Adicionar rota proxy ao seu projeto atual
Crie `api/cep.js` (Vercel Function):
```js
const { fetchCepFromViaCep, sanitizeCep } = require('../lib/cep');

module.exports = async function handler(req, res) {
  const { cep } = req.query;
  const digits = sanitizeCep(cep);
  if (!digits) return res.status(400).json({ ok: false, error: 'CEP inválido.' });
  try {
    const result = await fetchCepFromViaCep(digits);
    if (!result) return res.status(404).json({ ok: false, error: 'CEP não encontrado.' });
    res.status(200).json({ ok: true, data: result });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
};
```

#### Opção B: Next.js App Router
O arquivo `app/api/cep/route.js` já está pronto. Só fazer o deploy.

#### No frontend (ClientForm)
Adicione o componente `CepField` (arquivo `components/CepField.jsx`) e os campos separados de endereço no formulário de cliente.

---

### ETAPA 5 — Migração de dados existentes (rep_commissions)

Comissões criadas antes da v10 não têm `order_item_id`. Elas continuam funcionando normalmente (constraint de fallback `rep_commissions_order_product_unique`).

Para migrar as comissões antigas, execute esse script no Supabase:

```sql
-- Tenta associar comissões antigas ao order_item correspondente
UPDATE public.rep_commissions rc
SET order_item_id = oi.id
FROM public.order_items oi
WHERE oi.order_id  = rc.order_id
  AND oi.product_id = rc.product_id
  AND rc.order_item_id IS NULL
  AND rc.status = 'pendente';

-- Verificar quantas ficaram sem order_item_id (dados órfãos ou produto repetido)
SELECT COUNT(*) FROM public.rep_commissions WHERE order_item_id IS NULL;
```

Comissões que não puderem ser associadas (produto repetido, item deletado) ficam com `order_item_id = NULL` e são tratadas pelo fallback.

---

### ETAPA 6 — Deploy na Vercel

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente no painel da Vercel
#    (ou .env.local para desenvolvimento)
cp .env.example .env.local
# editar .env.local com suas credenciais

# 3. Build local para verificar
npm run build

# 4. Deploy
vercel --prod
```

**Variáveis necessárias na Vercel:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SYNC_KEY`
- `SUPABASE_PHOTOS_BUCKET`

---

## Estrutura de Pastas (Next.js v10)

```
thermovisit-v10/
├── app/
│   ├── layout.jsx              ← RootLayout (adicionar depois)
│   ├── page.jsx                ← Dashboard (adicionar depois)
│   └── api/
│       ├── sync/route.js       ✅ gerado
│       ├── cep/route.js        ✅ gerado
│       └── photos/route.js     ✅ gerado
├── components/
│   ├── CepField.jsx            ✅ gerado
│   ├── ClientForm.jsx          ✅ gerado
│   └── RepCommissionsPage.jsx  ✅ gerado
├── services/
│   └── commissionService.js    ✅ gerado
├── lib/
│   ├── supabase.js             ✅ gerado
│   ├── uuid.js                 ✅ gerado
│   ├── cep.js                  ✅ gerado
│   └── store-patches.js        ✅ gerado (patches p/ index.html atual)
├── supabase/
│   └── schema_v10_completo.sql ✅ gerado
├── public/
│   └── images/                 ← imagens estáticas públicas
├── .env.example                ✅ gerado
├── package.json                ✅ gerado
└── next.config.js              ✅ gerado
```

---

## Testes para validar após a migração

### Comissões do representante
1. ✅ Criar pedido com 2 produtos diferentes → gera 2 comissões pendentes
2. ✅ Criar pedido com o mesmo produto 2x → gera 2 comissões pendentes (sem conflito)
3. ✅ Marcar pedido como pago → comissões são criadas automaticamente
4. ✅ Alterar qty/preço de item em pedido pago → comissão pendente é recalculada
5. ✅ Pagar comissão → `status='paga'`, `paidAt` preenchido
6. ✅ Reprocessar → comissão paga preservada; pendente recalculada
7. ✅ Reprocessar sem mudanças → nenhuma alteração (idempotente)
8. ✅ Sincronizar → `rep_commissions` persiste corretamente no Supabase
9. ✅ Sync em 2 dispositivos → sem duplicidade

### CEP / cadastro de clientes
10. ✅ CEP válido (ex: 01001000) → preenche logradouro, bairro, cidade, UF
11. ✅ CEP inválido (menos de 8 dígitos) → mensagem clara, sem requisição
12. ✅ CEP inexistente (ex: 99999999) → mensagem "CEP não encontrado"
13. ✅ Falha de rede → mensagem de erro, sem crash
14. ✅ Editar campo após preenchimento automático → mantém o que o usuário digitou
15. ✅ Alterar CEP → reseta e refaz a consulta

### Sync geral
16. ✅ Sync com warnings → frontend exibe aviso (não mais falha silenciosa)
17. ✅ order_items com IDs estáveis → FK para rep_commissions funciona
18. ✅ Tombstones → registros deletados não voltam após sync

---

## Regras de negócio implementadas

| # | Regra | Status |
|---|-------|--------|
| 1 | Pedido não pago não gera comissão do rep | ✅ |
| 2 | Pedido pago gera comissão do rep por item | ✅ |
| 3 | Comissão paga nunca é sobrescrita | ✅ |
| 4 | Comissão pendente pode ser recalculada | ✅ |
| 5 | Item alterado recalcula comissão pendente | ✅ |
| 6 | Item removido remove comissão pendente | ✅ |
| 7 | Reprocessamento não gera duplicidade | ✅ |
| 8 | Comissão aparece corretamente na tela | ✅ |
| 9 | Rastreabilidade: orderItemId, reprocessedAt | ✅ |
| 10 | Alerta visual quando pedido pago sem comissão | ✅ |
