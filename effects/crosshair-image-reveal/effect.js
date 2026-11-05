/*
 * Crosshair Image Reveal
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * An image window that opens from its top-left corner, led by a dot on two crossing guide lines. Scroll, drag the dot
 * or use the arrow keys: the crop grows towards the bottom right while the image zooms out to its natural size. Good
 * for a hero image, a project cover or any "reveal the picture" moment.
 *
 * How it moves
 * - One progress value p (0.3 to 1 here; 1 = fully open). The visible window is clip-path inset with a margin
 *   m = min(params.inset, 6.5% of the shorter side) on the top and left; its bottom-right corner sits at
 *   x = p x width - m, y = p x height - m. The corner radius of the crop follows the frame's own radius, shrinking as
 *   the crop gets small.
 * - The horizontal and vertical guide lines and the accent dot sit on that corner.
 * - Image zoom: scale = startScale + (1 - startScale) x p, so it is startScale when closed and exactly 1 when open.
 * - Following, in two stages: input only sets an aim. A chase value closes half of its remaining gap to the aim every
 *   75 ms (chase += (aim - chase) x (1 - 2^(-dt / 75)), so it does not depend on frame rate), and the drawn value eases
 *   to the latest chase over params.followDuration ms (ease-out cubic), restarting from what is on screen whenever the
 *   chase moves, so reversals never jump. With followDuration 0 only the chase stage is left.
 * - Input (on the frame):
 *   wheel: p changes by deltaY / (window height x revealSpan / 100). At either end the wheel stays captured while the
 *     gesture continues (250 ms latch), then the page scrolls.
 *   drag: mouse and pen can press anywhere (the corner jumps to the projection of the pointer on the diagonal); touch
 *     must start on the dot so the page can still scroll. Pointer capture keeps tracking outside the frame.
 *   keys (the frame is focusable): Arrow keys +-0.1, PageUp / PageDown +-0.25, Home = 0.3, End = 1.
 * - Demo, once on load (times from mount): a fake cursor with a wheel badge fades in at 74% / 30% of the frame. The
 *   image starts open, closes to 0.3 from 1.0 to 2.6 s (smoothstep), stays closed, reopens from 3.6 to 5.4 s, then the
 *   cursor fades out (5.8 to 6.2 s) and the demo ends with the image open. The first wheel, press or key ends it.
 * - reset(): params back to defaults, the image eases back to fully open over 500 ms (cubic-bezier(.22, 1, .36, 1)).
 *
 * Options
 *   params.startScale      1..2.5, default 1.8    image zoom when closed
 *   params.inset           8..30, default 20      top / left margin of the crop in px (capped at 6.5% of the shorter side)
 *   params.followDuration  0..300, default 120    ms for the crop and guides to catch up with input
 *   params.revealSpan      40..120, default 68    wheel distance from closed to open, in percent of the window height
 *
 * API
 *   const fx = mountCrosshairImageReveal(element, {params: {...}});
 *   fx.params                      copy of current params
 *   fx.setParams({startScale: 1.5}) change params live
 *   fx.reset()                     defaults, demo stopped, eases back to fully open
 *   fx.destroy()                   stops the loop, removes listeners, observers and the fake cursor, empties the element
 * There is no pause or reduced-motion setter; reduced motion follows the system setting live (see below).
 * The frame element carries data-progress and data-motion-state (closed / revealing / open / reduced) if you want to
 * hook other UI to it.
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountCrosshairImageReveal(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children. The frame is a 3:4 portrait,
 * 70% of the stage height, centred; at 760 px wide and below it takes the full width minus 32 px instead.
 *
 * Safe to change
 * - The picture: the media() call in the mount function renders a white card with a mark; replace it with an <img>
 *   (it goes inside .cross-image, which gets the zoom transform).
 * - Frame size and aspect in layout(); colours, line weight and the dot via effect.css.
 * - params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The zoom must reach exactly 1 at p = 1, or the open image looks soft.
 * - Keep the crop (clip-path) and the zoom on separate elements; animating width / height instead causes layout work
 *   every frame and the image would squash.
 * - Keep the two-stage smoothing (input smoother + followDuration ease); one linear tween feels mechanical.
 * - Keep touch-action as shipped (manipulation on the frame, none on the dot) and the touch-starts-on-dot rule, or the
 *   page cannot scroll past it on phones.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). Without it the rAF loop and listeners leak. In React StrictMode the mount runs twice; destroy
 *   in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - To drive it from page scroll instead, the class has fromViewport(top, height) and setProgress(p) (not exposed
 *   on fx; reach them through lib.CrosshairPlate.create if you restructure). fromViewport starts opening when the
 *   element's top edge crosses 86% of the viewport height and is fully open revealSpan vh of scrolling later.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountCrosshairImageReveal on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The frame is a focusable group with an aria-label naming the inputs; guides and dot are aria-hidden.
 * - With prefers-reduced-motion: no demo, no fake cursor; the image shows fully open, and wheel, drag and keys move the
 *   crop instantly without easing.
 * - The loop only runs while something is moving.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared page helpers: the demo cursor (arrow, wheel and hold badges) ----
  function createCursor(stage, options) {
    options = options || {};
    const ref = options.ref || stage;
    const size = options.size || 30,
      s = size / 24;
    const inertia = options.inertia !== false;
    const ARROW_D =
      'M5 4.35c0-1.06 1.24-1.62 2.04-.93l11.14 9.62c.83.72.32 2.08-.78 2.08h-4.66c-.5 0-.97.22-1.3.6l-3.33 3.86c-.73.84-2.11.33-2.11-.78Z';
    const TIP_X = 5,
      TIP_Y = 3;
    const el = document.createElement('div');
    el.className = 'dc-cursor';
    el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('--dc-size', size + 'px');
    el.innerHTML =
      '<svg class="dc-hold" viewBox="0 0 40 40"><circle class="dc-hold-bg" cx="20" cy="20" r="15"/><circle class="dc-hold-track" cx="20" cy="20" r="15"/><circle class="dc-hold-arc" cx="20" cy="20" r="15" pathLength="1"/></svg>' +
      '<div class="dc-body">' +
      '<svg class="dc-arrow" viewBox="0 0 24 24" style="width:' +
      size +
      'px;height:' +
      size +
      'px;left:' +
      -TIP_X * s +
      'px;top:' +
      -TIP_Y * s +
      'px;transform-origin:' +
      TIP_X * s +
      'px ' +
      TIP_Y * s +
      'px"><path d="' +
      ARROW_D +
      '"/></svg>' +
      '<svg class="dc-wheel" viewBox="0 0 22 32"><rect class="dc-wheel-shell" x="1" y="1" width="20" height="30" rx="10"/><line class="dc-wheel-split" x1="11" y1="1.6" x2="11" y2="11"/><rect class="dc-wheel-roll" x="9.25" y="5" width="3.5" height="7" rx="1.75"/></svg>' +
      '</div>';
    stage.appendChild(el);
    const arc = el.querySelector('.dc-hold-arc');
    let ox = 0,
      oy = 0,
      dirty = true;
    const ro = new ResizeObserver(() => {
      dirty = true;
    });
    ro.observe(stage);
    if (ref !== stage) ro.observe(ref);
    function offset() {
      if (!dirty) return;
      dirty = false;
      if (ref === stage) {
        ox = oy = 0;
        return;
      }
      const a = stage.getBoundingClientRect(),
        b = ref.getBoundingClientRect();
      ox = b.left - a.left;
      oy = b.top - a.top;
    }
    const last = { x: 0, y: 0, opacity: 0, down: false, wheel: false, hold: null };
    const pos = { x: 0, y: 0, vx: 0, vy: 0 };
    let shown = 0,
      raf = 0,
      prevT = 0,
      wasDown = false,
      dead = false;
    const W = 26,
      Z = 0.82;
    function place() {
      el.style.transform = 'translate3d(' + (ox + pos.x).toFixed(2) + 'px,' + (oy + pos.y).toFixed(2) + 'px,0)';
    }
    function tick(now) {
      raf = 0;
      if (dead) return;
      const dt = prevT ? Math.min(0.032, (now - prevT) / 1000) : 1 / 60;
      prevT = now;
      for (let i = 0; i < 2; i++) {
        const h = dt / 2;
        pos.vx += (W * W * (last.x - pos.x) - 2 * Z * W * pos.vx) * h;
        pos.vy += (W * W * (last.y - pos.y) - 2 * Z * W * pos.vy) * h;
        pos.x += pos.vx * h;
        pos.y += pos.vy * h;
      }
      place();
      if (Math.abs(last.x - pos.x) + Math.abs(last.y - pos.y) > 0.05 || Math.abs(pos.vx) + Math.abs(pos.vy) > 1)
        raf = requestAnimationFrame(tick);
      else {
        pos.x = last.x;
        pos.y = last.y;
        pos.vx = pos.vy = 0;
        place();
        prevT = 0;
      }
    }
    function ripple() {
      const r = document.createElement('i');
      r.className = 'dc-ripple';
      el.appendChild(r);
      r.addEventListener('animationend', () => r.remove(), { once: true });
    }
    function set(state) {
      if (dead) return;
      Object.assign(last, state);
      offset();
      const o = Math.max(0, Math.min(1, +last.opacity || 0));
      el.style.opacity = o.toFixed(3);
      const far = Math.hypot(last.x - pos.x, last.y - pos.y) > 400;
      if (!inertia || shown === 0 || far) {
        cancelAnimationFrame(raf);
        raf = 0;
        prevT = 0;
        pos.x = last.x;
        pos.y = last.y;
        pos.vx = pos.vy = 0;
        place();
      } else if (!raf) raf = requestAnimationFrame(tick);
      shown = o;
      const down = !!last.down,
        holding = last.hold != null && o > 0;
      if (down && !wasDown && !holding && o > 0) ripple();
      wasDown = down;
      el.toggleAttribute('data-down', down);
      el.toggleAttribute('data-hold', holding);
      if (holding) arc.style.strokeDashoffset = (1 - Math.max(0, Math.min(1, +last.hold || 0))).toFixed(4);
      el.toggleAttribute('data-hold-done', holding && +last.hold >= 1);
      el.toggleAttribute('data-wheel', !!last.wheel && o > 0);
      el.toggleAttribute('data-wheel-up', typeof last.wheel === 'number' && last.wheel < 0);
    }
    return {
      el,
      element: el,
      set,
      hide() {
        set({ opacity: 0, down: false, wheel: false, hold: null });
      },
      destroy() {
        if (dead) return;
        dead = true;
        cancelAnimationFrame(raf);
        ro.disconnect();
        el.remove();
      },
    };
  }

  // ---- inlined from the shared card parts: a white card with a centred mark ----
  const GLYPHS = [
    '<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M50 16v68M16 50h68" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
    '<rect x="20" y="20" width="60" height="60" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M24 24l52 52M76 24L24 76" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
  ];
  function glyph(index) {
    return (
      '<svg class="ck-glyph" viewBox="0 0 100 100" aria-hidden="true">' +
      GLYPHS[Math.abs(index | 0) % GLYPHS.length] +
      '</svg>'
    );
  }
  function media(options) {
    options = options || {};
    return (
      '<div class="ck-media' +
      (options.lift ? ' ck-lift' : '') +
      '"' +
      (options.tone ? ' data-tone="' + (options.tone | 0) + '"' : '') +
      (options.size === 'sm' ? ' data-size="sm"' : '') +
      (options.accent ? ' data-accent' : '') +
      ' aria-hidden="true">' +
      (options.glyph == null || options.glyph === false ? '' : glyph(options.glyph)) +
      '</div>'
    );
  }

  // ---- the effect ----
  const lib = {};
  (function () {
    'use strict';
    const controls = [
      {
        key: 'startScale',
        label: 'Start zoom',
        type: 'range',
        group: 'Image',
        min: 1,
        max: 2.5,
        step: 0.1,
        default: 1.8,
        unit: '×',
        description: 'Image zoom while closed; always 1 when fully open.',
        visualizer: 'grid',
      },
      {
        key: 'inset',
        label: 'Margin',
        type: 'range',
        group: 'Geometry',
        min: 8,
        max: 30,
        step: 1,
        default: 20,
        unit: 'px',
        description: 'Top-left margin; also sets the gutter of the final readout.',
        visualizer: 'grid',
      },
      {
        key: 'followDuration',
        label: 'Follow time',
        type: 'range',
        group: 'Timing',
        min: 0,
        max: 300,
        step: 10,
        default: 120,
        unit: 'ms',
        description:
          'Easing time for the image and guides to catch up with input, demo included. 0 keeps input smoothing only.',
        visualizer: 'timeline',
      },
      {
        key: 'revealSpan',
        label: 'Scroll length',
        type: 'range',
        group: 'Trigger',
        min: 40,
        max: 120,
        step: 1,
        default: 68,
        unit: 'vh',
        description: 'Scroll distance from closed to fully open.',
        visualizer: 'timeline',
      },
      {
        key: 'accent',
        label: 'Caption background',
        type: 'color',
        group: 'Color',
        default: '#ffffff',
        description: 'Background of the caption area on the right; white by default.',
        visualizer: 'none',
      },
    ];
    const defaults = Object.fromEntries(controls.map((item) => [item.key, item.default]));
    const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
    const ENTER_LINE = 0.86;
    const CHASE_HALF_LIFE = 75;
    const CHASE_DONE = 5e-5;
    const towards = (dt, halfLife) => 1 - Math.pow(2, -dt / halfLife);
    const decelerate = (u) => {
      const r = 1 - clamp(u);
      return 1 - r * r * r;
    };
    const smoothstep = (u) => u * u * (3 - 2 * u);
    const DEMO = { cycle: 5600, rise: [400, 2200], fall: [3400, 5000] };
    function demoAim(t, loop) {
      const [r0, r1] = DEMO.rise,
        [f0, f1] = DEMO.fall;
      if (t < r0) return 0;
      if (t < r1) return smoothstep((t - r0) / (r1 - r0));
      if (!loop || t < f0) return 1;
      if (t < f1) return 1 - smoothstep((t - f0) / (f1 - f0));
      return 0;
    }
    class Trail {
      constructor(p) {
        this.jump(p);
      }
      jump(p) {
        this.chase = p;
        this.shown = p;
        this.leg = { from: p, to: p, age: 0 };
      }
      step(aim, dt, followMs) {
        const gap = aim - this.chase;
        this.chase = Math.abs(gap) < CHASE_DONE ? aim : this.chase + gap * towards(dt, CHASE_HALF_LIFE);
        if (followMs <= 0) {
          this.jump(this.chase);
          return this.shown;
        }
        const leg = this.leg;
        leg.age += dt;
        this.shown = leg.age >= followMs ? leg.to : leg.from + (leg.to - leg.from) * decelerate(leg.age / followMs);
        if (leg.to !== this.chase) this.leg = { from: this.shown, to: this.chase, age: 0 };
        return this.shown;
      }
      settledOn(aim) {
        return this.chase === aim && this.shown === aim;
      }
    }
    const CARD_LEAD = 2400,
      CARD_MIN = 0.3;
    const RESTORE = 500,
      ONCE_FADE = 8200;
    const ROUND_MIN = 0.35,
      WHEEL_GAP = 250;
    function cubicBezier(x1, y1, x2, y2) {
      const at = (a, b, s) => {
          const r = 1 - s;
          return 3 * r * s * (r * a + s * b) + s * s * s;
        },
        rate = (a, b, s) => {
          const r = 1 - s;
          return 3 * (r * r * a + 2 * r * s * (b - a) + s * s * (1 - b));
        };
      return (p) => {
        if (p <= 0) return 0;
        if (p >= 1) return 1;
        let s = p,
          done = false;
        for (let n = 0; n < 6; n++) {
          const miss = at(x1, x2, s) - p,
            k = rate(x1, x2, s);
          done = Math.abs(miss) < 1e-7;
          if (done || Math.abs(k) < 1e-6) break;
          const next = s - miss / k;
          if (next < 0 || next > 1) break;
          s = next;
        }
        if (done) return at(y1, y2, s);
        let lo = 0,
          hi = 1;
        while (hi - lo > 1e-7) {
          s = (lo + hi) / 2;
          if (at(x1, x2, s) < p) lo = s;
          else hi = s;
        }
        return at(y1, y2, (lo + hi) / 2);
      };
    }
    const outEase = cubicBezier(0.22, 1, 0.36, 1);
    class CrosshairPlate {
      constructor(element, options = {}) {
        this.element = element;
        this.options = Object.assign({}, defaults, options);
        this.card = options.card || null;
        if (this.card)
          element.innerHTML =
            '<div class="cross-window"><div class="cross-image">' +
            (this.card.media ? this.card.media() : '') +
            '</div></div><i class="cross-axis cross-axis-x ck-line" aria-hidden="true"></i><i class="cross-axis cross-axis-y ck-line" data-v aria-hidden="true"></i><i class="cross-point ck-dot" data-accent aria-hidden="true"></i>';
        this.image = element.querySelector('.cross-image');
        this.window = element.querySelector('.cross-window');
        this.axisX = element.querySelector('.cross-axis-x');
        this.axisY = element.querySelector('.cross-axis-y');
        this.point = element.querySelector('.cross-point');
        this.readout = element.querySelector('.cross-readout');
        this.xLabel = element.querySelector('[data-x]');
        this.yLabel = element.querySelector('[data-y]');
        this.progress = 0;
        this.aim = 0;
        this.trail = new Trail(0);
        this.raf = 0;
        this.clock = 0;
        this.lastTime = 0;
        this.mode = 'idle';
        this.paused = false;
        this.reduced = !!options.reduced;
        this.destroyed = false;
        this.loop = false;
        this.tick = this.tick.bind(this);
        this.measure = this.measure.bind(this);
        this.observer = new ResizeObserver(this.measure);
        this.observer.observe(element);
        this.onLoad = () => {
          if (!this.destroyed) element.dataset.mediaState = this.image.naturalWidth ? 'ready' : 'error';
        };
        this.onError = () => {
          if (!this.destroyed) element.dataset.mediaState = 'error';
        };
        this.image.addEventListener('load', this.onLoad);
        this.image.addEventListener('error', this.onError);
        element.dataset.mediaState = this.image.complete && this.image.naturalWidth ? 'ready' : 'loading';
        this.measure();
        this.render(this.reduced ? 1 : 0);
        if (this.card && this.card.interactive) this.attach();
      }
      get target() {
        return this.aim;
      }
      get frame() {
        return this.raf;
      }
      measure() {
        if (this.destroyed) return;
        this.width = this.element.clientWidth;
        this.height = this.element.clientHeight;
        if (this.card && this.card.round)
          this.outerRadius =
            typeof this.card.round === 'number'
              ? this.card.round
              : parseFloat(getComputedStyle(this.element).borderTopLeftRadius) || 0;
        this.render(this.progress);
      }
      margin(w, h) {
        return Math.min(this.options.inset, Math.min(w, h) * 0.065);
      }
      tail(m) {
        return this.card && this.card.even ? 0 : m * 2.4;
      }
      render(progress) {
        if (this.destroyed) return;
        this.progress = clamp(progress);
        const p = this.reduced && !this.direct ? 1 : this.progress,
          w = this.width || 1,
          h = this.height || 1;
        const m = this.margin(w, h),
          run = this.tail(m);
        const cornerX = p * (w - run) - m,
          cornerY = p * (h - run) - m;
        const lineX = Math.max(-1, cornerX),
          lineY = Math.max(-1, cornerY);
        const zoom = this.options.startScale + (1 - this.options.startScale) * p;
        this.window.style.clipPath = `inset(${m}px ${w - cornerX}px ${h - cornerY}px ${m}px${this.card && this.card.round ? this.corner(m, cornerX, cornerY) : ''})`;
        this.image.style.transform = `scale(${zoom})`;
        this.axisX.style.transform = `translateY(${lineY}px)`;
        this.axisY.style.transform = `translateX(${lineX}px)`;
        this.point.style.transform = `translate(${lineX}px,${lineY}px)`;
        if (this.readout) this.readout.style.transform = `translate(${lineX}px,${lineY}px)`;
        if (this.xLabel) this.xLabel.textContent = String(Math.round(Math.max(0, lineX - m)));
        if (this.yLabel) this.yLabel.textContent = String(Math.round(Math.max(0, lineY - m)));
        const data = this.element.dataset;
        data.progress = p.toFixed(5);
        data.targetProgress = this.aim.toFixed(5);
        data.inputProgress = this.trail.chase.toFixed(5);
        data.motionState = this.reduced
          ? 'reduced'
          : this.paused
            ? 'paused'
            : p === 1
              ? 'open'
              : p === 0
                ? 'closed'
                : 'revealing';
        if (this.onRender) this.onRender(p);
      }
      corner(m, cornerX, cornerY) {
        const R = this.outerRadius || 0,
          side = Math.max(0, Math.min(cornerX - m, cornerY - m));
        return ` round ${Math.min(Math.max(R - m, R * ROUND_MIN), side / 2).toFixed(2)}px`;
      }
      schedule() {
        if (!this.raf && !this.destroyed && !this.paused && !this.reduced) {
          this.lastTime = 0;
          this.raf = requestAnimationFrame(this.tick);
        }
      }
      tick(now) {
        this.raf = 0;
        if (this.destroyed || this.paused || this.reduced) return;
        const dt = this.lastTime ? Math.min(now - this.lastTime, 80) : 0;
        this.lastTime = now;
        this.clock += dt;
        if (this.live && this.liveTick(dt)) return;
        let p = this.progress,
          again = false;
        if (this.mode === 'seek') {
          this.trail.jump(this.aim);
          p = this.aim;
        } else if (this.mode === 'auto' || this.mode === 'follow') {
          if (this.mode === 'auto') {
            const t = this.loop ? this.clock % DEMO.cycle : this.clock;
            this.aim = demoAim(t, this.loop);
            if (this.card) this.aim = CARD_MIN + (1 - CARD_MIN) * this.aim;
            if (this.loop) this.moveHand(t);
          }
          p = this.trail.step(this.aim, dt, this.options.followDuration);
          const still = this.trail.settledOn(this.aim);
          again = this.mode === 'auto' ? this.loop || this.clock < DEMO.rise[1] || !still : !still;
        }
        this.render(p);
        if (again) this.raf = requestAnimationFrame(this.tick);
        else this.mode = 'idle';
      }
      moveHand(t) {
        if (this.card) {
          const h = this.card.hand || {};
          if (this.card.pointer)
            this.card.pointer({
              x: this.width * (h.x == null ? 0.5 : h.x),
              y: this.height * (h.y == null ? 0.5 : h.y),
              opacity: clamp((this.clock - CARD_LEAD) / 400),
              down: false,
              wheel: (t >= 300 && t < 2300) || (t >= 3300 && t < 5100),
            });
          return;
        }
        if (!this.hand) {
          this.hand = document.createElement('span');
          this.hand.className = 'cross-hand';
          this.hand.setAttribute('aria-hidden', 'true');
          this.element.appendChild(this.hand);
        }
        const seg = t >= 300 && t < 2300 ? (t - 300) / 2000 : t >= 3300 && t < 5100 ? (t - 3300) / 1800 : -1;
        const up = t < 3000,
          e = seg < 0 ? 0 : decelerate(seg / 0.85);
        const y = up ? 0.72 - 0.34 * e : 0.38 + 0.34 * e;
        this.hand.style.opacity = seg < 0 ? '0' : String(Math.min(1, seg / 0.1, (1 - seg) / 0.12));
        this.hand.style.transform =
          'translate3d(' + this.element.clientWidth * 0.82 + 'px,' + this.element.clientHeight * y + 'px,0)';
      }
      setProgress(progress, immediate = false) {
        if (this.destroyed) return;
        this.aim = clamp(progress);
        this.mode = immediate ? 'seek' : 'follow';
        this.loop = false;
        if (this.reduced) {
          this.stop();
          this.trail.jump(1);
          this.render(1);
          return;
        }
        if (immediate && !this.paused) {
          this.stop();
          this.trail.jump(this.aim);
          this.render(this.aim);
          return;
        }
        this.schedule();
      }
      scrollBy(delta) {
        if (this.destroyed) return;
        if (this.mode === 'auto') this.setProgress(this.progress, true);
        this.setProgress(this.aim + delta);
      }
      fromViewport(top, height) {
        const travelled = ENTER_LINE * height - top;
        this.setProgress(travelled / ((height * this.options.revealSpan) / 100));
      }
      play(loop = false) {
        if (this.destroyed) return;
        this.stop();
        this.loop = loop;
        this.mode = 'auto';
        this.clock = this.card ? CARD_LEAD : 0;
        this.aim = this.card ? 1 : 0;
        const first = this.reduced || this.card ? 1 : 0;
        this.trail.jump(first);
        this.render(first);
        this.schedule();
      }
      stop() {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.lastTime = 0;
        this.mode = 'idle';
      }
      setPaused(value) {
        if (this.destroyed) return;
        this.paused = !!value;
        if (this.paused) {
          cancelAnimationFrame(this.raf);
          this.raf = 0;
          this.lastTime = 0;
        } else if (this.mode !== 'idle') this.schedule();
        this.render(this.progress);
      }
      setReduced(value) {
        this.reduced = !!value;
        if (this.reduced) {
          this.stop();
          this.trail.jump(1);
          this.render(1);
        }
      }
      setParams(values) {
        if (this.destroyed) return;
        Object.assign(this.options, values);
        this.render(this.progress);
      }
      attach() {
        const el = this.element,
          card = this.card,
          report = card.pointer,
          motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.live = true;
        this.direct = true;
        this.handOff = false;
        this.back = null;
        this.drag = null;
        this.report = report;
        this.card = Object.assign({}, card, {
          pointer: (s) => {
            if (this.handOff || !report) return;
            const f = card.once ? 1 - clamp((this.clock - ONCE_FADE) / 400) : 1;
            report(Object.assign({}, s, { opacity: s.opacity * f }));
          },
        });
        const base = () => (this.back || this.mode === 'auto' ? this.progress : this.aim);
        const go = (p) => {
          if (Math.abs(p - base()) < 1e-4) return;
          if (this.back) {
            this.back = null;
            this.trail.jump(this.progress);
            this.aim = this.progress;
          }
          this.take();
          if (this.reduced) {
            this.stop();
            this.aim = p;
            this.trail.jump(p);
            this.render(p);
          } else {
            if (this.mode === 'auto') this.setProgress(this.progress, true);
            this.setProgress(p);
          }
          if (card.touched) card.touched();
        };
        const at = (e) => {
          const r = el.getBoundingClientRect(),
            w = this.width || 1,
            h = this.height || 1,
            m = this.margin(w, h),
            q = this.tail(m),
            ax = w - q,
            ay = h - q;
          return ((e.clientX - r.left + m) * ax + (e.clientY - r.top + m) * ay) / (ax * ax + ay * ay);
        };
        const gap = card.wheelLatch ? (typeof card.wheelLatch === 'number' ? card.wheelLatch : WHEEL_GAP) : 0;
        let wheelAt = -Infinity,
          held = false;
        const onWheel = (e) => {
          if (e.ctrlKey || this.paused) return;
          const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1),
            from = base(),
            p = clamp(from + dy / ((window.innerHeight * this.options.revealSpan) / 100), CARD_MIN, 1);
          if (gap && dy) {
            const now = performance.now();
            if (now - wheelAt > gap) held = false;
            wheelAt = now;
          }
          if (!dy || Math.abs(p - from) < 1e-6) {
            if (gap && dy && held) e.preventDefault();
            return;
          }
          if (gap) held = true;
          e.preventDefault();
          go(p);
        };
        const onDown = (e) => {
          if (e.button !== 0 || this.paused) return;
          const onPoint = !!e.target.closest('.cross-point');
          if (e.pointerType === 'touch' && !onPoint) return;
          this.take();
          this.release();
          const p = at(e);
          this.drag = { id: e.pointerId, off: onPoint ? this.progress - p : 0 };
          el.setPointerCapture(e.pointerId);
          el.classList.add('cross-dragging');
          go(clamp(p + this.drag.off, CARD_MIN, 1));
        };
        const onMove = (e) => {
          if (!this.drag || e.pointerId !== this.drag.id || this.paused) return;
          go(clamp(at(e) + this.drag.off, CARD_MIN, 1));
        };
        const onUp = (e) => {
          if (this.drag && e.pointerId === this.drag.id) this.release();
        };
        const onMotion = () => {
          if (motion.matches) {
            this.take();
            this.release();
            this.back = null;
          }
        };
        const onKey = (e) => {
          const k = e.key,
            step = { ArrowDown: 0.1, ArrowRight: 0.1, ArrowUp: -0.1, ArrowLeft: -0.1, PageDown: 0.25, PageUp: -0.25 }[
              k
            ];
          if (this.paused || e.altKey || e.ctrlKey || e.metaKey || (step == null && k !== 'Home' && k !== 'End'))
            return;
          const from = base(),
            p = k === 'Home' ? CARD_MIN : k === 'End' ? 1 : clamp(from + step, CARD_MIN, 1);
          if (Math.abs(p - from) < 1e-6) return;
          e.preventDefault();
          go(p);
        };
        this.release = () => {
          if (!this.drag) return;
          const id = this.drag.id;
          this.drag = null;
          el.classList.remove('cross-dragging');
          if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        el.addEventListener('pointerdown', onDown);
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onUp);
        el.addEventListener('lostpointercapture', onUp);
        el.addEventListener('keydown', onKey);
        motion.addEventListener('change', onMotion);
        this.detach = () => {
          this.release();
          el.removeEventListener('wheel', onWheel, { passive: false });
          el.removeEventListener('pointerdown', onDown);
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onUp);
          el.removeEventListener('pointercancel', onUp);
          el.removeEventListener('lostpointercapture', onUp);
          el.removeEventListener('keydown', onKey);
          motion.removeEventListener('change', onMotion);
        };
      }
      take() {
        if (this.handOff) return;
        this.handOff = true;
        this.loop = false;
        if (this.report) this.report({ x: 0, y: 0, opacity: 0, down: false, wheel: false });
      }
      liveTick(dt) {
        if (this.mode === 'auto' && this.loop && !this.handOff && this.card.once && this.clock >= ONCE_FADE + 400)
          this.take();
        if (!this.back) return false;
        this.back.t += dt;
        const u = clamp(this.back.t / RESTORE);
        this.render(this.back.from + (1 - this.back.from) * outEase(u));
        if (u < 1) this.raf = requestAnimationFrame(this.tick);
        else {
          this.back = null;
          this.aim = 1;
          this.trail.jump(1);
          this.mode = 'idle';
        }
        return true;
      }
      restore() {
        if (!this.live || this.destroyed) return;
        this.take();
        this.release();
        if (this.reduced) {
          this.back = null;
          this.aim = 1;
          this.trail.jump(1);
          this.render(1);
          return;
        }
        this.stop();
        this.aim = 1;
        this.back = { t: 0, from: this.progress };
        this.schedule();
      }
      destroy() {
        if (this.destroyed) return;
        if (this.detach) this.detach();
        this.stop();
        this.observer.disconnect();
        this.image.removeEventListener('load', this.onLoad);
        this.image.removeEventListener('error', this.onError);
        this.destroyed = true;
        this.element.dataset.motionState = 'destroyed';
        this.onRender = null;
      }
    }
    lib.CrosshairPlate = {
      create: (element, options) => new CrosshairPlate(element, options),
      controls: controls.filter((c) => c.key !== 'accent'),
    };
  })();
  const LIB = lib;

  // the effect's API as the mount function sees it: every object a call returns that has destroy() is destroyed with the mount
  function ownInstances(api, owned) {
    const out = {};
    for (const name of Object.keys(api)) {
      const part = api[name];
      if (!part || typeof part !== 'object') {
        out[name] = part;
        continue;
      }
      const copy = Object.create(part);
      for (const key of Object.keys(part))
        if (typeof part[key] === 'function')
          copy[key] = function () {
            const made = part[key].apply(this === copy ? part : this, arguments);
            if (made && typeof made === 'object' && typeof made.destroy === 'function') owned.add(made);
            return made;
          };
      out[name] = copy;
    }
    return out;
  }

  // ---- mounting: stage markup, layout, motion and input ----
  function mountCrosshairImageReveal(element, options) {
    options = options || {};
    // destroy() puts the element back as it was and stops whatever this mount function still has scheduled
    const mounted = {
      html: element.innerHTML,
      attrs: Array.from(element.attributes, (a) => [a.name, a.value]),
      frames: new Set(),
      timers: new Set(),
      observers: new Set(),
      owned: new Set(),
      done: false,
    };
    const requestAnimationFrame = (cb) => {
      const f = global.requestAnimationFrame((t) => {
        mounted.frames.delete(f);
        cb(t);
      });
      mounted.frames.add(f);
      return f;
    };
    const cancelAnimationFrame = (f) => {
      mounted.frames.delete(f);
      global.cancelAnimationFrame(f);
    };
    const setTimeout = (cb, ms, ...args) => {
      const t = global.setTimeout(() => {
        mounted.timers.delete(t);
        cb(...args);
      }, ms);
      mounted.timers.add(t);
      return t;
    };
    const clearTimeout = (t) => {
      mounted.timers.delete(t);
      global.clearTimeout(t);
    };
    const setInterval = (cb, ms, ...args) => {
      const t = global.setInterval(cb, ms, ...args);
      mounted.timers.add(t);
      return t;
    };
    const clearInterval = (t) => {
      mounted.timers.delete(t);
      global.clearInterval(t);
    };
    const watched = (Base) =>
      Base &&
      class extends Base {
        constructor(cb, opts) {
          super(cb, opts);
          mounted.observers.add(this);
        }
      };
    const ResizeObserver = watched(global.ResizeObserver),
      IntersectionObserver = watched(global.IntersectionObserver),
      MutationObserver = watched(global.MutationObserver);
    mounted.restore = () => {
      mounted.done = true;
      mounted.owned.forEach((o) => {
        if (o && typeof o.destroy === 'function') o.destroy();
      });
      mounted.owned.clear();
      mounted.frames.forEach((f) => global.cancelAnimationFrame(f));
      mounted.frames.clear();
      mounted.timers.forEach((t) => {
        global.clearTimeout(t);
        global.clearInterval(t);
      });
      mounted.timers.clear();
      mounted.observers.forEach((o) => o.disconnect());
      mounted.observers.clear();
      element.innerHTML = mounted.html;
      for (const a of Array.from(element.attributes)) element.removeAttribute(a.name);
      for (const [name, value] of mounted.attrs) element.setAttribute(name, value);
    };
    const lib = ownInstances(LIB, mounted.owned);
    element.classList.add('crosshair-image-reveal');
    element.innerHTML =
      '<div class="fx-board"><div data-crosshair tabindex="0" role="group" aria-label="Image frame. Drag the blue dot, scroll, or use arrow keys."></div></div>';
    const listeners = new AbortController();
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('.fx-board'),
      box = board.querySelector('[data-crosshair]'),
      cursor = createCursor(stage);
    const narrow = matchMedia('(max-width:760px)'),
      motion = matchMedia('(prefers-reduced-motion: reduce)');
    let off = [0, 0];
    function layout() {
      const W = stage.clientWidth,
        H = stage.clientHeight;
      let w, h, left;
      if (narrow.matches) {
        w = Math.min(W - 32, (H - 80) * 0.75);
        h = w / 0.75;
        left = (W - w) / 2;
      } else {
        const L = panelZone(stage).right + 16;
        h = Math.min(H * 0.7, (W - L - 32) * 0.75);
        w = h / 0.75;
        left = Math.max((W - w) / 2, L);
      }
      const top = (H - h) / 2;
      Object.assign(box.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
      board.style.setProperty('--fx-k', (Math.min(w, h) / 216).toFixed(4));
      off = [left, top];
    }
    layout();
    const plate = lib.CrosshairPlate.create(box, {
      reduced: motion.matches,
      card: {
        media: () => media({ tone: 2, glyph: 0 }),
        hand: { x: 0.74, y: 0.3 },
        interactive: true,
        once: true,
        even: true,
        round: true,
        wheelLatch: true,
        pointer: (s) => cursor.set(Object.assign({}, s, { x: s.x + off[0], y: s.y + off[1] })),
      },
    });
    const observer0 = new ResizeObserver(layout);
    observer0.observe(stage);
    plate.play(true);
    const inst = plate;
    motion.addEventListener('change', () => plate.setReduced(motion.matches), { signal: listeners.signal });
    const C = lib.CrosshairPlate.controls;
    const applyParams = (p) => plate.setParams(p),
      resetView = () => plate.restore();

    const DEFAULTS = Object.fromEntries(C.map((c) => [c.key, c.default]));
    let params = Object.assign({}, DEFAULTS);
    const setParams = (next) => {
      params = Object.assign({}, params, next);
      if (applyParams) applyParams(Object.assign({}, params));
    };
    if (options.params) setParams(options.params);
    return {
      get params() {
        return Object.assign({}, params);
      },
      setParams,
      reset() {
        params = Object.assign({}, DEFAULTS);
        if (applyParams) applyParams(Object.assign({}, params));
        if (resetView) resetView();
      },
      destroy() {
        if (mounted.done) return;
        listeners.abort();
        observer0.disconnect();
        cursor.destroy();
        if (inst) mounted.owned.add(inst);
        mounted.restore();
      },
    };
  }
  global.mountCrosshairImageReveal = mountCrosshairImageReveal;
  if (typeof module === 'object' && module.exports) module.exports = mountCrosshairImageReveal;
})(typeof window !== 'undefined' ? window : this);
