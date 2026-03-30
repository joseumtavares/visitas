/**
 * lib/cep.js
 * Integração com ViaCEP — pode ser usada no servidor (route.ts)
 * ou no frontend diretamente (consulta pública, sem CORS bloqueado).
 *
 * Decisão técnica adotada:
 *   Usamos a rota proxy interna /api/cep/route.ts para:
 *   - centralizar tratamento de erros
 *   - possibilitar cache futura (Redis/edge)
 *   - evitar dependência de CORS do ViaCEP no futuro
 *   - manter consistência com o padrão do projeto
 */

const VIACEP_BASE = 'https://viacep.com.br/ws';

/**
 * Sanitiza e valida um CEP.
 * Retorna os 8 dígitos ou null se inválido.
 */
export function sanitizeCep(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length === 8 ? digits : null;
}

/**
 * Formata para exibição: 00000-000
 */
export function formatCep(raw) {
  const d = sanitizeCep(raw);
  if (!d) return raw || '';
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/**
 * Consulta o ViaCEP diretamente (usado no servidor / route proxy).
 * Lança erro em caso de falha de rede.
 * Retorna null se CEP não existir (erro: true).
 */
export async function fetchCepFromViaCep(cep) {
  const digits = sanitizeCep(cep);
  if (!digits) {
    throw new Error('CEP inválido: deve ter 8 dígitos numéricos.');
  }

  const res = await fetch(`${VIACEP_BASE}/${digits}/json/`, {
    // Cache: 1 hora — o ViaCEP é estável
    next: { revalidate: 3600 },
  });

  if (res.status === 400) {
    throw new Error('CEP inválido.');
  }

  if (!res.ok) {
    throw new Error(`Erro ao consultar ViaCEP: HTTP ${res.status}`);
  }

  const data = await res.json();

  if (data.erro === true || data.erro === 'true') {
    return null; // CEP não encontrado
  }

  return {
    cep:          digits,
    street:       data.logradouro || '',
    complement:   data.complemento || '',
    neighborhood: data.bairro || '',
    city:         data.localidade || '',
    state:        data.uf || '',
  };
}
