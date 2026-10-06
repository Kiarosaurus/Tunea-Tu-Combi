import { AppController } from './app/appController';
import { FixedStepClock } from './core/fixedStepClock';
import { STOP_RADIUS_METERS } from './game/rideSession';
import { LocalSaveRepository } from './persistence/saveRepository';
import { createCanvasRenderer } from './rendering/canvasRenderer';
import './styles.css';
import { createAppView } from './ui/appView';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('No existe el contenedor principal #app.');

const controller = new AppController(new LocalSaveRepository(window.localStorage));
const view = createAppView(root, (action) => controller.dispatch(action));
const renderer = createCanvasRenderer(view.canvas, (requestId) =>
  controller.dispatch({ type: 'COLLECT_REQUEST', requestId }));
const clock = new FixedStepClock();
let previousTime: number | null = null;

controller.subscribe((snapshot) => {
  view.render(snapshot);
  renderer.render(snapshot, controller.worldSnapshot);
});

window.addEventListener('keydown', (event) => {
  const snapshot = controller.snapshot;
  if (event.key === 'F1') {
    event.preventDefault();
    controller.dispatch({ type: 'TOGGLE_DEBUG' });
  } else if (event.key === 'Escape') {
    if (snapshot.state === 'PLAYING') controller.dispatch({ type: 'PAUSE' });
    else if (snapshot.state === 'PAUSED') controller.dispatch({ type: 'RESUME' });
  } else if ((event.key === 'r' || event.key === 'R') &&
    (snapshot.state === 'PLAYING' || snapshot.state === 'PAUSED')) {
    event.preventDefault();
    if (window.confirm('¿Reiniciar este intento desde el inicio?')) {
      controller.dispatch({ type: 'RESTART_RIDE' });
    }
  } else if (snapshot.state === 'PLAYING') {
    if (event.key === 'd' || event.key === 'D' || event.key === 'ArrowRight') {
      event.preventDefault();
      controller.dispatch({ type: 'SET_THROTTLE', value: 1 });
    } else if (event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') {
      event.preventDefault();
      controller.dispatch({ type: 'SET_THROTTLE', value: -1 });
    } else if (event.key === ' ') {
      event.preventDefault();
      controller.dispatch({ type: 'SET_BRAKE', value: true });
    } else if (event.key === 'e' || event.key === 'E') {
      event.preventDefault();
      const readyToDeliver = snapshot.ride?.requests.some((progress) =>
        progress.status === 'onboard' &&
        Math.abs(snapshot.vehicleX - progress.request.destinationX) <= STOP_RADIUS_METERS);
      if (readyToDeliver) controller.dispatch({ type: 'DELIVER_REQUEST' });
      else {
        const readyToCollect = snapshot.ride?.requests.find((progress) =>
          progress.status === 'waiting' &&
          Math.abs(snapshot.vehicleX - progress.request.originX) <= STOP_RADIUS_METERS);
        if (readyToCollect) controller.dispatch({ type: 'COLLECT_REQUEST', requestId: readyToCollect.request.id });
      }
    }
  }
});

window.addEventListener('keyup', (event) => {
  if (event.key === 'd' || event.key === 'D' || event.key === 'ArrowRight' ||
    event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') {
    controller.dispatch({ type: 'SET_THROTTLE', value: 0 });
  }
  if (event.key === ' ') controller.dispatch({ type: 'SET_BRAKE', value: false });
});

window.addEventListener('blur', () => {
  controller.dispatch({ type: 'SET_THROTTLE', value: 0 });
  controller.dispatch({ type: 'SET_BRAKE', value: false });
});

function animate(timeMs: number): void {
  if (previousTime !== null) {
    clock.advance((timeMs - previousTime) / 1000, (durationSeconds) => controller.update(durationSeconds));
  }
  previousTime = timeMs;
  renderer.render(controller.snapshot, controller.worldSnapshot);
  requestAnimationFrame(animate);
}

requestAnimationFrame(() => controller.dispatch({ type: 'BOOT_COMPLETED' }));
requestAnimationFrame(animate);
