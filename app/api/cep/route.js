/**
 * app/api/cep/route.js
 * Proxy interno para o ViaCEP.
 *
 * GET /api/cep?cep=01001000
 *
 * Retorna:
 *   200 { ok: true, data: { cep, street, complement, neighborhood, city, state } }
 *   400 { ok: false, error: 'CEP inválido' }
 *   404 { ok: false, error: 'CEP não encontrado' }
 *   502 { ok: false, error: 'Erro ao consultar ViaCEP' }
 */

import { fetchCepFromViaCep, sanitizeCep } from '@/lib/cep';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('cep') || '';

  const digits = sanitizeCep(raw);
  if (!digits) {
    return NextResponse.json(
      { ok: false, error: 'CEP inválido: informe 8 dígitos numéricos.' },
      { status: 400 }
    );
  }

  try {
    const result = await fetchCepFromViaCep(digits);

    if (!result) {
      return NextResponse.json(
        { ok: false, error: 'CEP não encontrado.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { ok: true, data: result },
      {
        status: 200,
        headers: {
          // Cache de 1h na borda (Vercel Edge)
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    console.error('[api/cep]', err.message);
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro ao consultar ViaCEP.' },
      { status: 502 }
    );
  }
}
