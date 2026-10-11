export interface GridPointerGeometry {
  readonly originX: number;
  readonly originY: number;
  readonly columnStep: number;
  readonly rowStep: number;
}

export interface GridDragAnchor {
  readonly columnOffset: number;
  readonly rowOffset: number;
}

export interface GridCellTarget {
  readonly column: number;
  readonly row: number;
}

export function gridTargetFromPointer(
  pointerX: number,
  pointerY: number,
  geometry: GridPointerGeometry,
  anchor: GridDragAnchor,
): GridCellTarget {
  if (![pointerX, pointerY, geometry.originX, geometry.originY, geometry.columnStep,
    geometry.rowStep, anchor.columnOffset, anchor.rowOffset].every(Number.isFinite) ||
    geometry.columnStep <= 0 || geometry.rowStep <= 0) {
    throw new Error('La geometría del arrastre debe ser finita y positiva.');
  }
  return {
    column: Math.round((pointerX - geometry.originX) / geometry.columnStep - anchor.columnOffset),
    row: Math.round((pointerY - geometry.originY) / geometry.rowStep - anchor.rowOffset),
  };
}

export function dragAnchorFromElement(
  pointerX: number,
  pointerY: number,
  elementLeft: number,
  elementTop: number,
  columnStep: number,
  rowStep: number,
): GridDragAnchor {
  if (![pointerX, pointerY, elementLeft, elementTop, columnStep, rowStep].every(Number.isFinite) ||
    columnStep <= 0 || rowStep <= 0) {
    throw new Error('El punto de agarre debe usar medidas finitas y positivas.');
  }
  return {
    columnOffset: (pointerX - elementLeft) / columnStep,
    rowOffset: (pointerY - elementTop) / rowStep,
  };
}
