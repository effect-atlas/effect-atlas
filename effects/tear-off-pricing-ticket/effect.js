/*
 * Tear-Off Pricing Ticket
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Three pricing plans as paper tickets with a real perforation. Scroll and they rise into place, flipping from their
 * dark back to the front; hover one and its stub tears off with a small bounce while the barcode turns into the button.
 * Made for a pricing section.
 *
 * How it moves
 * - Two independent parts: the scroll entrance (params.entrance) and the hover tear (params.tear).
 * - Entrance progress p runs 0..1 over params.travel x element height of wheel / touch-drag / key input. The wheel is
 *   captured on the element (preventDefault) while p can still move, so the page does not scroll until the tickets are in.
 * - Start pose: each ticket is turned rotateY(params.flip) (back side facing) and pushed down by
 *   rise = element height - ticket top - 0.5 x ticket height, so only its upper half shows.
 * - Per ticket n: sink = rise x (1 - S(p / SETTLE[n])), turn = flip x (1 - S((p - 0.2) / (SETTLE[n] - 0.2))), each
 *   clamped 0..1, with SETTLE = [0.46, 0.72, 1] and S = cubic-bezier(.45,.05,.4,1). So the tickets land one after
 *   another and each starts turning only after a fifth of the travel.
 * - Smoothing is two chained exponential dampers, frame-rate independent: glide chases the raw input at 5/s,
 *   p chases glide at 24/s. Do not replace with a tween.
 * - Row perspective is 5.5 x ticket width; the 3D transform is written on .tk-flip, both faces use backface-visibility.
 * - Input details: wheel deltas in lines count 32 px, pages count one element height. Arrow Up/Down move 100 px,
 *   Page Up/Down one element height. A touch drag moves p and hands any leftover to window.scrollBy.
 * - Wheel latch: once the wheel has driven p, further wheel ticks are still swallowed at the end of the range until there
 *   has been a 250 ms gap, so one fling does not carry on into page scroll.
 * - End push: at either end, the first 100 px of wheel are swallowed (counter resets after 1200 ms idle or a direction
 *   change), and nothing passes while p is still settling.
 * - Tear (CSS, class .is-torn on the ticket): the stub moves translate3d(0, 13px, 0) rotate(4deg) in 460 ms with
 *   cubic-bezier(.3,.6,.25,1.38), which dips a little past then settles; it goes back in 280 ms with
 *   cubic-bezier(.22,1,.36,1). Barcode bars widen with scaleX((width + gap + 0.6) / width) over 460 ms
 *   cubic-bezier(.4,0,.5,1) (280 ms back); 260 ms in, a solid fill fades over them (180 ms) and the label fades in.
 * - params.tearSize scales the 13 px / 4 deg; params.bounce sets the curve's last control value to 1 + 0.38 x bounce/100.
 * - The perforation is real holes: both halves grow a row of rounded teeth (a mask, --tk-teeth) that overlap by a few px
 *   at rest and separate when torn. The shadow is a drop-shadow on the whole face so it follows the teeth.
 * - Compact tickets: when a ticket is narrower than 170 px the row switches to .tk-compact and the button reads "Choose".
 * - Demo, once on load (about 5.6 s): a fake cursor wheels the tickets in (0.4 to 2 s), then hovers the middle ticket
 *   to tear it (3.5 to 4.9 s) and fades out. Any real wheel, pointer move, press or focus ends it for good.
 *
 * Options
 *   params.entrance  true / false, default true    scroll entrance; off = tickets always in place
 *   params.tear      true / false, default true    hover tear; off = hover does nothing
 *   params.tearSize  0..250, default 100           tear distance and angle in percent of 13 px / 4 deg
 *   params.bounce    0..200, default 100           overshoot of the tear curve in percent
 *   params.flip      0..360, default 165           starting rotateY in degrees
 *   params.travel    1..6, default 3               entrance length in element heights of scrolling
 *   reducedMotion    true / false / null           force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountTearOffPricingTicket(element, {params: {...}, reducedMotion: null});
 *   fx.params                    copy of current params
 *   fx.setParams({flip: 90})     change params live
 *   fx.setPaused(true|false)     freeze / resume (hover and input are ignored while paused)
 *   fx.reset()                   params back to defaults, tickets untorn, p glides back to the start in 0.5 s
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                 removes listeners, observers and the fake cursor
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountTearOffPricingTicket(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Plans: the PLANS array (name, price, cta, accent). Keep three, SETTLE has one entry per ticket.
 * - Barcode pattern (BARS, pairs of bar width and gap) and the punched marks on the back (MARKS).
 * - Colours, radius, fonts, shadow via the CSS variables and rules in effect.css; --tk-pitch and --tk-tooth for the teeth.
 * - params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The SETTLE values, the 0.2 turn delay and the in-out curve S; they make the staggered landing.
 * - The two damper rates 5/s and 24/s and their order (input -> glide -> p).
 * - The tear curve with y2 above 1 and the asymmetric 460 ms in / 280 ms out. A plain ease loses the snap.
 * - The torn state must stay a class toggle with CSS transitions, so a quick hover in and out reverses cleanly.
 * - Do not let a framework re-render the tickets while the effect runs; it writes transforms to them directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountTearOffPricingTicket on an embed div with a fixed height.
 * - The entrance listens to wheel on the element itself, not to page scroll. To drive it from page scroll instead you
 *   would need to feed the progress yourself; that is not built in.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - Each ticket is an article labelled with plan and price; the button is a real link (labelled "<cta>, <plan> plan")
 *   and keyboard focus tears its ticket. Clicks are prevented and announced in a polite live region; wire your own
 *   navigation there. The back face is aria-hidden.
 * - On touch a tap tears a ticket and keeps it torn; tapping it again or outside closes it.
 * - With reduced motion: no fake cursor, no entrance (tickets in place, front side up), and all CSS
 *   transitions are off, so the hover tear still happens but snaps without the bounce.
 * - The loop runs only while something moves and stops when the tab is hidden, the element is off screen or paused.
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
  const damp = (a, b, rate, dt) => mix(a, b, 1 - Math.exp(-rate * dt));
  const R = { clamp, smooth, mix, damp };

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
    { key: 'entrance', type: 'toggle', default: true },
    { key: 'tear', type: 'toggle', default: true },
    { key: 'tearSize', type: 'range', default: 100, min: 0, max: 250, step: 10 },
    { key: 'bounce', type: 'range', default: 100, min: 0, max: 200, step: 10 },
    { key: 'flip', type: 'range', default: 165, min: 0, max: 360, step: 15 },
    { key: 'travel', type: 'range', default: 3, min: 1, max: 6, step: 0.1 },
  ];

  // ---- the effect ----
  const PLANS = [
    { name: 'Starter', price: '12', cta: 'Get started' },
    { name: 'Studio', price: '29', cta: 'Start free trial', accent: true },
    { name: 'Team', price: '79', cta: 'Talk to sales' },
  ];
  const SETTLE = [0.46, 0.72, 1],
    TURN_AT = 0.2,
    GLIDE_RATE = 5,
    SHOW_RATE = 24,
    RESTORE = 0.5,
    KEY = 100;
  const BARS = [
    [2, 1],
    [1, 1],
    [1, 2],
    [3, 1],
    [1, 1],
    [2, 2],
    [1, 1],
    [1, 1],
    [3, 2],
    [1, 1],
    [2, 1],
    [1, 2],
    [1, 1],
    [2, 1],
    [3, 1],
    [1, 2],
    [1, 1],
    [2, 1],
    [1, 1],
    [1, 2],
    [2, 1],
    [3, 1],
    [1, 1],
    [2, 0],
  ];
  const UNITS = BARS.reduce((s, [w, g]) => s + w + g, 0);
  function bezierEase(ax, ay, bx, by) {
    const coord = (c1, c2, t) => {
      const m = 1 - t;
      return t * (3 * m * m * c1 + 3 * m * t * c2 + t * t);
    };
    return (u) => {
      if (u <= 0) return 0;
      if (u >= 1) return 1;
      let a = 0,
        b = 1;
      for (let k = 0; k < 24; k++) {
        const t = (a + b) * 0.5;
        if (coord(ax, bx, t) < u) a = t;
        else b = t;
      }
      return coord(ay, by, (a + b) * 0.5);
    };
  }
  const SWAY = bezierEase(0.45, 0.05, 0.4, 1),
    settleOut = bezierEase(0.22, 1, 0.36, 1);
  const unit = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  function pose(n, p) {
    const end = SETTLE[n];
    return { sink: 1 - SWAY(unit(p / end)), turn: 1 - SWAY(unit((p - TURN_AT) / (end - TURN_AT))) };
  }
  function bars() {
    let x = 0;
    return BARS.map(([w, g]) => {
      const s =
        '<i style="left:' +
        ((x / UNITS) * 100).toFixed(3) +
        '%;width:' +
        ((w / UNITS) * 100).toFixed(3) +
        '%;--s:' +
        (g ? (w + g + 0.6) / w : 1).toFixed(3) +
        '"></i>';
      x += w + g;
      return s;
    }).join('');
  }
  const MARKS = [
    '<path d="M3 3l6 6M9 3L3 9"/>',
    '<circle cx="6" cy="6" r="3.6"/>',
    '<rect x="2.6" y="2.6" width="6.8" height="6.8"/>',
    '<path d="M6 2v8M2 6h8"/>',
  ];
  const code = (i) =>
    '<span class="tk-marks" aria-hidden="true">' +
    [0, 1, 2, 3].map((k) => '<svg viewBox="0 0 12 12">' + MARKS[(k + i) % 4] + '</svg>').join('') +
    '</span>';
  function ticket(pl, i, card) {
    const front =
      '<div class="tk-face tk-front"><div class="tk-body">' +
      '<span class="tk-name ck-text" data-strong>' +
      pl.name +
      (pl.accent ? '<i class="ck-dot" data-accent aria-hidden="true"></i>' : '') +
      '</span>' +
      '<span class="tk-amount ck-num">$' +
      pl.price +
      '</span>' +
      (card ? '' : '<span class="tk-label ck-num" aria-hidden="true">TEAR ALONG LINE</span>') +
      '</div>' +
      '<div class="tk-stub">' +
      '<a href="#" class="tk-code"' +
      (card && !card.interactive ? ' tabindex="-1"' : '') +
      ' aria-label="' +
      pl.cta +
      ', ' +
      pl.name +
      ' plan"><span class="tk-bars" aria-hidden="true">' +
      bars() +
      '</span><span class="tk-cta ck-text" data-strong data-full="' +
      pl.cta +
      '">' +
      (card ? 'Choose' : pl.cta) +
      '</span></a></div></div>';
    const back =
      '<div class="tk-face tk-back" aria-hidden="true"><div class="tk-body"><span class="tk-corner"></span>' +
      code(i) +
      '</div>' +
      '<div class="tk-stub"><span class="tk-corner" data-b></span></div></div>';
    return (
      '<article class="tk-ticket" data-i="' +
      i +
      '" aria-label="' +
      pl.name +
      ' plan, $' +
      pl.price +
      ' per month"><div class="tk-flip">' +
      front +
      back +
      '</div></article>'
    );
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('tk-stage');
    const card = options.card || null,
      live = !!(card && card.interactive);
    const row =
      '<div class="tk-row">' +
      PLANS.map((pl, i) => ticket(pl, i, card && !card.layout ? card : null)).join('') +
      '</div>';
    if (card)
      element.innerHTML =
        '<div class="tk-view' +
        (card.layout ? '' : ' tk-fade') +
        '">' +
        row +
        '</div><p class="cr-sr tk-live" aria-live="polite"></p>';
    else
      element.innerHTML =
        '<div class="tk-scroller" tabindex="0" aria-label="Pricing. Scroll to bring the tickets in."><div class="tk-runway"><div class="tk-pin"><div class="tk-view"><div class="tk-intro"><div class="tk-title" role="heading" aria-level="2">Pricing</div><div class="ck-hint">Pick a plan. Switch or cancel any time.</div></div>' +
        row +
        '</div></div></div></div>' +
        '<p class="cr-hint" data-cr-chrome>Scroll to bring the tickets in · Hover a ticket to tear it</p><p class="cr-sr tk-live" aria-live="polite"></p><svg class="tk-hand" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8.2-6.1 1.3-3.2 5.6z"/></svg>';
    const view = element.querySelector('.tk-view'),
      rowEl = element.querySelector('.tk-row'),
      tickets = [...element.querySelectorAll('.tk-ticket')],
      flips = tickets.map((t) => t.querySelector('.tk-flip')),
      scroller = element.querySelector('.tk-scroller'),
      runway = element.querySelector('.tk-runway'),
      pin = element.querySelector('.tk-pin'),
      live2 = element.querySelector('.tk-live'),
      hand = element.querySelector('.tk-hand');
    if (card && !live) tickets.forEach((t) => t.querySelectorAll('a').forEach((a) => (a.tabIndex = -1)));
    let scroll = 0,
      glide = 0,
      p = 0,
      rise = 0,
      torn = [false, false, false],
      handOff = false,
      back = null,
      stuck = -1;
    const looping = (!!options.preview || !!card) && !(card && card.once);
    const startP = () => (api.params.entrance && !api.reduced ? (looping ? 1 : 0) : 1);
    const handDriven = () => (card ? !(live && handOff) : !!options.preview);
    function setTorn(i, on) {
      on = !!on && api.params.tear;
      if (torn[i] === on) return;
      torn[i] = on;
      tickets[i].classList.toggle('is-torn', on);
    }
    function untearAll() {
      torn.forEach((_, i) => setTorn(i, false));
      stuck = -1;
    }
    function apply() {
      const q = api.params,
        s = element.style,
        k = q.tearSize / 100;
      s.setProperty('--tk-drop', (13 * k).toFixed(2) + 'px');
      s.setProperty('--tk-turn', (4 * k).toFixed(2) + 'deg');
      s.setProperty('--tk-in', 'cubic-bezier(.3,.6,.25,' + (1 + (0.38 * q.bounce) / 100).toFixed(3) + ')');
      if (!q.tear) untearAll();
      if (!q.entrance) {
        scroll = glide = p = 1;
      }
    }
    function layout() {
      const W = api.width,
        H = api.height;
      let x = 0,
        y = null,
        w = W,
        h = 0;
      if (card && card.layout) {
        const L = card.layout(W, H) || {};
        x = L.x || 0;
        y = L.y == null ? null : L.y;
        w = L.w || W;
        h = L.h || 0;
      } else if (!card) {
        const pad = Math.max(16, W * 0.06);
        w = Math.min(W - pad * 2, 760);
        x = (W - w) / 2;
      }
      const gap = Math.max(10, Math.min(20, w * 0.026)),
        tw = (w - gap * 2) / 3,
        compact = (!!card && !card.layout) || tw < 170;
      rowEl.classList.toggle('tk-compact', compact);
      rowEl.querySelectorAll('.tk-cta').forEach((c) => {
        c.textContent = compact ? 'Choose' : c.dataset.full;
      });
      Object.assign(rowEl.style, {
        left: x + 'px',
        width: w + 'px',
        height: h ? h + 'px' : '',
        gap: gap + 'px',
        perspective: (tw * 5.5).toFixed(1) + 'px',
      });
      tickets.forEach((t) => t.style.setProperty('--tk-bh', t.querySelector('.tk-front .tk-body').offsetHeight + 'px'));
      const th = tickets[0].offsetHeight,
        intro = element.querySelector('.tk-intro');
      let top = y == null ? Math.max(0, (H - th) / 2) : y;
      if (intro) top = Math.max(top, intro.offsetTop + intro.offsetHeight + 28);
      rowEl.style.top = top + 'px';
      rise = Math.max(0, H - top - th * 0.5);
      if (scroller) {
        runway.style.height = api.reduced || !api.params.entrance ? '100%' : H + api.params.travel * H + 'px';
        pin.style.height = H + 'px';
      }
    }
    function render() {
      const q = api.params,
        still = api.reduced || !q.entrance;
      flips.forEach((f, i) => {
        if (still) {
          f.style.transform = 'none';
          return;
        }
        const at = pose(i, p);
        f.style.transform =
          'translate3d(0,' + (at.sink * rise).toFixed(2) + 'px,0) rotateY(' + (at.turn * q.flip).toFixed(2) + 'deg)';
      });
      element.dataset.progress = p.toFixed(4);
    }
    api.on('resize', layout);
    api.on('params', () => {
      apply();
      layout();
    });
    api.on('motion', (reduced) => {
      back = null;
      if (reduced) {
        scroll = glide = p = 1;
        if (live) take();
      }
      layout();
    });
    api.on('replay', () => {
      untearAll();
      scroll = glide = p = startP();
      cycle = -1;
      handTime = 0;
      if (scroller) scroller.scrollTop = api.params.entrance ? scroll * api.params.travel * api.height : 0;
    });
    flips.forEach((f, i) => {
      api.listen(f, 'pointerenter', (e) => {
        if (e.pointerType === 'touch' || api.paused || handDriven()) return;
        setTorn(i, true);
      });
      api.listen(f, 'pointerleave', (e) => {
        if (e.pointerType === 'touch' || stuck === i || handDriven()) return;
        setTorn(i, false);
      });
      api.listen(f, 'focusin', () => {
        if (card && !live) return;
        if (live) take();
        setTorn(i, true);
      });
      api.listen(f, 'focusout', () => {
        if (stuck !== i) setTorn(i, false);
      });
      api.listen(f, 'click', (e) => {
        const a = e.target.closest('a');
        if (a) e.preventDefault();
        if (api.paused || (card && !live)) return;
        if (e.pointerType === 'touch' || lastType === 'touch') {
          stuck = torn[i] && stuck === i ? -1 : i;
          torn.forEach((_, j) => {
            if (j !== i) setTorn(j, false);
          });
          setTorn(i, stuck === i);
        } else if (a) live2.textContent = PLANS[i].cta + ' (' + PLANS[i].name + ') clicked.';
      });
    });
    let lastType = '';
    api.listen(
      element,
      'pointerdown',
      (e) => {
        lastType = e.pointerType;
        if (e.pointerType === 'touch' && stuck >= 0 && !tickets[stuck].contains(e.target)) {
          setTorn(stuck, false);
          stuck = -1;
        }
      },
      true,
    );
    function travelPx() {
      return Math.max(1, api.params.travel * api.height);
    }
    function nudge(d) {
      const was = scroll;
      scroll = R.clamp(scroll + d / travelPx(), 0, 1);
      if (scroll !== was) {
        back = null;
        api.wake();
        if (card && card.touched && handOff) card.touched();
      }
      return d - (scroll - was) * travelPx();
    }
    if (scroller) {
      api.listen(
        scroller,
        'scroll',
        () => {
          if (options.preview) return;
          scroll = R.clamp(scroller.scrollTop / travelPx(), 0, 1);
          api.wake();
        },
        { passive: true },
      );
    }
    let drag = null;
    function take() {
      if (!live || handOff) return;
      handOff = true;
      untearAll();
      if (card.pointer) card.pointer({ x: 0, y: 0, opacity: 0, wheel: false, down: false });
      element.querySelectorAll('.tk-ticket:hover').forEach((t) => setTorn(+t.dataset.i, true));
    }
    function release() {
      if (!drag) return;
      const pid = drag.id;
      drag = null;
      if (element.hasPointerCapture(pid)) element.releasePointerCapture(pid);
    }
    if (live) {
      const WHEEL_GAP = 250,
        gap = card.wheelLatch ? (typeof card.wheelLatch === 'number' ? card.wheelLatch : WHEEL_GAP) : 0;
      let wheelAt = -Infinity,
        held = false;
      const PUSH_IDLE = 1200,
        push = card.endPush ? (typeof card.endPush === 'number' ? card.endPush : 100) : 0;
      let pushed = 0,
        pushDir = 0,
        pushAt = -Infinity;
      api.listen(
        element,
        'wheel',
        (e) => {
          if (e.ctrlKey || api.paused) return;
          if (!api.params.entrance || api.reduced) {
            take();
            return;
          }
          const d = e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? api.height : 1);
          if (gap && d) {
            const now = performance.now();
            if (now - wheelAt > gap) held = false;
            wheelAt = now;
          }
          if (!d || (d < 0 && scroll <= 0) || (d > 0 && scroll >= 1)) {
            if (gap && d && held) {
              e.preventDefault();
              return;
            }
            if (push && d) {
              const now = performance.now();
              if (Math.sign(d) !== pushDir || now - pushAt > PUSH_IDLE) pushed = 0;
              pushDir = Math.sign(d);
              pushAt = now;
              if (Math.abs(p - scroll) > 0.02 || back) {
                pushed = 0;
                e.preventDefault();
                return;
              }
              if (pushed < push) {
                pushed += Math.abs(d);
                e.preventDefault();
                return;
              }
            }
            take();
            return;
          }
          if (gap) held = true;
          pushed = 0;
          e.preventDefault();
          take();
          nudge(d);
        },
        { passive: false },
      );
      api.listen(element, 'pointermove', (e) => {
        if (!handOff && !(e.pointerType === 'mouse' && !e.movementX && !e.movementY)) take();
        if (!drag || e.pointerId !== drag.id || api.paused) return;
        const dy = drag.y - e.clientY;
        drag.y = e.clientY;
        if (dy && api.params.entrance && !api.reduced) {
          const left = nudge((dy * travelPx()) / api.height);
          if (Math.abs(left) > 0.5) window.scrollBy(0, (left * api.height) / travelPx());
        } else if (dy) window.scrollBy(0, dy);
      });
      api.listen(element, 'pointerdown', (e) => {
        take();
        if (e.pointerType !== 'touch' || api.paused) return;
        release();
        drag = { id: e.pointerId, y: e.clientY };
      });
      api.listen(element, 'pointerup', release);
      api.listen(element, 'pointercancel', release);
      api.listen(element, 'lostpointercapture', release);
      api.listen(element, 'keydown', (e) => {
        const k = e.key,
          step = k === 'ArrowDown' || k === 'PageDown' ? 1 : k === 'ArrowUp' || k === 'PageUp' ? -1 : 0;
        if (!step || api.paused || e.altKey || e.ctrlKey || e.metaKey || !api.params.entrance || api.reduced) return;
        if ((step < 0 && scroll <= 0) || (step > 0 && scroll >= 1)) return;
        e.preventDefault();
        take();
        nudge(step * (k.startsWith('Page') ? api.height : KEY));
      });
      api.on('destroy', release);
      api.restore = () => {
        take();
        release();
        untearAll();
        const s = startP();
        if (api.reduced || !api.params.entrance) {
          scroll = glide = p = s;
          back = null;
          render();
          return;
        }
        scroll = glide = s;
        back = { t: 0, from: p, to: s };
        api.wake();
      };
    }
    let cycle = -1,
      handTime = 0,
      handDown = false;
    const LOOP = 8,
      ONCE = 5.6;
    function mid() {
      const er = element.getBoundingClientRect(),
        r = tickets[1].querySelector('.tk-stub').getBoundingClientRect();
      return { x: r.left - er.left + r.width * 0.62, y: r.top - er.top + r.height * 0.55 };
    }
    function rest() {
      return { x: api.width * 0.5 + Math.min(90, api.width * 0.2), y: api.height * 0.6 };
    }
    function lerpPt(a, b, u) {
      u = R.smooth(u);
      return { x: R.mix(a.x, b.x, u), y: R.mix(a.y, b.y, u) };
    }
    function script(t, once) {
      const ent = api.params.entrance,
        tearOn = api.params.tear,
        M = mid(),
        S = rest();
      let pos = S,
        o = 1,
        wheel = false,
        hover = false,
        target = null;
      if (once) {
        o = t < 0.3 ? t / 0.3 : t > 5.2 ? Math.max(0, 1 - (t - 5.2) / 0.3) : 1;
        if (ent && t >= 0.4 && t < 2) {
          wheel = true;
          target = R.clamp((t - 0.4) / 1.4, 0, 1);
        } else if (ent && t >= 2) target = 1;
        if (t < 3) pos = S;
        else if (t < 3.5) pos = lerpPt(S, M, (t - 3) / 0.5);
        else if (t < 4.9) pos = M;
        else pos = lerpPt(M, S, (t - 4.9) / 0.4);
        hover = tearOn && t >= 3.5 && t < 4.9;
      } else {
        o = t < 0.3 ? t / 0.3 : t > 7.4 ? Math.max(0, 1 - (t - 7.4) / 0.4) : 1;
        if (t < 0.4) pos = S;
        else if (t < 0.9) pos = lerpPt(S, M, (t - 0.4) / 0.5);
        else if (t < 2.3) pos = M;
        else if (t < 2.7) pos = lerpPt(M, S, (t - 2.3) / 0.4);
        else pos = S;
        hover = tearOn && t >= 0.9 && t < 2.3;
        if (ent) {
          if (t >= 2.9 && t < 3.9) {
            wheel = true;
            target = 1 - (t - 2.9);
          } else if (t >= 3.9 && t < 4.8) target = 0;
          else if (t >= 4.8 && t < 5.8) {
            wheel = true;
            target = t - 4.8;
          } else target = 1;
        }
      }
      return { pos, o, wheel, hover, target };
    }
    function runHand(dt) {
      const once = !!(card && card.once);
      if (live && (handOff || (once && handTime + dt >= ONCE))) {
        take();
        return;
      }
      handTime += dt;
      const L = once ? ONCE : LOOP,
        c = Math.floor(handTime / L),
        t = handTime % L;
      if (c !== cycle) {
        cycle = c;
        if (!once && c > 0) untearAll();
      }
      const h = script(once ? Math.min(handTime, ONCE) : t, once);
      if (h.target !== null && api.params.entrance) {
        scroll = R.clamp(h.target, 0, 1);
      }
      setTorn(1, h.hover);
      if (card && card.pointer) card.pointer({ x: h.pos.x, y: h.pos.y, opacity: h.o, wheel: h.wheel, down: false });
      else if (hand) {
        hand.style.opacity = h.o.toFixed(3);
        hand.style.transform = 'translate3d(' + h.pos.x.toFixed(1) + 'px,' + h.pos.y.toFixed(1) + 'px,0)';
        hand.classList.toggle('is-wheel', h.wheel);
      }
    }
    api.frame(({ dt, reduced, params }) => {
      const handActive = !reduced && (options.preview || !!card) && !(live && handOff);
      if (handActive) runHand(dt);
      else if (card && card.pointer && reduced) card.pointer({ opacity: 0, wheel: false });
      if (reduced || !params.entrance) {
        scroll = glide = p = 1;
      } else if (back) {
        back.t += dt;
        const u = Math.min(1, back.t / RESTORE);
        p = R.mix(back.from, back.to, settleOut(u));
        if (u >= 1) {
          p = glide = scroll = back.to;
          back = null;
        }
      } else {
        glide = R.damp(glide, scroll, GLIDE_RATE, dt);
        p = R.damp(p, glide, SHOW_RATE, dt);
        if (Math.abs(glide - scroll) < 1e-5 && Math.abs(p - scroll) < 1e-5) p = glide = scroll;
      }
      render();
      return handActive || !!back || Math.abs(p - scroll) > 1e-5;
    });
    scroll = glide = p = startP();
    apply();
    layout();
    render();
    const status = api.status;
    api.status = () => ({ ...status(), scroll, glide, p, torn: torn.slice(), handOff });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountTearOffPricingTicket(element, options) {
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
    element.classList.add('tear-off-pricing-ticket');
    element.innerHTML =
      '<div class="fx-board" data-tk-board tabindex="0" role="group" aria-label="Three pricing tickets. Scroll to bring them in, hover to tear."></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-tk-board]'),
      cursor = createCursor(stage);
    const layout = (W, H) => {
      const Z = panelZone(stage, 3);
      const side = !matchMedia('(max-width: 760px)').matches,
        left = Z.right + 24,
        w = side ? Math.min(720, W - left - 40) : Math.max(240, W - 24),
        tw = (w - 36) / 3;
      const h = side && tw >= 170 ? Math.max(220, Math.min(H - 120, tw * 2)) : 0;
      board.style.setProperty('--fx-k', (h ? Math.sqrt(h / 220) : 1).toFixed(3));
      return { x: side ? left + (W - left - 24 - w) / 2 : (W - w) / 2, y: null, w, h };
    };
    const inst = mount(board, {
      params: options.params,
      card: {
        layout,
        interactive: true,
        once: true,
        wheelLatch: true,
        endPush: true,
        pointer: cursor.set,
      },
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
  global.mountTearOffPricingTicket = mountTearOffPricingTicket;
  if (typeof module === 'object' && module.exports) module.exports = mountTearOffPricingTicket;
})(typeof window !== 'undefined' ? window : this);
