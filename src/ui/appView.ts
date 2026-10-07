import type { AppAction, AppSnapshot } from '../app/appController';
import type { Disposable } from '../core/contracts';
import { LEVELS } from '../data/levels';
import { PART_CATALOG, type PartKind } from '../data/parts';
import {
  BUILD_GRID_COLUMNS,
  BUILD_GRID_ROWS,
  PART_FOOTPRINTS,
  gridBuildStats,
  gridForModel,
  gridPlacementFits,
  gridVehicleCapacity,
  securedGridPlacements,
  validateGridBuild,
  type GridPlacement,
} from '../game/model';
import { STOP_RADIUS_METERS } from '../game/rideSession';

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
  const homeButton = actionButton('Menú', 'topbar-home', () => {
    const activeState = root.dataset.appState;
    if ((activeState === 'PLAYING' || activeState === 'PAUSED') &&
      !window.confirm('¿Salir de este recorrido?')) return;
    dispatch({ type: 'GO_MENU' });
  });
  header.append(
    textElement('span', 'brand-mark', 'TTC'),
    textElement('span', 'brand-name', 'Tunea Tu Combi'),
    routeBadge,
    homeButton,
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
  const workshopUi: WorkshopUiState = { selectedPart: null, dismissedGoals: new Set<string>() };
  return {
    canvas,
    render(snapshot): void {
      const stateChanged = snapshot.state !== visibleState;
      root.dataset.appState = snapshot.state;
      root.dataset.reducedMotion = String(snapshot.reducedMotion);
      routeBadge.textContent = LEVELS.find((level) => level.id === snapshot.selectedLevelId)?.name.toUpperCase()
        ?? 'CAMPAÑA DE LIMA';
      debugButton.textContent = 'Física';
      debugButton.setAttribute('aria-label', snapshot.debugEnabled ? 'Depuración: sí' : 'Depuración: no');
      debugButton.setAttribute('aria-pressed', String(snapshot.debugEnabled));
      homeButton.hidden = snapshot.state === 'MENU' || snapshot.state === 'BOOT';
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
  readonly dismissedGoals: Set<string>;
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
    textElement('h1', 'hero-title', 'Tu ruta. Tu máquina.'),
    textElement('p', 'hero-copy', 'Arma. Maneja. Cobra.'),
  );
  const play = actionButton('Jugar', 'primary-action', () => dispatch({ type: 'OPEN_LEVEL_SELECT' }));
  play.setAttribute('aria-label', 'Empezar recorrido');
  panel.append(play,
    textElement('p', 'phase-note', `Ruta ${snapshot.game.unlockedLevel}`));
  const reset = actionButton('Borrar progreso', 'text-action', () => {
    if (window.confirm('¿Borrar todo el progreso guardado?')) dispatch({ type: 'RESET_PROGRESS' });
  });
  reset.classList.add('reset-action');
  const demo = actionButton('Demo', 'text-action', () => {
    if (window.confirm('¿Reemplazar el progreso actual por un perfil de demostración?')) {
      dispatch({ type: 'LOAD_DEMO_PROFILE' });
    }
  });
  demo.setAttribute('aria-label', 'Cargar perfil de demostración');
  const motion = actionButton(`Movimiento ${snapshot.reducedMotion ? 'suave' : 'normal'}`,
    'text-action settings-action', () => dispatch({ type: 'TOGGLE_REDUCED_MOTION' }));
  motion.setAttribute('aria-label', `Movimiento reducido: ${snapshot.reducedMotion ? 'sí' : 'no'}`);
  panel.append(
    motion,
    demo,
    reset,
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
    textElement('h1', 'section-title', 'Elige ruta'),
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
      textElement('span', 'level-quota', `S/ ${level.quota}`),
      textElement('span', 'level-best', best ? `Récord S/ ${best.bestRevenue}` : ''),
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
  const buildIssue = validateGridBuild(grid);
  const panel = panelElement('workshop-panel');
  const goalsPopup = document.createElement('section');
  const toolbar = document.createElement('section');
  toolbar.className = 'workshop-toolbar';
  const titleBlock = document.createElement('div');
  titleBlock.className = 'workshop-title-block';
  titleBlock.append(
    actionButton('Rutas', 'workshop-back', () => dispatch({ type: 'BACK' })),
    textElement('h1', 'workshop-title', 'Arma tu combi'),
    textElement('span', 'workshop-route', level?.name ?? 'Taller'),
  );
  const quickStats = document.createElement('dl');
  quickStats.className = 'workshop-quick-stats';
  quickStats.append(
    definitionItem('Presupuesto', `S/ ${snapshot.game.wallet}`),
    definitionItem('Meta', `S/ ${level?.quota ?? 25}`),
    definitionItem('Asientos', String(capacity.passenger)),
    definitionItem('Peso', `${stats.massKg} kg`),
  );
  const goalsButton = actionButton('Metas', 'workshop-goals-button', () => {
    goalsPopup.hidden = false;
  });
  const startButton = actionButton('A rodar', 'primary-action launch-action', () =>
    dispatch({ type: 'START_RIDE' }));
  startButton.setAttribute('aria-label', 'Iniciar recorrido de 60 segundos');
  startButton.disabled = Boolean(buildIssue);
  toolbar.append(titleBlock, quickStats, goalsButton, startButton);
  panel.append(toolbar);

  goalsPopup.className = 'game-popup goals-popup';
  goalsPopup.hidden = !level || workshopUi.dismissedGoals.has(level.id);
  goalsPopup.setAttribute('role', 'dialog');
  goalsPopup.setAttribute('aria-modal', 'true');
  goalsPopup.setAttribute('aria-label', 'Metas de estrellas');
  const goalsCard = document.createElement('div');
  goalsCard.className = 'game-popup-card';
  goalsCard.append(textElement('h2', 'popup-title', 'Tu misión'));
  const goals = document.createElement('div');
  goals.className = 'star-goals';
  for (const [index, goal] of (level?.starGoals ?? [0, 0, 0]).entries()) {
    const item = document.createElement('div');
    item.append(
      textElement('span', 'goal-star', String(index + 1)),
      textElement('strong', 'goal-value', `S/ ${goal}`),
    );
    goals.append(item);
  }
  const closeGoals = actionButton('Listo', 'primary-action popup-action', () => {
    if (level) workshopUi.dismissedGoals.add(level.id);
    goalsPopup.hidden = true;
  });
  goalsCard.append(goals,
    textElement('p', 'popup-note', '3 estrellas abren la siguiente ruta.'), closeGoals);
  goalsPopup.append(goalsCard);
  panel.append(goalsPopup);

  const buildStatus = statusMessage(buildIssue ?? snapshot.message);
  buildStatus.classList.add('build-status');
  buildStatus.dataset.tone = buildIssue ? 'warning' : 'ready';
  panel.append(buildStatus);

  const builder = document.createElement('div');
  builder.className = 'workshop-builder';
  const vehicleSection = document.createElement('section');
  vehicleSection.className = 'vehicle-builder';
  vehicleSection.append(
    textElement('p', 'builder-kicker', '10 x 6'),
    textElement('h2', 'builder-title', 'Arrastra y arma'),
  );
  const selectionMessage = textElement('p', 'selection-message', 'Elige una pieza');
  selectionMessage.setAttribute('aria-live', 'polite');
  const constructionGrid = document.createElement('div');
  constructionGrid.className = 'construction-grid';
  constructionGrid.setAttribute('aria-label', 'Cuadrícula libre de construcción de la combi');
  const dragPreview = document.createElement('div');
  dragPreview.className = 'grid-drag-preview';
  dragPreview.hidden = true;
  dragPreview.setAttribute('aria-hidden', 'true');
  let dragging: { readonly kind: PartKind; readonly placementId?: string } | null = null;

  const combiShell = document.createElement('div');
  combiShell.className = 'builder-combi-shell';
  combiShell.setAttribute('aria-hidden', 'true');
  combiShell.append(
    textElement('span', 'builder-window builder-window-rear', ''),
    textElement('span', 'builder-window builder-window-front', ''),
    textElement('span', 'builder-chassis-rail', ''),
  );
  constructionGrid.append(combiShell);

  const placedCounts: Partial<Record<PartKind, number>> = {};
  for (const placement of grid) placedCounts[placement.kind] = (placedCounts[placement.kind] ?? 0) + 1;
  const freeCount = (kind: PartKind): number => snapshot.game.ownedParts[kind] - (placedCounts[kind] ?? 0);
  const cellButtons: HTMLButtonElement[] = [];
  const inventoryButtons: HTMLButtonElement[] = [];
  const candidateAt = (kind: PartKind, column: number, row: number): GridPlacement => ({
    id: 'preview', kind, column, row,
  });
  const hideDragPreview = (): void => {
    dragPreview.hidden = true;
    dragPreview.classList.remove('is-valid', 'is-invalid');
  };
  const showDragPreview = (column: number, row: number): void => {
    if (!dragging) return;
    const footprint = PART_FOOTPRINTS[dragging.kind];
    const candidate: GridPlacement = {
      id: dragging.placementId ?? 'preview',
      kind: dragging.kind,
      column,
      row,
    };
    const fits = gridPlacementFits(candidate, grid);
    dragPreview.hidden = false;
    dragPreview.style.gridColumn = `${column + 1} / span ${footprint.columns}`;
    dragPreview.style.gridRow = `${row + 1} / span ${footprint.rows}`;
    dragPreview.classList.toggle('is-valid', fits);
    dragPreview.classList.toggle('is-invalid', !fits);
    dragPreview.textContent = partName(dragging.kind);
  };
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
      ? `${partName(selected)}: elige un espacio`
      : 'Elige una pieza');
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
      cell.addEventListener('dragover', (event) => {
        event.preventDefault();
        showDragPreview(column, row);
      });
      cell.addEventListener('drop', (event) => {
        event.preventDefault();
        hideDragPreview();
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
      textElement('span', 'grid-piece-name', shortPartName(placement.kind)),
      textElement('span', 'grid-piece-state', secured ? 'CONECTADA' : 'SUELTA'),
    );
    button.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      showDragPreview(placement.column, placement.row);
    });
    button.addEventListener('drop', (event) => {
      event.preventDefault();
      hideDragPreview();
      if (!dragging) return;
      if (dragging.placementId) moveTo(dragging.placementId, placement.column, placement.row);
      else placeAt(dragging.kind, placement.column, placement.row);
    });
    button.addEventListener('dragstart', (event) => {
      button.classList.add('is-dragging');
      dragging = { kind: placement.kind, placementId: placement.id };
      event.dataTransfer?.setData('application/x-tunea-placement', placement.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    button.addEventListener('dragend', () => {
      button.classList.remove('is-dragging');
      dragging = null;
      hideDragPreview();
    });
    constructionGrid.append(button);
  }
  constructionGrid.append(dragPreview);
  constructionGrid.addEventListener('dragleave', (event) => {
    const destination = event.relatedTarget;
    if (!(destination instanceof Node) || !constructionGrid.contains(destination)) hideDragPreview();
  });
  vehicleSection.append(selectionMessage, constructionGrid,
    textElement('p', 'grid-legend', 'FIJA    SUELTA'));

  const inventory = document.createElement('section');
  inventory.className = 'parts-tray';
  inventory.append(
    textElement('p', 'builder-kicker', 'PIEZAS'),
    textElement('h2', 'builder-title', 'Tu caja'),
  );
  const trayGrid = document.createElement('div');
  trayGrid.className = 'parts-tray-grid';
  for (const part of PART_CATALOG.filter((item) => item.kind !== 'chassis')) {
    const available = freeCount(part.kind);
    const button = actionButton('', 'part-card', () => {
      if (available < 1) {
        if (snapshot.game.wallet < part.price) {
          refreshSelection('Presupuesto insuficiente.');
          return;
        }
        workshopUi.selectedPart = part.kind;
        dispatch({ type: 'BUY_PART', kind: part.kind });
        return;
      }
      workshopUi.selectedPart = workshopUi.selectedPart === part.kind ? null : part.kind;
      refreshSelection();
    });
    button.dataset.partKind = part.kind;
    button.disabled = available < 1 && snapshot.game.wallet < part.price;
    button.draggable = available > 0;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', available > 0
      ? `Seleccionar ${part.name}, ${available} libre${available === 1 ? '' : 's'}`
      : `Comprar ${part.name} por S/ ${part.price}`);
    button.append(
      textElement('span', 'part-card-icon', partIcon(part.kind)),
      textElement('strong', 'part-card-name', shortPartName(part.kind)),
      textElement('span', `part-card-count ${available > 0 ? '' : 'is-price'}`,
        available > 0 ? `x${available}` : `S/ ${part.price}`),
    );
    button.addEventListener('dragstart', (event) => {
      button.classList.add('is-dragging');
      dragging = { kind: part.kind };
      event.dataTransfer?.setData('application/x-tunea-part', part.kind);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
      workshopUi.selectedPart = part.kind;
      refreshSelection();
    });
    button.addEventListener('dragend', () => {
      button.classList.remove('is-dragging');
      dragging = null;
      hideDragPreview();
    });
    inventoryButtons.push(button);
    trayGrid.append(button);
  }
  inventory.append(trayGrid);
  builder.append(vehicleSection, inventory);
  panel.append(builder);

  const clearButton = actionButton('Desarmar', 'small-action secondary-action clear-build', () =>
    dispatch({ type: 'CLEAR_OPTIONAL_PARTS' }));
  clearButton.setAttribute('aria-label', 'Conservar sólo el asiento del conductor');
  panel.append(clearButton);
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

function shortPartName(kind: PartKind): string {
  const names: Readonly<Record<PartKind, string>> = {
    chassis: 'Chasis', wheel: 'Rueda', engine: 'Motor', seat: 'Asiento',
    roofRack: 'Parrilla', rearCarrier: 'Carga', suspension: 'Suspensión',
  };
  return names[kind];
}

function createPlayingScreen(snapshot: AppSnapshot, dispatch: (action: AppAction) => void): HTMLElement {
  const panel = panelElement('playing-panel');
  panel.append(textElement('h1', 'visually-hidden', 'En ruta'));
  const hud = document.createElement('div');
  hud.className = 'ride-hud';
  const time = textElement('strong', 'ride-time-value', '');
  time.dataset.ui = 'time';
  const timeCard = document.createElement('div');
  timeCard.className = 'ride-time-card';
  timeCard.append(time, textElement('span', 'ride-time-label', 'TIEMPO'));
  const revenue = textElement('strong', 'ride-money-value', '');
  revenue.dataset.ui = 'revenue';
  const quota = textElement('span', 'ride-money-goal', '');
  quota.dataset.ui = 'quota';
  const moneyCard = document.createElement('div');
  moneyCard.className = 'ride-money-card';
  moneyCard.append(revenue, quota);
  const capacity = textElement('strong', 'ride-capacity-value', '');
  capacity.dataset.ui = 'capacity';
  const capacityCard = document.createElement('div');
  capacityCard.className = 'ride-capacity-card';
  capacityCard.append(textElement('span', 'ride-person-icon', ''), capacity);
  const speed = textElement('strong', 'ride-speed-value', '');
  speed.dataset.ui = 'speed';
  const speedCard = document.createElement('div');
  speedCard.className = 'ride-speed-card';
  speedCard.append(speed);
  const engine = textElement('strong', 'ride-engine-value', '');
  engine.dataset.ui = 'engine';
  const engineCard = document.createElement('div');
  engineCard.className = 'ride-engine-card';
  engineCard.append(textElement('span', 'ride-engine-icon', 'M'), engine);
  const position = textElement('span', 'visually-hidden', '');
  position.dataset.ui = 'position';
  hud.append(timeCard, moneyCard, capacityCard, speedCard, engineCard, position);
  const engineLoad = document.createElement('div');
  engineLoad.className = 'engine-load-meter';
  engineLoad.dataset.ui = 'engine-load';
  engineLoad.setAttribute('role', 'meter');
  engineLoad.setAttribute('aria-label', 'Esfuerzo del motor');
  engineLoad.setAttribute('aria-valuemin', '0');
  engineLoad.setAttribute('aria-valuemax', '100');
  engineLoad.append(
    textElement('span', 'engine-load-fill', ''),
    textElement('strong', 'engine-load-icon', 'M'),
  );
  panel.append(hud, engineLoad);

  const delivery = actionButton('Entregar carga', 'small-action', () =>
    dispatch({ type: 'DELIVER_REQUEST' }));
  delivery.dataset.ui = 'deliver';
  const pause = actionButton('II', 'ride-pause', () => dispatch({ type: 'PAUSE' }));
  pause.setAttribute('aria-label', 'Pausa');
  const message = statusMessage(snapshot.message);
  message.classList.add('ride-toast');
  panel.append(delivery, message, createDriveControls(dispatch), pause);
  return panel;
}

function createDriveControls(dispatch: (action: AppAction) => void): HTMLElement {
  const controls = document.createElement('div');
  controls.className = 'drive-controls';
  controls.setAttribute('aria-label', 'Controles de conducción');
  const holdButton = (label: string, className: string, start: () => void, stop: () => void): HTMLButtonElement => {
    const visibleLabel = label === 'Reversa' ? 'A' : label === 'Acelerar' ? 'D' : 'STOP';
    const button = actionButton(visibleLabel, `drive-control ${className}`, () => undefined);
    button.setAttribute('aria-label', label);
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
  setUiText(screen, 'engine', `${snapshot.engineHealthPercent} %`);
  const engineLoad = screen.querySelector<HTMLElement>('[data-ui="engine-load"]');
  if (engineLoad) {
    engineLoad.style.setProperty('--engine-load', `${snapshot.engineLoadPercent}%`);
    engineLoad.classList.toggle('is-maxed', snapshot.engineLoadPercent >= 100);
    engineLoad.setAttribute('aria-valuenow', String(snapshot.engineLoadPercent));
  }
  const onboardPassengers = ride.requests.filter((item) => item.status === 'onboard').length;
  setUiText(screen, 'capacity', `${onboardPassengers} / ${snapshot.passengerCapacity}`);
  const timeCard = screen.querySelector<HTMLElement>('.ride-time-card');
  if (timeCard) {
    const progress = Math.max(0, Math.min(1, ride.remainingSeconds / (level?.durationSeconds ?? 60)));
    timeCard.style.setProperty('--time-progress', `${progress * 360}deg`);
    timeCard.classList.toggle('is-urgent', ride.remainingSeconds <= 10);
  }
  const message = screen.querySelector<HTMLElement>('[role="status"]');
  if (message) message.textContent = snapshot.message;
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
    actionButton('Menú', 'text-action', () => dispatch({ type: 'GO_MENU' })),
  );
  return panel;
}

function createResultsScreen(snapshot: AppSnapshot, dispatch: (action: AppAction) => void): HTMLElement {
  const level = LEVELS.find((candidate) => candidate.id === snapshot.selectedLevelId);
  const panel = panelElement('results-panel');
  panel.append(
    textElement('p', 'eyebrow', 'Resultado del turno'),
    textElement('h1', 'section-title', snapshot.won ? 'Ruta completa' : 'Por poco'),
    textElement('p', 'hero-copy', snapshot.message),
  );
  const stars = document.createElement('div');
  stars.className = 'result-stars';
  stars.setAttribute('aria-label', `${snapshot.stars ?? 0} de 3 estrellas`);
  for (let index = 1; index <= 3; index += 1) {
    stars.append(textElement('span',
      `result-star ${index <= (snapshot.stars ?? 0) ? 'is-earned' : ''}`, String(index)));
  }
  const summary = document.createElement('dl');
  summary.className = 'workshop-summary';
  summary.append(
    definitionItem('Entregado', `S/ ${snapshot.ride?.deliveredRevenue ?? 0}`),
    definitionItem('Cuota', `S/ ${level?.quota ?? 0}`),
    definitionItem('Solicitudes', String(snapshot.ride?.deliveredCount ?? 0)),
    definitionItem('Masa máxima', `${snapshot.ride?.maximumPayloadMassKg ?? 0} kg`),
    definitionItem('Estabilidad', `${snapshot.ride?.stabilityPercent ?? 0} %`),
    definitionItem('Piezas sueltas', String(snapshot.ride?.lostPieces ?? 0)),
  );
  panel.append(stars, summary,
    textElement('p', 'phase-note', `Semilla: ${snapshot.ride?.seed ?? 'sin intento'}`),
    actionButton('Volver al taller', 'primary-action', () => dispatch({ type: 'RETRY' })),
    actionButton('Elegir nivel', 'text-action', () => dispatch({ type: 'BACK' })),
    actionButton('Menú', 'text-action', () => dispatch({ type: 'GO_MENU' })));
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
