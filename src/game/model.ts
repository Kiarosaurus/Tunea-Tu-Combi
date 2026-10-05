import { PART_CATALOG, type PartKind } from '../data/parts';

export const INITIAL_WALLET = 100;
export const SELL_REFUND_RATE = 0.7;

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

export interface CompletedLevel {
  readonly bestRevenue: number;
  readonly bestDelivered: number;
  readonly bestSeed: string;
}

export interface GameModel {
  readonly wallet: number;
  readonly ownedParts: Inventory;
  readonly pendingPurchases: Inventory;
  readonly workshopBuild: SerializedBuild;
  readonly unlockedLevel: number;
  readonly completedLevels: Readonly<Record<string, CompletedLevel>>;
}

export interface VehicleCapacity {
  readonly passenger: number;
  readonly roofCargo: number;
  readonly scooter: number;
}

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
    unlockedLevel: 1,
    completedLevels: {},
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
  return { ...model, workshopBuild: { ...model.workshopBuild, [anchor]: kind } };
}

export function removePart(model: GameModel, anchor: AnchorId): GameModel {
  if (!model.workshopBuild[anchor]) throw new Error('El anclaje está vacío.');
  const workshopBuild = Object.fromEntries(
    Object.entries(model.workshopBuild).filter(([placedAnchor]) => placedAnchor !== anchor),
  ) as SerializedBuild;
  return { ...model, workshopBuild };
}

export function returnPurchase(model: GameModel, kind: PartKind): GameModel {
  if (model.pendingPurchases[kind] < 1) throw new Error('No hay una compra reciente para devolver.');
  const placed = Object.values(model.workshopBuild).filter((placedKind) => placedKind === kind).length;
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
  const placed = Object.values(model.workshopBuild).filter((placedKind) => placedKind === kind).length;
  if (placed >= model.ownedParts[kind]) throw new Error('Retira primero una pieza colocada.');
  if (model.pendingPurchases[kind] > 0) throw new Error('Devuelve primero la compra reciente.');
  return {
    ...model,
    wallet: model.wallet + Math.round(priceOf(kind) * SELL_REFUND_RATE),
    ownedParts: { ...model.ownedParts, [kind]: model.ownedParts[kind] - 1 },
  };
}

export function validateBuild(build: SerializedBuild): string | null {
  if (build.frontWheel !== 'wheel' || build.rearWheel !== 'wheel') return 'Faltan dos ruedas.';
  if (build.engine !== 'engine') return 'Falta un motor.';
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

export function priceOf(kind: PartKind): number {
  const definition = PART_CATALOG.find((part) => part.kind === kind);
  if (!definition) throw new Error(`Pieza desconocida: ${kind}`);
  return definition.price;
}
