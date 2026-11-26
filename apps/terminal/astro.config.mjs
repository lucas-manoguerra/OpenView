import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'server',
  integrations: [preact()],
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
  },
});
