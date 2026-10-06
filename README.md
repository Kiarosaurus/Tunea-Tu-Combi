# Tunea Tu Combi

Juego web 2D de construcción y conducción basado en físicas, desarrollado para
el curso de Computación Gráfica de UTEC. El producto usa Canvas 2D y genera un
único `index.html` que abre desde disco sin servidor ni conexión a internet.

La versión actual incluye TypeScript estricto, una máquina de estados explícita,
un núcleo físico propio, taller modular y cinco recorridos jugables de
60 segundos. Los siete tipos de piezas están definidos como datos y los niveles
se desbloquean con tres estrellas. El menú ofrece un perfil de demostración independiente
para revisar inmediatamente toda la campaña.

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

La prueba smoke abre el artefacto con `file://`, completa el primer recorrido,
recarga el guardado y comprueba que no existan peticiones remotas ni errores de
consola.

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
  persistence/ esquema, validación y guardado local
  physics/      solver físico propio y terreno
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
Euler semiimplícito. Las ruedas usan círculos y el chasis una caja orientada
para resolver contacto normal contra segmentos del terreno, incluso cuando la
combi vuelca o queda apoyada de forma desigual. Un coeficiente opcional añade un impulso
tangencial limitado por el apoyo de cada rueda. La demo cae por gravedad y
avanza con una velocidad inicial. La marca de las ruedas gira visualmente según
la distancia recorrida. Durante el nivel 1, un modelo de motor centralizado
limita la aceleración y el frenado según el contacto y la tracción disponible.
La suspensión reforzada aplica resorte y amortiguación si está equipada; la
parrilla y el portacarga agregan masa mediante uniones que pueden romperse por
impacto. Todavía no hay rotación de rueda independiente y la fricción pasiva
configurable aún no se usa en la combi jugable.

Pulsa `F1` o el botón de depuración para ver el centro del cuerpo, colisionadores,
normales, fricción, suspensión, uniones y vector de gravedad. El dibujo usa
instantáneas de la física y no altera la simulación. El límite actual es de 30 m/s de velocidad lineal y
8 rad/s de velocidad angular; los cuadros largos se acotan para evitar saltos.

## Flujo disponible

La máquina de estados declara el flujo completo previsto:

```text
BOOT -> MENU -> LEVEL_SELECT -> WORKSHOP -> PLAYING -> PAUSED -> RESULTS
```

La interfaz recorre todos esos estados durante la campaña completa. Cada nivel
entrega una combi base, piezas incluidas y un presupuesto fijo de construcción.
Para transportar un pasajero hace falta un segundo asiento. Las compras se hacen
desde la misma paleta de piezas y pueden devolverse antes del recorrido.

En el taller, las piezas se arrastran desde el inventario hacia la cuadrícula y
pueden moverse entre celdas. La franja coloreada representa el chasis que
asegura las piezas conectadas. Durante el arrastre, una sombra verde o roja
previsualiza la huella completa y avisa si la colocación es válida.
La cuadrícula está integrada en la silueta lateral de la combi: motor, asientos,
parrilla, portacarga y suspensión quedan visibles tanto al construir como al
conducir. La información del taller se concentra en una barra breve de recursos.

En ruta, `D` o flecha derecha acelera, `A` o flecha izquierda aplica reversa y
`Espacio` recoge una solicitud cercana; si no hay una disponible, frena. Los
pasajeros aparecen junto a la pista y también se recogen haciendo clic
directamente sobre ellos; al llegar a su parada bajan automáticamente y liberan
el asiento. `E` se conserva como alternativa de teclado y para las cargas.
`Esc` pausa, `R` reinicia con confirmación y `F1`
alterna la depuración gráfica. El menú permite reducir el movimiento; la opción
se conserva en el guardado local.
La distribución de las ruedas también afecta la conducción: agruparlas hacia
un solo lado aumenta con fuerza la resistencia al avance y reduce la tracción.
Las solicitudes se generan de forma reproducible desde la semilla del intento:
incluyen pasajeros y una carga para parrilla o scooter posterior. Su masa e
inercia se agregan mientras están a bordo; una carga se pierde si rompe su
unión. Las tarifas están entre S/ 1 y S/ 5 según la distancia y las cuotas se
ajustan a esos importes. El dinero entregado determina hasta tres estrellas,
pero no se acumula como saldo. Solo tres estrellas desbloquean la siguiente ruta.

La franja superior resume la ruta CR27 Comas - S.M.P. mediante una selección
de paraderos limeños, muestra el avance de la combi, la capacidad ocupada y
fichas mínimas de los pasajeros a bordo con destino, masa y tarifa.
El cronómetro, dinero, velocidad, salud del motor, pausa y controles de conducción flotan como
instrumentos independientes sobre la escena en lugar de ocupar un panel lateral.
Los golpes de carrocería contra la pista reducen el motor en 25 % y el arrastre
continuo lo deteriora gradualmente; el humo comunica el daño sin abrir otro panel.

La subida al cerro introduce una pendiente prolongada y tres entregas. El día
de mercado exige asiento, parrilla y portacarga posterior; combina pasajeros,
carga alta y scooter sobre terreno ondulado. Cada recorrido conserva su propia
cuota, meta, semilla y apariencia provisional.

Pista dañada usa baches y rampas para comparar uniones rígidas contra suspensión
reforzada. Hora punta combina pendientes, ondulaciones y cuatro solicitudes
seguidas. Al terminar, el mejor ingreso de cada nivel permanece en el guardado.

El guardado local usa la clave `tunea-tu-combi:save:v1`. Se valida antes de
cargar; si está corrupto, se conserva su texto original en memoria durante la
sesión y se inicia una partida segura. El menú permite borrar el progreso con
confirmación. Una versión de prueba mínima `v0` se migra automáticamente a v1.

Consulta `ASSETS.md` para conocer el origen y reemplazo de los gráficos
provisionales.
