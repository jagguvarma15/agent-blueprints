import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: 'https://jagguvarma15.github.io',
  base: '/agent-blueprints',
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
    sitemap({
      // Exclude non-HTML endpoints (the RSS feed) from the sitemap.
      filter: (page) => !page.endsWith('.xml') && !page.endsWith('.xml/'),
    }),
  ],
  output: 'static',
  vite: {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@data': path.resolve(__dirname, 'src/data'),
        '@components': path.resolve(__dirname, 'src/components'),
        '@layouts': path.resolve(__dirname, 'src/layouts'),
        '@utils': path.resolve(__dirname, 'src/utils'),
      },
    },
    // Allow importing from repo root
    server: {
      fs: {
        allow: [path.resolve(__dirname, '..')],
      },
    },
  },
  markdown: {
    syntaxHighlight: 'shiki',
    shikiConfig: {
      theme: 'github-light',
    },
  },
});
