import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// El entregable del curso es un único index.html que debe abrirse desde disco
// (file://), sin servidor y sin ninguna referencia a internet. viteSingleFile
// inlinea JS, CSS y assets dentro del HTML para que eso se cumpla.
// La salida final queda empaquetada en un unico archivo HTML.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000,
  },
});
