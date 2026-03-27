# ThermoVisit v5 — Supabase + Vercel (15 tabelas)

## Arquitetura

```
[App celular] ──► [Vercel /api/sync] ──► [Supabase (15 tabelas)]
                        ▲
                  APP_SYNC_KEY
                  (senha no app)
```

A API `/api/sync` é o único ponto de contato com o banco.
O frontend nunca acessa o Supabase diretamente.

---

## Passo 1 — Criar as tabelas no Supabase

1. Acesse **supabase.com → seu projeto → SQL Editor → New Query**
2. Cole o conteúdo de `supabase/schema.sql`
3. Clique em **Run**
4. Confirme com:
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' ORDER BY table_name;
   ```
   Deve listar 15 tabelas.

---

## Passo 2 — Variáveis de ambiente na Vercel

**Vercel → Project → Settings → Environment Variables**, adicione:

| Variável | Onde encontrar |
|---|---|
| `SUPABASE_URL` | Supabase → Settings → API → **Project URL** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → **service_role** (secret) |
| `APP_SYNC_KEY` | Você define — use uma senha forte (mín. 20 chars) |

> ⚠️ Se expôs a `service_role key` publicamente, regenere-a antes!
> Supabase → Settings → API → clique **Regenerate**.

---

## Passo 3 — Deploy na Vercel

**Via GitHub (recomendado):**
1. Suba esta pasta para um repositório privado no GitHub
2. Vercel → **Add New Project** → importe o repositório
3. Clique **Deploy** (o `vercel.json` já configura tudo)

**Via CLI:**
```bash
npm i -g vercel
vercel --prod
```

---

## Passo 4 — Ativar a nuvem dentro do app

1. Abra o app → aba **Dados**
2. Seção **☁️ Nuvem**
3. Preencha:
   - **Workspace:** `principal` (identifica seus dados)
   - **Chave:** o valor de `APP_SYNC_KEY`
4. **Salvar configuração**
5. **⬆️ Enviar dados** (primeiro push)

---

## Passo 5 — Usar em outro dispositivo

1. Abra a URL do app publicado na Vercel
2. Aba **Dados → ☁️ Nuvem**
3. Same Workspace + Same Chave
4. **⬇️ Baixar dados**

---

## Tabelas criadas no Supabase

| Tabela | Conteúdo |
|---|---|
| `categories` | Categorias de cliente |
| `env_types` | Tipos de ambiente |
| `product_categories` | Categorias de produto |
| `custom_status_types` | Status personalizados |
| `clients` | Clientes |
| `environments` | Ambientes (vinculados a clientes) |
| `products` | Produtos |
| `visits` | Visitas |
| `referrals` | Indicadores |
| `leads` | Pré-cadastros |
| `orders` | Pedidos |
| `order_items` | Itens dos pedidos |
| `commissions` | Comissões |
| `company_settings` | Dados da empresa |
| `representative_settings` | Dados do representante |

Todas as tabelas têm coluna `workspace` para isolar dados de diferentes instalações.

---

## O que é sincronizado vs o que fica local

| Dado | Onde fica |
|---|---|
| Clientes, pedidos, visitas, produtos, leads... | ☁️ Supabase (sincronizado) |
| Fotos (imagens) | 📱 Local no dispositivo |
| Config de nuvem (workspace/chave) | 📱 Local no dispositivo |

Para transferir fotos entre dispositivos: use o **Backup Completo** (`.json`) na aba Dados.
