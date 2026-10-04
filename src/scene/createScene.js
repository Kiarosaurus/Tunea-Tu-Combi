import * as THREE from 'three';

/** Escena, cámara, luces y piso. Sin dependencias de la UI. */
export function createScene(canvasParent) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0e);
  scene.fog = new THREE.Fog(0x0b0b0e, 18, 44);

  const camera = new THREE.PerspectiveCamera(
    45,
    canvasParent.clientWidth / canvasParent.clientHeight,
    0.1,
    100,
  );
  camera.position.set(7.5, 4.2, 8.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvasParent.clientWidth, canvasParent.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasParent.appendChild(renderer.domElement);

  // Iluminación de tres puntos: hemisférica de relleno + key direccional con
  // sombras + rim para separar la silueta del fondo oscuro.
  scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x1a1a20, 0.85));

  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(6, 9, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x6fa8ff, 0.9);
  rim.position.set(-7, 4, -6);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(16, 64),
    new THREE.MeshStandardMaterial({ color: 0x15151b, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(32, 32, 0x2a2a36, 0x1c1c24);
  grid.position.y = 0.002;
  scene.add(grid);

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvasParent;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  return { scene, camera, renderer, resize };
}
