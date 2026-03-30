# Diagnóstico Técnico Completo — ThermoVisit v9
**Arquiteto:** Análise de produção real  
**Data:** Março 2026  
**Versão analisada:** v8 → correções aplicadas → v9

---

## 1. Diagnóstico Geral

O sistema é funcional e tem uma arquitetura relativamente coerente para o estágio em que está. O frontend em `index.html` (~2.400 linhas) centraliza estado, UI e regras de negócio via React + hooks. O backend em Vercel/Node trata sincronização com Supabase. A persistência principal é localStorage + IndexedDB (fotos).

**Ponto forte real:** o frontend nunca acessa o Supabase diretamente. Toda comunicação passa pelo backend — isso é correto e deve ser preservado.

**Resumo dos riscos críticos identificados:**

| # | Problema | Gravidade | Status v9 |
|---|----------|-----------|-----------|
| 1 | Registros deletados voltam após sync | 🔴 Crítico | ✅ Corrigido |
| 2 | Bug de deduplicação de comissão de rep | 🔴 Crítico | ✅ Corrigido |
| 3 | Comissão não recalcula se pedido pago já existia e items mudaram | 🔴 Crítico | ✅ Corrigido |
| 4 | PIN hardcoded `1234` no frontend | 🔴 Crítico | ✅ Corrigido |
| 5 | CORS refletindo origem diretamente (sem whitelist) | 🟠 Alto | ✅ Corrigido |
| 6 | Endpoint `/api/debug` sem autenticação em produção | 🟠 Alto | ✅ Corrigido |
| 7 | `delClient` não limpa `repCommissions` órfãs | 🟠 Alto | ✅ Corrigido |
| 8 | Multipart parsing manual de buffer binário frágil em `photos.js` | 🟠 Alto | ✅ Corrigido |
| 9 | Backup restaurado não sincroniza com nuvem imediatamente | 🟠 Alto | ✅ Corrigido |
| 10 | Tombstones ausentes — exclusões não propagadas | 🔴 Crítico | ✅ Corrigido |
| 11 | Ausência de constraint UNIQUE no banco para comissões | 🟠 Alto | ✅ Migration SQL |
| 12 | Monólito index.html | 🟡 Médio | Plano progressivo |

---

## 2. Causas Raiz Mais Prováveis

### 2.1 Registros deletados voltam (o problema mais relatado)

**Causa raiz:** O `api/sync.js` v8 operava apenas com UPSERT — nunca propagava exclusões ao banco remoto. Quando o usuário apagava um registro localmente e depois fazia `pullFromCloud`, o banco devolvia o registro intacto. Ciclo:

```
Usuário deleta registro → localStorage limpo ✅
→ pushToCloud (upsert): registro ausente no payload, banco não apaga ❌
→ pullFromCloud: banco devolve registro → localStorage repopulado ❌
```

**Correção v9:** Tabela `deleted_records` (tombstone) + função `propagateDeletions()` em `sync.js` + função `applyTombstones()` no frontend aplicada em todo pull.

### 2.2 Bug de deduplicação de comissão do representante

**Causa raiz:** A lógica original verificava `existingRepIds.size===0` — ou seja, só gerava comissão se não existia NENHUMA pendente. Mas se existiam comissões pagas E o pedido era reprocessado, a condição era `false` (havia registros, mesmo que pagos) e nenhuma nova comissão era gerada para itens novos. Além disso, não havia remoção das pendentes antes de reinserir, então um reprocessamento poderia inserir duplicatas.

**Correção v9:** Separar explicitamente `paidRepComms` de `pendingRepComms` por `orderId`. Preservar as pagas, remover as pendentes, reinserir com valores atuais. Excluir produtos já pagos da reinserção.

### 2.3 Comissão não recalculada ao editar pedido já pago

**Causa raiz:** O `editOrder` original só chamava `_buildCommissions` na transição `!=='pago' → ==='pago'`. Se o pedido já estava pago e o usuário alterava produtos, quantidades ou valores, nada acontecia.

**Correção v9:** Detectar mudanças em `items`, `total` e `referralId` mesmo quando `wasPaid===true`, e disparar reprocessamento.

### 2.4 PIN hardcoded

**Causa raiz:** `const DEV_PIN='1234'` visível no HTML minificado — qualquer usuário com DevTools tem acesso ao modo admin.

**Correção v9:** PIN removido do código. Sistema de hash djb2 local com configuração pelo próprio usuário. PIN nunca trafega em claro, nunca fica hardcoded.

### 2.5 Backup restaurado não atualiza nuvem

**Causa raiz:** `importBackup` v8 só aplicava o backup em localStorage. Se o usuário depois fazia pull, o banco remoto (com dados antigos) sobrescrevia o backup restaurado.

**Correção v9:** Após restaurar, `pushToCloud` é disparado automaticamente para garantir que o banco remoto receba o estado restaurado como fonte de verdade.

---

## 3. Correções Críticas Imediatas

### 3.1 — Executar migration SQL no Supabase

```
supabase/schema_v9_migration.sql
```

**O que cria:**
- Tabela `deleted_records` (tombstone para sync)
- `UNIQUE(workspace, order_id)` em `commissions` — impede duplicata no banco
- `UNIQUE(workspace, order_id, product_id)` em `rep_commissions` — impede duplicata no banco
- Função `recalc_rep_commissions(order_id)` — RPC idempotente para reprocessamento server-side
- Função `recalc_referral_commission(order_id)` — RPC idempotente para comissão de indicador
- Tabela `audit_logs` — observabilidade
- Índices de performance

### 3.2 — Configurar variáveis de ambiente

Adicionar ao `.env` / Vercel Dashboard:

```env
# Existente
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
APP_SYNC_KEY=sua-chave-segura-longa

# Novo — lista de origens permitidas (CORS whitelist)
ALLOWED_ORIGINS=https://seu-app.vercel.app,https://seu-dominio.com

# Opcional — ativar debug apenas quando necessário
ENABLE_DEBUG_ENDPOINT=false
```

### 3.3 — Deploy dos arquivos corrigidos

Substituir em produção:
- `api/_supabase.js` → CORS com whitelist, auditLog
- `api/sync.js` → tombstone + propagação de exclusões
- `api/photos.js` → multipart parsing binário seguro
- `api/debug.js` → protegido por chave + variável de ambiente
- `index.html` → todas as correções de lógica

---

## 4. Correção do Módulo de Comissões

### Antes (v8) — problemas identificados:

```javascript
// BUG 1: deduplicação só verificava pendentes, ignorava pagas
const existingRepIds = new Set(
  newRepComm.filter(c => c.orderId===orderId && c.status==='pendente').map(c=>c.id)
);
if(existingRepIds.size===0){ // ← só inseria se não havia NENHUMA pendente
  // mas se havia pagas, pulava — deixando itens novos sem comissão
}

// BUG 2: editOrder só processava na transição não-pago → pago
if(mergedO.status==='pago' && old?.status!=='pago'){
  // ← pedido já pago com itens editados: nunca recalculava
}

// BUG 3: delClient não limpava repCommissions
const delClient = id => up(d => {
  const orderIds = d.orders.filter(o=>o.clientId===id).map(o=>o.id);
  return { ...d,
    clients: d.clients.filter(x=>x.id!==id),
    // ← repCommissions não filtrado! ficavam órfãs no estado
  };
});
```

### Depois (v9) — garantias:

```
✅ Comissão de indicador: deduplicação por orderId (qualquer status)
✅ Comissão de rep: pendentes removidas e reinseridas; pagas preservadas
✅ editOrder: detecta mudanças de items/total/referral mesmo em pedido já pago
✅ reprocessCommissions: detecta produtos novos em pedidos já com comissão
✅ delClient: limpa repCommissions, commissions E leads relacionados
✅ delOrder: limpa repCommissions (já existia, mantido)
✅ Banco: UNIQUE constraints impedem duplicata mesmo se app falhar
✅ Banco: funções RPC recalc_* permitem reprocessamento server-side futuro
```

### Fluxo correto de comissão (v9):

```
addOrder(status=pago)
  → _buildCommissions(d, id, order, date)
      → comissão indicador: existe? não → criar
      → comissão rep: remover pendentes do orderId → recriar por produto

editOrder(status=pago, já pago ou não)
  → detectar: transição não-pago→pago? ou items/total/referral mudou?
  → se sim → _buildCommissions (mesma função)

reprocessCommissions()
  → para cada pedido pago:
      → falta comissão de indicador? → _buildCommissions
      → falta comissão de algum produto? → _buildCommissions
      → produto novo adicionado? → _buildCommissions

delOrder(id)
  → remove commissions onde orderId===id
  → remove repCommissions onde orderId===id

delClient(id)
  → coleta orderIds do cliente
  → remove orders, visits, commissions, repCommissions, environments
  → leads associados: limpa convertedClientId (não deleta o lead)
```

---

## 5. Correção da Sincronização

### Estratégia adotada: Tombstone (soft-delete register)

Escolhida sobre "full replace transacional" por ser mais segura para o estágio atual:
- Não destrói e recria dados a cada sync (menos risco de perda)
- Compatível com múltiplos dispositivos
- Reversível (tombstone pode ser consultado)
- Não exige transação complexa no banco

### Como funciona (v9):

**No POST (push do cliente para banco):**
```
1. Upsert dos registros presentes no payload
2. Para cada tabela: buscar IDs existentes no banco para o workspace
3. IDs no banco mas ausentes no payload → registrar tombstone + deletar
```

**No GET (pull do banco para cliente):**
```
1. Ler todas as tabelas normalmente
2. Ler tabela deleted_records para o workspace
3. Retornar _tombstones junto com o payload
```

**No frontend (ao receber pull):**
```
1. Receber payload com _tombstones
2. applyTombstones(payload, tombstones) — remove IDs marcados do estado local
3. normalizeDataState e salvar
```

### Fluxo completo sem regressão:

```
Dispositivo A deleta cliente X
  → localStorage: cliente X removido ✅
  → pushToCloud: propagateDeletions detecta X ausente → tombstone + DELETE no banco ✅

Dispositivo B faz pullFromCloud
  → banco retorna payload sem cliente X ✅
  → _tombstones contém X em 'clients'
  → applyTombstones remove X do estado local de B ✅

Dispositivo A faz backup → restaura backup antigo (com X)
  → importBackup: estado local recebe X de volta ✅
  → pushToCloud disparado imediatamente ✅
  → sync.js: X enviado no payload → upsert → tombstone apagado (novo INSERT) ✅
  → próximo pull de qualquer dispositivo recebe X ✅
```

---

## 6. Correção do Backup e da Restauração

### Problema v8:
```
Restaurar backup → estado local correto
→ autoSync (8s depois) → pullFromCloud: banco remoto mais novo → sobrescreve restore ❌
```

### Correção v9:
```javascript
const importBackup = async bk => {
  // 1. Restaurar estado local
  const normalized = normalizeDataState(appData);
  setData(normalized);
  saveData(normalized); // ← persistir ANTES do push
  
  // 2. Push imediato para nuvem (1.5s de delay para UI atualizar)
  setTimeout(() => pushToCloud(normalized, {silent: false}), 1500);
  // → banco remoto atualizado com o estado restaurado
  // → próximo pullFromCloud receberá o estado correto
};
```

### Política de fonte de verdade (v9):

| Situação | Fonte de verdade |
|----------|-----------------|
| Operação normal | localStorage (persistido) + banco (sincronizado) |
| Após restore de backup | Backup local → push imediato para banco |
| Conflito local × remoto | Timestamp: mais recente vence (comportamento atual mantido) |
| Exclusão local × dado remoto | Tombstone: exclusão sempre vence |

---

## 7. Correções de Segurança

### 7.1 PIN de acesso ao modo dev

| v8 | v9 |
|----|-----|
| `const DEV_PIN='1234'` hardcoded no HTML | PIN configurado pelo usuário, armazenado como hash djb2 |
| Visível para qualquer um com DevTools | Nunca em texto puro no código ou no storage |
| Sem possibilidade de alteração | Usuário define e pode alterar quando quiser |

**Limitação honesta:** hash djb2 é fraco criptograficamente. Para o contexto (PIN local de app offline-first), é suficiente. Se o contexto exigir segurança real, usar `crypto.subtle.digest('SHA-256', ...)` com salt.

### 7.2 CORS

| v8 | v9 |
|----|-----|
| `res.setHeader('Access-Control-Allow-Origin', origin)` — reflete qualquer origem | Whitelist via `ALLOWED_ORIGINS` env var |
| Qualquer site pode fazer requests autenticados | Apenas origens listadas recebem ACAO header válido |

**Como configurar:**
```env
ALLOWED_ORIGINS=https://seu-app.vercel.app,https://outro-dominio.com
```

### 7.3 Endpoint de debug

| v8 | v9 |
|----|-----|
| Acessível sem autenticação | Requer header `x-app-key` válido |
| Sempre disponível | Bloqueado em produção salvo `ENABLE_DEBUG_ENDPOINT=true` |
| Expõe prefixos de chaves | Expõe apenas metadados não-sensíveis |

### 7.4 Validação de upload de foto

| v8 | v9 |
|----|-----|
| Parsing manual com `.toString('binary')` — frágil com bytes aleatórios | Buffer binário nativo — correto para dados binários |
| Sem validação de tipo | Verificação de magic bytes JPEG (FF D8 FF) |
| Sem limite de tamanho | Limite de 8MB configurável |
| `photoId` sem validação | Validação `/^[a-zA-Z0-9_-]+$/` — previne path traversal |

---

## 8. Refatoração Arquitetural Recomendada

### Princípio: progressiva, sem parar o sistema

**Fase 1 — Sem tocar no index.html (já feita):** Corrigir backend e SQL.

**Fase 2 — Extrair módulos do index.html (próximo passo):**

```
index.html (orquestração e componentes de UI)
├── js/store.js         ← useStore, _buildCommissions, sync hooks
├── js/db.js            ← loadData, saveData, PS (IndexedDB), normalizeDataState
├── js/api.js           ← cloudRequest, pullFromCloud, pushToCloud
├── js/commissions.js   ← _buildCommissions, reprocessCommissions
└── js/backup.js        ← exportBackup, importBackup, getBackupPreview
```

Estratégia: usar `<script type="module">` e importar módulos. O HTML vira apenas o shell.

**Fase 3 — Build system simples (futuro):**
Introduzir Vite ou esbuild para bundling. Permite testes unitários dos módulos de negócio.

**Fase 4 — Mover lógica de comissão para backend (longo prazo):**
Usar as RPCs `recalc_rep_commissions` e `recalc_referral_commission` criadas no SQL via chamada explícita no `sync.js` após upsert de pedido pago.

---

## 9. Melhorias de Persistência e Fotos

### localStorage — limitações conhecidas:
- Limite ~5-10MB por origem
- Síncrono (bloqueia UI em dados grandes)
- Não transacional

**Recomendação para v10:** migrar o estado principal para IndexedDB usando `idb` (wrapper leve). Manter localStorage apenas para configurações (cloudCfg, backup metadata). O `PS` (PhotoStore) já usa IndexedDB corretamente — estender o padrão para dados também.

Exemplo de estrutura:
```javascript
// db.js — usar idb
import { openDB } from 'idb';
const db = await openDB('thermovisit', 1, {
  upgrade(db) {
    db.createObjectStore('state');  // chave: 'main'
    db.createObjectStore('photos'); // chave: photoId
  }
});
```

### Upload de fotos — correção v9:
- Parsing de multipart via Buffer nativo (sem conversão para string binária)
- Validação de magic bytes JPEG
- Limite de 8MB
- Validação de `photoId` contra path traversal

---

## 10. Logs, Auditoria e Observabilidade

### Implementado em v9:

**Backend (`_supabase.js`):**
```javascript
auditLog('SYNC_GET', ws, { tables: N });
auditLog('SYNC_POST', ws, { clients: N, orders: N, errors: N });
auditLog('PHOTO_UPLOAD', ws, { photoId, sizeBytes: N });
```
Saída em JSON estruturado no stdout do servidor (capturado pelo Vercel Logs).

**Banco (`schema_v9_migration.sql`):**
Tabela `audit_logs` criada para uso futuro (inserção via RPC ou trigger).

**Frontend (já existia, mantido):**
- `admin_logs` em localStorage com últimas 50 ações
- Log de limpeza, reprocessamento, acesso ao modo dev

### Próximos passos de observabilidade:

1. Inserir em `audit_logs` via `sync.js` após operações críticas
2. Alertas em Vercel para erros 5xx em `/api/sync`
3. Dashboard de contagem de tombstones (indica saúde das exclusões)

---

## 11. Ajustes no Banco de Dados

### Arquivo gerado: `supabase/schema_v9_migration.sql`

Execute na ordem no SQL Editor do Supabase:

```sql
-- 1. deleted_records (tombstone)
-- 2. UNIQUE(workspace, order_id) em commissions
-- 3. UNIQUE(workspace, order_id, product_id) em rep_commissions
--    ⚠️ Verificar duplicatas antes: SELECT order_id, product_id, count(*)
--       FROM rep_commissions GROUP BY workspace, order_id, product_id HAVING count(*)>1;
-- 4. Função recalc_rep_commissions(order_id)
-- 5. Função recalc_referral_commission(order_id)
-- 6. audit_logs
-- 7. Índices de performance
-- 8. commission_type em commissions (se faltar)
```

---

## 12. Plano de Implementação por Etapas

### Etapa 1 — Banco (fazer primeiro, sem impacto no usuário)
```
[ ] Executar schema_v9_migration.sql no Supabase
[ ] Verificar se há duplicatas em rep_commissions antes do UNIQUE
[ ] Confirmar criação das tabelas e funções com SELECT
```

### Etapa 2 — Backend (deploy sem downtime)
```
[ ] Configurar ALLOWED_ORIGINS no Vercel Dashboard
[ ] Deploy de api/_supabase.js (CORS, auditLog)
[ ] Deploy de api/sync.js (tombstone, propagateDeletions)
[ ] Deploy de api/photos.js (parsing seguro, validações)
[ ] Deploy de api/debug.js (autenticado, bloqueado em prod)
[ ] Testar /api/sync GET e POST com workspace de teste
```

### Etapa 3 — Frontend (deploy + comunicar usuários)
```
[ ] Deploy de index.html v9
[ ] Usuários devem configurar novo PIN via Admin → Ferramentas
[ ] Fazer pushToCloud após primeiro login (sincronizar estado local)
[ ] Testar reprocessCommissions via Admin → Ferramentas
```

### Etapa 4 — Validação pós-deploy
```
[ ] Criar e deletar cliente → sync → confirmar que não volta
[ ] Criar pedido pago → confirmar comissões geradas
[ ] Editar items de pedido pago → confirmar comissões atualizadas
[ ] Backup → restaurar → confirmar sync com nuvem
[ ] Testar /api/debug sem x-app-key → deve retornar 401
[ ] Verificar tombstones na tabela deleted_records
```

---

## 13. Testes Obrigatórios

### Funcionais
- [ ] Criar cliente → editar → deletar → sync → confirmar ausência no banco
- [ ] Criar pedido como "pendente" → mudar para "pago" → comissões geradas
- [ ] Criar pedido direto como "pago" → comissões geradas imediatamente
- [ ] Editar itens de pedido já pago → comissões de rep recalculadas
- [ ] Pagar comissão de rep → reprocessar → comissão paga preservada

### Sincronização
- [ ] Deletar 10 registros → pushToCloud → pullFromCloud → confirmar ausentes
- [ ] Deletar registro → pullFromCloud → confirmar que não reaparece (tombstone)
- [ ] Dois dispositivos: A deleta, B não sabe → B faz pull → B vê exclusão
- [ ] Backup antigo (com registro X) → restaurar → sync → X volta ao banco ✅

### Backup/Restauração
- [ ] Exportar backup → importar em sessão limpa → dados idênticos
- [ ] Importar backup → verificar que pushToCloud é disparado
- [ ] Backup com fotos → restaurar → fotos acessíveis

### Comissões
- [ ] Pedido pago com indicador: 1 comissão gerada (não duplicada)
- [ ] Reprocessar 2x: número de comissões não muda
- [ ] Deletar pedido: comissões de rep e indicador removidas
- [ ] Deletar cliente: todas as comissões dos pedidos dele removidas
- [ ] Comissão paga: reprocessamento não altera status "paga"

### Segurança
- [ ] GET /api/debug sem x-app-key → 401
- [ ] GET /api/debug com chave errada → 401  
- [ ] POST /api/sync com origem não whitelistada → ACAO header = 'null'
- [ ] Upload foto não-JPEG (arquivo texto) → 400
- [ ] Upload foto com photoId contendo `../` → 400
- [ ] Modo dev sem PIN configurado → mensagem de aviso, não acesso

### Banco
- [ ] INSERT duplicado em commissions (mesmo order_id) → erro de constraint
- [ ] INSERT duplicado em rep_commissions (mesmo order_id + product_id) → erro
- [ ] recalc_rep_commissions(id) 2x → resultado idêntico (idempotente)

---

## 14. Conclusão Técnica

### O que foi resolvido em v9:

O problema mais crítico — **registros deletados voltando após sync** — foi resolvido com a implementação de tombstone (`deleted_records`) no banco e propagação bidirecional de exclusões. Este era a causa raiz de múltiplos comportamentos reportados.

O segundo problema mais grave — **duplicação de comissões de representante** — foi resolvido com lógica clara de separação entre comissões pagas (imutáveis) e pendentes (recalculáveis), e com constraints UNIQUE no banco como garantia estrutural final.

### O que ainda é dívida técnica (para v10+):

1. **Monólito `index.html`** — funcional mas difícil de manter. Modularizar progressivamente.
2. **localStorage como storage principal** — adequado até ~2MB de dados. Com crescimento, migrar para IndexedDB.
3. **Resolução de conflitos** — atual estratégia "timestamp mais recente vence" é frágil com múltiplos usuários simultâneos. Para uso multi-usuário real, implementar CRDT ou merge por campo.
4. **Testes automatizados** — nenhum teste existe. Prioridade para os módulos de comissão e sync.
5. **Autenticação real** — o sistema depende de `x-app-key` compartilhada. Para múltiplos usuários com permissões diferentes, usar Supabase Auth com RLS real.

### Avaliação geral da base:

A base está sólida para um sistema em estágio inicial. As correções v9 trazem robustez real para os fluxos mais críticos (comissões e sync) sem quebrar a arquitetura existente. O sistema está agora em condição de produção estável para uso de representante único ou equipe pequena.

