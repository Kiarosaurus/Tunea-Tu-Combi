import type { AppAction, AppSnapshot } from '../app/appController';
import type { Disposable } from '../core/contracts';
import { LEVELS } from '../data/levels';
import { PART_CATALOG } from '../data/parts';
import { createInitialGameModel } from '../game/model';

export interface AppView extends Disposable {
  readonly canvas: HTMLCanvasElement;
  render(snapshot: AppSnapshot): void;
}

export function createAppView(
  root: HTMLElement,
  dispatch: (action: AppAction) => void,
): AppView {
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
    textElement('span', 'prototype-badge', 'FÍSICA 2D'),
  );
  const debugButton = actionButton('Depuración: no', 'debug-action', () =>
    dispatch({ type: 'TOGGLE_DEBUG' }),
  );
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

  return {
    canvas,
    render(snapshot): void {
      root.dataset.appState = snapshot.state;
      debugButton.textContent = snapshot.debugEnabled ? 'Depuración: sí' : 'Depuración: no';
      debugButton.setAttribute('aria-pressed', String(snapshot.debugEnabled));
      screen.replaceChildren(createScreen(snapshot, dispatch));
    },
    destroy(): void {
      root.replaceChildren();
    },
  };
}

function createScreen(snapshot: AppSnapshot, dispatch: (action: AppAction) => void): HTMLElement {
  switch (snapshot.state) {
    case 'BOOT':
      return createBootScreen();
    case 'MENU':
      return createMenuScreen(dispatch);
    case 'LEVEL_SELECT':
      return createLevelSelectScreen(dispatch);
    case 'WORKSHOP':
      return createWorkshopScreen(snapshot, dispatch);
    case 'PLAYING':
    case 'PAUSED':
    case 'RESULTS':
      return createFutureScreen(snapshot.state);
  }
}

function createBootScreen(): HTMLElement {
  const panel = panelElement('boot-panel');
  panel.append(
    textElement('p', 'eyebrow', 'Preparando el taller'),
    textElement('h1', 'hero-title', 'Tunea Tu Combi'),
    textElement('p', 'hero-copy', 'Cargando la base de juego...'),
  );
  return panel;
}

function createMenuScreen(dispatch: (action: AppAction) => void): HTMLElement {
  const panel = panelElement('menu-panel');
  const title = textElement('h1', 'hero-title', 'Tu ruta. Tu máquina.');
  title.id = 'screen-title';

  panel.append(
    textElement('p', 'eyebrow', 'Proyecto de Computación Gráfica'),
    title,
    textElement(
      'p',
      'hero-copy',
      'Arma una combi estable, administra tu dinero y supera cinco recorridos inspirados en Lima.',
    ),
    actionButton('Empezar recorrido', 'primary-action', () =>
      dispatch({ type: 'OPEN_LEVEL_SELECT' }),
    ),
    textElement('p', 'phase-note', 'Demostración física: gravedad y contacto rueda-terreno.'),
  );
  return panel;
}

function createLevelSelectScreen(dispatch: (action: AppAction) => void): HTMLElement {
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
    const isUnlocked = level.number === 1;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'level-card';
    card.disabled = !isUnlocked;
    card.setAttribute('aria-label', `${level.name}, cuota S/ ${level.quota}`);
    card.append(
      textElement('span', 'level-number', String(level.number).padStart(2, '0')),
      textElement('strong', 'level-name', level.name),
      textElement('span', 'level-challenge', level.challenge),
      textElement('span', 'level-quota', `Cuota S/ ${level.quota}`),
      textElement('span', 'level-status', isUnlocked ? 'Disponible' : 'Bloqueado'),
    );
    if (isUnlocked) {
      card.addEventListener('click', () =>
        dispatch({ type: 'SELECT_LEVEL', levelId: level.id }),
      );
    }
    grid.append(card);
  }

  wrapper.append(heading, grid);
  return wrapper;
}

function createWorkshopScreen(
  snapshot: AppSnapshot,
  dispatch: (action: AppAction) => void,
): HTMLElement {
  const model = createInitialGameModel();
  const level = LEVELS.find((candidate) => candidate.id === snapshot.selectedLevelId);
  const panel = panelElement('workshop-panel');
  panel.append(
    actionButton('Volver a rutas', 'text-action', () => dispatch({ type: 'BACK' })),
    textElement('p', 'eyebrow', level?.name ?? 'Taller'),
    textElement('h1', 'section-title', 'Taller de la combi'),
    textElement(
      'p',
      'hero-copy',
      'La cuadrícula de construcción y las piezas interactivas se habilitarán en el ciclo vertical.',
    ),
  );

  const summary = document.createElement('dl');
  summary.className = 'workshop-summary';
  summary.append(
    definitionItem('Billetera inicial', `S/ ${model.wallet}`),
    definitionItem('Tipos de piezas', String(PART_CATALOG.length)),
    definitionItem('Estado', 'Base preparada'),
  );
  panel.append(summary);
  return panel;
}

function createFutureScreen(state: string): HTMLElement {
  const panel = panelElement('future-panel');
  panel.append(
    textElement('p', 'eyebrow', state),
    textElement('h1', 'section-title', 'Estado reservado'),
  );
  return panel;
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

function definitionItem(term: string, value: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.append(textElement('dt', '', term), textElement('dd', '', value));
  return fragment;
}
