import * as THREE from 'three';

/**
 * Combi de bloques: placeholder geométrico para validar el pipeline de render
 * y la customización. Se reemplaza más adelante por un modelo glTF sin tocar
 * la interfaz pública (`mesh`, `setBodyColor`, `setStripeColor`, `setMetalness`).
 */
export function createCombi() {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f7fd4,
    metalness: 0.35,
    roughness: 0.42,
  });
  const stripeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5c542,
    metalness: 0.35,
    roughness: 0.4,
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x0f1720,
    metalness: 0.1,
    roughness: 0.08,
    transparent: true,
    opacity: 0.72,
  });
  const tireMaterial = new THREE.MeshStandardMaterial({
    color: 0x14141a,
    metalness: 0.1,
    roughness: 0.85,
  });

  // carrocería
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.55, 1.9), bodyMaterial);
  body.position.y = 1.12;
  body.castShadow = true;
  group.add(body);

  // techo, más angosto para insinuar la silueta de la combi
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.42, 1.72), bodyMaterial);
  roof.position.set(-0.18, 2.08, 0);
  roof.castShadow = true;
  group.add(roof);

  // franja lateral (la pieza "tuneable" característica)
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.24, 0.24, 1.94), stripeMaterial);
  stripe.position.y = 1.02;
  group.add(stripe);

  // parabrisas
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.78, 1.7), glassMaterial);
  windshield.position.set(2.06, 1.62, 0);
  group.add(windshield);

  // ventanas laterales
  for (const z of [0.97, -0.97]) {
    const window = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.62, 0.06), glassMaterial);
    window.position.set(-0.2, 1.66, z);
    group.add(window);
  }

  // ruedas
  const tireGeometry = new THREE.CylinderGeometry(0.46, 0.46, 0.3, 24);
  for (const [x, z] of [[1.42, 1.0], [1.42, -1.0], [-1.42, 1.0], [-1.42, -1.0]]) {
    const tire = new THREE.Mesh(tireGeometry, tireMaterial);
    tire.rotation.x = Math.PI / 2;
    tire.position.set(x, 0.46, z);
    tire.castShadow = true;
    group.add(tire);
  }

  return {
    mesh: group,
    setBodyColor: (hex) => bodyMaterial.color.set(hex),
    setStripeColor: (hex) => stripeMaterial.color.set(hex),
    setMetalness: (value) => {
      bodyMaterial.metalness = value;
      stripeMaterial.metalness = value;
    },
  };
}
