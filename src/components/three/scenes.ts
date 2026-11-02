import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type SceneName = "robot" | "desk";

export interface Pointer {
  x: number;
  y: number;
}

export interface SceneHandle {
  frame(seconds: number, pointer: Pointer): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

interface Built {
  root: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  update(seconds: number, pointer: Pointer): void;
}

const VIOLET = "#7c4dff";
const VIOLET_DEEP = "#5b2fd6";

function glossy(color: string, roughness = 0.28): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.02, clearcoat: 0.8, clearcoatRoughness: 0.22 });
}

function glowing(color: string, intensity = 2.2): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
}

function softShadow(size: number, opacity: number): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, `rgba(72, 40, 170, ${opacity})`);
  gradient.addColorStop(1, "rgba(72, 40, 170, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** Робот-помощник: голова следит за курсором, глаза моргают, рука машет, антенна пульсирует. */
function buildRobot(aspect: number): Built {
  const root = new THREE.Group();
  const white = glossy("#fbfaff", 0.24);
  const violet = glossy(VIOLET, 0.3);
  const visor = new THREE.MeshPhysicalMaterial({ color: "#15103c", roughness: 0.1, clearcoat: 1 });
  const eye = glowing("#6ff2ff", 2.4);
  const beacon = glowing("#b79bff", 2);

  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.78, 48, 32), white);
  torso.scale.set(1, 0.92, 0.82);
  torso.position.y = -0.82;
  body.add(torso);

  const chest = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.46, 0.12, 6, 0.08), violet);
  chest.position.set(0, -0.78, 0.6);
  body.add(chest);
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), eye);
  heart.position.set(0, -0.78, 0.68);
  body.add(heart);

  const armGeometry = new THREE.CapsuleGeometry(0.15, 0.42, 8, 24);
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.8, -0.58, 0.05);
  const leftMesh = new THREE.Mesh(armGeometry, white);
  leftMesh.position.y = -0.28;
  leftArm.add(leftMesh);
  leftArm.rotation.z = -0.32;
  body.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.8, -0.58, 0.05);
  const rightMesh = new THREE.Mesh(armGeometry, white);
  rightMesh.position.y = -0.28;
  rightArm.add(rightMesh);
  body.add(rightArm);

  const head = new THREE.Group();
  head.position.y = 0.42;
  body.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.98, 64, 48), white);
  skull.scale.set(1.12, 0.92, 0.94);
  head.add(skull);

  const face = new THREE.Mesh(new THREE.SphereGeometry(0.8, 48, 32), visor);
  face.scale.set(1.08, 0.66, 0.5);
  face.position.z = 0.56;
  head.add(face);

  const eyes = new THREE.Group();
  eyes.position.z = 0.96;
  const eyeGeometry = new THREE.CapsuleGeometry(0.1, 0.1, 8, 20);
  const leftEye = new THREE.Mesh(eyeGeometry, eye);
  leftEye.position.x = -0.32;
  const rightEye = new THREE.Mesh(eyeGeometry, eye);
  rightEye.position.x = 0.32;
  eyes.add(leftEye, rightEye);
  head.add(eyes);

  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 12, 32, Math.PI), eye);
  smile.rotation.z = Math.PI;
  smile.position.set(0, -0.14, 0.97);
  head.add(smile);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 32), violet);
    ear.rotation.z = Math.PI / 2;
    ear.position.x = side * 1.1;
    head.add(ear);
  }

  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.3, 12), violet);
  stalk.position.y = 1.0;
  head.add(stalk);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), beacon);
  tip.position.y = 1.2;
  head.add(tip);

  const shadow = softShadow(2.8, 0.34);
  shadow.position.y = -1.86;
  root.add(shadow);

  const camera = new THREE.PerspectiveCamera(28, aspect, 0.1, 50);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, -0.2, 0);

  let lookX = 0;
  let lookY = 0;

  return {
    root,
    camera,
    update(t, pointer) {
      const bob = Math.sin(t * 1.4);
      body.position.y = bob * 0.07;
      shadow.scale.setScalar(1 - bob * 0.05);
      lookX += (pointer.x - lookX) * 0.08;
      lookY += (pointer.y - lookY) * 0.08;
      head.rotation.y = lookX * 0.55;
      head.rotation.x = -lookY * 0.3 + Math.sin(t * 0.7) * 0.02;
      body.rotation.y = lookX * 0.14;
      eyes.position.x = lookX * 0.05;
      eyes.position.y = lookY * 0.04;
      const blink = (t % 4.3) < 0.11 ? 0.1 : 1;
      leftEye.scale.y = blink;
      rightEye.scale.y = blink;
      const waving = (t % 6) < 1.7;
      const wave = waving ? 2.25 + Math.sin(t * 8) * 0.22 : 0.32;
      rightArm.rotation.z += (wave - rightArm.rotation.z) * 0.12;
      beacon.emissiveIntensity = 1.6 + Math.sin(t * 3) * 0.9;
    },
  };
}

function screenTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 640;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 1024, 640);
  gradient.addColorStop(0, "#f3efff");
  gradient.addColorStop(1, "#dcd2ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 640);
  ctx.fillStyle = VIOLET_DEEP;
  ctx.font = "800 150px Manrope, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Mekty", 512, 300);
  return new THREE.CanvasTexture(canvas);
}

/** Рабочий стол учителя: ноутбук, стопка учебников, кружка с карандашами и плавающие искры. */
function buildDesk(aspect: number): Built {
  const root = new THREE.Group();
  const silver = glossy("#e7e5f4", 0.32);
  const dark = new THREE.MeshPhysicalMaterial({ color: "#2b2650", roughness: 0.45 });
  const screen = new THREE.MeshBasicMaterial({ map: screenTexture() });
  screen.map!.colorSpace = THREE.SRGBColorSpace;

  const laptop = new THREE.Group();
  root.add(laptop);
  const base = new THREE.Mesh(new RoundedBoxGeometry(3.3, 0.12, 2.1, 6, 0.05), silver);
  base.position.y = 0.06;
  laptop.add(base);
  const keys = new THREE.Mesh(new RoundedBoxGeometry(2.9, 0.02, 1.1, 2, 0.01), dark);
  keys.position.set(0, 0.125, -0.28);
  laptop.add(keys);
  const pad = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.012, 0.5, 2, 0.005), glossy("#d3d0e8", 0.4));
  pad.position.set(0, 0.125, 0.68);
  laptop.add(pad);

  const lid = new THREE.Group();
  lid.position.set(0, 0.12, -1.04);
  lid.rotation.x = -0.26;
  laptop.add(lid);
  const shell = new THREE.Mesh(new RoundedBoxGeometry(3.3, 2.1, 0.08, 6, 0.04), silver);
  shell.position.y = 1.05;
  lid.add(shell);
  const display = new THREE.Mesh(new THREE.PlaneGeometry(3.08, 1.9), screen);
  display.position.set(0, 1.05, 0.045);
  lid.add(display);

  const books = new THREE.Group();
  books.position.set(-2.55, 0, 0.45);
  books.rotation.y = 0.28;
  root.add(books);
  [
    { color: "#f4a63a", height: 0.26, y: 0.13, w: 1.5, turn: 0 },
    { color: VIOLET, height: 0.24, y: 0.38, w: 1.36, turn: 0.14 },
    { color: "#39b47a", height: 0.22, y: 0.61, w: 1.24, turn: -0.1 },
  ].forEach(({ color, height, y, w, turn }) => {
    const cover = new THREE.Mesh(new RoundedBoxGeometry(w, height, 1.0, 4, 0.03), glossy(color));
    cover.position.y = y;
    cover.rotation.y = turn;
    const pages = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, height - 0.07, 0.92), new THREE.MeshStandardMaterial({ color: "#fbfaff" }));
    pages.position.set(0.05, 0, 0.01);
    cover.add(pages);
    books.add(cover);
  });

  const mug = new THREE.Group();
  mug.position.set(2.55, 0, 0.3);
  root.add(mug);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.36, 0.8, 40, 1, true), glossy("#a889ff"));
  cup.position.y = 0.4;
  cup.material.side = THREE.DoubleSide;
  mug.add(cup);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 32), glossy("#a889ff"));
  floor.position.y = 0.03;
  mug.add(floor);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 12, 32), glossy("#a889ff"));
  handle.position.set(0.42, 0.42, 0);
  mug.add(handle);
  ["#f4a63a", "#ef5da8", "#39b47a", "#4a90f5"].forEach((color, i) => {
    const pencil = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.05, 12), glossy(color));
    pencil.add(stem);
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 12), new THREE.MeshStandardMaterial({ color: "#2b2650" }));
    point.position.y = 0.6;
    pencil.add(point);
    pencil.position.set(-0.14 + i * 0.1, 0.92, -0.08 + (i % 2) * 0.14);
    pencil.rotation.z = -0.2 + i * 0.13;
    mug.add(pencil);
  });

  const sparks = new THREE.Group();
  const sparkMaterial = glowing("#fff4c4", 1.7);
  const sparkGeometry = new THREE.OctahedronGeometry(0.09);
  const seeds = [
    [-3.1, 2.1, 0.2], [-1.9, 2.75, -0.4], [2.3, 2.5, -0.2], [3.2, 1.55, 0.3], [0.9, 3.0, -0.8], [-3.5, 1.0, -0.2],
  ];
  seeds.forEach(([x, y, z]) => {
    const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
    spark.position.set(x, y, z);
    sparks.add(spark);
  });
  root.add(sparks);

  const shadow = softShadow(9, 0.28);
  shadow.position.y = -0.01;
  shadow.scale.set(1, 0.55, 1);
  root.add(shadow);

  const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 60);
  let lookX = 0;
  let lookY = 0;

  return {
    root,
    camera,
    update(t, pointer) {
      lookX += (pointer.x - lookX) * 0.05;
      lookY += (pointer.y - lookY) * 0.05;
      camera.position.set(lookX * 1.0, 2.7 + lookY * 0.4, 8.6);
      camera.lookAt(0, 1.05, 0);
      laptop.position.y = Math.sin(t * 1.1) * 0.05 + 0.02;
      books.position.y = Math.sin(t * 1.1 + 1.4) * 0.05 + 0.02;
      mug.position.y = Math.sin(t * 1.1 + 2.6) * 0.05 + 0.02;
      sparks.children.forEach((spark, i) => {
        spark.rotation.y = t * (0.9 + i * 0.1);
        spark.position.y = seeds[i]![1]! + Math.sin(t * 1.3 + i) * 0.14;
        spark.scale.setScalar(0.72 + Math.sin(t * 2.2 + i * 1.7) * 0.34);
      });
    },
  };
}

function freeObject(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      (m as THREE.MeshBasicMaterial).map?.dispose();
      m.dispose();
    }
  });
}

/** Рисует сцену на готовом canvas. Падение WebGL бросает ошибку: экран покажет запасной рисунок. */
export function mountScene(canvas: HTMLCanvasElement, name: SceneName): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  pmrem.dispose();

  const key = new THREE.DirectionalLight("#ffffff", 1.5);
  key.position.set(3, 6, 5);
  scene.add(key);
  const rim = new THREE.PointLight(VIOLET, 18);
  rim.position.set(-4, 1, 3);
  scene.add(rim);

  const built = name === "robot" ? buildRobot(1) : buildDesk(1);
  scene.add(built.root);

  return {
    frame(seconds, pointer) {
      built.update(seconds, pointer);
      renderer.render(scene, built.camera);
    },
    resize(width, height) {
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      built.camera.aspect = width / height;
      built.camera.updateProjectionMatrix();
    },
    dispose() {
      freeObject(scene);
      environment.dispose();
      renderer.dispose();
    },
  };
}
