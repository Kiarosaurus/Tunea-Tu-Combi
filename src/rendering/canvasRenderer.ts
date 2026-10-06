import type { AppSnapshot } from '../app/appController';
import type { Disposable } from '../core/contracts';
import { add, rotate } from '../core/vector2';
import { LEVELS } from '../data/levels';
import { TRANSIT_ROUTE } from '../data/transitRoute';
import { STOP_RADIUS_METERS } from '../game/rideSession';
import { requestFare } from '../game/requests';
import type { WorldSnapshot } from '../physics/world';

export interface CanvasRenderer extends Disposable {
  render(snapshot: AppSnapshot, world: WorldSnapshot): void;
}

interface RequestHitArea {
  readonly requestId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function createCanvasRenderer(canvas: HTMLCanvasElement,
  onPassengerClick?: (requestId: string) => void): CanvasRenderer {
  const canvasContext = canvas.getContext('2d');
  if (!canvasContext) throw new Error('El navegador no ofrece Canvas 2D.');
  const context = canvasContext;

  let currentSnapshot: AppSnapshot | null = null;
  let currentWorld: WorldSnapshot | null = null;
  let requestHitAreas: readonly RequestHitArea[] = [];

  function resize(): void {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    if (currentWorld && currentSnapshot) {
      requestHitAreas = draw(context, width, height, currentSnapshot, currentWorld);
      const pickup = requestHitAreas[0];
      if (pickup) {
        canvas.dataset.pickupRequest = pickup.requestId;
        canvas.dataset.pickupX = String(pickup.x + pickup.width / 2);
        canvas.dataset.pickupY = String(pickup.y + pickup.height / 2);
      } else {
        delete canvas.dataset.pickupRequest;
        delete canvas.dataset.pickupX;
        delete canvas.dataset.pickupY;
      }
    }
  }

  const pointerPosition = (event: PointerEvent): { x: number; y: number } => {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const requestAt = (point: { readonly x: number; readonly y: number }): RequestHitArea | undefined =>
    requestHitAreas.find((area) => point.x >= area.x && point.x <= area.x + area.width &&
      point.y >= area.y && point.y <= area.y + area.height);
  const handlePointerMove = (event: PointerEvent): void => {
    canvas.style.cursor = requestAt(pointerPosition(event)) ? 'pointer' : '';
  };
  const handlePointerUp = (event: PointerEvent): void => {
    const hit = requestAt(pointerPosition(event));
    if (hit) onPassengerClick?.(hit.requestId);
  };
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  return {
    render(snapshot, world): void {
      currentSnapshot = snapshot;
      currentWorld = world;
      canvas.dataset.physicsY = world.body.position.y.toFixed(4);
      canvas.dataset.contactCount = String(world.contacts.length);
      canvas.dataset.routeCode = snapshot.state === 'PLAYING' ? TRANSIT_ROUTE.code : '';
      canvas.dataset.passengerCapacity = String(snapshot.passengerCapacity);
      resize();
    },
    destroy(): void {
      resizeObserver.disconnect();
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
    },
  };
}

function draw(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: AppSnapshot,
  world: WorldSnapshot,
): readonly RequestHitArea[] {
  context.clearRect(0, 0, width, height);
  drawSky(context, width, height, snapshot.selectedLevelId);
  drawHills(context, width, height);
  drawCity(context, width, height, snapshot.selectedLevelId);
  drawRouteBoard(context, width, snapshot);
  drawTerrain(context, width, height, world);
  const requestHitAreas = drawWaitingPassengers(context, width, height, snapshot, world);
  drawCombi(context, width, height, world);
  if (snapshot.debugEnabled) drawDebug(context, width, height, world);
  return requestHitAreas;
}

function drawRouteBoard(context: CanvasRenderingContext2D, width: number,
  snapshot: AppSnapshot): void {
  if (snapshot.state !== 'PLAYING' || !snapshot.ride) return;
  const occupied = snapshot.ride.requests.filter((item) =>
    item.status === 'onboard' && item.request.kind === 'passenger').length;
  const onboard = snapshot.ride.requests.filter((item) =>
    item.status === 'onboard' && item.request.kind === 'passenger');
  const nextPassenger = snapshot.ride.requests.find((item) =>
    item.status === 'waiting' && item.request.kind === 'passenger');
  const level = LEVELS.find((item) => item.id === snapshot.selectedLevelId);
  const progress = Math.max(0, Math.min(1, snapshot.vehicleX / (level?.finishX ?? 1)));
  const left = width >= 760 ? Math.max(400, width * 0.43) : 16;
  const right = width - (width >= 760 ? 34 : 16);
  const boardWidth = Math.max(360, right - left);
  const top = 82;
  const lineLeft = left + 34;
  const lineRight = right - 34;
  const lineY = top + 61;
  context.save();
  context.fillStyle = 'rgba(5, 20, 31, 0.86)';
  roundedRect(context, left, top, boardWidth, 132, 16);
  context.fill();
  context.strokeStyle = 'rgba(242, 193, 78, 0.72)';
  context.lineWidth = 2;
  context.stroke();
  context.textAlign = 'left';
  context.fillStyle = '#f2c14e';
  context.font = '900 13px system-ui';
  context.fillText(`${TRANSIT_ROUTE.code}  ${TRANSIT_ROUTE.direction}`, left + 18, top + 22);
  context.textAlign = 'right';
  context.font = '900 22px system-ui';
  context.fillText(`CAPACIDAD ${occupied}/${snapshot.passengerCapacity}`, right - 18, top + 22);

  context.lineWidth = 7;
  context.lineCap = 'round';
  context.strokeStyle = 'rgba(255,255,255,0.2)';
  context.beginPath();
  context.moveTo(lineLeft, lineY);
  context.lineTo(lineRight, lineY);
  context.stroke();
  context.strokeStyle = '#f2c14e';
  context.beginPath();
  context.moveTo(lineLeft, lineY);
  context.lineTo(lineLeft + (lineRight - lineLeft) * progress, lineY);
  context.stroke();

  for (const stop of TRANSIT_ROUTE.stops) {
    const x = lineLeft + (lineRight - lineLeft) * stop.progress;
    context.fillStyle = stop.progress <= progress ? '#f2c14e' : '#6f7f88';
    context.beginPath();
    context.arc(x, lineY, 6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.78)';
    context.textAlign = 'center';
    context.font = '700 8px system-ui';
    context.fillText(shortStopName(stop.name), x, lineY + 20);
  }
  const combiX = lineLeft + (lineRight - lineLeft) * progress;
  drawRouteCombiIcon(context, combiX, lineY - 17);

  context.textAlign = 'left';
  context.font = '800 10px system-ui';
  let cardX = left + 18;
  const cardY = top + 93;
  for (const passenger of onboard) {
    drawPassengerCard(context, cardX, cardY, passenger.request.visualVariant,
      passenger.request.destinationStop, passenger.request.massKg, requestFare(passenger.request));
    cardX += 154;
  }
  if (onboard.length === 0) {
    context.fillStyle = 'rgba(255,255,255,0.66)';
    context.fillText('SIN PASAJEROS A BORDO', cardX, cardY + 14);
  }
  if (nextPassenger) {
    context.textAlign = 'right';
    context.fillStyle = '#fff5d9';
    context.font = '900 13px system-ui';
    context.fillText(`PROXIMO PASAJE: S/ ${requestFare(nextPassenger.request)}`, right - 18, cardY + 14);
  }
  context.restore();
}

function drawRouteCombiIcon(context: CanvasRenderingContext2D, x: number, y: number): void {
  context.fillStyle = '#ef5b3f';
  roundedRect(context, x - 15, y - 10, 30, 17, 4);
  context.fill();
  context.fillStyle = '#bde5ed';
  context.fillRect(x - 9, y - 7, 16, 6);
  context.fillStyle = '#182027';
  context.beginPath();
  context.arc(x - 9, y + 7, 4, 0, Math.PI * 2);
  context.arc(x + 9, y + 7, 4, 0, Math.PI * 2);
  context.fill();
}

function drawPassengerCard(context: CanvasRenderingContext2D, x: number, y: number,
  variant: string, destination: string, massKg: number, fare: number): void {
  const colors: Readonly<Record<string, string>> = {
    azul: '#62b7ff', rojo: '#ff8066', verde: '#70d5bf', amarillo: '#f2c14e',
  };
  context.fillStyle = 'rgba(255,255,255,0.08)';
  roundedRect(context, x, y - 17, 145, 34, 8);
  context.fill();
  context.fillStyle = colors[variant] ?? '#62b7ff';
  context.beginPath();
  context.arc(x + 17, y - 3, 7, 0, Math.PI * 2);
  context.fill();
  context.fillRect(x + 11, y + 4, 12, 8);
  context.fillStyle = '#fff5d9';
  context.textAlign = 'left';
  context.font = '800 9px system-ui';
  context.fillText(`BAJA: ${shortStopName(destination)}`, x + 31, y - 2);
  context.fillStyle = 'rgba(255,255,255,0.68)';
  context.font = '700 8px system-ui';
  context.fillText(`${massKg} kg  S/ ${fare}`, x + 31, y + 10);
}

function shortStopName(name: string): string {
  if (name === 'Hospital Collique') return 'Hospital';
  return name.length > 13 ? `${name.slice(0, 12)}.` : name;
}

function drawWaitingPassengers(context: CanvasRenderingContext2D, width: number, height: number,
  snapshot: AppSnapshot, world: WorldSnapshot): readonly RequestHitArea[] {
  if (snapshot.state !== 'PLAYING' || !snapshot.ride) return [];
  const hits: RequestHitArea[] = [];
  const colors: Readonly<Record<string, string>> = {
    azul: '#62b7ff', rojo: '#ff8066', verde: '#70d5bf', amarillo: '#f2c14e',
  };
  for (const progress of snapshot.ride.requests) {
    if (progress.status !== 'waiting' || progress.request.kind !== 'passenger') continue;
    const groundY = terrainHeightAt(world.terrain, progress.request.originX);
    const point = worldToScreen({ x: progress.request.originX, y: groundY }, world, width, height);
    if (point.x < -60 || point.x > width + 60) continue;
    const nearby = Math.abs(snapshot.vehicleX - progress.request.originX) <= STOP_RADIUS_METERS;
    context.save();
    context.globalAlpha = nearby ? 1 : 0.58;
    context.translate(point.x, point.y);
    context.fillStyle = 'rgba(5, 20, 31, 0.88)';
    roundedRect(context, -42, -104, 84, 28, 9);
    context.fill();
    context.fillStyle = nearby ? '#fff5d9' : 'rgba(255,255,255,0.72)';
    context.font = '800 11px system-ui';
    context.textAlign = 'center';
    context.fillText(nearby ? `CLIC - S/ ${requestFare(progress.request)}` : `S/ ${requestFare(progress.request)}`,
      0, -85);
    context.fillStyle = '#d9a47f';
    context.beginPath();
    context.arc(0, -62, 11, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = colors[progress.request.visualVariant] ?? '#62b7ff';
    context.lineWidth = 12;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(0, -48);
    context.lineTo(0, -20);
    context.moveTo(0, -40);
    context.lineTo(-15, -27);
    context.moveTo(0, -40);
    context.lineTo(15, -27);
    context.moveTo(0, -20);
    context.lineTo(-11, -2);
    context.moveTo(0, -20);
    context.lineTo(11, -2);
    context.stroke();
    context.restore();
    if (nearby) hits.push({ requestId: progress.request.id,
      x: point.x - 34, y: point.y - 108, width: 68, height: 108 });
  }
  return hits;
}

function terrainHeightAt(terrain: WorldSnapshot['terrain'], x: number): number {
  const segment = terrain.find((candidate) => x >= candidate.start.x && x <= candidate.end.x);
  if (!segment) return 0;
  const fraction = (x - segment.start.x) / (segment.end.x - segment.start.x);
  return segment.start.y + (segment.end.y - segment.start.y) * fraction;
}

function drawSky(context: CanvasRenderingContext2D, width: number, height: number,
  levelId: string | null): void {
  const colors = levelId === 'subida-al-cerro'
    ? ['#17233a', '#70475d', '#efad67']
    : levelId === 'dia-de-mercado'
      ? ['#144450', '#397e78', '#f2ba67']
      : levelId === 'pista-danada'
        ? ['#18222d', '#46505a', '#d88658']
        : levelId === 'hora-punta'
          ? ['#211637', '#6c3157', '#f28c4b']
      : ['#10283c', '#20506a', '#ef9d5c'];
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, colors[0] ?? '#10283c');
  gradient.addColorStop(0.58, colors[1] ?? '#20506a');
  gradient.addColorStop(1, colors[2] ?? '#ef9d5c');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = 'rgba(255, 224, 162, 0.9)';
  context.beginPath();
  context.arc(width * 0.78, height * 0.2, Math.max(34, width * 0.045), 0, Math.PI * 2);
  context.fill();
}

function drawHills(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.fillStyle = '#59604f';
  context.beginPath();
  context.moveTo(0, height * 0.62);
  context.lineTo(width * 0.2, height * 0.32);
  context.lineTo(width * 0.38, height * 0.61);
  context.lineTo(width * 0.58, height * 0.27);
  context.lineTo(width * 0.83, height * 0.62);
  context.lineTo(width, height * 0.4);
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
  context.fill();
}

function drawCity(context: CanvasRenderingContext2D, width: number, height: number,
  levelId: string | null): void {
  const buildingWidth = Math.max(42, width / 15);
  const colors = ['#d36d42', '#d9a449', '#b84d41', '#d0bd86', '#86524b'];
  for (let index = 0; index < 17; index += 1) {
    const x = index * buildingWidth - buildingWidth * 0.4;
    const buildingHeight = height * (0.12 + ((index * 7) % 5) * 0.025);
    const y = height * 0.69 - buildingHeight;
    context.fillStyle = colors[index % colors.length] ?? '#d36d42';
    context.fillRect(x, y, buildingWidth - 4, buildingHeight);
    context.fillStyle = 'rgba(35, 47, 51, 0.45)';
    context.fillRect(x + 10, y + 14, 9, 12);
    context.fillRect(x + 29, y + 14, 9, 12);
    if (levelId === 'dia-de-mercado' && index % 2 === 0) {
      context.fillStyle = index % 4 === 0 ? '#f2c14e' : '#ef5b3f';
      context.fillRect(x + 3, height * 0.69 - 9, buildingWidth - 10, 9);
    }
  }
  if (levelId === 'subida-al-cerro') {
    context.fillStyle = '#f2c14e';
    context.font = 'bold 14px system-ui';
    context.fillText('MIRADOR', width * 0.72, height * 0.46);
  }
  if (levelId === 'pista-danada') {
    context.fillStyle = '#ff726a';
    context.fillRect(width * 0.12, height * 0.61, 42, 8);
    context.fillRect(width * 0.67, height * 0.59, 52, 8);
  }
  if (levelId === 'hora-punta') {
    context.fillStyle = '#f2c14e';
    context.font = 'bold 13px system-ui';
    context.fillText('HORA PUNTA', width * 0.68, height * 0.5);
  }
}

function drawTerrain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  world: WorldSnapshot,
): void {
  const roadTop = height * 0.69;
  context.fillStyle = '#293039';
  context.fillRect(0, roadTop, width, height - roadTop);
  context.lineWidth = 5;
  context.strokeStyle = '#e9b94f';
  context.beginPath();
  for (const [index, segment] of world.terrain.entries()) {
    const start = worldToScreen(segment.start, world, width, height);
    const end = worldToScreen(segment.end, world, width, height);
    if (index === 0) context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
  }
  context.stroke();
}

function drawCombi(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  world: WorldSnapshot,
): void {
  const pixelsPerMeter = worldScale(width, height);
  const bodyWidth = 3.1 * pixelsPerMeter;
  const bodyHeight = 1.25 * pixelsPerMeter;
  const centerOfMass = world.body.centerOfMassOffset ?? { x: 0, y: 0 };
  const x = -bodyWidth / 2 - centerOfMass.x * pixelsPerMeter;
  const y = -1.03 * pixelsPerMeter + centerOfMass.y * pixelsPerMeter;
  const center = worldToScreen(world.body.position, world, width, height);

  context.save();
  context.translate(center.x, center.y);
  context.rotate(-world.body.angleRadians);
  context.shadowColor = 'rgba(0, 0, 0, 0.32)';
  context.shadowBlur = 16;
  context.shadowOffsetY = 9;
  roundedRect(context, x, y, bodyWidth, bodyHeight, 14);
  context.fillStyle = '#ef5b3f';
  context.fill();
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;

  context.fillStyle = '#f2c14e';
  context.fillRect(x, y + bodyHeight * 0.58, bodyWidth, bodyHeight * 0.17);

  context.fillStyle = '#bde5ed';
  roundedRect(
    context,
    x + bodyWidth * 0.09,
    y + bodyHeight * 0.13,
    bodyWidth * 0.66,
    bodyHeight * 0.35,
    8,
  );
  context.fill();
  context.strokeStyle = '#183240';
  context.lineWidth = 6;
  context.stroke();

  context.fillStyle = '#182027';
  for (const wheel of world.body.wheels) {
    const wheelX = wheel.offset.x * pixelsPerMeter;
    const wheelY = -wheel.offset.y * pixelsPerMeter;
    context.beginPath();
    context.arc(wheelX, wheelY, wheel.radius * pixelsPerMeter, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#d6d8d5';
    context.beginPath();
    context.arc(wheelX, wheelY, wheel.radius * pixelsPerMeter * 0.42, 0, Math.PI * 2);
    context.fill();
    const spin = world.body.position.x / wheel.radius;
    const markerLength = wheel.radius * pixelsPerMeter * 0.32;
    context.strokeStyle = '#5f6669';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(wheelX, wheelY);
    context.lineTo(
      wheelX + Math.cos(spin) * markerLength,
      wheelY + Math.sin(spin) * markerLength,
    );
    context.stroke();
    context.fillStyle = '#182027';
  }
  context.restore();
}

function drawDebug(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  world: WorldSnapshot,
): void {
  const center = worldToScreen(world.body.position, world, width, height);
  const pixelsPerMeter = worldScale(width, height);
  context.save();
  context.lineWidth = 2;
  context.strokeStyle = '#58f2b4';
  context.translate(center.x, center.y);
  context.rotate(-world.body.angleRadians);
  context.strokeRect(-1.55 * pixelsPerMeter, -1.03 * pixelsPerMeter,
    3.1 * pixelsPerMeter, 1.25 * pixelsPerMeter);
  context.restore();
  context.save();
  context.lineWidth = 2;
  context.strokeStyle = '#58f2b4';
  for (const wheel of world.body.wheels) {
    const wheelCenter = worldToScreen(
      add(world.body.position, rotate(wheel.offset, world.body.angleRadians)),
      world,
      width,
      height,
    );
    context.beginPath();
    context.arc(wheelCenter.x, wheelCenter.y, wheel.radius * pixelsPerMeter, 0, Math.PI * 2);
    context.stroke();
  }

  context.strokeStyle = '#f2c14e';
  context.beginPath();
  context.moveTo(center.x - 9, center.y);
  context.lineTo(center.x + 9, center.y);
  context.moveTo(center.x, center.y - 9);
  context.lineTo(center.x, center.y + 9);
  context.stroke();

  context.strokeStyle = '#ff726a';
  context.beginPath();
  context.moveTo(center.x, center.y);
  context.lineTo(center.x, center.y - world.gravity.y * 6);
  context.stroke();

  context.fillStyle = '#58f2b4';
  for (const contact of world.contacts) {
    const point = worldToScreen(contact.point, world, width, height);
    context.beginPath();
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#58f2b4';
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + contact.normal.x * 24,
      point.y - contact.normal.y * 24);
    context.stroke();
    if (Math.abs(contact.frictionImpulseNs) > 0.01) {
      const tangentScale = Math.min(28, Math.abs(contact.frictionImpulseNs) * 0.08);
      const direction = Math.sign(contact.frictionImpulseNs);
      context.strokeStyle = '#ff9f43';
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(point.x + contact.normal.y * tangentScale * direction,
        point.y + contact.normal.x * tangentScale * direction);
      context.stroke();
    }
  }
  context.strokeStyle = '#62b7ff';
  context.fillStyle = '#62b7ff';
  for (const spring of world.suspensionForces) {
    const point = worldToScreen(spring.point, world, width, height);
    const arrowLength = Math.min(42, spring.forceN * 0.004);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x, point.y - arrowLength);
    context.stroke();
    context.fillText(`S${spring.wheelIndex + 1}: ${Math.round(spring.forceN)} N`,
      point.x + 6, point.y - arrowLength);
  }
  for (const joint of world.joints) {
    const point = worldToScreen(
      add(world.body.position, rotate(joint.offset, world.body.angleRadians)),
      world, width, height,
    );
    context.strokeStyle = joint.broken ? '#ff726a' : '#f2c14e';
    context.beginPath();
    if (joint.broken) {
      context.moveTo(point.x - 7, point.y - 7);
      context.lineTo(point.x + 7, point.y + 7);
      context.moveTo(point.x + 7, point.y - 7);
      context.lineTo(point.x - 7, point.y + 7);
    } else {
      context.arc(point.x, point.y, 7, 0, Math.PI * 2);
    }
    context.stroke();
  }
  context.fillStyle = '#fff5d9';
  context.font = '12px system-ui';
  context.fillText(
    `Masa ${world.body.massKg} kg | g ${Math.abs(world.gravity.y)} m/s2`,
    width * 0.58,
    height * 0.77,
  );
  context.restore();
}

function worldScale(width: number, height: number): number {
  return Math.min(width / 15, height / 9, 95);
}

function worldToScreen(
  point: { readonly x: number; readonly y: number },
  world: WorldSnapshot,
  width: number,
  height: number,
): { x: number; y: number } {
  const pixelsPerMeter = worldScale(width, height);
  return {
    x: width * 0.73 + (point.x - world.body.position.x) * pixelsPerMeter,
    y: height * 0.69 - point.y * pixelsPerMeter,
  };
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}
