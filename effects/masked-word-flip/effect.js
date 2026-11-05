/*
 * Masked Word Flip
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A two-line label whose words roll up out of a mask and are replaced by the next pair (Studio Index, Selected Work,
 * Recent Projects), with dots showing which one is up. It cycles on its own and steps forward when you hover, move,
 * click or press a key. Good for a hero heading, a section label or a nav title that names several things.
 *
 * How it moves
 * - Each line is a one-cell grid with overflow: hidden. All words of a line sit in the same cell; the one shown is at
 *   translateY(0), the others wait at 100% (below the mask).
 * - A flip moves the current word 0 -> -100% (out the top) and the next word 100% -> 0 (in from below), both with the Web
 *   Animations API, params.duration ms, cubic-bezier(.22,1,.36,1), fill backwards. The final transform is written inline
 *   first, so cancelling or finishing an animation never leaves a word half way.
 * - The second line starts params.lineDelay ms after the first.
 * - Auto cycle: the next flip comes params.hold s + duration after the last one, plus 3 s extra when it lands back on
 *   the first pair, so the loop has a visible start.
 * - Hover (mouse or pen): entering the block flips once and pauses the auto cycle. While the pointer stays inside, every
 *   max(80 px, 30% of the block width) of pointer travel flips again. Movement during a running flip does not count.
 *   Leaving resumes the cycle after hold seconds.
 * - Click / tap and Enter, Space or an arrow key flip once. A request during a running flip is queued and runs as soon
 *   as it ends (at most one queued); key repeat is ignored.
 * - Size: the block's font size is fitted to the element (max 96 px, 64 px when the viewport is 760 px wide or less)
 *   and the block is centred. Lines are as wide as their longest word, so the block never jumps.
 * - Demo, once on load (4.6 s): a fake cursor moves onto the block, flips at 0.82 s, 2.1 s and 3.12 s (the last one is
 *   a click) and fades out. Any real pointer move, press or focus ends it; the auto cycle then carries on.
 *
 * Options
 *   params.hold       0.8..4, default 1.5     seconds a pair stays up in the auto cycle
 *   params.duration   200..1200, default 400  ms per flip
 *   params.lineDelay  0..150, default 0       ms the second line lags behind the first
 *   reducedMotion     true / false / null     force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountMaskedWordFlip(element, {params: {...}, reducedMotion: null});
 *   fx.params                       copy of current params
 *   fx.setParams({duration: 600})   change params live
 *   fx.setPaused(true|false)        freeze / resume the cycle
 *   fx.reset()                      params back to defaults, demo stopped, rolls back to the first pair
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                    removes listeners, observers and the fake cursor
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:480px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountMaskedWordFlip(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The word pairs: STATES in mountMaskedWordFlip (any number of pairs, two lines each). The accessible name is built
 *   from it.
 * - Font, weight, letter spacing, colours and the dots via effect.css.
 * - params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The out-expo curve cubic-bezier(.22,1,.36,1): fast start, long settle. A linear or ease-in-out roll looks mechanical.
 * - Old word and new word must move together by exactly 100% of the line height, inside the overflow mask.
 * - The extra 3 s rest on the first pair and the movement threshold for hover; without them it flips too often.
 * - Do not let a framework re-render the words while the effect runs; it animates them directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountMaskedWordFlip on an embed div with a fixed height.
 * - It refits when the element resizes and once web fonts have loaded; nothing to call yourself.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The block is focusable (tabindex 0, role group) and its label lists every pair, so a screen reader gets all words
 *   at once; the moving words and dots are aria-hidden.
 * - With reduced motion: no fake cursor, no auto cycle, no roll. Click, keys and hover still change the pair, instantly.
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
  const R = { mix, smooth };

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
    { key: 'hold', type: 'range', default: 1.5, min: 0.8, max: 4, step: 0.1 },
    { key: 'duration', type: 'range', default: 400, min: 200, max: 1200, step: 50 },
    { key: 'lineDelay', type: 'range', default: 0, min: 0, max: 150, step: 10 },
  ];

  // ---- the effect ----
  const OUT = 'cubic-bezier(.22, 1, .36, 1)',
    REST = 3,
    FIRST = 0.6;
  const STEER_END = 4.6,
    STEER_PATH = 0.3;
  const DEMO_STATES = [
    ['Studio', 'Index'],
    ['Selected', 'Work'],
    ['Recent', 'Projects'],
  ];
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('flip-stage');
    const cardOpt = options.card || null,
      STATES = (cardOpt && cardOpt.states) || DEMO_STATES;
    if (cardOpt)
      element.innerHTML = cardOpt.block(
        [0, 1]
          .map((line) =>
            cardOpt.line(
              STATES.map((s, i) => '<span class="flip-word" data-state="' + i + '">' + s[line] + '</span>').join('') +
                '<span class="flip-word flip-echo"></span>',
            ),
          )
          .join(''),
        STATES.map((_, i) => cardOpt.tick(i)).join(''),
      );
    else
      element.innerHTML =
        '<div class="flip-block" tabindex="0" role="group" aria-label="Rotating label"><p class="cr-sr flip-live" aria-live="polite"></p><div class="flip-lines" aria-hidden="true">' +
        [0, 1]
          .map(
            (line) =>
              '<span class="flip-line">' +
              STATES.map((s, i) => '<span class="flip-word" data-state="' + i + '">' + s[line] + '</span>').join('') +
              '<span class="flip-word flip-echo"></span></span>',
          )
          .join('') +
        '</div><div class="flip-ticks" aria-hidden="true">' +
        STATES.map((_, i) => '<i data-tick="' + i + '"></i>').join('') +
        '</div></div><p class="cr-hint" data-cr-chrome>Rotates on its own · Hover the words to flip</p><div class="flip-hand" aria-hidden="true"></div>';
    const block = element.querySelector('.flip-block'),
      lines = [...element.querySelectorAll('.flip-line')],
      live = element.querySelector('.flip-live'),
      ticks = [...element.querySelectorAll('.flip-ticks i')],
      hand = element.querySelector('.flip-hand');
    const words = lines.map((l) => [...l.querySelectorAll('.flip-word[data-state]')]),
      echoes = lines.map((l) => l.querySelector('.flip-echo'));
    const steer = !!(cardOpt && cardOpt.interactive && cardOpt.steer);
    let flipsDone = 0,
      state = 0,
      clock = 0,
      next = FIRST,
      busy = 0,
      previewCycle = -1,
      previewRolled = false;
    const mark = (t, on) => {
      t.classList.toggle('is-on', on);
      if (cardOpt && cardOpt.mark) cardOpt.mark(t, on);
    };
    const set = (el, y) => {
      el.style.transform = 'translate3d(0,' + y + '%,0)';
    };
    function settle() {
      words.forEach((ws) => ws.forEach((w, i) => set(w, i === state ? 0 : 100)));
      echoes.forEach((e) => set(e, 100));
      ticks.forEach((t, i) => mark(t, i === state));
      live.textContent = STATES[state].join(' ');
    }
    function move(el, from, to, delay) {
      set(el, to);
      if (api.reduced) return;
      api.animate(
        el,
        [{ transform: 'translate3d(0,' + from + '%,0)' }, { transform: 'translate3d(0,' + to + '%,0)' }],
        { duration: api.params.duration, delay, easing: OUT, fill: 'backwards' },
      );
    }
    function flip() {
      const from = state;
      state = (state + 1) % STATES.length;
      lines.forEach((l, li) => {
        const d = li * api.params.lineDelay;
        move(words[li][from], 0, -100, d);
        move(words[li][state], 100, 0, d);
      });
      ticks.forEach((t, i) => mark(t, i === state));
      live.textContent = STATES[state].join(' ');
      busy = clock + (api.params.duration + api.params.lineDelay) / 1000;
    }
    function rollHover() {
      if (api.paused || api.reduced || clock < busy) return false;
      lines.forEach((l, li) => {
        const w = words[li][state],
          e = echoes[li];
        e.textContent = w.textContent;
        move(w, 0, -100, 0);
        move(e, 100, 0, 0);
      });
      busy = clock + api.params.duration / 1000;
      rollPending = true;
      return true;
    }
    let rollPending = false;
    function finishRoll() {
      if (!rollPending) return;
      rollPending = false;
      lines.forEach((l, li) => {
        set(words[li][state], 0);
        set(echoes[li], 100);
      });
    }
    if (!steer) {
      api.listen(block, 'pointerenter', (event) => {
        if (event.pointerType !== 'touch') rollHover();
      });
      api.listen(block, 'focus', () => rollHover());
      api.listen(block, 'pointerdown', (event) => {
        if (event.pointerType === 'touch') rollHover();
      });
    }
    api.on('replay', () => {
      element.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      state = 0;
      clock = 0;
      next = FIRST;
      busy = 0;
      rollPending = false;
      queued = false;
      path = 0;
      previewCycle = -1;
      settle();
    });
    api.on('motion', (reduced) => {
      if (reduced) {
        element.getAnimations({ subtree: true }).forEach((a) => a.finish());
        rollPending = false;
        settle();
      }
    });
    let handOff = false,
      queued = false,
      hovering = false,
      path = 0,
      pShown = false;
    const live2 = cardOpt && cardOpt.interactive;
    function takeOver() {
      if (handOff) return;
      handOff = true;
      const t = api.time - Math.max(0, previewCycle) * 8,
        step = api.params.hold + api.params.duration / 1000,
        at = [FIRST, FIRST + step, FIRST + step * 2];
      next = steer
        ? hovering
          ? Infinity
          : clock + cadence()
        : clock + Math.max(0, (flipsDone < at.length ? at[flipsDone] : 8 + FIRST) - t);
      if (cardOpt.pointer) cardOpt.pointer({ x: 0, y: 0, opacity: 0 });
    }
    if (live2) {
      const real = (e) => {
        if (e.type === 'pointermove' && e.pointerType === 'mouse' && !e.movementX && !e.movementY) return;
        takeOver();
      };
      api.listen(element, 'pointermove', real);
      api.listen(element, 'pointerdown', real);
      api.listen(block, 'focus', real);
      api.restore = () => {
        takeOver();
        element.getAnimations({ subtree: true }).forEach((a) => a.finish());
        finishRoll();
        const from = state;
        if (from !== 0) {
          state = 0;
          lines.forEach((l, li) => {
            const d = li * api.params.lineDelay;
            move(words[li][from], 0, -100, d);
            move(words[li][0], 100, 0, d);
          });
          ticks.forEach((t, i) => mark(t, i === 0));
          live.textContent = STATES[0].join(' ');
          busy = clock + (api.params.duration + api.params.lineDelay) / 1000;
        }
        queued = false;
        path = 0;
        next = clock + api.params.hold + api.params.duration / 1000 + REST;
        api.wake();
      };
    }
    const cadence = () => api.params.hold + api.params.duration / 1000 + (state === 0 ? REST : 0);
    function userFlip() {
      flip();
      path = 0;
      next = hovering ? Infinity : clock + cadence();
      if (cardOpt.touched) cardOpt.touched();
    }
    function request() {
      if (api.reduced) {
        flip();
        busy = clock;
        if (cardOpt.touched) cardOpt.touched();
        return;
      }
      if (clock < busy - 1e-3) queued = true;
      else userFlip();
      api.wake();
    }
    if (steer) {
      // Travel is summed from clientX / clientY steps, the same CSS px as offsetWidth. Not movementX / Y: inside a
      // zoomed iframe Chrome reports those in window px, which would flip k times as often. A step only counts between two
      // events of the same pointer: a pen and then the mouse would otherwise book one jump across the block.
      let lastX = null,
        lastY = 0,
        lastId = null;
      api.listen(block, 'pointerenter', (e) => {
        if (e.pointerType === 'touch') return;
        takeOver();
        hovering = true;
        path = 0;
        lastX = null;
        next = Infinity;
        request();
      });
      api.listen(block, 'pointerleave', (e) => {
        if (e.pointerType === 'touch') return;
        hovering = false;
        path = 0;
        lastX = null;
        if (handOff) next = Math.max(clock, busy) + api.params.hold;
        api.wake();
      });
      api.listen(block, 'pointermove', (e) => {
        if (e.pointerType === 'touch' || !hovering || !handOff) return;
        const step = lastX === null || e.pointerId !== lastId ? 0 : Math.hypot(e.clientX - lastX, e.clientY - lastY);
        lastX = e.clientX;
        lastY = e.clientY;
        lastId = e.pointerId;
        if (clock < busy || queued) {
          path = 0;
          return;
        }
        path += step;
        if (path >= Math.max(80, block.offsetWidth * STEER_PATH)) request();
      });
      api.listen(block, 'pointerdown', (e) => {
        if (e.button > 0) return;
        takeOver();
        request();
      });
      api.listen(block, 'keydown', (e) => {
        if (!/^(Enter| |Spacebar|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(e.key)) return;
        e.preventDefault();
        if (e.repeat) return;
        takeOver();
        request();
      });
    }
    function steerHand(t) {
      const r = block.getBoundingClientRect(),
        s = element.getBoundingClientRect(),
        ox = r.right - s.left + 24,
        oy = r.bottom - s.top + 18,
        ax = r.left - s.left + r.width * 0.7,
        ay = r.top - s.top + r.height * 0.62,
        bx = r.left - s.left + r.width * 0.3,
        by = r.top - s.top + r.height * 0.3;
      if (t < 0.2) return { x: ox, y: oy, o: 0 };
      if (t < 0.4) return { x: ox, y: oy, o: (t - 0.2) / 0.2 };
      if (t < 1)
        return { x: R.mix(ox, ax, R.smooth((t - 0.4) / 0.6)), y: R.mix(oy, ay, R.smooth((t - 0.4) / 0.6)), o: 1 };
      if (t < 1.6) return { x: ax, y: ay, o: 1 };
      if (t < 2.3) {
        const u = R.smooth((t - 1.6) / 0.7);
        return { x: R.mix(ax, bx, u), y: R.mix(ay, by, u), o: 1 };
      }
      if (t < 3.7) return { x: bx, y: by, o: 1, down: t >= 3.1 && t < 3.28 };
      const u = R.smooth((t - 3.7) / 0.6);
      return { x: R.mix(bx, ox, u), y: R.mix(by, oy, u), o: 1 - u };
    }
    const STEER_AT = [0.82, 2.1, 3.12];
    function previewHand(t) {
      const r = block.getBoundingClientRect(),
        s = element.getBoundingClientRect(),
        cx = r.left - s.left + r.width * 0.62,
        cy = r.top - s.top + r.height * 0.36,
        ox = cardOpt ? r.right - s.left + 24 : s.width * 0.86,
        oy = cardOpt ? r.bottom - s.top + 18 : s.height * 0.82;
      if (t < 5.2) return { x: ox, y: oy, o: 0 };
      if (t < 5.5) return { x: ox, y: oy, o: (t - 5.2) / 0.3 };
      if (t < 6.2) {
        const u = R.smooth((t - 5.5) / 0.7);
        return { x: R.mix(ox, cx, u), y: R.mix(oy, cy, u), o: 1 };
      }
      if (t < 7.1) return { x: cx, y: cy, o: 1 };
      const u = R.smooth((t - 7.1) / 0.6);
      return { x: R.mix(cx, ox, u), y: R.mix(cy, oy, u), o: 1 - u };
    }
    api.frame(({ dt, time, params, reduced }) => {
      if (reduced) return false;
      clock += dt;
      if (rollPending && clock >= busy) finishRoll();
      if (live2 && !handOff && cardOpt.once && time >= (steer ? STEER_END : 8)) takeOver();
      if (steer && !handOff) {
        const due = STEER_AT.filter((x) => x <= time).length;
        if (due > flipsDone && clock >= busy - 1e-3) {
          flip();
          flipsDone++;
        }
        const h = steerHand(Math.min(time, STEER_END));
        if (cardOpt.pointer)
          cardOpt.pointer({ x: h.x, y: h.y, opacity: Math.max(0, Math.min(1, h.o)), down: !!h.down });
        return true;
      }
      if (options.preview && !(live2 && handOff)) {
        const t = time % 8,
          cycle = Math.floor(time / 8);
        if (cycle !== previewCycle) {
          previewCycle = cycle;
          element.getAnimations({ subtree: true }).forEach((a) => a.finish());
          rollPending = false;
          state = 0;
          settle();
          previewRolled = false;
          flipsDone = 0;
        }
        const step = params.hold + params.duration / 1000,
          at = [FIRST, FIRST + step, FIRST + step * 2];
        const due = at.filter((x) => x <= t).length;
        if (due > flipsDone && clock >= busy - 1e-3) {
          flip();
          flipsDone++;
        }
        const h = previewHand(t);
        if (cardOpt) {
          if (cardOpt.pointer) cardOpt.pointer({ x: h.x, y: h.y, opacity: Math.max(0, Math.min(1, h.o)) });
        } else {
          hand.style.opacity = Math.max(0, Math.min(1, h.o)).toFixed(3);
          hand.style.transform = 'translate3d(' + h.x.toFixed(1) + 'px,' + h.y.toFixed(1) + 'px,0)';
        }
        if (!previewRolled && t >= 6.2) {
          previewRolled = rollHover();
        }
        return true;
      }
      if (queued && clock >= busy - 1e-3) {
        queued = false;
        userFlip();
        return true;
      }
      if (clock >= next && clock >= busy) {
        flip();
        next = clock + params.hold + params.duration / 1000 + (state === 0 ? REST : 0);
      }
      return true;
    });
    settle();
    const status = api.status;
    api.status = () => ({ ...status(), state, text: STATES[state].join(' '), rolling: rollPending });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountMaskedWordFlip(element, options) {
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
    element.classList.add('masked-word-flip');
    element.innerHTML = '<div class="fx-board" data-flip></div>';
    const stage = element,
      board = stage.querySelector('[data-flip]'),
      cursor = createCursor(stage),
      narrow = matchMedia('(max-width:760px)');
    const STATES = [
      ['Studio', 'Index'],
      ['Selected', 'Work'],
      ['Recent', 'Projects'],
    ];
    const inst = mount(board, {
      params: options.params,
      preview: true,
      card: {
        states: STATES,
        block: (lines, ticks) =>
          '<div class="flip-block ck-panel" tabindex="0" role="group" aria-label="Rotating label: ' +
          STATES.map((s) => s.join(' ')).join(', ') +
          '"><p class="flip-live" hidden></p><div aria-hidden="true">' +
          lines +
          '<div class="ck-rule"></div><div class="flip-ticks">' +
          ticks +
          '</div></div></div>',
        line: (words) => '<div class="ck-row"><span class="flip-line ck-text" data-strong>' + words + '</span></div>',
        tick: () => '<i class="ck-dot" data-weak></i>',
        mark: (el, on) => {
          el.toggleAttribute('data-accent', on);
          el.toggleAttribute('data-weak', !on);
        },
        interactive: true,
        once: true,
        steer: true,
        pointer: cursor.set,
      },
    });
    const block = board.querySelector('.flip-block'),
      lines = [...block.querySelectorAll('.flip-line')];
    function layout() {
      const W = stage.clientWidth,
        H = stage.clientHeight;
      block.style.fontSize = '100px';
      const tw = Math.max(...lines.map((l) => l.offsetWidth));
      block.style.setProperty('--fx-k', (tw / 176).toFixed(4));
      const w = block.offsetWidth / 100,
        h = block.offsetHeight / 100;
      let F,
        top = 0;
      if (narrow.matches) F = Math.min(64, (W - 80) / w, (H - 80) / h);
      else F = Math.min(96, (W - 80) / w, (H - 96) / h);
      block.style.fontSize = F.toFixed(2) + 'px';
      block.style.setProperty('--fx-k', (((tw / 176) * F) / 100).toFixed(4));
      block.style.left = ((W - block.offsetWidth) / 2).toFixed(1) + 'px';
      block.style.top = Math.max(top, (H - block.offsetHeight) / 2).toFixed(1) + 'px';
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
  global.mountMaskedWordFlip = mountMaskedWordFlip;
  if (typeof module === 'object' && module.exports) module.exports = mountMaskedWordFlip;
})(typeof window !== 'undefined' ? window : this);
