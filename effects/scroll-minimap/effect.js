/*
 * Scroll Minimap
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A long page scrolls in a window; beside it a column of small copies of every block of the page (real copies,
 * scaled down). A 1 px frame over the column marks what the window shows right now. Scroll and the frame slides
 * down and grows or shrinks with how much of the blocks is in view; click a copy to jump to that block. Good for
 * case studies, long articles, docs and long forms.
 *
 * How it moves (default values)
 * - Smooth scroll: input only moves a target T. The shown scroll S chases it every frame:
 *   S += (T - S) * (1 - exp(-dt / glide)), glide = 80 ms (about a lerp of 0.19 per 60 fps frame). Snaps within 0.05 px.
 * - The frame maps S into the column, then chases that with a second, shorter damping (frameLag = 40 ms).
 * - Mapping is piecewise linear: each block maps onto its copy (scale k = copy width / page width), each gap between
 *   blocks onto the 8 px gap in the column, the page's top and bottom padding onto the 6 px the frame sticks out.
 *   Frame top = map(S), bottom = map(S + window height); frame width = copy width + 12 px.
 * - Click a copy: T = that block's top minus one gap (first block: 0), same glide.
 * - If the column would be taller than 92 % of the window, the copy width shrinks to fit.
 * - Wheel (line mode x 16, page mode x window height). At either end, a wheel gesture that already moved the page
 *   keeps being swallowed (events < 250 ms apart), so trackpad inertia does not scroll the host page.
 * - Demo, once on load (8 s): a cursor scrolls three notches, clicks the second-to-last copy, then the first.
 *   Any real press, move, wheel or key ends it for good.
 *
 * Options
 *   params.glide       0..300, default 80     ms, page follow time constant (0 = instant)
 *   params.frameLag    0..200, default 40     ms, extra frame follow time constant
 *   params.thumbWidth  32..96, default 56     px, copy width (shrinks automatically to fit)
 *
 * API
 *   const fx = mountScrollMinimap(element);
 *   fx.setParams({glide: 120}); fx.setPaused(bool); fx.reset(); fx.setReducedMotion(bool); fx.destroy();
 *
 * Safe to change
 * - The blocks in SECTIONS (any markup; copies are made from it), colours, fonts, radii via effect.css.
 *
 * Do not change (the feel breaks)
 * - The frame must read the shown scroll S, not the target T, or it jumps ahead of the page.
 * - Keep gaps compressed in the map (piecewise mapping); a plain proportional map loses the changing frame height.
 *
 * Porting
 * - Mount once on a sized element after it is in the DOM; destroy on unmount. The effect owns its children.
 *
 * Accessibility and reduced motion
 * - The window is a focusable region (arrows, Page Up / Down, Space, Home, End). Copies are buttons labelled
 *   "Go to <block>". Touch drag scrolls the page. With reduced motion everything jumps, no cursor.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const R = { clamp, smooth, mix };

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
    { key: 'glide', type: 'range', default: 80, min: 0, max: 300, step: 10 },
    { key: 'frameLag', type: 'range', default: 40, min: 0, max: 200, step: 10 },
    { key: 'thumbWidth', type: 'range', default: 56, min: 32, max: 96, step: 2 },
  ];

  // ---- the effect ----
  const TG = 8,
    FP = 6,
    LOOP = 8,
    WHEEL_GAP = 250,
    RESTORE = 0.5;
  const GLYPHS = [
    '<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M50 16v68M16 50h68" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
    '<rect x="20" y="20" width="60" height="60" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M24 24l52 52M76 24L24 76" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
  ];
  const media = (tone, glyph, accent) =>
    '<div class="ck-media"' +
    (tone ? ' data-tone="' + tone + '"' : '') +
    (accent ? ' data-accent' : '') +
    ' aria-hidden="true"><svg class="ck-glyph" viewBox="0 0 100 100">' +
    GLYPHS[glyph % 4] +
    '</svg></div>';
  const SECTIONS = [
    [
      'Overview',
      '<div class="ck-panel mm-hero">' +
        media(2, 0) +
        '<div class="mm-row"><span class="ck-text" data-strong>Field Notes</span><span class="ck-pill" data-size="sm">Visit site</span></div></div>',
    ],
    [
      'The brief',
      '<div class="ck-panel mm-copy"><p class="ck-text" data-strong>The brief</p><p class="ck-text">A reading room that wanted to feel as calm online as it does on a Sunday morning.</p></div>',
    ],
    ['Spreads', '<div class="mm-grid" data-cols="2">' + media(1, 1) + media(2, 2) + '</div>'],
    ['Signage', '<div class="mm-wide">' + media(0, 0, true) + '</div>'],
    [
      'Quote',
      '<div class="ck-panel mm-copy"><p class="ck-text" data-strong>“Quiet, sturdy and easy to read.”</p></div>',
    ],
    ['Details', '<div class="mm-grid" data-cols="3">' + media(2, 3) + media(1, 2) + media(2, 1) + '</div>'],
    ['Interior', '<div class="mm-tall">' + media(2, 3) + '</div>'],
    [
      'Next project',
      '<div class="ck-panel mm-next"><span class="ck-text" data-strong>Next: Salt Flats</span><span class="ck-pill ck-solid" data-size="sm">View</span></div>',
    ],
  ];
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
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    const card = options.card || null,
      live = !!(card && card.interactive),
      still = !!card && !live;
    element.classList.add('mm-stage');
    if (card) element.dataset.card = live ? 'live' : 'auto';
    const off = still ? ' tabindex="-1"' : '';
    element.innerHTML =
      '<div class="mm-view" role="region" aria-label="Sample case study"' +
      (still ? '' : ' tabindex="0"') +
      '><div class="mm-doc">' +
      SECTIONS.map((s, i) => '<section class="mm-sec" data-i="' + i + '">' + s[1] + '</section>').join('') +
      '</div></div>' +
      '<nav class="mm-map" aria-label="Page minimap">' +
      SECTIONS.map(
        (s, i) =>
          '<button type="button" class="mm-thumb" data-i="' +
          i +
          '" aria-label="Go to ' +
          s[0] +
          '"' +
          off +
          '></button>',
      ).join('') +
      '<i class="mm-frame" aria-hidden="true"></i></nav>' +
      (card ? '' : '<div class="mm-hand" aria-hidden="true"></div>');
    const q = (s) => element.querySelector(s),
      view = q('.mm-view'),
      doc = q('.mm-doc'),
      map = q('.mm-map'),
      frameEl = q('.mm-frame'),
      hand = q('.mm-hand');
    const secs = [...element.querySelectorAll('.mm-sec')],
      thumbs = [...element.querySelectorAll('.mm-thumb')];
    thumbs.forEach((b, i) => {
      const c = secs[i].cloneNode(true);
      c.className = 'mm-sec mm-mini';
      c.removeAttribute('data-i');
      c.setAttribute('aria-hidden', 'true');
      c.setAttribute('inert', '');
      b.appendChild(c);
    });
    const L = {
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      C: 1,
      tw: 1,
      k: 1,
      gap: 20,
      tops: [],
      hs: [],
      ty: [],
      th: [],
      D: [0, 1],
      M: [0, 1],
      max: 0,
      mx: 0,
      my: 0,
      mh: 0,
    };
    function box(W, H) {
      if (card && card.box) return card.box(W, H);
      if (card) return { x: 0, y: 0, w: W, h: H };
      const w = Math.min(W * 0.72, 720),
        h = H * 0.86;
      return { x: (W - w) / 2, y: (H - h) / 2, w, h };
    }
    const set = (k, v) => element.style.setProperty(k, v);
    function layout() {
      const W = element.clientWidth || 1,
        H = element.clientHeight || 1,
        b = box(W, H),
        compact = b.w < 420;
      const gap = compact ? 12 : 20,
        mg = compact ? 20 : 40,
        maxH = b.h * 0.92;
      set('--mm-gap', gap + 'px');
      set('--mm-in', (compact ? 8 : 12) + 'px');
      let tw = api.params.thumbWidth,
        C = 1,
        hs = [],
        sum = 1;
      const measure = () => {
        C = Math.max(120, b.w - mg - tw - 2 * FP);
        set('--mm-c', C.toFixed(2) + 'px');
        hs = secs.map((s) => s.offsetHeight);
        sum = hs.reduce((a, c) => a + c, 0) || 1;
      };
      for (let it = 0; it < 5; it++) {
        measure();
        if ((sum * tw) / C + TG * (hs.length - 1) + 2 * FP <= maxH + 0.5) break;
        tw = Math.max(16, Math.floor((((maxH - TG * (hs.length - 1) - 2 * FP) * C) / sum) * 100) / 100);
      }
      const k = tw / C,
        tops = secs.map((s) => s.offsetTop),
        docH = doc.offsetHeight;
      const th = hs.map((h) => h * k),
        ty = [];
      let y = FP;
      th.forEach((h, i) => {
        ty[i] = y;
        y += h + TG;
      });
      const mh = y - TG + FP;
      const D = [0],
        M = [0];
      tops.forEach((t, i) => {
        D.push(t, t + hs[i]);
        M.push(ty[i], ty[i] + th[i]);
      });
      D.push(Math.max(docH, D[D.length - 1] + 1));
      M.push(mh);
      Object.assign(L, {
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        C,
        tw,
        k,
        gap,
        tops,
        hs,
        ty,
        th,
        D,
        M,
        max: Math.max(0, docH - b.h),
        mx: b.x + C + mg,
        my: b.y + (b.h - mh) / 2,
        mh,
      });
      set('--mm-x', b.x.toFixed(2) + 'px');
      set('--mm-y', b.y.toFixed(2) + 'px');
      set('--mm-h', b.h.toFixed(2) + 'px');
      set('--mm-w', tw + 'px');
      set('--mm-k', k.toFixed(5));
      set('--mm-mx', L.mx.toFixed(2) + 'px');
      set('--mm-my', L.my.toFixed(2) + 'px');
      set('--mm-mh', mh.toFixed(2) + 'px');
      thumbs.forEach((el, i) => {
        el.style.top = ty[i].toFixed(2) + 'px';
        el.style.height = th[i].toFixed(2) + 'px';
      });
      T = R.clamp(T, 0, L.max);
      S = R.clamp(S, 0, L.max);
      if (!laid) {
        laid = true;
        snapFrame();
      }
      render();
    }
    function mapY(y) {
      const D = L.D,
        M = L.M;
      if (y <= D[0]) return M[0];
      for (let i = 1; i < D.length; i++)
        if (y <= D[i]) return M[i - 1] + ((M[i] - M[i - 1]) * (y - D[i - 1])) / (D[i] - D[i - 1] || 1);
      return M[M.length - 1];
    }
    let T = 0,
      S = 0,
      ft = 0,
      fb = 0,
      laid = false,
      restoring = null;
    function snapFrame() {
      ft = mapY(S);
      fb = mapY(S + L.h);
    }
    function render() {
      doc.style.transform = 'translate3d(0,' + (-S).toFixed(2) + 'px,0)';
      frameEl.style.transform = 'translate3d(0,' + ft.toFixed(2) + 'px,0)';
      frameEl.style.height = Math.max(2, fb - ft).toFixed(2) + 'px';
    }
    const chase = (a, b, tau, dt) =>
      tau > 0 ? (Math.abs(b - a) < 0.05 ? b : a + (b - a) * (1 - Math.exp(-dt / tau))) : b;
    function step(dt) {
      if (restoring) {
        restoring.t += dt;
        const u = Math.min(1, restoring.t / RESTORE);
        S = T = restoring.from * (1 - outEase(u));
        snapFrame();
        render();
        if (u >= 1) restoring = null;
        return !!restoring;
      }
      const p = api.params;
      S = chase(S, T, p.glide / 1000, dt);
      const a = mapY(S),
        b = mapY(S + L.h),
        fl = p.frameLag / 1000;
      ft = chase(ft, a, fl, dt);
      fb = chase(fb, b, fl, dt);
      render();
      return S !== T || ft !== a || fb !== b;
    }
    function scrollTo(v) {
      const n = R.clamp(v, 0, L.max);
      if (Math.abs(n - T) < 0.01) return false;
      restoring = null;
      T = n;
      if (api.reduced) {
        S = T;
        snapFrame();
        render();
      } else api.wake();
      return true;
    }
    const go = (i) => scrollTo(i <= 0 ? 0 : L.tops[i] - L.gap);
    const takes = !still;
    const touch = () => {
      if (live && card.touched) card.touched();
    };
    const gap = live && card.wheelLatch ? (typeof card.wheelLatch === 'number' ? card.wheelLatch : WHEEL_GAP) : 0;
    let wheelAt = -Infinity,
      held = false;
    if (takes) {
      api.listen(
        element,
        'wheel',
        (e) => {
          if (e.ctrlKey || api.paused) return;
          takeOver();
          const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? L.h : 1);
          if (gap && dy) {
            const now = performance.now();
            if (now - wheelAt > gap) held = false;
            wheelAt = now;
          }
          if (!dy || !scrollTo(T + dy)) {
            if (!live || (gap && dy && held)) e.preventDefault();
            return;
          }
          if (gap) held = true;
          e.preventDefault();
          touch();
        },
        { passive: false },
      );
      thumbs.forEach((b, i) =>
        api.listen(b, 'click', () => {
          if (api.paused) return;
          takeOver();
          if (go(i)) touch();
        }),
      );
      api.listen(view, 'keydown', (e) => {
        if (api.paused) return;
        const k = e.key,
          h = L.h;
        const to = {
          ArrowDown: T + 48,
          ArrowUp: T - 48,
          PageDown: T + h * 0.9,
          PageUp: T - h * 0.9,
          ' ': T + (e.shiftKey ? -1 : 1) * h * 0.9,
          Home: 0,
          End: L.max,
        }[k];
        if (to === undefined) return;
        takeOver();
        if (scrollTo(to)) {
          e.preventDefault();
          touch();
        }
      });
      let drag = null;
      api.listen(view, 'pointerdown', (e) => {
        if (e.pointerType !== 'touch' || api.paused) return;
        takeOver();
        restoring = null;
        drag = { id: e.pointerId, y: e.clientY, t: T };
        try {
          view.setPointerCapture(e.pointerId);
        } catch {}
      });
      api.listen(view, 'pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        if (scrollTo(drag.t - (e.clientY - drag.y))) {
          S = T;
          touch();
        }
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) =>
        api.listen(view, t, (e) => {
          if (drag && e.pointerId === drag.id) drag = null;
        }),
      );
      if (live) {
        api.listen(element, 'pointerdown', () => takeOver());
        api.listen(element, 'pointermove', (e) => {
          if (e.pointerType === 'mouse' && !e.movementX && !e.movementY) return;
          takeOver();
        });
        api.listen(element, 'keydown', () => takeOver());
      }
    }
    let cyc = -1,
      fired = {},
      handOff = false,
      downWas = false;
    function takeOver() {
      if (!live || handOff) return;
      handOff = true;
      if (card.pointer) card.pointer({ x: 0, y: 0, opacity: 0, down: false, wheel: false });
    }
    function handAt(time) {
      const c = Math.floor(time / LOOP),
        t = time % LOOP;
      if (c !== cyc) {
        cyc = c;
        fired = {};
      }
      const far = SECTIONS.length - 2,
        rest = { x: L.x + L.C * 0.62, y: L.y + L.h * 0.56 },
        tp = (i) => ({ x: L.mx + FP + L.tw * 0.5, y: L.my + L.ty[i] + L.th[i] * 0.5 });
      const pts = [
        [0, rest],
        [2.95, rest],
        [3.7, tp(far)],
        [4.0, tp(far)],
        [4.8, tp(0)],
        [5.6, tp(0)],
        [6.5, rest],
        [LOOP, rest],
      ];
      let a = pts[0],
        z = pts[1];
      for (let i = 0; i < pts.length - 1; i++)
        if (t >= pts[i][0] && t <= pts[i + 1][0]) {
          a = pts[i];
          z = pts[i + 1];
          break;
        }
      const u = z[0] === a[0] ? 1 : R.smooth((t - a[0]) / (z[0] - a[0])),
        x = R.mix(a[1].x, z[1].x, u),
        y = R.mix(a[1].y, z[1].y, u);
      const o = Math.min(R.smooth(t / 0.3), R.smooth((7.8 - t) / 0.5));
      const wheel = t >= 0.45 && t < 2.85,
        down = (t >= 3.82 && t < 3.97) || (t >= 5.32 && t < 5.47);
      const once = (k, at, fn) => {
        if (t >= at && !fired[k]) {
          fired[k] = true;
          fn();
        }
      };
      once('w1', 0.6, () => scrollTo(T + L.h * 0.7));
      once('w2', 1.45, () => scrollTo(T + L.h * 0.7));
      once('w3', 2.3, () => scrollTo(T + L.h * 0.7));
      once('c1', 3.9, () => go(far));
      once('c2', 5.4, () => go(0));
      if (card) {
        if (card.pointer) card.pointer({ x, y, opacity: o, down, wheel });
      } else if (hand) {
        hand.style.opacity = o.toFixed(3);
        hand.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
        if (down !== downWas) {
          downWas = down;
          hand.classList.toggle('is-down', down);
        }
      }
    }
    if (live) {
      api.restore = () => {
        takeOver();
        if (T === 0 && S === 0 && !restoring) return;
        if (api.reduced) {
          restoring = null;
          T = S = 0;
          snapFrame();
          render();
          return;
        }
        restoring = { t: 0, from: S };
        api.wake();
      };
    }
    api.on('resize', layout);
    api.on('params', () => {
      if (laid) layout();
    });
    api.on('replay', () => {
      restoring = null;
      T = S = 0;
      cyc = -1;
      snapFrame();
      render();
    });
    api.on('motion', (r) => {
      if (r) {
        restoring = null;
        S = T;
        snapFrame();
        render();
      }
    });
    if (document.fonts && document.fonts.ready)
      document.fonts.ready.then(() => {
        if (!api.destroyed) layout();
      });
    api.frame(({ dt, time, reduced }) => {
      if (reduced) {
        if (card && card.pointer) card.pointer({ x: 0, y: 0, opacity: 0, down: false, wheel: false });
        if (hand) hand.style.opacity = '0';
        S = T;
        snapFrame();
        render();
        return false;
      }
      if (live && !handOff && card.once && time >= LOOP) takeOver();
      const handing = !!options.preview && !(live && handOff);
      if (handing) handAt(time);
      const moving = step(dt);
      return handing || moving;
    });
    layout();
    const status = api.status;
    api.status = () => ({
      ...status(),
      scroll: S,
      target: T,
      max: L.max,
      frameTop: ft,
      frameHeight: fb - ft,
      thumbWidth: L.tw,
      handOff,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountScrollMinimap(element, options) {
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
    element.classList.add('scroll-minimap');
    element.innerHTML = '<div class="fx-board" data-mm-board></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-mm-board]'),
      cursor = createCursor(stage);
    const phone = matchMedia('(max-width: 760px)');
    function box(W, H) {
      if (phone.matches) return { x: 16, y: 0, w: W - 32, h: H };
      const want = Math.min(640, W - 64),
        left = Math.max((W - want) / 2, panelZone(stage).right + 24);
      return { x: left, y: 0, w: Math.min(want, W - 32 - left), h: H };
    }
    const inst = mount(board, {
      params: options.params,
      preview: true,
      card: { box, interactive: true, once: true, wheelLatch: true, pointer: cursor.set },
    });

    inst.on('destroy', () => {
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
  global.mountScrollMinimap = mountScrollMinimap;
  if (typeof module === 'object' && module.exports) module.exports = mountScrollMinimap;
})(typeof window !== 'undefined' ? window : this);
