import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createScene } from './scene/createScene.js';
import { createCombi } from './scene/combi.js';
import { initCustomizer } from './ui/customizer.js';

const app = document.getElementById('app');
const { scene, camera, renderer } = createScene(app);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.1, 0);
controls.minDistance = 5;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI / 2 - 0.03; // no dejar mirar bajo el piso

const combi = createCombi();
scene.add(combi.mesh);
initCustomizer(combi);

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
