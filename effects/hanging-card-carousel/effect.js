/*
 * Hanging Card Carousel
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Eight cards hang from pins on a horizontal rail. Drag the rail and it glides on after release, snaps to a whole card,
 * and every card swings on its pin when the rail speeds up or brakes, then settles back to vertical. Good for a
 * services row, a team or feature carousel, or any row that should feel physical.
 *
 * How it moves
 * - The rail has one offset in px. Dragging moves it 1:1 with the pointer (dragging right moves the cards right).
 *   Past either end it rubber-bands: over -> d x (1 - 1 / (over / d + 1)) with d = 0.55 x lane width.
 * - Release velocity is the last pointer velocity (smoothed, 60 % new sample each move), zero if the pointer stood
 *   still for more than 90 ms, clamped to +-4200 px/s.
 * - Glide: the natural stop is offset + v / resistance, rounded to the nearest whole card. If the throw is faster than
 *   40 px/s and heads that way, the rail glides there on an exponential curve, offset = end - (end - start) x
 *   exp(-k t), with k = v / distance clamped to 0.6..1.8 x resistance, so it leaves at the release speed and lands
 *   exactly on a card. Otherwise, and whenever it is released past an end, a spring pulls it to the card / end
 *   (stiffness 170, damping ratio 0.86).
 * - Swing: each card is a damped pendulum. Natural frequency 8.2 + ((i x 37) mod 7) x 0.18 rad/s, so neighbours swing
 *   slightly out of step; damping ratio 0.085, so it swings back several times. It is driven by the rail's
 *   acceleration (velocity smoothed at rate 30, acceleration clamped to +-30000 px/s^2, scaled by 235 / card width so
 *   small cards swing like big ones) times 0.19 x swing / 9. The angle is capped at 2.2 x swing degrees; hitting the cap
 *   reverses the angular speed at 30 %. Card bodies rotate by the angle around their top; the connector (line and pin)
 *   rotates by -0.8 x the angle, so the hanger kinks against the card.
 * - While dragging, all cards get data-lifted (a slightly stronger shadow). The pin of the card nearest the centre is
 *   marked with the accent colour.
 * - Size: the rail sits 174 px from the top (centred vertically under 760 px). Card height = 0.575 x lane height x
 *   cardScale / 100 (at least 60 px), width = 0.72 x height, gap = max(10 px, 0.14 x width). The card at the offset is
 *   centred; the rail starts on the second card and can travel seven cards.
 * - Demo, once on load (8 s): a fake cursor drags the rail left with an accelerating stroke and lets go (glide and
 *   swing), then at 4.2 s drags it back right. The first real press ends it for good.
 *
 * Options
 *   params.resistance  2..10, default 4.5    glide decay; higher stops sooner and shorter
 *   params.swing       2..16, default 9      swing strength and cap (cap = 2.2 x swing degrees)
 *   params.cardScale   75..115, default 100  card size in percent; the rail re-measures and keeps its position
 *   reducedMotion      true / false / null   force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountHangingCardCarousel(element, {params: {...}, reducedMotion: null});
 *   fx.params                  copy of current params
 *   fx.setParams({swing: 14})  change params live
 *   fx.setPaused(true|false)   freeze / resume; pausing releases a running drag
 *   fx.reset()                 params back to defaults, demo stopped, the rail eases back to the second card over 0.5 s
 *                              (cubic-bezier(0.22, 1, 0.36, 1)) while the swing fades out
 *   fx.setReducedMotion(bool)
 *   fx.destroy()               removes listeners, observers and the fake cursor
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountHangingCardCarousel(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Card faces: the item callback in mountHangingCardCarousel returns the HTML for card i (now a white tile with a
 *   mark); the hanger callback draws the connector. Each card is an article labelled "Service 01".."Service 08"
 *   (the services array). The count is eight; the travel is computed as 7 x card step.
 * - Colours, shadow, rail and pin styles in effect.css. Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - Swing driven by acceleration, not velocity: cards must hang still while the rail moves at constant speed and kick
 *   when it starts or brakes.
 * - The low damping ratio (0.085) and the slightly different frequency per card; equal frequencies make the row swing
 *   as one stiff block.
 * - The exponential glide solved to land on a whole card; snapping after a free glide looks like a correction.
 * - Rotation around the card's top edge and the counter-rotated connector.
 * - Do not let a framework re-render the cards while the effect runs; it writes transforms to them directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). Without it the rAF loop and listeners leak. In React StrictMode the mount runs twice; destroy
 *   in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountHangingCardCarousel on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The track is a focusable role="group" (tabindex 0, labelled "Hanging card track with eight items..."; the stage
 *   shows an accent ring on keyboard focus only); cards are articles with their labels. ArrowLeft / ArrowRight glide
 *   one card (with the same glide and swing as a throw), Home / End go to the first / last card, so all eight are
 *   reachable from the keyboard; a key also ends the demo.
 * - With reduced motion: no swing, no glide, no spring, no rubber band, no demo. Dragging still moves the rail inside
 *   its bounds and release snaps straight to the nearest card.
 * - The rAF loop runs only while something moves: once the demo is over, the rail has stopped and every card has
 *   swung back to rest, it stops; the next press, key or reset wakes it. It also stops when the tab is hidden, the
 *   stage is off screen or it is paused.
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
  function bars() {
    return '<div class="cr-bars" aria-hidden="true"><i></i><i></i><i></i></div>';
  }
  const R = { mark, bars, clamp, mix, smooth };

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

  const CONTROLS = [
    { key: 'resistance', type: 'range', default: 4.5, min: 2, max: 10, step: 0.5 },
    { key: 'swing', type: 'range', default: 9, min: 2, max: 16, step: 1 },
    { key: 'cardScale', type: 'range', default: 100, min: 75, max: 115, step: 1 },
  ];

  // ---- the effect ----
  const services = Array.from({ length: 8 }, (_, i) => 'Service ' + String(i + 1).padStart(2, '0'));
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('services-stage');
    const cardOpt = options.card || null;
    const live = !!(cardOpt && cardOpt.interactive);
    let handOff = false,
      back = null,
      prior = null;
    if (cardOpt)
      element.innerHTML =
        '<div class="services-scroller"' +
        (live ? ' tabindex="0"' : '') +
        ' role="group" aria-label="Hanging card track' +
        (live ? ' with eight items. Drag or use the left and right arrow keys, Home and End.' : '') +
        '"><div class="services-rail" aria-hidden="true">' +
        (cardOpt.rail ? cardOpt.rail() : '') +
        '</div><div class="services-track">' +
        services
          .map(
            (s, i) =>
              '<article class="hanging-card" aria-label="' +
              s +
              '"><div class="service-connector" aria-hidden="true">' +
              (cardOpt.hanger ? cardOpt.hanger(i) : '') +
              '</div><div class="service-card-body">' +
              (cardOpt.item ? cardOpt.item(i) : '') +
              '</div></article>',
          )
          .join('') +
        '</div></div>';
    else
      element.innerHTML =
        '<div class="services-scroller" tabindex="0" role="group" aria-label="Hanging card track with eight items. Drag or use the left and right arrow keys."><div class="services-rail" aria-hidden="true"></div><div class="services-track">' +
        services
          .map(
            (s, i) =>
              '<article class="hanging-card" aria-label="' +
              s +
              '"><div class="service-connector" aria-hidden="true"><svg viewBox="0 0 50 74"><path d="M25 8V60" stroke="currentColor" stroke-width="2.5"/><circle class="service-pin" cx="25" cy="8" r="5"/><circle cx="25" cy="64" r="5" fill="#fff" stroke="currentColor" stroke-width="2.5"/></svg></div><div class="service-card-body"><div class="service-card-top"><span>' +
              String(i + 1).padStart(2, '0') +
              '</span><i aria-hidden="true"></i></div>' +
              R.mark(i, 'service-symbol') +
              '<h2>' +
              s +
              '</h2>' +
              R.bars() +
              '</div></article>',
          )
          .join('') +
        '</div><div class="services-hand" aria-hidden="true"></div></div><div class="services-bottom" data-cr-chrome><span class="services-count" aria-live="polite">01 / 08</span><span>Drag · Release to glide and swing back</span><div class="cr-arrows"><button type="button" class="cr-arrow services-prev" aria-label="Previous">←</button><button type="button" class="cr-arrow services-next" aria-label="Next">→</button></div></div>';
    const scroller = element.querySelector('.services-scroller'),
      cards = [...element.querySelectorAll('.hanging-card')],
      bodies = cards.map((c) => c.querySelector('.service-card-body')),
      connectors = cards.map((c) => c.querySelector('.service-connector')),
      counter = element.querySelector('.services-count'),
      hand = element.querySelector('.services-hand'),
      prev = element.querySelector('.services-prev'),
      next = element.querySelector('.services-next');
    let fresh = true,
      width = 1,
      height = 1,
      cardW = 1,
      cardH = 1,
      gap = 1,
      step = 1,
      max = 1,
      left = 0,
      unit = 1,
      offset = 0,
      velocity = 0,
      smoothV = 0,
      glide = null,
      spring = null,
      drag = null,
      lastIndex = -1,
      lastCurrent = -1,
      introDone = false;
    let pendulums = services.map((_, i) => ({ angle: 0, speed: 0, omega: 8.2 + ((i * 37) % 7) * 0.18 }));
    const rubber = (over, dim) => dim * 0.55 * (1 - 1 / (over / (dim * 0.55) + 1));
    function layout() {
      if (live) prior = { step, offset };
      if (cardOpt) {
        width = scroller.clientWidth;
        height = scroller.clientHeight;
        cardH = (Math.max(60, height * 0.575) * api.params.cardScale) / 100;
        cardW = cardH * 0.72;
        gap = Math.max(10, cardW * 0.14);
        step = cardW + gap;
        max = step * 7;
        left = (width - cardW) / 2;
        unit = 235 / cardW;
        if (!drag && !glide && !spring) offset = R.clamp(offset, 0, max);
        cards.forEach((c) => {
          c.style.width = cardW + 'px';
          c.style.height = cardH + 'px';
        });
        if (fresh && width > 1) {
          fresh = false;
          restart();
        }
        return;
      }
      width = scroller.clientWidth;
      height = scroller.clientHeight;
      cardH =
        (Math.max(100, Math.min(height - (api.height < 500 ? 40 : 64), height * 0.84, api.width < 620 ? 400 : 440)) *
          api.params.cardScale) /
        100;
      cardW = cardH * 0.72;
      gap = Math.max(18, cardW * 0.12);
      step = cardW + gap;
      max = Math.max(0, step * 8 - gap + width * 0.14 - width);
      if (!drag && !glide && !spring) offset = R.clamp(offset, 0, max);
      cards.forEach((c) => {
        c.style.width = cardW + 'px';
        c.style.height = cardH + 'px';
      });
      element.style.setProperty('--service-size', cardW + 'px');
      if (fresh && width > 1) {
        fresh = false;
        restart();
      }
    }
    api.on('resize', layout);
    api.on('params', layout);
    const snap = (x) => R.clamp(Math.round(x / step) * step, 0, max);
    function fling(v) {
      spring = null;
      glide = null;
      if (offset < 0 || offset > max) {
        spring = { to: offset < 0 ? 0 : max };
        velocity = v;
        return;
      }
      const k = api.params.resistance,
        natural = offset + v / k,
        end = snap(natural),
        dist = end - offset;
      if (Math.abs(v) > 40 && Math.sign(dist) === Math.sign(v) && Math.abs(dist) > 2) {
        const kk = R.clamp(v / dist, k * 0.6, k * 1.8);
        glide = { from: offset, to: end, k: kk, t: 0, v0: v };
        velocity = v;
      } else {
        spring = { to: end };
        velocity = v;
      }
    }
    function goTo(x) {
      if (api.reduced) {
        offset = R.clamp(x, 0, max);
        velocity = 0;
        glide = spring = null;
        api.paint();
        return;
      }
      const dist = R.clamp(x, 0, max) - offset;
      fling(dist * api.params.resistance);
      api.wake();
    }
    function jump(direction) {
      goTo(snap(offset) + direction * step);
    }
    if (!cardOpt) {
      api.listen(prev, 'click', () => jump(-1));
      api.listen(next, 'click', () => jump(1));
    }
    api.listen(scroller, 'keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        jump(event.key === 'ArrowLeft' ? -1 : 1);
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        goTo(event.key === 'Home' ? 0 : max);
      }
    });
    function press(x) {
      drag = { x, base: offset - 0, raw: offset, at: performance.now(), v: 0 };
      glide = spring = null;
      velocity = 0;
      scroller.classList.add('is-dragging');
      if (cardOpt && cardOpt.lift) cardOpt.lift(true);
    }
    function moveTo(x, now) {
      const dt = Math.max(0.008, (now - drag.at) / 1000),
        dx = x - drag.x;
      drag.raw -= dx;
      const prevOffset = offset;
      offset =
        drag.raw < 0 ? -rubber(-drag.raw, width) : drag.raw > max ? max + rubber(drag.raw - max, width) : drag.raw;
      if (api.reduced) offset = R.clamp(offset, 0, max);
      const v = (offset - prevOffset) / dt;
      drag.v = R.mix(drag.v, v, 0.6);
      drag.x = x;
      drag.at = now;
    }
    function letGo() {
      if (!drag) return;
      const v = performance.now() - drag.at > 90 ? 0 : R.clamp(drag.v, -4200, 4200);
      drag = null;
      scroller.classList.remove('is-dragging');
      if (cardOpt && cardOpt.lift) cardOpt.lift(false);
      if (api.reduced) {
        offset = snap(offset);
        return;
      }
      fling(v);
    }
    api.listen(scroller, 'pointerdown', (event) => {
      if (event.button !== 0 || api.paused || options.preview) return;
      scroller.setPointerCapture(event.pointerId);
      press(event.clientX);
      drag.id = event.pointerId;
      api.wake();
    });
    api.listen(scroller, 'pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id || api.paused) return;
      moveTo(event.clientX, performance.now());
      api.paint();
      api.wake();
    });
    function release(event) {
      if (!drag || drag.id == null) return;
      if (scroller.hasPointerCapture(drag.id)) scroller.releasePointerCapture(drag.id);
      if (event && event.type === 'pointercancel') drag.v = 0;
      letGo();
      api.paint();
      api.wake();
    }
    api.listen(scroller, 'pointerup', release);
    api.listen(scroller, 'pointercancel', release);
    api.on('pause', (value) => {
      if (value) release();
    });
    api.on('visibility', (visible) => {
      if (!visible) release();
    });
    function restart() {
      drag = null;
      scroller.classList.remove('is-dragging');
      if (cardOpt && cardOpt.lift) cardOpt.lift(false);
      velocity = smoothV = 0;
      glide = spring = null;
      lastIndex = lastCurrent = -1;
      pendulums.forEach((p) => {
        p.angle = p.speed = 0;
      });
      introDone = !!options.preview || api.reduced;
      offset = cardOpt ? R.clamp(step, 0, max) : introDone ? 0 : -width * 0.95;
      if (!introDone) {
        glide = { from: offset, to: 0, k: 4.2, t: 0, v0: width * 0.95 * 4.2 };
      }
    }
    api.on('replay', restart);
    api.on('motion', (reduced) => {
      if (reduced) {
        glide = spring = null;
        velocity = 0;
        offset = snap(offset);
        pendulums.forEach((p) => {
          p.angle = p.speed = 0;
        });
      }
    });
    api.on('destroy', () => release());
    const handPath = (t) => {
      t %= 8;
      const L = step * 2.2,
        y = height * 0.55,
        ax = cardOpt ? left + step + cardW * 0.25 : width * 0.66,
        bx = cardOpt ? left - step + cardW * 0.75 : width * 0.3;
      if (t < 0.5) return { x: ax, y, down: false, o: R.smooth(t / 0.5) };
      if (t < 0.7) return { x: ax, y, down: true, o: 1 };
      if (t < 1.25) {
        const k = Math.pow((t - 0.7) / 0.55, 1.7);
        return { x: ax - k * L * 0.72, y: y + k * 6, down: true, o: 1 };
      }
      if (t < 1.9) {
        const k = (t - 1.25) / 0.65;
        return { x: ax - L * 0.72 - k * 30, y: y + 6, down: false, o: 1 - R.smooth(k) };
      }
      if (t < 4.2) return { x: bx, y, down: false, o: 0 };
      if (t < 4.6) return { x: bx, y, down: false, o: R.smooth((t - 4.2) / 0.4) };
      if (t < 4.8) return { x: bx, y, down: true, o: 1 };
      if (t < 5.35) {
        const k = Math.pow((t - 4.8) / 0.55, 1.7);
        return { x: bx + k * L * 0.72, y: y - k * 6, down: true, o: 1 };
      }
      if (t < 6) {
        const k = (t - 5.35) / 0.65;
        return { x: bx + L * 0.72 + k * 30, y: y - 6, down: false, o: 1 - R.smooth(k) };
      }
      return { x: ax, y, down: false, o: 0 };
    };
    let handDown = false;
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
    const RESTORE = 0.5,
      outEase = cubicBezier(0.22, 1, 0.36, 1);
    function takeOver() {
      if (handOff) return;
      handOff = true;
      if (handDown) {
        handDown = false;
        if (drag && drag.id == null) {
          drag.v = 0;
          letGo();
        }
      }
      if (cardOpt.pointer) cardOpt.pointer({ x: 0, y: 0, opacity: 0, down: false });
    }
    function stepBack(dt, reduced) {
      back.t += dt;
      const u = reduced ? 1 : Math.min(1, back.t / RESTORE),
        e = outEase(u);
      offset = R.mix(back.from, back.to, e);
      velocity = smoothV = 0;
      glide = spring = null;
      pendulums.forEach((p, i) => {
        p.angle = back.a[i] * (1 - e);
        p.speed = 0;
      });
      if (u >= 1) back = null;
    }
    if (live) {
      api.listen(scroller, 'pointerdown', (event) => {
        if (event.button !== 0 || api.paused || !options.preview) return;
        takeOver();
        back = null;
        scroller.setPointerCapture(event.pointerId);
        press(event.clientX);
        drag.id = event.pointerId;
        api.wake();
      });
      api.listen(scroller, 'pointermove', (event) => {
        if (drag && drag.id === event.pointerId && !api.paused && cardOpt.touched) cardOpt.touched();
      });
      api.listen(
        scroller,
        'keydown',
        (event) => {
          if (api.paused || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          takeOver();
          back = null;
          if (cardOpt.touched) cardOpt.touched();
        },
        { capture: true },
      );
      const rescale = () => {
        const p0 = prior;
        prior = null;
        if (!p0 || p0.step <= 1 || p0.step === step) return;
        const f = step / p0.step;
        offset = p0.offset * f;
        if (drag) drag.raw *= f;
        if (glide) {
          glide.from *= f;
          glide.to *= f;
        }
        if (spring) spring.to *= f;
        if (back) {
          back.from *= f;
          back.to *= f;
        }
        if (!drag && !glide && !spring && !back) offset = R.clamp(offset, 0, max);
      };
      api.on('resize', rescale);
      api.on('params', rescale);
      api.on('replay', () => {
        back = null;
      });
      api.restore = () => {
        takeOver();
        if (drag) {
          if (drag.id != null && scroller.hasPointerCapture(drag.id)) scroller.releasePointerCapture(drag.id);
          drag = null;
          scroller.classList.remove('is-dragging');
          if (cardOpt.lift) cardOpt.lift(false);
        }
        glide = spring = null;
        velocity = smoothV = 0;
        const home = R.clamp(step, 0, max);
        if (api.reduced) {
          back = null;
          offset = home;
          pendulums.forEach((p) => {
            p.angle = p.speed = 0;
          });
          api.paint();
          return;
        }
        back = { t: 0, from: offset, to: home, a: pendulums.map((p) => p.angle) };
        api.wake();
      };
    }
    api.frame(({ dt, time, params, reduced }) => {
      if (back) stepBack(dt, reduced);
      if (live && !handOff && cardOpt.once && time >= 8) takeOver();
      if (options.preview && !reduced && !(live && handOff)) {
        const h = handPath(time);
        if (cardOpt) {
          if (cardOpt.pointer) cardOpt.pointer({ x: h.x, y: h.y, opacity: h.o, down: h.down });
        } else {
          hand.style.opacity = h.o.toFixed(3);
          hand.style.transform = 'translate3d(' + h.x + 'px,' + h.y + 'px,0) scale(' + (h.down ? 0.82 : 1) + ')';
          hand.classList.toggle('is-down', h.down);
        }
        if (h.down && !handDown) {
          press(h.x);
          handDown = true;
        } else if (h.down && drag) {
          moveTo(h.x, drag.at + dt * 1000);
        } else if (!h.down && handDown) {
          if (drag) drag.at = performance.now();
          letGo();
          handDown = false;
        }
      }
      const before = offset;
      if (!drag && !reduced && dt > 0) {
        if (glide) {
          glide.t += dt;
          const e = Math.exp(-glide.k * glide.t);
          offset = glide.to - (glide.to - glide.from) * e;
          velocity = (glide.to - glide.from) * glide.k * e;
          if (Math.abs(glide.to - offset) < 0.3) {
            offset = glide.to;
            velocity = 0;
            glide = null;
            introDone = true;
          }
        } else if (spring) {
          const k = 170,
            c = 2 * Math.sqrt(k) * 0.86;
          velocity += (-k * (offset - spring.to) - c * velocity) * dt;
          offset += velocity * dt;
          if (Math.abs(offset - spring.to) < 0.3 && Math.abs(velocity) < 4) {
            offset = spring.to;
            velocity = 0;
            spring = null;
          }
        }
      }
      if (reduced && !drag) offset = R.clamp(offset, 0, max);
      const v = dt > 0 ? (offset - before) / dt : 0,
        prevV = smoothV;
      smoothV = dt > 0 ? R.mix(smoothV, v, 1 - Math.exp(-30 * dt)) : smoothV;
      const accel = dt > 0 ? R.clamp((smoothV - prevV) / dt, -30000, 30000) * unit : 0;
      const gain = ((0.19 * params.swing) / 9) * (cardOpt && !cardOpt.fullSwing ? 0.5 : 1),
        limit = params.swing * (cardOpt && !cardOpt.fullSwing ? 0.8 : 2.2);
      let moving = false;
      cards.forEach((card, i) => {
        const p = pendulums[i],
          x = (cardOpt ? left : width * 0.07) + i * step - offset;
        if (!reduced && dt > 0) {
          const w = p.omega,
            z = 0.085;
          p.speed += (-w * w * p.angle - 2 * z * w * p.speed + gain * accel) * dt;
          p.angle += p.speed * dt;
          if (Math.abs(p.angle) > limit) {
            p.angle = Math.sign(p.angle) * limit;
            p.speed *= -0.3;
          }
          if (Math.abs(p.angle) < 0.01 && Math.abs(p.speed) < 0.05) p.angle = p.speed = 0;
        }
        if (reduced) p.angle = p.speed = 0;
        card.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
        bodies[i].style.transform = 'rotate(' + p.angle.toFixed(3) + 'deg)';
        connectors[i].style.transform = 'rotate(' + (-p.angle * 0.8).toFixed(3) + 'deg)';
        moving = moving || Math.abs(p.angle) + Math.abs(p.speed) > 0.01;
      });
      const index = R.clamp(Math.round(offset / step), 0, 7);
      if (index !== lastIndex) {
        if (counter) counter.textContent = String(index + 1).padStart(2, '0') + ' / 08';
        lastIndex = index;
      }
      if (index !== lastCurrent) {
        cards.forEach((c, i) => c.classList.toggle('is-current', i === index));
        lastCurrent = index;
        if (cardOpt && cardOpt.current) cardOpt.current(index);
      }
      if (!cardOpt) {
        prev.disabled = offset <= 0.5 && !glide && !spring;
        next.disabled = offset >= max - 0.5 && !glide && !spring;
      }
      element.dataset.offset = offset.toFixed(3);
      element.dataset.phase = drag
        ? 'dragging'
        : !introDone
          ? 'entering'
          : moving || glide || spring
            ? 'settling'
            : 'resting';
      return (options.preview && !(live && handOff)) || !!drag || !!glide || !!spring || moving;
    });
    const status = api.status;
    api.status = () => ({
      ...status(),
      offset,
      target: glide ? glide.to : spring ? spring.to : offset,
      velocity,
      max,
      cardWidth: cardW,
      cardHeight: cardH,
      dragging: !!drag,
      angles: pendulums.map((p) => p.angle),
      visibleCards: cards.map((_, i) => {
        const x = (cardOpt ? left : width * 0.07) + i * step - offset;
        return x + cardW > 0 && x < width;
      }),
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountHangingCardCarousel(element, options) {
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
    element.classList.add('hanging-card-carousel');
    element.innerHTML = '<div class="fx-board"><div class="ck-lane" data-physics></div></div>';
    const stage = element,
      board = stage.querySelector('.fx-board'),
      lane = board.querySelector('[data-physics]'),
      cursor = createCursor(stage, { inertia: false });
    const PANEL_B = 158,
      GAP = 16,
      below = matchMedia('(max-width:760px)');
    let ox = 0,
      oy = 0,
      pins = [],
      tiles = [],
      current = -1;
    function fit() {
      const W = stage.clientWidth,
        H = stage.clientHeight;
      let h, rail;
      if (below.matches) {
        h = Math.min((H - 120) / 0.65, (W * 0.56) / 0.414);
        rail = (H - 0.65 * h) / 2;
      } else {
        rail = PANEL_B + GAP;
        h = Math.min((H - 56 - rail) / 0.65, (W * 0.26) / 0.414);
      }
      h = Math.round(h);
      ox = 0;
      oy = Math.round(rail - 0.175 * h);
      lane.style.top = oy + 'px';
      lane.style.height = h + 'px';
      board.style.setProperty('--phys-k', (h / 240).toFixed(4));
    }
    fit();
    const observer0 = new ResizeObserver(fit);
    observer0.observe(stage);
    const inst = mount(lane, {
      params: options.params,
      preview: true,
      card: {
        interactive: true,
        once: true,
        fullSwing: true,
        rail: () => '<i class="ck-line"></i>',
        hanger: () => '<i class="ck-line" data-v data-strong></i><span class="ck-dot"></span>',
        item: (i) => media({ glyph: i, lift: true }),
        current: (i) => {
          if (pins[current]) pins[current].removeAttribute('data-accent');
          current = i;
          if (pins[i]) pins[i].setAttribute('data-accent', '');
        },
        lift: (on) => tiles.forEach((t) => t.toggleAttribute('data-lifted', on)),
        pointer: (s) => cursor.set(Object.assign({}, s, { x: s.x + ox, y: s.y + oy })),
      },
    });
    pins = [...lane.querySelectorAll('.service-connector .ck-dot')];
    tiles = [...lane.querySelectorAll('.ck-media')];
    if (pins[current]) pins[current].setAttribute('data-accent', '');

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
  global.mountHangingCardCarousel = mountHangingCardCarousel;
  if (typeof module === 'object' && module.exports) module.exports = mountHangingCardCarousel;
})(typeof window !== 'undefined' ? window : this);
