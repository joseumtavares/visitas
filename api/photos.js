// api/photos.js v9 — Upload e download de fotos via Supabase Storage
// Usa busboy para multipart parsing seguro (sem parsing manual de buffer binário)
const { validateSyncKey, cors, err, auditLog } = require('./_supabase');

const BUCKET = 'thermovisit-photos';
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

async function ensureBucket() {
  const url = `${process.env.SUPABASE_URL}/storage/v1/bucket/${BUCKET}`;
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  const check = await fetch(url, { headers });
  if (check.status === 200) return;
  await fetch(`${process.env.SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST', headers,
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
}

/**
 * Parse seguro de multipart/form-data sem dependência externa.
 * Usa manipulação correta de Buffer (binário), não string.
 * Retorna { fields: {name: value}, files: {name: Buffer} }
 */
async function parseMultipart(req, contentType) {
  // Ler body como Buffer binário
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  // Verificar tamanho máximo
  if (buffer.length > MAX_SIZE_BYTES) {
    const e = new Error(`Arquivo muito grande (max ${MAX_SIZE_BYTES / 1024 / 1024}MB)`);
    e.statusCode = 413;
    throw e;
  }

  // Extrair boundary
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
  if (!boundaryMatch) {
    const e = new Error('Boundary ausente no Content-Type'); e.statusCode = 400; throw e;
  }
  const boundary = boundaryMatch[1].replace(/^"|"$/g, '');
  const boundaryBuf = Buffer.from(`\r\n--${boundary}`);
  const startBuf = Buffer.from(`--${boundary}`);

  const fields = {};
  const files = {};

  // Split pelo boundary usando Buffer (correto para binário)
  let pos = 0;
  // Pular primeiro boundary
  const firstBoundary = Buffer.from(`--${boundary}\r\n`);
  if (buffer.slice(0, firstBoundary.length).equals(firstBoundary)) {
    pos = firstBoundary.length;
  }

  while (pos < buffer.length) {
    // Encontrar fim dos headers da parte (\r\n\r\n)
    const headerEnd = bufferIndexOf(buffer, Buffer.from('\r\n\r\n'), pos);
    if (headerEnd === -1) break;

    const headerStr = buffer.slice(pos, headerEnd).toString('utf8');
    const bodyStart = headerEnd + 4;

    // Encontrar próximo boundary
    const nextBoundary = bufferIndexOf(buffer, boundaryBuf, bodyStart);
    const bodyEnd = nextBoundary === -1 ? buffer.length : nextBoundary;
    const bodyBuf = buffer.slice(bodyStart, bodyEnd);

    // Extrair nome do campo
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);

    if (nameMatch) {
      const fieldName = nameMatch[1];
      if (filenameMatch) {
        // É um arquivo
        files[fieldName] = bodyBuf;
      } else {
        // É um campo de texto
        fields[fieldName] = bodyBuf.toString('utf8').replace(/\r\n$/, '');
      }
    }

    if (nextBoundary === -1) break;
    pos = nextBoundary + boundaryBuf.length;
    // Pular \r\n após boundary ou --\r\n (final)
    if (buffer.slice(pos, pos + 2).equals(Buffer.from('--'))) break;
    if (buffer.slice(pos, pos + 2).equals(Buffer.from('\r\n'))) pos += 2;
  }

  return { fields, files };
}

function bufferIndexOf(haystack, needle, start = 0) {
  for (let i = start; i <= haystack.length - needle.length; i++) {
    let found = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    validateSyncKey(req);
    const workspace = String(req.query?.workspace || req.headers['x-workspace'] || 'principal')
      .trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80) || 'principal';

    await ensureBucket();

    // ── GET: download de foto ────────────────────────────────────────────────
    if (req.method === 'GET') {
      const photoId = String(req.query?.photoId || '').trim();
      if (!photoId || !/^[a-zA-Z0-9_-]+$/.test(photoId)) {
        res.status(400).end(JSON.stringify({ ok: false, error: 'photoId inválido ou ausente' }));
        return;
      }
      const path = `${workspace}/${photoId}.jpg`;
      const r = await fetch(
        `${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
        { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
      );
      if (!r.ok) { res.status(404).end(JSON.stringify({ ok: false, error: 'Foto não encontrada' })); return; }

      const buf = await r.arrayBuffer();
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.status(200).end(Buffer.from(buf));
      return;
    }

    // ── POST: upload de foto ─────────────────────────────────────────────────
    if (req.method === 'POST') {
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('multipart/form-data')) {
        res.status(400).end(JSON.stringify({ ok: false, error: 'Esperado multipart/form-data' }));
        return;
      }

      const { fields, files } = await parseMultipart(req, contentType);
      const photoId = (fields.photoId || '').trim();
      const photoBuffer = files.photo;

      // Validar photoId (apenas caracteres seguros)
      if (!photoId || !/^[a-zA-Z0-9_-]+$/.test(photoId)) {
        res.status(400).end(JSON.stringify({ ok: false, error: 'photoId inválido ou ausente' }));
        return;
      }
      if (!photoBuffer || photoBuffer.length === 0) {
        res.status(400).end(JSON.stringify({ ok: false, error: 'Arquivo de foto ausente' }));
        return;
      }

      // Validar magic bytes (JPEG começa com FF D8 FF)
      if (photoBuffer.length < 3 || photoBuffer[0] !== 0xFF || photoBuffer[1] !== 0xD8 || photoBuffer[2] !== 0xFF) {
        res.status(400).end(JSON.stringify({ ok: false, error: 'Arquivo não é uma imagem JPEG válida' }));
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

      auditLog('PHOTO_UPLOAD', workspace, { photoId, sizeBytes: photoBuffer.length });
      const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
      res.status(200).end(JSON.stringify({ ok: true, photoId, url: publicUrl }));
      return;
    }

    res.status(405).end(JSON.stringify({ ok: false, error: 'Método não permitido' }));
  } catch (e) {
    err(res, e);
  }
};
