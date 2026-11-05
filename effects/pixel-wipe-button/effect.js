/*
 * Pixel Wipe Button
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Three buttons (Get started, Book a demo, Contact sales). On hover the new background colour is laid over the button
 * square by square, left to right, in 16 hard frames; the label rolls up and the arrow is swapped sideways. On leave it
 * does not rewind: the old colour sweeps in again from the left. Good for CTAs and navigation items.
 *
 * How it moves
 * - One rAF loop that sleeps when nothing moves; no CSS transitions, so pause and the demo cursor share one clock.
 * - Each button gets a <canvas class="pw-grain"> between its background and its label. The script paints square
 *   cells on it (no CSS mask, no image file): side = ceil(button height in device pixels / params.rows), as many
 *   columns as it takes to cover the width, grid centred vertically. Each cell has a start point
 *   d = x + (noise - x) * ragged, where x is its column centre (0..1) and noise is a fixed integer hash of
 *   (column, row), so the pattern is identical on every load.
 * - A sweep paints one colour from the left in 16 held frames, like a flipbook at a fixed frame rate:
 *   frame k = floor(elapsed / params.duration * 16) + 1, front p = k / 16. Cell opacity is (p * 1.4 - d) / 0.4,
 *   clamped to 0..1 and held to multiples of 1/8; frame 16 is solid. The canvas is only repainted when a frame
 *   number changes.
 * - Enter: a sweep in --pw-fill over params.duration ms (540). The label rolls up one line (its copy is a
 *   text-shadow one line below) and the arrow track slides one box to the right: 420 ms on
 *   cubic-bezier(0.22, 1, 0.36, 1), starting 120 ms after the sweep. Text colour moves to --pw-fill-ink over 140 ms
 *   (ease-in, via color-mix). When the sweep ends the button background becomes the fill colour
 *   (data-pw-state="on") and the canvas is cleared.
 * - Leave: a sweep in --pw-rest from the left again, no rewind. If the roll had settled, label and arrow jump back
 *   without motion (the copy looks the same, so this is invisible); if it was still moving it rolls back.
 * - Sweeps stack in the order they started, newest on top. A quick pass therefore shows a band of fill chased off by
 *   the resting colour, and hovering again during the exit paints the fill straight over it, no flash. When a sweep
 *   finishes, the button background takes its colour and it and everything under it are dropped.
 * - White buttons: the label and arrow are white with mix-blend-mode: difference, so every ink cell under a letter
 *   turns it white and the text stays readable on every frame.
 * - Layout: the row of buttons is centred, font size up to 30 px (one column, up to 24 px at 760 px and below).
 * - Demo, once, 3 s after load: a fake cursor visits the three buttons. Any real pointer move with actual movement, a
 *   press, or keyboard focus ends it for good.
 *
 * Options
 *   params.duration  200..1600 ms, default 540   one sweep (enter or exit), always 16 frames
 *   params.rows      3..12, default 6            cell rows over the button height; cells stay square
 *   params.ragged    0..100 %, default 40        noise in the sweep front; 0 = clean column-by-column wipe
 *   reducedMotion    true / false / null         force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountPixelWipeButton(element, {params: {...}, reducedMotion: null});
 *   fx.params                    copy of current params
 *   fx.setParams({rows: 8})      change params live (values are clamped to the ranges above)
 *   fx.setPaused(true|false)     freeze / resume; new hovers are ignored while paused
 *   fx.reset()                   params back to defaults, demo ended, all buttons back to rest
 *   fx.setReducedMotion(bool|null)
 *   fx.destroy()                 removes listeners, observers and the fake cursor
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountPixelWipeButton(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The buttons: the markup in mountPixelWipeButton. Any <a data-pw> or <button data-pw> inside the stage gets the
 *   effect; data-tone="solid" is the dark button that fills with the accent; data-arrow="false" drops the
 *   arrow. Buttons are rebuilt from their text, so keep them text only.
 * - Colours: --pw-rest, --pw-fill (backgrounds) and --pw-rest-ink, --pw-fill-ink (text) on [data-pw].
 * - The layout() function, including the 30 px size cap. Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The held frames: drawing the front at every animation frame turns the pixel staircase into a blurry slide.
 * - The exit sweeping in the same direction instead of reversing, and the stacking of sweeps; without it a quick pass
 *   cuts the fill in half and flickers.
 * - The 1/8 opacity steps per cell; plain on/off cells look like a cheap dither.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountPixelWipeButton on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - Buttons stay real <a> elements; the canvas and the arrow box are aria-hidden, the label copy is only a text-shadow.
 * - Keyboard focus (focus-visible) plays the hover; Enter follows the link.
 * - Touch: the first tap plays the hover and keeps it (the click is prevented); tap again or elsewhere to clear.
 * - With reduced motion: no sweep, no flip and no demo cursor; buttons switch colour on hover. Before the first real
 *   interaction the first button is shown in its hover state.
 * - The loop stops when the tab is hidden, the element is off screen or it is paused.
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
  const R = { smooth, mix };

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
    { key: 'duration', type: 'range', default: 540, min: 200, max: 1600, step: 20 },
    { key: 'rows', type: 'range', default: 6, min: 3, max: 12, step: 1 },
    { key: 'ragged', type: 'range', default: 40, min: 0, max: 100, step: 5 },
  ];

  // ---- the effect ----
  const STEPS = 16,
    SOFT = 0.4,
    SHADES = 8,
    ROLL_MS = 420,
    ROLL_WAIT = 120,
    INK_MS = 140,
    HASH_SEED = 0x51ed;
  const ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h11M9 3.5 13.5 8 9 12.5"/></svg>';
  function bezierEase(x1, y1, x2, y2) {
    const N = 96,
      coord = (a, b, s) => {
        const k = 1 - s;
        return 3 * k * k * s * a + 3 * k * s * s * b + s * s * s;
      },
      xs = [];
    for (let i = 0; i <= N; i++) xs.push(coord(x1, x2, i / N));
    return (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      let i = 1;
      while (i < N && xs[i] < t) i++;
      const span = xs[i] - xs[i - 1],
        s = (i - 1 + (span > 0 ? (t - xs[i - 1]) / span : 0)) / N;
      return coord(y1, y2, s);
    };
  }
  const ROLL_EASE = bezierEase(0.22, 1, 0.36, 1),
    INK_EASE = (t) => t * t;
  function cellNoise(c, r) {
    let h = Math.imul(c + 1, 0x27d4eb2d) ^ Math.imul(r + 1, 0x165667b1) ^ HASH_SEED;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  function dress(el) {
    const text = (el.dataset.label || el.textContent).replace(/\s+/g, ' ').trim(),
      withArrow = el.dataset.arrow !== 'false';
    const add = (tag, cls, parent) => {
      const n = document.createElement(tag);
      n.className = cls;
      parent.appendChild(n);
      return n;
    };
    el.classList.add('pw-face');
    el.textContent = '';
    const canvas = add('canvas', 'pw-grain', el),
      word = add('span', 'pw-word', el),
      inner = add('span', 'pw-word-in', word);
    canvas.setAttribute('aria-hidden', 'true');
    inner.textContent = text;
    let track = null;
    if (withArrow) {
      const go = add('span', 'pw-go', el);
      go.setAttribute('aria-hidden', 'true');
      track = add('span', 'pw-go-track', go);
      track.innerHTML = '<i>' + ARROW + '</i><i>' + ARROW + '</i>';
    }
    return {
      el,
      canvas,
      ctx: canvas.getContext('2d'),
      inner,
      track,
      on: false,
      base: 'rest',
      sweeps: [],
      roll: { v: 0, from: 0, to: 0, t0: 0, run: false },
      ink: null,
      grid: null,
      painted: null,
    };
  }
  function demoMarkup() {
    return (
      '<div class="pw-scene">' +
      '<a href="#" data-pw data-tone="solid" data-tour="1">Get started</a>' +
      '<a href="#" data-pw data-tour="2">Book a demo</a>' +
      '<a href="#" data-pw data-arrow="false" data-tour="3">Contact sales</a></div>' +
      '<p class="cr-hint" data-cr-chrome>Hover a button · On touch, tap to play and tap again to clear</p><div class="pw-hand" aria-hidden="true"></div>'
    );
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('pw-host');
    if (getComputedStyle(element).position === 'static') element.style.position = 'relative';
    const card = options.card || null,
      live = !!(card && card.interactive),
      hold = live && card.once && card.introDelay > 0 ? +card.introDelay : 0;
    element.innerHTML = card
      ? card.markup ||
        '<div class="pw-card"><a href="#" data-pw data-tone="solid">Get started</a><a href="#" data-pw>Book a demo</a></div>'
      : demoMarkup();
    const dot = element.querySelector('.pw-hand'),
      faces = [...element.querySelectorAll('[data-pw]')].map(dress);
    const tagged = faces
        .filter((F) => F.el.hasAttribute('data-tour'))
        .sort((a, b) => a.el.dataset.tour - b.el.dataset.tour),
      tour = tagged.length ? tagged : faces.slice();
    if (card && !live)
      faces.forEach((F) => {
        F.el.tabIndex = -1;
      });
    function grid(F) {
      const w = F.el.offsetWidth,
        h = F.el.offsetHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1,
        W = Math.round(w * dpr),
        H = Math.round(h * dpr),
        rows = api.params.rows,
        mixAmt = api.params.ragged / 100;
      if (F.canvas.width !== W || F.canvas.height !== H) {
        F.canvas.width = W;
        F.canvas.height = H;
      }
      const side = Math.ceil(H / rows),
        cols = Math.ceil(W / side),
        top = Math.floor((H - side * rows) / 2),
        cells = [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const x = (c + 0.5) / cols;
          cells.push({ x: c * side, y: top + r * side, d: x + (cellNoise(c, r) - x) * mixAmt });
        }
      F.grid = { side, cells };
      F.painted = null;
    }
    const regrid = () => {
      faces.forEach(grid);
      api.paint();
    };
    const ro = new ResizeObserver(regrid);
    faces.forEach((F) => ro.observe(F.el));
    api.cleanup(() => ro.disconnect());
    api.on('params', () => faces.forEach(grid));
    if (document.fonts && document.fonts.ready)
      document.fonts.ready.then(() => {
        if (!api.destroyed) regrid();
      });
    const colourOf = (F, name, fallback) => getComputedStyle(F.el).getPropertyValue(name).trim() || fallback;
    const showBase = (F) => {
      if (F.base === 'fill') F.el.setAttribute('data-pw-state', 'on');
      else F.el.removeAttribute('data-pw-state');
    };
    const heading = (F) => (F.sweeps.length ? F.sweeps[F.sweeps.length - 1].to : F.base);
    function rollValue(F, now) {
      const r = F.roll;
      if (!r.run) return r.v;
      const u = (now - r.t0) / ROLL_MS;
      if (u >= 1) {
        r.v = r.to;
        r.run = false;
        return r.v;
      }
      return r.from + (r.to - r.from) * ROLL_EASE(Math.max(0, u));
    }
    function rollTo(F, to, now, jump, wait) {
      const r = F.roll,
        v = rollValue(F, now);
      if (jump) {
        r.v = to;
        r.run = false;
      } else {
        r.from = v;
        r.to = to;
        r.t0 = now + (wait || 0);
        r.run = true;
      }
    }
    function settle(F, on) {
      F.sweeps = [];
      F.base = on ? 'fill' : 'rest';
      F.painted = null;
      showBase(F);
      rollTo(F, 0, 0, true);
      F.ink = null;
      F.el.style.color = on ? 'var(--pw-fill-ink)' : '';
    }
    function turn(F, on, now, still) {
      if (still) {
        settle(F, on);
        return;
      }
      const to = on ? 'fill' : 'rest';
      if (heading(F) !== to)
        F.sweeps.push({
          to,
          t0: now,
          colour: on ? colourOf(F, '--pw-fill', '#17181a') : colourOf(F, '--pw-rest', '#fff'),
        });
      F.ink = {
        from: getComputedStyle(F.el).color,
        to: on ? 'var(--pw-fill-ink)' : 'var(--pw-rest-ink)',
        t0: now,
        rest: !on,
      };
      if (on) rollTo(F, 1, now, false, ROLL_WAIT);
      else rollTo(F, 0, now, !F.roll.run && F.roll.v === 1);
    }
    function paintCells(F, frames) {
      const { ctx, canvas } = F;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!F.grid) return;
      const side = F.grid.side;
      F.sweeps.forEach((s, i) => {
        const reach = (frames[i] / STEPS) * (1 + SOFT),
          byShade = [];
        F.grid.cells.forEach((cell) => {
          const a = (reach - cell.d) / SOFT;
          if (a <= 0) return;
          const k = a >= 1 ? SHADES : Math.round(a * SHADES);
          if (k) (byShade[k] = byShade[k] || []).push(cell);
        });
        ctx.fillStyle = s.colour;
        byShade.forEach((list, k) => {
          ctx.globalAlpha = k / SHADES;
          ctx.beginPath();
          list.forEach((c) => ctx.rect(c.x, c.y, side, side));
          ctx.fill();
        });
      });
      ctx.globalAlpha = 1;
    }
    function step(F, now) {
      const dur = api.params.duration,
        frames = [];
      let moving = false,
        finished = -1;
      F.sweeps.forEach((s, i) => {
        const u = (now - s.t0) / dur;
        if (u >= 1) finished = i;
        else {
          frames[i] = Math.min(STEPS, Math.floor(Math.max(0, u) * STEPS) + 1);
          moving = true;
        }
      });
      if (finished >= 0) {
        F.base = F.sweeps[finished].to;
        F.sweeps.splice(0, finished + 1);
        frames.splice(0, finished + 1);
        showBase(F);
      }
      const key = F.sweeps.map((s, i) => s.to + frames[i]).join(' ');
      if (key !== F.painted) {
        F.painted = key;
        paintCells(F, frames);
      }
      const v = rollValue(F, now);
      if (F.roll.run) moving = true;
      F.inner.style.transform = v ? 'translateY(' + (-100 * v).toFixed(3) + '%)' : '';
      if (F.track) F.track.style.transform = v ? 'translateX(' + (50 * v - 50).toFixed(3) + '%)' : '';
      if (F.ink) {
        const u = (now - F.ink.t0) / INK_MS;
        if (u >= 1) {
          F.el.style.color = F.ink.rest ? '' : F.ink.to;
          F.ink = null;
        } else {
          F.el.style.color =
            'color-mix(in srgb, ' +
            F.ink.to +
            ' ' +
            (100 * INK_EASE(Math.max(0, u))).toFixed(1) +
            '%, ' +
            F.ink.from +
            ')';
          moving = true;
        }
      }
      return moving;
    }
    const hovered = new Set();
    let pinned = null,
      handOver = null,
      handGone = false,
      lastPointer = '',
      lap = -1;
    const wanted = (F) => hovered.has(F) || pinned === F || (!(live && handGone) && handOver === F);
    const kick = () => {
      if (api.reduced) api.paint();
      else api.wake();
    };
    faces.forEach((F) => {
      const t = F.el;
      api.listen(t, 'pointerenter', (e) => {
        if (e.pointerType !== 'touch' && !api.paused) {
          hovered.add(F);
          kick();
        }
      });
      api.listen(t, 'pointerleave', (e) => {
        if (e.pointerType !== 'touch' && hovered.delete(F)) kick();
      });
      api.listen(t, 'focus', () => {
        if (t.matches(':focus-visible')) {
          hovered.add(F);
          kick();
        }
      });
      api.listen(t, 'blur', () => {
        if (hovered.delete(F)) kick();
      });
      api.listen(t, 'click', (e) => {
        if (t.getAttribute('href') === '#' || (card && !live)) e.preventDefault();
        if (api.paused) return;
        if (e.detail && lastPointer === 'touch') {
          e.preventDefault();
          pinned = pinned === F ? null : F;
          kick();
        }
      });
    });
    api.listen(
      element,
      'pointerdown',
      (e) => {
        lastPointer = e.pointerType;
        if (e.pointerType === 'touch' && pinned && !faces.some((F) => F.el.contains(e.target))) {
          pinned = null;
          kick();
        }
      },
      true,
    );
    function handOff() {
      if (handGone) return;
      handGone = true;
      handOver = null;
      kick();
      if (card.pointer) card.pointer({ x: 0, y: 0, opacity: 0, down: false });
    }
    if (live) {
      api.listen(
        element,
        'pointermove',
        (e) => {
          if (!handGone && !(e.pointerType === 'mouse' && !e.movementX && !e.movementY)) handOff();
        },
        true,
      );
      api.listen(element, 'pointerdown', handOff, true);
      faces.forEach((F) =>
        api.listen(F.el, 'focus', () => {
          if (F.el.matches(':focus-visible')) handOff();
        }),
      );
      api.restore = () => {
        handOff();
        pinned = null;
        hovered.clear();
        kick();
      };
    }
    api.on('replay', () => {
      lap = -1;
      handOver = null;
      pinned = null;
      hovered.clear();
      faces.forEach((F) => {
        F.on = false;
        settle(F, false);
        step(F, 0);
      });
    });
    api.on('motion', () =>
      faces.forEach((F) => {
        F.on = false;
        settle(F, false);
      }),
    );
    const LAP = card ? card.loop || 6 : 8;
    function handAt(t) {
      const box = element.getBoundingClientRect(),
        home = card && card.rest ? card.rest(box.width, box.height) : { x: box.width * 0.86, y: box.height * 0.88 };
      const stay = Math.max(0.4, (LAP - 1.6) / tour.length - 0.45),
        keys = [
          [0, home, 0],
          [0.3, home, 0],
          [0.6, home, 1],
        ];
      let at = 0.6;
      tour.forEach((F) => {
        const r = F.el.getBoundingClientRect(),
          p = { x: r.left - box.left + r.width * 0.58, y: r.top - box.top + r.height * 0.6 };
        keys.push([at + 0.45, p, 1], [at + 0.45 + stay, p, 1]);
        at += 0.45 + stay;
      });
      keys.push([at + 0.45, home, 1], [at + 0.85, home, 0], [LAP, home, 0]);
      let i = 0;
      while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
      const a = keys[i],
        b = keys[i + 1],
        u = b[0] > a[0] ? R.smooth((t - a[0]) / (b[0] - a[0])) : 1;
      return { x: R.mix(a[1].x, b[1].x, u), y: R.mix(a[1].y, b[1].y, u), o: R.mix(a[2], b[2], u) };
    }
    api.frame(({ time, reduced }) => {
      const now = time * 1000;
      let more = false;
      if (live && !handGone && card.once && time >= hold + LAP) handOff();
      if (options.preview && !reduced && !(live && handGone)) {
        more = true;
        if (time >= hold) {
          const tt = time - hold,
            n = Math.floor(tt / LAP);
          if (n !== lap) {
            lap = n;
            handOver = null;
          }
          const h = handAt(tt % LAP),
            box = element.getBoundingClientRect(),
            px = h.x + box.left,
            py = h.y + box.top;
          handOver =
            h.o > 0.5
              ? faces.find((F) => {
                  const r = F.el.getBoundingClientRect();
                  return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
                }) || null
              : null;
          if (card) {
            if (card.pointer) card.pointer({ x: h.x, y: h.y, opacity: h.o, down: false });
          } else if (dot) {
            dot.style.opacity = h.o.toFixed(3);
            dot.style.transform = 'translate3d(' + h.x.toFixed(1) + 'px,' + h.y.toFixed(1) + 'px,0)';
          }
        }
      }
      if (reduced && options.preview && !(live && handGone)) handOver = tour[0] || null;
      faces.forEach((F) => {
        const w = wanted(F);
        if (w !== F.on) {
          F.on = w;
          turn(F, w, now, reduced);
        }
        if (step(F, now)) more = true;
      });
      return more && !reduced;
    });
    const baseStatus = api.status;
    api.status = () => ({
      ...(baseStatus ? baseStatus() : {}),
      on: faces.filter((F) => F.on).map((F) => faces.indexOf(F)),
      faces: faces.map((F) => F.base + (F.sweeps.length ? '+' + F.sweeps.length : '')),
      buttons: faces.length,
      handOff: handGone,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountPixelWipeButton(element, options) {
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
    element.classList.add('pixel-wipe-button');
    element.innerHTML = '<div class="fx-board" data-pw-board></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-pw-board]'),
      cursor = createCursor(stage),
      narrow = matchMedia('(max-width:760px)');
    const markup =
      '<div class="pw-row">' +
      '<a href="#" data-pw data-tone="solid" data-tour="1">Get started</a>' +
      '<a href="#" data-pw data-tour="2">Book a demo</a>' +
      '<a href="#" data-pw data-arrow="false" data-tour="3">Contact sales</a></div>';
    let row = null;
    function rest(w, h) {
      if (!row) return { x: w * 0.5, y: h * 0.85 };
      const b = board.getBoundingClientRect(),
        r = row.getBoundingClientRect();
      return {
        x: narrow.matches ? w * 0.86 : r.left - b.left + r.width * 0.5,
        y: Math.min(h - 24, r.bottom - b.top + parseFloat(row.style.fontSize) * 2.4),
      };
    }
    const inst = mount(board, {
      params: options.params,
      preview: true,
      card: {
        markup,
        loop: narrow.matches ? 6 : 7,
        interactive: true,
        once: true,
        introDelay: 3,
        rest,
        pointer: cursor.set,
      },
    });
    row = board.querySelector('.pw-row');
    function layout() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        z = panelZone(stage),
        G = 24;
      row.style.fontSize = '100px';
      const w = row.offsetWidth / 100,
        h = row.offsetHeight / 100;
      let F, top;
      if (narrow.matches) {
        F = Math.min(24, (W - 64) / w, (H - 80) / h);
        top = (H - h * F) / 2;
      } else {
        F = Math.max(16, Math.min(30, (W - 96) / w, (H - 96) / h));
        top = (H - h * F) / 2;
        if (top < z.bottom + G && (W - w * F) / 2 < z.right + G)
          top = Math.min(H - h * F - 24, Math.max(top, z.bottom + G));
      }
      row.style.fontSize = F.toFixed(2) + 'px';
      row.style.left = ((W - row.offsetWidth) / 2).toFixed(1) + 'px';
      row.style.top = top.toFixed(1) + 'px';
    }
    layout();
    const observer0 = new ResizeObserver(layout);
    observer0.observe(stage);
    if (document.fonts) document.fonts.ready.then(layout);

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
  global.mountPixelWipeButton = mountPixelWipeButton;
  if (typeof module === 'object' && module.exports) module.exports = mountPixelWipeButton;
})(typeof window !== 'undefined' ? window : this);
