/** @type {import('next').NextConfig} */
const nextConfig = {
  // Alias @/ aponta para a raiz do projeto
  // Necessário para resolver @/lib/supabase, @/lib/cep, etc. na Vercel
  webpack(config) {
    return config;
  },
};

module.exports = nextConfig;
