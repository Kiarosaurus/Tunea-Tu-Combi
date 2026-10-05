import type { AppSnapshot } from '../app/appController';
import type { Disposable } from '../core/contracts';
import { add, rotate } from '../core/vector2';
import type { WorldSnapshot } from '../physics/world';

export interface CanvasRenderer extends Disposable {
  render(snapshot: AppSnapshot, world: WorldSnapshot): void;
}

export function createCanvasRenderer(canvas: HTMLCanvasElement): CanvasRenderer {
  const canvasContext = canvas.getContext('2d');
  if (!canvasContext) throw new Error('El navegador no ofrece Canvas 2D.');
  const context = canvasContext;

  let currentSnapshot: AppSnapshot | null = null;
  let currentWorld: WorldSnapshot | null = null;

  function resize(): void {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    if (currentWorld && currentSnapshot) draw(context, width, height, currentSnapshot, currentWorld);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  return {
    render(snapshot, world): void {
      currentSnapshot = snapshot;
      currentWorld = world;
      canvas.dataset.physicsY = world.body.position.y.toFixed(4);
      canvas.dataset.contactCount = String(world.contacts.length);
      resize();
    },
    destroy(): void {
      resizeObserver.disconnect();
    },
  };
}

function draw(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: AppSnapshot,
  world: WorldSnapshot,
): void {
  context.clearRect(0, 0, width, height);
  drawSky(context, width, height, snapshot.selectedLevelId);
  drawHills(context, width, height);
  drawCity(context, width, height, snapshot.selectedLevelId);
  drawTerrain(context, width, height, world);
  drawCombi(context, width, height, world);
  if (snapshot.debugEnabled) drawDebug(context, width, height, world);
}

function drawSky(context: CanvasRenderingContext2D, width: number, height: number,
  levelId: string | null): void {
  const colors = levelId === 'subida-al-cerro'
    ? ['#17233a', '#70475d', '#efad67']
    : levelId === 'dia-de-mercado'
      ? ['#144450', '#397e78', '#f2ba67']
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
  const x = -bodyWidth / 2;
  const y = -1.03 * pixelsPerMeter;
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
