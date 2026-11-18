// The records room, built from primitives (no model assets).
// You sit at the end of an aisle of archive shelves. The Archivist stands at the far end.

import * as THREE from 'three';

export const CLUES = [
  'IT MOVES WHEN YOU BLINK',
  'HOLD YOUR BREATH WHEN IT IS CLOSE',
  'LOOK AT IT. BE STILL.',
];

const CLUE_SPOTS: { pos: [number, number, number]; rotY: number }[] = [
  { pos: [-0.72, 1.55, -3.6], rotY: 0.55 },
  { pos: [0.72, 1.25, -4.8], rotY: -0.55 },
  { pos: [0, 2.15, -12.9], rotY: 0 },
];

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function clueTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = '#d8d0b8';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 92;
  g.font = `${size}px "Special Elite", "Courier New", monospace`;
  while (g.measureText(text).width > 960 && size > 30) g.font = `${(size -= 4)}px "Courier New", monospace`;
  // Scratchy, hand-scrawled look: draw the text a few times with jitter.
  const rnd = seeded(text.length * 97);
  for (let i = 0; i < 4; i++) {
    g.globalAlpha = 0.35;
    g.fillText(text, 512 + (rnd() - 0.5) * 6, 128 + (rnd() - 0.5) * 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const clueShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D map;
    uniform float uReveal;
    uniform float uTime;
    uniform float uFound;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec4 t = texture2D(map, vUv);
      // Writing only shows while squinting; a found clue stays faintly visible.
      float shimmer = 0.85 + 0.15 * sin(uTime * 7.0 + vUv.x * 20.0);
      float grain = 0.75 + 0.25 * hash(floor(vUv * vec2(240.0, 60.0)) + floor(uTime * 12.0));
      float a = t.a * max(uReveal * shimmer, uFound * 0.25) * grain;
      gl_FragColor = vec4(mix(vec3(0.85, 0.8, 0.7), vec3(0.75, 0.15, 0.1), uFound * 0.6) * t.rgb, a);
    }
  `,
};

const ghostShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uSmear;   // 0 still, 1 moving fast
    uniform float uNear;    // 0 far, 1 at your face
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    void main() {
      vec2 uv = vUv;
      // Smear: rows slide sideways when it moves.
      uv.x += (noise(vec2(uv.y * 30.0, uTime * 20.0)) - 0.5) * 0.25 * uSmear;
      vec2 p = (uv - vec2(0.5, 0.0)) * vec2(2.0, 1.0);
      // Tall, thin body that narrows to the feet, long arms, small head.
      float body = abs(p.x) - mix(0.18, 0.46, smoothstep(0.0, 0.72, uv.y)) * (1.0 - smoothstep(0.78, 0.83, uv.y));
      float head = length((p - vec2(0.0, 0.88)) * vec2(1.0, 1.25)) - 0.2;
      float d = min(body, head);
      float edge = noise(vec2(uv.x * 14.0, uv.y * 14.0 - uTime * 0.6)) * 0.12;
      float a = 1.0 - smoothstep(-0.02, 0.06 + edge, d);
      a *= smoothstep(0.0, 0.08, uv.y + edge); // feet dissolve into fog
      // Pale face: two dark eye holes in a faint mask.
      vec2 fp = p - vec2(0.0, 0.88);
      float face = (1.0 - smoothstep(0.08, 0.17, length(fp * vec2(1.0, 0.85)))) * 0.35;
      float eyes = (1.0 - smoothstep(0.015, 0.035, length(vec2(abs(fp.x) - 0.06, fp.y - 0.01))));
      vec3 col = vec3(0.02, 0.02, 0.025) + vec3(0.6, 0.58, 0.55) * face * (1.0 - eyes) * (0.4 + 0.6 * uNear);
      col += vec3(0.05, 0.05, 0.07) * (1.0 - smoothstep(-0.05, 0.02, d)) * smoothstep(-0.12, 0.0, d); // rim
      gl_FragColor = vec4(col, a * (0.92 + 0.08 * sin(uTime * 3.0)));
    }
  `,
};

export class RoomScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private lamp: THREE.PointLight;
  private backLight: THREE.PointLight;
  private ghost: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private clues: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  private flickerT = 0;
  private flickerLevel = 1;
  lightsOn = 0; // 0..1, the win ending
  flashing = true;

  /** A startled face makes the lamp stutter for a moment. Cosmetic only. */
  stutter() {
    this.flickerLevel = this.flashing ? 0.05 : 0.6;
    this.flickerT = 0.35;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 60);
    this.camera.position.set(0, 1.25, 0.4);
    this.scene.background = new THREE.Color(0x030304);
    this.scene.fog = new THREE.FogExp2(0x050506, 0.11);
    this.build();
    this.lamp = new THREE.PointLight(0xffc68a, 6, 9, 1.6);
    this.lamp.position.set(-0.7, 1.15, -0.3);
    this.scene.add(this.lamp);
    this.backLight = new THREE.PointLight(0x8090b0, 3, 10, 1.4);
    this.backLight.position.set(0, 2.6, -10.5);
    this.scene.add(this.backLight);
    this.scene.add(new THREE.AmbientLight(0x202028, 0.6));

    this.ghost = new THREE.Mesh(
      new THREE.PlaneGeometry(1.05, 2.45),
      new THREE.ShaderMaterial({ ...ghostShader, transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uSmear: { value: 0 }, uNear: { value: 0 } } }),
    );
    this.ghost.geometry.translate(0, 1.225, 0);
    this.scene.add(this.ghost);

    CLUES.forEach((text, i) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(i === 2 ? 2.6 : 1.5, i === 2 ? 0.65 : 0.38),
        new THREE.ShaderMaterial({
          ...clueShader, transparent: true, depthWrite: false,
          uniforms: { map: { value: clueTexture(text) }, uReveal: { value: 0 }, uTime: { value: 0 }, uFound: { value: 0 } },
        }),
      );
      const spot = CLUE_SPOTS[i];
      m.position.set(...spot.pos);
      m.rotation.y = spot.rotY;
      this.clues.push(m);
      this.scene.add(m);
    });
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private build() {
    const rnd = seeded(42);
    const mat = (c: number, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 16), mat(0x1a1714));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -6;
    this.scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(6, 16), mat(0x0c0c0c));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 3.2, -6);
    this.scene.add(ceil);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), mat(0x2a2620));
    back.position.set(0, 1.6, -13);
    this.scene.add(back);

    const wood = mat(0x2b2118, 0.8);
    const boxCols = [0x5a4c38, 0x4a4030, 0x6b5a42, 0x3a3328];
    for (const side of [-1, 1]) {
      for (let z = -1.2; z > -12.5; z -= 2.1) {
        const unit = new THREE.Group();
        // Uprights and shelves.
        for (const dz of [-0.95, 0.95]) {
          const up = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.6, 0.05), wood);
          up.position.set(0, 1.3, dz);
          unit.add(up);
        }
        for (let y = 0.15; y < 2.6; y += 0.6) {
          const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 1.95), wood);
          shelf.position.set(0, y, 0);
          unit.add(shelf);
          // Archive boxes and film reels.
          for (let k = -0.85; k < 0.85; k += 0.32) {
            if (rnd() < 0.18) continue;
            if (rnd() < 0.3) {
              const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 20), mat(0x3a3a3e, 0.5));
              reel.rotation.z = Math.PI / 2;
              reel.position.set(0, y + 0.2, k);
              unit.add(reel);
            } else {
              const h = 0.28 + rnd() * 0.2;
              const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, h, 0.26), mat(boxCols[Math.floor(rnd() * boxCols.length)]));
              box.position.set(0, y + 0.02 + h / 2, k + (rnd() - 0.5) * 0.04);
              unit.add(box);
            }
          }
        }
        unit.position.set(side * 1.5, 0, z);
        this.scene.add(unit);
      }
    }
    // A desk with a lamp right in front of you.
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.6), mat(0x3b2a1e, 0.7));
    desk.position.set(-0.3, 0.78, -0.35);
    this.scene.add(desk);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.09, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x2c4a32, side: THREE.DoubleSide, emissive: 0x332211 }));
    shade.position.set(-0.85, 1.0, -0.55);
    this.scene.add(shade);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * @param squint 0 open .. 1 squint floor
   * @param clueIndex the clue currently being searched for (-1 for none)
   */
  render(o: { t: number; dt: number; distance: number; velocity: number; squint: number; clueIndex: number; cluesFound: number; clueProgress: number; pulseFactor: number }) {
    const { t, dt } = o;
    // Lamp flicker, worse as the ghost gets close. Gentle only when flashing is off.
    this.flickerT -= dt;
    const near = Math.max(0, Math.min(1, 1 - (o.distance - 1) / 8));
    if (this.flickerT <= 0) {
      const chance = 0.15 + 0.6 * near;
      this.flickerLevel = Math.random() < chance ? (this.flashing ? 0.1 + Math.random() * 0.5 : 0.75) : 1;
      this.flickerT = 0.05 + Math.random() * (this.flickerLevel < 1 ? 0.12 : 0.9);
    }
    const on = this.lightsOn;
    this.lamp.intensity = (6 * this.flickerLevel) * (1 - on) + 30 * on;
    this.backLight.intensity = 3 * (1 - on) + 25 * on;
    (this.scene.fog as THREE.FogExp2).density = 0.11 * (1 - on) + 0.02 * on;
    this.renderer.toneMappingExposure = (1.0 - 0.45 * o.squint) * (1 - on) + 1.6 * on;

    // Breathing camera sway.
    this.camera.position.x = Math.sin(t * 0.37) * 0.03;
    this.camera.position.y = 1.25 + Math.sin(t * 0.9) * 0.01;
    this.camera.lookAt(0, 1.3, -8);

    const g = this.ghost;
    g.position.set(Math.sin(t * 0.2) * 0.15 * (1 - near), 0, this.camera.position.z - o.distance);
    g.lookAt(this.camera.position.x, 0, this.camera.position.z);
    g.visible = on < 0.5;
    g.material.uniforms.uTime.value = t;
    g.material.uniforms.uSmear.value = Math.min(1, Math.max(0, o.velocity * 3));
    g.material.uniforms.uNear.value = near;

    this.clues.forEach((m, i) => {
      const u = m.material.uniforms;
      u.uTime.value = t;
      const active = i === o.clueIndex;
      const reveal = active ? Math.max(0, Math.min(1, (o.squint - 0.3) / 0.35)) : 0;
      u.uReveal.value += (reveal - u.uReveal.value) * Math.min(1, dt * 6);
      u.uFound.value = i < o.cluesFound ? 1 : 0;
    });
    this.renderer.render(this.scene, this.camera);
  }
}
