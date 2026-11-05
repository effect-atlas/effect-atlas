/*
 * Redrawn Arrow
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Three round arrow buttons (previous, next, open). On hover the line arrow is pushed forward and wipes itself out, then a
 * fresh arrow is drawn in its place: shaft first, barbs a beat later. Good for carousel controls, "next project"
 * links and external-link corners.
 *
 * How it moves
 * - All CSS on an inline SVG. JS only toggles .is-on on the hovered button and writes timing variables.
 * - The arrow is a 24 x 12 viewBox: shaft M1 6 H23, two barbs starting at the tip (23,6) and ending at (18,1.5) and
 *   (18,10.5). Every path has pathLength="1" and stroke-dasharray 1, so a stroke-dashoffset from 0 to 1 is "fully
 *   drawn" to "gone" whatever the arrow size. "left" is the same arrow mirrored, "up" is rotated -45 deg.
 * - Each button holds two copies of the arrow: a spent one (visible at rest) and a fresh one (hidden at rest).
 * - Hover, spent copy: over params.erase ms, on cubic-bezier(0.64, 0, 0.78, 0) (the library ease-out played
 *   backwards, so it accelerates away), it is pushed 8 units toward where it points, the shaft is wiped from the tail
 *   (offset 0 to -1) and the barbs fold into the tip (0 to 1).
 * - Hover, fresh copy: the shaft draws tail to tip over params.draw ms on ease-out cubic-bezier(0.22, 1, 0.36, 1),
 *   starting at max(0, erase - 60) ms, so it overlaps the end of the wipe and there is never an empty frame. The barbs
 *   draw out from the tip over 0.75 x draw, starting params.lag ms after the shaft. Defaults: erase 260, shaft from
 *   200 to 640 ms, barbs from 400 to 730 ms.
 * - Leave: .is-on is removed and the arrow snaps back to its resting copy with no animation. Hovering again replays
 *   the whole sequence.
 * - Size: button diameter = floor(max(56, min(120, height x 0.28, available width / (3 + 2k)))) px, gap = size x k
 *   (k = 0.6 on wide stages, 0.4 at 760 px and below). Arrow width is 2 em at a font size of 0.35 x the diameter.
 * - Demo, once, 3 s after load (4.2 s): a fake cursor visits previous, next and open. Any real pointer move with
 *   actual movement, a press, or keyboard focus on a button ends it for good.
 *
 * Options
 *   params.erase   100..800 ms, default 260    push-and-wipe duration
 *   params.draw    200..1400 ms, default 440   shaft draw duration; barbs take 0.75 x this
 *   params.lag     0..600 ms, default 200      delay of the barbs after the shaft starts
 *   reducedMotion  true / false / null         force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountRedrawnArrow(element, {params: {...}, reducedMotion: null});
 *   fx.params                 copy of current params
 *   fx.setParams({draw: 800}) change params live (values are clamped to the ranges above)
 *   fx.setPaused(true|false)  pauses running CSS animations (animation-play-state) and ignores new hovers
 *   fx.reset()                params back to defaults, demo ended, all arrows at rest
 *   fx.setReducedMotion(bool|null)
 *   fx.destroy()              removes listeners, observers and the fake cursor
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountRedrawnArrow(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Button labels (Previous, Next, Open) and what the buttons do; they are plain <button type="button"> with no
 *   action attached.
 * - The layout: the row is centred. Size and gap via --rd-size and --rd-gap (set by layout() in mountRedrawnArrow).
 * - Colours, stroke width (stroke-width 1 in viewBox units), button background and shadow in effect.css.
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - pathLength="1" with dasharray 1; without it every path needs its own measured length.
 * - Accelerating wipe and decelerating draw, and the new shaft starting 60 ms before the wipe ends, so the old arrow
 *   is never fully gone before the new one appears.
 * - The barbs starting after the shaft (the lag); drawing everything at once reads as a fade.
 * - The two-copy structure. Animating one path out and back in leaves a gap where nothing is visible.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - The visual part is pure CSS: copy the arrow SVG (both copies) and the .is-on rules, and toggle .is-on yourself or
 *   rewrite the selectors with :hover / :focus-visible.
 * - Using the JS: mount once on a ref after the element is in the DOM; call fx.destroy() on unmount. In React
 *   StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountRedrawnArrow on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - Each button has an aria-label (Previous, Next, Open); the SVGs are aria-hidden. Keyboard focus (focus-visible)
 *   plays the redraw and shows a focus ring; Enter and Space press the button. No other keyboard behaviour.
 * - Touch: a tap replays the redraw and keeps that button in its hovered state until you tap elsewhere.
 * - With reduced motion: the entering copy is hidden and nothing animates; the arrow stays static. No demo cursor.
 * - The only JS loop is the demo; it ends after the demo or on the first interaction.
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
    { key: 'erase', type: 'range', default: 260, min: 100, max: 800, step: 10 },
    { key: 'draw', type: 'range', default: 440, min: 200, max: 1400, step: 10 },
    { key: 'lag', type: 'range', default: 200, min: 0, max: 600, step: 10 },
  ];

  // ---- the effect ----
  const STROKES =
    '<path class="ra-stem" pathLength="1" d="M1 6H23"/><path class="ra-hook" pathLength="1" d="M23 6L18 1.5"/><path class="ra-hook" pathLength="1" d="M23 6L18 10.5"/>';
  const arrow = (dir) =>
    '<svg class="rd-arrow" data-dir="' +
    dir +
    '" viewBox="0 0 24 12" aria-hidden="true">' +
    ['ra-spent', 'ra-fresh'].map((c) => '<g class="' + c + '">' + STROKES + '</g>').join('') +
    '</svg>';
  const GLYPH = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40"/></svg>';
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('rd-stage');
    const card = options.card || null,
      trio = !!(card && card.trio);
    if (trio) {
      const btn = (dir, label) =>
        '<button type="button" class="rd-h rd-ico rd-btn" data-k="' +
        dir +
        '" aria-label="' +
        label +
        '">' +
        arrow(dir) +
        '</button>';
      element.innerHTML =
        '<div class="rd-trio">' +
        btn('left', 'Previous') +
        btn('right', 'Next') +
        btn('up', 'Open') +
        '</div><p class="cr-sr rd-live" aria-live="polite" hidden></p>';
    } else if (card) {
      const btn = (dir, label) =>
        '<button type="button" class="rd-h rd-ico rd-btn ck-pill" data-k="' +
        dir +
        '" aria-label="' +
        label +
        '">' +
        arrow(dir) +
        '</button>';
      element.innerHTML =
        '<div class="rd-set">' +
        btn('left', 'Previous') +
        btn('right', 'Next') +
        btn('up', 'Open') +
        '</div><p class="cr-sr rd-live" aria-live="polite" hidden></p>';
    } else
      element.innerHTML =
        '<div class="rd-wrap"><div class="rd-row">' +
        '<button type="button" class="rd-h rd-round" data-k="left" aria-label="Previous project">' +
        arrow('left') +
        '</button>' +
        '<article class="rd-card"><div class="rd-media">' +
        GLYPH +
        '</div><div class="rd-foot"><span class="rd-name">Project 01</span><a href="#" class="rd-h rd-link" data-k="link">View project' +
        arrow('right') +
        '</a></div>' +
        '<a href="#" class="rd-h rd-corner" data-k="up" aria-label="Open live site">' +
        arrow('up') +
        '</a></article>' +
        '<button type="button" class="rd-h rd-round" data-k="right" aria-label="Next project">' +
        arrow('right') +
        '</button></div>' +
        '<a href="#" class="rd-h rd-big" data-k="big">Next project' +
        arrow('right') +
        '</a></div>' +
        '<p class="cr-hint" data-cr-chrome>Hover or tab to any arrow</p><p class="cr-sr rd-live" aria-live="polite"></p><div class="rd-hand" aria-hidden="true"></div>';
    const hs = [...element.querySelectorAll('.rd-h')],
      byK = (k) => hs.find((el) => el.dataset.k === k),
      live = element.querySelector('.rd-live'),
      hand = element.querySelector('.rd-hand');
    let previewCycle = -1,
      previewOver = null,
      stuck = null,
      lastType = 'mouse';
    function apply() {
      const { erase, draw, lag } = api.params,
        stemAt = Math.max(0, erase - 60),
        ms = (v) => Math.round(v) + 'ms';
      const vars = {
        '--ra-out': erase,
        '--ra-stem': draw,
        '--ra-hook': draw * 0.75,
        '--ra-at': stemAt,
        '--ra-hook-at': stemAt + lag,
      };
      for (const k in vars) element.style.setProperty(k, ms(vars[k]));
    }
    const setOn = (el, on) => el.classList.toggle('is-on', on);
    function replayOn(el) {
      el.classList.remove('is-on');
      void el.offsetWidth;
      el.classList.add('is-on');
    }
    const live2 = !!(card && card.interactive),
      intro = live2 && card.once && card.introDelay > 0 ? +card.introDelay : 0;
    let handOff = !options.preview && !live2 ? true : false;
    if (!options.preview) handOff = true;
    function takeOver() {
      if (handOff) return;
      handOff = true;
      if (previewOver && !previewOver.matches(':hover')) setOn(previewOver, false);
      previewOver = null;
      if (card && card.pointer) card.pointer({ x: 0, y: 0, opacity: 0, down: false });
    }
    const realOK = () => !card || live2;
    hs.forEach((el) => {
      api.listen(el, 'pointerenter', (e) => {
        if (!realOK() || e.pointerType === 'touch' || api.paused) return;
        takeOver();
        setOn(el, true);
      });
      api.listen(el, 'pointerleave', (e) => {
        if (!realOK() || e.pointerType === 'touch') return;
        if (el !== previewOver || handOff) setOn(el, false);
      });
      api.listen(el, 'focus', () => {
        if (realOK() && el.matches(':focus-visible')) {
          takeOver();
          setOn(el, true);
        }
      });
      api.listen(el, 'blur', () => {
        if (el !== stuck) setOn(el, false);
      });
      api.listen(el, 'click', (e) => {
        if (el.tagName === 'A') e.preventDefault();
        if (!realOK() || api.paused) return;
        live.textContent = (el.getAttribute('aria-label') || el.textContent || '').trim() + ' clicked.';
        if (lastType === 'touch') {
          if (stuck && stuck !== el) setOn(stuck, false);
          stuck = el;
          replayOn(el);
        }
      });
    });
    if (realOK()) {
      api.listen(
        element,
        'pointermove',
        (e) => {
          if (e.pointerType === 'mouse' && !e.movementX && !e.movementY) return;
          takeOver();
        },
        true,
      );
      api.listen(
        element,
        'pointerdown',
        (e) => {
          lastType = e.pointerType;
          takeOver();
          if (stuck && !stuck.contains(e.target)) {
            setOn(stuck, false);
            stuck = null;
          }
        },
        true,
      );
    }
    function reset() {
      hs.forEach((el) => setOn(el, false));
      stuck = null;
      previewOver = null;
      live.textContent = '';
    }
    api.on('params', apply);
    api.on('replay', () => {
      reset();
      previewCycle = -1;
    });
    if (live2)
      api.restore = () => {
        takeOver();
        reset();
      };
    const center = (el, fx = 0.5, fy = 0.5) => {
      const s = element.getBoundingClientRect(),
        r = el.getBoundingClientRect();
      return { x: r.left - s.left + r.width * fx, y: r.top - s.top + r.height * fy };
    };
    const LOOP = trio ? 4.2 : card ? 6 : 8;
    function path(t) {
      const s = element.getBoundingClientRect(),
        rest = { x: s.width * 0.8, y: s.height * 0.88 };
      const L = byK('link'),
        U = byK('up'),
        l = L && center(L, 0.3, 0.75),
        u = U && center(U, 0.55, 0.6);
      let pts;
      if (trio) {
        const D = U.offsetWidth,
          a = center(byK('left'), 0.55, 0.72),
          b = center(byK('right'), 0.55, 0.72),
          c = center(U, 0.55, 0.72),
          from = { x: a.x - 0.3 * D, y: a.y + 0.9 * D },
          to = { x: Math.min(c.x + 0.9 * D, s.width - 24), y: c.y + 0.6 * D };
        pts = [
          [0, from, 0],
          [0.45, a, 1],
          [1.25, a, 1],
          [1.65, b, 1],
          [2.45, b, 1],
          [2.85, c, 1],
          [3.75, c, 1],
          [4.2, to, 0],
        ];
      } else if (card) {
        const D = U.offsetWidth,
          a = center(byK('left'), 0.55, 0.72),
          b = center(byK('right'), 0.55, 0.72),
          c = center(U, 0.55, 0.72),
          from = { x: a.x - 0.5 * D, y: a.y + 1.3 * D },
          to = { x: c.x + 0.9 * D, y: c.y + 0.9 * D };
        pts = [
          [0, from, 0],
          [0.5, a, 1],
          [1.6, a, 1],
          [2, b, 1],
          [3.1, b, 1],
          [3.5, c, 1],
          [4.6, c, 1],
          [5.2, to, 0],
          [6, to, 0],
        ];
      } else {
        const a = center(byK('left'), 0.5, 0.55),
          b = center(byK('right'), 0.5, 0.55),
          g = center(byK('big'), 0.85, 0.55);
        pts = [
          [0, rest, 0],
          [0.25, rest, 0],
          [0.45, rest, 1],
          [0.85, a, 1],
          [1.95, a, 1],
          [2.35, l, 1],
          [3.35, l, 1],
          [3.7, u, 1],
          [4.7, u, 1],
          [5.1, b, 1],
          [6.1, b, 1],
          [6.6, g, 1],
          [7.5, g, 1],
          [7.75, rest, 1],
          [7.9, rest, 0],
          [8, rest, 0],
        ];
      }
      let A = pts[0],
        Z = pts[0];
      for (let i = 0; i < pts.length - 1; i++) {
        if (t >= pts[i][0] && t <= pts[i + 1][0]) {
          A = pts[i];
          Z = pts[i + 1];
          break;
        }
      }
      const k = Z[0] === A[0] ? 1 : R.smooth((t - A[0]) / (Z[0] - A[0]));
      return { x: R.mix(A[1].x, Z[1].x, k), y: R.mix(A[1].y, Z[1].y, k), o: R.mix(A[2], Z[2], k) };
    }
    api.frame(({ time, reduced }) => {
      if (handOff || !options.preview || reduced) return false;
      let t = time;
      if (intro) {
        if (t < intro) {
          if (card.pointer) card.pointer({ x: 0, y: 0, opacity: 0, down: false });
          return true;
        }
        t -= intro;
      }
      if (live2 && card.once && t >= LOOP) {
        takeOver();
        return false;
      }
      const c = Math.floor(t / LOOP);
      t %= LOOP;
      if (c !== previewCycle) {
        previewCycle = c;
        reset();
      }
      const h = path(t),
        sr = element.getBoundingClientRect(),
        x = h.x + sr.left,
        y = h.y + sr.top;
      let over = null;
      if (h.o > 0.5)
        hs.forEach((el) => {
          const r = el.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) over = el;
        });
      if (over !== previewOver) {
        if (previewOver) setOn(previewOver, false);
        previewOver = over;
        if (over) setOn(over, true);
      }
      if (card) {
        if (card.pointer) card.pointer({ x: h.x, y: h.y, opacity: h.o, down: false });
      } else {
        hand.style.opacity = h.o.toFixed(3);
        hand.style.transform = 'translate3d(' + h.x.toFixed(1) + 'px,' + h.y.toFixed(1) + 'px,0)';
      }
      return true;
    });
    apply();
    const status = api.status;
    api.status = () => ({
      ...status(),
      on: hs.filter((el) => el.classList.contains('is-on')).map((el) => el.dataset.k),
      handOff,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountRedrawnArrow(element, options) {
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
    element.classList.add('redrawn-arrow-hover');
    element.innerHTML = '<div class="fx-board" data-rd></div>';
    const listeners = new AbortController();
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-rd]'),
      cursor = createCursor(stage);
    function layout() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        left = panelZone(stage, 3).right,
        desk = !matchMedia('(max-width: 760px)').matches,
        k = desk ? 0.6 : 0.4,
        pad = desk ? 40 : 28;
      const size = Math.floor(Math.max(56, Math.min(120, H * 0.28, (W - left - 2 * pad) / (3 + 2 * k)))),
        s = board.style;
      s.setProperty('--rd-left', left + 'px');
      s.setProperty('--rd-size', size + 'px');
      s.setProperty('--rd-gap', Math.round(size * k) + 'px');
    }
    const inst = mount(board, {
      params: options.params,
      preview: true,
      card: { trio: true, interactive: true, once: true, introDelay: 3, pointer: cursor.set },
    });
    layout();
    const observer0 = new ResizeObserver(layout);
    observer0.observe(stage);
    matchMedia('(max-width:760px)').addEventListener('change', layout, { signal: listeners.signal });

    inst.on('destroy', () => {
      listeners.abort();
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
  global.mountRedrawnArrow = mountRedrawnArrow;
  if (typeof module === 'object' && module.exports) module.exports = mountRedrawnArrow;
})(typeof window !== 'undefined' ? window : this);
