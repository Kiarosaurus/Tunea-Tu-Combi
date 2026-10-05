import { AppController } from './app/appController';
import { FixedStepClock } from './core/fixedStepClock';
import { createDemoWorld } from './physics/demoWorld';
import { createCanvasRenderer } from './rendering/canvasRenderer';
import './styles.css';
import { createAppView } from './ui/appView';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('No existe el contenedor principal #app.');

const controller = new AppController();
const view = createAppView(root, (action) => controller.dispatch(action));
const renderer = createCanvasRenderer(view.canvas);
const clock = new FixedStepClock();
let world = createDemoWorld();
let previousTime: number | null = null;

controller.subscribe((snapshot) => {
  view.render(snapshot);
  renderer.render(snapshot, world.snapshot());
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'F1') {
    event.preventDefault();
    controller.dispatch({ type: 'TOGGLE_DEBUG' });
  }
});

function animate(timeMs: number): void {
  if (previousTime !== null) {
    clock.advance((timeMs - previousTime) / 1000, (durationSeconds) => world.step(durationSeconds));
    if (world.snapshot().body.position.x > 16) {
      world = createDemoWorld();
      clock.reset();
    }
  }
  previousTime = timeMs;
  renderer.render(controller.snapshot, world.snapshot());
  requestAnimationFrame(animate);
}

requestAnimationFrame(() => controller.dispatch({ type: 'BOOT_COMPLETED' }));
requestAnimationFrame(animate);
