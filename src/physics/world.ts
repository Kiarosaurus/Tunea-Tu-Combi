import type { Vector2 } from '../core/contracts';
import { add, cross, dot, length, rotate, scale, subtract } from '../core/vector2';

export interface WheelCollider {
  readonly offset: Vector2;
  readonly radius: number;
  readonly frictionCoefficient?: number;
  readonly suspension?: SuspensionParameters;
}

export interface BoxCollider {
  readonly offset: Vector2;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly frictionCoefficient?: number;
}

export interface SuspensionParameters {
  readonly restLengthM: number;
  readonly maxCompressionM: number;
  readonly stiffnessNPerM: number;
  readonly dampingNsPerM: number;
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
  massKg: number;
  inertiaKgM2: number;
  force: Vector2;
  torqueNm: number;
  readonly wheels: readonly WheelCollider[];
  readonly chassisCollider?: BoxCollider;
  readonly centerOfMassOffset?: Vector2;
}

export interface WheelContact {
  readonly point: Vector2;
  readonly normal: Vector2;
  readonly penetration: number;
  readonly wheelIndex: number;
  readonly normalImpulseNs: number;
  readonly frictionImpulseNs: number;
}

export interface SuspensionForce {
  readonly wheelIndex: number;
  readonly point: Vector2;
  readonly compressionM: number;
  readonly forceN: number;
}

export interface JointMount {
  readonly id: string;
  readonly offset: Vector2;
  readonly massKg: number;
  readonly breakImpulseNs: number;
}

export interface JointState extends JointMount {
  readonly broken: boolean;
}

export interface WorldSnapshot {
  readonly body: Readonly<RigidBody>;
  readonly terrain: readonly TerrainSegment[];
  readonly contacts: readonly WheelContact[];
  readonly suspensionForces: readonly SuspensionForce[];
  readonly joints: readonly JointState[];
  readonly payloadMassKg: number;
  readonly lostPayloadIds: readonly string[];
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
  #suspensionForces: SuspensionForce[] = [];
  #joints: JointState[];
  readonly #payloads = new Map<string, {
    readonly massKg: number;
    readonly offset: Vector2;
    readonly jointId?: string;
  }>();
  readonly #lostPayloadIds = new Set<string>();

  constructor(body: RigidBody, terrain: readonly TerrainSegment[], joints: readonly JointMount[] = []) {
    validateBody(body);
    if (terrain.length === 0 || terrain.some((segment) =>
      ![segment.start.x, segment.start.y, segment.end.x, segment.end.y].every(Number.isFinite) ||
      segment.end.x <= segment.start.x ||
      length(subtract(segment.end, segment.start)) < 1e-6)) {
      throw new Error('El terreno requiere segmentos finitos de izquierda a derecha.');
    }
    this.#body = body;
    this.#terrain = terrain;
    if (joints.some((joint) => !joint.id || joint.massKg <= 0 || joint.breakImpulseNs <= 0 ||
      ![joint.offset.x, joint.offset.y, joint.massKg, joint.breakImpulseNs].every(Number.isFinite)) ||
      new Set(joints.map((joint) => joint.id)).size !== joints.length) {
      throw new Error('Las uniones requieren identificadores únicos, masa y umbral válidos.');
    }
    this.#joints = joints.map((joint) => ({ ...joint, offset: { ...joint.offset }, broken: false }));
    for (const joint of joints) {
      body.massKg += joint.massKg;
      body.inertiaKgM2 += joint.massKg * dot(joint.offset, joint.offset);
    }
  }

  step(durationSeconds: number): void {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 1 / 30) {
      throw new Error('El paso físico debe ser finito y corto.');
    }

    const body = this.#body;
    this.#applySuspensionForces();
    const acceleration = add(GRAVITY, scale(body.force, 1 / body.massKg));
    body.velocity = add(body.velocity, scale(acceleration, durationSeconds));
    body.angularVelocity += (body.torqueNm / body.inertiaKgM2) * durationSeconds;
    body.velocity = limitVector(body.velocity, MAX_SPEED);
    body.angularVelocity = clamp(body.angularVelocity, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);
    body.position = add(body.position, scale(body.velocity, durationSeconds));
    body.angleRadians += body.angularVelocity * durationSeconds;
    body.force = { x: 0, y: 0 };
    body.torqueNm = 0;

    const contactImpulses = new Map<number, ContactImpulses>();
    const chassisImpulses = new Map<string, ContactImpulses>();
    // Dos pasadas reducen la penetración de ruedas y carrocería contra la pista.
    for (let pass = 0; pass < 2; pass += 1) {
      for (let wheelIndex = 0; wheelIndex < body.wheels.length; wheelIndex += 1) {
        const wheel = body.wheels[wheelIndex];
        if (!wheel) continue;
        for (const segment of this.#terrain) {
          const contact = findContact(body, wheel, segment, wheelIndex);
          if (contact) {
            const impulses = resolveContact(body, contact, wheel.frictionCoefficient,
              durationSeconds, pass === 0, body.wheels.length);
            if (pass === 0) contactImpulses.set(wheelIndex, impulses);
            this.#breakOverloadedJoints(impulses.normalImpulseNs);
          }
        }
      }
      for (const [contactId, contact] of findChassisContacts(body, this.#terrain)) {
        const impulses = resolveContact(body, contact,
          body.chassisCollider?.frictionCoefficient, durationSeconds, pass === 0, 4);
        if (pass === 0) chassisImpulses.set(contactId, impulses);
        this.#breakOverloadedJoints(impulses.normalImpulseNs);
      }
    }

    const wheelContacts = body.wheels.flatMap((wheel, wheelIndex) =>
      this.#terrain.flatMap((segment) => {
        const contact = findContact(body, wheel, segment, wheelIndex);
        if (!contact) return [];
        const impulses = contactImpulses.get(wheelIndex);
        return [{ ...contact,
          normalImpulseNs: impulses?.normalImpulseNs ?? 0,
          frictionImpulseNs: impulses?.frictionImpulseNs ?? 0 }];
      }),
    );
    const chassisContacts = findChassisContacts(body, this.#terrain).map(([contactId, contact]) => {
      const impulses = chassisImpulses.get(contactId);
      return { ...contact,
        normalImpulseNs: impulses?.normalImpulseNs ?? 0,
        frictionImpulseNs: impulses?.frictionImpulseNs ?? 0 };
    });
    this.#contacts = [...wheelContacts, ...chassisContacts];

    if (!isFiniteBody(body)) throw new Error('La simulación produjo un estado no finito.');
  }

  applyForce(force: Vector2, point: Vector2 = this.#body.position): void {
    if (![force.x, force.y, point.x, point.y].every(Number.isFinite)) {
      throw new Error('La fuerza y el punto deben ser finitos.');
    }
    this.#body.force = add(this.#body.force, force);
    this.#body.torqueNm += cross(subtract(point, this.#body.position), force);
  }

  attachPayload(id: string, massKg: number, offset: Vector2 = { x: 0, y: 0 }, jointId?: string): void {
    if (!id || this.#payloads.has(id) || !(massKg > 0) ||
      ![massKg, offset.x, offset.y].every(Number.isFinite)) {
      throw new Error('La carga física requiere un identificador nuevo, masa y posición válidos.');
    }
    if (jointId && !this.#joints.some((joint) => joint.id === jointId && !joint.broken)) {
      throw new Error('La carga física requiere una unión disponible.');
    }
    this.#payloads.set(id, { massKg, offset: { ...offset }, ...(jointId ? { jointId } : {}) });
    this.#body.massKg += massKg;
    this.#body.inertiaKgM2 += massKg * dot(offset, offset);
  }

  detachPayload(id: string): void {
    const payload = this.#payloads.get(id);
    if (!payload) throw new Error('La carga física no está montada.');
    this.#body.massKg -= payload.massKg;
    this.#body.inertiaKgM2 -= payload.massKg * dot(payload.offset, payload.offset);
    this.#payloads.delete(id);
  }

  #applySuspensionForces(): void {
    const body = this.#body;
    this.#suspensionForces = [];
    for (const [wheelIndex, wheel] of body.wheels.entries()) {
      const suspension = wheel.suspension;
      if (!suspension) continue;
      const mount = add(body.position, rotate(wheel.offset, body.angleRadians));
      const segment = this.#terrain.find((candidate) =>
        mount.x >= candidate.start.x && mount.x <= candidate.end.x);
      if (!segment) continue;
      const fraction = (mount.x - segment.start.x) / (segment.end.x - segment.start.x);
      const groundY = segment.start.y + (segment.end.y - segment.start.y) * fraction;
      const clearance = mount.y - wheel.radius - groundY;
      const compression = clamp(suspension.restLengthM - clearance, 0,
        suspension.maxCompressionM);
      if (compression === 0) continue;
      const arm = subtract(mount, body.position);
      const mountVelocityY = body.velocity.y + body.angularVelocity * arm.x;
      const springForce = Math.max(0, suspension.stiffnessNPerM * compression -
        suspension.dampingNsPerM * mountVelocityY);
      this.#suspensionForces.push({ wheelIndex, point: { ...mount },
        compressionM: compression, forceN: springForce });
      this.applyForce({ x: 0, y: springForce }, mount);
    }
  }

  #breakOverloadedJoints(impactImpulse: number): void {
    if (impactImpulse <= 0) return;
    this.#joints = this.#joints.map((joint) => {
      if (joint.broken || impactImpulse < joint.breakImpulseNs) return joint;
      this.#body.massKg -= joint.massKg;
      this.#body.inertiaKgM2 -= joint.massKg * dot(joint.offset, joint.offset);
      this.#dropPayloadsForJoint(joint.id);
      return { ...joint, broken: true };
    });
  }

  #dropPayloadsForJoint(jointId: string): void {
    for (const [id, payload] of this.#payloads) {
      if (payload.jointId !== jointId) continue;
      this.#body.massKg -= payload.massKg;
      this.#body.inertiaKgM2 -= payload.massKg * dot(payload.offset, payload.offset);
      this.#payloads.delete(id);
      this.#lostPayloadIds.add(id);
    }
  }

  snapshot(): WorldSnapshot {
    const body = this.#body;
    return {
      body: {
        ...body,
        position: { ...body.position },
        velocity: { ...body.velocity },
        force: { ...body.force },
        wheels: body.wheels.map((wheel) => ({
          ...wheel,
          offset: { ...wheel.offset },
          ...(wheel.suspension ? { suspension: { ...wheel.suspension } } : {}),
        })),
        ...(body.chassisCollider ? { chassisCollider: {
          ...body.chassisCollider,
          offset: { ...body.chassisCollider.offset },
        } } : {}),
        ...(body.centerOfMassOffset ? { centerOfMassOffset: { ...body.centerOfMassOffset } } : {}),
      },
      terrain: this.#terrain.map((segment) => ({ start: { ...segment.start }, end: { ...segment.end } })),
      contacts: this.#contacts.map((contact) => ({
        ...contact,
        point: { ...contact.point },
        normal: { ...contact.normal },
      })),
      suspensionForces: this.#suspensionForces.map((spring) => ({
        ...spring,
        point: { ...spring.point },
      })),
      joints: this.#joints.map((joint) => ({ ...joint, offset: { ...joint.offset } })),
      payloadMassKg: [...this.#payloads.values()].reduce((total, payload) => total + payload.massKg, 0),
      lostPayloadIds: [...this.#lostPayloadIds],
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
  return { point: nearest, normal: upwardNormal, penetration, wheelIndex,
    normalImpulseNs: 0, frictionImpulseNs: 0 };
}

function findChassisContacts(body: RigidBody,
  terrain: readonly TerrainSegment[]): readonly [string, WheelContact][] {
  const collider = body.chassisCollider;
  if (!collider) return [];
  const localCorners: readonly Vector2[] = [
    { x: -collider.halfWidth, y: -collider.halfHeight },
    { x: collider.halfWidth, y: -collider.halfHeight },
    { x: -collider.halfWidth, y: collider.halfHeight },
    { x: collider.halfWidth, y: collider.halfHeight },
  ];
  const contacts: [string, WheelContact][] = [];
  for (const [cornerIndex, corner] of localCorners.entries()) {
    const point = add(body.position, rotate(add(collider.offset, corner), body.angleRadians));
    for (const [segmentIndex, segment] of terrain.entries()) {
      const tangent = subtract(segment.end, segment.start);
      const tangentLengthSquared = dot(tangent, tangent);
      const rawProjection = dot(subtract(point, segment.start), tangent) / tangentLengthSquared;
      if (rawProjection < 0 || rawProjection > 1) continue;
      const nearest = add(segment.start, scale(tangent, rawProjection));
      const upwardNormal = {
        x: -tangent.y / Math.sqrt(tangentLengthSquared),
        y: tangent.x / Math.sqrt(tangentLengthSquared),
      };
      const distance = dot(subtract(point, nearest), upwardNormal);
      if (distance >= 0) continue;
      contacts.push([`${cornerIndex}:${segmentIndex}`, {
        point: nearest,
        normal: upwardNormal,
        penetration: -distance,
        wheelIndex: -1,
        normalImpulseNs: 0,
        frictionImpulseNs: 0,
      }]);
    }
  }
  return contacts;
}

interface ContactImpulses {
  readonly normalImpulseNs: number;
  readonly frictionImpulseNs: number;
}

function resolveContact(
  body: RigidBody,
  contact: WheelContact,
  frictionCoefficient: number | undefined,
  durationSeconds: number,
  applyFriction: boolean,
  supportContactCount: number,
): ContactImpulses {
  const offset = subtract(contact.point, body.position);
  const pointVelocity = add(body.velocity, { x: -body.angularVelocity * offset.y, y: body.angularVelocity * offset.x });
  const normalSpeed = dot(pointVelocity, contact.normal);
  let normalImpulse = 0;
  let frictionImpulse = 0;
  if (normalSpeed < 0) {
    const lever = cross(offset, contact.normal);
    const inverseEffectiveMass = 1 / body.massKg + (lever * lever) / body.inertiaKgM2;
    normalImpulse = -normalSpeed / inverseEffectiveMass;
    body.velocity = add(body.velocity, scale(contact.normal, normalImpulse / body.massKg));
    body.angularVelocity += (lever * normalImpulse) / body.inertiaKgM2;
  }
  if (applyFriction && frictionCoefficient) {
    const tangent = { x: contact.normal.y, y: -contact.normal.x };
    const tangentLever = cross(offset, tangent);
    const inverseEffectiveMass = 1 / body.massKg + (tangentLever * tangentLever) / body.inertiaKgM2;
    const updatedPointVelocity = add(body.velocity, {
      x: -body.angularVelocity * offset.y,
      y: body.angularVelocity * offset.x,
    });
    const desiredImpulse = -dot(updatedPointVelocity, tangent) / inverseEffectiveMass;
    // La gravedad aporta soporte aun cuando la rueda ya reposaba en el suelo.
    const supportImpulse = body.massKg * Math.max(0, -dot(GRAVITY, contact.normal))
      * durationSeconds / supportContactCount;
    const frictionLimit = frictionCoefficient * Math.max(normalImpulse, supportImpulse);
    frictionImpulse = clamp(desiredImpulse, -frictionLimit, frictionLimit);
    body.velocity = add(body.velocity, scale(tangent, frictionImpulse / body.massKg));
    body.angularVelocity += (tangentLever * frictionImpulse) / body.inertiaKgM2;
  }
  body.position = add(body.position, scale(contact.normal, Math.max(contact.penetration - POSITION_SLOP, 0) * 0.8));
  return { normalImpulseNs: normalImpulse, frictionImpulseNs: frictionImpulse };
}

function validateBody(body: RigidBody): void {
  if (!(body.massKg > 0) || !(body.inertiaKgM2 > 0) ||
    !Number.isFinite(body.massKg) || !Number.isFinite(body.inertiaKgM2) ||
    body.wheels.some((wheel) => !(wheel.radius > 0) ||
      ![wheel.offset.x, wheel.offset.y, wheel.radius].every(Number.isFinite) ||
      (wheel.frictionCoefficient !== undefined &&
        (!Number.isFinite(wheel.frictionCoefficient) || wheel.frictionCoefficient < 0 || wheel.frictionCoefficient > 2)) ||
      (wheel.suspension !== undefined && !validSuspension(wheel.suspension))) ||
    (body.chassisCollider !== undefined && (!(body.chassisCollider.halfWidth > 0) ||
      !(body.chassisCollider.halfHeight > 0) ||
      ![body.chassisCollider.offset.x, body.chassisCollider.offset.y,
        body.chassisCollider.halfWidth, body.chassisCollider.halfHeight].every(Number.isFinite) ||
      (body.chassisCollider.frictionCoefficient !== undefined &&
        (!Number.isFinite(body.chassisCollider.frictionCoefficient) ||
          body.chassisCollider.frictionCoefficient < 0 || body.chassisCollider.frictionCoefficient > 2)))) ||
    (body.centerOfMassOffset !== undefined &&
      ![body.centerOfMassOffset.x, body.centerOfMassOffset.y].every(Number.isFinite)) ||
    !isFiniteBody(body)) {
    throw new Error('El cuerpo físico requiere masa, inercia y valores finitos.');
  }
}

function validSuspension(suspension: SuspensionParameters): boolean {
  return [suspension.restLengthM, suspension.maxCompressionM,
    suspension.stiffnessNPerM, suspension.dampingNsPerM].every(Number.isFinite) &&
    suspension.restLengthM > 0 && suspension.maxCompressionM > 0 &&
    suspension.maxCompressionM <= suspension.restLengthM &&
    suspension.stiffnessNPerM > 0 && suspension.dampingNsPerM >= 0;
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
