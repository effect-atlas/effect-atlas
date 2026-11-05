/*
 * Film Jitter Button
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A "View project" button between two rules. On hover it tilts slightly and its rules and label start to shake in
 * small stepped jumps, like a film frame slipping in the gate. Good for a primary call to action on a portfolio,
 * a case-study link or an editorial page.
 *
 * How it moves
 * - All CSS. JS only toggles .is-hover / .is-press on the button and sets custom properties.
 * - Hover: the button goes to scale(1.035) rotate(-1deg) with a 0.5 s transition on an overshooting curve, so it
 *   settles with a small bounce.
 * - Jitter: while hovered, the top rule runs a 6-pose keyframe loop of 0.42 s with step-end timing (each pose held
 *   70 ms, no tweening between them). The bottom rule runs the same loop at 0.33 s, alternate-reverse, so the two
 *   never move together. The label mask runs a 4-pose sway loop of 0.52 s, step-end (rotation up to 0.4 deg).
 *   Different loop lengths keep the pattern from visibly repeating.
 * - Amplitude: every offset is calc(<em value> * var(--j)). The rules move up to 0.05 em sideways and 0.03 em up or
 *   down and stretch by up to 0.5%. --j = jitter / 100, multiplied by 2.3 / k where k is the button scale, so the shake
 *   looks the same at any size.
 * - Press: scale(0.965) rotate(0) while the pointer is down; release springs back through the same 0.5 s transition.
 * - Size: the button is 184 px wide at k = 1; k = min(2.3, (width - 48) / 184, height x 0.42 / 103.3), never below 1.
 *   Everything inside scales with k.
 * - Curves: "library" uses cubic-bezier(0.28, 1.3, 0.36, 1) for the hover and press; "classic" uses a spring
 *   written as a CSS linear() easing (peaks about 15% over at a quarter of the way, settles by 90%). "classic" is a
 *   carefully hand-tuned curve; keep its values as they are.
 * - Demo, once on load (6 s): a fake cursor moves onto the button at 1.1 s, presses at 3.3 s, leaves at 5.1 s. The
 *   first real mouse move with actual movement, a press, or keyboard focus on the button ends it for good.
 *
 * Options
 *   params.jitter     0..200, default 100     shake amplitude in percent; 0 = tilt only, no shake
 *   params.curve      "library" | "classic", default "library"   which hover / press easing to use
 *   reducedMotion     true / false / null     force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountFilmJitterButton(element, {params: {...}, reducedMotion: null});
 *   fx.params                   copy of current params
 *   fx.setParams({jitter: 150}) change params live (values are clamped to the ranges above)
 *   fx.setPaused(true|false)    while paused, new hovers and presses are ignored
 *   fx.reset()                  params back to defaults, demo ended, hover and press cleared
 *   fx.setReducedMotion(bool|null)
 *   fx.destroy()                removes listeners, observers and the fake cursor
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountFilmJitterButton(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The label text ("View project" in mountFilmJitterButton), and the href: the button is an <a href="#"> and its
 *   click is prevented by default; remove the preventDefault in the click handler to make it a real link.
 * - Colours, radius and shadow of the button and rules via effect.css.
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - step-end timing on the jitter keyframes. Smooth interpolation turns the film slip into a vibration.
 * - The three different loop lengths (0.42 s, 0.33 s alternate-reverse, 0.52 s).
 * - The em-based amplitudes; pixel values stop scaling with the button.
 * - Do not let a framework re-render the button while hovered; the hover class is set by the effect.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - The visual part is pure CSS: you can also copy the .jt-btn markup and keyframes and toggle .is-hover / .is-press
 *   yourself (or switch the selectors to :hover / :active).
 * - Using the JS: mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect
 *   cleanup, onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountFilmJitterButton on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The button is a focusable link named by its label. Keyboard focus (focus-visible) shows the hover state with a
 *   focus ring; Enter activates it. A visually hidden polite live region (.jt-live) announces
 *   "View project clicked." on activation. There is no other keyboard behaviour.
 * - Touch: a tap keeps the hover state on until you tap somewhere else.
 * - With reduced motion: no demo cursor, all animations and transitions off. Hover still shows the static tilt and
 *   scale, without any shake.
 * - Pure CSS animation, so there is no per-frame JS while hovered; the demo loop stops after 6 s.
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
    { key: 'jitter', type: 'range', default: 100, min: 0, max: 200, step: 10 },
    { key: 'curve', type: 'select', default: 'library', options: [{ value: 'library' }, { value: 'classic' }] },
  ];

  // ---- the effect ----
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('jt-stage');
    const cardOpt = options.card || null;
    element.innerHTML =
      '<div class="jt-wrap ck-text" data-card><a href="#" class="jt-btn jt-h ck-panel"' +
      ' aria-label="' +
      (cardOpt.label || 'View project') +
      '"><span class="jt-rule ck-line" data-strong aria-hidden="true"></span><span class="jt-mask"><span class="jt-label ck-text" data-strong>' +
      (cardOpt.label || 'View project') +
      '</span></span><span class="jt-rule ck-line" data-strong aria-hidden="true"></span></a></div><p class="cr-sr jt-live" aria-live="polite"></p>';
    const hoverables = [...element.querySelectorAll('.jt-h')],
      live = element.querySelector('.jt-live'),
      btnEl = element.querySelector('.jt-btn');
    let previewCycle = -1;
    const EASE_SETS = {
      library: {
        bounce: 'var(--spring)',
        smooth: 'var(--out)',
        elastic: 'var(--spring)',
        transform: 'var(--out)',
        menu: 'var(--out)',
      },
      classic: {
        bounce: 'cubic-bezier(.3,1.85,.55,1)',
        smooth: 'cubic-bezier(.26,.8,.08,1)',
        transform: 'cubic-bezier(.5,1,.85,1)',
        menu: 'cubic-bezier(.7,0,.12,1)',
        elastic:
          'linear(0,.35 5%,.69 10%,.94 15%,1.09 20%,1.15 26%,1.11 35%,1.03 45%,.985 55%,.981 62%,.994 75%,1.002 88%,1)',
      },
    };
    function apply() {
      const p = api.params,
        set = EASE_SETS[p.curve] || EASE_SETS.library;
      Object.entries(set).forEach(([k, v]) => element.style.setProperty('--jt-' + k, v));
      element.style.setProperty('--j', String((p.jitter / 100) * (cardOpt.jitterScale || 1)));
    }
    const setHover = (el, on) => el.classList.toggle('is-hover', on);
    hoverables.forEach((el) => {
      api.listen(el, 'pointerenter', (e) => {
        if (e.pointerType !== 'touch' && !api.paused) setHover(el, true);
      });
      api.listen(el, 'pointerleave', () => {
        setHover(el, false);
        el.classList.remove('is-press');
      });
      api.listen(el, 'focus', () => {
        if (el.matches(':focus-visible')) setHover(el, true);
      });
      api.listen(el, 'blur', () => setHover(el, false));
      api.listen(el, 'pointerdown', (e) => {
        if (!api.paused && e.button === 0) el.classList.add('is-press');
      });
      api.listen(el, 'pointerup', () => el.classList.remove('is-press'));
      api.listen(el, 'pointercancel', () => el.classList.remove('is-press'));
      api.listen(el, 'click', (e) => {
        if (el.tagName === 'A') e.preventDefault();
        if (api.paused) return;
        live.textContent = (el.textContent || '').trim() + ' clicked.';
      });
    });
    function reset() {
      hoverables.forEach((el) => el.classList.remove('is-hover', 'is-press'));
      live.textContent = '';
    }
    api.on('params', apply);
    api.on('replay', () => {
      reset();
      previewCycle = -1;
    });
    let handOff = false,
      stuck = false,
      lastType = '';
    function takeOver(on) {
      if (handOff) return;
      handOff = true;
      btnEl.classList.remove('is-press');
      setHover(btnEl, !!on);
      if (cardOpt.pointer) cardOpt.pointer({ x: 0, y: 0, opacity: 0, down: false });
    }
    const real = (e) => e.pointerType !== 'touch' && btnEl.contains(e.target);
    api.listen(
      element,
      'pointermove',
      (e) => {
        if (!handOff && !(e.pointerType === 'mouse' && !e.movementX && !e.movementY)) takeOver(real(e));
      },
      true,
    );
    api.listen(
      element,
      'pointerdown',
      (e) => {
        lastType = e.pointerType;
        takeOver(real(e));
        if (stuck && !btnEl.contains(e.target)) {
          stuck = false;
          setHover(btnEl, false);
        }
      },
      true,
    );
    api.listen(btnEl, 'focus', () => {
      if (btnEl.matches(':focus-visible')) takeOver(true);
    });
    api.listen(btnEl, 'click', (e) => {
      if (e.detail && lastType === 'touch' && !api.paused) {
        stuck = true;
        setHover(btnEl, true);
      }
    });
    api.listen(btnEl, 'pointerleave', (e) => {
      if (stuck && e.pointerType === 'touch') setHover(btnEl, true);
    });
    api.on('resize', apply);
    api.restore = () => {
      takeOver(false);
      stuck = false;
      reset();
    };
    const center = (el, fx = 0.5, fy = 0.5) => {
      const s = element.getBoundingClientRect(),
        r = el.getBoundingClientRect();
      return { x: r.left - s.left + r.width * fx, y: r.top - s.top + r.height * fy };
    };
    function path(t) {
      const s = element.getBoundingClientRect(),
        rest = { x: s.width * 0.78, y: s.height * 0.84 };
      const b = center(btnEl, 0.6, 0.62),
        cp = [
          [0, rest, 0],
          [0.3, rest, 0],
          [0.6, rest, 1],
          [1.1, b, 1],
          [4.5, b, 1],
          [5.1, rest, 1],
          [5.5, rest, 0],
          [6, rest, 0],
        ];
      return seg(cp, t);
    }
    function seg(pts, t) {
      let a = pts[0],
        b = pts[0];
      for (let i = 0; i < pts.length - 1; i++) {
        if (t >= pts[i][0] && t <= pts[i + 1][0]) {
          a = pts[i];
          b = pts[i + 1];
          break;
        }
      }
      const u = b[0] === a[0] ? 1 : R.smooth((t - a[0]) / (b[0] - a[0]));
      return { x: R.mix(a[1].x, b[1].x, u), y: R.mix(a[1].y, b[1].y, u), o: R.mix(a[2], b[2], u) };
    }
    api.frame(({ time, reduced }) => {
      if (!handOff && time >= 6) takeOver(btnEl.matches(':hover'));
      if (handOff || reduced) return false;
      const c = Math.floor(time / 6),
        t = time % 6;
      if (c !== previewCycle) {
        previewCycle = c;
        reset();
      }
      const h = path(t);
      const sr = element.getBoundingClientRect(),
        r = btnEl.getBoundingClientRect(),
        x = h.x + sr.left,
        y = h.y + sr.top,
        over = h.o > 0.5 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      setHover(btnEl, over);
      const press = t >= 3.3 && t < 3.46;
      btnEl.classList.toggle('is-press', press);
      if (cardOpt.pointer) cardOpt.pointer({ x: h.x, y: h.y, opacity: h.o, down: press });
      return true;
    });
    apply();
    const status = api.status;
    api.status = () => ({
      ...status(),
      hovered: hoverables.filter((el) => el.classList.contains('is-hover')).map(() => 'btn'),
      jitter: api.params.jitter,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountFilmJitterButton(element, options) {
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
    element.classList.add('film-jitter-hover');
    element.innerHTML = '<div class="fx-board" data-jt></div>';
    const stage = element,
      board = stage.querySelector('[data-jt]'),
      cursor = createCursor(stage);
    const fit = () => Math.max(1, Math.min(2.3, (stage.clientWidth - 48) / 184, (stage.clientHeight * 0.42) / 103.3));
    const place = () => board.style.setProperty('--jt-k', fit().toFixed(4));
    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);
    const inst = mount(board, {
      params: options.params,
      preview: true,
      card: {
        label: 'View project',
        interactive: true,
        once: true,
        get jitterScale() {
          return 2.3 / fit();
        },
        pointer: cursor.set,
      },
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
  global.mountFilmJitterButton = mountFilmJitterButton;
  if (typeof module === 'object' && module.exports) module.exports = mountFilmJitterButton;
})(typeof window !== 'undefined' ? window : this);
