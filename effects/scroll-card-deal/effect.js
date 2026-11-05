/*
 * Scroll Card Deal
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Four cards start as one face-down pile in the middle. As you scroll, the pile opens into a fan on the spot, slides out
 * sideways into an evenly spaced row while it flattens, and the cards lift and flip face-up one after another, left to
 * right, each with a small overshoot. Every card hovers on its own along the way. Good for service lists, capabilities or
 * plan comparisons. Pure DOM + CSS 3D, no WebGL.
 *
 * How it moves
 * - One number drives everything: progress u in 0..1. Input moves a virtual track 3.1 stage heights long; progress chases
 *   it with exponential damping at about 4.5 per second.
 * - fitN(x, a, b) = clamp((x - a) / (b - a), 0, 1). OUT = cubic-bezier(.22,1,.36,1), SPRING = cubic-bezier(.28,1.3,.36,1),
 *   GLIDE = cubic-bezier(.33,.55,.2,1). Per card p = 0..3, s = flipStagger/100, k = [0, 2.1, 4, 5.3][p]:
 *     x    = pile + (p*(W - cw)/3 - pile) * OUT(fitN(u, .13, .52)), pile = (W - cw)/2
 *     open = u < .3 ? OUT(fitN(u, .04, .2)) : 1 - GLIDE(fitN(u, .3, .62))
 *     rz   = sign(p - 1.5) * |p - 1.5|^1.1 * fanTilt * open
 *     f    = fitN(u, .42 + p*s, .97 - (3 - p)*s)
 *     ry   = 180 * (1 - SPRING(f*f))
 *     env  = smoothstep(fitN(u, .05, .18)) * (1 - smoothstep(fitN(u, .8, .98)))
 *     y    = -.5*bob*sin^2(PI*f) + .9*bob*(.62*sin(2.6*time + k) + .38*sin(4.1*time + 1.7*k))*env
 *   transform = translate3d(x, y, 0) rotateZ(rz) rotateY(ry). Faces use backface-visibility: hidden; the back is
 *   pre-rotated 180deg.
 * - Narrow screens (viewport <= 812 px): one column rising through the stage, cards dealt in from alternate sides.
 *   q = card centre / stage height, end = max(.5, q at the end of the track); ry uses f = fitN(q, end + .6, end);
 *   rest = 1 - OUT(fitN(q, end + .72, end + .1)) gives x = side*.07*width*rest and rz = side*fanTilt*.5*rest.
 *   No spread or float there.
 * - Wheel 1:1 on the track; vertical drag (1 px = track / (1.6 x stage height)); arrow / page keys 1/8 of the track,
 *   Home / End. A wheel gesture that moved the cards is swallowed at the end until it pauses 250 ms; then the page
 *   scrolls only after the cards settled and you push another 100 px outward.
 * - Demo once on load: a fake cursor fades in, scrolls the pile open over 3.8 s, holds for 0.7 s, then is hidden at once
 *   (no fade-out). Any real input ends it.
 *
 * Options
 *   params.fanTilt      0..20, default 7    degrees the fan opens (outer cards x1.56, inner x0.47)
 *   params.flipStagger  0..12, default 6    percent of the track between neighbouring flips
 *   params.bob          0..24, default 12   px of hover; the lift while flipping is .5 of it
 *   reducedMotion       true / false / null
 *
 * API
 *   const fx = mountScrollCardDeal(element);
 *   fx.setParams({fanTilt: 12}); fx.setPaused(bool); fx.reset(); fx.setReducedMotion(bool); fx.destroy();
 *
 * Usage
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountScrollCardDeal(document.getElementById('stage'));</script>
 *
 * Safe to change
 * - Card faces: front(i) and back() in the mount function return HTML. Card count is fixed at four.
 * - Colours, radius, shadow via CSS variables; card size via the layout function (width = wrap * 0.225, height = 1.4 x).
 *
 * Do not change (the feel breaks)
 * - Fan, then slide, then turn; all four sliding together; the spring landing; the hover staying out of step between cards.
 * - Do not let a framework re-render the cards while the effect runs; it writes transforms to them directly.
 *
 * Porting
 * - Mount once after the element is in the DOM; call fx.destroy() on unmount. Render an empty container.
 * - It scrolls its own virtual track, not the page. To bind to page scroll, drive the target from your own scroll value.
 *
 * Accessibility and reduced motion
 * - The board is a focusable group with a focus ring; faces are aria-hidden. Give real content its own accessible text.
 * - With reduced motion the four cards are shown face-up and flat: in one row on wide screens, in one column on narrow
 *   screens (viewport <= 812 px). No demo, no float.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, rate, dt) => mix(a, b, 1 - Math.exp(-rate * dt));
  const R = { clamp, damp };

  // ---- inlined from the shared runtime: lifecycle ----
  // One requestAnimationFrame loop that runs only while something moves; pauses when the tab is hidden, the element is
  // off screen or setPaused(true); follows prefers-reduced-motion live; re-measures on resize; destroy() removes every
  // listener and observer it added.
  function scope(element, controls, options) {
    options = options || {};
    element.dataset.preview = String(options.preview === true);
    const defaults = Object.fromEntries(controls.map((control) => [control.key, control.default]));
    let params = Object.assign({}, defaults, options.params || {});
    let paused = false,
      destroyed = false,
      visible = true,
      reducedOverride = null;
    let raf = 0,
      last = 0,
      time = 0,
      frameCount = 0,
      draw = () => false,
      ticking = false;
    let width = 1,
      height = 1,
      active = true;
    const cleanup = [],
      hooks = new Map();
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const reduced = () => (reducedOverride === null ? preference.matches : reducedOverride);
    const emit = (type, value) => {
      (hooks.get(type) || []).forEach((fn) => fn(value));
    };
    function listen(target, type, fn, listenerOptions) {
      target.addEventListener(type, fn, listenerOptions);
      cleanup.push(() => target.removeEventListener(type, fn, listenerOptions));
      return fn;
    }
    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    }
    function allowed() {
      return !destroyed && !paused && visible && !document.hidden && !reduced();
    }
    function tick(now) {
      raf = 0;
      if (!allowed()) return;
      const dt = last ? Math.min(0.05, Math.max(0, (now - last) / 1000)) : 0;
      last = now;
      time += dt;
      frameCount++;
      // A wake() from inside draw (directly or via measure/setParams/replay) books the next frame itself;
      // it must not reset `last` (the loop never went idle) and the line below must not book a second one.
      ticking = true;
      try {
        active = draw({ dt, time, width, height, params, reduced: false }) !== false;
      } finally {
        ticking = false;
      }
      if (active && allowed() && !raf) raf = requestAnimationFrame(tick);
    }
    function wake() {
      if (allowed() && !raf) {
        if (!ticking) last = 0;
        raf = requestAnimationFrame(tick);
      }
    }
    function paint() {
      if (destroyed) return;
      active = draw({ dt: 0, time, width, height, params, reduced: reduced() }) !== false;
    }
    function measure() {
      if (destroyed) return;
      width = Math.max(1, element.clientWidth);
      height = Math.max(1, element.clientHeight);
      emit('resize', { width, height });
      paint();
      if (active) wake();
    }
    function syncMotion() {
      stop();
      element.dataset.reduced = String(reduced());
      emit('motion', reduced());
      paint();
      if (active) wake();
    }
    const api = {
      element,
      defaults,
      listen,
      get params() {
        return params;
      },
      get time() {
        return time;
      },
      get width() {
        return width;
      },
      get height() {
        return height;
      },
      get paused() {
        return paused;
      },
      get reduced() {
        return reduced();
      },
      get destroyed() {
        return destroyed;
      },
      get preview() {
        return options.preview === true;
      },
      on(type, fn) {
        if (!hooks.has(type)) hooks.set(type, []);
        hooks.get(type).push(fn);
        return fn;
      },
      cleanup(fn) {
        cleanup.push(fn);
        return fn;
      },
      frame(fn) {
        draw = fn;
        measure();
        wake();
      },
      wake,
      paint,
      measure,
      setParams(next) {
        if (destroyed) return;
        const updated = Object.assign({}, params);
        controls.forEach((control) => {
          if (!Object.hasOwn(next || {}, control.key)) return;
          let value = next[control.key];
          if (control.type === 'range')
            value = Number.isFinite(+value) ? clamp(+value, control.min, control.max) : control.default;
          else if (control.type === 'color')
            value = /^#[a-f0-9]{6}$/i.test(String(value)) ? String(value) : control.default;
          else if (control.type === 'toggle') value = !!value;
          else if (control.type === 'select' && !control.options.some((option) => option.value === value))
            value = control.default;
          updated[control.key] = value;
        });
        params = updated;
        emit('params', params);
        paint();
        if (active) wake();
      },
      setPaused(value) {
        if (destroyed) return;
        paused = !!value;
        element.dataset.paused = String(paused);
        stop();
        emit('pause', paused);
        if (!paused) {
          paint();
          if (active) wake();
        }
      },
      setReduced(value) {
        if (destroyed) return;
        reducedOverride = value == null ? null : !!value;
        syncMotion();
      },
      replay() {
        if (destroyed) return;
        stop();
        time = 0;
        emit('replay');
        paint();
        if (active) wake();
      },
      reset() {
        api.setParams(defaults);
        api.replay();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        stop();
        try {
          emit('destroy');
        } finally {
          cleanup
            .splice(0)
            .reverse()
            .forEach((fn) => {
              try {
                fn();
              } catch {}
            });
          hooks.clear();
          element.dataset.destroyed = 'true';
        }
      },
      status() {
        return {
          time,
          raf,
          frameCount,
          width,
          height,
          paused,
          destroyed,
          visible,
          reduced: reduced(),
          listeners: cleanup.length,
          params: Object.assign({}, params),
        };
      },
    };
    listen(preference, 'change', syncMotion);
    listen(document, 'visibilitychange', () => {
      stop();
      emit('visibility', !document.hidden);
      if (!document.hidden) wake();
    });
    listen(window, 'pageshow', (event) => {
      if (event.persisted) {
        measure();
        wake();
      }
    });
    listen(window, 'pagehide', (event) => {
      if (event.persisted) stop();
      else api.destroy();
    });
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    cleanup.push(() => resize.disconnect());
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      stop();
      emit('visibility', visible);
      if (visible) wake();
    });
    intersection.observe(options.visibilityTarget || element);
    cleanup.push(() => intersection.disconnect());
    element.dataset.reduced = String(reduced());
    width = Math.max(1, element.clientWidth);
    height = Math.max(1, element.clientHeight);
    return api;
  }

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

  const CONTROLS = [
    { key: 'fanTilt', type: 'range', default: 7, min: 0, max: 20, step: 1 },
    { key: 'flipStagger', type: 'range', default: 6, min: 0, max: 12, step: 1 },
    { key: 'bob', type: 'range', default: 12, min: 0, max: 24, step: 1 },
  ];

  // ---- the effect ----
  const N = 4;
  const SERVICES = [
    ['Strategy', 'Find the angle'],
    ['Design', 'Shape the look'],
    ['Build', 'Make it real'],
    ['Launch', 'Ship and grow'],
  ];
  const GLYPHS = [
    '<circle cx="50" cy="50" r="34"/>',
    '<path d="M50 16v68M16 50h68"/>',
    '<rect x="20" y="20" width="60" height="60"/>',
    '<path d="M24 24l52 52M76 24L24 76"/>',
  ];
  const glyph = (i) =>
    '<svg class="deal-glyph" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" aria-hidden="true">' +
    GLYPHS[i] +
    '</svg>';
  const BACK =
    '<svg class="deal-back-mark" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="20" cy="20" r="17"/><circle cx="20" cy="20" r="10.5"/><circle cx="20" cy="20" r="4" fill="currentColor" stroke="none"/></svg>';
  function defaultFront(i) {
    const s = SERVICES[i];
    return (
      '<div class="deal-front"><div class="deal-art"' +
      (i === 1 ? ' data-accent' : '') +
      '>' +
      glyph(i) +
      '</div><span class="deal-name">' +
      s[0] +
      '</span><span class="deal-line">' +
      s[1] +
      '</span></div>'
    );
  }
  function defaultBack() {
    return '<div class="deal-back">' + BACK + '</div>';
  }
  const fitN = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
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
  const OUT = cubicBezier(0.22, 1, 0.36, 1),
    SPRING = cubicBezier(0.28, 1.3, 0.36, 1),
    GLIDE = cubicBezier(0.33, 0.55, 0.2, 1);
  const turn = (f) => 180 * (1 - SPRING(f * f));
  const lift = (f) => {
    const k = Math.sin(Math.PI * f);
    return k * k;
  };
  const fanStep = (p) => {
    const d = p - 1.5;
    return Math.sign(d) * Math.pow(Math.abs(d), 1.1);
  };
  function rowPose(p, u, W, cw, par) {
    const pile = (W - cw) / 2,
      n = fitN(u, 0.13, 0.52),
      open = u < 0.3 ? OUT(fitN(u, 0.04, 0.2)) : 1 - GLIDE(fitN(u, 0.3, 0.62)),
      s = par.flipStagger / 100;
    return {
      x: pile + ((p * (W - cw)) / 3 - pile) * OUT(n),
      rz: fanStep(p) * par.fanTilt * open,
      f: fitN(u, 0.42 + p * s, 0.97 - (3 - p) * s),
      ry: turn,
    };
  }
  const PHASE = [0, 2.1, 4, 5.3];
  const hover = (p, time, bob) => {
    const k = PHASE[p];
    return { y: bob * 0.9 * (0.62 * Math.sin(time * 2.6 + k) + 0.38 * Math.sin(time * 4.1 + k * 1.7)), sway: 0 };
  };
  const hoverEnv = (u) => {
    const a = fitN(u, 0.05, 0.18),
      b = fitN(u, 0.8, 0.98);
    return a * a * (3 - 2 * a) * (1 - b * b * (3 - 2 * b));
  };
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    const opt = options.card || {},
      front = opt.front || defaultFront,
      back = opt.back || defaultBack,
      hasHand = !!opt.pointer,
      live = !!opt.interactive || !options.card;
    element.classList.add('deal-stage');
    element.innerHTML =
      '<div class="deal-wrap" aria-hidden="true">' +
      Array.from(
        { length: N },
        (_, i) =>
          '<div class="deal-card"><div class="deal-face deal-face-front">' +
          front(i) +
          '</div><div class="deal-face deal-face-back">' +
          back(i) +
          '</div></div>',
      ).join('') +
      '</div>';
    const wrap = element.querySelector('.deal-wrap'),
      cards = [...element.querySelectorAll('.deal-card')];
    const FOLLOW = 0.22,
      RESTORE = 0.5;
    let progress = 0,
      target = 0,
      top = 0,
      extent = 1,
      handOff = !hasHand,
      handTime = 0,
      handSent = 0,
      drag = null,
      restoring = null;
    const isNarrow = opt.narrow || (() => innerWidth <= 812);
    let narrow = false,
      ch = 0,
      step = 0,
      y0 = 0;
    function layout() {
      narrow = !!isNarrow();
      element.classList.toggle('deal-narrow', narrow);
      if (narrow) {
        const w = wrap.clientWidth;
        ch = Math.min(w * 0.68, api.height * 0.5);
        const gap = Math.max(20, ch * 0.16);
        step = ch + gap;
        y0 = api.height - ch * 0.3;
        cards.forEach((c) => {
          c.style.height = ch + 'px';
        });
        extent = Math.max(1, y0 + 3 * step + ch - api.height + gap);
      } else {
        cards.forEach((c) => {
          c.style.height = '';
        });
        extent = api.height * 3.1;
      }
      top = target * extent;
    }
    api.on('resize', layout);
    function set(v) {
      top = R.clamp(v, 0, extent);
      target = top / extent;
      api.wake();
      if (api.reduced) api.paint();
    }
    function take() {
      if (handOff) return;
      handOff = true;
      if (opt.pointer) opt.pointer({ x: 0, y: 0, opacity: 0, wheel: false });
    }
    function nudge(d) {
      const was = top;
      set(top + d);
      if (top !== was) {
        restoring = null;
        if (opt.touched) opt.touched();
      }
      return top - was;
    }
    function hand(dt) {
      const L = 8;
      if (opt.once && handTime + dt >= 5) {
        take();
        return;
      }
      const prev = handTime;
      handTime += dt;
      if (Math.floor(prev / L) !== Math.floor(handTime / L)) {
        handSent = Math.floor(handTime / L) * L;
        set(0);
      }
      for (; handSent + 1 / 60 <= handTime; handSent += 1 / 60) {
        const t = (handSent + 1 / 60) % L;
        if (t >= 0.5 && t < 4.3) set(top + extent / (3.8 * 60));
        else if (t >= 5 && t < 6.6) set(top - extent / (1.6 * 60));
      }
      const t = handTime % L,
        e = (u) => (u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u)),
        o = t < 0.4 ? e(t / 0.3) : t > 6.8 ? 1 - e((t - 6.8) / 0.4) : 1;
      const at = opt.handAt ? opt.handAt() : [api.width * 0.5 + 60, api.height * 0.5 + 40];
      opt.pointer({ x: at[0], y: at[1], opacity: o, wheel: (t >= 0.4 && t < 4.4) || (t >= 4.9 && t < 6.7) });
    }
    if (live) {
      const gap = opt.wheelLatch || !options.card ? 250 : 0,
        push = opt.endPush === true ? 100 : opt.endPush || 0;
      let wheelAt = -1e9,
        held = false,
        pushed = 0,
        pushDir = 0,
        pushAt = -1e9;
      api.listen(
        element,
        'wheel',
        (ev) => {
          if (ev.ctrlKey || api.paused) return;
          const d = ev.deltaY * (ev.deltaMode === 1 ? 32 : ev.deltaMode === 2 ? api.height : 1);
          if (!d) return;
          const now = performance.now();
          if (now - wheelAt > gap) held = false;
          wheelAt = now;
          if ((d < 0 && top <= 0) || (d > 0 && top >= extent)) {
            if (gap && held) {
              ev.preventDefault();
              return;
            }
            if (push) {
              if (Math.sign(d) !== pushDir || now - pushAt > 1200) pushed = 0;
              pushDir = Math.sign(d);
              pushAt = now;
              if (Math.abs(progress - target) > 0.01) {
                pushed = 0;
                ev.preventDefault();
                return;
              }
              if (pushed < push) {
                pushed += Math.abs(d);
                ev.preventDefault();
                return;
              }
            }
            return;
          }
          held = true;
          pushed = 0;
          ev.preventDefault();
          take();
          nudge(d);
        },
        { passive: false },
      );
      const release = () => {
        if (!drag) return;
        const pid = drag.id;
        drag = null;
        element.classList.remove('deal-dragging');
        if (element.hasPointerCapture(pid)) element.releasePointerCapture(pid);
      };
      api.listen(element, 'pointerdown', (ev) => {
        if (ev.button !== 0 || api.paused) return;
        take();
        release();
        drag = { id: ev.pointerId, y: ev.clientY, touch: ev.pointerType !== 'mouse' };
        element.setPointerCapture(ev.pointerId);
        element.classList.add('deal-dragging');
      });
      api.listen(element, 'pointermove', (ev) => {
        if (!drag || ev.pointerId !== drag.id || api.paused) return;
        const dy = drag.y - ev.clientY;
        drag.y = ev.clientY;
        if (!dy) return;
        const k = extent / (1.6 * api.height),
          left = dy * k - nudge(dy * k);
        if (drag.touch && Math.abs(left) > 0.5) window.scrollBy(0, left / k);
      });
      api.listen(element, 'pointerup', release);
      api.listen(element, 'pointercancel', release);
      api.listen(element, 'lostpointercapture', release);
      api.listen(element, 'keydown', (ev) => {
        const k = ev.key;
        if (api.paused || ev.altKey || ev.ctrlKey || ev.metaKey) return;
        let to;
        if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown') to = top + extent / 8;
        else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') to = top - extent / 8;
        else if (k === 'Home') to = 0;
        else if (k === 'End') to = extent;
        else return;
        to = R.clamp(to, 0, extent);
        if (Math.abs(to - top) < 0.5) return;
        ev.preventDefault();
        take();
        nudge(to - top);
      });
      api.on('destroy', release);
    }
    api.restore = () => {
      take();
      if (api.reduced) {
        progress = target = 1;
        top = extent;
        api.paint();
        return;
      }
      restoring = { t: 0, from: progress };
      top = 0;
      target = 0;
      api.wake();
    };
    api.on('motion', (reduced) => {
      if (reduced) {
        take();
        progress = target = 1;
        top = extent;
      } else {
        progress = target = top = 0;
      }
    });
    api.on('replay', () => {
      progress = target = top = 0;
      handTime = handSent = 0;
      restoring = null;
      handOff = !hasHand;
    });
    if (api.reduced) {
      handOff = true;
      progress = target = 1;
    }
    api.frame(({ dt, time, params, reduced }) => {
      if (hasHand && !handOff && !reduced) hand(dt);
      if (options.preview && !reduced) target = (1 - Math.cos(time * 0.5)) / 2;
      if (reduced) progress = 1;
      else if (restoring) {
        restoring.t += dt;
        const u = Math.min(1, restoring.t / RESTORE);
        progress = restoring.from * (1 - OUT(u));
        if (u >= 1) restoring = null;
      } else progress = R.damp(progress, target, 1 / FOLLOW, dt);
      if (narrow !== !!isNarrow()) layout();
      if (narrow) {
        const off = progress * extent,
          w = wrap.clientWidth,
          H = api.height;
        wrap.style.perspectiveOrigin = 'center 50%';
        cards.forEach((card, p) => {
          const q = (y0 + p * step - off + ch / 2) / H,
            end = Math.max(0.5, (y0 + p * step - extent + ch / 2) / H),
            side = p % 2 ? 1 : -1,
            rest = reduced ? 0 : 1 - OUT(fitN(q, end + 0.72, end + 0.1));
          const ry = reduced ? 0 : turn(fitN(q, end + 0.6, end));
          card.style.transform =
            'translate3d(' +
            (side * w * 0.07 * rest).toFixed(2) +
            'px,' +
            (y0 + p * step - off).toFixed(2) +
            'px,0) rotateZ(' +
            (side * params.fanTilt * 0.5 * rest).toFixed(3) +
            'deg) rotateY(' +
            ry.toFixed(2) +
            'deg)';
        });
        element.dataset.progress = progress.toFixed(4);
        return (
          !reduced && (options.preview || (hasHand && !handOff) || !!restoring || Math.abs(progress - target) > 0.0001)
        );
      }
      wrap.style.perspectiveOrigin = '';
      const W = wrap.clientWidth,
        cw = cards[0].offsetWidth,
        env = hoverEnv(progress);
      cards.forEach((card, p) => {
        if (reduced) {
          card.style.transform = 'translate3d(' + ((p * (W - cw)) / 3).toFixed(2) + 'px,0,0)';
          return;
        }
        const o = rowPose(p, progress, W, cw, params),
          h = hover(p, time, params.bob),
          y = h.y * env - params.bob * 0.5 * lift(o.f),
          rz = o.rz + h.sway * env;
        card.style.transform =
          'translate3d(' +
          o.x.toFixed(2) +
          'px,' +
          y.toFixed(2) +
          'px,0) rotateZ(' +
          rz.toFixed(3) +
          'deg) rotateY(' +
          o.ry(o.f).toFixed(2) +
          'deg)';
      });
      element.dataset.progress = progress.toFixed(4);
      const bobbing = params.bob > 0 && env > 0.002;
      return (
        !reduced &&
        (options.preview || (hasHand && !handOff) || !!restoring || Math.abs(progress - target) > 0.0001 || bobbing)
      );
    });
    layout();
    api.paint();
    const status = api.status;
    api.status = () => ({ ...status(), progress, target, extent });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountScrollCardDeal(element, options) {
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
    element.classList.add('scroll-card-deal');
    element.innerHTML =
      '<div class="fx-board" data-deal-board tabindex="0" role="group" aria-label="Four service cards. Scroll, drag, or use arrow keys."></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-deal-board]'),
      cursor = createCursor(stage),
      narrow = matchMedia('(max-width:760px)'),
      wide = matchMedia('(min-width:813px)');
    let hand = [0, 0];
    const inst = mount(board, {
      params: options.params,
      card: {
        interactive: true,
        once: true,
        endPush: true,
        wheelLatch: true,
        narrow: () => !wide.matches,
        handAt: () => hand,
        pointer: (s) => cursor.set(s),
      },
    });
    const wrap = board.querySelector('.deal-wrap'),
      cards = [...board.querySelectorAll('.deal-card')];
    function layout() {
      if (!wide.matches) {
        const W = stage.clientWidth,
          H = stage.clientHeight,
          w = Math.min(W - 48, 420);
        Object.assign(wrap.style, { left: (W - w) / 2 + 'px', top: '0px', width: w + 'px', height: H + 'px' });
        board.style.setProperty('--fx-k', (w / 260).toFixed(4));
        hand = [W / 2 + w * 0.2, H * 0.62];
        inst.measure();
        return;
      }
      const W = stage.clientWidth,
        H = stage.clientHeight,
        pad = narrow.matches ? 16 : 40,
        bob = 24;
      let w = Math.min(W - pad * 2, (H - 2 * bob - pad * 2) / 1.4 / 0.225, 980),
        top = null;
      const Z = panelZone(stage),
        R = Z.right + 16;
      if (!narrow.matches && (W - w) / 2 < R) {
        if (W - 2 * R >= w * 0.85) w = W - 2 * R;
        else {
          top = Math.max((H - w * 0.225 * 1.4) / 2, Z.bottom + 24 + bob);
          w = Math.min(w, (H - top - bob - pad) / 1.4 / 0.225);
        }
      }
      const cw = w * 0.225,
        h = cw * 1.4,
        left = (W - w) / 2;
      if (top === null) top = (H - h) / 2;
      Object.assign(wrap.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
      cards.forEach((c) => (c.style.width = cw + 'px'));
      inst.measure();
      board.style.setProperty('--fx-k', (cw / 150).toFixed(4));
      hand = [left + w * 0.5 + cw * 0.3, top + h * 0.62];
    }
    layout();
    const observer0 = new ResizeObserver(layout);
    observer0.observe(stage);

    inst.on('destroy', () => {
      observer0.disconnect();
      cursor.destroy();
    });
    if (options.reducedMotion != null) inst.setReduced(options.reducedMotion);
    return {
      get params() {
        return Object.assign({}, inst.params);
      },
      setParams: inst.setParams,
      setPaused: inst.setPaused,
      reset() {
        inst.setParams(inst.defaults);
        if (inst.restore) inst.restore();
        else inst.replay();
      },
      setReducedMotion: inst.setReduced,
      destroy() {
        if (mounted.done) return;
        inst.destroy();
        mounted.restore();
      },
    };
  }
  global.mountScrollCardDeal = mountScrollCardDeal;
  if (typeof module === 'object' && module.exports) module.exports = mountScrollCardDeal;
})(typeof window !== 'undefined' ? window : this);
