import type { AppSnapshot } from '../app/appController';
import type { Disposable } from '../core/contracts';
import { add, rotate } from '../core/vector2';
import { LEVELS } from '../data/levels';
import type { PartKind } from '../data/parts';
import { TRANSIT_ROUTE } from '../data/transitRoute';
import {
  BUILD_GRID_COLUMNS,
  BUILD_GRID_ROWS,
  DRIVER_SEAT_ID,
  PART_FOOTPRINTS,
  gridForModel,
  gridVehicleCapacity,
  passengerSeatPlacements,
  securedGridPlacements,
  type GridPlacement,
} from '../game/model';
import { PICKUP_MAX_SPEED_MPS, REQUEST_NOTICE_RADIUS_METERS } from '../game/rideSession';
import { requestFare } from '../game/requests';
import { LEVEL_ONE_POLICE_CAR_X } from '../game/roadLimits';
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
      canvas.dataset.engineHealth = String(snapshot.engineHealthPercent);
      canvas.dataset.engineExploded = String(snapshot.engineExploded);
      const hasWaitingPassenger = snapshot.ride?.requests.some((progress) =>
        progress.status === 'waiting' && progress.request.kind === 'passenger') ?? false;
      canvas.dataset.missingRequirement = snapshot.state === 'PLAYING' && hasWaitingPassenger &&
        snapshot.passengerCapacity === 0 ? 'seat' : '';
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
  drawClouds(context, width, height, snapshot.vehicleX);
  drawHills(context, width, height, snapshot.vehicleX);
  drawCity(context, width, height, snapshot.selectedLevelId, snapshot.vehicleX);
  drawRouteBoard(context, width, snapshot);
  drawTerrain(context, width, height, world);
  drawStreetDetails(context, width, height, snapshot.vehicleX, world);
  drawPoliceBarrier(context, width, height, snapshot, world);
  if (!snapshot.reducedMotion) drawRoadDust(context, width, height, snapshot, world);
  drawCombi(context, width, height, snapshot, world);
  const requestHitAreas = drawWaitingRequests(context, width, height, snapshot, world);
  if (snapshot.debugEnabled) drawDebug(context, width, height, world);
  return requestHitAreas;
}

function drawPoliceBarrier(context: CanvasRenderingContext2D, width: number, height: number,
  snapshot: AppSnapshot, world: WorldSnapshot): void {
  if (snapshot.selectedLevelId !== 'primer-recorrido' ||
    (snapshot.state !== 'PLAYING' && snapshot.state !== 'PAUSED')) return;
  const groundY = terrainHeightAt(world.terrain, LEVEL_ONE_POLICE_CAR_X);
  const point = worldToScreen({ x: LEVEL_ONE_POLICE_CAR_X, y: groundY }, world, width, height);
  const scale = worldScale(width, height);
  context.save();
  context.translate(point.x, point.y);
  context.fillStyle = '#edf4f6';
  context.strokeStyle = '#15252d';
  context.lineWidth = 3;
  roundedRect(context, -scale * 0.95, -scale * 0.58, scale * 1.9, scale * 0.52, 8);
  context.fill();
  context.stroke();
  context.fillStyle = '#1d63a8';
  context.fillRect(-scale * 0.92, -scale * 0.37, scale * 1.84, scale * 0.17);
  context.fillStyle = '#b9d8eb';
  roundedRect(context, -scale * 0.45, -scale * 0.78, scale * 0.9, scale * 0.27, 7);
  context.fill();
  context.fillStyle = '#ff5c5c';
  context.fillRect(-scale * 0.18, -scale * 0.85, scale * 0.17, scale * 0.08);
  context.fillStyle = '#62b7ff';
  context.fillRect(scale * 0.01, -scale * 0.85, scale * 0.17, scale * 0.08);
  context.fillStyle = '#15252d';
  for (const wheelX of [-0.58, 0.58]) {
    context.beginPath();
    context.arc(wheelX * scale, -scale * 0.04, scale * 0.18, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = '#ffffff';
  context.font = `900 ${Math.max(8, scale * 0.16)}px system-ui`;
  context.textAlign = 'center';
  context.fillText('POLICIA', 0, -scale * 0.24);
  context.restore();
}

function drawRouteBoard(context: CanvasRenderingContext2D, width: number,
  snapshot: AppSnapshot): void {
  if (snapshot.state !== 'PLAYING' || !snapshot.ride) return;
  const onboard = snapshot.ride.requests.filter((item) => item.status === 'onboard');
  const occupied = onboard.length;
  const nextRequest = snapshot.ride.requests.find((item) => item.status === 'waiting');
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
  context.fillText(`${occupied}/${snapshot.passengerCapacity}`, right - 18, top + 22);

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
    drawPassengerCard(context, cardX, cardY, passenger.request.attendantVariant,
      passenger.request.destinationStop, passenger.request.massKg, requestFare(passenger.request));
    cardX += 154;
  }
  if (nextRequest) {
    context.textAlign = 'right';
    context.fillStyle = '#fff5d9';
    context.font = '900 13px system-ui';
    context.fillText(`S/ ${requestFare(nextRequest.request)}`, right - 18, cardY + 14);
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
  context.fillText(shortStopName(destination), x + 31, y - 2);
  context.fillStyle = 'rgba(255,255,255,0.68)';
  context.font = '700 8px system-ui';
  context.fillText(`${massKg} kg  S/ ${fare}`, x + 31, y + 10);
}

function shortStopName(name: string): string {
  if (name === 'Hospital Collique') return 'Hospital';
  return name.length > 13 ? `${name.slice(0, 12)}.` : name;
}

function drawWaitingRequests(context: CanvasRenderingContext2D, width: number, height: number,
  snapshot: AppSnapshot, world: WorldSnapshot): readonly RequestHitArea[] {
  if (snapshot.state !== 'PLAYING' || !snapshot.ride) return [];
  const hits: RequestHitArea[] = [];
  const colors: Readonly<Record<string, string>> = {
    azul: '#62b7ff', rojo: '#ff8066', verde: '#70d5bf', amarillo: '#f2c14e',
  };
  const capacity = gridVehicleCapacity(gridForModel(snapshot.game));
  const onboardRequests = snapshot.ride.requests.filter((item) => item.status === 'onboard');
  for (const progress of snapshot.ride.requests) {
    if (progress.status !== 'waiting') continue;
    const groundY = terrainHeightAt(world.terrain, progress.request.originX);
    const point = worldToScreen({ x: progress.request.originX, y: groundY }, world, width, height);
    if (point.x < -60 || point.x > width + 60) continue;
    const nearby = Math.abs(snapshot.vehicleX - progress.request.originX) <= REQUEST_NOTICE_RADIUS_METERS;
    context.save();
    context.globalAlpha = nearby ? 1 : 0.58;
    context.translate(point.x, point.y);
    context.fillStyle = 'rgba(5, 20, 31, 0.88)';
    roundedRect(context, -42, -104, 84, 28, 9);
    context.fill();
    context.fillStyle = nearby ? '#fff5d9' : 'rgba(255,255,255,0.72)';
    context.font = '800 11px system-ui';
    context.textAlign = 'center';
    context.fillText(`S/ ${requestFare(progress.request)}`, 0, -85);
    const occupiedSupport = onboardRequests.filter((item) =>
      item.request.kind === progress.request.kind).length;
    const missingRequirement = requestRequirement(progress.request.kind, capacity,
      onboardRequests.length, occupiedSupport, nearby, snapshot.speedMps);
    if (missingRequirement) {
      context.fillStyle = '#fff5d9';
      context.strokeStyle = '#182027';
      context.lineWidth = 3;
      roundedRect(context, -61, -139, 122, 27, 10);
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(-8, -113);
      context.lineTo(2, -105);
      context.lineTo(8, -113);
      context.fill();
      context.fillStyle = '#182027';
      context.font = '900 9px system-ui';
      context.fillText(missingRequirement, 0, -121);
    }
    const personX = progress.request.kind === 'passenger' ? 0 : -22;
    drawWaitingPerson(context, personX,
      colors[progress.request.attendantVariant] ?? '#62b7ff');
    if (progress.request.kind !== 'passenger') {
      drawWaitingCargo(context, progress.request.kind, progress.request.visualVariant, 24, -4);
    }
    context.restore();
    if (nearby) hits.push({ requestId: progress.request.id,
      x: point.x - 58, y: point.y - 108, width: 116, height: 108 });
  }
  return hits;
}

function requestRequirement(kind: 'passenger' | 'roofCargo' | 'scooter',
  capacity: ReturnType<typeof gridVehicleCapacity>, occupiedSeats: number,
  occupiedSupport: number, nearby: boolean, speedMps: number): string | null {
  if (kind === 'roofCargo' && (capacity.roofCargo === 0 || occupiedSupport >= capacity.roofCargo)) {
    return capacity.roofCargo === 0 ? 'FALTA PARRILLA' : 'SOPORTE OCUPADO';
  }
  if (kind === 'scooter' && (capacity.scooter === 0 || occupiedSupport >= capacity.scooter)) {
    return capacity.scooter === 0 ? 'FALTA PORTACARGA' : 'SOPORTE OCUPADO';
  }
  if (capacity.passenger <= occupiedSeats) {
    return capacity.passenger === 0 ? 'FALTA ASIENTO' : 'SIN ESPACIO';
  }
  if (nearby && Math.abs(speedMps) > PICKUP_MAX_SPEED_MPS) return 'FRENA';
  return null;
}

function drawWaitingPerson(context: CanvasRenderingContext2D, x: number, clothing: string): void {
  context.fillStyle = '#d9a47f';
  context.beginPath();
  context.arc(x, -62, 11, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = clothing;
  context.lineWidth = 12;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(x, -48);
  context.lineTo(x, -20);
  context.moveTo(x, -40);
  context.lineTo(x - 14, -27);
  context.moveTo(x, -40);
  context.lineTo(x + 13, -29);
  context.moveTo(x, -20);
  context.lineTo(x - 10, -2);
  context.moveTo(x, -20);
  context.lineTo(x + 10, -2);
  context.stroke();
}

function drawWaitingCargo(context: CanvasRenderingContext2D,
  kind: 'roofCargo' | 'scooter', variant: string, x: number, groundY: number): void {
  context.save();
  context.translate(x, groundY);
  if (kind === 'scooter') {
    context.strokeStyle = '#d6d8d5';
    context.lineWidth = 4;
    context.beginPath();
    context.arc(-10, -5, 8, 0, Math.PI * 2);
    context.arc(18, -5, 8, 0, Math.PI * 2);
    context.moveTo(-10, -5);
    context.lineTo(2, -24);
    context.lineTo(17, -5);
    context.moveTo(2, -24);
    context.lineTo(15, -25);
    context.stroke();
    context.fillStyle = '#ef5b3f';
    roundedRect(context, -2, -31, 17, 8, 3);
    context.fill();
  } else if (variant === 'sacos') {
    context.fillStyle = '#d0bd86';
    context.beginPath();
    context.ellipse(6, -16, 18, 19, -0.16, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#76511d';
    context.lineWidth = 3;
    context.stroke();
  } else {
    context.fillStyle = variant === 'canastas' ? '#f2c14e' : '#b86b45';
    roundedRect(context, -13, -35, 38, 31, 4);
    context.fill();
    context.strokeStyle = '#76511d';
    context.lineWidth = 3;
    context.stroke();
    context.beginPath();
    context.moveTo(-10, -20);
    context.lineTo(22, -20);
    context.stroke();
  }
  context.restore();
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

function drawClouds(context: CanvasRenderingContext2D, width: number, height: number,
  vehicleX: number): void {
  const spacing = 390;
  const patternWidth = spacing * 4;
  const drift = positiveModulo(vehicleX * 3, patternWidth);
  context.save();
  context.fillStyle = 'rgba(255, 245, 218, 0.18)';
  const firstIndex = Math.floor((drift - 150) / spacing);
  for (let index = firstIndex; index * spacing - drift < width + 150; index += 1) {
    const x = index * spacing - drift;
    const y = height * (0.15 + (positiveModulo(index, 2)) * 0.1);
    context.beginPath();
    context.ellipse(x, y, 72, 18, -0.04, 0, Math.PI * 2);
    context.ellipse(x - 34, y + 3, 38, 14, 0, 0, Math.PI * 2);
    context.ellipse(x + 34, y + 4, 42, 13, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawHills(context: CanvasRenderingContext2D, width: number, height: number,
  vehicleX: number): void {
  drawHillLayer(context, width, height, vehicleX * 5, '#485661', 0.5, 0.22, 760);
  drawHillLayer(context, width, height, vehicleX * 9, '#59604f', 0.62, 0.31, 620);
}

function drawCity(context: CanvasRenderingContext2D, width: number, height: number,
  levelId: string | null, vehicleX: number): void {
  const buildingWidth = Math.max(48, Math.min(86, width / 13));
  const patternWidth = buildingWidth * 5;
  const offset = positiveModulo(vehicleX * 15, patternWidth);
  const colors = ['#d36d42', '#d9a449', '#b84d41', '#d0bd86', '#86524b'];
  const firstIndex = Math.floor((offset - buildingWidth) / buildingWidth);
  for (let index = firstIndex; index * buildingWidth - offset < width + buildingWidth; index += 1) {
    const patternIndex = positiveModulo(index, 5);
    const x = index * buildingWidth - offset;
    const buildingHeight = height * (0.12 + ((patternIndex * 7) % 5) * 0.025);
    const y = height * 0.69 - buildingHeight;
    context.fillStyle = colors[patternIndex] ?? '#d36d42';
    context.fillRect(x, y, buildingWidth - 4, buildingHeight);
    context.fillStyle = 'rgba(35, 47, 51, 0.45)';
    context.fillRect(x + 10, y + 14, 9, 12);
    context.fillRect(x + 29, y + 14, 9, 12);
    if (patternIndex % 3 === 0) {
      context.fillStyle = '#274454';
      context.fillRect(x + buildingWidth * 0.58, y - 10, 16, 10);
      context.fillStyle = 'rgba(189, 229, 237, 0.7)';
      context.fillRect(x + buildingWidth * 0.6, y - 8, 12, 4);
    }
    if (levelId === 'dia-de-mercado' && patternIndex % 2 === 0) {
      context.fillStyle = patternIndex % 4 === 0 ? '#f2c14e' : '#ef5b3f';
      context.fillRect(x + 3, height * 0.69 - 9, buildingWidth - 10, 9);
    }
  }
  if (levelId === 'pista-danada') {
    context.fillStyle = '#ff726a';
    for (let x = -positiveModulo(vehicleX * 15, 430); x < width + 80; x += 430) {
      context.fillRect(x + 72, height * 0.61, 46, 8);
    }
  }
}

function drawStreetDetails(context: CanvasRenderingContext2D, width: number, height: number,
  vehicleX: number, world: WorldSnapshot): void {
  const groundY = terrainHeightAt(world.terrain, world.body.position.x);
  const roadTop = worldToScreen({ x: world.body.position.x, y: groundY }, world, width, height).y;
  const offset = positiveModulo(vehicleX * 34, 150);
  const poleOffset = positiveModulo(vehicleX * 17, 310);
  context.save();
  context.fillStyle = 'rgba(255,255,255,0.34)';
  for (let x = -offset - 120; x < width + 120; x += 150) {
    context.fillRect(x, roadTop + height * 0.15, 76, 5);
  }
  context.strokeStyle = '#15252d';
  context.lineWidth = 5;
  for (let x = 80 - poleOffset; x < width + 220; x += 310) {
    context.beginPath();
    context.moveTo(x, roadTop);
    context.lineTo(x, roadTop - 106);
    context.lineTo(x + 25, roadTop - 106);
    context.stroke();
    context.fillStyle = '#f2c14e';
    context.beginPath();
    context.arc(x + 28, roadTop - 105, 8, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawHillLayer(context: CanvasRenderingContext2D, width: number, height: number,
  drift: number, color: string, baseRatio: number, peakRatio: number, tileWidth: number): void {
  const offset = positiveModulo(drift, tileWidth);
  context.fillStyle = color;
  for (let start = -offset - tileWidth; start < width + tileWidth; start += tileWidth) {
    context.beginPath();
    context.moveTo(start, height * baseRatio);
    context.lineTo(start + tileWidth * 0.24, height * peakRatio);
    context.lineTo(start + tileWidth * 0.5, height * baseRatio);
    context.lineTo(start + tileWidth * 0.72, height * (peakRatio - 0.035));
    context.lineTo(start + tileWidth, height * baseRatio);
    context.lineTo(start + tileWidth, height);
    context.lineTo(start, height);
    context.closePath();
    context.fill();
  }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function drawRoadDust(context: CanvasRenderingContext2D, width: number, height: number,
  snapshot: AppSnapshot, world: WorldSnapshot): void {
  const speed = Math.abs(snapshot.speedMps);
  if (speed < 0.6 || snapshot.state !== 'PLAYING') return;
  const scale = Math.min(1, speed / 5.5);
  const baseX = width * 0.5 - worldScale(width, height) * 1.7;
  const groundY = terrainHeightAt(world.terrain, world.body.position.x);
  const baseY = worldToScreen({ x: world.body.position.x, y: groundY }, world, width, height).y - 8;
  context.save();
  context.fillStyle = `rgba(242, 193, 78, ${0.12 + scale * 0.16})`;
  for (let index = 0; index < 6; index += 1) {
    const phase = (snapshot.vehicleX * 31 + index * 23) % 54;
    const radius = 3 + ((index * 5) % 7) * scale;
    context.beginPath();
    context.arc(baseX - phase - index * 11, baseY - (index % 3) * 7, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawTerrain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  world: WorldSnapshot,
): void {
  context.fillStyle = '#293039';
  context.beginPath();
  for (const [index, segment] of world.terrain.entries()) {
    const start = worldToScreen(segment.start, world, width, height);
    const end = worldToScreen(segment.end, world, width, height);
    if (index === 0) context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
  }
  context.lineTo(width + 200, height + 100);
  context.lineTo(-200, height + 100);
  context.closePath();
  context.fill();
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
  snapshot: AppSnapshot,
  world: WorldSnapshot,
): void {
  const pixelsPerMeter = worldScale(width, height);
  const bodyWidth = 3.1 * pixelsPerMeter;
  const bodyHeight = 1.25 * pixelsPerMeter;
  const centerOfMass = world.body.centerOfMassOffset ?? { x: 0, y: 0 };
  const x = -bodyWidth / 2 - centerOfMass.x * pixelsPerMeter;
  const y = -1.03 * pixelsPerMeter + centerOfMass.y * pixelsPerMeter;
  const center = worldToScreen(world.body.position, world, width, height);

  if (snapshot.engineHealthPercent < 100) {
    drawEngineSmoke(context, center.x + bodyWidth * 0.22, center.y - bodyHeight * 0.68,
      snapshot.engineHealthPercent, snapshot.reducedMotion);
  }

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

  const placements = gridForModel(snapshot.game);
  const securedIds = new Set(securedGridPlacements(placements).map((placement) => placement.id));
  const level = LEVELS.find((candidate) => candidate.id === snapshot.selectedLevelId);
  const rideElapsed = snapshot.ride
    ? Math.max(0, (level?.durationSeconds ?? 60) - snapshot.ride.remainingSeconds)
    : 0;
  drawInstalledParts(context, placements, securedIds, x, y, bodyWidth, bodyHeight,
    rideElapsed, world.body.angleRadians, snapshot.speedMps, snapshot.reducedMotion);
  drawOnboardRequests(context, snapshot, x, y, bodyWidth, bodyHeight);
  if (snapshot.engineExploded) drawEngineExplosion(context, x, y, bodyWidth, bodyHeight,
    snapshot.reducedMotion);

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

function drawOnboardRequests(context: CanvasRenderingContext2D, snapshot: AppSnapshot,
  bodyX: number, bodyY: number, bodyWidth: number, bodyHeight: number): void {
  const onboard = snapshot.ride?.requests.filter((progress) => progress.status === 'onboard') ?? [];
  const grid = gridForModel(snapshot.game);
  const driverSeat = grid.find((placement) => placement.id === DRIVER_SEAT_ID);
  const passengerSeats = passengerSeatPlacements(grid);
  const clothing: Readonly<Record<string, string>> = {
    azul: '#62b7ff', rojo: '#ff8066', verde: '#70d5bf', amarillo: '#f2c14e',
  };
  context.save();
  if (driverSeat) {
    const position = occupantPosition(driverSeat, bodyX, bodyY, bodyWidth, bodyHeight);
    drawSeatedPerson(context, position.x, position.y, bodyWidth, bodyHeight, '#f2c14e');
  }
  for (const [index, progress] of onboard.entries()) {
    const seat = passengerSeats[index];
    if (!seat) continue;
    const position = occupantPosition(seat, bodyX, bodyY, bodyWidth, bodyHeight);
    drawSeatedPerson(context, position.x, position.y, bodyWidth, bodyHeight,
      clothing[progress.request.attendantVariant] ?? '#62b7ff');
    if (progress.request.kind === 'roofCargo') {
      const cargoX = bodyX + bodyWidth * 0.44;
      const cargoY = bodyY - bodyHeight * 0.18;
      context.fillStyle = progress.request.visualVariant === 'sacos' ? '#d0bd86' : '#b86b45';
      roundedRect(context, cargoX, cargoY, bodyWidth * 0.22, bodyHeight * 0.22, 4);
      context.fill();
      context.strokeStyle = '#fff5d9';
      context.lineWidth = 2;
      context.stroke();
    }
    if (progress.request.kind === 'scooter') {
      const scooterX = bodyX - bodyWidth * 0.13;
      const scooterY = bodyY + bodyHeight * 0.7;
      context.strokeStyle = '#d6d8d5';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(scooterX, scooterY, bodyHeight * 0.09, 0, Math.PI * 2);
      context.arc(scooterX + bodyWidth * 0.2, scooterY, bodyHeight * 0.09, 0, Math.PI * 2);
      context.moveTo(scooterX, scooterY);
      context.lineTo(scooterX + bodyWidth * 0.09, scooterY - bodyHeight * 0.23);
      context.lineTo(scooterX + bodyWidth * 0.2, scooterY);
      context.stroke();
    }
  }
  context.restore();
}

function occupantPosition(placement: GridPlacement, bodyX: number, bodyY: number,
  bodyWidth: number, bodyHeight: number): { readonly x: number; readonly y: number } {
  const innerWidth = bodyWidth * 0.88;
  const innerHeight = bodyHeight * 0.82;
  return {
    x: bodyX + bodyWidth * 0.055 +
      ((placement.column + PART_FOOTPRINTS[placement.kind].columns / 2) / BUILD_GRID_COLUMNS) * innerWidth,
    y: bodyY + bodyHeight * 0.06 +
      ((placement.row + PART_FOOTPRINTS[placement.kind].rows * 0.32) / BUILD_GRID_ROWS) * innerHeight,
  };
}

function drawSeatedPerson(context: CanvasRenderingContext2D, x: number, y: number,
  bodyWidth: number, bodyHeight: number, shirtColor: string): void {
  context.fillStyle = '#d9a47f';
  context.beginPath();
  context.arc(x, y, Math.max(3, bodyHeight * 0.07), 0, Math.PI * 2);
  context.fill();
  context.fillStyle = shirtColor;
  context.fillRect(x - bodyWidth * 0.025, y + bodyHeight * 0.06,
    bodyWidth * 0.05, bodyHeight * 0.15);
}

function drawEngineSmoke(context: CanvasRenderingContext2D, x: number, y: number,
  healthPercent: number, reducedMotion: boolean): void {
  const severity = 1 - healthPercent / 100;
  const phase = reducedMotion ? 0 : performance.now() / Math.max(180, 620 - severity * 360);
  const particleCount = 3 + Math.ceil(severity * 11);
  context.save();
  for (let index = 0; index < particleCount; index += 1) {
    const rise = index * (7 + severity * 8);
    const drift = Math.sin(phase + index * 1.4) * (4 + index * (1 + severity));
    const radius = 3 + index * 1.3 + severity * 8;
    const alpha = Math.max(0.06, 0.18 + severity * 0.42 - index * 0.025);
    context.fillStyle = `rgba(${Math.round(70 - severity * 45)}, ${Math.round(76 - severity * 48)}, ${Math.round(78 - severity * 48)}, ${alpha})`;
    context.beginPath();
    context.arc(x + drift, y - rise, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawEngineExplosion(context: CanvasRenderingContext2D, bodyX: number, bodyY: number,
  bodyWidth: number, bodyHeight: number, reducedMotion: boolean): void {
  const phase = reducedMotion ? 0.7 : 0.75 + Math.sin(performance.now() / 45) * 0.12;
  const centerX = bodyX + bodyWidth * 0.72;
  const centerY = bodyY + bodyHeight * 0.5;
  context.save();
  for (const [radius, color] of [
    [bodyHeight * 0.72 * phase, 'rgba(255, 92, 64, 0.62)'],
    [bodyHeight * 0.48 * phase, 'rgba(242, 193, 78, 0.86)'],
    [bodyHeight * 0.22 * phase, 'rgba(255, 245, 217, 0.96)'],
  ] as const) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawInstalledParts(
  context: CanvasRenderingContext2D,
  placements: readonly GridPlacement[],
  securedIds: ReadonlySet<string>,
  bodyX: number,
  bodyY: number,
  bodyWidth: number,
  bodyHeight: number,
  rideElapsed: number,
  bodyAngle: number,
  speedMps: number,
  reducedMotion: boolean,
): void {
  const insetX = bodyX + bodyWidth * 0.055;
  const insetY = bodyY + bodyHeight * 0.06;
  const innerWidth = bodyWidth * 0.88;
  const innerHeight = bodyHeight * 0.82;
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const placement of placements) {
    if (placement.kind === 'wheel') continue;
    const footprint = PART_FOOTPRINTS[placement.kind];
    const baseWidth = (footprint.columns / BUILD_GRID_COLUMNS) * innerWidth;
    const baseHeight = (footprint.rows / BUILD_GRID_ROWS) * innerHeight;
    const width = Math.max(14, baseWidth * 1.45);
    const height = Math.max(14, baseHeight * 1.45);
    let x = insetX + (placement.column / BUILD_GRID_COLUMNS) * innerWidth - (width - baseWidth) / 2;
    let y = insetY + (placement.row / BUILD_GRID_ROWS) * innerHeight - (height - baseHeight) / 2;
    x = Math.max(insetX, Math.min(insetX + innerWidth - width, x));
    y = Math.max(insetY, Math.min(insetY + innerHeight - height, y));
    const secured = securedIds.has(placement.id);
    context.save();
    if (!secured && rideElapsed > 0) {
      const pose = loosePartPose(placement.id, x, y, width, height, insetX, insetY,
        innerWidth, innerHeight, rideElapsed, bodyAngle, speedMps, reducedMotion);
      context.translate(pose.x + width / 2, pose.y + height / 2);
      context.rotate(pose.rotation);
      x = -width / 2;
      y = -height / 2;
    }
    context.globalAlpha = secured ? 1 : 0.55;
    context.strokeStyle = secured ? '#fff5d9' : '#ff8066';
    context.fillStyle = partColor(placement.kind);
    context.lineWidth = Math.max(1.5, bodyWidth * 0.008);
    if (placement.kind === 'engine') {
      roundedRect(context, x + 2, y + 2, width - 4, height - 4, 4);
      context.fill();
      context.stroke();
      context.fillStyle = '#f2c14e';
      for (let index = 0; index < 3; index += 1) {
        context.beginPath();
        context.arc(x + width * (0.27 + index * 0.23), y + height * 0.48,
          Math.max(2, height * 0.11), 0, Math.PI * 2);
        context.fill();
      }
    } else if (placement.kind === 'seat') {
      roundedRect(context, x + width * 0.16, y + height * 0.08,
        width * 0.48, height * 0.66, 4);
      context.fill();
      context.stroke();
      context.fillRect(x + width * 0.18, y + height * 0.68, width * 0.68, height * 0.2);
    } else if (placement.kind === 'roofRack') {
      context.strokeStyle = '#f2c14e';
      context.lineWidth *= 1.6;
      context.strokeRect(x + 2, y + height * 0.2, width - 4, height * 0.52);
      for (let bar = 1; bar < 4; bar += 1) {
        const barX = x + (width * bar) / 4;
        context.beginPath();
        context.moveTo(barX, y + height * 0.2);
        context.lineTo(barX, y + height * 0.72);
        context.stroke();
      }
    } else if (placement.kind === 'rearCarrier') {
      roundedRect(context, x + 1, y + height * 0.15, width - 2, height * 0.66, 3);
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(x + width, y + height * 0.48);
      context.lineTo(x + width * 1.22, y + height * 0.48);
      context.stroke();
    } else if (placement.kind === 'suspension') {
      context.strokeStyle = secured ? '#62b7ff' : '#ff8066';
      context.lineWidth *= 1.5;
      context.beginPath();
      context.moveTo(x, y + height * 0.5);
      for (let step = 1; step <= 8; step += 1) {
        context.lineTo(x + (width * step) / 8,
          y + height * (step % 2 === 0 ? 0.25 : 0.75));
      }
      context.stroke();
    } else {
      context.fillRect(x, y, width, height);
      context.strokeRect(x, y, width, height);
    }
    if (!secured) {
      context.strokeStyle = '#fff5d9';
      context.lineWidth = Math.max(1.5, bodyWidth * 0.007);
      context.beginPath();
      context.moveTo(x + width * 0.2, y + height * 0.2);
      context.lineTo(x + width * 0.8, y + height * 0.8);
      context.moveTo(x + width * 0.8, y + height * 0.2);
      context.lineTo(x + width * 0.2, y + height * 0.8);
      context.stroke();
    }
    context.restore();
  }
  context.restore();
}

interface LoosePartPose {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

export function loosePartPose(id: string, startX: number, startY: number,
  width: number, height: number, insetX: number, insetY: number,
  innerWidth: number, innerHeight: number, elapsed: number, bodyAngle: number,
  speedMps: number, reducedMotion: boolean): LoosePartPose {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  const normalized = (hash >>> 0) / 4294967295;
  const fallDuration = 0.48 + normalized * 0.42;
  const rawProgress = Math.max(0, Math.min(1, elapsed / fallDuration));
  const progress = 1 - (1 - rawProgress) ** 3;
  const floorY = insetY + innerHeight - height - 2 - ((hash >>> 0) % 3) * height * 0.12;
  const slide = Math.sin(bodyAngle) * innerWidth * 0.24;
  const targetX = Math.max(insetX, Math.min(insetX + innerWidth - width,
    insetX + normalized * (innerWidth - width) + slide));
  const jostle = reducedMotion ? 0 : Math.sin(elapsed * 9 + normalized * 8) *
    Math.min(4, Math.abs(speedMps) * 0.7) * progress;
  return {
    x: startX + (targetX - startX) * progress + jostle,
    y: startY + (floorY - startY) * progress,
    rotation: progress * (bodyAngle + (normalized - 0.5) * 0.9) + jostle * 0.025,
  };
}

function partColor(kind: PartKind): string {
  const colors: Readonly<Record<PartKind, string>> = {
    chassis: '#ef5b3f', wheel: '#182027', engine: '#76511d', seat: '#25766c',
    roofRack: '#f2c14e', rearCarrier: '#72517b', suspension: '#62b7ff',
  };
  return colors[kind];
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
    x: width * 0.5 + (point.x - world.body.position.x) * pixelsPerMeter,
    y: height * 0.58 - (point.y - world.body.position.y) * pixelsPerMeter,
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
