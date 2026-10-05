import { describe, expect, it } from 'vitest';
import {
  buyPart,
  createInitialGameModel,
  passengerCapacity,
  placePart,
  removePart,
  returnPurchase,
  sellPart,
  validateBuild,
} from './model';

describe('taller y economía', () => {
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
    expect(() => returnPurchase(placed, 'seat')).toThrow('Retira primero');
    const removed = removePart(placed, 'passengerSeat');
    const refunded = returnPurchase(removed, 'seat');
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

  it('valida las piezas esenciales y protege el kit básico', () => {
    const initial = createInitialGameModel();
    const removedWheel = removePart(initial, 'frontWheel');
    expect(validateBuild(removedWheel.workshopBuild)).toBe('Faltan dos ruedas.');
    expect(() => sellPart(initial, 'wheel')).toThrow('kit básico');
  });

  it('vende una pieza usada libre con reembolso parcial', () => {
    const initial = createInitialGameModel();
    const purchased = buyPart(initial, 'seat');
    const used = { ...purchased, pendingPurchases: { ...purchased.pendingPurchases, seat: 0 } };
    const sold = sellPart(used, 'seat');
    expect(sold.wallet).toBe(initial.wallet - 15 + 11);
  });
});
