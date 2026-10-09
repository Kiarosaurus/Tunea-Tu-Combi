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
abre una cuadrícula con el asiento fijo del conductor, entrega el resto del kit
gratuito en la paleta y asigna un presupuesto fijo de construcción. El asiento
del conductor se puede mover, pero no retirar ni vender. Las piezas adicionales
libres se venden por el 70 % de su precio.
Para transportar un pasajero hace falta un segundo asiento. Las compras se hacen
desde la misma paleta de piezas y las unidades libres pueden venderse antes del recorrido.

En el taller, las piezas se arrastran desde el inventario hacia la cuadrícula y
pueden moverse entre celdas. La franja coloreada representa el chasis que
asegura las piezas conectadas. Durante el arrastre, una sombra verde o roja
previsualiza la huella completa y avisa si la colocación es válida.
La cuadrícula está integrada en la silueta lateral de la combi: motor, asientos,
parrilla, portacarga y suspensión quedan visibles tanto al construir como al
conducir. La información del taller se concentra en una barra breve de recursos.

En ruta, `D` o flecha derecha acelera, `A` o flecha izquierda aplica reversa,
`Espacio` frena y cada nueva pulsación recorre 25 %, 50 %, 75 % y 100 % de
efectividad. La flecha abajo recoge la solicitud cercana. Recoger exige detenerse
casi por completo. Los pasajeros aparecen junto a la pista y también se recogen haciendo clic
directamente sobre ellos; al llegar a su parada bajan automáticamente y liberan
el asiento. `E` se conserva como alternativa de teclado y para las cargas.
`Esc` pausa, `R` reinicia con confirmación y `F1`
alterna la depuración gráfica. El menú permite reducir el movimiento; la opción
se conserva en el guardado local.
La distribución de las ruedas también afecta la conducción: agruparlas hacia
un solo lado aumenta con fuerza la resistencia al avance y reduce la tracción.
Las solicitudes se generan de forma reproducible desde la semilla del intento:
cada recorrido ofrece entre seis y diez oportunidades, varias en pares cercanos
que obligan a elegir según capacidad, estabilidad y soportes. Incluyen pasajeros
y cargas para parrilla o scooter posterior. Toda carga
aparece junto a su responsable, requiere además un asiento libre y se recoge
directamente en la pista. Persona y objeto permanecen visibles al viajar. Cada
persona ocupa la posición de su asiento; su masa e inercia se agregan mientras
está a bordo y pueden inclinar o volcar la combi. Una carga se pierde si rompe su
unión. Las tarifas están entre S/ 1 y S/ 5 según la distancia y las cuotas se
ajustan a esos importes. El dinero entregado determina hasta tres estrellas,
pero no se acumula como saldo. Solo tres estrellas desbloquean la siguiente ruta.

La franja superior resume la ruta CR27 Comas - S.M.P. mediante una selección
de paraderos limeños, muestra el avance de la combi, la capacidad ocupada y
fichas mínimas de los pasajeros a bordo con destino, masa y tarifa.
El cronómetro, dinero, velocidad, salud del motor, pausa y controles de conducción flotan como
instrumentos independientes sobre la escena en lugar de ocupar un panel lateral.
Los golpes de carrocería contra la pista reducen el motor en 25 % y el arrastre
continuo lo deteriora gradualmente, incluso si la combi casi no avanza mientras
se fuerza el acelerador. Una barra vertical acumula esfuerzo: al permanecer llena,
la salud baja dos puntos por segundo; al soltar, se enfría. El humo aumenta de
densidad al caer la salud; al llegar a 0 %, el motor explota y termina en game
over. La cámara mantiene la combi centrada en ambos ejes.
En el borde posterior de cada recorrido, un patrullero bloquea la salida y
termina el intento por arresto antes de que la combi pueda caer fuera del mundo.
Las piezas sin conexión caen al piso interior, se amontonan como desorden y no
aportan función. El fondo usa capas periódicas de paralaje para que nubes, cerros,
edificios y mobiliario continúen sin saltos al avanzar.

La subida al cerro introduce una pendiente prolongada y solicitudes en competencia. El día
de mercado exige asiento, parrilla y portacarga posterior; combina pasajeros,
carga alta y scooter sobre terreno ondulado. Cada recorrido conserva su propia
cuota, meta, semilla y apariencia provisional.

Pista dañada usa baches y rampas para comparar uniones rígidas contra suspensión
reforzada. Hora punta combina pendientes, ondulaciones y diez oportunidades.
Las rutas miden entre 96 m y 120 m para ocupar una parte significativa del minuto.
La selección muestra dominio de cero a tres estrellas y el reto de cada ruta; el
mejor ingreso se conserva en el guardado por compatibilidad, pero no se presenta
como un récord redundante.

El modal de metas no interrumpe la entrada al taller: se abre solo desde el botón
`Metas`. Desde resultados se puede reintentar inmediatamente con la misma combi,
editarla, elegir otra ruta o abrir el taller de la siguiente ruta desbloqueada.

El guardado local usa la clave `tunea-tu-combi:save:v1`. Se valida antes de
cargar; si está corrupto, se conserva su texto original en memoria durante la
sesión y se inicia una partida segura. El menú permite borrar el progreso con
confirmación. Una versión de prueba mínima `v0` se migra automáticamente a v1.

Consulta `ASSETS.md` para conocer el origen y reemplazo de los gráficos
provisionales.
