import type { Vector2 } from '../core/contracts';
import { add, cross, dot, length, rotate, scale, subtract } from '../core/vector2';

export interface WheelCollider {
  readonly offset: Vector2;
  readonly radius: number;
}

export interface TerrainSegment {
  readonly start: Vector2;
  readonly end: Vector2;
}

export interface RigidBody {
  readonly id: string;
  position: Vector2;
  angleRadians: number;
  velocity: Vector2;
  angularVelocity: number;
  readonly massKg: number;
  readonly inertiaKgM2: number;
  force: Vector2;
  torqueNm: number;
  readonly wheels: readonly WheelCollider[];
}

export interface WheelContact {
  readonly point: Vector2;
  readonly normal: Vector2;
  readonly penetration: number;
  readonly wheelIndex: number;
}

export interface WorldSnapshot {
  readonly body: Readonly<RigidBody>;
  readonly terrain: readonly TerrainSegment[];
  readonly contacts: readonly WheelContact[];
  readonly gravity: Vector2;
}

// El mundo usa metros, kilogramos, segundos y newtons; el eje y apunta hacia arriba.
const GRAVITY: Vector2 = { x: 0, y: -9.81 };
const MAX_SPEED = 30;
const MAX_ANGULAR_SPEED = 8;
const MAX_COORDINATE = 1000;
const POSITION_SLOP = 0.001;

export class PhysicsWorld {
  readonly #body: RigidBody;
  readonly #terrain: readonly TerrainSegment[];
  #contacts: WheelContact[] = [];

  constructor(body: RigidBody, terrain: readonly TerrainSegment[]) {
    validateBody(body);
    if (terrain.length === 0 || terrain.some((segment) =>
      ![segment.start.x, segment.start.y, segment.end.x, segment.end.y].every(Number.isFinite) ||
      segment.end.x <= segment.start.x ||
      length(subtract(segment.end, segment.start)) < 1e-6)) {
      throw new Error('El terreno requiere segmentos finitos de izquierda a derecha.');
    }
    this.#body = body;
    this.#terrain = terrain;
  }

  step(durationSeconds: number): void {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 1 / 30) {
      throw new Error('El paso físico debe ser finito y corto.');
    }

    const body = this.#body;
    const acceleration = add(GRAVITY, scale(body.force, 1 / body.massKg));
    body.velocity = add(body.velocity, scale(acceleration, durationSeconds));
    body.angularVelocity += (body.torqueNm / body.inertiaKgM2) * durationSeconds;
    body.velocity = limitVector(body.velocity, MAX_SPEED);
    body.angularVelocity = clamp(body.angularVelocity, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);
    body.position = add(body.position, scale(body.velocity, durationSeconds));
    body.angleRadians += body.angularVelocity * durationSeconds;
    body.force = { x: 0, y: 0 };
    body.torqueNm = 0;

    // Dos pasadas reducen la penetración cuando las dos ruedas tocan el suelo.
    for (let pass = 0; pass < 2; pass += 1) {
      for (let wheelIndex = 0; wheelIndex < body.wheels.length; wheelIndex += 1) {
        const wheel = body.wheels[wheelIndex];
        if (!wheel) continue;
        for (const segment of this.#terrain) {
          const contact = findContact(body, wheel, segment, wheelIndex);
          if (contact) resolveContact(body, contact);
        }
      }
    }

    this.#contacts = body.wheels.flatMap((wheel, wheelIndex) =>
      this.#terrain.flatMap((segment) => {
        const contact = findContact(body, wheel, segment, wheelIndex);
        return contact ? [contact] : [];
      }),
    );

    if (!isFiniteBody(body)) throw new Error('La simulación produjo un estado no finito.');
  }

  applyForce(force: Vector2, point: Vector2 = this.#body.position): void {
    if (![force.x, force.y, point.x, point.y].every(Number.isFinite)) {
      throw new Error('La fuerza y el punto deben ser finitos.');
    }
    this.#body.force = add(this.#body.force, force);
    this.#body.torqueNm += cross(subtract(point, this.#body.position), force);
  }

  snapshot(): WorldSnapshot {
    const body = this.#body;
    return {
      body: {
        ...body,
        position: { ...body.position },
        velocity: { ...body.velocity },
        force: { ...body.force },
        wheels: body.wheels.map((wheel) => ({ offset: { ...wheel.offset }, radius: wheel.radius })),
      },
      terrain: this.#terrain.map((segment) => ({ start: { ...segment.start }, end: { ...segment.end } })),
      contacts: this.#contacts.map((contact) => ({
        ...contact,
        point: { ...contact.point },
        normal: { ...contact.normal },
      })),
      gravity: { ...GRAVITY },
    };
  }
}

function findContact(
  body: RigidBody,
  wheel: WheelCollider,
  segment: TerrainSegment,
  wheelIndex: number,
): WheelContact | null {
  const center = add(body.position, rotate(wheel.offset, body.angleRadians));
  const tangent = subtract(segment.end, segment.start);
  const tangentLengthSquared = dot(tangent, tangent);
  const rawProjection = dot(subtract(center, segment.start), tangent) / tangentLengthSquared;
  const projection = clamp(rawProjection, 0, 1);
  const nearest = add(segment.start, scale(tangent, projection));
  const upwardNormal = { x: -tangent.y / Math.sqrt(tangentLengthSquared), y: tangent.x / Math.sqrt(tangentLengthSquared) };
  const distance = dot(subtract(center, nearest), upwardNormal);
  const penetration = wheel.radius - distance;
  if (penetration <= 0 ||
    ((rawProjection < 0 || rawProjection > 1) && length(subtract(center, nearest)) > wheel.radius)) {
    return null;
  }
  return { point: nearest, normal: upwardNormal, penetration, wheelIndex };
}

function resolveContact(body: RigidBody, contact: WheelContact): void {
  const offset = subtract(contact.point, body.position);
  const pointVelocity = add(body.velocity, { x: -body.angularVelocity * offset.y, y: body.angularVelocity * offset.x });
  const normalSpeed = dot(pointVelocity, contact.normal);
  if (normalSpeed < 0) {
    const lever = cross(offset, contact.normal);
    const inverseEffectiveMass = 1 / body.massKg + (lever * lever) / body.inertiaKgM2;
    const impulse = -normalSpeed / inverseEffectiveMass;
    body.velocity = add(body.velocity, scale(contact.normal, impulse / body.massKg));
    body.angularVelocity += (lever * impulse) / body.inertiaKgM2;
  }
  body.position = add(body.position, scale(contact.normal, Math.max(contact.penetration - POSITION_SLOP, 0) * 0.8));
}

function validateBody(body: RigidBody): void {
  if (!(body.massKg > 0) || !(body.inertiaKgM2 > 0) ||
    !Number.isFinite(body.massKg) || !Number.isFinite(body.inertiaKgM2) ||
    body.wheels.length === 0 ||
    body.wheels.some((wheel) => !(wheel.radius > 0) ||
      ![wheel.offset.x, wheel.offset.y, wheel.radius].every(Number.isFinite)) || !isFiniteBody(body)) {
    throw new Error('El cuerpo físico requiere masa, inercia, ruedas y valores finitos.');
  }
}

function isFiniteBody(body: RigidBody): boolean {
  const coordinates = [body.position.x, body.position.y];
  const dynamics = [body.angleRadians, body.velocity.x, body.velocity.y,
    body.angularVelocity, body.force.x, body.force.y, body.torqueNm];
  return coordinates.every((value) => Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE)
    && dynamics.every(Number.isFinite);
}

function limitVector(vector: Vector2, limit: number): Vector2 {
  const magnitude = length(vector);
  return magnitude > limit ? scale(vector, limit / magnitude) : vector;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
