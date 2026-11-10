/* 紫微命门 · 果冻按钮（软体物理）
   按钮 = SVG path 绘制的软体：周边 N 个质点，偏差量 d=p−r 上的线性力系
   （回位弹簧 + 邻接耦合），鼠标按压成鼓包、移动带黏滞拖拽，离开后欠阻尼振荡回弹。
   整体位置不动，只有形状 Q 弹；静止时 rAF 停表，零持续开销。 */
(function (global) {
  'use strict';

  const P = {
    spacing: 8,        // 周边采样间距 px（点数随周长自适应）
    Kr: 320,           // 回位弹簧（位置锚定）
    Kc: 340,           // 邻接耦合弹簧（形变沿边界传播 → 整体 Q 弹）
    Kt: 900,           // 按压目标弹簧
    poke: 11,          // 悬停鼓包深度 px
    pokeDeep: 17,      // 按下鼓包深度 px
    Kdrag: 15,         // 鼠标拖拽黏滞力
    damp: 4.6,         // 欠阻尼系数（ζ≈0.07，弹两三个来回）
    vmax: 1200,        // 质点速度上限 px/s
    sigmaMin: 58,      // 鼠标影响半径下限 px
    cvClamp: 900,      // 鼠标速度采样上限 px/s
    settle: 0.15,      // 静止判定阈值
  };

  function sampleRoundedRect(W, H, R, spacing) {
    const x0 = 0, y0 = 0, x1 = W, y1 = H;
    const segs = [];
    const edge = (ax, ay, bx, by) => segs.push({ t: 1, ax, ay, bx, by });
    const arc = (cx, cy, a0, a1) => segs.push({ t: 2, cx, cy, a0, a1 });
    if (W > 2 * R) edge(x0 + R, y0, x1 - R, y0);
    arc(x1 - R, y0 + R, -Math.PI / 2, 0);
    if (H > 2 * R) edge(x1, y0 + R, x1, y1 - R);
    arc(x1 - R, y1 - R, 0, Math.PI / 2);
    if (W > 2 * R) edge(x1 - R, y1, x0 + R, y1);
    arc(x0 + R, y1 - R, Math.PI / 2, Math.PI);
    if (H > 2 * R) edge(x0, y1 - R, x0, y0 + R);
    arc(x0 + R, y0 + R, Math.PI, Math.PI * 1.5);

    const lens = segs.map(s => s.t === 1
      ? Math.hypot(s.bx - s.ax, s.by - s.ay)
      : Math.abs(s.a1 - s.a0) * R);
    const perim = lens.reduce((a, b) => a + b, 0);
    const n = Math.max(24, Math.min(72, Math.round(perim / spacing)));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const s = (perim * i) / n;
      let acc = 0, x = 0, y = 0;
      for (let k = 0; k < segs.length; k++) {
        const g = segs[k], L = lens[k];
        if (s <= acc + L || k === segs.length - 1) {
          const t = L > 0 ? Math.min(1, (s - acc) / L) : 0;
          if (g.t === 1) { x = g.ax + (g.bx - g.ax) * t; y = g.ay + (g.by - g.ay) * t; }
          else {
            const a = g.a0 + (g.a1 - g.a0) * t;
            x = g.cx + Math.cos(a) * R;
            y = g.cy + Math.sin(a) * R;
          }
          break;
        }
        acc += L;
      }
      pts.push({ x, y });
    }
    return pts;
  }

  function createSim(W, H, R) {
    const rest = sampleRoundedRect(W, H, R, P.spacing);
    const n = rest.length;
    const rx = rest.map(p => p.x), ry = rest.map(p => p.y);
    const px = rx.slice(), py = ry.slice();
    const vx = new Array(n).fill(0), vy = new Array(n).fill(0);
    const dispMax = Math.min(W, H) * 0.45;

    /* 力系全部对偏差 d = p − r 线性（回位 + 邻接耦合都作用在偏差上）：
       静止构型下所有力严格为零（圆角处无弦偏置），势能严格凸，
       唯一平衡点即原形——不塌陷、不卡死、必定收敛回原位。 */
    function step(dt, cx, cy, cvx, cvy, pressed) {
      const sig = Math.max(P.sigmaMin, Math.min(W, H) * 1.05);
      const inv2s2 = 1 / (2 * sig * sig);
      const poke = pressed ? P.pokeDeep : P.poke;
      const dmp = Math.exp(-P.damp * dt);
      const fxs = new Array(n), fys = new Array(n);

      for (let i = 0; i < n; i++) {
        const ia = (i - 1 + n) % n, ib = (i + 1) % n;
        const dx = px[i] - rx[i], dy = py[i] - ry[i];
        let fx = -P.Kr * dx + P.Kc * ((px[ia] - rx[ia]) + (px[ib] - rx[ib]) - 2 * dx);
        let fy = -P.Kr * dy + P.Kc * ((py[ia] - ry[ia]) + (py[ib] - ry[ib]) - 2 * dy);

        if (cx !== null) {
          const drx = rx[i] - cx, dry = ry[i] - cy;
          const d2 = drx * drx + dry * dry;
          const w = Math.exp(-d2 * inv2s2);
          if (w > 0.008) {
            const dl = Math.sqrt(d2) || 1e-6;
            fx += P.Kt * ((drx / dl) * poke * w - dx);
            fy += P.Kt * ((dry / dl) * poke * w - dy);
            fx += P.Kdrag * w * cvx;
            fy += P.Kdrag * w * cvy;
          }
        }
        fxs[i] = fx; fys[i] = fy;
      }

      for (let i = 0; i < n; i++) {
        let nvx = vx[i] * dmp + fxs[i] * dt;
        let nvy = vy[i] * dmp + fys[i] * dt;
        const sp = Math.hypot(nvx, nvy);
        if (sp > P.vmax) { nvx *= P.vmax / sp; nvy *= P.vmax / sp; }
        vx[i] = nvx; vy[i] = nvy;
        let x = px[i] + nvx * dt, y = py[i] + nvy * dt;
        const ddx = x - rx[i], ddy = y - ry[i];
        const dd = Math.hypot(ddx, ddy);
        if (dd > dispMax) {
          const s = dispMax / dd;
          x = rx[i] + ddx * s; y = ry[i] + ddy * s;
          const nx = ddx / dd, ny = ddy / dd;
          const vn = nvx * nx + nvy * ny;
          if (vn > 0) { vx[i] = nvx - vn * nx; vy[i] = nvy - vn * ny; }
        }
        px[i] = x; py[i] = y;
      }
    }

    function energy() {
      let m = 0;
      for (let i = 0; i < n; i++)
        m = Math.max(m, Math.hypot(px[i] - rx[i], py[i] - ry[i]) + Math.hypot(vx[i], vy[i]) * 0.02);
      return m;
    }

    function path() {
      const f = v => (Math.round(v * 10) / 10).toString();
      let d = 'M' + f(px[0]) + ',' + f(py[0]);
      for (let i = 0; i < n; i++) {
        const im = (i - 1 + n) % n, i0 = i, i1 = (i + 1) % n, i2 = (i + 2) % n;
        const c1x = px[i0] + (px[i1] - px[im]) / 6, c1y = py[i0] + (py[i1] - py[im]) / 6;
        const c2x = px[i1] - (px[i2] - px[i0]) / 6, c2y = py[i1] - (py[i2] - py[i0]) / 6;
        d += 'C' + f(c1x) + ',' + f(c1y) + ' ' + f(c2x) + ',' + f(c2y) + ' ' + f(px[i1]) + ',' + f(py[i1]);
      }
      return d + 'Z';
    }

    function avg() {
      let ax = 0, ay = 0;
      for (let i = 0; i < n; i++) { ax += px[i] - rx[i]; ay += py[i] - ry[i]; }
      return { x: ax / n, y: ay / n };
    }

    return { step, energy, path, avg, n, px, py, rx, ry, vx, vy };
  }

  function init() {
    const btn = document.getElementById('zw-entry');
    if (!btn) return;
    const svg = btn.querySelector('.zw-jelly');
    if (!svg || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const blob = svg.querySelector('.zw-blob');
    const glossPath = svg.querySelector('.zw-blob-gloss');
    const grad = document.getElementById('zwGloss');
    const txt = btn.querySelector('.zw-entry-txt');
    if (!blob || !glossPath || !grad || !txt) return;

    let sim = null, rect = null, W = 0, H = 0;
    let active = false, pressed = false;
    let mx = 0, my = 0, cvx = 0, cvy = 0, lastMove = 0;
    let gx = 0, gy = 0;
    let raf = 0, last = 0, running = false;

    function render() {
      const d = sim.path();
      blob.setAttribute('d', d);
      glossPath.setAttribute('d', d);
      grad.setAttribute('cx', gx.toFixed(1));
      grad.setAttribute('cy', gy.toFixed(1));
      const a = sim.avg();
      const ax = Math.max(-6, Math.min(6, a.x * 0.35));
      const ay = Math.max(-6, Math.min(6, a.y * 0.35));
      txt.style.transform = 'translate(' + ax.toFixed(2) + 'px,' + ay.toFixed(2) + 'px)';
    }

    function build() {
      const r = btn.getBoundingClientRect();
      if (r.width < 24 || r.height < 12) return false;
      rect = r; W = r.width; H = r.height;
      const R = Math.max(12, Math.min(20, H * 0.42));
      sim = createSim(W, H, R);
      gx = W / 2; gy = H * 0.32;
      grad.setAttribute('r', (Math.max(W, H) * 1.15).toFixed(1));
      btn.classList.add('zw-jelly-on');
      render();
      return true;
    }

    function loop(now) {
      raf = 0;
      const dt = Math.min(0.033, Math.max(0.004, (now - last) / 1000));
      last = now;
      const decay = Math.exp(-9 * dt);
      cvx *= decay; cvy *= decay;
      sim.step(dt, active ? mx : null, active ? my : 0, cvx, cvy, pressed);
      if (active) {
        gx += (mx - gx) * Math.min(1, dt * 7);
        gy += (my - gy) * Math.min(1, dt * 7);
      } else {
        gx += (W / 2 - gx) * Math.min(1, dt * 4);
        gy += (H * 0.32 - gy) * Math.min(1, dt * 4);
      }
      render();
      if (!active && sim.energy() < P.settle) {
        txt.style.transform = '';
        running = false;
        return;
      }
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (running || !sim) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }

    btn.addEventListener('pointerenter', e => {
      if (!sim && !build()) return;
      rect = btn.getBoundingClientRect();
      mx = e.clientX - rect.left; my = e.clientY - rect.top;
      lastMove = performance.now();
      active = true;
      start();
    });
    btn.addEventListener('pointermove', e => {
      if (!sim && !build()) return;
      const now = performance.now();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const dt = Math.max(0.004, (now - lastMove) / 1000);
      lastMove = now;
      const ivx = (x - mx) / dt, ivy = (y - my) / dt;
      cvx = cvx * 0.55 + ivx * 0.45;
      cvy = cvy * 0.55 + ivy * 0.45;
      const cv = Math.hypot(cvx, cvy);
      if (cv > P.cvClamp) { cvx *= P.cvClamp / cv; cvy *= P.cvClamp / cv; }
      mx = x; my = y;
      active = true;
      start();
    });
    const leave = () => { active = false; pressed = false; cvx = 0; cvy = 0; start(); };
    btn.addEventListener('pointerleave', leave);
    btn.addEventListener('pointerdown', e => {
      pressed = true;
      if (sim) {
        rect = btn.getBoundingClientRect();
        mx = e.clientX - rect.left; my = e.clientY - rect.top;
      }
      start();
    });
    const up = () => { if (pressed) { pressed = false; start(); } };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    window.addEventListener('blur', leave);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        running = false;
      } else if (!running) start();
    });

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!active) build(); });
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => { if (!active) build(); }).observe(btn);
    } else {
      window.addEventListener('resize', () => { if (!active) build(); }, { passive: true });
    }
    build();
  }

  const api = { createSim, sampleRoundedRect, PARAMS: P };
  global.ZwJelly = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
