# Agri Vendas v10.3 — Pacote Final Corrigido

## O problema raiz

O `index.html` da v9 (frontend completo — 219KB, 2653 linhas) **nunca foi incluído**
nas versões v10, v10.1 e v10.2. A migração para Next.js criou apenas as rotas `/api/*`,
mas a pasta `public/` ficou vazia. Por isso o deploy funcionava (APIs respondiam),
mas a raiz retornava 404.

## Erros corrigidos na v10.2 (histórico)

| # | Arquivo | Bug | Correção |
|---|---------|-----|----------|
| 1 | `public/index.html` | **Ausente** em todas as versões v10 | Incluído com todos os patches aplicados |
| 2 | `next.config.js` | Não configurava rewrite para SPA | `rewrites()` que serve `index.html` em todas as rotas não-API |
| 3 | `jsconfig.json` | **Ausente** — aliases `@/` não resolviam | Incluído com `paths: { "@/*": ["./*"] }` |
| 4 | `lib/supabase.js` | `throw` no nível do módulo quebrava o build | Validação lazy (só na primeira chamada) |
| 5 | `lib/uuid.js` | `import React` colado acidentalmente | Limpo — só `crypto.randomUUID()` |
| 6 | `supabase/schema_v10_2_migration.sql` | `idx_clients_docs` duplicado → migration parava | `DROP INDEX IF EXISTS` antes de recriar |
| 7 | `app/api/sync/route.js` | `order_number` não mapeado no `readAll` | Adicionado `orderNumber: o.order_number \|\| null` |
| 8 | `app/api/sync/route.js` | `order_number: null` sobrescrevia trigger no upsert | Campo omitido do payload de update |

## Erros adicionais corrigidos na v10.3

| # | Arquivo | Bug | Severidade | Correção |
|---|---------|-----|-----------|----------|
| A | `public/sw.js` | Cache com nome `thermovisit-v4` — PWA instalado não recebia atualizações | **Alto** | Renomeado para `agri-vendas-v1`; filtro de limpeza corrigido |
| B | `app/api/sync/ops/route.js` | `activity_type`, `lat`, `lng` ausentes no mapper de `visits` — dados perdidos no sync offline | **Alto** | Campos adicionados ao `toSnake()` da entidade `visits` |
| C | `public/index.html` | Nomes de arquivo de fotos e backups usando prefixo `thermovisit_` | Baixo | Renomeados para `agrivendas_` |
| D | `.env.example` | Header do arquivo ainda dizia `ThermoVisit v10` | Baixo | Atualizado para `Agri Vendas v10.3` |
| E | `public/index.html` | `schemaVersion: 5` hardcoded no `stampDataState` — poderia causar reprocessamento indevido | Médio | Corrigido para `schemaVersion: 10` |
| F | `app/api/photos/route.js` | Env vars lidas no nível do módulo (inconsistente com padrão lazy) | Baixo | Movidas para `getStorageConfig()` lazy, igual ao `lib/supabase.js` |

## Patches aplicados no index.html (v9 → v10.3)

| Patch | O que mudou |
|-------|-------------|
| normalizeDataState | v10: orderNumber, orderItemId, documentos, finameCode, ncmCode, activityType, lat/lng |
| _buildCommissions | v10: chave `orderItemId` (não `productId`) — evita duplicação ao reprocessar |
| addOrder | v10: UUID estável por item + snapshot `repCommissionPct` |
| editOrder | v10: mesmo tratamento + comparação por `orderItemId` |
| reprocessCommissions | v10: detecta divergência por `orderItemId`, qty, preço, pct |
| addVisit / editVisit | v10.2: campos `activityType`, `lat`, `lng` |
| addClient | v10.2: campos `documentFrontPath`, `documentBackPath`, `residenceProofPath`, endereço separado |
| addProduct | v10.2: campos `finameCode`, `ncmCode` |
| OrderForm addItem | v10: UUID único por item (não agrupa por productId) |
| OrderForm items map | v10: usa `item.id` para editar/remover (não `productId`) |
| VisitFormPage | **Novo componente** v10.2: tipo atividade + geolocalização |
| VisitMapPage | **Novo componente** v10.2: mapa Leaflet com filtro por tipo |
| ProductDetailPage | **Novo componente** v10.2: exibe FINAME, NCM, fotos |
| Nav | Adicionado 🗺️ Mapa e 📦 Produtos |
| VisitsList | Botão + Nova Visita, botão ✏️ Editar, badge tipo atividade |
| App routing | Rotas `visitForm`, `visitMap`, `productDetail` |
| App/Store name | ThermoVisit → Agri Vendas em todo o sistema |
| stampDataState | v10.3: `schemaVersion` corrigido de 5 para 10 |
| filenames fotos/backup | v10.3: prefixo `thermovisit_` → `agrivendas_` |

## Estrutura do pacote

```
agri-vendas-v10.3-final/
├── public/
│   ├── index.html          ← FRONTEND COMPLETO (v10.3 corrigido)
│   ├── manifest.json       ← PWA — Agri Vendas
│   └── sw.js               ← Service Worker (cache agri-vendas-v1)
├── app/api/
│   ├── sync/
│   │   ├── route.js        ← GET/POST sync (orderNumber corrigido)
│   │   └── ops/route.js    ← Sync offline-first (visits com activity_type/lat/lng)
│   ├── photos/route.js     ← Upload/download fotos (getStorageConfig lazy)
│   ├── cep/route.js        ← Busca CEP
│   └── drawing/route.js    ← Dados para desenho técnico
├── lib/
│   ├── supabase.js         ← Cliente HTTP (validação lazy)
│   ├── uuid.js             ← Gerador UUID (sem import React)
│   └── cep.js              ← Helper CEP
├── services/
│   ├── commissionService.js
│   ├── syncService.js
│   └── pdfService.js
├── supabase/
│   └── schema_v10_2_migration_CORRIGIDO.sql
├── package.json            ← versão 10.3.0
├── next.config.js          ← rewrite SPA + headers
├── jsconfig.json           ← paths @/
├── vercel.json             ← Next.js framework
├── .env.example            ← Agri Vendas v10.3
├── .gitignore
└── LEIAME.md               ← Este arquivo
```

## Deploy na Vercel

1. **Banco de dados**: Execute `supabase/schema_v10_2_migration_CORRIGIDO.sql` no SQL Editor do Supabase
2. **Variáveis de ambiente** na Vercel:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY=eyJ...
   SYNC_KEY=sua-chave-secreta
   SUPABASE_PHOTOS_BUCKET=photos
   ```
3. **Deploy**: `vercel --prod` ou push para o repositório conectado
4. **Verificar**: Acesse a raiz — deve abrir o sistema (não 404)

## Configuração no app (primeira vez)

1. Abra o sistema no navegador
2. Clique em **⚙️ Admin** → aba **Ferramentas** → configure o PIN
3. Clique em **🏢 Empresa** → configure chave de sync
4. Clique em ☁️ **Baixar dados** para sincronizar com o banco

## Verificação do banco após migration

```sql
-- Confirmar todas as colunas novas
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('clients','products','visits','orders')
  AND column_name IN (
    'document_front_path','document_back_path','residence_proof_path',
    'finame_code','ncm_code','activity_type','lat','lng','order_number'
  )
ORDER BY table_name, column_name;
-- Esperado: 9 linhas

-- Confirmar trigger de order_number
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table = 'orders';
-- Esperado: trg_set_order_number
```
