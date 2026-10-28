// Pluie de code discrète en arrière-plan du hero
(() => {
  const c = document.getElementById("matrix");
  if (!c) return;
  const ctx = c.getContext("2d"), hero = c.parentElement;
  const chars = "01{}[]<>/;=()+*#$&abcdef".split(""), size = 16;
  let cols, drops, visible = true, last = 0;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    c.width = hero.clientWidth * dpr; c.height = hero.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(hero.clientWidth / size);
    drops = Array.from({ length: cols }, () => Math.random() * -50);
  }
  addEventListener("resize", resize); resize();
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(hero);

  function frame(t) {
    requestAnimationFrame(frame);
    if (!visible || t - last < 55) return; // ~18 images/s, fluide et léger
    last = t;
    ctx.fillStyle = "rgba(250,246,238,.14)"; // traînée qui s'efface
    ctx.fillRect(0, 0, hero.clientWidth, hero.clientHeight);
    ctx.font = `${size - 2}px "JetBrains Mono", monospace`;
    for (let i = 0; i < cols; i++) {
      ctx.fillStyle = Math.random() > 0.96 ? "rgba(74,47,29,.45)" : "rgba(122,85,57,.22)";
      ctx.fillText(chars[(Math.random() * chars.length) | 0], i * size, drops[i] * size);
      if (drops[i] * size > hero.clientHeight && Math.random() > 0.975) drops[i] = 0;
      drops[i] += 1;
    }
  }
  if (reduce) { for (let k = 0; k < 40; k++) frame(k * 100); } else requestAnimationFrame(frame);
})();
