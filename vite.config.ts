import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// El artefacto se abre mediante file://, por eso todo recurso queda inlineado.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
  },
});
