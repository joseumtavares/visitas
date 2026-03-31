/**
 * components/GreenhouseDrawing.jsx — Agri Vendas v10.2
 *
 * Gerador de Desenho Técnico de Estufas.
 * Gera desenho SVG isométrico simplificado baseado nas dimensões do ambiente.
 * Permite exportar como PDF ou imagem.
 *
 * Props:
 *   env      {object}  Objeto de ambiente (environments)
 *   client   {object}  Objeto do cliente (para o PDF)
 *   onClose  {fn}      Fechar o modal
 */

import { useState, useRef, useCallback } from 'react';

const APP_NAME = 'Agri Vendas';

// Paleta de cores para o desenho
const COLORS = {
  structure:   '#2d6a4f',
  structure2:  '#40916c',
  cover:       'rgba(183,228,199,0.55)',
  coverStroke: '#52b788',
  ground:      '#a8703a',
  groundFill:  '#d4a04a',
  shadow:      'rgba(0,0,0,0.12)',
  dim:         '#1b4332',
  dimLine:     '#b7e4c7',
  text:        '#1b4332',
  grid:        '#dee2e6',
  gridMajor:   '#adb5bd',
};

// Converter metros em pixels (escala para canvas)
const toIso = (x, y, z, scale = 40) => ({
  sx: (x - y) * Math.cos(Math.PI / 6) * scale,
  sy: (x + y) * Math.sin(Math.PI / 6) * scale - z * scale,
});

function GreenhouseDrawingSVG({ width, length, height, estufaType }) {
  const W = parseFloat(width)  || 8;
  const L = parseFloat(length) || 20;
  const H = parseFloat(height) || 3.5;

  // Escala automática para caber no SVG 560x340
  const maxDim  = Math.max(W, L, H);
  const scale   = Math.min(40, 220 / maxDim);
  const CX      = 280;
  const CY      = 220;

  // Isométrica helper
  const iso = (x, y, z) => {
    const { sx, sy } = toIso(x, y, z, scale);
    return [CX + sx, CY + sy];
  };

  // Vértices base
  const [x0, y0] = iso(0, 0, 0);
  const [x1, y1] = iso(W, 0, 0);
  const [x2, y2] = iso(W, L, 0);
  const [x3, y3] = iso(0, L, 0);

  // Vértices topo (parede)
  const [tx0, ty0] = iso(0, 0, H);
  const [tx1, ty1] = iso(W, 0, H);
  const [tx2, ty2] = iso(W, L, H);
  const [tx3, ty3] = iso(0, L, H);

  // Telhado (cumeeira no centro da largura)
  const ridgeH = H + W * 0.3; // cumeeira ~30% da largura
  const [rx0, ry0] = iso(W / 2, 0, ridgeH);
  const [rx1, ry1] = iso(W / 2, L, ridgeH);

  // Pilares
  const pillarCount = Math.max(2, Math.floor(L / 4) + 1);
  const pillarSpacing = L / (pillarCount - 1);

  const pillarLines = [];
  for (let i = 0; i < pillarCount; i++) {
    const py = i * pillarSpacing;
    // Pilares lado direito (W,py)
    const [bx, by] = iso(W, py, 0);
    const [tp, tp2] = iso(W, py, H);
    pillarLines.push(`M${bx},${by} L${tp},${tp2}`);
    // Pilares lado esquerdo (0,py)
    const [bx2, by2] = iso(0, py, 0);
    const [tp3, tp4] = iso(0, py, H);
    pillarLines.push(`M${bx2},${by2} L${tp3},${tp4}`);
  }

  // Arcos internos (tipo grampo)
  const arcLines = [];
  if (estufaType === 'grampo' || !estufaType) {
    for (let i = 0; i < pillarCount; i++) {
      const py = i * pillarSpacing;
      const [bxL, byL] = iso(0, py, H);
      const [bxR, byR] = iso(W, py, H);
      const [rx, ry] = iso(W / 2, py, ridgeH);
      arcLines.push(`M${bxL},${byL} Q${rx},${ry - scale * 0.5} ${bxR},${byR}`);
    }
  }

  // Linhas de cotas
  const dimY = CY + scale * (W * Math.sin(Math.PI / 6) + L * Math.sin(Math.PI / 6)) * 0.5 + 30;

  return (
    <svg
      width="100%"
      viewBox="0 0 560 340"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', background: '#f8fffe' }}
    >
      {/* Sombra do chão */}
      <ellipse cx={CX + scale * 2} cy={CY + 10} rx={scale * (W + L) * 0.32} ry={scale * (W + L) * 0.1}
        fill={COLORS.shadow} />

      {/* Chão (base) */}
      <polygon
        points={`${x0},${y0} ${x1},${y1} ${x2},${y2} ${x3},${y3}`}
        fill={COLORS.groundFill} stroke={COLORS.ground} strokeWidth="1.5"
      />

      {/* Parede frontal (y=0) */}
      <polygon
        points={`${x0},${y0} ${x1},${y1} ${tx1},${ty1} ${tx0},${ty0}`}
        fill="rgba(64,145,108,0.18)" stroke={COLORS.structure} strokeWidth="1.2"
      />
      {/* Parede traseira (y=L) */}
      <polygon
        points={`${x3},${y3} ${x2},${y2} ${tx2},${ty2} ${tx3},${ty3}`}
        fill="rgba(64,145,108,0.1)" stroke={COLORS.structure} strokeWidth="1" opacity="0.7"
      />
      {/* Parede lateral esquerda */}
      <polygon
        points={`${x0},${y0} ${x3},${y3} ${tx3},${ty3} ${tx0},${ty0}`}
        fill="rgba(64,145,108,0.22)" stroke={COLORS.structure} strokeWidth="1.2"
      />
      {/* Parede lateral direita */}
      <polygon
        points={`${x1},${y1} ${x2},${y2} ${tx2},${ty2} ${tx1},${ty1}`}
        fill="rgba(64,145,108,0.08)" stroke={COLORS.structure} strokeWidth="1"
      />

      {/* Pilares */}
      {pillarLines.map((d, i) => (
        <path key={i} d={d} stroke={COLORS.structure2} strokeWidth="1.8" fill="none" opacity="0.8" />
      ))}

      {/* Arcos grampo */}
      {arcLines.map((d, i) => (
        <path key={i} d={d} stroke={COLORS.coverStroke} strokeWidth="1.5"
          fill="none" strokeDasharray={i === 0 || i === arcLines.length - 1 ? 'none' : '4,3'} />
      ))}

      {/* Cobertura telhado dois-águas (frente) */}
      <polygon
        points={`${tx0},${ty0} ${rx0},${ry0} ${tx1},${ty1}`}
        fill={COLORS.cover} stroke={COLORS.coverStroke} strokeWidth="1.5"
      />
      {/* Cobertura telhado dois-águas (plano principal) */}
      <polygon
        points={`${tx0},${ty0} ${rx0},${ry0} ${rx1},${ry1} ${tx3},${ty3}`}
        fill={COLORS.cover} stroke={COLORS.coverStroke} strokeWidth="1.5"
      />
      <polygon
        points={`${tx1},${ty1} ${rx0},${ry0} ${rx1},${ry1} ${tx2},${ty2}`}
        fill="rgba(183,228,199,0.25)" stroke={COLORS.coverStroke} strokeWidth="1.5"
      />

      {/* Cumeeira */}
      <line x1={rx0} y1={ry0} x2={rx1} y2={ry1} stroke={COLORS.structure} strokeWidth="2.5" />

      {/* ── Cotas ── */}
      {/* Largura */}
      <line x1={x0 - 14} y1={y0 + 4} x2={x1 + 4} y2={y1 + 4}
        stroke={COLORS.dim} strokeWidth="0.8" strokeDasharray="3,2" />
      <text x={(x0 + x1) / 2} y={y0 + 18} textAnchor="middle"
        fontSize="10" fill={COLORS.text} fontFamily="monospace">
        {W}m
      </text>

      {/* Comprimento */}
      <line x1={x1 + 12} y1={y1 - 4} x2={x2 + 12} y2={y2 - 4}
        stroke={COLORS.dim} strokeWidth="0.8" strokeDasharray="3,2" />
      <text x={(x1 + x2) / 2 + 18} y={(y1 + y2) / 2} textAnchor="middle"
        fontSize="10" fill={COLORS.text} fontFamily="monospace">
        {L}m
      </text>

      {/* Altura */}
      <line x1={tx1 + 14} y1={ty1} x2={tx1 + 14} y2={y1}
        stroke={COLORS.dim} strokeWidth="0.8" strokeDasharray="3,2" />
      <text x={tx1 + 26} y={(ty1 + y1) / 2 + 3} textAnchor="start"
        fontSize="10" fill={COLORS.text} fontFamily="monospace">
        {H}m
      </text>

      {/* Cumeeira */}
      <line x1={rx0 + 12} y1={ry0} x2={tx1 + 14} y2={ty1}
        stroke={COLORS.dim} strokeWidth="0.8" strokeDasharray="3,2" />
      <text x={rx0 + 28} y={(ry0 + ty1) / 2} textAnchor="start"
        fontSize="9" fill={COLORS.text} fontFamily="monospace" opacity="0.7">
        {ridgeH.toFixed(1)}m
      </text>

      {/* Título */}
      <text x="280" y="18" textAnchor="middle" fontSize="12" fontWeight="bold"
        fill={COLORS.text} fontFamily="Arial, sans-serif">
        ESTUFA — Vista Isométrica
      </text>
      <text x="280" y="31" textAnchor="middle" fontSize="9" fill="#555" fontFamily="Arial, sans-serif">
        {W}m × {L}m × {H}m (L×C×A) · Tipo: {estufaType || 'Grampo'}
      </text>

      {/* Rosa dos ventos simplificada */}
      <text x="20" y="320" fontSize="9" fill="#888" fontFamily="monospace">N↑</text>
    </svg>
  );
}

function GridPaper() {
  return (
    <svg width="100%" viewBox="0 0 560 200" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', background: '#fff', border: '1px solid #dee2e6', borderRadius: 6 }}>
      <defs>
        <pattern id="smallGrid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M 10 0 L 0 0 0 10" fill="none" stroke={COLORS.grid} strokeWidth="0.5" />
        </pattern>
        <pattern id="bigGrid" width="50" height="50" patternUnits="userSpaceOnUse">
          <rect width="50" height="50" fill="url(#smallGrid)" />
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke={COLORS.gridMajor} strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#bigGrid)" />
      <text x="8" y="14" fontSize="9" fill="#aaa" fontFamily="Arial, sans-serif">Esboço / Planta Baixa (preenchimento manual)</text>
    </svg>
  );
}

export default function GreenhouseDrawing({ env, client, onClose }) {
  const [tab, setTab] = useState('3d');
  const svgRef = useRef(null);

  const W = parseFloat(env?.width)  || 8;
  const L = parseFloat(env?.length) || 20;
  const H = parseFloat(env?.height) || 3.5;
  const estufaType = env?.estufaType || 'grampo';

  const exportPDF = useCallback(() => {
    const gridSvg = `
      <svg width="560" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="sg" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#dee2e6" stroke-width="0.5"/>
          </pattern>
          <pattern id="bg" width="50" height="50" patternUnits="userSpaceOnUse">
            <rect width="50" height="50" fill="url(#sg)"/>
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#adb5bd" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>
        <text x="8" y="14" font-size="9" fill="#aaa" font-family="Arial">Esboço / Planta Baixa (preenchimento manual)</text>
      </svg>`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Desenho Técnico — ${client?.name || 'Cliente'}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: center;
            border-bottom: 2px solid #2d6a4f; padding-bottom: 10px; margin-bottom: 16px; }
  .title { font-size: 18px; font-weight: bold; color: #2d6a4f; }
  .subtitle { font-size: 10px; color: #555; }
  .section { margin-bottom: 16px; }
  .section-title { font-size: 10px; font-weight: bold; text-transform: uppercase;
                   color: #2d6a4f; letter-spacing: 0.08em; margin-bottom: 6px;
                   border-bottom: 1px solid #2d6a4f; padding-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 6px; border: 1px solid #ddd; }
  .label { background: #f0faf4; font-weight: bold; color: #2d6a4f; width: 120px; }
  .footer { margin-top: 20px; font-size: 9px; color: #aaa; border-top: 1px solid #ddd;
            padding-top: 6px; text-align: center; }
  svg { max-width: 100%; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">🌿 ${APP_NAME}</div>
      <div class="subtitle">DESENHO TÉCNICO DE ESTUFA</div>
    </div>
    <div style="text-align:right; font-size:10px; color:#555">
      ${new Date().toLocaleDateString('pt-BR')}<br>
      ${client?.name || '—'}
    </div>
  </div>

  <div class="section">
    <div class="section-title">DADOS DO AMBIENTE</div>
    <table>
      <tr>
        <td class="label">Cliente</td><td>${client?.name || '—'}</td>
        <td class="label">Telefone</td><td>${client?.phone1 || '—'}</td>
      </tr>
      <tr>
        <td class="label">Ambiente</td><td>${env?.label || '—'}</td>
        <td class="label">Tipo de Estufa</td><td>${estufaType}</td>
      </tr>
      <tr>
        <td class="label">Largura</td><td>${W} m</td>
        <td class="label">Comprimento</td><td>${L} m</td>
      </tr>
      <tr>
        <td class="label">Altura Parede</td><td>${H} m</td>
        <td class="label">Grampos</td><td>${env?.grampoQty ? `${env.grampoQty}× grampo ${env.grampoSize || '28'}` : '—'}</td>
      </tr>
      ${env?.notes ? `<tr><td class="label">Observações</td><td colspan="3">${env.notes}</td></tr>` : ''}
    </table>
  </div>

  <div class="section">
    <div class="section-title">VISTA ISOMÉTRICA</div>
    ${svgRef.current?.innerHTML || '<p>SVG não disponível</p>'}
  </div>

  <div class="section">
    <div class="section-title">PLANTA BAIXA / ESBOÇO</div>
    ${gridSvg}
  </div>

  <div class="footer">
    ${APP_NAME} — Gerado em ${new Date().toLocaleString('pt-BR')}
  </div>
  <script>setTimeout(() => window.print(), 500);<\/script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const w    = window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }, [env, client, svgRef]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--card, #fff)', borderRadius: 16,
        width: '100%', maxWidth: 620, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border, #e0e0e0)',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--primary, #2d6a4f)' }}>
              🌿 Desenho Técnico
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3, #888)', marginTop: 1 }}>
              {env?.label || 'Ambiente'} · {W}×{L}×{H}m
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={exportPDF}
              style={{
                background: '#2d6a4f', color: '#fff', border: 'none',
                borderRadius: 8, padding: '7px 14px', fontSize: 12,
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              🖨️ Exportar PDF
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'var(--bg, #f4f4f4)', border: 'none',
                borderRadius: 8, padding: '7px 12px', fontSize: 14,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: 0, padding: '10px 18px 0', borderBottom: '1px solid var(--border, #e0e0e0)' }}>
          {[['3d', '🏗️ Vista 3D'], ['plant', '📐 Planta Baixa'], ['data', '📋 Dados']].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                background: 'none', border: 'none', padding: '8px 16px',
                fontWeight: tab === k ? 700 : 400,
                color: tab === k ? '#2d6a4f' : 'var(--text2, #666)',
                borderBottom: tab === k ? '2px solid #2d6a4f' : '2px solid transparent',
                cursor: 'pointer', fontSize: 13, marginBottom: -1,
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {tab === '3d' && (
            <div ref={svgRef}>
              <GreenhouseDrawingSVG
                width={W} length={L} height={H} estufaType={estufaType}
              />
              <div style={{ fontSize: 11, color: '#888', textAlign: 'center', marginTop: 6 }}>
                Vista isométrica gerada automaticamente · escala representativa
              </div>
            </div>
          )}

          {tab === 'plant' && (
            <div>
              <GridPaper />
              <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
                📝 Área para esboço manual — exporte o PDF e preencha à mão ou use a impressão.
              </div>
            </div>
          )}

          {tab === 'data' && (
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                ['Ambiente', env?.label || '—'],
                ['Tipo de Estufa', estufaType],
                ['Largura', `${W} m`],
                ['Comprimento', `${L} m`],
                ['Altura de Parede', `${H} m`],
                ['Grampos', env?.grampoQty ? `${env.grampoQty}× grampo ${env.grampoSize || '28'}` : '—'],
                ['Área Coberta', `${(W * L).toFixed(1)} m²`],
                ['Volume Estimado', `${(W * L * H * 0.75).toFixed(1)} m³`],
                ['Perímetro Base', `${(2 * (W + L)).toFixed(1)} m`],
              ].map(([label, value]) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', background: 'var(--bg, #f8f8f8)', borderRadius: 8,
                }}>
                  <span style={{ fontSize: 13, color: 'var(--text2, #666)', fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary, #2d6a4f)' }}>{value}</span>
                </div>
              ))}
              {env?.notes && (
                <div style={{ padding: '8px 12px', background: '#fff9e6', borderRadius: 8, fontSize: 12 }}>
                  <strong>Obs:</strong> {env.notes}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
