import { describe, expect, it } from 'vitest';
import { dragAnchorFromElement, gridTargetFromPointer } from './gridPointer';

const geometry = { originX: 100, originY: 200, columnStep: 44, rowStep: 56 };

describe('mapeo del puntero a la cuadrícula', () => {
  it('conserva la celda cuando una pieza se agarra desde distintos puntos', () => {
    const left = geometry.originX + 3 * geometry.columnStep;
    const top = geometry.originY + 2 * geometry.rowStep;
    for (const [offsetX, offsetY] of [[4, 5], [38, 48], [66, 20]] as const) {
      const anchor = dragAnchorFromElement(left + offsetX, top + offsetY, left, top,
        geometry.columnStep, geometry.rowStep);
      expect(gridTargetFromPointer(left + offsetX, top + offsetY, geometry, anchor))
        .toEqual({ column: 3, row: 2 });
    }
  });

  it('mueve una pieza de varias celdas sin convertir el cursor en su esquina', () => {
    const anchor = { columnOffset: 1.45, rowOffset: 0.4 };
    const pointerX = geometry.originX + (5 + anchor.columnOffset) * geometry.columnStep;
    const pointerY = geometry.originY + (3 + anchor.rowOffset) * geometry.rowStep;
    expect(gridTargetFromPointer(pointerX, pointerY, geometry, anchor))
      .toEqual({ column: 5, row: 3 });
  });

  it('cambia de objetivo al cruzar la mitad del paso entre celdas', () => {
    const anchor = { columnOffset: 0.5, rowOffset: 0.5 };
    expect(gridTargetFromPointer(geometry.originX + 1.99 * geometry.columnStep,
      geometry.originY + 1.5 * geometry.rowStep, geometry, anchor).column).toBe(1);
    expect(gridTargetFromPointer(geometry.originX + 2.01 * geometry.columnStep,
      geometry.originY + 1.5 * geometry.rowStep, geometry, anchor).column).toBe(2);
  });
});
