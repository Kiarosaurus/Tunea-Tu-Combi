# Manifiesto de recursos visuales

## Estado actual

El proyecto no utiliza imágenes, fuentes, audio ni modelos externos. La vista
provisional de Lima y la combi se dibujan con primitivas de Canvas 2D en
`src/rendering/canvasRenderer.ts`. Todo el resultado queda embebido en el HTML.

## Autoría y licencia

Los gráficos procedurales y estilos de esta versión fueron creados para Tunea
Tu Combi y forman parte del código del proyecto. No incorporan marcas, personajes
ni recursos de terceros.

## Contrato para arte futuro

- Espacio de color: sRGB.
- Escala de referencia: 128 px por metro.
- Formatos de ejecución: PNG o WebP con transparencia; SVG cuando corresponda.
- Nombres: minúsculas y guiones, por ejemplo `rueda-estandar-v1.png`.
- Cada sprite debe registrar dimensiones, pivote, anclajes y autoría.
- Los recursos deben importarse desde el código para que Vite los inlinee.
- No se permiten fuentes remotas, CDN ni cargas con `fetch()` durante el juego.

El renderer mantiene el dibujo provisional aislado. Sustituirlo por sprites no
debe cambiar la máquina de estados, la UI, la física ni las reglas del juego.
