/**
 * components/CepField.jsx
 * Campo de CEP com consulta automática ao ViaCEP via proxy interno.
 *
 * Props:
 *   value    {string}   valor atual do CEP (ex: '01001-000' ou '01001000')
 *   onChange {fn}       (maskedValue: string) => void
 *   onFill   {fn}       ({ street, complement, neighborhood, city, state }) => void
 *   disabled {boolean}
 */

import { useState, useRef, useCallback } from 'react';

// Máscara: 00000-000
function maskCep(raw) {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function sanitizeCep(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  return d.length === 8 ? d : null;
}

export default function CepField({ value = '', onChange, onFill, disabled = false }) {
  const [loading,  setLoading]  = useState(false);
  const [status,   setStatus]   = useState(null); // null | 'ok' | 'notfound' | 'invalid' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const lastQueried = useRef('');

  const lookup = useCallback(async (raw) => {
    const digits = sanitizeCep(raw);

    // CEP incompleto — não consultar ainda
    if (!digits) {
      if (raw.replace(/\D/g, '').length > 0) {
        setStatus('invalid');
        setErrorMsg('CEP incompleto — informe 8 dígitos.');
      }
      return;
    }

    // Mesmo CEP já consultado — não repetir
    if (digits === lastQueried.current) return;
    lastQueried.current = digits;

    setLoading(true);
    setStatus(null);
    setErrorMsg('');

    try {
      const res  = await fetch(`/api/cep?cep=${digits}`);
      const data = await res.json();

      if (res.status === 404 || !data.ok) {
        setStatus('notfound');
        setErrorMsg(data.error || 'CEP não encontrado.');
        return;
      }

      if (!data.ok) {
        setStatus('invalid');
        setErrorMsg(data.error || 'CEP inválido.');
        return;
      }

      // Sucesso — preenche os campos de endereço
      setStatus('ok');
      onFill?.({
        street:       data.data.street       || '',
        complement:   data.data.complement   || '',
        neighborhood: data.data.neighborhood || '',
        city:         data.data.city         || '',
        state:        data.data.state        || '',
      });
    } catch {
      setStatus('error');
      setErrorMsg('Erro de rede ao consultar o CEP. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [onFill]);

  const handleChange = (e) => {
    const masked = maskCep(e.target.value);
    onChange?.(masked);
    // Reseta status quando o usuário altera o CEP
    setStatus(null);
    setErrorMsg('');
    lastQueried.current = '';
  };

  const handleBlur = (e) => {
    lookup(e.target.value);
  };

  // Cores e ícones por status
  const borderColor =
    status === 'ok'                       ? 'var(--primary)' :
    status === 'notfound' ||
    status === 'invalid'  ||
    status === 'error'                    ? 'var(--danger)'  :
    'var(--border)';

  const statusIcon =
    loading          ? '⏳' :
    status === 'ok'  ? '✅' :
    (status === 'notfound' || status === 'invalid' || status === 'error') ? '⚠️' :
    null;

  return (
    <div className="field">
      <label>CEP</label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          value={maskCep(value)}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="00000-000"
          inputMode="numeric"
          maxLength={9}
          disabled={disabled || loading}
          style={{
            flex: 1,
            border: `1.5px solid ${borderColor}`,
            borderRadius: 9,
            padding: '10px 36px 10px 13px',
            background: 'var(--card)',
            fontSize: 15,
            transition: 'border-color .15s',
          }}
        />
        {statusIcon && (
          <span style={{
            position: 'absolute', right: 10,
            fontSize: 16, pointerEvents: 'none',
          }}>
            {statusIcon}
          </span>
        )}
      </div>

      {/* Mensagens de feedback */}
      {status === 'ok' && !errorMsg && (
        <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>
          ✅ Endereço preenchido automaticamente. Confira e ajuste se necessário.
        </span>
      )}
      {errorMsg && (
        <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>
          {errorMsg}
        </span>
      )}
    </div>
  );
}
