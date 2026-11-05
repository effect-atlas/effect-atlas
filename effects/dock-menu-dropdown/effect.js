/*
 * Dock Menu Dropdown
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A small floating nav pill that grows into a scrollable catalogue when you click Index: the white panel stretches
 * down and out, the rows fade up one after another, and a dark plate wipes over the row you point at. Made for a
 * project index, a work list or any "all items" menu in a site header.
 *
 * How it moves
 * - Open / close is a class toggle (.is-open) with CSS transitions. Opening takes 0.54 s (--open-d), closing 0.36 s
 *   (--close-d). Easing is --dock-ease: cubic-bezier(.22,1,.36,1) by default, cubic-bezier(.5,0,.15,1) with
 *   params.curve = 'classic'. 'classic' is a carefully hand-tuned curve; keep its values as they are.
 * - The white panel (.dock-bg) animates height from 3em (the pill) to params.openHeight px, and width from the closed
 *   row width + 1em to max(closed width + 4em, 22em), capped at the element width. The shadow grows with it.
 * - The list area (.dock-drop) grows in height and widens through clip-path from the pill width to the full width.
 *   Its opacity runs over 50% of the open time (50% on close); on close it turns invisible after that.
 * - Rows: each starts at opacity 0, translateY(0.6em). On open, row n starts after 60 ms + params.stagger x n and runs
 *   opacity over 70% of the open time and the move over the full open time. On close they drop out together in 0.2 s.
 * - The chevron turns 180 degrees with the panel.
 * - Hover plate: each row has a dark fill at scaleY(0). Pointing at a row scales it to 1 in params.rowDuration ms.
 *   The transform origin is the edge the pointer came in from (top half -> grows from the top, bottom half -> from the
 *   bottom), and it leaves towards the edge it exits from. The origin is only switched while the plate is fully open or
 *   fully closed, so a quick pass never jumps.
 * - While a row is hot, the text steps .14em to the right on the --spring curve, once, over params.rowDuration. Nothing loops.
 * - Catalogue rows: a 2 px tick, the name (18 px) and a kind line (14 px, muted). The current item has an accent tick
 *   and no plate; hovering it still shows the plate. Clicking a row makes it current.
 * - Scrolling: the list scrolls natively (hidden scrollbar). The top and bottom edges fade through a mask over 3em,
 *   each fade appearing only when there is more to scroll that way. A custom bar on the right (4 px wide, 7.25em tall)
 *   shows a thumb sized to the visible share (at least 16%). Drag the thumb or press anywhere on the bar to jump; wheel
 *   over the bar scrolls the list.
 * - Demo, once on load (8 s): a fake cursor opens Index at 1.1 s, runs over rows 2 to 4, drags the thumb to bring row 10
 *   into the middle (4.1 to 5 s), picks it, closes the menu at 6.8 s and leaves. Any real pointer move, press, key or
 *   wheel ends it for good.
 *
 * Options
 *   params.openHeight   260..440, default 360      open panel height in px
 *   params.rowDuration  150..600, default 280      ms for the hover plate
 *   params.stagger      0..80, default 50          ms between rows on open
 *   params.curve        'library' | 'classic', default 'library'   easing for everything above
 *   reducedMotion       true / false / null        force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountDockMenuDropdown(element, {params: {...}, reducedMotion: null});
 *   fx.params                     copy of current params
 *   fx.setParams({stagger: 60})   change params live
 *   fx.setPaused(true|false)      freeze / resume
 *   fx.reset()                    params back to defaults, demo stopped, menu closed, third item current again
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                  removes listeners, observers and the fake cursor
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountDockMenuDropdown(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Items: NAMES and KINDS (same length; row count, stagger and the bar adapt). The current item is catalog.current
 *   in mountDockMenuDropdown.
 * - The button text "Index", colours, fonts, radii and shadows via effect.css.
 * - params within their ranges.
 *
 * Do not change (the feel breaks)
 * - Open slower than close (0.54 s / 0.36 s) and the per-row delay of 60 ms + stagger x n.
 * - The plate entering from the side the pointer came from, and the rule that the origin only switches at rest.
 * - Panel height and list height must animate together with the same curve, or the rows slide under a moving edge.
 * - Do not let a framework re-render the rows while the effect runs; it toggles classes on them directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountDockMenuDropdown on an embed div with a fixed height.
 * - Rows are buttons and only mark the current item; hook your own navigation onto their click.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The menu is a nav landmark. The Index button carries aria-expanded; the list is aria-hidden while closed. Rows are
 *   buttons labelled "<name>, <kind>", the current one has aria-current. Arrow Up / Down move between rows, Escape
 *   closes and returns focus to Index, and a press outside the menu closes it. Keyboard focus shows the plate too.
 * - With reduced motion: no fake cursor, every transition is off, and the menu starts open so the
 *   list is visible at once. It still opens, closes and scrolls, without animation.
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
  const R = { clamp, smooth, mix };

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
    { key: 'openHeight', type: 'range', default: 360, min: 260, max: 440, step: 10 },
    { key: 'rowDuration', type: 'range', default: 280, min: 150, max: 600, step: 10 },
    { key: 'stagger', type: 'range', default: 50, min: 0, max: 80, step: 5 },
    { key: 'curve', type: 'select', default: 'library', options: [{ value: 'library' }, { value: 'classic' }] },
  ];

  // ---- the effect ----
  const CARD_LEAD = 1.9;
  const NAMES = [
    'Long Table',
    'Field Notes',
    'Quiet Hours',
    'North Light',
    'Paper Moon',
    'Salt Flats',
    'Second Draft',
    'Low Tide',
    'Common Room',
    'Night Ferry',
    'Open Studio',
    'Glass House',
    'Slow Signal',
    'After Image',
    'Blue Hour',
    'Lantern',
    'Half Light',
    'Wide Open',
  ];
  const YEARS = [
    2026, 2026, 2025, 2025, 2025, 2024, 2024, 2024, 2023, 2023, 2022, 2022, 2021, 2021, 2020, 2020, 2019, 2019,
  ];
  const KINDS = [
    'Identity',
    'Editorial',
    'Exhibition',
    'Type',
    'Packaging',
    'Web',
    'Editorial',
    'Motion',
    'Spatial',
    'Identity',
    'Web',
    'Exhibition',
    'Type',
    'Motion',
    'Print',
    'Packaging',
    'Print',
    'Identity',
  ];
  const CLASSIC_EASE = 'cubic-bezier(.5,0,.15,1)',
    THUMB_MIN = 0.16;
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('dock-stage');
    const card = options.card || null,
      catalog = (card && options.catalog) || null,
      first = catalog ? (catalog.current != null ? +catalog.current : -1) : card ? -1 : 0,
      chev =
        '<svg class="dock-chev" viewBox="0 0 17 10" aria-hidden="true"><path d="M1.5 1.5 8.5 8.5 15.5 1.5"/></svg>';
    const cardRow = (name, i) =>
      catalog
        ? '<li><button type="button" class="dock-item ck-row ck-text" tabindex="-1" data-i="' +
          i +
          '" style="--n:' +
          i +
          '" aria-label="' +
          name +
          ', ' +
          KINDS[i] +
          '"><span class="dock-fill ck-solid" aria-hidden="true"></span><span class="dock-inner"><i class="dock-tick" aria-hidden="true"></i><span class="dock-name">' +
          name +
          '</span><span class="dock-kind">' +
          KINDS[i] +
          '</span></span></button></li>'
        : '<li><button type="button" class="dock-item ck-row ck-text" tabindex="-1" data-i="' +
          i +
          '" style="--n:' +
          i +
          '"><span class="dock-fill ck-solid" aria-hidden="true"></span><span class="dock-inner"><span class="dock-name">' +
          name +
          '</span><span class="dock-yr-mask"><span class="dock-yr" aria-hidden="true">' +
          (card.mark ? card.mark(i) : '') +
          '</span></span></span></button></li>';
    if (card)
      element.innerHTML =
        '<nav class="dock ck-text" data-card' +
        (catalog ? ' data-catalog' : '') +
        ' aria-label="Sample navigation"><div class="dock-bg ck-panel" aria-hidden="true"></div><div class="dock-row"><span class="dock-logo" aria-hidden="true"><i class="ck-dot"></i><i class="ck-dot"></i></span>' +
        '<button type="button" class="dock-link dock-toggle ck-text" data-strong tabindex="-1" aria-expanded="false"><span class="dock-label"><span class="dock-word">Index</span><span class="dock-count ck-num" aria-hidden="true">' +
        NAMES.length +
        '</span></span>' +
        chev +
        '</button></div>' +
        '<div class="dock-drop" aria-hidden="true"><div class="dock-scroller"><ul class="dock-list">' +
        NAMES.map(cardRow).join('') +
        '</ul></div><div class="dock-bar"><i class="dock-thumb"></i></div></div></nav>';
    else {
      const rows = NAMES.map(
        (name, i) =>
          '<li><button type="button" class="dock-item" data-i="' +
          i +
          '" style="--n:' +
          i +
          '"><span class="dock-fill" aria-hidden="true"></span><span class="dock-inner"><span class="dock-name">' +
          name +
          '</span><span class="dock-yr-mask"><span class="dock-yr">' +
          YEARS[i] +
          '</span></span></span></button></li>',
      ).join('');
      element.innerHTML =
        '<div class="dock-page" aria-hidden="true"><div class="dock-disc"><i></i></div></div><div class="dock-dim" aria-hidden="true"></div>' +
        '<nav class="dock" aria-label="Sample navigation"><div class="dock-bg" aria-hidden="true"></div><div class="dock-row"><span class="dock-logo" aria-hidden="true"><i></i><i></i></span><a class="dock-link is-current" href="#" aria-current="page">Work<i class="dock-dot"></i></a><a class="dock-link" href="#">Notes</a>' +
        '<button type="button" class="dock-link dock-toggle" aria-expanded="false" aria-controls="dock-drop-' +
        id +
        '"><span class="dock-label"><span class="dock-word">Index</span><span class="dock-count" aria-hidden="true">' +
        NAMES.length +
        '</span></span><svg class="dock-chev" viewBox="0 0 17 10" aria-hidden="true"><path d="M1.5 1.5 8.5 8.5 15.5 1.5"/></svg></button></div>' +
        '<div class="dock-drop" id="dock-drop-' +
        id +
        '" aria-hidden="true"><div class="dock-scroller"><ul class="dock-list">' +
        rows +
        '</ul></div><div class="dock-bar"><i class="dock-thumb"></i></div></div></nav>' +
        '<p class="cr-hint" data-cr-chrome>Click Index to open · Hover rows · Drag the bar to scroll · Esc to close</p><p class="cr-sr dock-live" aria-live="polite"></p><div class="dock-hand" aria-hidden="true"></div>';
    }
    const $ = (s) => element.querySelector(s),
      dock = $('.dock'),
      row = $('.dock-row'),
      toggle = $('.dock-toggle'),
      label = $('.dock-label'),
      word = $('.dock-word'),
      count = $('.dock-count'),
      drop = $('.dock-drop'),
      scroller = $('.dock-scroller'),
      bar = $('.dock-bar'),
      thumb = $('.dock-thumb'),
      live = $('.dock-live') || {},
      hand = $('.dock-hand');
    const items = [...element.querySelectorAll('.dock-item')];
    let open = false,
      active = first,
      hot = -1,
      drag = null,
      previewCycle = -1,
      closedW = 0,
      widths = { word: 0, count: 0 },
      handDown = false,
      previewHot = -1;
    const playable = !!(card && card.interactive),
      cardLead = card && card.lead != null ? +card.lead : CARD_LEAD;
    let handOff = false,
      rewind = 0,
      stillOpen = false;
    const fontPx = () => parseFloat(getComputedStyle(dock).fontSize) || 15;
    function measure() {
      closedW = row.scrollWidth + fontPx();
      widths.word = word.scrollWidth;
      widths.count = card ? widths.word : count.scrollWidth;
      const wOpen = Math.max(closedW + fontPx() * 4, fontPx() * 22);
      dock.style.setProperty('--w', closedW + 'px');
      dock.style.setProperty('--w-open', (card ? Math.min(element.clientWidth, wOpen) : wOpen) + 'px');
      if (card) dock.style.setProperty('--oh', element.clientHeight + 'px');
      if (card && card.height) dock.style.setProperty('--oh', api.params.openHeight + 'px');
      label.style.width = (open ? widths.count : widths.word) + 'px';
      sync();
    }
    function apply() {
      const p = api.params;
      dock.style.setProperty('--oh', card ? element.clientHeight + 'px' : p.openHeight / 15 + 'em');
      element.style.setProperty('--row', p.rowDuration + 'ms');
      element.style.setProperty('--stagger', p.stagger + 'ms');
      if (card && card.height) dock.style.setProperty('--oh', p.openHeight + 'px');
      element.style.setProperty('--dock-ease', p.curve === 'classic' ? CLASSIC_EASE : 'var(--out)');
      sync();
    }
    function sync() {
      const vh = scroller.clientHeight,
        sh = scroller.scrollHeight,
        max = Math.max(0, sh - vh),
        top = R.clamp(scroller.scrollTop, 0, max),
        fade = fontPx() * 3;
      scroller.style.setProperty('--ft', max > 0 ? R.clamp(top / fade, 0, 1).toFixed(3) : 0);
      scroller.style.setProperty('--fb', max > 0 ? R.clamp((max - top) / fade, 0, 1).toFixed(3) : 0);
      const track = bar.clientHeight,
        ratio = max <= 0 ? 1 : R.clamp(vh / sh, THUMB_MIN, 1),
        th = track * ratio,
        travel = Math.max(0, track - th);
      thumb.style.height = (ratio * 100).toFixed(2) + '%';
      thumb.style.transform = 'translate3d(0,' + (max <= 0 ? 0 : (travel * top) / max).toFixed(2) + 'px,0)';
      bar.classList.toggle('is-disabled', max <= 0);
      return { max, travel, th, top };
    }
    function setOpen(next, announce) {
      if (next === open) return;
      open = next;
      dock.classList.toggle('is-open', open);
      element.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      drop.setAttribute('aria-hidden', String(!open));
      label.style.width = (open ? widths.count : widths.word) + 'px';
      if (open) {
        scroller.scrollTop = 0;
        sync();
      } else {
        setHot(-1);
      }
      if (announce) live.textContent = open ? 'Index open, ' + NAMES.length + ' items.' : 'Index closed.';
      if (announce && playable && card.touched) card.touched();
    }
    function scaleOf(el) {
      const m = getComputedStyle(el).transform;
      if (!m || m === 'none') return 1;
      return new DOMMatrix(m).d;
    }
    function plate(i, on, fromTop) {
      const item = items[i];
      if (!item) return;
      const fill = item.firstElementChild,
        s = scaleOf(fill);
      if ((on && s <= 0.001) || (!on && s >= 0.999))
        fill.style.transformOrigin = fromTop ? 'center top' : 'center bottom';
      item.classList.toggle('is-hot', on);
    }
    function setHot(i, fromTop) {
      if (i === hot) return;
      if (hot >= 0 && (hot !== active || catalog)) plate(hot, false, fromTop);
      hot = i;
      if (i >= 0) plate(i, true, fromTop);
    }
    function setActive(i) {
      if (i === active) return;
      const prev = active;
      active = i;
      items.forEach((item, n) => {
        item.classList.toggle('is-active', n === i);
        if (n === i) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      });
      if (prev !== hot) plate(prev, false, false);
      live.textContent = 'Current: ' + NAMES[i] + '.';
    }
    function scrollToThumb(clientY) {
      const r = bar.getBoundingClientRect(),
        s = sync();
      if (s.travel <= 0) return;
      scroller.scrollTop = (R.clamp(clientY - r.top - drag.offset, 0, s.travel) / s.travel) * s.max;
      sync();
    }
    items.forEach((item, i) => {
      api.listen(item, 'pointerenter', (e) => {
        if (e.pointerType === 'touch' || api.paused || !open) return;
        const r = item.getBoundingClientRect();
        setHot(i, e.clientY - r.top < r.height / 2);
      });
      api.listen(item, 'pointerleave', (e) => {
        if (e.pointerType === 'touch' || hot !== i) return;
        const r = item.getBoundingClientRect();
        hot = -1;
        if (i !== active || catalog) plate(i, false, e.clientY - r.top < r.height / 2);
      });
      api.listen(item, 'focus', () => {
        if (item.matches(':focus-visible') && open) setHot(i, false);
      });
      api.listen(item, 'blur', () => {
        if (hot === i) {
          hot = -1;
          if (i !== active || catalog) plate(i, false, false);
        }
      });
      api.listen(item, 'click', () => {
        if (!api.paused) setActive(i);
      });
      api.listen(item, 'keydown', (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const n = items[R.clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1)];
        n.focus();
        n.scrollIntoView({ block: 'nearest' });
      });
    });
    api.listen(toggle, 'click', () => {
      if (!api.paused) setOpen(!open, true);
    });
    api.listen(element, 'keydown', (e) => {
      if (e.key === 'Escape' && open) {
        setOpen(false, true);
        toggle.focus();
      }
    });
    api.listen(element, 'pointerdown', (e) => {
      if (open && !dock.contains(e.target)) setOpen(false, true);
    });
    element.querySelectorAll('.dock-link[href]').forEach((a) => api.listen(a, 'click', (e) => e.preventDefault()));
    api.listen(scroller, 'scroll', sync, { passive: true });
    api.listen(
      bar,
      'wheel',
      (e) => {
        if (sync().max <= 0) return;
        e.preventDefault();
        scroller.scrollTop += e.deltaY;
      },
      { passive: false },
    );
    api.listen(bar, 'pointerdown', (e) => {
      if (api.paused || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const s = sync();
      if (s.max <= 0) return;
      e.preventDefault();
      const tr = thumb.getBoundingClientRect(),
        onThumb = e.target === thumb;
      drag = { id: e.pointerId, offset: onThumb ? R.clamp(e.clientY - tr.top, 0, tr.height) : s.th / 2 };
      thumb.classList.add('is-dragging');
      try {
        bar.setPointerCapture(e.pointerId);
      } catch {}
      scrollToThumb(e.clientY);
    });
    api.listen(bar, 'pointermove', (e) => {
      if (drag && drag.id === e.pointerId) {
        e.preventDefault();
        scrollToThumb(e.clientY);
      }
    });
    const endDrag = (e) => {
      if (!drag || (e && drag.id !== e.pointerId)) return;
      drag = null;
      thumb.classList.remove('is-dragging');
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => api.listen(bar, t, endDrag));
    function reset() {
      endDrag();
      setOpen(false, false);
      hot = -1;
      items.forEach((item, n) => {
        item.classList.remove('is-hot');
        item.classList.toggle('is-active', n === first);
        if (n === first) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      });
      active = first;
      scroller.scrollTop = 0;
      sync();
    }
    api.on('params', apply);
    api.on('resize', measure);
    api.on('replay', () => {
      reset();
      previewCycle = -1;
    });
    api.on('pause', (v) => {
      if (v) endDrag();
    });
    if (document.fonts && document.fonts.ready)
      document.fonts.ready.then(() => {
        if (!api.destroyed) measure();
      });
    function takeOver(e) {
      if (handOff) return;
      handOff = true;
      if (card.pointer) card.pointer({ x: 0, y: 0, opacity: 0, down: false });
      if (!drag) thumb.classList.remove('is-dragging');
      previewHot = -1;
      const real = open && e && e.pointerType === 'mouse' ? items.findIndex((item) => item.matches(':hover')) : -1;
      if (real !== hot) {
        setHot(-1);
        if (real >= 0) setHot(real, true);
      }
      tidy();
    }
    function tidy() {
      items.forEach((item, n) => {
        if (n !== hot) item.classList.remove('is-hot');
      });
    }
    if (playable) {
      const touch = () => {
        if (card.touched) card.touched();
      };
      toggle.removeAttribute('tabindex');
      items.forEach((item) => item.removeAttribute('tabindex'));
      items.forEach((item) =>
        ['pointerenter', 'pointerleave', 'focus', 'blur'].forEach((type) => api.listen(item, type, tidy)),
      );
      api.listen(element, 'pointermove', (e) => {
        if (e.pointerType === 'mouse' && !handOff && !e.movementX && !e.movementY) return;
        takeOver(e);
      });
      api.listen(element, 'pointerdown', (e) => takeOver(e));
      api.listen(element, 'keydown', () => takeOver());
      api.listen(dock, 'wheel', () => takeOver(), { passive: true });
      items.forEach((item) =>
        api.listen(item, 'click', () => {
          if (!api.paused) touch();
        }),
      );
      api.listen(
        drop,
        'wheel',
        (e) => {
          const s = sync();
          if (open && ((e.deltaY > 0 && s.top < s.max - 0.5) || (e.deltaY < 0 && s.top > 0.5))) touch();
        },
        { passive: true },
      );
      api.listen(bar, 'pointerdown', (e) => {
        if (open && !api.paused && !(e.pointerType === 'mouse' && e.button !== 0)) touch();
      });
      api.listen(
        scroller,
        'touchmove',
        () => {
          if (open) touch();
        },
        { passive: true },
      );
      api.listen(scroller, 'keydown', (e) => {
        if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) touch();
      });
      api.listen(drop, 'transitionend', (e) => {
        if (e.target === drop && e.propertyName === 'height') sync();
      });
      api.on('destroy', () => clearTimeout(rewind));
      api.restore = () => {
        takeOver();
        clearTimeout(rewind);
        const was = open;
        endDrag();
        setOpen(false, false);
        hot = -1;
        items.forEach((item, n) => {
          item.classList.remove('is-hot');
          item.classList.toggle('is-active', n === first);
          if (n === first) item.setAttribute('aria-current', 'true');
          else item.removeAttribute('aria-current');
        });
        active = first;
        const toTop = () => {
          scroller.scrollTop = 0;
          sync();
        };
        if (api.reduced) {
          toTop();
          setOpen(true, false);
        } else if (was)
          rewind = setTimeout(
            () => {
              if (!open) toTop();
            },
            (parseFloat(getComputedStyle(element).getPropertyValue('--close-d')) || 0.36) * 1000,
          );
        else toTop();
      };
    }
    const center = (el, fx = 0.5, fy = 0.5) => {
      const s = element.getBoundingClientRect(),
        r = el.getBoundingClientRect();
      return { x: r.left - s.left + r.width * fx, y: r.top - s.top + r.height * fy };
    };
    const pickScroll = (max) =>
      R.clamp(items[9].offsetTop + items[9].offsetHeight / 2 - scroller.clientHeight / 2, 0, max);
    function thumbEnd() {
      const s = sync(),
        b = center(bar, 0.5, 0);
      return { x: b.x, y: b.y + (s.max > 0 ? (s.travel * pickScroll(s.max)) / s.max : 0) + s.th / 2 };
    }
    function path(t) {
      const s = element.getBoundingClientRect(),
        rest = { x: s.width * 0.74, y: s.height * 0.86 },
        tg = center(toggle, 0.45, 0.6),
        r = (n) => center(items[n], 0.35, 0.55),
        th = center(thumb, 0.5, 0.5),
        bt = card ? thumbEnd() : center(bar, 0.5, 0.82);
      const pts = [
        [0, rest, 0],
        [card ? 0.3 : 0.35, rest, 0],
        [0.6, rest, 1],
        [1.05, tg, 1],
        [1.25, tg, 1],
        [1.85, r(1), 1],
        [2.25, r(1), 1],
        [2.55, r(2), 1],
        [2.85, r(2), 1],
        [3.15, r(3), 1],
        [3.45, r(3), 1],
        [3.9, th, 1],
        [4.1, th, 1],
        [5.0, bt, 1],
        [5.2, bt, 1],
        [5.65, r(9), 1],
        [5.95, r(9), 1],
        [6.45, tg, 1],
        [6.75, tg, 1],
        [7.3, rest, 1],
        [7.65, rest, 0],
        [8, rest, 0],
      ];
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
    let fired = {};
    function once(key, t, at, fn) {
      if (t >= at && !fired[key]) {
        fired[key] = true;
        fn();
      }
    }
    api.frame(({ time, reduced }) => {
      if (playable && reduced) {
        if (!stillOpen) {
          stillOpen = true;
          setOpen(true, false);
        }
        return false;
      }
      if (card && reduced) {
        if (!open) setOpen(true, false);
        return false;
      }
      if (!options.preview || reduced) return false;
      if (playable && !handOff && card.once && time + cardLead >= 8) takeOver();
      if (playable && handOff) return false;
      const lead = card ? cardLead : 0,
        c = Math.floor((time + lead) / 8),
        t = (time + lead) % 8;
      let snap = false;
      if (c !== previewCycle) {
        if (card && previewCycle < 0) {
          snap = true;
          element.dataset.reduced = 'true';
        }
        previewCycle = c;
        fired = {};
        reset();
      }
      if (t >= 4.1 && t < 5.0) {
        const s = sync();
        scroller.scrollTop = card
          ? R.smooth((t - 4.1) / 0.9) * pickScroll(s.max)
          : R.smooth((t - 4.1) / 0.9) * s.max * 0.78;
        sync();
      }
      const h = path(t);
      if (!card) {
        hand.style.opacity = h.o.toFixed(3);
        hand.style.transform = 'translate3d(' + h.x.toFixed(1) + 'px,' + h.y.toFixed(1) + 'px,0)';
      }
      const down = (t >= 1.05 && t < 1.2) || (t >= 4.0 && t < 5.05) || (t >= 5.95 && t < 6.1) || (t >= 6.75 && t < 6.9);
      if (card) {
        if (card.pointer) card.pointer({ x: h.x, y: h.y, opacity: h.o * R.clamp(time / 0.4, 0, 1), down });
      } else if (down !== handDown) {
        handDown = down;
        hand.classList.toggle('is-down', down);
      }
      thumb.classList.toggle('is-dragging', t >= 4.0 && t < 5.05);
      once('open', t, 1.12, () => setOpen(true, false));
      once('pick', t, 5.98, () => setActive(9));
      once('close', t, 6.78, () => setOpen(false, false));
      let over = -1;
      if (open && t > 1.6 && t < 6.3 && !(t > 3.7 && t < 5.3)) {
        const sr = element.getBoundingClientRect();
        items.forEach((item, n) => {
          const r = item.getBoundingClientRect(),
            x = h.x + sr.left,
            y = h.y + sr.top;
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) over = n;
        });
      }
      if (over !== previewHot) {
        const prev = previewHot;
        previewHot = over;
        setHot(over, prev < 0 || over < prev);
        if (over < 0) hot = -1;
      }
      if (snap) {
        void element.offsetHeight;
        element.dataset.reduced = String(api.reduced);
      }
      return true;
    });
    if (first >= 0 && items[first]) {
      items[first].classList.add('is-active');
      items[first].setAttribute('aria-current', 'true');
    }
    apply();
    measure();
    const status = api.status;
    api.status = () => ({
      ...status(),
      open,
      active,
      hot,
      scroll: sync().max > 0 ? scroller.scrollTop / sync().max : 0,
      label: open ? count.textContent : word.textContent,
      dragging: !!drag,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountDockMenuDropdown(element, options) {
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
    element.classList.add('dock-menu-dropdown');
    element.innerHTML = '<div class="fx-board" data-dock></div>';
    const stage = element,
      board = stage.querySelector('[data-dock]'),
      cursor = createCursor(stage, { inertia: false });
    const inst = mount(board, {
      params: options.params,
      preview: true,
      catalog: { current: 2 },
      card: {
        lead: 0,
        height: true,
        interactive: true,
        once: true,
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
  global.mountDockMenuDropdown = mountDockMenuDropdown;
  if (typeof module === 'object' && module.exports) module.exports = mountDockMenuDropdown;
})(typeof window !== 'undefined' ? window : this);
