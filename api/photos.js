// api/photos.js — Upload e download de fotos via Supabase Storage
const { validateSyncKey, cors, err } = require('./_supabase');

const BUCKET = 'thermovisit-photos';

async function ensureBucket() {
  const url = `${process.env.SUPABASE_URL}/storage/v1/bucket/${BUCKET}`;
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  // Check if bucket exists
  const check = await fetch(url, { headers });
  if (check.status === 200) return;
  // Create bucket if not exists
  await fetch(`${process.env.SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    validateSyncKey(req);
    const workspace = String(req.query?.workspace || req.headers['x-workspace'] || 'principal')
      .trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80) || 'principal';

    await ensureBucket();

    // ── GET: download de foto ──────────────────────────────────────────────
    if (req.method === 'GET') {
      const photoId = String(req.query?.photoId || '').trim();
      if (!photoId) { res.status(400).end(JSON.stringify({ ok: false, error: 'photoId obrigatório' })); return; }

      const path = `${workspace}/${photoId}.jpg`;
      const r = await fetch(
        `${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
        { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
      );
      if (!r.ok) { res.status(404).end(JSON.stringify({ ok: false, error: 'Foto não encontrada' })); return; }

      const buf = await r.arrayBuffer();
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.status(200).end(Buffer.from(buf));
      return;
    }

    // ── POST: upload de foto ───────────────────────────────────────────────
    if (req.method === 'POST') {
      // Parse multipart/form-data manualmente (Vercel não faz parse automático)
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('multipart/form-data')) {
        res.status(400).end(JSON.stringify({ ok: false, error: 'Esperado multipart/form-data' }));
        return;
      }

      // Ler body como buffer
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      // Extrair boundary
      const boundary = contentType.split('boundary=')[1]?.trim();
      if (!boundary) { res.status(400).end(JSON.stringify({ ok: false, error: 'Boundary ausente' })); return; }

      // Parse simples dos campos
      const parts = buffer.toString('binary').split(`--${boundary}`);
      let photoId = '', photoBuffer = null;

      for (const part of parts) {
        if (part.includes('name="photoId"')) {
          photoId = part.split('\r\n\r\n')[1]?.replace(/\r\n--$/, '').trim() || '';
        }
        if (part.includes('name="photo"')) {
          const idx = part.indexOf('\r\n\r\n');
          if (idx !== -1) {
            const raw = part.slice(idx + 4).replace(/\r\n$/, '');
            photoBuffer = Buffer.from(raw, 'binary');
          }
        }
      }

      if (!photoId || !photoBuffer) {
        res.status(400).end(JSON.stringify({ ok: false, error: 'photoId ou arquivo ausente' }));
        return;
      }

      const path = `${workspace}/${photoId}.jpg`;
      const uploadUrl = `${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;

      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'true',
        },
        body: photoBuffer,
      });

      if (!uploadRes.ok) {
        const e = await uploadRes.json().catch(() => ({}));
        res.status(500).end(JSON.stringify({ ok: false, error: e.message || 'Falha no upload' }));
        return;
      }

      const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
      res.status(200).end(JSON.stringify({ ok: true, photoId, url: publicUrl }));
      return;
    }

    res.status(405).end(JSON.stringify({ ok: false, error: 'Método não permitido' }));
  } catch (e) {
    err(res, e);
  }
};
