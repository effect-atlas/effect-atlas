/*
 * Link Hover Set
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Two text-link hover styles side by side. "Chase Line" (Projects, Contact): two underlines race in, a blue one
 * first and a dark one chasing it. "Letter Roll" (Instagram, LinkedIn): the letters roll up one by one, the underline
 * wipes off and back, and the corner arrow flies out and is replaced. Good for navigation, footers and inline links.
 *
 * How it moves
 * - JS tweens on transforms, driven by one rAF loop that sleeps when nothing moves. All durations, the stagger and the
 *   lag are multiplied by k = 100 / params.speed.
 * - Chase Line: under the word sit three 0.07 em lines (min 1.5 px): a faint rest line (ink at 22%), an accent
 *   line and an ink line, both at scaleX(0) with origin left.
 *   Enter: the accent line grows 0 -> 1 over 700 ms; the ink line starts params.lag ms later and grows over 520 ms,
 *   so it catches up and covers the accent, which shows as a coloured leading edge. Easing for both
 *   cubic-bezier(0.22, 1, 0.36, 1).
 *   Leave: mirrored. The ink line shrinks first (600 ms), the accent line follows after lag (480 ms), both back
 *   toward the left. Tweens start from the current value, so fast in-out never jumps.
 * - Letter Roll: the text is split into one span per character, each with a copy directly below it (::after at top 100%)
 *   inside an overflow-hidden row.
 *   Enter: each character slides up by 100% over 500 ms, ease-out cubic-bezier(0.22, 1, 0.36, 1), character i
 *   starting i x params.stagger ms late. Leave: slides back down with the same stagger.
 *   Underline (ink at 30%, goes to 85% over 200 ms on enter): over 720 ms it shrinks to the right during the first 40%,
 *   stays empty until 52%, then grows back from the left, smoothstep in each part. On leave it returns to
 *   30% and full width at once.
 *   Arrow (data-arrow): two copies in a 0.62 em overflow-hidden box. On enter the visible one leaves up and to the right
 *   (120%) over 280 ms, cubic ease-in; the other comes in from the lower left starting at 160 ms, over 420 ms, ease-out.
 * - Layout: the four links are set at a font size up to 64 px (56 px at 760 px and below) and centred.
 * - Demo, once, 3 s after load: a fake cursor visits the four links (7 s; 4.4 s and three links at 760 px and below).
 *   Any real pointer move with actual movement, a press, or keyboard focus on a link ends it for good.
 *
 * Options
 *   params.speed    50..200, default 100   playback speed in percent; 200 = everything twice as fast
 *   params.stagger  0..60 ms, default 24   delay between characters in Letter Roll
 *   params.lag      0..600 ms, default 180 delay of the second line in Chase Line
 *   reducedMotion   true / false / null    force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountLinkHoverSet(element, {params: {...}, reducedMotion: null});
 *   fx.params                   copy of current params
 *   fx.setParams({stagger: 30}) change params live (values are clamped to the ranges above)
 *   fx.setPaused(true|false)    freeze / resume; new hovers are ignored while paused
 *   fx.reset()                  params back to defaults, demo ended, all links back to rest
 *   fx.setReducedMotion(bool|null)
 *   fx.destroy()                removes listeners, observers and the fake cursor
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountLinkHoverSet(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The links: the markup in mountLinkHoverSet. Any <a data-link="chase"> or <a data-link="roll"> inside the stage
 *   gets the effect; add data-arrow to a roll link for the corner arrow. Roll links are rebuilt from their text, so
 *   keep them text only. Links with href="#" have their click prevented; real hrefs navigate normally.
 * - The layout() function, including the 64 px size cap.
 * - Colours: --accent for the leading line, --ink for text and lines; line thickness in .lk-u / .lk-rule.
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - In Chase Line: accent first, ink second with the lag, and the reversed order on leave. Same-time lines look
 *   like one thick line.
 * - In Letter Roll: the per-character stagger and the 40% / 52% hold in the underline pass (the short empty moment
 *   before the line comes back from the left).
 * - Tweens restarting from the current value; restarting from 0 makes quick re-hovers flicker.
 * - Do not let a framework re-render the link contents; Letter Roll replaces the text with character spans.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountLinkHoverSet on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - Links stay real <a> elements. Letter Roll keeps the full word in a visually hidden span for screen readers; the
 *   character spans, lines and arrows are aria-hidden. The two pairs are role="group" with labels "Chase Line" and
 *   "Letter Roll". Keyboard focus (focus-visible) plays the hover; Enter follows the link. No other keyboard behaviour.
 * - Touch: the first tap on a link plays the hover and keeps it (the click is prevented); tap it again or tap
 *   elsewhere to clear.
 * - With reduced motion: no tweens and no demo cursor. Chase Line shows a static accent underline on hover;
 *   Letter Roll only brightens its underline, letters and arrow do not move. Before the first real interaction the first
 *   link of the demo tour is shown in its hover state.
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
    { key: 'speed', type: 'range', default: 100, min: 50, max: 200, step: 5 },
    { key: 'stagger', type: 'range', default: 24, min: 0, max: 60, step: 1 },
    { key: 'lag', type: 'range', default: 180, min: 0, max: 600, step: 10 },
  ];

  // ---- the effect ----
  function curve(ax, ay, bx, by) {
    const poly = (p1, p2, s) => {
      const q = 1 - s;
      return 3 * q * q * s * p1 + 3 * q * s * s * p2 + s * s * s;
    };
    return (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      let lo = 0,
        hi = 1,
        mid = t;
      for (let n = 0; n < 28; n++) {
        mid = (lo + hi) / 2;
        if (poly(ax, bx, mid) < t) lo = mid;
        else hi = mid;
      }
      return poly(ay, by, mid);
    };
  }
  const OUT = curve(0.22, 1, 0.36, 1),
    EASE = curve(0.33, 0.55, 0.2, 1);
  const accel = (t) => t * t * t;
  const wave = (t) => t * t * (3 - 2 * t);
  const T = {
    sweepLead: 700,
    sweepChase: 520,
    retractFirst: 600,
    retractSecond: 480,
    glyph: 500,
    rulePass: 720,
    ruleGone: 0.4,
    ruleBack: 0.52,
    ruleDim: 0.3,
    ruleLit: 0.85,
    ruleTint: 200,
    arrowExit: 280,
    arrowEnter: 420,
    arrowGap: 160,
    arrowTravel: 120,
  };
  const ARROW = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 8L8 2M3.2 2H8v4.8"/></svg>';
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  class Track {
    constructor(v) {
      this.v = v;
      this.move = null;
    }
    at(now) {
      const m = this.move;
      if (!m) return this.v;
      const t = (now - m.start) / m.len;
      if (t <= 0) return m.a;
      if (t >= 1) {
        this.v = m.b;
        this.move = null;
        return this.v;
      }
      return m.a + (m.b - m.a) * m.fn(t);
    }
    go(now, to, wait, len, fn) {
      this.move = { a: this.at(now), b: to, start: now + wait, len: Math.max(1, len), fn };
    }
    set(v) {
      this.v = v;
      this.move = null;
    }
    live(now) {
      return !!this.move && now < this.move.start + this.move.len;
    }
  }
  function makeChase(el) {
    el.classList.add('lk-chase');
    el.insertAdjacentHTML(
      'beforeend',
      ['lk-u0', 'lk-u1', 'lk-u2'].map((c) => '<span class="lk-u ' + c + '" aria-hidden="true"></span>').join(''),
    );
    const lead = el.querySelector('.lk-u1'),
      tail = el.querySelector('.lk-u2');
    const accent = new Track(0),
      ink = new Track(0);
    return {
      el,
      enter(now, p, k, still) {
        accent.set(0);
        ink.set(0);
        if (still) {
          accent.set(1);
          return;
        }
        accent.go(now, 1, 0, T.sweepLead * k, OUT);
        ink.go(now, 1, p.lag * k, T.sweepChase * k, OUT);
      },
      leave(now, p, k, still) {
        if (still) {
          accent.set(0);
          ink.set(0);
          return;
        }
        ink.go(now, 0, 0, T.retractFirst * k, OUT);
        accent.go(now, 0, p.lag * k, T.retractSecond * k, OUT);
      },
      rest() {
        accent.set(0);
        ink.set(0);
      },
      render(now) {
        lead.style.transform = 'scaleX(' + accent.at(now).toFixed(4) + ')';
        tail.style.transform = 'scaleX(' + ink.at(now).toFixed(4) + ')';
        return accent.live(now) || ink.live(now);
      },
    };
  }
  function rulePose(t) {
    if (t >= 1) return [1, 'left'];
    if (t < T.ruleGone) return [1 - wave(t / T.ruleGone), 'right'];
    if (t < T.ruleBack) return [0, 'left'];
    return [wave((t - T.ruleBack) / (1 - T.ruleBack)), 'left'];
  }
  function makeRoll(el) {
    const label = (el.dataset.text || el.textContent).replace(/\s+/g, ' ').trim(),
      withArrow = el.hasAttribute('data-arrow');
    el.classList.add('lk-roll');
    el.textContent = '';
    const sr = document.createElement('span');
    sr.className = 'lk-sr';
    sr.textContent = label;
    el.appendChild(sr);
    const row = document.createElement('span');
    row.className = 'lk-chars';
    row.setAttribute('aria-hidden', 'true');
    el.appendChild(row);
    const glyphs = [...label].map((ch) => {
      const g = document.createElement('span');
      g.className = 'lk-char';
      g.textContent = ch === ' ' ? '\u00a0' : ch;
      g.dataset.char = g.textContent;
      row.appendChild(g);
      return { node: g, lift: new Track(0) };
    });
    let arrows = null;
    if (withArrow) {
      el.insertAdjacentHTML(
        'beforeend',
        '<span class="lk-ne" aria-hidden="true"><span class="lk-ne-a">' +
          ARROW +
          '</span><span class="lk-ne-b">' +
          ARROW +
          '</span></span>',
      );
      arrows = [el.querySelector('.lk-ne-a'), el.querySelector('.lk-ne-b')];
    }
    el.insertAdjacentHTML('beforeend', '<span class="lk-rule" aria-hidden="true"></span>');
    const rule = el.querySelector('.lk-rule'),
      tint = new Track(T.ruleDim);
    let passFrom = null,
      passK = 1;
    const liftAll = (now, to, p, k) =>
      glyphs.forEach((g, i) => g.lift.go(now, to, i * p.stagger * k, T.glyph * k, OUT));
    const settle = (v) => {
      glyphs.forEach((g) => g.lift.set(0));
      tint.set(v);
      passFrom = null;
    };
    return {
      el,
      enter(now, p, k, still) {
        if (still) {
          settle(T.ruleLit);
          return;
        }
        liftAll(now, 1, p, k);
        tint.go(now, T.ruleLit, 0, T.ruleTint * k, EASE);
        passFrom = now;
        passK = k;
      },
      leave(now, p, k, still) {
        passFrom = null;
        if (still) {
          settle(T.ruleDim);
          return;
        }
        liftAll(now, 0, p, k);
        tint.go(now, T.ruleDim, 0, T.ruleTint * k, EASE);
      },
      rest() {
        settle(T.ruleDim);
      },
      render(now) {
        let moving = false;
        for (const g of glyphs) {
          const v = g.lift.at(now);
          g.node.style.transform = v ? 'translateY(' + (-100 * v).toFixed(3) + '%)' : '';
          moving = g.lift.live(now) || moving;
        }
        rule.style.opacity = tint.at(now).toFixed(3);
        moving = tint.live(now) || moving;
        const idle = passFrom === null,
          ms = idle ? Infinity : now - passFrom;
        const [sx, anchor] = rulePose(idle ? 1 : Math.max(0, ms / (T.rulePass * passK)));
        if (ms < T.rulePass * passK) moving = true;
        rule.style.transformOrigin = anchor + ' center';
        rule.style.transform = 'scaleX(' + sx.toFixed(4) + ')';
        if (arrows) {
          const away = idle ? 0 : accel(clamp01(ms / (T.arrowExit * passK)));
          const back = idle ? 1 : 1 - OUT(clamp01((ms - T.arrowGap * passK) / (T.arrowEnter * passK)));
          if (ms < (T.arrowGap + T.arrowEnter) * passK) moving = true;
          const d = T.arrowTravel;
          arrows[0].style.transform = 'translate(' + (d * away).toFixed(2) + '%,' + (-d * away).toFixed(2) + '%)';
          arrows[1].style.transform = 'translate(' + (-d * back).toFixed(2) + '%,' + (d * back).toFixed(2) + '%)';
        }
        return moving;
      },
    };
  }
  function demoMarkup() {
    const col = (kind, tag, cta, arrow) =>
      '<section class="lk-col" data-variant="' +
      kind +
      '"><p class="lk-tag">' +
      tag +
      '</p>' +
      '<a href="#" class="lk-cta" data-link="' +
      kind +
      '"' +
      (arrow ? ' data-arrow' : '') +
      ' data-tour="' +
      (kind === 'chase' ? 1 : 3) +
      '">' +
      cta +
      '</a>' +
      '<p class="lk-body">We design calm interfaces for <a href="#" data-link="' +
      kind +
      '"' +
      (kind === 'chase' ? ' data-tour="2"' : '') +
      '>small studios</a> and write about <a href="#" data-link="' +
      kind +
      '">the craft</a> every month.</p>' +
      '<nav class="lk-foot" aria-label="Footer">' +
      ['Work', 'Studio', 'Journal', 'Contact']
        .map(
          (w, i) =>
            '<a href="#" data-link="' +
            kind +
            '"' +
            (kind === 'roll' && i === 1 ? ' data-tour="4"' : '') +
            '>' +
            w +
            '</a>',
        )
        .join('') +
      '</nav></section>';
    return (
      '<div class="lk-scene">' +
      col('chase', 'Chase Line', 'View the work', false) +
      col('roll', 'Letter Roll', 'See it live', true) +
      '</div>' +
      '<p class="cr-hint" data-cr-chrome>Hover any link · On touch, tap a link to play it and tap again to clear</p><div class="lk-hand" aria-hidden="true"></div>'
    );
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('lk-host');
    if (getComputedStyle(element).position === 'static') element.style.position = 'relative';
    const cardOpt = options.card || null,
      live2 = !!(cardOpt && cardOpt.interactive);
    const intro = live2 && cardOpt.once && cardOpt.introDelay > 0 ? +cardOpt.introDelay : 0;
    element.innerHTML = cardOpt
      ? cardOpt.markup ||
        '<div class="lk-card"><a href="#" class="lk-cta" data-link="chase">View the work</a><a href="#" class="lk-cta" data-link="roll" data-arrow>See it live</a></div>'
      : demoMarkup();
    const hand = element.querySelector('.lk-hand');
    const links = [...element.querySelectorAll('[data-link]')].map((el) => {
      const L = el.dataset.link === 'roll' ? makeRoll(el) : makeChase(el);
      L.on = false;
      return L;
    });
    const byEl = new Map(links.map((L) => [L.el, L]));
    let tour = links
      .filter((L) => L.el.hasAttribute('data-tour'))
      .sort((x, y) => +x.el.dataset.tour - +y.el.dataset.tour);
    if (!tour.length) tour = links.slice();
    links.forEach((L) => {
      if (cardOpt && !live2) L.el.tabIndex = -1;
    });
    const hovered = new Set();
    let stuck = null,
      previewOver = null,
      handOff = false,
      lastType = '',
      previewCycle = -1;
    const k = () => 100 / api.params.speed;
    function want(L) {
      return hovered.has(L) || stuck === L || (!(live2 && handOff) && previewOver === L);
    }
    function sync() {
      if (api.reduced) api.paint();
      else api.wake();
    }
    links.forEach((L) => {
      const t = L.el;
      api.listen(t, 'pointerenter', (e) => {
        if (e.pointerType !== 'touch' && !api.paused) {
          hovered.add(L);
          sync();
        }
      });
      api.listen(t, 'pointerleave', (e) => {
        if (e.pointerType !== 'touch' && hovered.delete(L)) sync();
      });
      api.listen(t, 'focus', () => {
        if (t.matches(':focus-visible')) {
          hovered.add(L);
          sync();
        }
      });
      api.listen(t, 'blur', () => {
        if (hovered.delete(L)) sync();
      });
      api.listen(t, 'click', (e) => {
        if (t.getAttribute('href') === '#' || (cardOpt && !live2)) e.preventDefault();
        if (api.paused) return;
        if (e.detail && lastType === 'touch') {
          e.preventDefault();
          stuck = stuck === L ? null : L;
          sync();
        }
      });
    });
    api.listen(
      element,
      'pointerdown',
      (e) => {
        lastType = e.pointerType;
        if (e.pointerType === 'touch' && stuck && !links.some((L) => L.el.contains(e.target))) {
          stuck = null;
          sync();
        }
      },
      true,
    );
    function takeOver() {
      if (handOff) return;
      handOff = true;
      previewOver = null;
      sync();
      if (cardOpt.pointer) cardOpt.pointer({ x: 0, y: 0, opacity: 0, down: false });
    }
    if (live2) {
      api.listen(
        element,
        'pointermove',
        (e) => {
          if (!handOff && !(e.pointerType === 'mouse' && !e.movementX && !e.movementY)) takeOver();
        },
        true,
      );
      api.listen(element, 'pointerdown', () => takeOver(), true);
      links.forEach((L) =>
        api.listen(L.el, 'focus', () => {
          if (L.el.matches(':focus-visible')) takeOver();
        }),
      );
      api.restore = () => {
        takeOver();
        stuck = null;
        hovered.clear();
        sync();
      };
    }
    api.on('replay', () => {
      previewCycle = -1;
      previewOver = null;
      stuck = null;
      hovered.clear();
      links.forEach((L) => {
        L.on = false;
        L.rest();
        L.render(0);
      });
    });
    api.on('motion', () => {
      links.forEach((L) => {
        L.on = false;
        L.rest();
      });
    });
    const L0 = cardOpt ? cardOpt.loop || 6 : 8,
      start = intro;
    function handAt(t) {
      const sr = element.getBoundingClientRect(),
        rest =
          cardOpt && cardOpt.rest ? cardOpt.rest(sr.width, sr.height) : { x: sr.width * 0.86, y: sr.height * 0.88 },
        n = tour.length,
        D = Math.max(0.4, (L0 - 1.6) / n - 0.45);
      const pts = [
        [0, rest, 0],
        [0.3, rest, 0],
        [0.6, rest, 1],
      ];
      let t0 = 0.6;
      tour.forEach((L) => {
        const r = L.el.getBoundingClientRect(),
          P = { x: r.left - sr.left + Math.min(r.width * 0.62, r.width - 6), y: r.top - sr.top + r.height * 0.55 };
        pts.push([t0 + 0.45, P, 1], [t0 + 0.45 + D, P, 1]);
        t0 += 0.45 + D;
      });
      pts.push([t0 + 0.45, rest, 1], [t0 + 0.85, rest, 0], [L0, rest, 0]);
      let a = pts[0],
        b = pts[0];
      for (let i = 0; i < pts.length - 1; i++) {
        if (t >= pts[i][0] && t <= pts[i + 1][0]) {
          a = pts[i];
          b = pts[i + 1];
          break;
        }
      }
      if (t > pts[pts.length - 1][0]) a = b = pts[pts.length - 1];
      const u = b[0] === a[0] ? 1 : R.smooth((t - a[0]) / (b[0] - a[0]));
      return { x: R.mix(a[1].x, b[1].x, u), y: R.mix(a[1].y, b[1].y, u), o: R.mix(a[2], b[2], u) };
    }
    api.frame(({ time, reduced }) => {
      let keep = false;
      const now = time * 1000;
      if (live2 && !handOff && cardOpt.once && time >= start + L0) takeOver();
      if (options.preview && !reduced && !(live2 && handOff)) {
        keep = true;
        if (time >= start) {
          const tt = time - start,
            c = Math.floor(tt / L0),
            t = tt % L0;
          if (c !== previewCycle) {
            previewCycle = c;
            previewOver = null;
          }
          const h = handAt(t),
            sr = element.getBoundingClientRect();
          let over = null;
          if (h.o > 0.5)
            links.forEach((L) => {
              for (const r of L.el.getClientRects()) {
                const x = h.x + sr.left,
                  y = h.y + sr.top;
                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) over = L;
              }
            });
          previewOver = over;
          if (cardOpt) {
            if (cardOpt.pointer) cardOpt.pointer({ x: h.x, y: h.y, opacity: h.o, down: false });
          } else if (hand) {
            hand.style.opacity = h.o.toFixed(3);
            hand.style.transform = 'translate3d(' + h.x.toFixed(1) + 'px,' + h.y.toFixed(1) + 'px,0)';
          }
        }
      }
      if (reduced && options.preview && !(live2 && handOff)) previewOver = tour[0] || null;
      const kk = k();
      links.forEach((L) => {
        const w = want(L);
        if (w !== L.on) {
          L.on = w;
          if (w) L.enter(now, api.params, kk, reduced);
          else L.leave(now, api.params, kk, reduced);
        }
        if (L.render(now)) keep = true;
      });
      return keep && !reduced;
    });
    const status = api.status;
    api.status = () => ({
      ...(status ? status() : {}),
      on: links.filter((L) => L.on).map((L) => links.indexOf(L)),
      links: links.length,
      handOff,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountLinkHoverSet(element, options) {
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
    element.classList.add('link-hover-set');
    element.innerHTML = '<div class="fx-board" data-lk></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-lk]'),
      cursor = createCursor(stage),
      narrow = matchMedia('(max-width:760px)');
    const mob = narrow.matches;
    const link = (kind, word, tour, arrow) =>
      '<a href="#" data-link="' +
      kind +
      '"' +
      (arrow ? ' data-arrow' : '') +
      (tour ? ' data-tour="' + tour + '"' : '') +
      '>' +
      word +
      '</a>';
    const markup =
      '<div class="lk-pair">' +
      '<div class="lk-group" role="group" aria-label="Chase Line">' +
      link('chase', 'Projects', mob ? 0 : 1) +
      link('chase', 'Contact', mob ? 1 : 4) +
      '</div>' +
      '<div class="lk-group" role="group" aria-label="Letter Roll">' +
      link('roll', 'Instagram', 2, true) +
      link('roll', 'LinkedIn', mob ? 0 : 3, true) +
      '</div></div>';
    let pair = null,
      links = [];
    function rest(w, h) {
      if (!pair) return { x: w * 0.86, y: h * 0.88 };
      const b = board.getBoundingClientRect(),
        p = links[0].getBoundingClientRect(),
        c = links[1].getBoundingClientRect(),
        F = parseFloat(pair.style.fontSize);
      if (mob) return { x: w * 0.86, y: c.top - b.top + c.height * 0.55 };
      return { x: Math.max(12, p.left - b.left - F * 1.2), y: (p.bottom + c.top) / 2 - b.top };
    }
    const inst = mount(board, {
      params: options.params,
      preview: true,
      card: { markup, loop: mob ? 4.4 : 7, interactive: true, once: true, introDelay: 3, rest, pointer: cursor.set },
    });
    pair = board.querySelector('.lk-pair');
    links = [...pair.querySelectorAll('[data-link]')];
    function layout() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        z = panelZone(stage),
        G = 24;
      pair.style.fontSize = '100px';
      const w = pair.offsetWidth / 100,
        h = pair.offsetHeight / 100;
      let F, top;
      if (narrow.matches) {
        F = Math.min(56, (W - 64) / w, (H - 80) / h);
        top = (H - h * F) / 2;
      } else {
        const fit = Math.min(64, (W - 96) / w, (H - 96) / h),
          clear = Math.max((W - 2 * (z.right + G)) / w, (H - 2 * (z.bottom + G)) / h);
        F = Math.min(fit, Math.max(48, clear));
        top = (H - h * F) / 2;
        if ((W - w * F) / 2 < z.right + G) top = Math.max(top, z.bottom + G);
      }
      pair.style.fontSize = F.toFixed(2) + 'px';
      pair.style.left = ((W - pair.offsetWidth) / 2).toFixed(1) + 'px';
      pair.style.top = top.toFixed(1) + 'px';
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
  global.mountLinkHoverSet = mountLinkHoverSet;
  if (typeof module === 'object' && module.exports) module.exports = mountLinkHoverSet;
})(typeof window !== 'undefined' ? window : this);
