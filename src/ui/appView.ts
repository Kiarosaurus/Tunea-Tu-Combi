import type { AppAction, AppSnapshot } from '../app/appController';
import moneyRewardUrl from '../assets/money-reward.png';
import type { Disposable } from '../core/contracts';
import { LEVELS } from '../data/levels';
import { PART_CATALOG, type PartKind } from '../data/parts';
import {
  BUILD_GRID_COLUMNS,
  BUILD_GRID_ROWS,
  DRIVER_SEAT_ID,
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
import { hasReachedDestination, STOP_RADIUS_METERS } from '../game/rideSession';
import {
  dragAnchorFromElement,
  gridTargetFromPointer,
  type GridCellTarget,
  type GridDragAnchor,
} from './gridPointer';

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

  const explosion = document.createElement('div');
  explosion.className = 'explosion-layer';
  explosion.setAttribute('aria-hidden', 'true');

  const engineWarning = document.createElement('div');
  engineWarning.className = 'engine-overload-warning';
  engineWarning.setAttribute('aria-hidden', 'true');

  const header = document.createElement('header');
  header.className = 'topbar';
  const routeBadge = textElement('span', 'prototype-badge', 'PRIMER RECORRIDO');
  const homeButton = actionButton('Menú', 'topbar-home', () => {
    const activeState = root.dataset.appState;
    if ((activeState === 'PLAYING' || activeState === 'PAUSED') &&
      !window.confirm('¿Salir de este recorrido?')) return;
    dispatch({ type: 'GO_MENU' });
  });
  header.append(routeBadge, homeButton);
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
  root.replaceChildren(canvas, shade, engineWarning, explosion, header, screen, footer);

  let visibleState = '';
  let menuIntroShown = false;
  const workshopUi: WorkshopUiState = { selectedPart: null };
  return {
    canvas,
    render(snapshot): void {
      const stateChanged = snapshot.state !== visibleState;
      root.dataset.appState = snapshot.state;
      root.dataset.reducedMotion = String(snapshot.reducedMotion);
      explosion.classList.toggle('is-active', snapshot.engineExploded);
      explosion.classList.toggle('is-settled', snapshot.engineExploded && snapshot.state === 'RESULTS');
      engineWarning.classList.toggle('is-active', snapshot.state === 'PLAYING' &&
        snapshot.engineLoadPercent >= 100 && !snapshot.engineExploded);
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
      const animateMenuIntro = snapshot.state === 'MENU' && !menuIntroShown;
      screen.replaceChildren(createScreen(snapshot, dispatch, workshopUi, animateMenuIntro));
      if (snapshot.state === 'MENU') menuIntroShown = true;
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
  workshopUi: WorkshopUiState, animateMenuIntro: boolean): HTMLElement {
  switch (snapshot.state) {
    case 'BOOT': return createBootScreen();
    case 'MENU': return createMenuScreen(snapshot, dispatch, animateMenuIntro);
    case 'LEVEL_SELECT': return createLevelSelectScreen(snapshot, dispatch);
    case 'WORKSHOP': return createWorkshopScreen(snapshot, dispatch, workshopUi);
    case 'PLAYING': return createPlayingScreen(snapshot, dispatch);
    case 'PAUSED': return createPausedScreen(snapshot, dispatch);
    case 'RESULTS': return createResultsScreen(snapshot, dispatch);
  }
}

function createBootScreen(): HTMLElement {
  const panel = panelElement('boot-panel');
  const loader = document.createElement('div');
  loader.className = 'boot-loader';
  loader.setAttribute('aria-hidden', 'true');
  loader.append(
    textElement('span', 'boot-wheel boot-wheel-left', ''),
    textElement('span', 'boot-combi', 'TTC'),
    textElement('span', 'boot-wheel boot-wheel-right', ''),
  );
  panel.append(
    textElement('p', 'eyebrow', 'Arrancando motores'),
    textElement('h1', 'hero-title', 'Tunea Tu Combi'),
    loader,
    textElement('p', 'hero-copy', 'Preparando tu combi...'),
  );
  return panel;
}

function createMenuScreen(snapshot: AppSnapshot, dispatch: (action: AppAction) => void,
  animateIntro: boolean): HTMLElement {
  const panel = panelElement('menu-panel');
  const title = document.createElement('h1');
  title.className = 'hero-title menu-game-title';
  title.setAttribute('aria-label', 'Tunea Tu Combi');
  title.append(
    textElement('span', 'menu-title-word menu-title-tunea', 'Tunea'),
    textElement('span', 'menu-title-word menu-title-tu', 'Tu'),
    textElement('span', 'menu-title-word menu-title-combi', 'Combi'),
  );
  title.classList.toggle('is-entering', animateIntro);
  panel.append(
    title,
    textElement('p', 'hero-copy', 'Arma. Maneja. Cobra.'),
  );
  const play = actionButton('Jugar ahora', 'primary-action menu-play-action', () =>
    dispatch({ type: 'OPEN_LEVEL_SELECT' }));
  play.setAttribute('aria-label', 'Empezar recorrido');
  const physics = actionButton(snapshot.debugEnabled ? 'Ocultar físicas' : 'Mostrar físicas',
    'secondary-action menu-physics-action', () => dispatch({ type: 'TOGGLE_DEBUG' }));
  physics.setAttribute('aria-pressed', String(snapshot.debugEnabled));
  physics.setAttribute('aria-label', snapshot.debugEnabled ? 'Ocultar físicas' : 'Mostrar físicas');
  const reset = actionButton('Borrar progreso', 'text-action', () => {
    if (window.confirm('¿Borrar todo el progreso guardado?')) dispatch({ type: 'RESET_PROGRESS' });
  });
  reset.classList.add('reset-action');
  const actions = document.createElement('div');
  actions.className = 'menu-actions';
  actions.append(play, physics, reset);
  panel.append(actions);
  if (snapshot.message) panel.append(statusMessage(snapshot.message));
  return panel;
}

function createLevelSelectScreen(snapshot: AppSnapshot, dispatch: (action: AppAction) => void): HTMLElement {
  const wrapper = panelElement('level-panel');
  const heading = document.createElement('div');
  heading.className = 'section-heading';
  heading.append(
    actionButton('Menú', 'secondary-action compact-action', () => dispatch({ type: 'BACK' })),
    textElement('h1', 'section-title', '¿Qué ruta sale?'),
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
    const bestStars = best?.bestStars ?? 0;
    card.setAttribute('aria-label', `${level.name}, ${bestStars} de 3 estrellas, meta S/ ${level.starGoals[2]}`);
    card.append(
      textElement('span', 'level-number', String(level.number).padStart(2, '0')),
      textElement('strong', 'level-name', level.name),
      textElement('span', 'level-challenge', level.challenge),
      textElement('span', 'level-quota', `3 estrellas: S/ ${level.starGoals[2]}`),
      textElement('span', 'level-stars', `Progreso ${bestStars}/3`),
      textElement('span', 'level-status', !isUnlocked ? 'Bloqueada' : bestStars === 3 ? 'Dominada' : 'Disponible'),
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
    textElement('h1', 'workshop-title', 'Métele mano'),
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
  const restoreButton = actionButton(snapshot.game.lastRideBuild
    ? 'Recuperar combi' : 'Sin arreglo previo', 'workshop-restore-button', () =>
    dispatch({ type: 'RESTORE_LAST_BUILD' }));
  restoreButton.disabled = !snapshot.game.lastRideBuild;
  restoreButton.setAttribute('aria-label', snapshot.game.lastRideBuild
    ? 'Recuperar el arreglo del último nivel jugado'
    : 'No hay un arreglo anterior para recuperar');
  const startButton = actionButton('A rodar', 'primary-action launch-action', () =>
    dispatch({ type: 'START_RIDE' }));
  startButton.setAttribute('aria-label', 'Iniciar recorrido de 60 segundos');
  startButton.disabled = Boolean(buildIssue);
  toolbar.append(titleBlock, quickStats, restoreButton, goalsButton, startButton);
  panel.append(toolbar);

  goalsPopup.className = 'game-popup goals-popup';
  goalsPopup.hidden = true;
  goalsPopup.setAttribute('role', 'dialog');
  goalsPopup.setAttribute('aria-modal', 'true');
  goalsPopup.setAttribute('aria-label', 'Metas de estrellas');
  const goalsCard = document.createElement('div');
  goalsCard.className = 'game-popup-card';
  goalsCard.append(textElement('h2', 'popup-title', 'La chamba de hoy'));
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
  const closeGoals = actionButton('Volver al taller', 'primary-action popup-action', () => {
    goalsPopup.hidden = true;
  });
  goalsCard.append(goals,
    textElement('p', 'popup-note', 'Hazla linda: 3 estrellas y se abre otra ruta.'), closeGoals);
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
  const showDragPreview = (column: number, row: number): boolean => {
    if (!dragging) return false;
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
    return fits;
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

  interface PointerDragSession {
    readonly pointerId: number;
    readonly source: HTMLButtonElement;
    readonly kind: PartKind;
    readonly placementId?: string;
    readonly anchor: GridDragAnchor;
    readonly startX: number;
    readonly startY: number;
    latestX: number;
    latestY: number;
    active: boolean;
    frame: number | null;
    ghost: HTMLDivElement | null;
    target: GridCellTarget | null;
    targetFits: boolean;
  }

  const suppressedClicks = new WeakSet<HTMLButtonElement>();
  let pointerDrag: PointerDragSession | null = null;
  const readGridGeometry = () => {
    const first = cellButtons[0]?.getBoundingClientRect();
    const secondColumn = cellButtons[1]?.getBoundingClientRect();
    const secondRow = cellButtons[BUILD_GRID_COLUMNS]?.getBoundingClientRect();
    if (!first || !secondColumn || !secondRow) return null;
    const columnStep = secondColumn.left - first.left;
    const rowStep = secondRow.top - first.top;
    if (columnStep <= 0 || rowStep <= 0) return null;
    return {
      originX: first.left,
      originY: first.top,
      columnStep,
      rowStep,
      cellWidth: first.width,
      cellHeight: first.height,
    };
  };
  const updatePointerDrag = (): void => {
    const session = pointerDrag;
    if (!session?.active) return;
    session.frame = null;
    const geometry = readGridGeometry();
    if (!geometry) return;
    const footprint = PART_FOOTPRINTS[session.kind];
    if (!session.ghost) {
      const ghost = document.createElement('div');
      ghost.className = `pointer-drag-ghost piece-${session.kind}`;
      ghost.textContent = shortPartName(session.kind);
      ghost.style.width = `${footprint.columns * geometry.cellWidth +
        (footprint.columns - 1) * (geometry.columnStep - geometry.cellWidth)}px`;
      ghost.style.height = `${footprint.rows * geometry.cellHeight +
        (footprint.rows - 1) * (geometry.rowStep - geometry.cellHeight)}px`;
      document.body.append(ghost);
      session.ghost = ghost;
    }
    session.ghost.style.transform = `translate3d(${session.latestX -
      session.anchor.columnOffset * geometry.columnStep}px, ${session.latestY -
      session.anchor.rowOffset * geometry.rowStep}px, 0)`;
    const bounds = constructionGrid.getBoundingClientRect();
    const inside = session.latestX >= bounds.left && session.latestX <= bounds.right &&
      session.latestY >= bounds.top && session.latestY <= bounds.bottom;
    const target = inside
      ? gridTargetFromPointer(session.latestX, session.latestY, geometry, session.anchor)
      : null;
    const withinGrid = target !== null && target.column >= 0 && target.row >= 0 &&
      target.column + footprint.columns <= BUILD_GRID_COLUMNS &&
      target.row + footprint.rows <= BUILD_GRID_ROWS;
    session.target = withinGrid ? target : null;
    session.targetFits = Boolean(session.target && showDragPreview(session.target.column, session.target.row));
    if (!session.target) hideDragPreview();
    session.ghost.classList.toggle('is-valid', session.targetFits);
    session.ghost.classList.toggle('is-invalid', !session.targetFits);
  };
  const schedulePointerDrag = (): void => {
    if (!pointerDrag || pointerDrag.frame !== null) return;
    pointerDrag.frame = requestAnimationFrame(updatePointerDrag);
  };
  const clearPointerDrag = (): void => {
    const session = pointerDrag;
    if (!session) return;
    if (session.frame !== null) cancelAnimationFrame(session.frame);
    session.source.classList.remove('is-dragging');
    session.ghost?.remove();
    hideDragPreview();
    dragging = null;
    pointerDrag = null;
  };
  const finishPointerDrag = (pointerId: number, commit: boolean): void => {
    const session = pointerDrag;
    if (!session || session.pointerId !== pointerId) return;
    if (session.active) {
      if (session.frame !== null) cancelAnimationFrame(session.frame);
      updatePointerDrag();
      suppressedClicks.add(session.source);
    }
    const target = session.target;
    const fits = session.targetFits;
    const descriptor = { kind: session.kind, placementId: session.placementId };
    clearPointerDrag();
    if (!commit || !session.active) return;
    if (!target || !fits) {
      refreshSelection(`${partName(descriptor.kind)} no cabe ahí o está fuera de la combi.`);
      return;
    }
    if (descriptor.placementId) moveTo(descriptor.placementId, target.column, target.row);
    else placeAt(descriptor.kind, target.column, target.row);
  };
  const attachPointerDrag = (source: HTMLButtonElement, kind: PartKind,
    placementId?: string): void => {
    source.draggable = false;
    source.addEventListener('click', (event) => {
      if (!suppressedClicks.delete(source)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true });
    source.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const geometry = readGridGeometry();
      if (!geometry) return;
      const footprint = PART_FOOTPRINTS[kind];
      const sourceRect = source.getBoundingClientRect();
      const anchor = placementId
        ? dragAnchorFromElement(event.clientX, event.clientY, sourceRect.left, sourceRect.top,
          geometry.columnStep, geometry.rowStep)
        : { columnOffset: footprint.columns / 2, rowOffset: footprint.rows / 2 };
      clearPointerDrag();
      dragging = placementId ? { kind, placementId } : { kind };
      pointerDrag = {
        pointerId: event.pointerId,
        source,
        kind,
        ...(placementId ? { placementId } : {}),
        anchor,
        startX: event.clientX,
        startY: event.clientY,
        latestX: event.clientX,
        latestY: event.clientY,
        active: false,
        frame: null,
        ghost: null,
        target: null,
        targetFits: false,
      };
      source.setPointerCapture(event.pointerId);
    });
    source.addEventListener('pointermove', (event) => {
      const session = pointerDrag;
      if (!session || session.pointerId !== event.pointerId || session.source !== source) return;
      session.latestX = event.clientX;
      session.latestY = event.clientY;
      if (!session.active && Math.hypot(event.clientX - session.startX,
        event.clientY - session.startY) >= 3) {
        session.active = true;
        source.classList.add('is-dragging');
      }
      if (session.active) {
        event.preventDefault();
        schedulePointerDrag();
      }
    });
    source.addEventListener('pointerup', (event) => finishPointerDrag(event.pointerId, true));
    source.addEventListener('pointercancel', (event) => finishPointerDrag(event.pointerId, false));
    source.addEventListener('lostpointercapture', (event) => finishPointerDrag(event.pointerId, false));
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
      cellButtons.push(cell);
      constructionGrid.append(cell);
    }
  }

  for (const placement of grid) {
    const footprint = PART_FOOTPRINTS[placement.kind];
    const secured = securedIds.has(placement.id);
    const isDriverSeat = placement.id === DRIVER_SEAT_ID;
    const button = actionButton('', `grid-piece piece-${placement.kind} ${secured ? 'is-secured' : 'is-loose'} ${isDriverSeat ? 'is-driver-seat' : ''}`, () => {
      if (isDriverSeat) {
        refreshSelection('El asiento del conductor es fijo: arrástralo para moverlo.');
        return;
      }
      workshopUi.selectedPart = placement.kind;
      dispatch({ type: 'REMOVE_GRID_PART', placementId: placement.id });
    });
    button.style.gridColumn = `${placement.column + 1} / span ${footprint.columns}`;
    button.style.gridRow = `${placement.row + 1} / span ${footprint.rows}`;
    button.setAttribute('aria-label', isDriverSeat
      ? `Mover asiento del conductor de columna ${placement.column + 1}, fila ${placement.row + 1}`
      : `Retirar ${partName(placement.kind)} de columna ${placement.column + 1}, fila ${placement.row + 1}`);
    button.title = isDriverSeat ? 'Conductor: se puede mover, no guardar'
      : secured ? 'Conectada al chasis' : 'Suelta: se caerá al iniciar';
    button.append(
      partIconElement(placement.kind, 'grid-piece-icon'),
      ...(isDriverSeat ? [textElement('span', 'grid-driver-person', '')] : []),
      textElement('span', 'grid-piece-name', shortPartName(placement.kind)),
      textElement('span', 'grid-piece-state', isDriverSeat ? 'CONDUCTOR' : secured ? 'CONECTADA' : 'SUELTA'),
    );
    attachPointerDrag(button, placement.kind, placement.id);
    constructionGrid.append(button);
  }
  constructionGrid.append(dragPreview);
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
  const baseInventory = createInitialGameModel().ownedParts;
  for (const part of PART_CATALOG.filter((item) => item.kind !== 'chassis')) {
    const available = freeCount(part.kind);
    const canRefund = available > 0 && snapshot.game.ownedParts[part.kind] > baseInventory[part.kind];
    const card = document.createElement('div');
    card.className = 'part-card-wrap';
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
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', available > 0
      ? `Seleccionar ${part.name}, ${available} libre${available === 1 ? '' : 's'}`
      : `Comprar ${part.name} por S/ ${part.price}`);
    button.append(
      partIconElement(part.kind, 'part-card-icon'),
      textElement('strong', 'part-card-name', shortPartName(part.kind)),
      textElement('span', `part-card-count ${available > 0 ? '' : 'is-price'}`,
        available > 0 ? `x${available}` : `S/ ${part.price}`),
    );
    if (available > 0) attachPointerDrag(button, part.kind);
    inventoryButtons.push(button);
    card.append(button);
    if (canRefund) {
      const refund = actionButton(`Reembolsar S/ ${part.price}`, 'part-refund-action', () => {
        workshopUi.selectedPart = null;
        dispatch({ type: 'REFUND_PART', kind: part.kind });
      });
      refund.setAttribute('aria-label', `Reembolsar ${part.name} libre por S/ ${part.price}`);
      card.append(refund);
    }
    trayGrid.append(card);
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

function partIconElement(kind: PartKind, className: string): HTMLSpanElement {
  const icons: Readonly<Record<PartKind, string>> = {
    chassis: '<path d="M3 15h18l-2 4H5z"/>',
    wheel: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    engine: '<rect x="3" y="6" width="18" height="13" rx="3"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="12" r="2"/><path d="M18 3v4M6 3v4"/>',
    seat: '<path d="M7 3v11h9V8M7 14v7M16 14v7M7 11h9"/>',
    roofRack: '<path d="M5 2v20M5 6h5M5 19h5"/><rect x="10" y="5" width="10" height="15" rx="2"/><path d="M10 11h10"/>',
    rearCarrier: '<circle cx="7" cy="17" r="4"/><circle cx="18" cy="17" r="4"/><path d="M7 17l5-9 6 9M12 8h7M3 4v16"/>',
    suspension: '<path d="M2 12h3l2-6 4 12 4-12 3 6h4"/>',
  };
  const icon = textElement('span', `${className} part-symbol part-symbol-${kind}`, '');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">${icons[kind]}</svg>`;
  return icon;
}

function shortPartName(kind: PartKind): string {
  const names: Readonly<Record<PartKind, string>> = {
    chassis: 'Chasis', wheel: 'Rueda', engine: 'Motor', seat: 'Asiento',
    roofRack: 'Parrilla', rearCarrier: 'Portabicis', suspension: 'Suspensión',
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

  const fareNotice = document.createElement('div');
  fareNotice.className = 'fare-reward';
  fareNotice.dataset.ui = 'fare-reward';
  fareNotice.hidden = true;
  fareNotice.setAttribute('role', 'status');
  fareNotice.setAttribute('aria-live', 'polite');
  const leftMoney = document.createElement('img');
  leftMoney.src = moneyRewardUrl;
  leftMoney.alt = '';
  leftMoney.setAttribute('aria-hidden', 'true');
  const fareText = textElement('strong', 'fare-reward-value', '');
  fareText.dataset.ui = 'fare-reward-value';
  const rightMoney = leftMoney.cloneNode(true) as HTMLImageElement;
  fareNotice.append(leftMoney, fareText, rightMoney);
  panel.append(fareNotice);

  const delivery = actionButton('Entregar carga', 'small-action', () =>
    dispatch({ type: 'DELIVER_REQUEST' }));
  delivery.dataset.ui = 'deliver';
  const pause = actionButton('II', 'ride-pause', () => dispatch({ type: 'PAUSE' }));
  pause.setAttribute('aria-label', 'Pausa');
  const physics = actionButton('', 'ride-physics', () => dispatch({ type: 'TOGGLE_DEBUG' }));
  physics.dataset.ui = 'physics';
  physics.title = 'Mostrar u ocultar física (F1)';
  physics.setAttribute('aria-label', snapshot.debugEnabled ? 'Física: activada' : 'Física: desactivada');
  physics.setAttribute('aria-pressed', String(snapshot.debugEnabled));
  physics.append(
    textElement('span', 'axis axis-x', 'X'),
    textElement('span', 'axis axis-y', 'Y'),
    textElement('span', 'axis axis-z', 'Z'),
  );
  const message = statusMessage(snapshot.message);
  message.classList.add('ride-toast');
  message.dataset.source = snapshot.messageSource;
  message.dataset.pending = String(snapshot.pendingMessageCount);
  message.hidden = !snapshot.message || !snapshot.rideMessagesEnabled;
  setPassengerMessageColor(message, snapshot);
  message.setAttribute('aria-label', `${snapshot.messageSource === 'passenger'
    ? 'Pasajero' : 'Juego'}: ${snapshot.message}`);
  panel.append(delivery, message,
    textElement('p', 'pickup-key-hint', 'ESPACIO RECOGER - ABAJO FRENAR'),
    createDriveControls(dispatch), pause, physics);
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
  const pickup = actionButton('SUBIR', 'drive-control pickup-control', () => {
    const requestId = pickup.dataset.requestId;
    if (requestId) dispatch({ type: 'COLLECT_REQUEST', requestId });
  });
  pickup.dataset.ui = 'pickup';
  pickup.disabled = true;
  pickup.setAttribute('aria-label', 'Recoger pasajero o carga');
  controls.append(
    holdButton('Reversa', 'reverse-control',
      () => dispatch({ type: 'SET_THROTTLE', value: -1 }),
      () => dispatch({ type: 'SET_THROTTLE', value: 0 })),
    holdButton('Frenar', 'brake-control',
      () => dispatch({ type: 'SET_BRAKE', value: true }),
      () => dispatch({ type: 'SET_BRAKE', value: false })),
    pickup,
    holdButton('Acelerar', 'accelerate-control',
      () => dispatch({ type: 'SET_THROTTLE', value: 1 }),
      () => dispatch({ type: 'SET_THROTTLE', value: 0 })),
  );
  const brakeEffectiveness = textElement('strong', 'brake-effectiveness', 'FRENO 0 %');
  brakeEffectiveness.dataset.ui = 'brake-effectiveness';
  controls.append(brakeEffectiveness);
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
  setUiText(screen, 'brake-effectiveness', `FRENO ${snapshot.brakeEffectivenessPercent} %`);
  const engineLoad = screen.querySelector<HTMLElement>('[data-ui="engine-load"]');
  if (engineLoad) {
    engineLoad.style.setProperty('--engine-load', `${snapshot.engineLoadPercent}%`);
    engineLoad.classList.toggle('is-maxed', snapshot.engineLoadPercent >= 100);
    engineLoad.setAttribute('aria-valuenow', String(snapshot.engineLoadPercent));
  }
  const physics = screen.querySelector<HTMLButtonElement>('[data-ui="physics"]');
  if (physics) {
    physics.setAttribute('aria-pressed', String(snapshot.debugEnabled));
    physics.setAttribute('aria-label', snapshot.debugEnabled ? 'Física: activada' : 'Física: desactivada');
  }
  const onboardPassengers = ride.requests.filter((item) => item.status === 'onboard').length;
  setUiText(screen, 'capacity', `${onboardPassengers} / ${snapshot.passengerCapacity}`);
  const timeCard = screen.querySelector<HTMLElement>('.ride-time-card');
  if (timeCard) {
    const progress = Math.max(0, Math.min(1, ride.remainingSeconds / (level?.durationSeconds ?? 60)));
    timeCard.style.setProperty('--time-progress', `${progress * 360}deg`);
    timeCard.classList.toggle('is-urgent', ride.remainingSeconds <= 10);
  }
  const message = screen.querySelector<HTMLElement>('.ride-toast');
  if (message) {
    message.textContent = snapshot.message;
    message.dataset.source = snapshot.messageSource;
    message.dataset.pending = String(snapshot.pendingMessageCount);
    message.hidden = !snapshot.message || !snapshot.rideMessagesEnabled;
    setPassengerMessageColor(message, snapshot);
    message.setAttribute('aria-label', `${snapshot.messageSource === 'passenger'
      ? 'Pasajero' : 'Juego'}: ${snapshot.message}${snapshot.pendingMessageCount > 0
      ? `. ${snapshot.pendingMessageCount} aviso pendiente.` : ''}`);
  }
  const fareReward = screen.querySelector<HTMLElement>('[data-ui="fare-reward"]');
  const fareRewardValue = screen.querySelector<HTMLElement>('[data-ui="fare-reward-value"]');
  if (fareReward && fareRewardValue) {
    const fare = snapshot.fareNotice;
    const fareKey = fare ? `${fare.baseFare}-${fare.surcharge}-${fare.total}` : '';
    if (!fare) {
      fareReward.hidden = true;
      fareReward.classList.remove('is-visible');
      fareReward.dataset.fareKey = '';
    } else {
      fareRewardValue.textContent = fare.surcharge > 0
        ? `S/ ${fare.baseFare} + S/ ${fare.surcharge} = +S/ ${fare.total}`
        : `+S/ ${fare.total}`;
      fareReward.hidden = false;
      if (fareReward.dataset.fareKey !== fareKey) {
        fareReward.dataset.fareKey = fareKey;
        fareReward.classList.remove('is-visible');
        void fareReward.offsetWidth;
        fareReward.classList.add('is-visible');
      }
    }
  }
  const pickup = screen.querySelector<HTMLButtonElement>('[data-ui="pickup"]');
  if (pickup) {
    const readyToCollect = ride.requests.find((progress) => progress.status === 'waiting' &&
      Math.abs(snapshot.vehicleX - progress.request.originX) <= STOP_RADIUS_METERS);
    pickup.disabled = !readyToCollect;
    pickup.dataset.requestId = readyToCollect?.request.id ?? '';
    pickup.classList.toggle('is-ready', Boolean(readyToCollect));
    pickup.textContent = readyToCollect ? 'SUBIR' : 'RECOGER';
  }
  const delivery = screen.querySelector<HTMLButtonElement>('[data-ui="deliver"]');
  if (delivery) {
    const onboard = ride.requests.find((item) =>
      item.status === 'onboard' && item.request.kind !== 'passenger');
    delivery.hidden = !onboard;
    delivery.disabled = !onboard ||
      !hasReachedDestination(snapshot.vehicleX, onboard.request.destinationX);
    delivery.textContent = onboard
      ? `${onboard.request.kind === 'passenger' ? 'Bajar' : 'Entregar carga'} en ${onboard.request.destinationStop}`
      : 'Completar entrega';
  }
}

function setPassengerMessageColor(message: HTMLElement, snapshot: AppSnapshot): void {
  if (snapshot.messageSource === 'passenger' && snapshot.messageColor) {
    message.style.setProperty('--passenger-color', snapshot.messageColor);
  } else {
    message.style.removeProperty('--passenger-color');
  }
}

function createPausedScreen(snapshot: AppSnapshot,
  dispatch: (action: AppAction) => void): HTMLElement {
  const panel = panelElement('pause-panel');
  const level = LEVELS.find((candidate) => candidate.id === snapshot.selectedLevelId);
  const secondaryActions = document.createElement('div');
  secondaryActions.className = 'pause-secondary-actions';
  secondaryActions.append(
    actionButton('Reiniciar', 'secondary-action', () => {
      if (window.confirm('¿Reiniciar este intento desde el inicio?')) dispatch({ type: 'RESTART_RIDE' });
    }),
    actionButton('Ir al taller', 'secondary-action', () => dispatch({ type: 'ABORT_RIDE' })),
  );
  const messageToggle = actionButton(snapshot.rideMessagesEnabled
    ? 'Avisos en ruta: activados'
    : 'Avisos en ruta: desactivados', 'pause-message-toggle', () =>
    dispatch({ type: 'TOGGLE_RIDE_MESSAGES' }));
  messageToggle.setAttribute('aria-pressed', String(snapshot.rideMessagesEnabled));
  messageToggle.setAttribute('aria-label', snapshot.rideMessagesEnabled
    ? 'Desactivar avisos en ruta'
    : 'Activar avisos en ruta');
  panel.append(
    textElement('h1', 'section-title', 'Pausa'),
    textElement('p', 'pause-level-name', level?.name ?? 'Recorrido'),
    actionButton('Continuar', 'primary-action', () => dispatch({ type: 'RESUME' })),
    messageToggle,
    secondaryActions,
    actionButton('Salir al menú', 'text-action quiet-action pause-exit-action', () =>
      dispatch({ type: 'GO_MENU' })),
  );
  return panel;
}

function createResultsScreen(snapshot: AppSnapshot, dispatch: (action: AppAction) => void): HTMLElement {
  const level = LEVELS.find((candidate) => candidate.id === snapshot.selectedLevelId);
  const nextLevel = level && snapshot.won
    ? LEVELS.find((candidate) => candidate.number === level.number + 1 &&
      candidate.number <= snapshot.game.unlockedLevel)
    : undefined;
  const panel = panelElement('results-panel');
  panel.classList.toggle('is-game-over', snapshot.engineExploded);
  const resultMessage = snapshot.engineExploded
    ? 'El motor necesita un descanso. Puedes intentarlo otra vez o ajustar tu combi.'
    : snapshot.won
      ? snapshot.message
      : `Casi llegas. ${snapshot.message}`;
  panel.append(
    textElement('h1', 'section-title', snapshot.engineExploded
      ? 'La combi se detuvo'
      : snapshot.won ? '¡Buena ruta!' : 'Faltó poquito'),
    textElement('p', 'hero-copy', resultMessage),
  );
  const stars = document.createElement('div');
  stars.className = 'result-stars';
  stars.setAttribute('aria-label', `${snapshot.stars ?? 0} de 3 estrellas`);
  for (let index = 1; index <= 3; index += 1) {
    stars.append(textElement('span',
      `result-star ${index <= (snapshot.stars ?? 0) ? 'is-earned' : ''}`, String(index)));
  }
  const score = document.createElement('dl');
  score.className = 'result-score';
  score.append(
    definitionItem('Cobrado', `S/ ${snapshot.ride?.deliveredRevenue ?? 0}`),
    definitionItem('Meta', `S/ ${level?.quota ?? 0}`),
  );
  const details = document.createElement('details');
  details.className = 'result-details';
  const detailsSummary = textElement('summary', 'result-details-label', 'Ver detalles');
  const metrics = document.createElement('dl');
  metrics.className = 'result-metrics';
  metrics.append(
    definitionItem('Solicitudes', String(snapshot.ride?.deliveredCount ?? 0)),
    definitionItem('Masa máxima', `${snapshot.ride?.maximumPayloadMassKg ?? 0} kg`),
    definitionItem('Estabilidad', `${snapshot.ride?.stabilityPercent ?? 0} %`),
    definitionItem('Piezas sueltas', String(snapshot.ride?.lostPieces ?? 0)),
    definitionItem('Semilla', snapshot.ride?.seed ?? 'sin intento'),
  );
  details.append(detailsSummary, metrics);
  const actions = document.createElement('div');
  actions.className = 'result-actions';
  if (nextLevel) {
    actions.append(actionButton(`Siguiente: ${nextLevel.name}`, 'primary-action result-next', () =>
      dispatch({ type: 'SELECT_LEVEL', levelId: nextLevel.id })));
  } else {
    actions.append(actionButton('Intentar de nuevo', 'primary-action', () =>
      dispatch({ type: 'REPLAY_RIDE' })));
  }
  actions.append(
    actionButton('Ajustar combi', 'secondary-action', () => dispatch({ type: 'RETRY' })),
    actionButton('Ver rutas', 'text-action quiet-action', () => dispatch({ type: 'BACK' })),
  );
  panel.append(stars, score, details, actions);
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
