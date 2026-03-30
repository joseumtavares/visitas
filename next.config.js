/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permite importar SVGs e outras extensões se necessário
  // Configuração mínima para deploy limpo na Vercel
  experimental: {
    // serverActions: true, // habilitar se usar Server Actions no futuro
  },
  // Sem output: 'export' — o projeto usa rotas de API (server-side)
};

module.exports = nextConfig;
