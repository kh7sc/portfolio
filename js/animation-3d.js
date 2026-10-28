/* =====================================================================
 * animation-3d.js — Portfolio "Warm Code"
 * Scène 3D photoréaliste : bureau, écran fin avec code JS en direct,
 * clavier détaillé, bras et mains articulés qui tapent en continu.
 * Zoom avant au scroll jusque "dans" l'écran (transition vers À propos).
 *
 * Prérequis HTML : <canvas id="scene3d"> + section #drive (hauteur > 100vh,
 * canvas en position sticky/fixed) + éventuellement .drive-text.
 * Three.js (global THREE) chargé avant ce script (r128 → r16x compatibles).
 * ===================================================================== */
(() => {
  "use strict";

  const canvas = document.getElementById("scene3d");
  if (!canvas || !window.THREE) return;
  const T = window.THREE;
  const hero = document.getElementById("drive") || canvas.parentElement;
  const heroText = document.querySelector(".drive-text");

  /* ------------------------------------------------------------------
   * 1. CONFIGURATION (tout le réglage fin est ici)
   * ------------------------------------------------------------------ */
  const IS_MOBILE =
    window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;

  const Q = IS_MOBILE
    ? { dpr: 1.5, shadow: 1024, radial: 8, screenW: 768, screenH: 432, aa: (devicePixelRatio || 1) < 2 }
    : { dpr: 2, shadow: 2048, radial: 14, screenW: 1024, screenH: 576, aa: true };

  const COLORS = {
    fog: 0xf3ebdc,
    wall: 0xe9ddc7,
    skin: 0xe2b595,
    sleeve: 0x6b4a34,
    cuff: 0x573b29,
  };

  // Placement des mains (unité : 1 = ~19 cm). À ajuster si besoin.
  const HAND = { y: 0.38, z: 1.12, pitch: -0.15, yaw: 0.12, xLeft: -0.45, xRight: 0.3 };
  const KEYBOARD_POS = { x: 0, y: 0, z: 0.55 };

  /* ------------------------------------------------------------------
   * 2. UTILITAIRES
   * ------------------------------------------------------------------ */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return [c, c.getContext("2d")];
  }

  // Compatible anciennes (encoding) et nouvelles (colorSpace) versions de Three
  function srgb(tex) {
    if ("colorSpace" in tex) tex.colorSpace = T.SRGBColorSpace;
    else tex.encoding = T.sRGBEncoding;
    return tex;
  }

  const std = (o) => new T.MeshStandardMaterial(Object.assign({ envMapIntensity: 0.8 }, o));
  const phys = (o) => new T.MeshPhysicalMaterial(Object.assign({ envMapIntensity: 0.9 }, o));

  function shadowed(obj, cast = true, receive = true) {
    obj.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = cast;
        o.receiveShadow = receive;
      }
    });
    return obj;
  }

  // Boîte aux arêtes arrondies (ExtrudeGeometry biseautée) — dimensions exactes w×h×d
  function roundedBox(w, h, d, r = 0.02, segs = 3) {
    const b = Math.min(r * 0.6, d * 0.45);
    const rw = w - 2 * b, rh = h - 2 * b, rr = Math.max(r - b, 0.001);
    const x = -rw / 2, y = -rh / 2;
    const s = new T.Shape();
    s.moveTo(x + rr, y);
    s.lineTo(x + rw - rr, y);
    s.quadraticCurveTo(x + rw, y, x + rw, y + rr);
    s.lineTo(x + rw, y + rh - rr);
    s.quadraticCurveTo(x + rw, y + rh, x + rw - rr, y + rh);
    s.lineTo(x + rr, y + rh);
    s.quadraticCurveTo(x, y + rh, x, y + rh - rr);
    s.lineTo(x, y + rr);
    s.quadraticCurveTo(x, y, x + rr, y);
    const g = new T.ExtrudeGeometry(s, {
      depth: d - 2 * b,
      bevelEnabled: true,
      bevelThickness: b,
      bevelSize: b,
      bevelOffset: 0,
      bevelSegments: segs,
      curveSegments: segs * 2,
    });
    g.translate(0, 0, -(d - 2 * b) / 2);
    return g;
  }

  /* ------------------------------------------------------------------
   * 3. TEXTURES PROCÉDURALES
   * ------------------------------------------------------------------ */
  function woodTexture(maxAniso) {
    const [c, g] = makeCanvas(1024, 512);
    const r = rng(42);
    g.fillStyle = "#d9c4a2";
    g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 280; i++) {
      const y = r() * 512;
      const dark = r() > 0.35;
      g.strokeStyle = dark
        ? `rgba(${110 + r() * 40},${78 + r() * 30},${48},${0.04 + r() * 0.09})`
        : `rgba(255,243,222,${0.03 + r() * 0.06})`;
      g.lineWidth = 0.6 + r() * 2.6;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 1024; x += 64) g.lineTo(x, y + Math.sin(x * 0.012 + i) * 4 + (r() - 0.5) * 1.6);
      g.stroke();
    }
    const t = srgb(new T.CanvasTexture(c));
    t.anisotropy = maxAniso;
    return t;
  }

  function noiseTexture(size, amp, repeat, seed) {
    const [c, g] = makeCanvas(size, size);
    const img = g.createImageData(size, size);
    const r = rng(seed);
    for (let i = 0; i < size * size; i++) {
      const v = 128 + (r() - 0.5) * amp;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    return t;
  }

  /* ------------------------------------------------------------------
   * 4. RENDERER, SCÈNE, CAMÉRA, ENVIRONNEMENT, LUMIÈRES
   * ------------------------------------------------------------------ */
  const renderer = new T.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: Q.aa,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr));
  if ("outputColorSpace" in renderer) renderer.outputColorSpace = T.SRGBColorSpace;
  else renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), IS_MOBILE ? 4 : 8);

  const scene = new T.Scene();
  scene.fog = new T.Fog(COLORS.fog, 12, 42);

  const cam = new T.PerspectiveCamera(45, 1, 0.05, 80);

  // Environnement procédural (réflexions réalistes sans fichier HDR)
  function buildEnvironment() {
    if (!T.PMREMGenerator) return null;
    try {
      const env = new T.Scene();
      const [c, g] = makeCanvas(8, 256);
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, "#fff4e2");
      gr.addColorStop(0.45, "#e9d8bb");
      gr.addColorStop(0.55, "#b99a76");
      gr.addColorStop(1, "#4a3323");
      g.fillStyle = gr;
      g.fillRect(0, 0, 8, 256);
      const mapTex = new T.CanvasTexture(c);
      const dome = new T.Mesh(
        new T.SphereGeometry(30, 24, 16),
        new T.MeshBasicMaterial({ map: mapTex, side: T.BackSide })
      );
      env.add(dome);
      const softbox = (w, h, x, y, z, k) => {
        const m = new T.Mesh(
          new T.PlaneGeometry(w, h),
          new T.MeshBasicMaterial({ color: new T.Color(1, 0.93, 0.8).multiplyScalar(k), side: T.DoubleSide })
        );
        m.position.set(x, y, z);
        m.lookAt(0, 0, 0);
        env.add(m);
      };
      softbox(10, 6, 10, 9, 10, 7);
      softbox(6, 8, -12, 5, 4, 3.5);
      softbox(14, 3, 0, 14, -6, 5);
      const pm = new T.PMREMGenerator(renderer);
      const rt = pm.fromScene(env, 0.02);
      pm.dispose();
      env.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
      return rt.texture;
    } catch (e) {
      return null;
    }
  }
  scene.environment = buildEnvironment();

  // Éclairage studio chaleureux
  scene.add(new T.HemisphereLight(0xfff3e0, 0x7a5539, 0.55));

  const key = new T.DirectionalLight(0xfff0dc, 1.5);
  key.position.set(3.5, 5.5, 4.5);
  key.target.position.set(0, 0.4, 0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(Q.shadow, Q.shadow);
  Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 1, far: 22 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);

  const rim = new T.DirectionalLight(0xffd7a3, 0.8);
  rim.position.set(-4, 3.5, -3);
  scene.add(rim);

  const fill = new T.DirectionalLight(0xdfe8ff, 0.25);
  fill.position.set(-5, 2, 3);
  scene.add(fill);

  // Lueur de l'écran sur le clavier et les mains
  const screenLight = new T.PointLight(0xffe2b8, 0.9, 4);
  screenLight.position.set(0, 1.2, 0.15);
  scene.add(screenLight);

  /* ------------------------------------------------------------------
   * 5. ÉCRAN : éditeur de code animé (texture Canvas 2D)
   * ------------------------------------------------------------------ */
  const SNIPPETS = [
    [
      "// portfolio.js — BTS SIO option SLAM",
      "class Developpeur {",
      "  constructor(nom) {",
      "    this.nom = nom;",
      "    this.stack = ['HTML', 'CSS', 'JavaScript', 'C#'];",
      "    this.statut = 'Disponible';",
      "  }",
      "",
      "  async livrer(projet) {",
      "    const code = await this.concevoir(projet);",
      "    console.log(`Projet ${projet} livré`);",
      "    return code.tester().deployer();",
      "  }",
      "}",
    ],
    [
      "// Animation au scroll",
      "const sections = document.querySelectorAll('section');",
      "",
      "const observer = new IntersectionObserver((entries) => {",
      "  entries.forEach((e) => {",
      "    if (e.isIntersecting) {",
      "      e.target.classList.add('visible');",
      "    }",
      "  });",
      "}, { threshold: 0.25 });",
      "",
      "sections.forEach((s) => observer.observe(s));",
    ],
    [
      "// Récupération des projets",
      "async function chargerProjets() {",
      "  const res = await fetch('/api/projets');",
      "  if (!res.ok) throw new Error('Erreur réseau');",
      "  const projets = await res.json();",
      "",
      "  return projets",
      "    .filter((p) => p.publie)",
      "    .sort((a, b) => b.annee - a.annee);",
      "}",
    ],
  ];

  const TOKEN_RULES = [
    [/^\/\/.*/, "comment"],
    [/^(['"`])(?:\\.|(?!\1).)*\1/, "string"],
    [/^\b(?:const|let|class|return|function|async|await|if|else|for|new|this|throw)\b/, "keyword"],
    [/^\b\d+(?:\.\d+)?\b/, "number"],
    [/^[A-Za-z_$][\w$]*(?=\()/, "func"],
    [/^[A-Z][\w$]*/, "type"],
    [/^[{}()[\];,.:=<>+\-*/!&|?]+/, "punct"],
    [/^\s+/, "plain"],
    [/^[\w$]+/, "plain"],
  ];

  function tokenize(line) {
    const out = [];
    let rest = line;
    while (rest.length) {
      let hit = false;
      for (const [re, type] of TOKEN_RULES) {
        const m = rest.match(re);
        if (m) {
          out.push({ text: m[0], type });
          rest = rest.slice(m[0].length);
          hit = true;
          break;
        }
      }
      if (!hit) {
        out.push({ text: rest[0], type: "plain" });
        rest = rest.slice(1);
      }
    }
    return out;
  }

  function createCodeScreen() {
    const W = Q.screenW, H = Q.screenH;
    const [cv, g] = makeCanvas(W, H);
    const tex = srgb(new T.CanvasTexture(cv));
    tex.minFilter = T.LinearFilter;
    tex.generateMipmaps = false;

    const COL = {
      bg: "#1c120b", bar: "#140d07", gutter: "#7a6650", plain: "#eadfca", comment: "#8d7863",
      string: "#e8b57d", keyword: "#d9885a", number: "#cfa66b", func: "#f1daa8", type: "#cf9470",
      punct: "#a8957a", cursor: "#f3e3c0", active: "#271810",
    };
    const fs = Math.round(H * 0.034);
    const lh = Math.round(fs * 1.5);
    const barH = Math.round(H * 0.075);
    const statH = Math.round(fs * 1.7);
    const gutterW = Math.round(fs * 3.4);
    const font = `${fs}px "JetBrains Mono","Fira Code",Consolas,"Courier New",monospace`;
    g.font = font;
    const cw = g.measureText("M").width;
    const maxLines = Math.floor((H - barH - statH - fs) / lh);

    let idx = 0, lines = [], total = 0, chars = 0, hold = 0, lastKey = "";

    function load(i) {
      lines = SNIPPETS[i].map((t) => ({ text: t, tokens: tokenize(t) }));
      total = lines.reduce((s, l) => s + l.text.length + 1, 0);
      chars = 0;
      lastKey = "";
    }
    load(0);

    function draw(now) {
      const n = Math.floor(chars);
      let rem = n, last = 0, lastCol = 0;
      for (let li = 0; li < lines.length; li++) {
        const len = lines[li].text.length;
        if (rem >= len + 1 && li < lines.length - 1) {
          rem -= len + 1;
          last = li + 1;
          lastCol = 0;
        } else {
          last = li;
          lastCol = Math.min(rem, len);
          break;
        }
      }
      const start = Math.max(0, last - maxLines + 1);

      g.fillStyle = COL.bg;
      g.fillRect(0, 0, W, H);
      g.font = font;
      g.textBaseline = "middle";

      // Barre de titre
      g.fillStyle = COL.bar;
      g.fillRect(0, 0, W, barH);
      ["#c4684a", "#d9a15a", "#8aa06a"].forEach((c, i) => {
        g.fillStyle = c;
        g.beginPath();
        g.arc(fs * 1.2 + i * fs * 1.15, barH / 2, fs * 0.28, 0, Math.PI * 2);
        g.fill();
      });
      g.fillStyle = COL.plain;
      g.fillText("portfolio.js", fs * 5.2, barH / 2);

      // Lignes de code
      let y = barH + fs * 0.9;
      for (let li = start; li <= last; li++) {
        const cy = y + (li - start) * lh;
        if (li === last) {
          g.fillStyle = COL.active;
          g.fillRect(0, cy - lh / 2, W, lh);
        }
        g.fillStyle = COL.gutter;
        g.textAlign = "right";
        g.fillText(String(li + 1), gutterW - fs * 0.9, cy);
        g.textAlign = "left";

        const limit = li === last ? lastCol : Infinity;
        let col = 0;
        for (const tk of lines[li].tokens) {
          if (col >= limit) break;
          const txt = tk.text.slice(0, limit - col);
          g.fillStyle = COL[tk.type];
          g.fillText(txt, gutterW + col * cw, cy);
          col += tk.text.length;
        }
        if (li === last && hold >= 0 && Math.floor(now * 1.8) % 2 === 0) {
          g.fillStyle = COL.cursor;
          g.fillRect(gutterW + lastCol * cw + 1, cy - lh * 0.4, Math.max(2, fs * 0.12), lh * 0.8);
        }
      }

      // Barre d'état
      g.fillStyle = COL.bar;
      g.fillRect(0, H - statH, W, statH);
      g.fillStyle = COL.gutter;
      g.font = `${Math.round(fs * 0.8)}px ${font.split("px ")[1]}`;
      g.fillText(`Ln ${last + 1}, Col ${lastCol + 1}     UTF-8     JavaScript`, fs, H - statH / 2);

      tex.needsUpdate = true;
    }

    function update(dt, now) {
      if (hold > 0) {
        hold -= dt;
        if (hold <= 0) {
          idx = (idx + 1) % SNIPPETS.length;
          load(idx);
        }
      } else {
        chars += dt * 30 * (0.55 + 0.9 * Math.abs(Math.sin(now * 2.3)));
        if (chars >= total) {
          chars = total;
          hold = 3;
        }
      }
      const k = `${Math.floor(chars)}|${Math.floor(now * 1.8) % 2}|${idx}`;
      if (k !== lastKey) {
        lastKey = k;
        draw(now);
      }
    }

    draw(0);
    return { texture: tex, update };
  }

  /* ------------------------------------------------------------------
   * 6. BUREAU, TAPIS, MUR
   * ------------------------------------------------------------------ */
  const deskGroup = new T.Group();
  scene.add(deskGroup);

  function buildDesk() {
    const wood = woodTexture(maxAniso);
    const top = new T.Mesh(
      new T.BoxGeometry(7, 0.14, 3.4),
      phys({ map: wood, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.45 })
    );
    top.position.set(0, -0.07, 0);
    deskGroup.add(top);

    const matBump = noiseTexture(128, 40, 6, 11);
    const mat = new T.Mesh(
      roundedBox(3.4, 1.5, 0.02, 0.04).rotateX(-Math.PI / 2),
      std({ color: 0x6a4b36, roughness: 0.85, bumpMap: matBump, bumpScale: 0.4 })
    );
    mat.position.set(0, 0.011, 0.6);
    deskGroup.add(mat);

    // Mur de fond : reçoit les ombres douces
    const wall = new T.Mesh(
      new T.PlaneGeometry(34, 16),
      std({ color: COLORS.wall, roughness: 1, envMapIntensity: 0.3 })
    );
    wall.position.set(0, 4, -2.7);
    wall.receiveShadow = true;
    scene.add(wall);
  }

  /* ------------------------------------------------------------------
   * 7. ÉCRAN ULTRA-FIN + SOCLE
   * ------------------------------------------------------------------ */
  function buildMonitor(screenTex) {
    const alu = phys({ color: 0xcdbfa8, metalness: 0.9, roughness: 0.34, clearcoat: 0.2, clearcoatRoughness: 0.5 });

    const g = new T.Group();
    g.position.set(0, 1.34, -0.7);
    g.rotation.x = -0.045;

    const body = new T.Mesh(roundedBox(2.7, 1.58, 0.05, 0.03, 3), alu);
    g.add(body);

    const bezel = new T.Mesh(new T.PlaneGeometry(2.64, 1.52), std({ color: 0x050403, roughness: 0.25, metalness: 0.2 }));
    bezel.position.z = 0.0255;
    g.add(bezel);

    const screen = new T.Mesh(
      new T.PlaneGeometry(2.56, 1.44),
      new T.MeshBasicMaterial({ map: screenTex, toneMapped: false })
    );
    screen.position.z = 0.0262;
    g.add(screen);

    // Vitre : ajoute uniquement les reflets de l'environnement (fusion additive)
    const glass = new T.Mesh(
      new T.PlaneGeometry(2.56, 1.44),
      new T.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0.08,
        metalness: 0,
        envMapIntensity: 0.9,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
      })
    );
    glass.position.z = 0.0275;
    g.add(glass);
    deskGroup.add(shadowed(g, true, false));

    const neck = new T.Mesh(roundedBox(0.2, 0.82, 0.05, 0.02, 3), alu);
    neck.position.set(0, 0.46, -0.75);
    const base = new T.Mesh(new T.CylinderGeometry(0.45, 0.45, 0.022, IS_MOBILE ? 32 : 56), alu);
    base.scale.z = 0.62;
    base.position.set(0, 0.011 + 0.02, -0.62);
    deskGroup.add(shadowed(neck), shadowed(base));
  }

  /* ------------------------------------------------------------------
   * 8. CLAVIER (touches instanciées, légendes, enfoncement)
   * ------------------------------------------------------------------ */
  function buildKeyboard() {
    const P = 0.1; // pas des touches
    const row = (str, pre = [], post = []) => pre.concat([...str].map((k) => [k, 1]), post);
    const ROWS = [
      row("`1234567890-=", [], [["Back", 2]]),
      row("QWERTYUIOP[]", [["Tab", 1.5]], [["\\", 1.5]]),
      row("ASDFGHJKL;'", [["Caps", 1.75]], [["Enter", 2.25]]),
      row("ZXCVBNM,./", [["Shift", 2.25]], [["Shift", 2.75]]),
      [["Ctrl", 1.25], ["Win", 1.25], ["Alt", 1.25], ["", 6.25], ["Alt", 1.25], ["Fn", 1.25], ["Menu", 1.25], ["Ctrl", 1.25]],
    ];

    const keys = [];
    ROWS.forEach((r, ri) => {
      let cursor = -0.75;
      r.forEach(([label, w]) => {
        keys.push({
          label,
          w,
          x: cursor + (w * P) / 2,
          z: (ri - 2) * P,
          row: ri,
          mod: label.length > 1,
        });
        cursor += w * P;
      });
    });

    const g = new T.Group();
    g.position.set(KEYBOARD_POS.x, KEYBOARD_POS.y + 0.03, KEYBOARD_POS.z);
    g.rotation.x = 0.07; // dos plus haut que l'avant, comme un vrai clavier

    // Châssis aluminium champagne
    const baseMesh = new T.Mesh(
      roundedBox(1.62, 0.58, 0.05, 0.03, 3).rotateX(-Math.PI / 2),
      phys({ color: 0xcdbba0, metalness: 0.85, roughness: 0.36, clearcoat: 0.15 })
    );
    g.add(baseMesh);

    // Touches : tronc de pyramide (cylindre à 4 faces) étiré par instance
    const capGeo = new T.CylinderGeometry(0.5 * 0.78 * Math.SQRT2, 0.5 * Math.SQRT2, 1, 4, 1);
    capGeo.rotateY(Math.PI / 4);
    const capMat = std({ color: 0xffffff, roughness: 0.55, envMapIntensity: 0.6 });
    const caps = new T.InstancedMesh(capGeo, capMat, keys.length);
    caps.castShadow = true;
    caps.receiveShadow = true;

    const H_KEY = 0.034, TOP = 0.025;
    const dummy = new T.Object3D();
    const depth = new Float32Array(keys.length);
    const cCream = new T.Color(0xe6d8bf), cBrown = new T.Color(0x5a4130);

    function setKey(i) {
      const k = keys[i];
      dummy.position.set(k.x, TOP + H_KEY / 2 - depth[i] * 0.014, k.z);
      dummy.scale.set(k.w * P - 0.012, H_KEY, P - 0.012);
      dummy.updateMatrix();
      caps.setMatrixAt(i, dummy.matrix);
    }
    keys.forEach((k, i) => {
      setKey(i);
      caps.setColorAt(i, k.mod ? cBrown : cCream);
    });
    caps.instanceMatrix.needsUpdate = true;
    if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
    g.add(caps);

    // Légendes (un seul plan texturé au-dessus des touches)
    const S = 1000;
    const [lc, lg] = makeCanvas(1500, 500);
    lg.textAlign = "center";
    lg.textBaseline = "middle";
    keys.forEach((k) => {
      if (!k.label) return;
      const small = k.label.length > 1;
      lg.font = `600 ${small ? 24 : 36}px "Inter","Segoe UI",Arial,sans-serif`;
      lg.fillStyle = k.mod ? "#eadfca" : "#4b3423";
      lg.fillText(k.label, (k.x + 0.75) * S, (k.z + 0.25) * S + 1);
    });
    const legendTex = srgb(new T.CanvasTexture(lc));
    legendTex.anisotropy = maxAniso;
    const legend = new T.Mesh(
      new T.PlaneGeometry(1.5, 0.5).rotateX(-Math.PI / 2),
      std({ map: legendTex, transparent: true, roughness: 0.6, depthWrite: false })
    );
    legend.position.y = TOP + H_KEY + 0.0012;
    g.add(legend);

    shadowed(baseMesh);
    deskGroup.add(g);

    let active = [];
    return {
      keys,
      spaceIndex: keys.findIndex((k) => k.label === "" && k.row === 4),
      press(i) {
        depth[i] = 1;
        if (!active.includes(i)) active.push(i);
      },
      update(dt) {
        if (!active.length) return;
        active = active.filter((i) => {
          depth[i] = Math.max(0, depth[i] - dt * 6);
          setKey(i);
          return depth[i] > 0;
        });
        caps.instanceMatrix.needsUpdate = true;
      },
    };
  }

  /* ------------------------------------------------------------------
   * 9. BRAS ET MAINS (palme organique, doigts à 3 phalanges, pouce, ongles)
   * ------------------------------------------------------------------ */
  function organicPalm() {
    const g = new T.SphereGeometry(1, 28, 20);
    const p = g.attributes.position;
    const e = 0.55;
    const sg = (v) => Math.sign(v) * Math.pow(Math.abs(v), e); // super-ellipsoïde : paume "carrée" douce
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      x = sg(x);
      z = sg(z);
      const t = z * 0.5 + 0.5; // 0 = jointures, 1 = poignet
      if (y < 0) y *= 0.7;
      p.setXYZ(i, x * 0.21 * (1 - 0.26 * t), y * 0.06 * (1 + 0.25 * (1 - Math.abs(x))), z * 0.26);
    }
    g.computeVertexNormals();
    return g;
  }

  function buildFinger(lengths, radii, skin, nailMat) {
    const root = new T.Group();
    const joints = [];
    let parent = root;
    const rs = Q.radial, rsV = Math.max(6, (Q.radial * 0.7) | 0);
    lengths.forEach((len, i) => {
      const j = new T.Group();
      if (i > 0) j.position.z = -lengths[i - 1];
      parent.add(j);
      joints.push(j);
      const geo = new T.CylinderGeometry(radii[i + 1], radii[i], len, rs, 1);
      geo.rotateX(-Math.PI / 2); // l'axe pointe vers -z (vers l'écran)
      geo.translate(0, 0, -len / 2);
      const seg = new T.Mesh(geo, skin);
      seg.scale.y = 0.9;
      j.add(seg);
      const knuckle = new T.Mesh(new T.SphereGeometry(radii[i] * 1.02, rs, rsV), skin);
      knuckle.scale.y = 0.9;
      j.add(knuckle);
      parent = j;
    });
    const last = joints[joints.length - 1];
    const lLen = lengths[lengths.length - 1], rTip = radii[radii.length - 1];
    const tip = new T.Mesh(new T.SphereGeometry(rTip, rs, rsV), skin);
    tip.position.z = -lLen;
    tip.scale.y = 0.9;
    last.add(tip);
    const nail = new T.Mesh(new T.SphereGeometry(1, 12, 8), nailMat);
    nail.scale.set(rTip * 0.75, rTip * 0.22, lLen * 0.38);
    nail.position.set(0, rTip * 0.78, -lLen * 0.62);
    last.add(nail);
    return { root, joints };
  }

  function buildArm(side, mats) {
    // side : +1 = main gauche (pouce côté +x), -1 = main droite
    const arm = new T.Group();
    const hand = new T.Group();
    hand.rotation.x = HAND.pitch;
    arm.add(hand);

    const palm = new T.Mesh(organicPalm(), mats.skin);
    hand.add(palm);
    const thenar = new T.Mesh(new T.SphereGeometry(1, 16, 12), mats.skin);
    thenar.scale.set(0.09, 0.055, 0.14);
    thenar.position.set(side * 0.14, -0.005, 0.07);
    thenar.rotation.y = side * 0.35;
    hand.add(thenar);

    // 4 doigts (index → auriculaire)
    const DEF = [
      { len: [0.19, 0.11, 0.09], r: 0.046, z: -0.23, base: [-0.25, -0.42, -0.2] },
      { len: [0.21, 0.13, 0.1], r: 0.047, z: -0.245, base: [-0.22, -0.4, -0.2] },
      { len: [0.19, 0.12, 0.09], r: 0.044, z: -0.23, base: [-0.26, -0.42, -0.2] },
      { len: [0.15, 0.09, 0.08], r: 0.039, z: -0.2, base: [-0.3, -0.45, -0.22] },
    ];
    const fingers = DEF.map((d, i) => {
      const radii = [d.r, d.r * 0.92, d.r * 0.84, d.r * 0.76];
      const f = buildFinger(d.len, radii, mats.skin, mats.nail);
      const fx = side * (0.15 - i * 0.1);
      f.root.position.set(fx, 0.004, d.z);
      f.root.rotation.y = -side * (1.2 - i) * 0.04; // léger écartement
      hand.add(f.root);
      return { joints: f.joints, base: d.base, fx, active: false, phase: 0, pendingKey: -1, keys: [], seed: i * 1.7 + side };
    });

    // Pouce
    const th = buildFinger([0.15, 0.13, 0.11], [0.054, 0.049, 0.044, 0.038], mats.skin, mats.nail);
    th.root.position.set(side * 0.15, -0.015, 0.06);
    th.root.rotation.set(-0.2, -side * 0.6, side * 0.12);
    hand.add(th.root);
    const thumb = { joints: th.joints, base: [-0.05, -0.12, -0.08], active: false, phase: 0, pendingKey: -1 };

    // Avant-bras : peau (poignet) + manche en maille
    const wristY = -0.25 * Math.sin(HAND.pitch), wristZ = 0.25 * Math.cos(HAND.pitch);
    const fore = new T.Group();
    fore.position.set(0, wristY, wristZ);
    fore.rotation.x = 0.1;
    arm.add(fore);

    const L = 1.7, Rb = 0.15, Rt = 0.21, radial = Q.radial * 2;
    const skinGeo = new T.CylinderGeometry(Rt, Rb, L, radial, 1).rotateX(Math.PI / 2).translate(0, 0, L / 2 - 0.04);
    const skinMesh = new T.Mesh(skinGeo, mats.skin);
    skinMesh.scale.y = 0.72;
    fore.add(skinMesh);

    const cuffAt = 0.4;
    const rAt = Rb + (Rt - Rb) * (cuffAt / L);
    const sLen = L - cuffAt;
    const sleeveGeo = new T.CylinderGeometry(Rt * 1.16, rAt * 1.16, sLen, radial, 1)
      .rotateX(Math.PI / 2)
      .translate(0, 0, cuffAt + sLen / 2);
    const sleeve = new T.Mesh(sleeveGeo, mats.sleeve);
    sleeve.scale.y = 0.8;
    fore.add(sleeve);
    const cuffGeo = new T.CylinderGeometry(rAt * 1.22, rAt * 1.22, 0.09, radial, 1)
      .rotateX(Math.PI / 2)
      .translate(0, 0, cuffAt + 0.045);
    const cuff = new T.Mesh(cuffGeo, mats.cuff);
    cuff.scale.y = 0.82;
    fore.add(cuff);

    arm.rotation.y = -side * HAND.yaw; // les coudes s'écartent vers l'arrière
    arm.position.set(side > 0 ? HAND.xLeft : HAND.xRight, HAND.y, HAND.z);

    shadowed(arm);
    return { arm, hand, fingers, thumb, side };
  }

  function buildHands(kb) {
    const skinBump = noiseTexture(256, 30, 4, 5);
    const sleeveBump = noiseTexture(128, 90, 18, 9);
    const mats = {
      skin: std({
        color: COLORS.skin,
        roughness: 0.6,
        envMapIntensity: 0.55,
        bumpMap: skinBump,
        bumpScale: 0.5,
        emissive: 0x3a1a10,
        emissiveIntensity: 0.12, // faux "subsurface scattering" chaud
      }),
      nail: phys({ color: 0xeab9a8, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
      sleeve: std({ color: COLORS.sleeve, roughness: 1, envMapIntensity: 0.25, bumpMap: sleeveBump, bumpScale: 1.2 }),
      cuff: std({ color: COLORS.cuff, roughness: 1, envMapIntensity: 0.25, bumpMap: sleeveBump, bumpScale: 1.6 }),
    };

    const left = buildArm(1, mats);
    const right = buildArm(-1, mats);
    deskGroup.add(left.arm, right.arm);

    // Association doigt → touches proches (pour synchroniser frappe et enfoncement)
    [left, right].forEach((h) => {
      const handX = h.arm.position.x;
      h.fingers.forEach((f) => {
        const tipX = handX + f.fx + h.side * HAND.yaw * 0.65;
        kb.keys.forEach((k, i) => {
          if (k.row >= 1 && k.row <= 3 && !k.mod && Math.abs(k.x - tipX) < 0.055) f.keys.push(i);
        });
        if (!f.keys.length) f.keys.push(kb.keys.findIndex((k) => k.row === 2));
      });
    });
    return [left, right];
  }

  /* ------------------------------------------------------------------
   * 10. ACCESSOIRES : mug, carnet, crayon, souris
   * ------------------------------------------------------------------ */
  function buildProps() {
    const ceramic = phys({ color: 0xf1e8d6, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    const pts = [
      [0, 0], [0.18, 0], [0.2, 0.03], [0.205, 0.32], [0.19, 0.33], [0.178, 0.31], [0.178, 0.06], [0, 0.05],
    ].map(([x, y]) => new T.Vector2(x, y));
    const mug = new T.Mesh(new T.LatheGeometry(pts, IS_MOBILE ? 24 : 40), ceramic);
    const handle = new T.Mesh(new T.TorusGeometry(0.1, 0.026, 10, 20, Math.PI), ceramic);
    handle.position.set(0.2, 0.17, 0);
    handle.rotation.z = -Math.PI / 2;
    mug.add(handle);
    const coffee = new T.Mesh(new T.CircleGeometry(0.178, 28), std({ color: 0x2a160b, roughness: 0.15 }));
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.y = 0.27;
    mug.add(coffee);
    mug.position.set(1.7, 0, 0.2);
    mug.rotation.y = 0.6;

    const notebook = new T.Group();
    const cover = new T.Mesh(
      roundedBox(0.95, 1.3, 0.06, 0.02).rotateX(-Math.PI / 2),
      std({ color: 0x5a3c28, roughness: 0.7, bumpMap: noiseTexture(128, 50, 5, 21), bumpScale: 0.6 })
    );
    cover.position.y = 0.03;
    const pages = new T.Mesh(new T.BoxGeometry(0.9, 0.04, 1.25), std({ color: 0xf3ead7, roughness: 0.9 }));
    pages.position.set(0.02, 0.03, 0);
    const band = new T.Mesh(new T.BoxGeometry(0.03, 0.066, 1.3), std({ color: 0x2b1d12, roughness: 0.6 }));
    band.position.set(0.32, 0.03, 0);
    notebook.add(cover, pages, band);
    notebook.position.set(-1.75, 0, 0.55);
    notebook.rotation.y = 0.25;

    const pencil = new T.Group();
    const body = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 0.8, 6), std({ color: 0xc9a46a, roughness: 0.5 }));
    const tip = new T.Mesh(new T.ConeGeometry(0.018, 0.08, 6), std({ color: 0xe8d3a8, roughness: 0.7 }));
    tip.position.y = -0.44;
    pencil.add(body, tip);
    pencil.rotation.set(0, 0, Math.PI / 2);
    pencil.position.set(-1.7, 0.1, 0.55);
    pencil.rotation.y = 0.7;

    const mouse = new T.Mesh(
      new T.SphereGeometry(1, 28, 18),
      phys({ color: 0xcdbba0, metalness: 0.7, roughness: 0.38, clearcoat: 0.2 })
    );
    mouse.scale.set(0.12, 0.055, 0.19);
    mouse.position.set(1.05, 0.06, 0.85);
    mouse.rotation.y = -0.12;

    [mug, notebook, pencil, mouse].forEach((o) => deskGroup.add(shadowed(o)));
  }

  /* ------------------------------------------------------------------
   * 11. ASSEMBLAGE
   * ------------------------------------------------------------------ */
  const codeScreen = createCodeScreen();
  buildDesk();
  buildMonitor(codeScreen.texture);
  const keyboard = buildKeyboard();
  const hands = buildHands(keyboard);
  buildProps();

  /* ------------------------------------------------------------------
   * 12. ANIMATION DE FRAPPE
   * ------------------------------------------------------------------ */
  let tapTimer = 0;
  const FINGER_WEIGHT = [0.9, 1, 0.9, 0.5];

  function scheduleTap() {
    const h = hands[Math.random() < 0.5 ? 0 : 1];
    if (Math.random() < 0.06 && !h.thumb.active) {
      h.thumb.active = true;
      h.thumb.phase = 0;
      h.thumb.pendingKey = keyboard.spaceIndex;
      return;
    }
    let r = Math.random() * 3.3, fi = 0;
    for (; fi < 3; fi++) {
      r -= FINGER_WEIGHT[fi];
      if (r <= 0) break;
    }
    const f = h.fingers[fi];
    if (f.active) return;
    f.active = true;
    f.phase = 0;
    f.pendingKey = f.keys[(Math.random() * f.keys.length) | 0];
  }

  function advance(f, dt) {
    if (!f.active) return 0;
    f.phase += dt * 8.5;
    if (f.pendingKey >= 0 && f.phase >= 0.4) {
      keyboard.press(f.pendingKey);
      f.pendingKey = -1;
    }
    if (f.phase >= 1) {
      f.active = false;
      f.phase = 0;
      return 0;
    }
    return Math.sin(f.phase * Math.PI);
  }

  function animateTyping(dt, t) {
    tapTimer -= dt;
    while (tapTimer <= 0) {
      scheduleTap();
      tapTimer += 0.07 + Math.random() * 0.13;
    }
    hands.forEach((h) => {
      let push = 0;
      h.fingers.forEach((f) => {
        const v = advance(f, dt);
        push = Math.max(push, v);
        const idle = Math.sin(t * 1.3 + f.seed) * 0.02;
        f.joints[0].rotation.x = f.base[0] + idle - 0.3 * v;
        f.joints[1].rotation.x = f.base[1] + idle * 0.6 - 0.2 * v;
        f.joints[2].rotation.x = f.base[2] - 0.1 * v;
      });
      const tv = advance(h.thumb, dt);
      h.thumb.joints[0].rotation.x = h.thumb.base[0] - 0.2 * tv;
      h.thumb.joints[1].rotation.x = h.thumb.base[1] - 0.25 * tv;
      h.thumb.joints[2].rotation.x = h.thumb.base[2];
      // Micro-mouvements du poignet
      h.arm.position.y = HAND.y + Math.sin(t * 1.9 + h.side) * 0.004 - push * 0.006;
      h.hand.rotation.x = HAND.pitch + Math.sin(t * 1.1 + h.side * 2) * 0.01;
    });
  }

  /* ------------------------------------------------------------------
   * 13. CAMÉRA : plan serré + zoom "dans l'écran" au scroll
   * ------------------------------------------------------------------ */
  const LOOK0 = { x: 0, y: 0.9, z: 0 };
  const LOOK1 = { x: 0, y: 1.34, z: -0.68 };
  const POS0 = { x: 0, y: 1.3, z: 3.1 };
  const POS1 = { x: 0, y: 1.34, z: 0.2 };
  let fit = 1; // recul supplémentaire en format portrait (mobile)
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };

  function applyCamera(e) {
    const sy = LOOK0.y + (POS0.y - LOOK0.y) * fit;
    const sz = LOOK0.z + (POS0.z - LOOK0.z) * fit;
    const ez = LOOK1.z + (POS1.z - LOOK1.z) * Math.min(fit, 1.8);
    cam.position.set(
      pointer.sx * 0.25 * (1 - e),
      lerp(sy, POS1.y, e) + pointer.sy * 0.08 * (1 - e),
      lerp(sz, ez, e)
    );
    cam.lookAt(lerp(LOOK0.x, LOOK1.x, e), lerp(LOOK0.y, LOOK1.y, e), lerp(LOOK0.z, LOOK1.z, e));
    const fov = 45 + e * 8;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    fit = clamp(1.05 / cam.aspect, 1, 2.4);
    cam.updateProjectionMatrix();
  }
  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 80);
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  resize();

  if (!IS_MOBILE) {
    window.addEventListener(
      "pointermove",
      (e) => {
        pointer.x = (e.clientX / innerWidth) * 2 - 1;
        pointer.y = (e.clientY / innerHeight) * 2 - 1;
      },
      { passive: true }
    );
  }

  const progress = () => {
    const r = hero.getBoundingClientRect();
    const range = Math.max(r.height - innerHeight, innerHeight * 0.5);
    return clamp(-r.top / range, 0, 1);
  };

  /* ------------------------------------------------------------------
   * 14. BOUCLE DE RENDU (suspendue hors écran / onglet masqué)
   * ------------------------------------------------------------------ */
  let cur = 0, running = false, raf = 0, last = 0, inView = true;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;

    cur += (progress() - cur) * (1 - Math.exp(-dt * 5));
    const e = smooth(cur);

    const opacity = 1 - clamp((cur - 0.75) / 0.25, 0, 1);
    canvas.style.opacity = opacity;
    if (heroText) heroText.style.opacity = Math.max(0, 1 - cur * 3);
    if (opacity <= 0.001) return; // entré dans l'écran : on ne rend plus rien

    pointer.sx += (pointer.x - pointer.sx) * 0.05;
    pointer.sy += (pointer.y - pointer.sy) * 0.05;

    animateTyping(dt, t);
    keyboard.update(dt);
    codeScreen.update(dt, t);

    deskGroup.rotation.y = e * 0.08;
    applyCamera(e);
    renderer.render(scene, cam);
  }

  function start() {
    if (running || !inView || document.hidden) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        inView = entries[0].isIntersecting;
        inView ? start() : stop();
      },
      { threshold: 0 }
    ).observe(hero);
  }
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  canvas.addEventListener("webglcontextlost", (ev) => {
    ev.preventDefault();
    stop();
  });
  canvas.addEventListener("webglcontextrestored", start);
  window.addEventListener("pagehide", () => {
    stop();
    renderer.dispose();
  });

  start();
})();
