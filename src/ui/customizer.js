const BODY_COLORS = ['#2f7fd4', '#d63c3c', '#2fae6b', '#e0e2e6', '#f0951f', '#7b3fd4'];
const STRIPE_COLORS = ['#f5c542', '#ffffff', '#111318', '#d63c3c', '#2fae6b'];

function buildSwatches(container, colors, initial, onPick) {
  colors.forEach((hex, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.style.background = hex;
    button.title = hex;
    button.setAttribute('aria-pressed', String(i === initial));
    button.addEventListener('click', () => {
      container.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      button.setAttribute('aria-pressed', 'true');
      onPick(hex);
    });
    container.appendChild(button);
  });
}

/** Conecta el panel del HTML con el modelo. La UI no conoce three.js. */
export function initCustomizer(combi) {
  buildSwatches(document.getElementById('body-colors'), BODY_COLORS, 0, combi.setBodyColor);
  buildSwatches(document.getElementById('stripe-colors'), STRIPE_COLORS, 0, combi.setStripeColor);

  const metalness = document.getElementById('metalness');
  metalness.addEventListener('input', () => combi.setMetalness(Number(metalness.value)));
}
