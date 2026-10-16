import { describe, expect, it } from 'vitest';
import { PART_CATALOG } from '../data/parts';
import {
  buyPart,
  buildStats,
  clearOptionalParts,
  createDemoGameModel,
  createInitialGameModel,
  DRIVER_SEAT_ID,
  gridBuildStats,
  gridForModel,
  gridVehicleCapacity,
  moveGridPart,
  placeGridPart,
  passengerCapacity,
  placePart,
  prepareLevelWorkshop,
  removePart,
  removeGridPart,
  refundPart,
  rememberLastRideBuild,
  restoreLastRideBuild,
  validateBuild,
} from './model';

describe('taller y economía', () => {
  it('mantiene el catálogo canónico de siete tipos de pieza', () => {
    expect(PART_CATALOG).toHaveLength(7);
  });

  it('entrega un kit funcional sin capacidad extra de pasajeros', () => {
    const initial = createInitialGameModel();
    expect(validateBuild(initial.workshopBuild)).toBeNull();
    expect(initial.ownedParts.wheel).toBe(2);
    expect(passengerCapacity(initial.workshopBuild)).toBe(0);
  });

  it('compra, coloca, retira y devuelve una pieza antes de conducir', () => {
    const initial = createInitialGameModel();
    const purchased = buyPart(initial, 'seat');
    expect(purchased.wallet).toBe(initial.wallet - 15);
    const placed = placePart(purchased, 'seat', 'passengerSeat');
    expect(passengerCapacity(placed.workshopBuild)).toBe(1);
    expect(() => refundPart(placed, 'seat')).toThrow('Retira primero');
    const removed = removePart(placed, 'passengerSeat');
    const refunded = refundPart(removed, 'seat');
    expect(refunded.wallet).toBe(initial.wallet);
    expect(refunded.ownedParts.seat).toBe(1);
    expect(initial.ownedParts.seat).toBe(1);
  });

  it('rechaza una compra sin fondos y anclajes incorrectos', () => {
    const initial = createInitialGameModel();
    const poor = { ...initial, wallet: 0 };
    expect(() => buyPart(poor, 'engine')).toThrow('Dinero insuficiente');
    expect(() => placePart(initial, 'seat', 'frontWheel')).toThrow('no encaja');
    expect(() => placePart(initial, 'seat', 'passengerSeat')).toThrow('No hay piezas libres');
  });

  it('mantiene fijo el asiento del conductor, aunque permite moverlo', () => {
    const initial = createInitialGameModel();
    const removedWheel = removePart(initial, 'frontWheel');
    expect(validateBuild(removedWheel.workshopBuild)).toBeNull();
    expect(() => removePart(initial, 'driverSeat')).toThrow('solo se puede mover');
    expect(() => removeGridPart(initial, DRIVER_SEAT_ID)).toThrow('solo se puede mover');
    const moved = moveGridPart(initial, DRIVER_SEAT_ID, 4, 1);
    expect(gridForModel(moved).find((item) => item.id === DRIVER_SEAT_ID)).toMatchObject({
      column: 4, row: 1,
    });
    expect(() => refundPart(initial, 'wheel')).toThrow('kit básico');
  });

  it('permite posiciones libres, evita solapamientos y detecta piezas sueltas', () => {
    const initial = createInitialGameModel();
    const withoutEngine = removePart(initial, 'engine');
    const roofEngine = placeGridPart(withoutEngine, 'engine', 4, 0);
    const stats = gridBuildStats(gridForModel(roofEngine));
    expect(stats.loosePieces).toBe(1);
    expect(stats.engineForceN).toBe(0);
    const withExtraSeat = buyPart(roofEngine, 'seat');
    expect(() => placeGridPart(withExtraSeat, 'seat', 4, 0)).toThrow('ocupado');
  });

  it('limita la parrilla al techo y el portabicis al extremo trasero izquierdo', () => {
    const withRack = buyPart(createInitialGameModel(), 'roofRack');
    expect(() => placeGridPart(withRack, 'roofRack', 1, 2)).toThrow('arriba');
    const mountedRack = placeGridPart(withRack, 'roofRack', 4, 0);
    expect(gridVehicleCapacity(gridForModel(mountedRack)).roofCargo).toBe(1);

    const withCarrier = buyPart(mountedRack, 'rearCarrier');
    expect(() => placeGridPart(withCarrier, 'rearCarrier', 1, 3)).toThrow('trasera izquierda');
    const mountedCarrier = placeGridPart(withCarrier, 'rearCarrier', 0, 3);
    expect(gridVehicleCapacity(gridForModel(mountedCarrier)).scooter).toBe(1);
  });

  it('mueve una pieza colocada sin duplicarla ni consumir inventario', () => {
    const initial = createInitialGameModel();
    const moved = moveGridPart(initial, 'engine-1', 5, 1);
    expect(gridForModel(moved).find((item) => item.id === 'engine-1')).toMatchObject({
      column: 5,
      row: 1,
    });
    expect(gridForModel(moved).filter((item) => item.kind === 'engine')).toHaveLength(1);
    expect(() => moveGridPart(moved, 'engine-1', 8, 3)).toThrow('ocupado');
  });

  it('reembolsa por completo una pieza adicional libre', () => {
    const initial = createInitialGameModel();
    const purchased = buyPart(initial, 'seat');
    const used = { ...purchased, pendingPurchases: { ...purchased.pendingPurchases, seat: 0 } };
    const refunded = refundPart(used, 'seat');
    expect(refunded.wallet).toBe(initial.wallet);
  });

  it('reembolsa una compra reciente y cancela su estado pendiente', () => {
    const initial = createInitialGameModel();
    const purchased = buyPart(initial, 'seat');
    const refunded = refundPart(purchased, 'seat');
    expect(refunded.wallet).toBe(initial.wallet);
    expect(refunded.ownedParts.seat).toBe(1);
    expect(refunded.pendingPurchases.seat).toBe(0);
  });

  it('calcula masa y centro de gravedad de una construcción conocida', () => {
    const initialStats = buildStats(createInitialGameModel().workshopBuild);
    expect(initialStats.massKg).toBe(768);
    expect(initialStats.bodyMassKg).toBe(768);
    expect(initialStats.engineForceN).toBe(3000);
    const demoStats = buildStats(createDemoGameModel().workshopBuild);
    expect(demoStats.massKg).toBe(866);
    expect(demoStats.bodyMassKg).toBe(804);
    expect(demoStats.centerOfMass.y).toBeGreaterThan(initialStats.centerOfMass.y);
  });

  it('crea un perfil de demostración completo y sin compras pendientes', () => {
    const demo = createDemoGameModel();
    expect(demo.unlockedLevel).toBe(5);
    expect(validateBuild(demo.workshopBuild)).toBeNull();
    expect(Object.values(demo.pendingPurchases).every((count) => count === 0)).toBe(true);
  });

  it('limpia piezas opcionales sin perder el kit ni el inventario', () => {
    const demo = createDemoGameModel();
    const cleaned = clearOptionalParts(demo);
    expect(validateBuild(cleaned.workshopBuild)).toBeNull();
    expect(cleaned.workshopBuild.roof).toBeUndefined();
    expect(cleaned.ownedParts).toEqual(demo.ownedParts);
  });

  it('recupera el último arreglo y cobra sólo las piezas faltantes del nivel', () => {
    const purchased = buyPart(createInitialGameModel(), 'seat');
    const arranged = placeGridPart(purchased, 'seat', 4, 3);
    const remembered = rememberLastRideBuild(arranged);
    const nextWorkshop = prepareLevelWorkshop(remembered, 100);
    const restored = restoreLastRideBuild(nextWorkshop);
    expect(gridForModel(restored)).toEqual(gridForModel(arranged));
    expect(restored.wallet).toBe(85);
    expect(restored.pendingPurchases.seat).toBe(1);
  });

  it('explica cuando el presupuesto no alcanza para recuperar el arreglo', () => {
    const remembered = rememberLastRideBuild(createDemoGameModel());
    const emptyBudget = prepareLevelWorkshop(remembered, 0);
    expect(() => restoreLastRideBuild(emptyBudget)).toThrow('Faltan S/');
  });
});
