import type { AppAction, AppSnapshot } from '../app/appController';
import type { Disposable } from '../core/contracts';
import { LEVELS } from '../data/levels';
import { PART_CATALOG, type PartKind } from '../data/parts';
import {
  BUILD_GRID_COLUMNS,
  BUILD_GRID_ROWS,
  PART_FOOTPRINTS,
  createInitialGameModel,
  gridBuildStats,
  gridForModel,
  gridPlacementFits,
  gridVehicleCapacity,
  securedGridPlacements,
  validateGridBuild,
  type GridPlacement,
} from '../game/model';
import { STOP_RADIUS_METERS } from '../game/rideSession';
import { requestFare } from '../game/requests';

export interface AppView extends Disposable {
  readonly canvas: HTMLCanvasElement;
  render(snapshot: AppSnapshot): void;
}

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
  const routeBadge = textElement('span', 'prototype-badge', 'PRIMER RECORRIDO');
  header.append(
    textElement('span', 'brand-mark', 'TTC'),
    textElement('span', 'brand-name', 'Tunea Tu Combi'),
    routeBadge,
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
  const workshopUi: WorkshopUiState = { selectedPart: null };
  return {
    canvas,
    render(snapshot): void {
      const stateChanged = snapshot.state !== visibleState;
      root.dataset.appState = snapshot.state;
      root.dataset.reducedMotion = String(snapshot.reducedMotion);
      routeBadge.textContent = LEVELS.find((level) => level.id === snapshot.selectedLevelId)?.name.toUpperCase()
        ?? 'CAMPAÑA DE LIMA';
      debugButton.textContent = snapshot.debugEnabled ? 'Depuración: sí' : 'Depuración: no';
      debugButton.setAttribute('aria-pressed', String(snapshot.debugEnabled));
      if (snapshot.state === 'PLAYING' && visibleState === 'PLAYING') {
        updatePlayingScreen(screen, snapshot);
        return;
      }
      if (snapshot.state !== 'WORKSHOP') workshopUi.selectedPart = null;
      visibleState = snapshot.state;
      screen.replaceChildren(createScreen(snapshot, dispatch, workshopUi));
      if (snapshot.state === 'PLAYING') updatePlayingScreen(screen, snapshot);
      const heading = screen.querySelector<HTMLElement>('h1');
      if (stateChanged && heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    },
    destroy(): void {
      root.replaceChildren();
    },
  };
}

interface WorkshopUiState {
  selectedPart: PartKind | null;
}

function createScreen(snapshot: AppSnapshot, dispatch: (action: AppAction) => void,
  workshopUi: WorkshopUiState): HTMLElement {
  switch (snapshot.state) {
    case 'BOOT': return createBootScreen();
    case 'MENU': return createMenuScreen(snapshot, dispatch);
    case 'LEVEL_SELECT': return createLevelSelectScreen(snapshot, dispatch);
    case 'WORKSHOP': return createWorkshopScreen(snapshot, dispatch, workshopUi);
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
  const demo = actionButton('Cargar perfil de demostración', 'text-action', () => {
    if (window.confirm('¿Reemplazar el progreso actual por un perfil de demostración?')) {
      dispatch({ type: 'LOAD_DEMO_PROFILE' });
    }
  });
  panel.append(
    actionButton(`Movimiento reducido: ${snapshot.reducedMotion ? 'sí' : 'no'}`,
      'text-action settings-action', () => dispatch({ type: 'TOGGLE_REDUCED_MOTION' })),
    demo,
    reset,
    textElement('p', 'phase-note', 'Créditos: equipo Tunea Tu Combi, Computación Gráfica UTEC.'),
    statusMessage(snapshot.message),
  );
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
    const isPlayable = level.number <= 5;
    const best = snapshot.game.completedLevels[level.id];
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
      textElement('span', 'level-best', best ? `Mejor S/ ${best.bestRevenue}` : 'Sin completar'),
    );
    if (isPlayable) card.addEventListener('click', () =>
      dispatch({ type: 'SELECT_LEVEL', levelId: level.id }));
    grid.append(card);
  }
  wrapper.append(heading, grid, statusMessage(snapshot.message));
  return wrapper;
}

function createWorkshopScreen(snapshot: AppSnapshot, dispatch: (action: AppAction) => void,
  workshopUi: WorkshopUiState): HTMLElement {
  const level = LEVELS.find((candidate) => candidate.id === snapshot.selectedLevelId);
  const grid = gridForModel(snapshot.game);
  const stats = gridBuildStats(grid);
  const capacity = gridVehicleCapacity(grid);
  const securedIds = new Set(securedGridPlacements(grid).map((item) => item.id));
  const panel = panelElement('workshop-panel');
  panel.append(
    actionButton('Volver a rutas', 'text-action', () => dispatch({ type: 'BACK' })),
    textElement('p', 'eyebrow', level?.name ?? 'Taller'),
    textElement('h1', 'section-title', 'Constructor libre'),
    textElement('p', 'workshop-intro', workshopMessage(level?.number)),
  );

  const summary = document.createElement('dl');
  summary.className = 'workshop-summary';
  summary.append(
    definitionItem('Billetera', `S/ ${snapshot.game.wallet}`),
    definitionItem('Pasajeros', String(capacity.passenger)),
    definitionItem('Carga', String(capacity.roofCargo)),
    definitionItem('Scooter', String(capacity.scooter)),
    definitionItem('Cuota', `S/ ${level?.quota ?? 25}`),
    definitionItem('Masa total', `${stats.massKg} kg`),
    definitionItem('Potencia', `${stats.engineForceN} N`),
    definitionItem('Piezas sueltas', String(stats.loosePieces ?? 0)),
  );
  panel.append(summary);

  const buildIssue = validateGridBuild(grid);
  const launch = document.createElement('section');
  launch.className = `launch-panel ${buildIssue ? 'has-issue' : 'is-ready'}`;
  const wheelCount = stats.wheelOffsets?.length ?? 0;
  const configuration = stats.engineForceN === 0
    ? 'Sin motor: podrás iniciar, pero no acelerar.'
    : wheelCount === 0
      ? 'Sin ruedas conectadas: podrás iniciar, pero no tendrás tracción.'
      : `${wheelCount} rueda${wheelCount === 1 ? '' : 's'} conectada${wheelCount === 1 ? '' : 's'} | centro de masa ${stats.centerOfMass.x.toFixed(2)}, ${stats.centerOfMass.y.toFixed(2)} m.`;
  launch.append(
    textElement('span', 'launch-indicator', buildIssue ? '!' : 'OK'),
    textElement('strong', 'launch-title', buildIssue ? 'Falta el único componente obligatorio' : 'Construcción válida'),
    textElement('span', 'launch-copy', buildIssue ?? configuration),
  );
  const startButton = actionButton('Iniciar recorrido de 30 segundos', 'primary-action launch-action', () =>
    dispatch({ type: 'START_RIDE' }));
  startButton.disabled = Boolean(buildIssue);
  launch.append(startButton);
  panel.append(statusMessage(snapshot.message), launch);

  const builder = document.createElement('div');
  builder.className = 'workshop-builder';
  const vehicleSection = document.createElement('section');
  vehicleSection.className = 'vehicle-builder';
  vehicleSection.append(
    textElement('p', 'builder-kicker', 'CUADRÍCULA 10 x 6'),
    textElement('h2', 'builder-title', 'Coloca cada pieza donde quieras'),
    textElement('p', 'builder-help', 'No hay anclajes predeterminados. Las piezas conectadas a la franja inferior o entre sí permanecen unidas; las aisladas se caerán al iniciar.'),
  );
  const selectionMessage = textElement('p', 'selection-message', 'Ninguna pieza seleccionada.');
  selectionMessage.setAttribute('aria-live', 'polite');
  const constructionGrid = document.createElement('div');
  constructionGrid.className = 'construction-grid';
  constructionGrid.setAttribute('aria-label', 'Cuadrícula libre de construcción de la combi');

  const placedCounts: Partial<Record<PartKind, number>> = {};
  for (const placement of grid) placedCounts[placement.kind] = (placedCounts[placement.kind] ?? 0) + 1;
  const freeCount = (kind: PartKind): number => snapshot.game.ownedParts[kind] - (placedCounts[kind] ?? 0);
  const cellButtons: HTMLButtonElement[] = [];
  const inventoryButtons: HTMLButtonElement[] = [];
  const candidateAt = (kind: PartKind, column: number, row: number): GridPlacement => ({
    id: 'preview', kind, column, row,
  });
  const placeAt = (kind: PartKind, column: number, row: number): void => {
    const candidate = candidateAt(kind, column, row);
    if (!gridPlacementFits(candidate, grid)) {
      refreshSelection(`${partName(kind)} no cabe ahí o se superpone con otra pieza.`);
      return;
    }
    workshopUi.selectedPart = freeCount(kind) > 1 ? kind : null;
    dispatch({ type: 'PLACE_GRID_PART', kind, column, row });
  };
  const moveTo = (placementId: string, column: number, row: number): void => {
    const placement = grid.find((item) => item.id === placementId);
    if (!placement) return;
    const candidate = { ...placement, column, row };
    if (!gridPlacementFits(candidate, grid)) {
      refreshSelection(`${partName(placement.kind)} no cabe ahí o se superpone con otra pieza.`);
      return;
    }
    dispatch({ type: 'MOVE_GRID_PART', placementId, column, row });
  };
  const refreshSelection = (feedback?: string): void => {
    const selected = workshopUi.selectedPart;
    selectionMessage.textContent = feedback ?? (selected
      ? `${partName(selected)} seleccionada (${PART_FOOTPRINTS[selected].columns}x${PART_FOOTPRINTS[selected].rows}). Elige cualquier espacio libre.`
      : 'Elige una pieza del inventario o toca una ya colocada para moverla.');
    for (const button of inventoryButtons) {
      const isSelected = button.dataset.partKind === selected;
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
    }
    for (const button of cellButtons) {
      const column = Number(button.dataset.column);
      const row = Number(button.dataset.row);
      const fits = selected ? gridPlacementFits(candidateAt(selected, column, row), grid) : false;
      button.classList.toggle('is-target', fits);
      button.classList.toggle('is-blocked', Boolean(selected) && !fits);
    }
  };

  for (let row = 0; row < BUILD_GRID_ROWS; row += 1) {
    for (let column = 0; column < BUILD_GRID_COLUMNS; column += 1) {
      const cell = actionButton('', 'construction-cell', () => {
        if (!workshopUi.selectedPart) {
          refreshSelection('Primero elige una pieza del inventario.');
          return;
        }
        placeAt(workshopUi.selectedPart, column, row);
      });
      cell.dataset.column = String(column);
      cell.dataset.row = String(row);
      if (row >= BUILD_GRID_ROWS - 2) cell.classList.add('is-chassis');
      cell.style.gridColumn = String(column + 1);
      cell.style.gridRow = String(row + 1);
      cell.setAttribute('aria-label', `Celda columna ${column + 1}, fila ${row + 1}`);
      cell.addEventListener('dragover', (event) => event.preventDefault());
      cell.addEventListener('drop', (event) => {
        event.preventDefault();
        const placementId = event.dataTransfer?.getData('application/x-tunea-placement');
        if (placementId) {
          moveTo(placementId, column, row);
          return;
        }
        const dragged = event.dataTransfer?.getData('application/x-tunea-part') as PartKind | undefined;
        if (dragged) placeAt(dragged, column, row);
      });
      cellButtons.push(cell);
      constructionGrid.append(cell);
    }
  }

  for (const placement of grid) {
    const footprint = PART_FOOTPRINTS[placement.kind];
    const secured = securedIds.has(placement.id);
    const button = actionButton('', `grid-piece piece-${placement.kind} ${secured ? 'is-secured' : 'is-loose'}`, () => {
      workshopUi.selectedPart = placement.kind;
      dispatch({ type: 'REMOVE_GRID_PART', placementId: placement.id });
    });
    button.style.gridColumn = `${placement.column + 1} / span ${footprint.columns}`;
    button.style.gridRow = `${placement.row + 1} / span ${footprint.rows}`;
    button.setAttribute('aria-label', `Retirar ${partName(placement.kind)} de columna ${placement.column + 1}, fila ${placement.row + 1}`);
    button.title = secured ? 'Conectada al chasis' : 'Suelta: se caerá al iniciar';
    button.draggable = true;
    button.append(
      textElement('span', 'grid-piece-icon', partIcon(placement.kind)),
      textElement('span', 'grid-piece-name', partName(placement.kind)),
      textElement('span', 'grid-piece-state', secured ? 'CONECTADA' : 'SUELTA'),
    );
    button.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });
    button.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('application/x-tunea-placement', placement.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    constructionGrid.append(button);
  }
  vehicleSection.append(selectionMessage, constructionGrid,
    textElement('p', 'grid-legend', 'Franja amarilla = conexión al chasis | Rojo = pieza aislada que se desprenderá'));

  const inventory = document.createElement('section');
  inventory.className = 'parts-tray';
  inventory.append(
    textElement('p', 'builder-kicker', 'INVENTARIO'),
    textElement('h2', 'builder-title', 'Piezas disponibles'),
  );
  const trayGrid = document.createElement('div');
  trayGrid.className = 'parts-tray-grid';
  for (const part of PART_CATALOG.filter((item) => item.kind !== 'chassis')) {
    const available = freeCount(part.kind);
    const button = actionButton('', 'part-card', () => {
      if (available < 1) {
        refreshSelection(`No quedan ${part.name.toLowerCase()} libres.`);
        return;
      }
      workshopUi.selectedPart = workshopUi.selectedPart === part.kind ? null : part.kind;
      refreshSelection();
    });
    button.dataset.partKind = part.kind;
    button.disabled = available < 1;
    button.draggable = available > 0;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `Seleccionar ${part.name}, ${available} libre${available === 1 ? '' : 's'}`);
    button.append(
      textElement('span', 'part-card-icon', partIcon(part.kind)),
      textElement('strong', 'part-card-name', part.name),
      textElement('span', 'part-card-count', `${available} libre${available === 1 ? '' : 's'} | ${PART_FOOTPRINTS[part.kind].columns}x${PART_FOOTPRINTS[part.kind].rows} | ${part.massKg} kg`),
    );
    button.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('application/x-tunea-part', part.kind);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
      workshopUi.selectedPart = part.kind;
      refreshSelection();
    });
    inventoryButtons.push(button);
    trayGrid.append(button);
  }
  inventory.append(trayGrid);
  builder.append(vehicleSection, inventory);
  panel.append(builder);

  const shop = document.createElement('section');
  shop.className = 'workshop-section shop-section';
  shop.append(textElement('h2', 'workshop-heading', 'Tienda de repuestos'));
  const basicInventory = createInitialGameModel().ownedParts;
  for (const part of PART_CATALOG.filter((item) => item.kind !== 'chassis')) {
    const row = document.createElement('div');
    row.className = 'shop-row';
    row.append(textElement('span', '',
      `${part.name} | S/ ${part.price} | ${part.massKg} kg | ${part.effect}`));
    row.append(actionButton(`Comprar ${part.name}`, 'small-action', () => {
      workshopUi.selectedPart = part.kind;
      dispatch({ type: 'BUY_PART', kind: part.kind });
    }));
    if (snapshot.game.pendingPurchases[part.kind] > 0) {
      row.append(actionButton(`Devolver ${part.name}`, 'small-action secondary-action', () =>
        dispatch({ type: 'RETURN_PURCHASE', kind: part.kind })));
    } else if (snapshot.game.ownedParts[part.kind] > basicInventory[part.kind]) {
      row.append(actionButton(`Vender ${part.name}`, 'small-action secondary-action', () =>
        dispatch({ type: 'SELL_PART', kind: part.kind })));
    }
    shop.append(row);
  }

  panel.append(shop,
    textElement('p', 'control-hint', 'Sólo necesitas un asiento para iniciar. Motor, ruedas, posición, conexión y masa determinan lo que ocurrirá en ruta.'),
    actionButton('Conservar sólo el asiento del conductor', 'small-action secondary-action', () =>
      dispatch({ type: 'CLEAR_OPTIONAL_PARTS' })));
  refreshSelection();
  return panel;
}

function partName(kind: PartKind): string {
  return PART_CATALOG.find((part) => part.kind === kind)?.name ?? kind;
}

function partIcon(kind: PartKind): string {
  const icons: Readonly<Record<PartKind, string>> = {
    chassis: 'CH', wheel: 'O', engine: 'M', seat: 'S', roofRack: 'T', rearCarrier: 'C', suspension: '~',
  };
  return icons[kind];
}

function workshopMessage(levelNumber: number | undefined): string {
  if (levelNumber === 3) return 'La ruta ofrece pasajeros y carga, pero tú decides qué capacidades construir y dónde ubicarlas.';
  if (levelNumber === 4) return 'Puedes intentar la pista sin suspensión; la posición y las conexiones decidirán cuánto resiste.';
  if (levelNumber === 5) return 'Hora punta combina todo, sin imponer una única construcción correcta.';
  return 'Sólo el asiento del conductor es obligatorio. Todo lo demás - incluidos motor y ruedas - queda a tu criterio.';
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
  panel.append(hud, textElement('p', 'control-hint',
    'Haz clic directamente en la persona junto a la pista. Al llegar a su parada bajará automáticamente y liberará el asiento.'));

  const requests = document.createElement('div');
  requests.className = 'request-list';
  for (const progress of snapshot.ride?.requests ?? []) {
    if (progress.request.kind === 'passenger') continue;
    const button = actionButton('', 'request-action', () =>
      dispatch({ type: 'COLLECT_REQUEST', requestId: progress.request.id }));
    button.dataset.requestId = progress.request.id;
    requests.append(button);
  }
  const delivery = actionButton('Entregar carga', 'small-action', () =>
    dispatch({ type: 'DELIVER_REQUEST' }));
  delivery.dataset.ui = 'deliver';
  panel.append(requests, delivery, statusMessage(snapshot.message), createDriveControls(dispatch),
    actionButton('Pausa', 'small-action secondary-action', () => dispatch({ type: 'PAUSE' })));
  return panel;
}

function createDriveControls(dispatch: (action: AppAction) => void): HTMLElement {
  const controls = document.createElement('div');
  controls.className = 'drive-controls';
  controls.setAttribute('aria-label', 'Controles de conducción');
  const holdButton = (label: string, className: string, start: () => void, stop: () => void): HTMLButtonElement => {
    const button = actionButton(label, `drive-control ${className}`, () => undefined);
    const begin = (event: Event): void => {
      event.preventDefault();
      if (button.classList.contains('is-active')) return;
      button.classList.add('is-active');
      start();
    };
    const end = (event: Event): void => {
      event.preventDefault();
      if (!button.classList.contains('is-active')) return;
      button.classList.remove('is-active');
      stop();
    };
    button.addEventListener('pointerdown', begin);
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('pointerleave', (event) => {
      if ((event as PointerEvent).buttons > 0) end(event);
    });
    button.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') begin(event);
    });
    button.addEventListener('keyup', (event) => {
      if (event.key === ' ' || event.key === 'Enter') end(event);
    });
    controls.addEventListener('contextmenu', (event) => event.preventDefault());
    return button;
  };
  controls.append(
    holdButton('Reversa', 'reverse-control',
      () => dispatch({ type: 'SET_THROTTLE', value: -1 }),
      () => dispatch({ type: 'SET_THROTTLE', value: 0 })),
    holdButton('Frenar', 'brake-control',
      () => dispatch({ type: 'SET_BRAKE', value: true }),
      () => dispatch({ type: 'SET_BRAKE', value: false })),
    holdButton('Acelerar', 'accelerate-control',
      () => dispatch({ type: 'SET_THROTTLE', value: 1 }),
      () => dispatch({ type: 'SET_THROTTLE', value: 0 })),
  );
  return controls;
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
  const onboardPassengers = ride.requests.filter((item) =>
    item.status === 'onboard' && item.request.kind === 'passenger').length;
  setUiText(screen, 'capacity', `${onboardPassengers} / ${snapshot.passengerCapacity}`);
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
    const onboard = ride.requests.find((item) =>
      item.status === 'onboard' && item.request.kind !== 'passenger');
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
    actionButton('Reiniciar intento', 'small-action secondary-action', () => {
      if (window.confirm('¿Reiniciar este intento desde el inicio?')) dispatch({ type: 'RESTART_RIDE' });
    }),
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
    definitionItem('Estabilidad', `${snapshot.ride?.stabilityPercent ?? 0} %`),
    definitionItem('Piezas perdidas', String(snapshot.ride?.lostPieces ?? 0)),
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
