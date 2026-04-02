/**
 * app/api/photos/route.js — v10.3
 *
 * POST /api/photos  → upload de foto para Supabase Storage
 * GET  /api/photos?photoId=X&workspace=Y → download de foto
 *
 * CORREÇÃO v10.3 (Bug F): variáveis de ambiente movidas para função lazy
 * getStorageConfig(), evitando leitura no nível do módulo durante o build
 * da Vercel (padrão consistente com lib/supabase.js).
 */

import { NextResponse } from 'next/server';
import { validateSyncKey, sanitizeWorkspace } from '@/lib/supabase';

function getStorageConfig() {
  const url = process.env.SUPABASE_URL;
  // Suporta SUPABASE_SERVICE_ROLE_KEY (padrão Vercel/Supabase) e SUPABASE_SERVICE_KEY (legado)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('[photos] Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SERVICE_KEY) na Vercel.');
  }
  return {
    url,
    key,
    bucket: process.env.SUPABASE_PHOTOS_BUCKET || 'photos',
  };
}

export async function POST(request) {
  try {
    validateSyncKey(request);
    const { url: SUPABASE_URL, key: SUPABASE_KEY, bucket: BUCKET } = getStorageConfig();
    const ws = sanitizeWorkspace(
      request.headers.get('x-workspace') || 'principal'
    );

    const formData = await request.formData();
    const file     = formData.get('photo');
    const photoId  = formData.get('photoId');

    if (!file || !photoId) {
      return NextResponse.json({ ok: false, error: 'photo e photoId são obrigatórios.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);
    const path        = `${ws}/${photoId}.jpg`;

    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'image/jpeg',
        'x-upsert':      'true',
      },
      body: buffer,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `Storage error: ${res.status} ${txt}` }, { status: 502 });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (e) {
    console.error('[photos POST]', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function GET(request) {
  try {
    validateSyncKey(request);
    const { url: SUPABASE_URL, key: SUPABASE_KEY, bucket: BUCKET } = getStorageConfig();
    const { searchParams } = new URL(request.url);
    const photoId  = searchParams.get('photoId');
    const ws       = sanitizeWorkspace(searchParams.get('workspace') || 'principal');

    if (!photoId) {
      return NextResponse.json({ ok: false, error: 'photoId obrigatório.' }, { status: 400 });
    }

    const path = `${ws}/${photoId}.jpg`;
    const res  = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      headers: { 'Authorization': `Bearer ${SUPABASE_KEY}` },
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: 'Foto não encontrada.' }, { status: 404 });
    }

    const blob    = await res.blob();
    const buffer  = Buffer.from(await blob.arrayBuffer());

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':  'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (e) {
    console.error('[photos GET]', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
