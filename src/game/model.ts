import { PART_CATALOG, type PartKind } from '../data/parts';

export const INITIAL_WALLET = 100;
export const SELL_REFUND_RATE = 0.7;
export const DRIVER_SEAT_ID = 'seat-1';
export const DRIVER_MASS_KG = 70;
export const BASE_ENGINE_FORCE_N = 3000;

export const ANCHORS = {
  frontWheel: 'wheel',
  rearWheel: 'wheel',
  engine: 'engine',
  driverSeat: 'seat',
  passengerSeat: 'seat',
  roof: 'roofRack',
  rearCarrier: 'rearCarrier',
  suspension: 'suspension',
} as const satisfies Record<string, PartKind>;

export type AnchorId = keyof typeof ANCHORS;
export type SerializedBuild = Partial<Record<AnchorId, PartKind>>;
export type Inventory = Record<PartKind, number>;

export const BUILD_GRID_COLUMNS = 10;
export const BUILD_GRID_ROWS = 6;

export interface GridPlacement {
  readonly id: string;
  readonly kind: PartKind;
  readonly column: number;
  readonly row: number;
}

export interface PartFootprint {
  readonly columns: number;
  readonly rows: number;
}

export const PART_FOOTPRINTS: Readonly<Record<PartKind, PartFootprint>> = {
  chassis: { columns: 10, rows: 1 },
  wheel: { columns: 2, rows: 1 },
  engine: { columns: 2, rows: 2 },
  seat: { columns: 1, rows: 2 },
  roofRack: { columns: 3, rows: 1 },
  rearCarrier: { columns: 2, rows: 1 },
  suspension: { columns: 3, rows: 1 },
};

export interface CompletedLevel {
  readonly bestRevenue: number;
  readonly bestDelivered: number;
  readonly bestSeed: string;
  readonly bestStars?: number;
}

export interface GameModel {
  readonly wallet: number;
  readonly ownedParts: Inventory;
  readonly pendingPurchases: Inventory;
  readonly workshopBuild: SerializedBuild;
  readonly workshopGrid?: readonly GridPlacement[];
  readonly unlockedLevel: number;
  readonly completedLevels: Readonly<Record<string, CompletedLevel>>;
}

export interface VehicleCapacity {
  readonly passenger: number;
  readonly roofCargo: number;
  readonly scooter: number;
}

export interface BuildStats {
  readonly massKg: number;
  readonly bodyMassKg: number;
  readonly centerOfMass: { readonly x: number; readonly y: number };
  readonly engineForceN: number;
  readonly wheelOffsets?: readonly { readonly x: number; readonly y: number }[];
  readonly loosePieces?: number;
}

const ANCHOR_POSITIONS: Readonly<Record<AnchorId, { readonly x: number; readonly y: number }>> = {
  frontWheel: { x: 1.05, y: -0.55 }, rearWheel: { x: -1.05, y: -0.55 },
  engine: { x: 0.65, y: 0 }, driverSeat: { x: -0.3, y: 0.2 },
  passengerSeat: { x: 0.4, y: 0.2 }, roof: { x: 0, y: 0.9 },
  rearCarrier: { x: -1.7, y: 0 }, suspension: { x: 0, y: -0.3 },
};

export function emptyInventory(): Inventory {
  return {
    chassis: 0,
    wheel: 0,
    engine: 0,
    seat: 0,
    roofRack: 0,
    rearCarrier: 0,
    suspension: 0,
  };
}

export function createInitialGameModel(): GameModel {
  return {
    wallet: INITIAL_WALLET,
    ownedParts: { ...emptyInventory(), chassis: 1, wheel: 2, engine: 1, seat: 1 },
    pendingPurchases: emptyInventory(),
    workshopBuild: {
      frontWheel: 'wheel',
      rearWheel: 'wheel',
      engine: 'engine',
      driverSeat: 'seat',
    },
    workshopGrid: [
      { id: 'wheel-1', kind: 'wheel', column: 1, row: 5 },
      { id: 'wheel-2', kind: 'wheel', column: 7, row: 5 },
      { id: 'engine-1', kind: 'engine', column: 6, row: 3 },
      { id: 'seat-1', kind: 'seat', column: 3, row: 3 },
    ],
    unlockedLevel: 1,
    completedLevels: {},
  };
}

export function createDemoGameModel(): GameModel {
  return {
    wallet: 500,
    ownedParts: { chassis: 1, wheel: 2, engine: 1, seat: 2,
      roofRack: 1, rearCarrier: 1, suspension: 1 },
    pendingPurchases: emptyInventory(),
    workshopBuild: {
      frontWheel: 'wheel', rearWheel: 'wheel', engine: 'engine',
      driverSeat: 'seat', passengerSeat: 'seat', roof: 'roofRack',
      rearCarrier: 'rearCarrier', suspension: 'suspension',
    },
    workshopGrid: [
      { id: 'wheel-1', kind: 'wheel', column: 1, row: 5 },
      { id: 'wheel-2', kind: 'wheel', column: 7, row: 5 },
      { id: 'engine-1', kind: 'engine', column: 6, row: 3 },
      { id: 'seat-1', kind: 'seat', column: 3, row: 3 },
      { id: 'seat-2', kind: 'seat', column: 4, row: 3 },
      { id: 'roofRack-1', kind: 'roofRack', column: 2, row: 2 },
      { id: 'rearCarrier-1', kind: 'rearCarrier', column: 0, row: 4 },
      { id: 'suspension-1', kind: 'suspension', column: 4, row: 5 },
    ],
    unlockedLevel: 5,
    completedLevels: {},
  };
}

export function prepareLevelWorkshop(model: GameModel, buildBudget: number,
  defaultExtras: readonly PartKind[] = []): GameModel {
  if (!Number.isInteger(buildBudget) || buildBudget < 0) {
    throw new Error('El presupuesto del nivel debe ser un entero no negativo.');
  }
  const base = createInitialGameModel();
  const canonicalExtras: Readonly<Partial<Record<PartKind, GridPlacement>>> = {
    seat: { id: 'seat-2', kind: 'seat', column: 4, row: 3 },
    roofRack: { id: 'roofRack-1', kind: 'roofRack', column: 2, row: 2 },
    rearCarrier: { id: 'rearCarrier-1', kind: 'rearCarrier', column: 0, row: 4 },
    suspension: { id: 'suspension-1', kind: 'suspension', column: 4, row: 5 },
  };
  const ownedParts = { ...base.ownedParts };
  const workshopGrid: GridPlacement[] = [
    { id: DRIVER_SEAT_ID, kind: 'seat', column: 3, row: 3 },
  ];
  for (const kind of defaultExtras) {
    const placement = canonicalExtras[kind];
    if (!placement || workshopGrid.some((item) => item.kind === kind && item.id === placement.id)) continue;
    ownedParts[kind] += 1;
  }
  return {
    ...base,
    wallet: buildBudget,
    ownedParts,
    workshopGrid,
    workshopBuild: { driverSeat: 'seat' },
    unlockedLevel: model.unlockedLevel,
    completedLevels: model.completedLevels,
  };
}

export function buyPart(model: GameModel, kind: PartKind): GameModel {
  const price = priceOf(kind);
  if (kind === 'chassis') throw new Error('El chasis base no se compra.');
  if (model.wallet < price) throw new Error('Dinero insuficiente.');
  return {
    ...model,
    wallet: model.wallet - price,
    ownedParts: { ...model.ownedParts, [kind]: model.ownedParts[kind] + 1 },
    pendingPurchases: { ...model.pendingPurchases, [kind]: model.pendingPurchases[kind] + 1 },
  };
}

export function placePart(model: GameModel, kind: PartKind, anchor: AnchorId): GameModel {
  if (ANCHORS[anchor] !== kind) throw new Error('La pieza no encaja en ese anclaje.');
  if (model.workshopBuild[anchor]) throw new Error('El anclaje ya está ocupado.');
  const placed = Object.values(model.workshopBuild).filter((placedKind) => placedKind === kind).length;
  if (placed >= model.ownedParts[kind]) throw new Error('No hay piezas libres en el inventario.');
  const next = { ...model, workshopBuild: { ...model.workshopBuild, [anchor]: kind } };
  if (!model.workshopGrid) return next;
  for (let row = BUILD_GRID_ROWS - PART_FOOTPRINTS[kind].rows; row >= 0; row -= 1) {
    for (let column = 0; column <= BUILD_GRID_COLUMNS - PART_FOOTPRINTS[kind].columns; column += 1) {
      try {
        return placeGridPart(next, kind, column, row);
      } catch {
        // Continúa hasta encontrar el primer espacio libre para compatibilidad con acciones antiguas.
      }
    }
  }
  throw new Error('No hay espacio libre para colocar la pieza.');
}

export function removePart(model: GameModel, anchor: AnchorId): GameModel {
  const kind = model.workshopBuild[anchor];
  if (!kind) throw new Error('El anclaje está vacío.');
  if (model.workshopGrid) {
    const matching = model.workshopGrid.filter((item) => item.kind === kind)
      .sort((left, right) => left.column - right.column);
    const placement = anchor === 'driverSeat'
      ? matching.find((item) => item.id === DRIVER_SEAT_ID)
      : anchor === 'passengerSeat'
        ? matching.find((item) => item.id !== DRIVER_SEAT_ID)
        : matching[anchor === 'frontWheel' ? 1 : 0] ?? matching[0];
    if (placement) return removeGridPart(model, placement.id);
  }
  const workshopBuild = Object.fromEntries(
    Object.entries(model.workshopBuild).filter(([placedAnchor]) => placedAnchor !== anchor),
  ) as SerializedBuild;
  return { ...model, workshopBuild };
}

export function clearOptionalParts(model: GameModel): GameModel {
  if (model.workshopGrid) {
    const driverSeat = model.workshopGrid.find((item) => item.kind === 'seat');
    const workshopGrid = driverSeat ? [driverSeat] : [];
    return { ...model, workshopGrid, workshopBuild: gridToLegacyBuild(workshopGrid) };
  }
  const requiredAnchors: readonly AnchorId[] = ['driverSeat'];
  const workshopBuild = Object.fromEntries(Object.entries(model.workshopBuild)
    .filter(([anchor]) => requiredAnchors.includes(anchor as AnchorId))) as SerializedBuild;
  return {
    ...model,
    workshopBuild,
  };
}

export function returnPurchase(model: GameModel, kind: PartKind): GameModel {
  if (model.pendingPurchases[kind] < 1) throw new Error('No hay una compra reciente para devolver.');
  const placed = model.workshopGrid
    ? model.workshopGrid.filter((item) => item.kind === kind).length
    : Object.values(model.workshopBuild).filter((placedKind) => placedKind === kind).length;
  if (placed >= model.ownedParts[kind]) throw new Error('Retira primero una pieza colocada.');
  return {
    ...model,
    wallet: model.wallet + priceOf(kind),
    ownedParts: { ...model.ownedParts, [kind]: model.ownedParts[kind] - 1 },
    pendingPurchases: { ...model.pendingPurchases, [kind]: model.pendingPurchases[kind] - 1 },
  };
}

export function sellPart(model: GameModel, kind: PartKind): GameModel {
  const minimum = createInitialGameModel().ownedParts[kind];
  if (model.ownedParts[kind] <= minimum) throw new Error('El kit básico no se puede vender.');
  const placed = model.workshopGrid
    ? model.workshopGrid.filter((item) => item.kind === kind).length
    : Object.values(model.workshopBuild).filter((placedKind) => placedKind === kind).length;
  if (placed >= model.ownedParts[kind]) throw new Error('Retira primero una pieza colocada.');
  return {
    ...model,
    wallet: model.wallet + Math.round(priceOf(kind) * SELL_REFUND_RATE),
    ownedParts: { ...model.ownedParts, [kind]: model.ownedParts[kind] - 1 },
    pendingPurchases: model.pendingPurchases[kind] > 0
      ? { ...model.pendingPurchases, [kind]: model.pendingPurchases[kind] - 1 }
      : model.pendingPurchases,
  };
}

export function validateBuild(build: SerializedBuild): string | null {
  if (build.driverSeat !== 'seat') return 'Falta el asiento del conductor.';
  return null;
}

export function passengerCapacity(build: SerializedBuild): number {
  return vehicleCapacity(build).passenger;
}

export function vehicleCapacity(build: SerializedBuild): VehicleCapacity {
  return {
    passenger: build.passengerSeat === 'seat' ? 1 : 0,
    roofCargo: build.roof === 'roofRack' ? 1 : 0,
    scooter: build.rearCarrier === 'rearCarrier' ? 1 : 0,
  };
}

export function buildStats(build: SerializedBuild): BuildStats {
  const chassis = PART_CATALOG.find((part) => part.kind === 'chassis');
  if (!chassis) throw new Error('Falta la definición del chasis.');
  let massKg = chassis.massKg;
  let bodyMassKg = chassis.massKg;
  let weightedX = 0;
  let weightedY = 0;
  for (const [anchorName, kind] of Object.entries(build)) {
    const anchor = anchorName as AnchorId;
    const part = PART_CATALOG.find((candidate) => candidate.kind === kind);
    if (!part) continue;
    const position = ANCHOR_POSITIONS[anchor];
    massKg += part.massKg;
    if (anchor !== 'roof' && anchor !== 'rearCarrier') bodyMassKg += part.massKg;
    weightedX += part.massKg * position.x;
    weightedY += part.massKg * position.y;
  }
  if (build.driverSeat === 'seat') {
    const position = ANCHOR_POSITIONS.driverSeat;
    massKg += DRIVER_MASS_KG;
    bodyMassKg += DRIVER_MASS_KG;
    weightedX += DRIVER_MASS_KG * position.x;
    weightedY += DRIVER_MASS_KG * position.y;
  }
  return {
    massKg,
    bodyMassKg,
    centerOfMass: { x: weightedX / massKg, y: weightedY / massKg },
    engineForceN: build.engine === 'engine' ? BASE_ENGINE_FORCE_N : 0,
  };
}

export function priceOf(kind: PartKind): number {
  const definition = PART_CATALOG.find((part) => part.kind === kind);
  if (!definition) throw new Error(`Pieza desconocida: ${kind}`);
  return definition.price;
}

export function gridForModel(model: GameModel): readonly GridPlacement[] {
  return model.workshopGrid ?? legacyBuildToGrid(model.workshopBuild);
}

export function gridPlacementPosition(placement: GridPlacement): { readonly x: number; readonly y: number } {
  return gridPosition(placement);
}

export function passengerSeatPlacements(grid: readonly GridPlacement[]): readonly GridPlacement[] {
  const securedIds = new Set(securedGridPlacements(grid).map((placement) => placement.id));
  return grid.filter((placement) => placement.kind === 'seat' &&
    placement.id !== DRIVER_SEAT_ID && securedIds.has(placement.id))
    .sort((left, right) => left.column - right.column || left.row - right.row);
}

export function placeGridPart(model: GameModel, kind: PartKind, column: number, row: number): GameModel {
  if (kind === 'chassis') throw new Error('El chasis forma la base de la cuadrícula.');
  const grid = gridForModel(model);
  const placed = grid.filter((item) => item.kind === kind).length;
  if (placed >= model.ownedParts[kind]) throw new Error('No hay piezas libres en el inventario.');
  const candidate: GridPlacement = {
    id: nextPlacementId(grid, kind), kind, column, row,
  };
  validateGridPlacement(candidate, grid);
  const workshopGrid = [...grid, candidate];
  return { ...model, workshopGrid, workshopBuild: gridToLegacyBuild(workshopGrid) };
}

export function removeGridPart(model: GameModel, placementId: string): GameModel {
  const grid = gridForModel(model);
  if (!grid.some((item) => item.id === placementId)) throw new Error('La pieza ya no está en la cuadrícula.');
  if (placementId === DRIVER_SEAT_ID) throw new Error('El asiento del conductor solo se puede mover.');
  const workshopGrid = grid.filter((item) => item.id !== placementId);
  return { ...model, workshopGrid, workshopBuild: gridToLegacyBuild(workshopGrid) };
}

export function moveGridPart(model: GameModel, placementId: string,
  column: number, row: number): GameModel {
  const grid = gridForModel(model);
  const current = grid.find((item) => item.id === placementId);
  if (!current) throw new Error('La pieza ya no está en la cuadrícula.');
  const moved = { ...current, column, row };
  validateGridPlacement(moved, grid.filter((item) => item.id !== placementId));
  const workshopGrid = grid.map((item) => item.id === placementId ? moved : item);
  return { ...model, workshopGrid, workshopBuild: gridToLegacyBuild(workshopGrid) };
}

export function validateGridBuild(grid: readonly GridPlacement[]): string | null {
  if (!grid.some((item) => item.id === DRIVER_SEAT_ID && item.kind === 'seat')) {
    return 'Falta el asiento del conductor.';
  }
  return null;
}

export function securedGridPlacements(grid: readonly GridPlacement[]): readonly GridPlacement[] {
  const secured = new Set<string>();
  for (const placement of grid) {
    if (cellsFor(placement).some((cell) => cell.row >= BUILD_GRID_ROWS - 2)) secured.add(placement.id);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const placement of grid) {
      if (secured.has(placement.id)) continue;
      const cells = cellsFor(placement);
      const touchesSecured = grid.some((other) => secured.has(other.id) &&
        cellsTouch(cells, cellsFor(other)));
      if (touchesSecured) {
        secured.add(placement.id);
        changed = true;
      }
    }
  }
  return grid.filter((placement) => secured.has(placement.id));
}

export function gridVehicleCapacity(grid: readonly GridPlacement[]): VehicleCapacity {
  const secured = securedGridPlacements(grid);
  const count = (kind: PartKind): number => secured.filter((item) => item.kind === kind).length;
  return {
    passenger: passengerSeatPlacements(grid).length,
    roofCargo: count('roofRack'),
    scooter: count('rearCarrier'),
  };
}

export function gridBuildStats(grid: readonly GridPlacement[]): BuildStats {
  const chassis = PART_CATALOG.find((part) => part.kind === 'chassis');
  if (!chassis) throw new Error('Falta la definición del chasis.');
  const secured = securedGridPlacements(grid);
  let massKg = chassis.massKg;
  let bodyMassKg = chassis.massKg;
  let weightedX = 0;
  let weightedY = 0;
  const wheelOffsets: { x: number; y: number }[] = [];
  for (const placement of secured) {
    const part = PART_CATALOG.find((candidate) => candidate.kind === placement.kind);
    if (!part) continue;
    const position = gridPosition(placement);
    massKg += part.massKg;
    if (placement.kind !== 'roofRack' && placement.kind !== 'rearCarrier') bodyMassKg += part.massKg;
    weightedX += part.massKg * position.x;
    weightedY += part.massKg * position.y;
    if (placement.kind === 'wheel') wheelOffsets.push(position);
    if (placement.id === DRIVER_SEAT_ID) {
      massKg += DRIVER_MASS_KG;
      bodyMassKg += DRIVER_MASS_KG;
      weightedX += DRIVER_MASS_KG * position.x;
      weightedY += DRIVER_MASS_KG * position.y;
    }
  }
  const centerOfMass = { x: weightedX / massKg, y: weightedY / massKg };
  return {
    massKg,
    bodyMassKg,
    centerOfMass,
    engineForceN: secured.some((item) => item.kind === 'engine') ? BASE_ENGINE_FORCE_N : 0,
    wheelOffsets: wheelOffsets.map((position) => ({
      x: position.x - centerOfMass.x,
      y: position.y - centerOfMass.y,
    })),
    loosePieces: grid.length - secured.length,
  };
}

export function gridToLegacyBuild(grid: readonly GridPlacement[]): SerializedBuild {
  const build: Partial<Record<AnchorId, PartKind>> = {};
  const byKind = (kind: PartKind): readonly GridPlacement[] =>
    grid.filter((item) => item.kind === kind).sort((left, right) => left.column - right.column);
  const wheels = byKind('wheel');
  if (wheels[0]) build.rearWheel = 'wheel';
  if (wheels[1]) build.frontWheel = 'wheel';
  if (byKind('engine')[0]) build.engine = 'engine';
  const seats = byKind('seat');
  if (seats.some((seat) => seat.id === DRIVER_SEAT_ID)) build.driverSeat = 'seat';
  if (seats.some((seat) => seat.id !== DRIVER_SEAT_ID)) build.passengerSeat = 'seat';
  if (byKind('roofRack')[0]) build.roof = 'roofRack';
  if (byKind('rearCarrier')[0]) build.rearCarrier = 'rearCarrier';
  if (byKind('suspension')[0]) build.suspension = 'suspension';
  return build;
}

export function legacyBuildToGrid(build: SerializedBuild): readonly GridPlacement[] {
  const placements: GridPlacement[] = [];
  const add = (kind: PartKind, column: number, row: number): void => {
    placements.push({ id: nextPlacementId(placements, kind), kind, column, row });
  };
  if (build.rearWheel === 'wheel') add('wheel', 1, 5);
  if (build.frontWheel === 'wheel') add('wheel', 7, 5);
  if (build.engine === 'engine') add('engine', 6, 3);
  if (build.driverSeat === 'seat') add('seat', 3, 3);
  if (build.passengerSeat === 'seat') add('seat', 4, 3);
  if (build.roof === 'roofRack') add('roofRack', 2, 2);
  if (build.rearCarrier === 'rearCarrier') add('rearCarrier', 0, 4);
  if (build.suspension === 'suspension') add('suspension', 4, 5);
  return placements;
}

export function gridPlacementFits(placement: GridPlacement,
  grid: readonly GridPlacement[]): boolean {
  try {
    validateGridPlacement(placement, grid.filter((item) => item.id !== placement.id));
    return true;
  } catch {
    return false;
  }
}

function validateGridPlacement(placement: GridPlacement, grid: readonly GridPlacement[]): void {
  if (!Number.isInteger(placement.column) || !Number.isInteger(placement.row)) {
    throw new Error('La pieza debe alinearse con la cuadrícula.');
  }
  const footprint = PART_FOOTPRINTS[placement.kind];
  if (placement.column < 0 || placement.row < 0 ||
    placement.column + footprint.columns > BUILD_GRID_COLUMNS ||
    placement.row + footprint.rows > BUILD_GRID_ROWS) {
    throw new Error('La pieza no cabe en esa posición.');
  }
  const cells = cellsFor(placement);
  if (grid.some((other) => cellsOverlap(cells, cellsFor(other)))) {
    throw new Error('Ese espacio ya está ocupado.');
  }
}

function nextPlacementId(grid: readonly GridPlacement[], kind: PartKind): string {
  let suffix = 1;
  while (grid.some((item) => item.id === `${kind}-${suffix}`)) suffix += 1;
  return `${kind}-${suffix}`;
}

function cellsFor(placement: GridPlacement): readonly { column: number; row: number }[] {
  const footprint = PART_FOOTPRINTS[placement.kind];
  const cells: { column: number; row: number }[] = [];
  for (let row = placement.row; row < placement.row + footprint.rows; row += 1) {
    for (let column = placement.column; column < placement.column + footprint.columns; column += 1) {
      cells.push({ column, row });
    }
  }
  return cells;
}

function cellsOverlap(left: readonly { column: number; row: number }[],
  right: readonly { column: number; row: number }[]): boolean {
  return left.some((cell) => right.some((candidate) =>
    cell.column === candidate.column && cell.row === candidate.row));
}

function cellsTouch(left: readonly { column: number; row: number }[],
  right: readonly { column: number; row: number }[]): boolean {
  return left.some((cell) => right.some((candidate) =>
    Math.abs(cell.column - candidate.column) + Math.abs(cell.row - candidate.row) === 1));
}

function gridPosition(placement: GridPlacement): { x: number; y: number } {
  const footprint = PART_FOOTPRINTS[placement.kind];
  return {
    x: (placement.column + footprint.columns / 2 - BUILD_GRID_COLUMNS / 2) * 0.34,
    y: (BUILD_GRID_ROWS - placement.row - footprint.rows / 2 - 1) * 0.28 - 0.41,
  };
}
