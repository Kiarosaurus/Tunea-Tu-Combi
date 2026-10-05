import type { AppAction, AppSnapshot } from '../app/appController';
import type { Disposable } from '../core/contracts';
import { LEVELS } from '../data/levels';
import { PART_CATALOG } from '../data/parts';
import { ANCHORS, createInitialGameModel, passengerCapacity, vehicleCapacity, type AnchorId } from '../game/model';
import { STOP_RADIUS_METERS } from '../game/rideSession';
import { requestFare } from '../game/requests';

export interface AppView extends Disposable {
  readonly canvas: HTMLCanvasElement;
  render(snapshot: AppSnapshot): void;
}

const ANCHOR_NAMES: Readonly<Record<AnchorId, string>> = {
  frontWheel: 'Rueda delantera',
  rearWheel: 'Rueda posterior',
  engine: 'Motor',
  driverSeat: 'Asiento del conductor',
  passengerSeat: 'Asiento de pasajero',
  roof: 'Parrilla de techo',
  rearCarrier: 'Portacarga posterior',
  suspension: 'Suspensión',
};

export function createAppView(root: HTMLElement, dispatch: (action: AppAction) => void): AppView {
  const canvas = document.createElement('canvas');
  canvas.className = 'scene';
  canvas.setAttribute('aria-label', 'Vista lateral de una combi en Lima');
  canvas.setAttribute('role', 'img');

  const shade = document.createElement('div');
  shade.className = 'scene-shade';
  shade.setAttribute('aria-hidden', 'true');

  const header = document.createElement('header');
  header.className = 'topbar';
  header.append(
    textElement('span', 'brand-mark', 'TTC'),
    textElement('span', 'brand-name', 'Tunea Tu Combi'),
    textElement('span', 'prototype-badge', 'PRIMER RECORRIDO'),
  );
  const debugButton = actionButton('Depuración: no', 'debug-action', () =>
    dispatch({ type: 'TOGGLE_DEBUG' }));
  debugButton.title = 'Mostrar u ocultar física (F1)';
  debugButton.setAttribute('aria-pressed', 'false');
  header.append(debugButton);

  const screen = document.createElement('main');
  screen.className = 'screen';
  screen.id = 'main-screen';

  const footer = document.createElement('footer');
  footer.className = 'footer-note';
  footer.textContent = 'Construye. Equilibra. Recorre Lima.';
  root.replaceChildren(canvas, shade, header, screen, footer);

  let visibleState = '';
  return {
    canvas,
    render(snapshot): void {
      root.dataset.appState = snapshot.state;
      debugButton.textContent = snapshot.debugEnabled ? 'Depuración: sí' : 'Depuración: no';
      debugButton.setAttribute('aria-pressed', String(snapshot.debugEnabled));
      if (snapshot.state === 'PLAYING' && visibleState === 'PLAYING') {
        updatePlayingScreen(screen, snapshot);
        return;
      }
      visibleState = snapshot.state;
      screen.replaceChildren(createScreen(snapshot, dispatch));
      if (snapshot.state === 'PLAYING') updatePlayingScreen(screen, snapshot);
    },
    destroy(): void {
      root.replaceChildren();
    },
  };
}

function createScreen(snapshot: AppSnapshot, dispatch: (action: AppAction) => void): HTMLElement {
  switch (snapshot.state) {
    case 'BOOT': return createBootScreen();
    case 'MENU': return createMenuScreen(snapshot, dispatch);
    case 'LEVEL_SELECT': return createLevelSelectScreen(snapshot, dispatch);
    case 'WORKSHOP': return createWorkshopScreen(snapshot, dispatch);
    case 'PLAYING': return createPlayingScreen(snapshot, dispatch);
    case 'PAUSED': return createPausedScreen(dispatch);
    case 'RESULTS': return createResultsScreen(snapshot, dispatch);
  }
}

function createBootScreen(): HTMLElement {
  const panel = panelElement('boot-panel');
  panel.append(
    textElement('p', 'eyebrow', 'Preparando el taller'),
    textElement('h1', 'hero-title', 'Tunea Tu Combi'),
    textElement('p', 'hero-copy', 'Cargando la partida...'),
  );
  return panel;
}

function createMenuScreen(snapshot: AppSnapshot, dispatch: (action: AppAction) => void): HTMLElement {
  const panel = panelElement('menu-panel');
  panel.append(
    textElement('p', 'eyebrow', 'Proyecto de Computación Gráfica'),
    textElement('h1', 'hero-title', 'Tu ruta. Tu máquina.'),
    textElement('p', 'hero-copy',
      'Compra piezas, equilibra tu combi y transporta pasajeros por Lima antes de que termine el turno.'),
    actionButton('Empezar recorrido', 'primary-action', () =>
      dispatch({ type: 'OPEN_LEVEL_SELECT' })),
    textElement('p', 'phase-note', `Billetera: S/ ${snapshot.game.wallet} | Nivel desbloqueado: ${snapshot.game.unlockedLevel}`),
  );
  const reset = actionButton('Borrar progreso', 'text-action', () => {
    if (window.confirm('¿Borrar todo el progreso guardado?')) dispatch({ type: 'RESET_PROGRESS' });
  });
  reset.classList.add('reset-action');
  panel.append(reset, statusMessage(snapshot.message));
  return panel;
}

function createLevelSelectScreen(snapshot: AppSnapshot, dispatch: (action: AppAction) => void): HTMLElement {
  const wrapper = panelElement('level-panel');
  const heading = document.createElement('div');
  heading.className = 'section-heading';
  heading.append(
    actionButton('Volver', 'text-action', () => dispatch({ type: 'BACK' })),
    textElement('p', 'eyebrow', 'Selecciona un recorrido'),
    textElement('h1', 'section-title', 'Rutas de la ciudad'),
  );

  const grid = document.createElement('div');
  grid.className = 'level-grid';
  for (const level of LEVELS) {
    const isUnlocked = level.number <= snapshot.game.unlockedLevel;
    const isPlayable = level.number <= 3;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'level-card';
    card.disabled = !isUnlocked || !isPlayable;
    card.setAttribute('aria-label', `${level.name}, cuota S/ ${level.quota}`);
    card.append(
      textElement('span', 'level-number', String(level.number).padStart(2, '0')),
      textElement('strong', 'level-name', level.name),
      textElement('span', 'level-challenge', level.challenge),
      textElement('span', 'level-quota', `Cuota S/ ${level.quota}`),
      textElement('span', 'level-status', isPlayable && isUnlocked ? 'Disponible' : isUnlocked ? 'Desbloqueado, próximamente' : 'Bloqueado'),
    );
    if (isPlayable) card.addEventListener('click', () =>
      dispatch({ type: 'SELECT_LEVEL', levelId: level.id }));
    grid.append(card);
  }
  wrapper.append(heading, grid, statusMessage(snapshot.message));
  return wrapper;
}

function createWorkshopScreen(snapshot: AppSnapshot, dispatch: (action: AppAction) => void): HTMLElement {
  const level = LEVELS.find((candidate) => candidate.id === snapshot.selectedLevelId);
  const panel = panelElement('workshop-panel');
  panel.append(
    actionButton('Volver a rutas', 'text-action', () => dispatch({ type: 'BACK' })),
    textElement('p', 'eyebrow', level?.name ?? 'Taller'),
    textElement('h1', 'section-title', 'Taller de la combi'),
    textElement('p', 'workshop-intro',
      level?.number === 3
        ? 'Equipa asiento, parrilla y portacarga para atender todas las solicitudes del mercado.'
        : 'El kit básico ya está montado. Equilibra capacidad y masa para alcanzar la cuota.'),
  );

  const summary = document.createElement('dl');
  summary.className = 'workshop-summary';
  summary.append(
    definitionItem('Billetera', `S/ ${snapshot.game.wallet}`),
    definitionItem('Pasajeros', String(passengerCapacity(snapshot.game.workshopBuild))),
    definitionItem('Carga techo', String(vehicleCapacity(snapshot.game.workshopBuild).roofCargo)),
    definitionItem('Scooter posterior', String(vehicleCapacity(snapshot.game.workshopBuild).scooter)),
    definitionItem('Cuota', `S/ ${level?.quota ?? 25}`),
  );
  panel.append(summary);

  const shop = document.createElement('section');
  shop.className = 'workshop-section';
  shop.append(textElement('h2', 'workshop-heading', 'Tienda e inventario'));
  const basicInventory = createInitialGameModel().ownedParts;
  for (const part of PART_CATALOG.filter((item) => item.kind !== 'chassis')) {
    const row = document.createElement('div');
    row.className = 'shop-row';
    row.append(textElement('span', '',
      `${part.name} - S/ ${part.price} - ${part.massKg} kg - tienes ${snapshot.game.ownedParts[part.kind]}`));
    row.append(actionButton(`Comprar ${part.name}`, 'small-action', () =>
      dispatch({ type: 'BUY_PART', kind: part.kind })));
    if (snapshot.game.pendingPurchases[part.kind] > 0) {
      row.append(actionButton(`Devolver ${part.name}`, 'small-action secondary-action', () =>
        dispatch({ type: 'RETURN_PURCHASE', kind: part.kind })));
    } else if (snapshot.game.ownedParts[part.kind] > basicInventory[part.kind]) {
      row.append(actionButton(`Vender ${part.name}`, 'small-action secondary-action', () =>
        dispatch({ type: 'SELL_PART', kind: part.kind })));
    }
    shop.append(row);
  }
  panel.append(shop);

  const anchors = document.createElement('section');
  anchors.className = 'workshop-section';
  anchors.append(textElement('h2', 'workshop-heading', 'Puntos de anclaje'));
  for (const [anchorName, kind] of Object.entries(ANCHORS)) {
    const anchor = anchorName as AnchorId;
    const placed = snapshot.game.workshopBuild[anchor];
    const row = document.createElement('div');
    row.className = 'anchor-row';
    row.append(textElement('span', '', `${ANCHOR_NAMES[anchor]}: ${placed ? 'colocado' : 'vacío'}`));
    if (placed) {
      row.append(actionButton(`Retirar ${ANCHOR_NAMES[anchor]}`, 'small-action secondary-action', () =>
        dispatch({ type: 'REMOVE_PART', anchor })));
    } else {
      const button = actionButton(`Colocar ${ANCHOR_NAMES[anchor]}`, 'small-action', () =>
        dispatch({ type: 'PLACE_PART', kind, anchor }));
      const placedCount = Object.values(snapshot.game.workshopBuild).filter((item) => item === kind).length;
      button.disabled = placedCount >= snapshot.game.ownedParts[kind];
      row.append(button);
    }
    anchors.append(row);
  }
  panel.append(anchors, statusMessage(snapshot.message),
    actionButton('Iniciar recorrido de 30 segundos', 'primary-action', () =>
      dispatch({ type: 'START_RIDE' })));
  return panel;
}

function createPlayingScreen(snapshot: AppSnapshot, dispatch: (action: AppAction) => void): HTMLElement {
  const level = LEVELS.find((candidate) => candidate.id === snapshot.selectedLevelId);
  const panel = panelElement('playing-panel');
  panel.append(
    textElement('p', 'eyebrow', level?.name ?? 'Recorrido'),
    textElement('h1', 'playing-title', 'En ruta'),
  );
  const hud = document.createElement('div');
  hud.className = 'ride-hud';
  for (const [label, key] of [
    ['Tiempo', 'time'], ['Entregado', 'revenue'], ['Cuota', 'quota'],
    ['Velocidad', 'speed'], ['Posición', 'position'], ['Pasajeros', 'capacity'],
  ] as const) {
    const item = document.createElement('div');
    item.append(textElement('span', 'hud-label', label), textElement('strong', 'hud-value', ''));
    item.querySelector('strong')?.setAttribute('data-ui', key);
    hud.append(item);
  }
  panel.append(hud, textElement('p', 'control-hint', 'D / flecha derecha: acelerar - A / izquierda: reversa - Espacio: frenar - E: interactuar - Esc: pausa'));

  const requests = document.createElement('div');
  requests.className = 'request-list';
  for (const progress of snapshot.ride?.requests ?? []) {
    const button = actionButton('', 'request-action', () =>
      dispatch({ type: 'COLLECT_REQUEST', requestId: progress.request.id }));
    button.dataset.requestId = progress.request.id;
    requests.append(button);
  }
  const delivery = actionButton('Bajar pasajero', 'small-action', () =>
    dispatch({ type: 'DELIVER_REQUEST' }));
  delivery.dataset.ui = 'deliver';
  panel.append(requests, delivery, statusMessage(snapshot.message),
    actionButton('Pausa', 'small-action secondary-action', () => dispatch({ type: 'PAUSE' })));
  return panel;
}

function updatePlayingScreen(screen: HTMLElement, snapshot: AppSnapshot): void {
  const ride = snapshot.ride;
  if (!ride) return;
  setUiText(screen, 'time', `${Math.ceil(ride.remainingSeconds)} s`);
  setUiText(screen, 'revenue', `S/ ${ride.deliveredRevenue}`);
  const level = LEVELS.find((candidate) => candidate.id === snapshot.selectedLevelId);
  setUiText(screen, 'quota', `S/ ${level?.quota ?? 0}`);
  setUiText(screen, 'speed', `${Math.abs(snapshot.speedMps).toFixed(1)} m/s`);
  setUiText(screen, 'position', `${snapshot.vehicleX.toFixed(1)} m`);
  setUiText(screen, 'capacity', `${ride.requests.filter((item) => item.status === 'onboard')
    .reduce((total, item) => total + item.request.massKg, 0)} kg`);
  const message = screen.querySelector<HTMLElement>('[role="status"]');
  if (message) message.textContent = snapshot.message;
  for (const progress of ride.requests) {
    const button = [...screen.querySelectorAll<HTMLButtonElement>('[data-request-id]')]
      .find((candidate) => candidate.dataset.requestId === progress.request.id);
    if (!button) continue;
    button.hidden = progress.status !== 'waiting';
    button.disabled = Math.abs(snapshot.vehicleX - progress.request.originX) > STOP_RADIUS_METERS;
    const action = progress.request.kind === 'passenger' ? 'Recoger pasajero' : 'Recoger carga';
    button.textContent = `${action} en ${progress.request.originStop} (S/ ${requestFare(progress.request)})`;
  }
  const delivery = screen.querySelector<HTMLButtonElement>('[data-ui="deliver"]');
  if (delivery) {
    const onboard = ride.requests.find((item) => item.status === 'onboard');
    delivery.hidden = !onboard;
    delivery.disabled = !onboard || Math.abs(snapshot.vehicleX - onboard.request.destinationX) > STOP_RADIUS_METERS;
    delivery.textContent = onboard
      ? `${onboard.request.kind === 'passenger' ? 'Bajar' : 'Entregar carga'} en ${onboard.request.destinationStop}`
      : 'Completar entrega';
  }
}

function createPausedScreen(dispatch: (action: AppAction) => void): HTMLElement {
  const panel = panelElement('pause-panel');
  panel.append(
    textElement('p', 'eyebrow', 'Tiempo detenido'),
    textElement('h1', 'section-title', 'En pausa'),
    actionButton('Continuar', 'primary-action', () => dispatch({ type: 'RESUME' })),
    actionButton('Volver al taller', 'text-action', () => {
      if (window.confirm('¿Terminar este intento sin acreditar ingresos?')) dispatch({ type: 'ABORT_RIDE' });
    }),
  );
  return panel;
}

function createResultsScreen(snapshot: AppSnapshot, dispatch: (action: AppAction) => void): HTMLElement {
  const level = LEVELS.find((candidate) => candidate.id === snapshot.selectedLevelId);
  const panel = panelElement('results-panel');
  panel.append(
    textElement('p', 'eyebrow', 'Resultado del turno'),
    textElement('h1', 'section-title', snapshot.won ? 'Cuota alcanzada' : 'Inténtalo otra vez'),
    textElement('p', 'hero-copy', snapshot.message),
  );
  const summary = document.createElement('dl');
  summary.className = 'workshop-summary';
  summary.append(
    definitionItem('Entregado', `S/ ${snapshot.ride?.deliveredRevenue ?? 0}`),
    definitionItem('Cuota', `S/ ${level?.quota ?? 0}`),
    definitionItem('Solicitudes', String(snapshot.ride?.deliveredCount ?? 0)),
    definitionItem('Masa máxima', `${snapshot.ride?.maximumPayloadMassKg ?? 0} kg`),
  );
  panel.append(summary,
    textElement('p', 'phase-note', `Semilla: ${snapshot.ride?.seed ?? 'sin intento'}`),
    actionButton('Volver al taller', 'primary-action', () => dispatch({ type: 'RETRY' })),
    actionButton('Elegir nivel', 'text-action', () => dispatch({ type: 'BACK' })));
  return panel;
}

function setUiText(root: HTMLElement, key: string, value: string): void {
  const element = root.querySelector<HTMLElement>(`[data-ui="${key}"]`);
  if (element) element.textContent = value;
}

function statusMessage(message: string): HTMLParagraphElement {
  const element = textElement('p', 'status-message', message);
  element.setAttribute('role', 'status');
  return element;
}

function panelElement(className: string): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = `panel ${className}`;
  return panel;
}

function textElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function actionButton(text: string, className: string, action: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.addEventListener('click', action);
  return button;
}

function definitionItem(term: string, value: string): HTMLDivElement {
  const item = document.createElement('div');
  item.append(textElement('dt', '', term), textElement('dd', '', value));
  return item;
}
