/*
 * Scribble Ring
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Hover a word, an image or a button and a hand-drawn pen loop is scrawled around it; the loop keeps "boiling" like
 * a frame-by-frame animation and scribbles itself away when you leave. Good for highlighting a key phrase, a project
 * thumbnail or a call to action on an editorial or portfolio page.
 *
 * How it moves
 * - Any element with data-scribble is a target. The ring is one SVG layer over the whole stage with up to 3 filled
 *   paths (one per loop).
 * - Base ellipse around the target: rx = width / 2 x fit + 4, ry = height / 2 x fit + height x 0.12 + 4 px, where fit
 *   is data-scribble-fit (default 1.18; the image uses 1.3). data-scribble-shape="circle" makes it a circle.
 * - Each loop sits further out: offset = S x (0.048 + loop x 0.05), with S = max(average radius, 160 px).
 * - One loop is not closed: it runs params.sweep % of a full turn, rescaled by 1 +/- 15% per draw (never below 15%).
 *   Each hover picks a start angle per loop (loops a third to two thirds of a turn apart); every draw moves it by at
 *   most +/-0.6 rad, so the gap stays roughly in one place. The radius wobbles by +/-params.jitter % through 16
 *   random knots per full turn (Catmull-Rom between them) and coils in or out by -2%..+1.5% from start to end.
 * - The stroke is a filled outline S x width / 100 thick at its widest. The pen lands blunt (35% width, full after
 *   5% of the length) and lifts off thin (down to 8% over the last 16%), quarter-sine ramps at both ends.
 * - A target inside running text never inks over the lines above and below: all loops are squeezed vertically so
 *   the outermost one stays within line-height - 0.56em (at least 0.5em) of the word's centre.
 * - Stepped timing: nothing tweens. The ring changes only on ticks of 1000 / fps ms. Draw-in shows 35%, 65%, 88%
 *   of the loop (1 - (1 - k/4)^1.5) on three ticks, then full. While held, every tick re-randomises the whole shape
 *   (the "boil"). On leave it drops at once to the next shorter frame, steps down 88%, 65%, 35% and disappears on
 *   the following tick (300 ms at 10 fps). Coming back while it lifts climbs up again from where it is.
 * - Moving to another target restarts the draw-in there at once. If the target moves or resizes, the ellipse eases
 *   after it with factor 1 - exp(-lag x dt).
 * - Demo, once on load (8 s): a fake cursor visits the word, the image and the button in turn. The first real mouse
 *   move with actual movement, a press, or keyboard focus on a target ends it for good.
 *
 * Options
 *   params.fps     4..24, default 10      ticks per second for draw-in, boil and draw-out; lower = choppier, more hand-made
 *   params.jitter  0..8, default 3.2      radius wobble in %
 *   params.sweep   30..100, default 74    arc length of one loop, % of a full turn
 *   params.width   0.4..3, default 1.4    stroke thickness in % of S
 *   params.loops   1..3, default 2        number of loops
 *   params.lag     4..40, default 12      how fast the ring follows a moving target (per second)
 *   reducedMotion  true / false / null    force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountScribbleRing(element, {params: {...}, reducedMotion: null});
 *   fx.params                 copy of current params
 *   fx.setParams({loops: 3})  change params live (values are clamped to the ranges above)
 *   fx.setPaused(true|false)  freeze / resume; new hovers are ignored while paused
 *   fx.reset()                params back to defaults, demo ended, ring cleared
 *   fx.setReducedMotion(bool|null)
 *   fx.destroy()              removes listeners, observers, the SVG layer and the fake cursor
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountScribbleRing(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The content: the markup string in mountScribbleRing. Put data-scribble on anything that should get a ring;
 *   data-scribble-fit and data-scribble-shape tune the ellipse per target.
 * - The layout: the content is centred; place() scales it by min(1.45, height / 430) (never below 1) on stages 600 px
 *   and wider, and keeps it at 1 below that.
 * - Ring colour: .sc-layer path { fill } in effect.css (default ink #17181a).
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - Stepped ticks with no tweening, and re-randomising on every tick. Smooth stroke-dashoffset drawing looks like a
 *   progress ring, not a pen.
 * - The open sweep with a blunt start and a thin tail; a closed even-width ellipse loses the hand-drawn look.
 * - The 160 px minimum for S, which keeps small targets from getting a tiny, thin ring.
 * - Do not let a framework re-render the stage while a ring is shown; it measures targets with getBoundingClientRect
 *   and the SVG layer is appended by the effect.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountScribbleRing on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The ring layer is aria-hidden. Targets that are not links or buttons get tabindex="0"; keyboard focus
 *   (focus-visible) circles them, blur clears. The "View project" pill is a span with role="button"; Enter and Space
 *   activate it like a real button. A visually hidden polite live region (.sc-live) announces "Circled: <label>" when
 *   a ring is drawn and "<label> pressed." on keyboard activation.
 * - Touch: tap a target to circle it, tap it again or tap elsewhere to clear.
 * - With reduced motion: no demo cursor, no boil, no draw-in or draw-out; the full ring appears and disappears at once.
 *   Before the first real interaction the word target is shown circled.
 * - The loop sleeps when no ring is shown, and stops when the tab is hidden, the element is off screen or it is paused.
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
  function mark(index, className) {
    const names = ['ring', 'cross', 'square', 'x'];
    const name = names[Math.abs(Number(index) || 0) % names.length];
    const symbol = '';
    const inner =
      symbol.match(/<symbol[^>]*>([\s\S]*)<\/symbol>/)?.[1] ||
      '<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="8"/>';
    const css = String(className || '').replace(/[^a-z0-9 _-]/gi, '');
    return '<svg class="' + css + '" viewBox="0 0 100 100" aria-hidden="true">' + inner + '</svg>';
  }
  const R = { mark, smooth, mix };

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

  // ---- inlined from the shared card parts: a white card with a centred mark (used when WebGL is unavailable) ----
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
  function cardMedia(options) {
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

  const CONTROLS = [
    { key: 'fps', type: 'range', default: 10, min: 4, max: 24, step: 1 },
    { key: 'jitter', type: 'range', default: 3.2, min: 0, max: 8, step: 0.2 },
    { key: 'sweep', type: 'range', default: 74, min: 30, max: 100, step: 1 },
    { key: 'width', type: 'range', default: 1.4, min: 0.4, max: 3, step: 0.1 },
    { key: 'loops', type: 'range', default: 2, min: 1, max: 3, step: 1 },
    { key: 'lag', type: 'range', default: 12, min: 4, max: 40, step: 1 },
  ];

  // ---- the effect ----
  const SVG_NS = 'http://www.w3.org/2000/svg',
    TURN = Math.PI * 2;
  const LOOP = {
    margin: 0.048,
    spacing: 0.05,
    knots: 16,
    spread: 0.3,
    shortest: 0.15,
    drift: 0.6,
    coilLo: -0.02,
    coilHi: 0.015,
    segsPerTurn: 96,
    unitFloor: 160,
    most: 3,
  };
  const NIB = { land: 0.05, landWidth: 0.35, lift: 0.16, liftWidth: 0.08 };
  const DRAW_FRAMES = [1, 2, 3].map((k) => 1 - Math.pow(1 - k / 4, 1.5));
  function measure(host, el) {
    const hb = host.getBoundingClientRect(),
      b = el.getBoundingClientRect();
    const f = { x: b.left - hb.left + b.width / 2, y: b.top - hb.top + b.height / 2, rx: 0, ry: 0, cap: lineCap(el) };
    if (el.dataset.scribbleShape === 'circle') {
      f.rx = f.ry = Math.max(b.width, b.height) / 2;
    } else {
      const fit = +el.dataset.scribbleFit || 1.18;
      f.rx = (b.width * fit) / 2 + 4;
      f.ry = (b.height * fit) / 2 + b.height * 0.12 + 4;
    }
    return f;
  }
  function lineCap(el) {
    const parent = el.parentElement;
    if (!parent || !/^inline/.test(getComputedStyle(el).display)) return 0;
    const prose = [...parent.childNodes].some((n) => n !== el && n.nodeType === 3 && n.textContent.trim() !== '');
    if (!prose) return 0;
    const ps = getComputedStyle(parent),
      em = parseFloat(ps.fontSize) || 16,
      lh = parseFloat(ps.lineHeight) || em * 1.2;
    return Math.max(lh - em * 0.56, em * 0.5);
  }
  const unitOf = (f) => Math.max((f.rx + f.ry) / 2, LOOP.unitFloor);
  function pickStarts() {
    const a = [Math.random() * TURN];
    for (let i = 1; i < LOOP.most; i++) a.push(a[i - 1] + TURN * (1 / 3 + Math.random() / 3));
    return a;
  }
  function sketch(p, starts) {
    const count = Math.round(p.loops),
      wob = p.jitter / 100,
      out = [];
    for (let i = 0; i < count; i++) {
      const arc = Math.min(1, Math.max(LOOP.shortest, (p.sweep / 100) * (1 + (Math.random() - 0.5) * LOOP.spread)));
      const knots = new Float32Array(LOOP.knots + 4);
      for (let j = 0; j < knots.length; j++) knots[j] = 1 + (Math.random() * 2 - 1) * wob;
      out.push({
        start: starts[i] + (Math.random() * 2 - 1) * LOOP.drift,
        arc,
        knots,
        coil: LOOP.coilLo + Math.random() * (LOOP.coilHi - LOOP.coilLo),
      });
    }
    return out;
  }
  function spline(a, b, c, d, q) {
    return b + 0.5 * q * (c - a + q * (2 * a - 5 * b + 4 * c - d + q * (3 * (b - c) + d - a)));
  }
  function nib(t) {
    const land = NIB.landWidth + (1 - NIB.landWidth) * Math.sin((Math.min(1, t / NIB.land) * Math.PI) / 2);
    const lift = NIB.liftWidth + (1 - NIB.liftWidth) * Math.sin((Math.min(1, (1 - t) / NIB.lift) * Math.PI) / 2);
    return Math.min(land, lift);
  }
  function ribbon(f, i, loop, amount, p) {
    const S = unitOf(f),
      half = (S * p.width) / 200,
      gap = S * (LOOP.margin + i * LOOP.spacing),
      turns = loop.arc * amount;
    let squash = 1;
    if (f.cap) {
      const reach =
        (f.ry + S * (LOOP.margin + (Math.round(p.loops) - 1) * LOOP.spacing)) *
          (1 + (p.jitter / 100) * 1.15 + LOOP.coilHi) +
        half;
      if (reach > f.cap) squash = Math.max(0, f.cap - half) / (reach - half);
    }
    const ax = f.rx + gap * squash,
      ay = (f.ry + gap) * squash,
      segs = Math.max(12, Math.ceil(LOOP.segsPerTurn * turns)),
      K = loop.knots;
    const edgeA = [],
      edgeB = [];
    for (let j = 0; j <= segs; j++) {
      const t = j / segs,
        ang = loop.start + t * turns * TURN,
        u = t * turns * LOOP.knots,
        b = Math.min(Math.floor(u), LOOP.knots),
        q = u - b;
      const r = spline(K[b], K[b + 1], K[b + 2], K[b + 3], q) * (1 + loop.coil * t),
        w = half * nib(t);
      const cx = Math.cos(ang),
        sy = Math.sin(ang),
        px = f.x + cx * ax * r,
        py = f.y + sy * ay * r;
      edgeA.push((px + cx * w).toFixed(2) + ',' + (py + sy * w).toFixed(2));
      edgeB.push((px - cx * w).toFixed(2) + ',' + (py - sy * w).toFixed(2));
    }
    return 'M' + edgeA.join(' ') + ' L' + edgeB.reverse().join(' ') + 'Z';
  }
  function makePen(host, api) {
    const layer = document.createElementNS(SVG_NS, 'svg');
    layer.setAttribute('class', 'sc-layer');
    layer.setAttribute('aria-hidden', 'true');
    const strokes = [];
    for (let i = 0; i < LOOP.most; i++) strokes.push(layer.appendChild(document.createElementNS(SVG_NS, 'path')));
    host.appendChild(layer);
    api.cleanup(() => layer.remove());
    const pen = {
      phase: 'idle',
      target: null,
      want: null,
      frame: null,
      starts: null,
      loops: [],
      amount: 0,
      step: 0,
      queue: [],
      beatAt: 0,
    };
    function paint() {
      const p = api.params,
        on = pen.phase !== 'idle' && pen.target && pen.frame;
      strokes.forEach((el, i) => {
        if (on && i < pen.loops.length) el.setAttribute('d', ribbon(pen.frame, i, pen.loops[i], pen.amount, p));
        else el.removeAttribute('d');
      });
    }
    function redraw(amount) {
      pen.amount = amount;
      pen.loops = sketch(api.params, pen.starts);
      paint();
    }
    function track(dt, snap) {
      if (!pen.target) return false;
      const f = measure(host, pen.target);
      if (!pen.frame || snap) {
        pen.frame = f;
        return true;
      }
      const k = 1 - Math.exp(-api.params.lag * dt);
      let moved = false;
      pen.frame.cap = f.cap;
      for (const key of ['x', 'y', 'rx', 'ry']) {
        const d = (f[key] - pen.frame[key]) * k;
        if (Math.abs(d) > 0.01) moved = true;
        pen.frame[key] += d;
      }
      return moved;
    }
    function clear() {
      pen.phase = 'idle';
      pen.target = null;
      pen.queue = [];
      paint();
    }
    function climbFrom(now) {
      pen.step = DRAW_FRAMES.findIndex((v) => v > pen.amount + 1e-6);
      pen.beatAt = now;
      if (pen.step < 0) {
        pen.phase = 'boiling';
        redraw(1);
      } else {
        pen.phase = 'drawing';
        redraw(DRAW_FRAMES[pen.step]);
      }
    }
    function begin(el, now) {
      pen.target = el;
      pen.starts = pickStarts();
      pen.amount = 0;
      track(0, true);
      climbFrom(now);
    }
    function advance(now, dt, reduced) {
      const want = pen.want;
      if (reduced) {
        if (!want) {
          if (pen.phase !== 'idle') clear();
          return false;
        }
        if (pen.target !== want || pen.phase !== 'boiling') {
          pen.target = want;
          pen.starts = pickStarts();
          pen.phase = 'boiling';
          track(0, true);
          redraw(1);
        } else if (track(0, true)) paint();
        return false;
      }
      const beat = 1000 / api.params.fps;
      if (!want) {
        if (pen.phase === 'idle') return false;
        if (pen.phase !== 'lifting') {
          pen.phase = 'lifting';
          pen.beatAt = now;
          pen.queue = DRAW_FRAMES.filter((v) => v < pen.amount - 1e-6).reverse();
          if (pen.queue.length) redraw(pen.queue.shift());
          return true;
        }
        if (track(dt)) paint();
        if (now - pen.beatAt < beat) return true;
        pen.beatAt = now;
        if (!pen.queue.length) {
          clear();
          return false;
        }
        redraw(pen.queue.shift());
        return true;
      }
      if (pen.phase === 'idle' || pen.target !== want) {
        begin(want, now);
        return true;
      }
      if (pen.phase === 'lifting') {
        climbFrom(now);
        return true;
      }
      if (track(dt)) paint();
      if (now - pen.beatAt < beat) return true;
      pen.beatAt = now;
      if (pen.phase === 'drawing' && ++pen.step < DRAW_FRAMES.length) redraw(DRAW_FRAMES[pen.step]);
      else {
        pen.phase = 'boiling';
        redraw(1);
      }
      return true;
    }
    function resketch() {
      if (pen.phase !== 'idle' && pen.target) {
        pen.loops = sketch(api.params, pen.starts);
        paint();
      }
    }
    return { pen, advance, clear, resketch };
  }
  const PHASE_NAME = { idle: 'hidden', drawing: 'in', boiling: 'on', lifting: 'out' };
  function demoMarkup(R) {
    return (
      '<div class="sc-scene"><p class="sc-line">Circle the <span class="sc-word" data-scribble>one idea</span><br>worth a second look.</p>' +
      '<div class="sc-row"><div class="sc-media" data-scribble data-scribble-fit="1.3" role="img" aria-label="Placeholder image">' +
      R.mark(0, 'sc-glyph') +
      '</div>' +
      '<a href="#" class="sc-pill" data-scribble>View project</a></div></div>' +
      '<p class="cr-hint" data-cr-chrome>Hover a word, image, or button to circle it · On touch, tap to circle and tap again to clear</p><p class="cr-sr sc-live" aria-live="polite"></p><div class="sc-hand" aria-hidden="true"></div>'
    );
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('sc-host');
    if (getComputedStyle(element).position === 'static') element.style.position = 'relative';
    const card = options.card || null,
      handsOn = !!(card && card.interactive);
    element.innerHTML = card
      ? card.markup || '<div class="sc-card"><a href="#" class="sc-pill" data-scribble>View project</a></div>'
      : demoMarkup(R);
    if (!element.querySelector('.sc-live'))
      element.insertAdjacentHTML('beforeend', '<p class="sc-live" aria-live="polite"></p>');
    const targets = [...element.querySelectorAll('[data-scribble]')],
      dot = element.querySelector('.sc-hand'),
      live = element.querySelector('.sc-live');
    targets.forEach((t) => {
      if (card && !handsOn) t.tabIndex = -1;
      else if (!t.matches('a[href],button')) t.tabIndex = 0;
    });
    const ink = makePen(element, api);
    let hovered = null,
      pinned = null,
      demoWant = null,
      handedOff = false,
      lastPointer = '',
      demoCycle = -1;
    const wanted = () => hovered || pinned || (handsOn && handedOff ? null : demoWant);
    const labelOf = (t) => (t.getAttribute('aria-label') || t.textContent || '').trim();
    function update() {
      const w = wanted();
      if (w === ink.pen.want) return;
      ink.pen.want = w;
      if (live && w) live.textContent = 'Circled: ' + labelOf(w);
      if (api.reduced) api.paint();
      else api.wake();
    }
    targets.forEach((t) => {
      api.listen(t, 'pointerenter', (e) => {
        if (e.pointerType !== 'touch' && !api.paused) {
          hovered = t;
          update();
        }
      });
      api.listen(t, 'pointerleave', (e) => {
        if (e.pointerType !== 'touch' && hovered === t) {
          hovered = null;
          update();
        }
      });
      api.listen(t, 'focus', () => {
        if (t.matches(':focus-visible')) {
          hovered = t;
          update();
        }
      });
      api.listen(t, 'blur', () => {
        if (hovered === t) {
          hovered = null;
          update();
        }
      });
      api.listen(t, 'click', (e) => {
        if (t.tagName === 'A') e.preventDefault();
        if (api.paused) return;
        if (e.detail && lastPointer === 'touch') {
          pinned = pinned === t ? null : t;
          update();
        } else if (!e.detail && live) live.textContent = labelOf(t) + ' pressed.';
      });
      if (t.getAttribute('role') === 'button' && !t.matches('button'))
        api.listen(t, 'keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            t.click();
          }
        });
    });
    api.listen(
      element,
      'pointerdown',
      (e) => {
        lastPointer = e.pointerType;
        if (e.pointerType === 'touch' && pinned && !targets.some((t) => t.contains(e.target))) {
          pinned = null;
          update();
        }
      },
      true,
    );
    function handOff() {
      if (handedOff) return;
      handedOff = true;
      demoWant = null;
      update();
      if (card.pointer) card.pointer({ x: 0, y: 0, opacity: 0, down: false });
    }
    if (handsOn) {
      api.listen(
        element,
        'pointermove',
        (e) => {
          if (!handedOff && !(e.pointerType === 'mouse' && !e.movementX && !e.movementY)) handOff();
        },
        true,
      );
      api.listen(element, 'pointerdown', () => handOff(), true);
      targets.forEach((t) =>
        api.listen(t, 'focus', () => {
          if (t.matches(':focus-visible')) handOff();
        }),
      );
      api.restore = () => {
        handOff();
        pinned = null;
        hovered = null;
        update();
      };
    }
    api.on('replay', () => {
      demoCycle = -1;
      demoWant = null;
      pinned = null;
      hovered = null;
      update();
      ink.clear();
    });
    api.on('params', () => ink.resketch());
    const L = card ? card.loop || 6 : 8;
    function handAt(t) {
      const sr = element.getBoundingClientRect(),
        home = { x: sr.width * 0.84, y: sr.height * 0.86 },
        stay = (L - 1.5) / targets.length - 0.5;
      const keys = [
        [0, home, 0],
        [0.3, home, 0],
        [0.6, home, 1],
      ];
      let at = 0.6;
      targets.forEach((el) => {
        const r = el.getBoundingClientRect(),
          spot = { x: r.left - sr.left + r.width * 0.58, y: r.top - sr.top + r.height * 0.62 };
        keys.push([at + 0.5, spot, 1], [at + 0.5 + stay, spot, 1]);
        at += 0.5 + stay;
      });
      keys.push([at + 0.5, home, 1], [at + 0.9, home, 0], [L, home, 0]);
      let a = keys[0],
        b = keys[0];
      for (let i = 0; i < keys.length - 1; i++) {
        if (t >= keys[i][0] && t <= keys[i + 1][0]) {
          a = keys[i];
          b = keys[i + 1];
          break;
        }
      }
      const u = b[0] === a[0] ? 1 : R.smooth((t - a[0]) / (b[0] - a[0]));
      return { x: R.mix(a[1].x, b[1].x, u), y: R.mix(a[1].y, b[1].y, u), o: R.mix(a[2], b[2], u) };
    }
    api.frame(({ dt, time, reduced }) => {
      let more = false;
      if (handsOn && !handedOff && card.once && time >= L) handOff();
      if (options.preview && !reduced && !(handsOn && handedOff)) {
        const c = Math.floor(time / L),
          t = time % L;
        if (c !== demoCycle) {
          demoCycle = c;
          demoWant = null;
        }
        const h = handAt(t),
          sr = element.getBoundingClientRect();
        let over = null;
        if (h.o > 0.5)
          targets.forEach((el) => {
            const r = el.getBoundingClientRect(),
              x = h.x + sr.left,
              y = h.y + sr.top;
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) over = el;
          });
        demoWant = over;
        if (card) {
          if (card.pointer) card.pointer({ x: h.x, y: h.y, opacity: h.o, down: false });
        } else if (dot) {
          dot.style.opacity = h.o.toFixed(3);
          dot.style.transform = 'translate3d(' + h.x.toFixed(1) + 'px,' + h.y.toFixed(1) + 'px,0)';
        }
        more = true;
      }
      if (reduced && options.preview && !(handsOn && handedOff)) demoWant = targets[0] || null;
      ink.pen.want = wanted();
      return ink.advance(time * 1000, dt, reduced) || more;
    });
    const status = api.status;
    api.status = () => ({
      ...(status ? status() : {}),
      state: PHASE_NAME[ink.pen.phase],
      progress: ink.pen.amount,
      target: ink.pen.target ? targets.indexOf(ink.pen.target) : -1,
      fps: api.params.fps,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountScribbleRing(element, options) {
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
    element.classList.add('scribble-ring');
    element.innerHTML = '<div class="fx-board" data-sc></div>';
    const stage = element,
      board = stage.querySelector('[data-sc]'),
      cursor = createCursor(stage);
    const media = cardMedia({ tone: 1, glyph: 0, accent: true }).replace(
      'class="ck-media',
      'data-scribble data-scribble-fit="1.3" class="ck-media',
    );
    const markup =
      '<div class="sc-ep"><p class="sc-fx-line">Circle the <span class="sc-fx-word" data-scribble>one idea</span><br>worth a second look.</p>' +
      '<div class="sc-fx-row">' +
      media +
      '<span class="ck-pill ck-solid" data-scribble role="button">View project</span></div></div>';
    const place = () => {
      const w = stage.clientWidth,
        mobile = w < 600;
      board.style.setProperty('--sc-left', '0px');
      board.style.setProperty(
        '--fx-k',
        (mobile ? 1 : Math.min(1.45, Math.max(1, stage.clientHeight / 430))).toFixed(4),
      );
    };
    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);
    const inst = mount(board, {
      params: options.params,
      preview: true,
      card: { markup, loop: 8, interactive: true, once: true, pointer: cursor.set },
    });

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
  global.mountScribbleRing = mountScribbleRing;
  if (typeof module === 'object' && module.exports) module.exports = mountScribbleRing;
})(typeof window !== 'undefined' ? window : this);
