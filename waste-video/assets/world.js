/* DebrisLink 3D city. Every frame is drawn from timeline time t (seconds) in renderAt(t). */
(function () {
  const W = 1920,
    H = 1080;
  const canvas = document.getElementById("world");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const SKY = 0xc9dbe8;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 140, 330);
  const camera = new THREE.PerspectiveCamera(36, W / H, 0.5, 700);

  // ---------- seeded random ----------
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(20261114);
  const rr = (a, b) => a + (b - a) * rnd();

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xdde9ff, 0x6b5c48, 0.55));
  const sun = new THREE.DirectionalLight(0xffe7c4, 3.0);
  sun.position.set(70, 110, 55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -110;
  sc.right = 110;
  sc.top = 110;
  sc.bottom = -110;
  sc.near = 20;
  sc.far = 320;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  // ---------- canvas textures ----------
  function makeTex(size, draw, rx, ry) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    draw(g, size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx || 1, ry || 1);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }
  function noise(g, s, base, cols, n, rmax) {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < n; i++) {
      g.fillStyle = cols[Math.floor(rnd() * cols.length)];
      g.globalAlpha = rr(0.25, 0.7);
      const r = rr(0.5, rmax);
      g.beginPath();
      g.arc(rnd() * s, rnd() * s, r, 0, 6.283);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  const asphaltTex = makeTex(256, (g, s) => noise(g, s, "#45474b", ["#3a3c40", "#55585c", "#4c4f53", "#36383b"], 5000, 1.6), 1, 1);
  const grassTex = makeTex(256, (g, s) => noise(g, s, "#5d7d3a", ["#4e6e30", "#6c8c45", "#47652b", "#789650"], 6000, 2.2), 60, 60);
  const dirtTex = makeTex(256, (g, s) => noise(g, s, "#a88a64", ["#977a55", "#b99a72", "#8c7150", "#c2a57d"], 6000, 2.4), 8, 8);
  const paverTex = makeTex(
    256,
    (g, s) => {
      g.fillStyle = "#b4aa99";
      g.fillRect(0, 0, s, s);
      const n = 8,
        q = s / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const v = Math.floor(rr(196, 222));
          g.fillStyle = `rgb(${v},${v - 8},${v - 20})`;
          g.fillRect(i * q + 1.5, j * q + 1.5, q - 3, q - 3);
        }
    },
    12,
    8,
  );
  const sidewalkTex = makeTex(
    128,
    (g, s) => {
      noise(g, s, "#c4beb4", ["#b8b2a8", "#cfc9bf"], 900, 1.2);
      g.strokeStyle = "#a39d93";
      g.lineWidth = 2;
      g.strokeRect(0, 0, s, s);
    },
    1,
    1,
  );
  function brickTex(rx, ry) {
    return makeTex(
      256,
      (g, s) => {
        g.fillStyle = "#cbbfae";
        g.fillRect(0, 0, s, s);
        const bh = 16,
          bw = 48;
        for (let row = 0; row < s / bh; row++) {
          const off = row % 2 ? bw / 2 : 0;
          for (let x = -bw; x < s + bw; x += bw) {
            const r = Math.floor(rr(150, 185)),
              gg = Math.floor(rr(70, 90)),
              b = Math.floor(rr(48, 62));
            g.fillStyle = `rgb(${r},${gg},${b})`;
            g.fillRect(x + off + 1.5, row * bh + 1.5, bw - 3, bh - 3);
          }
        }
      },
      rx,
      ry,
    );
  }
  function facadeTex(wall, glass, cols, rows) {
    return makeTex(
      256,
      (g, s) => {
        g.fillStyle = wall;
        g.fillRect(0, 0, s, s);
        const cw = s / cols,
          rh = s / rows;
        for (let i = 0; i < cols; i++)
          for (let j = 0; j < rows; j++) {
            const grd = g.createLinearGradient(0, j * rh, 0, j * rh + rh);
            grd.addColorStop(0, "#7e95a8");
            grd.addColorStop(1, glass);
            g.fillStyle = grd;
            g.fillRect(i * cw + cw * 0.18, j * rh + rh * 0.22, cw * 0.64, rh * 0.56);
          }
      },
      1,
      1,
    );
  }
  const latticeTex = makeTex(
    64,
    (g, s) => {
      g.clearRect(0, 0, s, s);
      g.strokeStyle = "#f2b705";
      g.lineWidth = 6;
      g.strokeRect(3, 0, s - 6, s);
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(s, s);
      g.moveTo(s, 0);
      g.lineTo(0, s);
      g.stroke();
    },
    1,
    1,
  );

  // ---------- materials ----------
  const M = (color, rough = 0.85, metal = 0, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra));
  const mat = {
    wallCream: M(0xe6dccb, 0.9),
    wallWhite: M(0xe9e6df, 0.88),
    wallSand: M(0xd8bf98, 0.9),
    stone: M(0x8f8476, 0.85),
    glass: M(0x2f3f4d, 0.12, 0.6),
    frame: M(0x2b2b2b, 0.5, 0.3),
    door: M(0x6b4a33, 0.7),
    gate: M(0x22262a, 0.45, 0.6),
    roofTile: M(0x8a3523, 0.8),
    concrete: M(0xb8b4ab, 0.92),
    rebar: M(0x7a4b2e, 0.6, 0.5),
    scaffold: M(0x9ca3aa, 0.45, 0.65),
    plank: M(0x9b7a52, 0.85),
    net: M(0x2f7a4a, 0.9, 0, { transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    crane: new THREE.MeshStandardMaterial({ map: latticeTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 }),
    craneSolid: M(0xf2b705, 0.55, 0.3),
    weight: M(0x8d8a84, 0.9),
    trunk: M(0x5e4632, 0.95),
    leaf1: M(0x4f7a3a, 0.95),
    leaf2: M(0x5f8a45, 0.95),
    tire: M(0x1c1c1e, 0.92),
    hub: M(0xb7bcc2, 0.35, 0.8),
    chassis: M(0x2a2c30, 0.6, 0.4),
    light: new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff2c4, emissiveIntensity: 0.6, roughness: 0.3 }),
    redLight: new THREE.MeshStandardMaterial({ color: 0xb3261e, emissive: 0x7a120c, emissiveIntensity: 0.5 }),
    water: M(0x5f9fb8, 0.08, 0.3),
    bench: M(0x7a5a3c, 0.8),
    metalDark: M(0x3a3e43, 0.5, 0.6),
    sand: M(0x9a774a, 1.0),
    brick: M(0x9a3a22, 0.9),
    chunk: M(0x76736c, 0.95, 0, { flatShading: true }),
    chunk2: M(0x5f5c57, 0.95, 0, { flatShading: true }),
    bag: M(0xbfb39b, 0.95),
    tileBroken: M(0xc9c3b6, 0.7),
    hoarding: M(0x2f5d7c, 0.7),
    curb: M(0xd6d1c8, 0.9),
    line: M(0xf2f0e8, 0.7),
    yellowLine: M(0xe9b824, 0.7),
  };

  function box(w, h, d, m, x, y, z, parent, cast = true, receive = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    (parent || scene).add(mesh);
    return mesh;
  }
  function cyl(r1, r2, h, m, x, y, z, parent, seg = 16) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (parent || scene).add(mesh);
    return mesh;
  }

  // ---------- ground, roads ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  grassTex.repeat.set(150, 150);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const ROADS = [-150, -100, -50, 0, 50, 100, 150];
  const EXT = 330;
  function roadMat(len) {
    const t = asphaltTex.clone();
    t.needsUpdate = true;
    t.repeat.set(len / 8, 10 / 8);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  }
  const rmX = roadMat(EXT * 2);
  const rmZ = roadMat(EXT * 2);
  rmZ.map.repeat.set(10 / 8, (EXT * 2) / 8);
  const swX = (() => {
    const t = sidewalkTex.clone();
    t.needsUpdate = true;
    t.repeat.set(EXT, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  })();
  const swZ = (() => {
    const t = sidewalkTex.clone();
    t.needsUpdate = true;
    t.repeat.set(1, EXT);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  })();
  ROADS.forEach((p) => {
    // along x at z=p
    const a = new THREE.Mesh(new THREE.PlaneGeometry(EXT * 2, 10), rmX);
    a.rotation.x = -Math.PI / 2;
    a.position.set(0, 0.02, p);
    a.receiveShadow = true;
    scene.add(a);
    // along z at x=p
    const b = new THREE.Mesh(new THREE.PlaneGeometry(10, EXT * 2), rmZ);
    b.rotation.x = -Math.PI / 2;
    b.position.set(p, 0.025, 0);
    b.receiveShadow = true;
    scene.add(b);
    // sidewalks
    box(EXT * 2, 0.18, 2.6, swX, 0, 0.09, p - 6.3, null, false, true);
    box(EXT * 2, 0.18, 2.6, swX, 0, 0.09, p + 6.3, null, false, true);
    box(2.6, 0.19, EXT * 2, swZ, p - 6.3, 0.095, 0, null, false, true);
    box(2.6, 0.19, EXT * 2, swZ, p + 6.3, 0.095, 0, null, false, true);
  });
  // lane dashes on the central roads
  const dashGeo = new THREE.PlaneGeometry(3, 0.18);
  [-50, 0, 50].forEach((p) => {
    for (let x = -EXT; x < EXT; x += 7) {
      if (ROADS.some((r) => Math.abs(x - r) < 7)) continue;
      const d = new THREE.Mesh(dashGeo, mat.line);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.04, p);
      d.receiveShadow = true;
      scene.add(d);
      const e = new THREE.Mesh(dashGeo, mat.line);
      e.rotation.x = -Math.PI / 2;
      e.rotation.z = Math.PI / 2;
      e.position.set(p, 0.045, x);
      e.receiveShadow = true;
      scene.add(e);
    }
  });

  // ---------- trees, lamps, cars ----------
  function tree(x, z, s = 1) {
    const g = new THREE.Group();
    cyl(0.18 * s, 0.26 * s, 3 * s, mat.trunk, 0, 1.5 * s, 0, g, 8);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(1.3, 1.9) * s, 1), i % 2 ? mat.leaf1 : mat.leaf2);
      f.position.set(rr(-0.7, 0.7) * s, (3.4 + rr(0, 1.2)) * s, rr(-0.7, 0.7) * s);
      f.castShadow = true;
      f.receiveShadow = true;
      g.add(f);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }
  function lamp(x, z, dir) {
    cyl(0.09, 0.12, 7, mat.metalDark, x, 3.5, z, null, 8);
    const arm = box(0.1, 0.1, 1.6, mat.metalDark, x, 7, z + dir * 0.8, null);
    box(0.35, 0.12, 0.6, mat.light, x, 6.9, z + dir * 1.5, null);
  }
  for (let x = -140; x <= 140; x += 22) {
    if (ROADS.some((r) => Math.abs(x - r) < 9)) continue;
    if (x > -32 && x < 2) continue;
    lamp(x, -7.1, 1);
    lamp(x + 11, 7.1, -1);
  }
  function car(x, z, rot, color) {
    const g = new THREE.Group();
    const body = M(color, 0.3, 0.5);
    box(4.2, 0.75, 1.8, body, 0, 0.75, 0, g);
    box(2.3, 0.65, 1.62, body, -0.25, 1.45, 0, g);
    box(2.36, 0.5, 1.64, mat.glass, -0.25, 1.45, 0, g);
    [
      [1.35, 0.85],
      [-1.35, 0.85],
      [1.35, -0.85],
      [-1.35, -0.85],
    ].forEach(([a, b]) => {
      const w = cyl(0.36, 0.36, 0.26, mat.tire, a, 0.36, b, g, 14);
      w.rotation.x = Math.PI / 2;
    });
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
  }

  // ---------- houses ----------
  function windowOn(g, x, y, z, w, h, rotY) {
    const fr = box(w + 0.2, h + 0.2, 0.12, mat.frame, x, y, z, g);
    fr.rotation.y = rotY;
    const gl = box(w, h, 0.16, mat.glass, x, y, z, g);
    gl.rotation.y = rotY;
  }
  // modern flat-roof two-storey house; front faces +z of its group
  function houseModern(x, z, rot, wallMat) {
    const g = new THREE.Group();
    const w = 13,
      d = 10,
      h1 = 3.4;
    box(w, h1, d, wallMat, 0, h1 / 2 + 0.3, 0, g); // ground floor
    box(w - 2, h1, d - 1, wallMat, -1, h1 * 1.5 + 0.3, -0.5, g); // first floor set back
    box(w + 0.6, 0.3, d + 0.6, mat.concrete, 0, h1 + 0.3, 0, g); // slab
    box(w - 1.6, 0.25, d - 0.6, mat.concrete, -1, h1 * 2 + 0.3, -0.5, g); // roof slab
    // parapet
    box(w - 1.6, 0.9, 0.2, wallMat, -1, h1 * 2 + 0.85, d / 2 - 0.9, g);
    box(w - 1.6, 0.9, 0.2, wallMat, -1, h1 * 2 + 0.85, -d / 2 - 0.1 + 0.1, g);
    box(0.2, 0.9, d - 0.6, wallMat, -w / 2 + 0.2, h1 * 2 + 0.85, -0.5, g);
    box(0.2, 0.9, d - 0.6, wallMat, w / 2 - 1.8 - 0.2, h1 * 2 + 0.85, -0.5, g);
    // stone cladding feature
    box(3.2, h1 * 2, 0.25, mat.stone, w / 2 - 3.6, h1 + 0.3, d / 2 + 0.05, g);
    // balcony railing
    box(w - 2.4, 0.08, 0.08, mat.gate, -1.2, h1 + 1.4, d / 2 + 0.25, g);
    for (let i = -5; i <= 4; i++) box(0.05, 1.0, 0.05, mat.gate, i * 1.1, h1 + 0.95, d / 2 + 0.25, g);
    // windows front
    windowOn(g, -3.8, 2.1, d / 2 + 0.02, 2.4, 1.6, 0);
    windowOn(g, -3.8, h1 + 2.1, d / 2 - 1 + 0.02, 2.4, 1.6, 0);
    windowOn(g, 0.4, h1 + 2.1, d / 2 - 1 + 0.02, 2.4, 1.6, 0);
    // door
    box(1.4, 2.4, 0.15, mat.door, 1.0, 1.5, d / 2 + 0.05, g);
    // side windows
    windowOn(g, w / 2 + 0.02, 2.1, -1.5, 2, 1.4, Math.PI / 2);
    windowOn(g, -w / 2 - 0.02, 2.1, -1.5, 2, 1.4, Math.PI / 2);
    // plinth
    box(w + 0.4, 0.3, d + 0.4, mat.stone, 0, 0.15, 0, g);
    // boundary wall with gate
    const bz = d / 2 + 4.6;
    box(w / 2 - 2.3, 1.8, 0.25, wallMat, -w / 2 + (w / 2 - 2.3) / 2 - 1.2, 0.9, bz, g);
    box(w / 2 - 2.3, 1.8, 0.25, wallMat, w / 2 - (w / 2 - 2.3) / 2 + 1.2, 0.9, bz, g);
    box(4.2, 1.7, 0.08, mat.gate, 0, 0.95, bz, g);
    box(0.25, 1.8, d + 4.6, wallMat, -w / 2 - 1.2, 0.9, 2.3, g);
    box(0.25, 1.8, d + 4.6, wallMat, w / 2 + 1.2, 0.9, 2.3, g);
    // driveway
    const dw = box(4.2, 0.06, 4.4, mat.concrete, 0, 0.03, d / 2 + 2.3, g, false, true);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
    return g;
  }
  // pitched-roof house
  function housePitched(x, z, rot) {
    const g = new THREE.Group();
    const w = 11,
      d = 9,
      h = 6.4;
    box(w, h, d, mat.wallSand, 0, h / 2 + 0.3, 0, g);
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2 - 0.6, 0);
    shape.lineTo(0, 3.4);
    shape.lineTo(d / 2 + 0.6, 0);
    shape.lineTo(-d / 2 - 0.6, 0);
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: w + 1, bevelEnabled: false }), mat.roofTile);
    roof.rotation.y = Math.PI / 2;
    roof.position.set(-(w + 1) / 2, h + 0.3, 0);
    roof.castShadow = roof.receiveShadow = true;
    g.add(roof);
    windowOn(g, -2.8, 2.1, d / 2 + 0.02, 2.0, 1.5, 0);
    windowOn(g, 2.8, 2.1, d / 2 + 0.02, 2.0, 1.5, 0);
    windowOn(g, -2.8, 5.0, d / 2 + 0.02, 2.0, 1.4, 0);
    windowOn(g, 2.8, 5.0, d / 2 + 0.02, 2.0, 1.4, 0);
    box(1.4, 2.4, 0.15, mat.door, 0, 1.5, d / 2 + 0.05, g);
    box(w + 0.4, 0.3, d + 0.4, mat.stone, 0, 0.15, 0, g);
    const bz = d / 2 + 4.2;
    box(w / 2 - 1.8, 1.6, 0.25, mat.wallWhite, -w / 2 + (w / 2 - 1.8) / 2 - 1, 0.8, bz, g);
    box(w / 2 - 1.8, 1.6, 0.25, mat.wallWhite, w / 2 - (w / 2 - 1.8) / 2 + 1, 0.8, bz, g);
    box(3.6, 1.5, 0.08, mat.gate, 0, 0.85, bz, g);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
    tree(x - 6, z + 3.5, 0.9);
    return g;
  }
  // block NW: hero house (just finished) + neighbour; front faces road z=0 (+z)
  houseModern(-18, -21, 0, mat.wallCream); // hero house
  housePitched(-37, -21, 0);
  // block SW: houses facing road z=0 (-z)
  houseModern(-20, 21, Math.PI, mat.wallWhite);
  housePitched(-38, 21, Math.PI);
  tree(-6, -12, 1);
  tree(-46, -36, 1.1);
  tree(-8, 33, 1);
  tree(-47, 38, 1.2);

  // ---------- building under construction (block NE) ----------
  (function () {
    const g = new THREE.Group();
    const cx = 25,
      cz = -26,
      fw = 22,
      fd = 15,
      fh = 3.3,
      floors = 6;
    const site = new THREE.Mesh(new THREE.PlaneGeometry(42, 40), new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1 }));
    site.rotation.x = -Math.PI / 2;
    site.position.set(cx, 0.03, cz + 2);
    site.receiveShadow = true;
    scene.add(site);
    const xs = [-10.5, -3.5, 3.5, 10.5],
      zs = [-7, 0, 7];
    for (let f = 0; f < floors; f++) {
      const y0 = f * fh;
      const topFloor = f === floors - 1;
      xs.forEach((x) =>
        zs.forEach((z) => {
          box(0.55, topFloor ? 1.4 : fh, 0.55, mat.concrete, x, y0 + (topFloor ? 0.7 : fh / 2), z, g);
          if (topFloor) for (let k = 0; k < 4; k++) cyl(0.03, 0.03, 1.4, mat.rebar, x + (k % 2 ? 0.15 : -0.15), y0 + 2.0, z + (k < 2 ? 0.15 : -0.15), g, 5);
        }),
      );
      if (!topFloor) box(fw + 0.4, 0.32, fd + 0.4, mat.concrete, 0, y0 + fh, 0, g);
    }
    box(fw + 1, 0.4, fd + 1, mat.concrete, 0, 0.2, 0, g);
    // brick infill on the lower two floors (front + sides)
    for (let f = 0; f < 2; f++) {
      const y = f * fh + fh / 2 + 0.2;
      for (let i = 0; i < 3; i++) {
        const x0 = (xs[i] + xs[i + 1]) / 2;
        const t = brickTex(2, 1.2);
        const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 });
        box(6.4, fh - 0.4, 0.25, m, x0, y, fd / 2 - 0.1, g);
        box(6.4, fh - 0.4, 0.25, m, x0, y, -fd / 2 + 0.1, g);
        windowOn(g, x0, y + 0.2, fd / 2 + 0.05, 2.2, 1.3, 0);
      }
    }
    // scaffolding on the front face
    const sz1 = fd / 2 + 1.2,
      sz2 = fd / 2 + 2.4;
    for (let x = -11; x <= 11; x += 2.75) {
      cyl(0.05, 0.05, 20, mat.scaffold, x, 10, sz1, g, 6);
      cyl(0.05, 0.05, 20, mat.scaffold, x, 10, sz2, g, 6);
    }
    for (let y = 2; y <= 19; y += 2) {
      [sz1, sz2].forEach((z) => {
        const l = cyl(0.045, 0.045, 22.4, mat.scaffold, 0, y, z, g, 6);
        l.rotation.z = Math.PI / 2;
      });
      box(22, 0.06, 1.1, mat.plank, 0, y - 0.03, (sz1 + sz2) / 2, g);
    }
    const net = new THREE.Mesh(new THREE.PlaneGeometry(22.4, 10), mat.net);
    net.position.set(0, 14.5, sz2 + 0.1);
    g.add(net);
    // site hoarding along the road
    for (let x = -18; x <= 18; x += 4) if (Math.abs(x) > 3) box(3.9, 2.4, 0.1, mat.hoarding, x, 1.2, fd / 2 + 9.6, g);
    // material stacks
    box(2.4, 0.8, 1.2, mat.brick, 14, 0.4, 4, g);
    box(2.4, 0.8, 1.2, mat.brick, 14, 1.2, 4, g);
    box(1.6, 0.5, 1.2, mat.bag, 14.5, 0.25, 7, g);
    g.position.set(cx, 0, cz);
    scene.add(g);
  })();

  // tower crane
  const craneJib = new THREE.Group();
  (function () {
    const x = 42,
      z = -40,
      hgt = 34;
    const mast = box(1.6, hgt, 1.6, mat.crane, x, hgt / 2, z, null);
    box(3, 1, 3, mat.concrete, x, 0.5, z, null);
    craneJib.position.set(x, hgt, z);
    scene.add(craneJib);
    box(1.4, 1.4, 1.4, mat.craneSolid, 0, 0.7, 0, craneJib); // slewing unit
    box(1.2, 1.4, 1.6, mat.glass, 1.2, 0.2, 0, craneJib); // cab
    box(1.2, 1.2, 40, mat.crane, 0, 1.9, -17, craneJib); // jib
    box(1.2, 1.2, 12, mat.crane, 0, 1.9, 7, craneJib); // counter jib
    box(2.4, 1.6, 2.2, mat.weight, 0, 1.6, 11.5, craneJib);
    box(1.1, 4.5, 1.1, mat.crane, 0, 3.6, 0, craneJib); // apex
    box(1.0, 0.6, 1.3, mat.craneSolid, 0, 1.0, -24, craneJib); // trolley
    cyl(0.03, 0.03, 18, mat.metalDark, 0, -8.3, -24, craneJib, 4);
    box(0.7, 0.9, 0.7, mat.craneSolid, 0, -17.6, -24, craneJib);
  })();

  // ---------- plaza + shops (block SE) ----------
  (function () {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), new THREE.MeshStandardMaterial({ map: paverTex, roughness: 0.9 }));
    pl.rotation.x = -Math.PI / 2;
    pl.position.set(25, 0.06, 19);
    pl.receiveShadow = true;
    scene.add(pl);
    // fountain
    cyl(4.2, 4.4, 0.7, mat.concrete, 25, 0.35, 19, null, 40);
    const water = cyl(3.85, 3.85, 0.1, mat.water, 25, 0.62, 19, null, 40);
    cyl(0.45, 0.6, 1.8, mat.concrete, 25, 1.2, 19, null, 20);
    cyl(1.5, 0.5, 0.4, mat.concrete, 25, 2.2, 19, null, 24);
    // benches
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const bx = 25 + Math.cos(a) * 7.5,
        bz = 19 + Math.sin(a) * 7.5;
      const b = box(2.2, 0.12, 0.6, mat.bench, bx, 0.5, bz, null);
      b.rotation.y = -a + Math.PI / 2;
      const l = box(2.0, 0.45, 0.4, mat.metalDark, bx, 0.24, bz, null);
      l.rotation.y = -a + Math.PI / 2;
    }
    [
      [9, 10],
      [41, 10],
      [9, 28],
      [41, 28],
      [17, 28],
      [33, 28],
    ].forEach(([x, z]) => {
      box(2.4, 0.6, 2.4, mat.concrete, x, 0.3, z, null);
      tree(x, z, 0.85);
    });
    // shops building
    const sw = 40,
      sd = 12,
      sh = 13;
    const facade = facadeTex("#d9d3c7", "#3f505e", 6, 4);
    facade.repeat.set(3, 1);
    const fm = new THREE.MeshStandardMaterial({ map: facade, roughness: 0.85 });
    const top = box(sw, sh - 4.2, sd, fm, 25, 4.2 + (sh - 4.2) / 2, 38, null);
    box(sw, 4.2, sd - 1.2, mat.glass, 25, 2.1, 38.4, null);
    box(sw + 0.4, 0.4, sd + 0.4, mat.concrete, 25, sh + 0.2, 38, null);
    box(sw, 0.25, 2.2, mat.metalDark, 25, 4.1, 31.4, null); // canopy
    const signs = [0xb23a2a, 0x1f6e8c, 0xe0a21b, 0x2f7d4f, 0x6d3fa0];
    signs.forEach((c, i) => box(6, 1.1, 0.25, M(c, 0.5), 9 + i * 8, 4.9, 31.9, null));
    for (let i = 0; i < 6; i++) box(0.3, 4.2, 0.3, mat.frame, 6 + i * 7.6, 2.1, 32.05, null);
  })();

  // ---------- filler city blocks ----------
  const facadeSet = [facadeTex("#c2a88a", "#33424f", 4, 6), facadeTex("#9c958b", "#2c3a46", 5, 8), facadeTex("#d8cdb9", "#3a4b59", 3, 5), facadeTex("#a37e66", "#2e3b45", 4, 7), facadeTex("#8a9196", "#25313b", 6, 9)];
  for (let bx = -125; bx <= 125; bx += 50)
    for (let bz = -125; bz <= 125; bz += 50) {
      if (Math.abs(bx) < 50 && Math.abs(bz) < 50) continue;
      const n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const w = rr(12, 18),
          d = rr(12, 18),
          h = Math.abs(bx) < 100 && Math.abs(bz) < 100 ? rr(6, 13) : rr(10, 30);
        const ox = (i % 2 ? 1 : -1) * rr(6, 11),
          oz = (i < 2 ? -1 : 1) * rr(6, 11);
        const t = facadeSet[Math.floor(rnd() * facadeSet.length)].clone();
        t.needsUpdate = true;
        t.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 9)));
        box(w, h, d, new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }), bx + ox, h / 2, bz + oz, null);
      }
      tree(bx + rr(-14, 14), bz + 16, rr(0.8, 1.2));
    }
  // parked cars
  car(-40, -3.4, 0, 0xc7ccd1);
  car(18, 3.4, Math.PI, 0x8a1f1f);
  car(-60, 3.4, Math.PI, 0x2d4f7c);
  car(72, -3.4, 0, 0xe8e8e8);
  car(-3.4, 30, Math.PI / 2, 0x3b3f44);
  car(3.4, -70, -Math.PI / 2, 0xd9d4c4);

  // ---------- dump truck ----------
  function dumpTruck(cabColor, bedColor) {
    const g = new THREE.Group();
    const cabM = M(cabColor, 0.35, 0.45),
      bedM = M(bedColor, 0.55, 0.25),
      bedD = M(new THREE.Color(bedColor).multiplyScalar(0.75).getHex(), 0.6, 0.25);
    box(7.8, 0.45, 1.1, mat.chassis, -0.2, 1.05, 0, g);
    // cab
    box(2.3, 2.1, 2.45, cabM, 2.75, 2.35, 0, g);
    box(2.0, 0.6, 2.45, cabM, 2.6, 3.55, 0, g);
    box(0.06, 1.0, 2.1, mat.glass, 3.93, 2.95, 0, g);
    box(1.1, 0.8, 0.06, mat.glass, 2.9, 2.95, 1.24, g);
    box(1.1, 0.8, 0.06, mat.glass, 2.9, 2.95, -1.24, g);
    box(0.08, 0.9, 1.6, mat.chassis, 3.92, 1.8, 0, g); // grille
    box(0.25, 0.35, 2.5, mat.chassis, 4.0, 1.15, 0, g); // bumper
    box(0.06, 0.25, 0.4, mat.light, 3.96, 1.75, 0.95, g);
    box(0.06, 0.25, 0.4, mat.light, 3.96, 1.75, -0.95, g);
    box(0.08, 0.5, 0.06, mat.chassis, 3.6, 3.1, 1.45, g); // mirrors
    box(0.08, 0.5, 0.06, mat.chassis, 3.6, 3.1, -1.45, g);
    const tank = cyl(0.3, 0.3, 1.0, mat.hub, 1.1, 1.0, 1.0, g, 14);
    tank.rotation.z = Math.PI / 2;
    cyl(0.07, 0.07, 1.8, mat.chassis, 1.65, 3.3, -1.0, g, 8); // exhaust
    // dump bed
    const bed = new THREE.Group();
    g.add(bed);
    box(5.2, 0.18, 2.5, bedM, -0.95, 1.45, 0, bed);
    box(5.2, 1.4, 0.12, bedM, -0.95, 2.2, 1.2, bed);
    box(5.2, 1.4, 0.12, bedM, -0.95, 2.2, -1.2, bed);
    box(0.14, 1.9, 2.5, bedM, 1.6, 2.45, 0, bed);
    box(0.12, 1.4, 2.5, bedD, -3.5, 2.2, 0, bed);
    for (let i = 0; i < 5; i++) {
      box(0.12, 1.4, 0.06, bedD, -3.2 + i * 1.15, 2.2, 1.28, bed);
      box(0.12, 1.4, 0.06, bedD, -3.2 + i * 1.15, 2.2, -1.28, bed);
    }
    box(5.2, 0.12, 0.16, bedD, -0.95, 2.95, 1.22, bed);
    box(5.2, 0.12, 0.16, bedD, -0.95, 2.95, -1.22, bed);
    box(0.08, 0.14, 0.3, mat.redLight, -3.62, 1.2, 0.95, g);
    box(0.08, 0.14, 0.3, mat.redLight, -3.62, 1.2, -0.95, g);
    // wheels
    const wheels = [];
    [2.75, -1.5, -2.75].forEach((wx) =>
      [1.08, -1.08].forEach((wz) => {
        const wg = new THREE.Group();
        wg.position.set(wx, 0.56, wz);
        const tire = cyl(0.56, 0.56, 0.48, mat.tire, 0, 0, 0, wg, 20);
        tire.rotation.x = Math.PI / 2;
        const hub = cyl(0.3, 0.3, 0.5, mat.hub, 0, 0, 0, wg, 12);
        hub.rotation.x = Math.PI / 2;
        const nut = box(0.12, 0.42, 0.52, mat.chassis, 0, 0, 0, wg);
        g.add(wg);
        wheels.push(wg);
      }),
    );
    // load mound (hidden until loaded)
    const load = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.chunk);
    load.scale.set(2.3, 0.001, 1.05);
    load.position.set(-0.95, 1.5, 0);
    load.castShadow = true;
    bed.add(load);
    g.userData = { wheels, load };
    scene.add(g);
    return g;
  }

  // fleet: [x, z, rotY]
  const fleet = [
    [-82, 2.5, 0],
    [2.5, 36, Math.PI / 2],
    [-47.5, -32, -Math.PI / 2],
    [52.5, 30, Math.PI / 2],
    [-28, 47.5, 0],
    [24, -52.5, Math.PI],
  ];
  const fleetColors = [
    [0x2b5d8a, 0xe0a21b],
    [0xb6302a, 0xd2481a],
    [0xf2f2f2, 0xd4a017],
    [0x2f6b45, 0xd2481a],
    [0xf2f2f2, 0xe0a21b],
    [0x3a3e44, 0xd2481a],
  ];
  const fleetTrucks = fleet.map((p, i) => {
    const tr = dumpTruck(fleetColors[i][0], fleetColors[i][1]);
    tr.position.set(p[0], 0, p[1]);
    tr.rotation.y = p[2];
    return tr;
  });
  const hero = dumpTruck(0xeeeeec, 0xd2481a);
  hero.rotation.y = Math.PI; // faces -x (driving west on the lane z=-2.5)

  // ---------- rubble pile in front of the hero house ----------
  const PILE = new THREE.Vector3(-14.5, 0.18, -6.3);
  const PARK_X = -15.0; // hero truck centre when parked; bed centre then sits at x = PARK_X + 0.95
  const pieces = [];
  const sandMound = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.sand);
  sandMound.position.copy(PILE);
  sandMound.castShadow = sandMound.receiveShadow = true;
  scene.add(sandMound);
  const geoms = {
    brick: new THREE.BoxGeometry(0.42, 0.14, 0.22),
    chunk: new THREE.DodecahedronGeometry(0.32, 0),
    bag: new THREE.BoxGeometry(0.85, 0.24, 0.55),
    tile: new THREE.BoxGeometry(0.5, 0.05, 0.4),
    rebar: new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5),
  };
  const kinds = ["chunk", "chunk", "brick", "brick", "chunk", "bag", "tile", "brick", "chunk", "rebar"];
  const N = 80;
  for (let i = 0; i < N; i++) {
    const k = kinds[i % kinds.length];
    const m = k === "brick" ? mat.brick : k === "bag" ? mat.bag : k === "tile" ? mat.tileBroken : k === "rebar" ? mat.rebar : i % 3 ? mat.chunk : mat.chunk2;
    const mesh = new THREE.Mesh(geoms[k], m);
    const s = k === "chunk" ? rr(0.7, 1.5) : 1;
    mesh.scale.setScalar(s);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const a = rnd() * Math.PI * 2,
      rad = Math.sqrt(rnd()) * 1.0;
    const rest = new THREE.Vector3(PILE.x + Math.cos(a) * rad * 2.6, 0, PILE.z + Math.sin(a) * rad * 0.95);
    const hgt = (1 - rad) * 1.15;
    rest.y = PILE.y + 0.12 + hgt * rr(0.55, 1.0);
    const rot = new THREE.Euler(rr(0, 3), rr(0, 3), rr(0, 3));
    const bedLocal = new THREE.Vector3(-0.95 + rr(-2.2, 2.2), 1.75 + rr(0, 0.9), rr(-0.95, 0.95));
    scene.add(mesh);
    pieces.push({ mesh, rest, rot, bedLocal, appear: 7.7 + (i / N) * 2.6 + rr(0, 0.3), load: 32.9 + (i / N) * 2.0 + rr(0, 0.2) });
  }

  // ---------- connection arcs + site beacon ----------
  const arcs = fleet.map((p, i) => {
    const a = new THREE.Vector3(PILE.x, 0.4, PILE.z);
    const b = new THREE.Vector3(p[0], 3.4, p[1]);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y = 10 + a.distanceTo(b) * 0.18;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const geo = new THREE.TubeGeometry(curve, 80, 0.38, 8, false);
    const m = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 1, toneMapped: false, fog: false });
    const mesh = new THREE.Mesh(geo, m);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 40, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.35, toneMapped: false, fog: false, side: THREE.DoubleSide }));
  beacon.position.set(PILE.x, 20, PILE.z);
  scene.add(beacon);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.0, 48), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, toneMapped: false, side: THREE.DoubleSide, fog: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(PILE.x, 0.3, PILE.z);
  scene.add(ring);

  // ---------- camera path ----------
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // [time, position, target, ease into this key]
  const keys = [
    [0, V(-120, 78, 120), V(-5, 0, -8), "io"],
    [7.2, V(-34, 13, 20), V(-17, 2.5, -14), "io"],
    [12.6, V(-6.5, 3.6, 3.2), V(-14.5, 0.9, -6.3), "io"],
    [16.0, V(4, 175, 70), V(-4, 0, -6), "io"],
    [19.0, V(-6, 168, 66), V(-4, 0, -6), "lin"],
    [19.01, V(95, 52, 85), V(5, 0, -5), "cut"],
    [25.5, V(70, 44, 98), V(0, 0, -8), "lin"],
    [30.4, V(4.5, 4.6, 10.5), V(-14, 1.4, -4.5), "io"],
    [36.8, V(-1.5, 4.0, 11.5), V(-16, 1.5, -5), "lin"],
    [41.0, V(-70, 52, 64), V(-12, 0, -10), "io"],
  ];
  const ease = {
    io: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
    lin: (u) => u,
    cut: () => 1,
  };
  const _p = V(0, 0, 0),
    _t = V(0, 0, 0);
  function cameraAt(t) {
    let i = 0;
    while (i < keys.length - 1 && t >= keys[i + 1][0]) i++;
    if (i >= keys.length - 1) {
      _p.copy(keys[keys.length - 1][1]);
      _t.copy(keys[keys.length - 1][2]);
    } else {
      const a = keys[i],
        b = keys[i + 1];
      const u = ease[b[3]](Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))));
      _p.lerpVectors(a[1], b[1], u);
      _t.lerpVectors(a[2], b[2], u);
    }
    camera.position.copy(_p);
    camera.lookAt(_t);
  }

  // ---------- hero truck motion ----------
  const START_X = 72;
  function heroX(t) {
    if (t < 25.6) return START_X;
    if (t < 32.3) {
      const u = (t - 25.6) / 6.7;
      return PARK_X + (START_X - PARK_X) * Math.pow(1 - u, 2.2);
    }
    if (t < 36.0) return PARK_X;
    const u = (t - 36.0) / 4.0;
    return PARK_X - 95 * Math.pow(Math.min(u, 1), 2);
  }
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const tmp = V(0, 0, 0);

  function renderAt(t) {
    cameraAt(t);
    craneJib.rotation.y = 0.9 + Math.sin(t * 0.12) * 0.35;

    // hero truck
    const x = heroX(t);
    hero.position.set(x, 0, -2.5);
    const spin = (START_X - x) / 0.56;
    hero.userData.wheels.forEach((w) => (w.rotation.z = spin));
    const loadU = clamp01((t - 33.1) / 2.2);
    hero.userData.load.scale.y = 0.001 + 0.75 * loadU;
    hero.updateMatrixWorld(true);

    // sand mound
    const grow = clamp01((t - 7.6) / 1.4);
    const shrink = clamp01((t - 33.0) / 2.2);
    const sm = Math.max(0.001, grow * (1 - 0.97 * shrink));
    sandMound.scale.set(2.4 * sm, 0.75 * sm, 1.05 * sm);

    // rubble pieces
    pieces.forEach((p) => {
      const m = p.mesh;
      if (t < p.appear) {
        m.visible = false;
        return;
      }
      m.visible = true;
      if (t < p.appear + 0.45) {
        const u = (t - p.appear) / 0.45;
        m.position.set(p.rest.x, p.rest.y + 4.5 * (1 - u * u), p.rest.z);
        m.rotation.set(p.rot.x + (1 - u) * 3, p.rot.y, p.rot.z);
        return;
      }
      if (t < p.load) {
        m.position.copy(p.rest);
        m.rotation.copy(p.rot);
        return;
      }
      tmp.copy(p.bedLocal);
      hero.localToWorld(tmp);
      if (t < p.load + 0.6) {
        const u = (t - p.load) / 0.6;
        m.position.lerpVectors(p.rest, tmp, u);
        m.position.y += Math.sin(u * Math.PI) * 3.2;
        m.rotation.set(p.rot.x + u * 4, p.rot.y + u * 2, p.rot.z);
        return;
      }
      m.position.copy(tmp);
      m.rotation.set(p.rot.x, p.rot.y + hero.rotation.y, p.rot.z);
    });

    // arcs + beacon (connect beat)
    const showNet = t >= 14.6 && t < 19.0;
    arcs.forEach((a, i) => {
      const u = clamp01((t - 15.4 - i * 0.12) / 0.7);
      a.visible = showNet && u > 0;
      const cnt = a.geometry.index.count;
      a.geometry.setDrawRange(0, Math.floor((cnt * u) / 6) * 6);
    });
    const bU = clamp01((t - 14.6) / 0.6);
    beacon.visible = ring.visible = showNet;
    beacon.material.opacity = 0.35 * bU;
    beacon.scale.set(1, Math.max(0.001, bU), 1);
    beacon.position.y = 20 * bU;
    const ringU = ((t - 14.6) % 1.4) / 1.4;
    ring.scale.setScalar(1 + ringU * 3);
    ring.material.opacity = (1 - ringU) * 0.9;

    renderer.render(scene, camera);
  }

  window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
  window.__worldRender = renderAt;
  renderAt(0);
})();
