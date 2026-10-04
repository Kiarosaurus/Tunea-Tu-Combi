# Tunea Tu Combi

Visualizador 3D interactivo de una combi personalizable, hecho con Three.js y WebGL.
Proyecto final del curso de Computación Gráfica (UTEC).

El entregable final es **un único `index.html`** que funciona al abrirlo desde el
disco, sin servidor y sin conexión a internet.

## Requisitos

- Node.js 20 o superior (probado con v22.13.0)
- npm 10 o superior (probado con 11.13.0)

## Cómo compilar

```bash
npm install          # instala dependencias (única vez, requiere internet)
npm run build        # genera dist/index.html autocontenido
```

`npm install` es el único paso que necesita internet. El resultado, `dist/index.html`,
ya no depende de la red: `vite-plugin-singlefile` inlinea el JavaScript, el CSS y los
assets dentro del HTML.

## Cómo reproducir el resultado

Para verlo: abre `dist/index.html` con doble clic en cualquier navegador. No hace
falta servidor. Debería mostrarse la combi sobre una grilla, con un panel para
cambiar color de carrocería, color de franja y acabado metálico.

## Desarrollo

```bash
npm run dev          # servidor de desarrollo con recarga en caliente
npm run preview      # sirve dist/ para revisar el build
```

`npm run dev` es solo para desarrollar. **Lo que se entrega es el resultado de
`npm run build`**. Antes de empaquetar, abre `dist/index.html` directamente desde
el disco para confirmar que funciona sin servidor ni conexion.

## Estructura

```
index.html              cascarón + estilos + panel de UI
src/main.js             punto de entrada: arma escena, controles y customizador
src/scene/createScene.js  escena, cámara, luces, piso y resize
src/scene/combi.js      geometría de la combi y su API de personalización
src/ui/customizer.js    conecta el panel del DOM con el modelo
vite.config.js          build de archivo unico
```
