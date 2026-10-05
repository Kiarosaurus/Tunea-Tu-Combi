# Tunea Tu Combi

Juego web 2D de construcción y conducción basado en físicas, desarrollado para
el curso de Computación Gráfica de UTEC. El producto usa Canvas 2D y genera un
único `index.html` que abre desde disco sin servidor ni conexión a internet.

La base actual incluye TypeScript estricto, una máquina de estados explícita,
selección de nivel, un taller provisional, datos para los cinco recorridos y
siete tipos de piezas, y un núcleo físico propio con una combi de prueba.
El ciclo jugable completo se incorporará en los siguientes hitos.

## Requisitos

- Node.js 20.19 o superior.
- npm 10 o superior.
- Chrome o Edge instalado para la prueba de navegador.

## Instalación y desarrollo

```bash
npm ci
npm run dev
```

El servidor de desarrollo muestra los cambios en caliente. No representa el
artefacto final offline.

## Calidad y pruebas

```bash
npm run lint          # reglas estáticas
npm run typecheck     # TypeScript estricto
npm run test:unit     # pruebas unitarias con Vitest
npm run test:smoke    # build y recorrido real con Playwright
npm run verify        # todas las comprobaciones anteriores
```

La prueba smoke abre el artefacto con `file://`, recorre menú, niveles y taller,
y comprueba que no existan peticiones remotas ni errores de consola.

## Build offline

```bash
npm run build
```

El resultado queda en `dist/index.html`. Vite y `vite-plugin-singlefile`
embeben JavaScript, CSS y recursos para que el archivo funcione con doble clic.
No se debe servir `dist/` para validar la entrega: la prueba relevante es abrir
el HTML mediante `file://`.

## Arquitectura

```text
src/
  app/          arranque, controlador y máquina de estados
  core/         contratos y utilidades sin dependencias de presentación
  data/         niveles, piezas, precios y parámetros
  game/         reglas y modelo del juego
  persistence/ contratos de guardado local
  physics/      contratos y futuro solver físico propio
  rendering/    Canvas 2D y representación visual
  ui/           pantallas y acciones de alto nivel
```

`core` y `physics` no dependen del DOM. La UI emite acciones al controlador y
el renderer solo consume instantáneas públicas. Los niveles y piezas viven como
datos para evitar reglas dispersas en las pantallas.

## Núcleo físico actual

El mundo físico usa metros, kilogramos, segundos y newtons. El eje horizontal
apunta a la derecha y el vertical hacia arriba. El acumulador ejecuta pasos
fijos de `1/60 s` con un máximo de 15 pasos por cuadro. El cuerpo rígido tiene
masa, inercia, posición, ángulo y velocidades; las fuerzas se integran con
Euler semiimplícito. Dos círculos representan las ruedas y resuelven contacto
normal contra segmentos del terreno. La demo cae por gravedad y avanza con una
velocidad inicial. La marca de las ruedas gira visualmente según la distancia
recorrida; todavía no hay rotación de rueda independiente, motor, fricción
lateral, suspensión ni uniones rompibles.

Pulsa `F1` o el botón de depuración para ver el centro del cuerpo, colisionadores,
puntos de contacto y vector de gravedad. El dibujo usa instantáneas de la física
y no altera la simulación. El límite actual es de 30 m/s de velocidad lineal y
8 rad/s de velocidad angular; los cuadros largos se acotan para evitar saltos.

## Flujo disponible

La máquina de estados declara el flujo completo previsto:

```text
BOOT -> MENU -> LEVEL_SELECT -> WORKSHOP -> PLAYING -> PAUSED -> RESULTS
```

La interfaz actual permite recorrer hasta `WORKSHOP`. Los estados de conducción
y resultados quedan reservados para el ciclo vertical del juego.

Consulta `ASSETS.md` para conocer el origen y reemplazo de los gráficos
provisionales.
