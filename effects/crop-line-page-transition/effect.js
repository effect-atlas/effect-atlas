/*
 * Crop-Line Page Transition
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A small two-page site (Work / About) with nav pills at the bottom. Pick a pill and four thin lines come in from the
 * four edges; the page is cropped with them and shrinks to nothing at the centre, where the lines cross. The lines do
 * not stop or turn back: they keep going through each other towards the opposite edges, and the next page opens from
 * the centre behind them. Good as a page transition for any site; it needs no images and works on any content.
 *
 * How it moves (default values)
 * - One progress value per line, "trans", runs 0 -> 50 -> 100 % of the screen in one continuous path. The top line sits
 *   at top = trans, the bottom line at bottom = trans, the left at left = trans, the right at right = trans, each
 *   centred on its position (offset by half the line width). So in the first half the lines close in from the edges;
 *   at 50 % they form a cross; in the second half each line carries on to the opposite edge.
 * - Close, 800 ms (params.close), power1.in (t * t): trans 0 -> 50 %, and the old page gets clip-path: inset(m %) with
 *   m 0 -> 50 %, so it is cropped exactly along the lines.
 * - Open, 800 ms (params.open), power1.out (1 - (1 - t)^2): trans 50 -> 100 %, the new page clip-path inset 50 -> 0 %.
 *   The lines now sit on the opposite side of the opening edge, still tracing it. Fastest at the crossing.
 * - 100 ms after the open starts, the new page's blocks (title, button, image blocks) rise in: y 24 px -> 0 and
 *   opacity 0 -> 1, 600 ms on cubic-bezier(.22, 1, .36, 1), 60 ms apart.
 * - Behind the pages the screen is the light grey surface, so the cropped page reads as a white sheet shrinking on grey.
 *   The lines are hidden at rest. A pick while a switch runs is ignored.
 *
 * Input
 * - Click a nav pill (buttons, so Tab + Enter works too). The current page is marked with aria-current and a dot, and
 *   the new page name is announced in a polite live region.
 *
 * Options
 *   params.close   300..2000 ms, default 800    close half (lines to the centre)
 *   params.open    300..2000 ms, default 800    open half (lines to the opposite edges)
 *   params.line    1..4 px, default 1           line width
 *   reducedMotion  true / false / null          force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountCropLinePageTransition(element, {params: {...}, reducedMotion: null});
 *   fx.params                    copy of current params
 *   fx.setParams({open: 1200})   change params; used by the next switch (and the one running)
 *   fx.setPaused(true|false)     freeze / resume
 *   fx.reset()                   params back to defaults; the view fades out, comes back on Work at rest, fades in
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                 stops the loop, removes listeners and observers
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountCropLinePageTransition(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect replaces its children.
 * For a real site: put clip-path: inset(var(--mask)) on your main wrapper and four fixed 1 px lines in an overlay with
 * pointer-events: none; tween --mask and the line position on leave / enter of your router (Barba, Swup, View
 * Transitions, Next.js), swapping the content at the end of the close half.
 *
 * Safe to change
 * - The two pages (pagesHTML): any content. Mark the blocks that should rise in with data-rise.
 * - Line colour (.cp-l background), the grey behind the pages (.cp-site background), the nav words.
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The lines must not stop or reverse at the centre: one path 0 -> 50 -> 100 %, quad in then quad out, so the crossing
 *   is the fastest moment.
 * - The page crop and the lines share one value; the crop is a symmetric inset, so the page closes to (and opens from)
 *   the exact centre.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - Nav pills are real buttons; aria-current marks the page; a polite live region names the new page.
 * - With reduced motion the page swaps at once, no lines, no rise.
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
    { key: 'close', type: 'range', default: 800, min: 300, max: 2000, step: 50 },
    { key: 'open', type: 'range', default: 800, min: 300, max: 2000, step: 50 },
    { key: 'line', type: 'range', default: 1, min: 1, max: 4, step: 0.5 },
  ];

  // ---- the effect ----
  const NAV = ['Work', 'About'],
    ENTER_DELAY = 100,
    RISE = 600,
    RISE_GAP = 60,
    RISE_Y = 24;
  const GLYPHS = [
    '<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M50 16v68M16 50h68" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
    '<rect x="20" y="20" width="60" height="60" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M24 24l52 52M76 24L24 76" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
  ];
  const media = (tone, glyph) =>
    '<div class="ck-media" data-rise' +
    (tone ? ' data-tone="' + tone + '"' : '') +
    ' aria-hidden="true"><svg class="ck-glyph" viewBox="0 0 100 100">' +
    GLYPHS[glyph % 4] +
    '</svg></div>';
  const quadIn = (t) => t * t,
    quadOut = (t) => 1 - (1 - t) * (1 - t);
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
  function pagesHTML() {
    const p0 =
      '<section class="cp-page cp-p0" data-page="0"><h3 class="cp-title" data-rise>Selected work</h3>' +
      '<div class="cp-grid">' +
      [1, 0, 2, 2, 1, 0].map((tone, i) => media(tone, i)).join('') +
      '</div></section>';
    const p1 =
      '<section class="cp-page cp-p1" data-page="1" hidden><div class="cp-copy"><h3 class="cp-title" data-rise>Small studio.<br>Long table.</h3>' +
      '<span class="ck-pill ck-solid" data-size="sm" data-rise>Get in touch</span></div>' +
      media(2, 0) +
      '</section>';
    return p0 + p1;
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    const cardOpt = options.card || null,
      live = !!(cardOpt && cardOpt.interactive);
    element.classList.add('cp-stage');
    if (cardOpt) element.dataset.card = live ? 'live' : 'auto';
    element.innerHTML =
      '<div class="cp-site ck-panel" data-size="lg"><div class="cp-view">' +
      pagesHTML() +
      '</div>' +
      '<nav class="cp-nav" aria-label="Sample navigation">' +
      NAV.map(
        (w, i) =>
          '<button type="button" class="ck-pill" data-size="sm" data-go="' +
          i +
          '"' +
          (cardOpt && !live ? ' tabindex="-1"' : '') +
          (i ? '' : ' aria-current="page"') +
          '><i class="ck-dot" data-accent></i>' +
          w +
          '</button>',
      ).join('') +
      '</nav>' +
      '<div class="cp-lines" aria-hidden="true"><i class="cp-l cp-top"></i><i class="cp-l cp-bot"></i><i class="cp-l cp-left"></i><i class="cp-l cp-right"></i></div></div>' +
      (cardOpt ? '' : '<div class="cp-hand" aria-hidden="true"></div>') +
      '<p class="cp-live" aria-live="polite"></p>';
    const q = (s) => element.querySelector(s);
    const site = q('.cp-site'),
      view = q('.cp-view'),
      lines = q('.cp-lines'),
      pages = [...element.querySelectorAll('.cp-page')],
      pills = [...element.querySelectorAll('.cp-nav .ck-pill')],
      liveEl = q('.cp-live'),
      hand = q('.cp-hand');
    const nav = q('.cp-nav');
    const rises = pages.map((p) => [...p.querySelectorAll('[data-rise]')]);
    let page = 0,
      target = 0,
      phase = 'idle',
      t = 0,
      restoring = null;
    function showPage(i) {
      pages.forEach((el, k) => {
        el.hidden = k !== i;
      });
      element.dataset.page = String(i);
    }
    function markNav(i) {
      pills.forEach((el, k) => {
        if (k === i) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
      });
    }
    function clearPage(el) {
      el.style.clipPath = '';
    }
    function cropNav(m) {
      if (m === null) {
        nav.style.clipPath = '';
        return;
      }
      const W = site.clientWidth,
        H = site.clientHeight,
        top = nav.offsetTop,
        bot = H - top - nav.offsetHeight,
        y = (H * m) / 100,
        x = (W * m) / 100;
      nav.style.clipPath =
        'inset(' +
        Math.max(0, y - top).toFixed(2) +
        'px ' +
        x.toFixed(2) +
        'px ' +
        Math.max(0, y - bot).toFixed(2) +
        'px)';
    }
    function clearRise(i) {
      rises[i].forEach((el) => {
        el.style.opacity = '';
        el.style.transform = '';
      });
    }
    function setLines(trans) {
      if (trans === null) {
        lines.hidden = true;
        return;
      }
      lines.hidden = false;
      lines.style.setProperty('--cp-trans', trans.toFixed(3) + '%');
    }
    function settleIdle(i) {
      phase = 'idle';
      element.dataset.phase = 'idle';
      page = target = i;
      t = 0;
      pages.forEach(clearPage);
      cropNav(null);
      clearRise(0);
      clearRise(1);
      showPage(i);
      markNav(i);
      setLines(null);
    }
    function openTotal() {
      return Math.max(api.params.open, ENTER_DELAY + (rises[target].length - 1) * RISE_GAP + RISE);
    }
    function render() {
      const prm = api.params;
      if (phase === 'close') {
        const e = quadIn(Math.min(1, t / prm.close)),
          m = 50 * e;
        pages[page].style.clipPath = 'inset(' + m.toFixed(3) + '%)';
        cropNav(m);
        setLines(m);
      } else if (phase === 'open') {
        const k = Math.min(1, t / prm.open),
          e = quadOut(k),
          m = 50 * (1 - e);
        pages[page].style.clipPath = k < 1 ? 'inset(' + m.toFixed(3) + '%)' : '';
        cropNav(k < 1 ? m : null);
        setLines(k < 1 ? 50 + 50 * e : null);
        rises[page].forEach((el, i) => {
          const u = outEase((t - ENTER_DELAY - i * RISE_GAP) / RISE);
          el.style.opacity = u < 1 ? u.toFixed(3) : '';
          el.style.transform = u < 1 ? 'translateY(' + (RISE_Y * (1 - u)).toFixed(2) + 'px)' : '';
        });
      }
    }
    function go(i) {
      if (restoring || phase !== 'idle' || i === page) return false;
      target = i;
      markNav(i);
      liveEl.textContent = NAV[i] + '.';
      if (api.reduced) {
        settleIdle(i);
        return true;
      }
      phase = 'close';
      element.dataset.phase = 'close';
      t = 0;
      render();
      api.wake();
      return true;
    }
    function step(dt) {
      if (phase === 'idle') return;
      t += dt * 1000;
      if (phase === 'close' && t >= api.params.close) {
        t -= api.params.close;
        clearPage(pages[page]);
        page = target;
        showPage(page);
        phase = 'open';
        element.dataset.phase = 'open';
        rises[page].forEach((el) => {
          el.style.opacity = '0';
          el.style.transform = 'translateY(' + RISE_Y + 'px)';
        });
      }
      if (phase === 'open' && t >= openTotal()) {
        settleIdle(page);
        return;
      }
      render();
    }
    pills.forEach((btn, i) =>
      api.listen(btn, 'click', () => {
        if (api.paused || (cardOpt && !live)) return;
        takeOver();
        if (go(i) && cardOpt && cardOpt.touched) cardOpt.touched();
      }),
    );
    api.on('params', () => {
      lines.style.setProperty('--cp-line', api.params.line + 'px');
      if (phase !== 'idle') render();
    });
    api.on('replay', () => {
      restoring = null;
      view.style.opacity = '';
      settleIdle(0);
      cyc = -1;
    });
    api.on('motion', (reduced) => {
      if (reduced) {
        restoring = null;
        view.style.opacity = '';
        settleIdle(target);
      }
    });
    const L = 4.4;
    let cyc = -1,
      aim = 1,
      fired = false,
      handOff = false,
      downWas = false;
    const at = (el) => {
      const s = element.getBoundingClientRect(),
        r = el.getBoundingClientRect();
      return { x: r.left - s.left + r.width * 0.5, y: r.top - s.top + r.height * 0.55 };
    };
    function takeOver() {
      if (!live || handOff) return;
      handOff = true;
      if (cardOpt.pointer) cardOpt.pointer({ x: 0, y: 0, opacity: 0, down: false });
    }
    function handAt(time) {
      const c = Math.floor(time / L),
        tt = time % L;
      if (c !== cyc) {
        cyc = c;
        fired = false;
        if (c === 0 && phase === 'idle') settleIdle(0);
        aim = (target + 1) % NAV.length;
      }
      const s = element.getBoundingClientRect(),
        b = site.getBoundingClientRect(),
        rest = { x: b.right - s.left - b.width * 0.16, y: b.top - s.top + b.height * 0.62 },
        pill = at(pills[aim]);
      const pts = [
        [0, rest],
        [0.35, rest],
        [1.0, pill],
        [1.3, pill],
        [2.1, rest],
        [L, rest],
      ];
      let a = pts[0],
        z = pts[1];
      for (let i = 0; i < pts.length - 1; i++)
        if (tt >= pts[i][0] && tt <= pts[i + 1][0]) {
          a = pts[i];
          z = pts[i + 1];
          break;
        }
      const u = z[0] === a[0] ? 1 : R.smooth((tt - a[0]) / (z[0] - a[0])),
        x = R.mix(a[1].x, z[1].x, u),
        y = R.mix(a[1].y, z[1].y, u);
      let o = c === 0 ? R.smooth(tt / 0.3) : 1;
      if (cardOpt && cardOpt.once && tt > L - 0.6) o = Math.min(o, R.smooth((L - tt) / 0.5));
      const down = tt >= 1.05 && tt < 1.2;
      if (tt >= 1.1 && !fired) {
        fired = true;
        go(aim);
      }
      if (cardOpt) {
        if (cardOpt.pointer) cardOpt.pointer({ x, y, opacity: o, down });
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
      api.listen(element, 'pointerdown', () => takeOver());
      api.restore = () => {
        takeOver();
        if (restoring || (phase === 'idle' && page === 0)) return;
        if (api.reduced) {
          settleIdle(0);
          return;
        }
        restoring = { t: 0, from: +getComputedStyle(view).opacity || 1, swapped: false };
        api.wake();
      };
    }
    function stepRestore(dt) {
      restoring.t += dt;
      const OUT = 0.2,
        IN = 0.3,
        r = restoring;
      if (r.t < OUT) {
        view.style.opacity = (r.from * (1 - outEase(r.t / OUT))).toFixed(3);
        return;
      }
      if (!r.swapped) {
        r.swapped = true;
        settleIdle(0);
      }
      const u = (r.t - OUT) / IN;
      if (u >= 1) {
        view.style.opacity = '';
        restoring = null;
        return;
      }
      view.style.opacity = outEase(u).toFixed(3);
    }
    api.frame(({ dt, time, reduced }) => {
      if (reduced) {
        if (cardOpt && cardOpt.pointer) cardOpt.pointer({ x: 0, y: 0, opacity: 0, down: false });
        if (hand) hand.style.opacity = '0';
        return false;
      }
      const handing = options.preview && !(live && (handOff || (cardOpt.once && time >= L)));
      if (live && !handOff && cardOpt.once && time >= L) takeOver();
      if (handing) handAt(time);
      if (restoring) stepRestore(dt);
      else step(dt);
      return handing || phase !== 'idle' || !!restoring;
    });
    lines.style.setProperty('--cp-line', api.params.line + 'px');
    settleIdle(0);
    const status = api.status;
    api.status = () => ({ ...status(), page, target, phase, t });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountCropLinePageTransition(element, options) {
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
    element.classList.add('crop-line-page-transition');
    element.innerHTML = '<div class="fx-board" data-cp-board></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-cp-board]'),
      cursor = createCursor(stage);
    const phone = matchMedia('(max-width: 760px)');
    function place() {
      const W = stage.clientWidth,
        H = stage.clientHeight;
      let w, h, x, y;
      if (phone.matches) {
        w = W - 32;
        h = H - 32;
        x = 16;
        y = 16;
      } else {
        w = Math.min(800, W - 64);
        h = Math.min(Math.round(w * 0.62), H - 64);
        x = Math.max((W - w) / 2, panelZone(stage).right + 16);
        w = Math.min(w, W - 32 - x);
        y = (H - h) / 2;
      }
      [
        ['x', x],
        ['y', y],
        ['w', w],
        ['h', h],
      ].forEach(([k, v]) => board.style.setProperty('--cp-' + k, Math.round(v) + 'px'));
      board.style.setProperty('--fx-k', (w / 336).toFixed(4));
    }
    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);
    const inst = mount(board, {
      params: options.params,
      preview: true,
      card: { interactive: true, once: true, pointer: cursor.set },
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
  global.mountCropLinePageTransition = mountCropLinePageTransition;
  if (typeof module === 'object' && module.exports) module.exports = mountCropLinePageTransition;
})(typeof window !== 'undefined' ? window : this);
