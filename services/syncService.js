/**
 * services/syncService.js  — v10.1
 *
 * Implementa sincronização offline-first via fila de operações (outbox).
 *
 * PROBLEMA do modelo anterior (estado completo):
 *   - Dispositivo A cria pedido B
 *   - Dispositivo B (ainda sem o pedido B) sincroniza seu estado
 *   - Backend entende que pedido B "sumiu" e o apaga
 *   → perda de dados garantida em multi-dispositivo
 *
 * SOLUÇÃO — modelo de operações (outbox):
 *   1. Toda ação local (create/update/delete) gera uma entrada na fila
 *   2. Ao voltar online, envia SOMENTE as operações pendentes
 *   3. Servidor aplica as operações em ordem cronológica
 *   4. Servidor retorna o que mudou DESDE a última sincronização do dispositivo
 *   5. Cliente aplica as mudanças remotas sem sobrescrever o que ainda não sincronizou
 *
 * Compatibilidade: o sistema ainda suporta o sync de estado completo como fallback
 * (para o primeiro sync / reset), mas o caminho principal agora é via outbox.
 */

import { uuid } from '@/lib/uuid';

// ─────────────────────────────────────────────────────────────────────────────
// DEVICE ID — identifica o dispositivo/sessão
// ─────────────────────────────────────────────────────────────────────────────

export function getOrCreateDeviceId() {
  if (typeof localStorage === 'undefined') return 'server';
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = `dev_${uuid()}`;
    localStorage.setItem('device_id', id);
  }
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTBOX LOCAL — fila de operações pendentes (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

const OUTBOX_KEY = 'sync_outbox_v10';

function loadOutbox() {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveOutbox(ops) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops));
}

/**
 * Enfileira uma operação local para ser sincronizada.
 * Chame isso toda vez que criar, editar ou deletar um registro.
 */
export function enqueueOperation({ entity, entityId, opType, payload }) {
  const ops = loadOutbox();
  ops.push({
    id:        uuid(),
    deviceId:  getOrCreateDeviceId(),
    entity,
    entityId,
    opType,    // 'create' | 'update' | 'delete'
    payload,
    clientTs:  new Date().toISOString(),
    synced:    false,
  });
  saveOutbox(ops);
}

/**
 * Retorna todas as operações pendentes (não sincronizadas).
 */
export function getPendingOperations() {
  return loadOutbox().filter(op => !op.synced);
}

/**
 * Marca operações como sincronizadas.
 */
export function markOperationsSynced(ids) {
  const idSet = new Set(ids);
  const ops   = loadOutbox().map(op =>
    idSet.has(op.id) ? { ...op, synced: true } : op
  );
  saveOutbox(ops);
}

/**
 * Limpa operações já sincronizadas (manutenção).
 * Mantém apenas as últimas 200 operações sincronizadas para auditoria.
 */
export function cleanSyncedOperations() {
  const ops    = loadOutbox();
  const synced = ops.filter(op => op.synced).slice(-200);
  const pending = ops.filter(op => !op.synced);
  saveOutbox([...synced, ...pending]);
}

// ─────────────────────────────────────────────────────────────────────────────
// LAST SYNC TIMESTAMP — controla o que já foi baixado
// ─────────────────────────────────────────────────────────────────────────────

const LAST_SYNC_KEY = 'last_sync_at_v10';

export function getLastSyncAt() {
  return localStorage.getItem(LAST_SYNC_KEY) || null;
}

export function setLastSyncAt(ts) {
  localStorage.setItem(LAST_SYNC_KEY, ts);
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNC PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executa a sincronização offline-first.
 *
 * Fluxo:
 *  1. Coleta operações pendentes locais
 *  2. Envia ao servidor (POST /api/sync/ops)
 *  3. Servidor aplica e retorna o que mudou remotamente
 *  4. Cliente aplica mudanças remotas ao estado local
 *  5. Marca operações como sincronizadas
 *
 * @param {object} opts
 *   syncKey    - chave de autenticação
 *   workspace  - workspace ativo
 *   onRemoteChanges - callback com as mudanças remotas a aplicar no store
 * @returns {{ ok, pushedOps, pulledChanges, warnings }}
 */
export async function syncOperations({ syncKey, workspace, onRemoteChanges }) {
  const pending   = getPendingOperations();
  const lastSyncAt = getLastSyncAt();
  const deviceId  = getOrCreateDeviceId();

  try {
    const res = await fetch(`/api/sync/ops?workspace=${encodeURIComponent(workspace)}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-key':    syncKey,
        'x-workspace':  workspace,
        'x-device-id':  deviceId,
      },
      body: JSON.stringify({
        operations:  pending,
        lastSyncAt:  lastSyncAt,
        deviceId,
      }),
    });

    const data = await res.json();

    if (!data.ok) {
      return { ok: false, error: data.error, warnings: data.warnings };
    }

    // Marcar operações enviadas como sincronizadas
    if (pending.length) {
      markOperationsSynced(pending.map(op => op.id));
    }

    // Atualizar timestamp do último sync
    if (data.serverTs) {
      setLastSyncAt(data.serverTs);
    }

    // Aplicar mudanças remotas ao estado local
    if (data.changes && onRemoteChanges) {
      onRemoteChanges(data.changes);
    }

    cleanSyncedOperations();

    return {
      ok:            true,
      pushedOps:     pending.length,
      pulledChanges: data.changes ? Object.keys(data.changes).length : 0,
      warnings:      data.warnings,
    };
  } catch (err) {
    console.error('[syncService] erro de rede:', err.message);
    return { ok: false, error: 'Erro de rede — operações serão enviadas quando voltar online.' };
  }
}

/**
 * Sync de estado completo (fallback para primeiro sync ou reset).
 * Usa o endpoint legado /api/sync.
 * NÃO executa propagateDeletions — apenas envia o estado atual e baixa o remoto.
 */
export async function syncFullState({ syncKey, workspace, payload }) {
  try {
    const res = await fetch(`/api/sync?workspace=${encodeURIComponent(workspace)}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-key':    syncKey,
        'x-workspace':  workspace,
      },
      body: JSON.stringify({ payload, fullSync: true }),
    });

    const data = await res.json();
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Pull: baixa o estado remoto atual (GET /api/sync).
 */
export async function pullRemoteState({ syncKey, workspace }) {
  try {
    const res = await fetch(
      `/api/sync?workspace=${encodeURIComponent(workspace)}`,
      { headers: { 'x-app-key': syncKey } }
    );
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error };
    return { ok: true, payload: data.payload, updatedAt: data.updatedAt };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS para enfileirar operações por entidade
// Chame esses helpers no store ao invés de enqueueOperation diretamente
// ─────────────────────────────────────────────────────────────────────────────

export const syncOps = {
  createOrder:  (order)       => enqueueOperation({ entity: 'orders',  entityId: order.id,  opType: 'create', payload: order }),
  updateOrder:  (order)       => enqueueOperation({ entity: 'orders',  entityId: order.id,  opType: 'update', payload: order }),
  deleteOrder:  (orderId)     => enqueueOperation({ entity: 'orders',  entityId: orderId,   opType: 'delete', payload: { id: orderId } }),
  createClient: (client)      => enqueueOperation({ entity: 'clients', entityId: client.id, opType: 'create', payload: client }),
  updateClient: (client)      => enqueueOperation({ entity: 'clients', entityId: client.id, opType: 'update', payload: client }),
  deleteClient: (clientId)    => enqueueOperation({ entity: 'clients', entityId: clientId,  opType: 'delete', payload: { id: clientId } }),
  createVisit:  (visit)       => enqueueOperation({ entity: 'visits',  entityId: visit.id,  opType: 'create', payload: visit }),
  deleteVisit:  (visitId)     => enqueueOperation({ entity: 'visits',  entityId: visitId,   opType: 'delete', payload: { id: visitId } }),
  payCommission: (comm)       => enqueueOperation({ entity: 'commissions',     entityId: comm.id, opType: 'update', payload: comm }),
  payRepComm:    (comm)       => enqueueOperation({ entity: 'rep_commissions', entityId: comm.id, opType: 'update', payload: comm }),
};
