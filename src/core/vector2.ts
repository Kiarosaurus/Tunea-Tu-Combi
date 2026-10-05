import type { Vector2 } from './contracts';

export function add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(vector: Vector2, factor: number): Vector2 {
  return { x: vector.x * factor, y: vector.y * factor };
}

export function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Vector2, b: Vector2): number {
  return a.x * b.y - a.y * b.x;
}

export function length(vector: Vector2): number {
  return Math.hypot(vector.x, vector.y);
}

export function rotate(vector: Vector2, angleRadians: number): Vector2 {
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  };
}
