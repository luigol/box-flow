/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Content Security Policy: o navegador só deixa o app falar com ele mesmo e com a Pluggy.
 * Mesmo que um código malicioso entre por uma biblioteca, ele não consegue enviar dados para fora.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://api.pluggy.ai",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/** Só no build: em desenvolvimento o Vite injeta scripts e estilos inline que a CSP bloquearia. */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'box-flow:csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
        injectTo: 'head-prepend',
      },
    ],
  }
}

export default defineConfig({
  base: '/box-flow/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'box-flow',
        short_name: 'box-flow',
        description: 'Finanças pessoais local-first',
        lang: 'pt-BR',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        background_color: '#f5f5f7',
        theme_color: '#f5f5f7',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      // Só guarda o próprio app para abrir offline. Respostas da Pluggy nunca vão para o cache.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
    contentSecurityPolicy(),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
