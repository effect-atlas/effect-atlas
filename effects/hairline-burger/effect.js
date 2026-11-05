/*
 * Hairline Burger
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A menu button with two thin lines. Hover and the lines pinch towards each other; click and they cross into an X
 * while a small Menu / Close label rolls over; hover the X and it spins a quarter turn. For a site header, a mobile
 * nav trigger or any open / close toggle.
 *
 * How it moves
 * - Two lines, params.weight px thick, 32 px wide, params.gap px apart (top edge of one to bottom edge of the other).
 * - Every state change is a CSS transition on transform, params.duration ms, cubic-bezier(.22,1,.36,1).
 * - Hover (closed): each line moves params.shift px towards the middle. The button shadow lifts.
 * - Open: each line moves to the centre ((gap - weight) / 2) and turns +45 / -45 degrees. The label under the button is
 *   a two-row strip in an overflow mask; it slides up 50% so "Menu" leaves and "Close" arrives, same duration and curve.
 * - Hover (open): the whole line group spins rotate(0 -> 90deg) once in 600 ms with the same curve (Web Animations
 *   API). An X turned 90 degrees looks the same, so it ends seamlessly. It runs on each pointer enter, not on a loop.
 *   From 400 ms after opening, hovering also tints the button background light grey.
 * - Size: the button is 72 px at scale 1 and scales up to 3x with the element (half of its width or height decides),
 *   never below 1. Line sizes, gap and shift scale with it.
 * - Demo, once on load (8 s): a fake cursor hovers the button (pinch), steps off and back, clicks to open at 3.65 s,
 *   steps off and back to show the spin, clicks to close at 5.65 s and leaves. Any real pointer move, press or keyboard
 *   focus on the button ends it for good.
 *
 * Options
 *   params.gap       6..16, default 11        px between the lines
 *   params.shift     0..4, default 2          px each line moves on hover; 0 disables the pinch
 *   params.duration  200..900, default 500    ms for pinch, cross and label roll
 *   params.weight    1..2.5, default 1.5      line thickness in px
 *   reducedMotion    true / false / null      force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountHairlineBurger(element, {params: {...}, reducedMotion: null});
 *   fx.params                      copy of current params
 *   fx.setParams({weight: 2})      change params live
 *   fx.setPaused(true|false)       freeze / resume (clicks are ignored while paused)
 *   fx.reset()                     params back to defaults, demo stopped, button closed
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                   removes listeners, observers and the fake cursor
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:420px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountHairlineBurger(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Label words: labels in mountHairlineBurger (default ['Menu', 'Close']).
 * - Button size, radius, colours, shadow and the label font via effect.css.
 * - params within their ranges.
 *
 * Do not change (the feel breaks)
 * - Same curve and duration for lines and label, so the cross and the roll land together.
 * - The spin must be exactly 90 degrees (or a multiple); anything else leaves the X crooked at the end.
 * - The lines meet at (gap - weight) / 2; change the gap only through params.gap so this stays true.
 * - Keep the states as classes (.is-hover, .is-open) with CSS transitions, so fast toggles reverse from where they are.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - The button only toggles its own state. To open a real menu, listen for its click (it is the .hl-btn element) or watch
 *   aria-expanded, and drive your menu from there.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountHairlineBurger on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - A real button with aria-expanded and a label that switches between "Open menu" and "Close menu". Keyboard focus
 *   (focus-visible) counts as hover. The Menu / Close text is aria-hidden; a visually hidden polite live region
 *   (.hl-live) announces "Menu opened." / "Menu closed." (the demo's own clicks are announced too).
 * - With reduced motion: no fake cursor, no spin, all transitions off; pinch, cross and label change instantly.
 * - The loop only runs for the demo and stops when the tab is hidden, the element is off screen or it is paused.
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
      hooks = new Map(),
      animations = new Set();
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
      animations.forEach((animation) => {
        if (reduced()) animation.finish();
        else if (paused || !visible || document.hidden) animation.pause();
        else animation.play();
      });
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
        animations.forEach((animation) =>
          paused || !visible || document.hidden ? animation.pause() : reduced() ? animation.finish() : animation.play(),
        );
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
      animate(target, keyframes, timing) {
        const animation = target.animate(keyframes, timing);
        animations.add(animation);
        const remove = () => animations.delete(animation);
        animation.finished.then(remove, remove);
        if (paused || !visible || document.hidden) animation.pause();
        if (reduced()) animation.finish();
        return animation;
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        stop();
        try {
          emit('destroy');
        } finally {
          animations.forEach((animation) => animation.cancel());
          animations.clear();
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
          animations: animations.size,
          params: Object.assign({}, params),
        };
      },
    };
    listen(preference, 'change', syncMotion);
    listen(document, 'visibilitychange', () => {
      stop();
      animations.forEach((animation) => (document.hidden ? animation.pause() : !paused && animation.play()));
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
      animations.forEach((animation) => (!visible ? animation.pause() : !paused && animation.play()));
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
    { key: 'gap', type: 'range', default: 11, min: 6, max: 16, step: 1 },
    { key: 'shift', type: 'range', default: 2, min: 0, max: 4, step: 0.5 },
    { key: 'duration', type: 'range', default: 500, min: 200, max: 900, step: 50 },
    { key: 'weight', type: 'range', default: 1.5, min: 1, max: 2.5, step: 0.5 },
  ];

  // ---- the effect ----
  const OUT = 'cubic-bezier(.22,1,.36,1)';
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('hl-stage');
    const cardOpt = options.card || null,
      lab = (cardOpt && cardOpt.labels) || ['Menu', 'Close'];
    if (cardOpt)
      element.innerHTML =
        '<div class="hl-wrap" data-card><div class="hl-bar"><button type="button" class="hl-btn ck-panel"' +
        (cardOpt.interactive ? '' : ' tabindex="-1"') +
        ' aria-label="Open menu" aria-expanded="false"><span class="hl-lines"><i></i><i></i></span></button></div>' +
        '<span class="hl-state ck-hint" aria-hidden="true"><span class="hl-roll"><span>' +
        lab[0] +
        '</span><span>' +
        lab[1] +
        '</span></span></span></div><p class="cr-sr hl-live" aria-live="polite"></p>';
    else
      element.innerHTML =
        '<div class="hl-wrap"><div class="hl-bar"><span class="hl-chip" aria-hidden="true">Contact</span><button type="button" class="hl-btn" aria-label="Open menu" aria-expanded="false"><span class="hl-lines"><i></i><i></i></span></button></div>' +
        '<span class="hl-state" aria-hidden="true"><span class="hl-roll"><span>Menu</span><span>Close</span></span></span></div>' +
        '<p class="cr-hint" data-cr-chrome>Hover to pinch · Click for a cross · Hover the cross to spin</p><p class="cr-sr hl-live" aria-live="polite"></p><div class="hl-hand" aria-hidden="true"></div>';
    const btn = element.querySelector('.hl-btn'),
      lines = element.querySelector('.hl-lines'),
      bars = [...lines.children],
      live = element.querySelector('.hl-live'),
      hand = element.querySelector('.hl-hand');
    let open = false,
      hover = false,
      openedAt = 0,
      spin = null,
      bgTimer = 0,
      previewCycle = -1,
      fired = {},
      handDown = false;
    function apply() {
      const p = api.params;
      element.style.setProperty('--gap', p.gap + 'px');
      element.style.setProperty('--shift', p.shift + 'px');
      element.style.setProperty('--dur', p.duration + 'ms');
      element.style.setProperty('--weight', p.weight + 'px');
    }
    function intro() {
      bars.forEach((b, i) =>
        api.animate(b, [{ clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)' }], {
          duration: 1000,
          delay: 120 + i * 100,
          easing: OUT,
          fill: 'backwards',
        }),
      );
    }
    function setHover(on) {
      if (on === hover) return;
      hover = on;
      element.classList.toggle('is-hover', on);
      if (on && open && !api.reduced) {
        if (spin) spin.cancel();
        spin = api.animate(lines, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(90deg)' }], {
          duration: 600,
          easing: OUT,
        });
      }
    }
    function setOpen(next) {
      open = next;
      element.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (spin) {
        spin.cancel();
        spin = null;
      }
      clearTimeout(bgTimer);
      element.classList.remove('is-open-late');
      if (open) bgTimer = setTimeout(() => element.classList.add('is-open-late'), 400);
      live.textContent = open ? 'Menu opened.' : 'Menu closed.';
    }
    api.listen(btn, 'pointerenter', (e) => {
      if (e.pointerType !== 'touch' && !api.paused) setHover(true);
    });
    api.listen(btn, 'pointerleave', () => setHover(false));
    api.listen(btn, 'focus', () => {
      if (btn.matches(':focus-visible')) setHover(true);
    });
    api.listen(btn, 'blur', () => setHover(false));
    api.listen(btn, 'click', () => {
      if (!api.paused) setOpen(!open);
    });
    api.cleanup(() => clearTimeout(bgTimer));
    api.on('params', apply);
    api.on('replay', () => {
      if (open) setOpen(false);
      setHover(false);
      live.textContent = '';
      previewCycle = -1;
      intro();
    });
    const live2 = !!(cardOpt && cardOpt.interactive);
    let handOff = false;
    function takeOver(on) {
      if (handOff) return;
      handOff = true;
      setHover(!!on);
      if (cardOpt.pointer) cardOpt.pointer({ x: 0, y: 0, opacity: 0, down: false });
    }
    if (live2) {
      const real = (e) => e.pointerType !== 'touch' && btn.contains(e.target);
      api.listen(
        element,
        'pointermove',
        (e) => {
          if (!handOff && !(e.pointerType === 'mouse' && !e.movementX && !e.movementY)) takeOver(real(e));
        },
        true,
      );
      api.listen(element, 'pointerdown', (e) => takeOver(real(e)), true);
      api.listen(btn, 'focus', () => {
        if (btn.matches(':focus-visible')) takeOver(true);
      });
      api.listen(btn, 'click', () => {
        if (api.paused) return;
        takeOver(btn.matches(':hover'));
        if (cardOpt.touched) cardOpt.touched();
      });
      api.restore = () => {
        takeOver(false);
        if (open) setOpen(false);
        setHover(false);
        live.textContent = '';
      };
    }
    const center = (el, fx = 0.5, fy = 0.5) => {
      const s = element.getBoundingClientRect(),
        r = el.getBoundingClientRect();
      return { x: r.left - s.left + r.width * fx, y: r.top - s.top + r.height * fy };
    };
    function path(t) {
      const s = element.getBoundingClientRect(),
        rest = { x: s.width * 0.7, y: s.height * 0.8 },
        b = center(btn, 0.62, 0.66),
        near = { x: b.x + s.width * 0.09, y: b.y + s.height * 0.1 };
      if (cardOpt && cardOpt.near) {
        const r = btn.getBoundingClientRect();
        near.x = b.x + r.width * cardOpt.near[0];
        near.y = b.y + r.height * cardOpt.near[1];
      }
      const pts = [
        [0, rest, 0],
        [0.6, rest, 0],
        [0.8, rest, 1],
        [1.3, b, 1],
        [2.3, b, 1],
        [2.7, near, 1],
        [3.0, near, 1],
        [3.35, b, 1],
        [4.2, b, 1],
        [4.55, near, 1],
        [4.8, near, 1],
        [5.15, b, 1],
        [6.1, b, 1],
        [6.7, rest, 1],
        [7.2, rest, 0],
        [8, rest, 0],
      ];
      let a = pts[0],
        z = pts[0];
      for (let i = 0; i < pts.length - 1; i++) {
        if (t >= pts[i][0] && t <= pts[i + 1][0]) {
          a = pts[i];
          z = pts[i + 1];
          break;
        }
      }
      const u = z[0] === a[0] ? 1 : R.smooth((t - a[0]) / (z[0] - a[0]));
      return { x: R.mix(a[1].x, z[1].x, u), y: R.mix(a[1].y, z[1].y, u), o: R.mix(a[2], z[2], u) };
    }
    api.frame(({ time, reduced }) => {
      if (live2 && !handOff && cardOpt.once && time >= 8) takeOver(btn.matches(':hover'));
      if (live2 && handOff) return false;
      if (!options.preview || reduced) return false;
      const c = Math.floor(time / 8),
        t = time % 8;
      if (c !== previewCycle) {
        previewCycle = c;
        fired = {};
        if (open) setOpen(false);
        setHover(false);
        if (c > 0 && !cardOpt) intro();
      }
      const h = path(t);
      if (!cardOpt) {
        hand.style.opacity = h.o.toFixed(3);
        hand.style.transform = 'translate3d(' + h.x.toFixed(1) + 'px,' + h.y.toFixed(1) + 'px,0)';
      }
      const over = (t >= 1.2 && t < 2.45) || (t >= 3.25 && t < 4.4) || (t >= 5.05 && t < 6.3);
      setHover(over);
      const down = (t >= 3.6 && t < 3.75) || (t >= 5.6 && t < 5.75);
      if (cardOpt) {
        if (cardOpt.pointer) cardOpt.pointer({ x: h.x, y: h.y, opacity: h.o, down });
      } else if (down !== handDown) {
        handDown = down;
        hand.classList.toggle('is-down', down);
      }
      if (t >= 3.65 && !fired.o) {
        fired.o = true;
        setOpen(true);
      }
      if (t >= 5.65 && !fired.c) {
        fired.c = true;
        setOpen(false);
      }
      return true;
    });
    const wrap = element.querySelector('.hl-wrap');
    function fit() {
      const w = element.clientWidth,
        h = element.clientHeight;
      if (!w || !h) return;
      element.style.setProperty(
        '--fit',
        Math.max(1, Math.min((0.45 * w) / wrap.offsetWidth, (0.42 * h) / wrap.offsetHeight)).toFixed(3),
      );
    }
    if (!cardOpt) {
      const ro = new ResizeObserver(fit);
      ro.observe(element);
      api.cleanup(() => ro.disconnect());
      fit();
    }
    apply();
    if (!cardOpt) intro();
    const status = api.status;
    api.status = () => ({
      ...status(),
      open,
      hover,
      offset: (() => {
        const m = getComputedStyle(bars[0]).transform;
        return m === 'none' ? 0 : new DOMMatrix(m).m42;
      })(),
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountHairlineBurger(element, options) {
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
    element.classList.add('hairline-burger');
    element.innerHTML = '<div class="fx-board" data-hl></div>';
    const stage = element,
      board = stage.querySelector('[data-hl]'),
      cursor = createCursor(stage);
    const narrow = matchMedia('(max-width: 760px)');
    const fit = () => {
      const W = stage.clientWidth,
        H = stage.clientHeight;
      let k = Math.min(3, (H * 0.5) / 104, (W * 0.5) / 72);
      return Math.max(1, k);
    };
    const place = () => board.style.setProperty('--hl-k', fit().toFixed(4));
    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);
    const inst = mount(board, {
      params: options.params,
      preview: true,
      card: {
        labels: ['Menu', 'Close'],
        interactive: true,
        once: true,
        near: [0.42, 0.28],
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
  global.mountHairlineBurger = mountHairlineBurger;
  if (typeof module === 'object' && module.exports) module.exports = mountHairlineBurger;
})(typeof window !== 'undefined' ? window : this);
