/* 紫微命门 · 果冻按钮 v3（整体弹簧 · 松绑）
   按钮整体被一根「松橡皮筋」拴在原位：
   - 鼠标在按钮里 → 整体朝光标方向倾（目标 = 光标相对按钮中心 × 黏滞系数，带上限）
   - 光标回到按钮中心 → 方块也回到原位（对称、可预期）
   - 鼠标离开按钮 → 松手，弹簧拉回原位，欠阻尼晃几下
   - 静止后 rAF 停表，零持续开销
   外层按钮 = 静态命中区；内层 .zw-jelly-body = 视觉整体（transform 位移） */
(function (global) {
  'use strict';

  const P = {
    stick: 0.30,      // 光标相对位置 → 倾斜目标系数（黏滞）
    maxDrag: 26,      // 悬停期间最大偏移 px（松橡皮筋的长度）
    omega: 17,         // 固有角频率 rad/s ≈ 2.7Hz（回弹速度）
    zetaDrag: 0.55,   // 跟随阻尼比（顺滑贴着目标，几乎不过冲）
    zetaFree: 0.16,   // 松手回弹阻尼比（Q 弹晃 3~5 个来回）
    settle: 0.4,      // 静止判定（偏移 px + 速度折算）
    vmax: 2400,       // 速度上限 px/s（安全墙）
  };

  /* 刚体：二阶弹簧（半隐式欧拉，dt 上限 33ms 稳定） */
  function createBody() {
    let x = 0, y = 0, vx = 0, vy = 0;
    function step(dt, tx, ty, zeta) {
      const k = P.omega * P.omega;
      const c = 2 * zeta * P.omega;
      let nvx = vx + (k * (tx - x) - c * vx) * dt;
      let nvy = vy + (k * (ty - y) - c * vy) * dt;
      const s = Math.hypot(nvx, nvy);
      if (s > P.vmax) { nvx *= P.vmax / s; nvy *= P.vmax / s; }
      vx = nvx; vy = nvy;
      x += vx * dt;
      y += vy * dt;
    }
    /* 相对目标的静止量：悬停停在倾斜位也算静止（rAF 可停表，新交互会重启） */
    function restMag(tx, ty) { return Math.hypot(x - tx, y - ty) + Math.hypot(vx, vy) * 0.02; }
    return { step, pos: () => ({ x, y }), restMag };
  }

  /* 控制器：目标 = 光标相对按钮中心的位置 × stick（纯逻辑，可测） */
  function createController() {
    const sim = createBody();
    let hovering = false;
    let tx = 0, ty = 0;

    function aim(cx, cy, hx, hy) {
      if (!hovering) return;
      tx = (cx - hx) * P.stick;
      ty = (cy - hy) * P.stick;
      const d = Math.hypot(tx, ty);
      if (d > P.maxDrag) {              // 松橡皮筋有长度上限
        tx *= P.maxDrag / d;
        ty *= P.maxDrag / d;
      }
    }
    function enter() { hovering = true; tx = 0; ty = 0; }
    function leave() { hovering = false; tx = 0; ty = 0; }
    function tick(dt) {
      sim.step(dt, tx, ty, hovering ? P.zetaDrag : P.zetaFree);
    }
    function settled() { return sim.restMag(tx, ty) < P.settle; }
    return { sim, enter, aim, leave, tick, settled };
  }

  function init() {
    const btn = document.getElementById('zw-entry');
    if (!btn) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const body = btn.querySelector('.zw-jelly-body');
    if (!body) return;

    const ctrl = createController();
    let raf = 0, last = 0, running = false;

    function render() {
      const p = ctrl.sim.pos();
      body.style.transform = 'translate3d(' + p.x.toFixed(2) + 'px,' + p.y.toFixed(2) + 'px,0)';
    }
    function loop(now) {
      raf = 0;
      const dt = Math.min(0.033, Math.max(0.004, (now - last) / 1000));
      last = now;
      ctrl.tick(dt);
      render();
      if (ctrl.settled()) {
        running = false;        /* 保留最后渲染的 transform（可能停在倾斜稳态） */
        return;
      }
      raf = requestAnimationFrame(loop);
    }
    function start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }

    const center = () => {
      const r = btn.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };

    btn.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse') return;   // 触屏走原生点击，不抢滚动
      ctrl.enter();
      start();
    });
    btn.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      ctrl.aim(e.clientX, e.clientY, ...center());
      start();
    });
    const leave = () => { ctrl.leave(); start(); };
    btn.addEventListener('pointerleave', leave);
    window.addEventListener('blur', leave);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0; running = false;
      } else start();
    });
  }

  const api = { createBody, createController, PARAMS: P };
  global.ZwJelly = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
