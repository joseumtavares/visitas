/**
 * app/api/drawing/route.js — Agri Vendas v10.2
 *
 * GET /api/drawing?workspace=X&clientId=Y&envId=Z
 *
 * Retorna os dados do ambiente para geração do desenho técnico.
 * O desenho SVG em si é gerado no frontend pelo GreenhouseDrawing.jsx.
 * Esta rota serve os dados estruturados para geração server-side
 * ou para integração com ferramentas externas (Fabric.js, SVG.js, etc).
 *
 * Resposta:
 * {
 *   ok: true,
 *   client: { id, name, phone1, city, state },
 *   env: { id, label, width, length, height, estufaType, grampoQty, grampoSize, notes },
 *   drawing: {
 *     svgUrl: null,  // futuro: URL de SVG gerado server-side
 *     dimensions: { width, length, height, ridgeHeight, area, volume, perimeter },
 *     pillars: { count, spacing },
 *   }
 * }
 */

import { NextResponse } from 'next/server';
import { sb, validateSyncKey, sanitizeWorkspace } from '@/lib/supabase';

export async function GET(request) {
  try {
    validateSyncKey(request);
    const params   = request.nextUrl.searchParams;
    const ws       = sanitizeWorkspace(params.get('workspace') || 'principal');
    const clientId = params.get('clientId');
    const envId    = params.get('envId');

    if (!clientId) {
      return NextResponse.json({ ok: false, error: 'clientId obrigatório.' }, { status: 400 });
    }

    const enc = encodeURIComponent(ws);

    // Buscar cliente
    const clients = await sb(`/rest/v1/clients?id=eq.${clientId}&workspace=eq.${enc}&select=id,name,phone1,city,state`);
    const client  = clients?.[0];
    if (!client) {
      return NextResponse.json({ ok: false, error: 'Cliente não encontrado.' }, { status: 404 });
    }

    // Buscar ambiente (se enviado envId, busca específico; caso contrário, retorna o primeiro)
    let envQuery = `/rest/v1/environments?client_id=eq.${clientId}&workspace=eq.${enc}&select=*`;
    if (envId) envQuery += `&id=eq.${envId}`;
    envQuery += '&limit=1';

    const envs = await sb(envQuery);
    const env  = envs?.[0];

    if (!env) {
      return NextResponse.json({
        ok: true,
        client: { id: client.id, name: client.name, phone1: client.phone1, city: client.city, state: client.state },
        env: null,
        drawing: null,
        message: 'Nenhum ambiente cadastrado para este cliente.',
      });
    }

    // Calcular dimensões derivadas
    const W       = parseFloat(env.width)  || 0;
    const L       = parseFloat(env.length) || 0;
    const H       = parseFloat(env.height) || 0;
    const ridgeH  = H + W * 0.3;
    const area    = parseFloat((W * L).toFixed(2));
    const volume  = parseFloat((W * L * H * 0.75).toFixed(2));
    const perimeter = parseFloat((2 * (W + L)).toFixed(2));
    const pillarCount   = Math.max(2, Math.floor(L / 4) + 1);
    const pillarSpacing = L > 0 ? parseFloat((L / (pillarCount - 1)).toFixed(2)) : 0;

    return NextResponse.json({
      ok: true,
      client: {
        id:     client.id,
        name:   client.name,
        phone1: client.phone1,
        city:   client.city   || '',
        state:  client.state  || '',
      },
      env: {
        id:         env.id,
        label:      env.label       || '',
        width:      W,
        length:     L,
        height:     H,
        estufaType: env.estufa_type || 'grampo',
        grampoQty:  env.grampo_qty  || 0,
        grampoSize: env.grampo_size || '28',
        notes:      env.notes       || '',
        photoIds:   env.photo_ids   || [],
      },
      drawing: {
        svgUrl: null,   // placeholder para futura geração server-side
        dimensions: {
          width:      W,
          length:     L,
          height:     H,
          ridgeHeight: parseFloat(ridgeH.toFixed(2)),
          area,
          volume,
          perimeter,
        },
        pillars: {
          count:   pillarCount,
          spacing: pillarSpacing,
        },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error('[drawing GET]', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-app-key, x-workspace',
    },
  });
}
