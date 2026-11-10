/* 紫微命门 · 果冻按钮 v2（整体刚体弹簧）
   按钮整体被一根「橡皮筋」拴在原位：
   - 鼠标在按钮上移动 → 黏滞拖拽，按钮整体顺着鼠标方向偏离原位
   - 偏移到达临界值（绳长）→ 脱扣：被弹簧猛拉回原位，欠阻尼晃动几下
   - 鼠标离开 → 弹回原位 + 晃动；静止后 rAF 停表，零持续开销
   外层按钮 = 静态命中区；内层 .zw-jelly-body = 视觉整体（transform 位移） */
(function (global) {
  'use strict';

  const P = {
    stick: 0.32,      // 鼠标位移 → 拖拽目标转化系数（黏滞）
    leash: 26,        // 临界偏移 px（绳长，超过即脱扣弹回）
    slipKick: 300,    // 脱扣瞬间朝家方向的冲量 px/s
    reEngageMs: 350,  // 脱扣后冷却：这段时间内不再累计拖拽（让弹回晃完）
    omega: 17,        // 固有角频率 rad/s ≈ 2.7Hz（回弹速度）
    zetaDrag: 0.5,    // 拖拽跟随阻尼比（顺滑不甩）
    zetaFree: 0.18,   // 脱扣/离手阻尼比（Q 弹晃 3~4 个来回）
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
    function kick(ix, iy) { vx = ix; vy = iy; }
    function settleMag() { return Math.hypot(x, y) + Math.hypot(vx, vy) * 0.02; }
    return { step, kick, pos: () => ({ x, y }), settleMag };
  }

  /* 控制器：拖拽累计 + 绳长脱扣 + 冷却（纯逻辑，可测） */
  function createController(now) {
    const sim = createBody();
    let dragX = 0, dragY = 0;
    let hovering = false;
    let slipUntil = -1e9;
    let slipCount = 0;

    const engaged = () => hovering && now() >= slipUntil;

    function move(dx, dy) {
      if (!engaged()) return;
      dragX += dx * P.stick;
      dragY += dy * P.stick;
      const d = Math.hypot(dragX, dragY);
      if (d >= P.leash) {                    // 拉到绳长：脱扣弹回
        const ux = dragX / d, uy = dragY / d;
        dragX = 0; dragY = 0;
        slipUntil = now() + P.reEngageMs;
        sim.kick(-ux * P.slipKick, -uy * P.slipKick);
        slipCount++;
      }
    }
    function enter() { hovering = true; }
    function leave() { hovering = false; dragX = 0; dragY = 0; }
    function tick(dt) {
      const on = engaged();
      sim.step(dt, on ? dragX : 0, on ? dragY : 0, on ? P.zetaDrag : P.zetaFree);
    }
    return { sim, move, enter, leave, tick, slips: () => slipCount };
  }

  function init() {
    const btn = document.getElementById('zw-entry');
    if (!btn) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const body = btn.querySelector('.zw-jelly-body');
    if (!body) return;

    const ctrl = createController(() => performance.now());
    let lastX = 0, lastY = 0, hasLast = false;
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
      if (ctrl.sim.settleMag() < P.settle) {
        body.style.transform = '';
        running = false;
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

    btn.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse') return;   // 触屏走原生点击，不抢滚动
      lastX = e.clientX; lastY = e.clientY; hasLast = true;
      ctrl.enter();
      start();
    });
    btn.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || !hasLast) return;
      ctrl.move(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
      start();
    });
    const leave = () => { ctrl.leave(); hasLast = false; start(); };
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
