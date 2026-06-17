import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://r8e.org',
  output: 'static',
  integrations: [tailwind()],
  build: {
    format: 'file',
    assets: '_assets',
  },
});
