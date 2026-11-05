/*
 * Fractured Word Hover
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A large one-line link ("Start a project"). Hover a word and it cracks along a jagged line: the top half jumps up and
 * left, the bottom half down and right, with a small springy overshoot; leave and it closes again. Good for a big
 * call to action, a footer contact line or display-size navigation.
 *
 * How it moves
 * - All CSS. JS only toggles .is-hover on the hovered word and writes a few custom properties.
 * - Each word is rendered three times: the real text, plus ::before and ::after copies (content: attr(data-word))
 *   stacked on top. ::before is clipped to the area above a zigzag cut (polygon through 44%, 52%, 41%, 63%, 50%,
 *   60% of the height, right to left); ::after to the area below the same cut. The two halves therefore fit together exactly.
 * - Hover: the real text turns transparent instantly and the halves become visible. The top half moves
 *   (-0.03 em, -0.07 em) and rotates -1 deg around 25% 35%; the bottom half moves (+0.03 em, +0.07 em) and
 *   rotates +0.7 deg around 75% 65%. All values are multiplied by crack / 100.
 * - In: duration params.ms, easing cubic-bezier(0.28, 1 + spring / 100, 0.36, 1). spring 100 gives a y1 of 2,
 *   a clear overshoot; spring 0 gives a plain ease-out.
 * - Out: duration 0.65 x ms with cubic-bezier(0.22, 1, 0.36, 1), no overshoot. Only after that time do the halves
 *   hide and the real text return (an opacity / color step delayed by the out duration), so there is no visible seam.
 * - Each word is its own hover zone; hovering "project" leaves "Start" and "a" whole.
 * - Size: font size = min(120 px, the size that fits with about 40 px margins; 24 px at 760 px and below). The line
 *   is centred.
 * - Demo, once, 3 s after load: a fake cursor sweeps over the words one by one (about 3.6 s). Any real pointer move
 *   with actual movement, a press, or focus inside the stage ends it for good.
 *
 * Options
 *   params.crack   0..300, default 100      size of the split in percent; 0 = no visible crack
 *   params.spring  0..200, default 100      overshoot on the way in; 0 = none
 *   params.ms      200..1200 ms, default 460   open duration; close is 0.65 x this
 *   reducedMotion  true / false / null      force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountFracturedWordHover(element, {params: {...}, reducedMotion: null});
 *   fx.params                  copy of current params
 *   fx.setParams({crack: 200}) change params live (values are clamped to the ranges above)
 *   fx.setPaused(true|false)   while paused, new hovers and clicks are ignored
 *   fx.reset()                 params back to defaults, demo ended, every word closed
 *   fx.setReducedMotion(bool|null)
 *   fx.destroy()               removes listeners, observers and the fake cursor
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountFracturedWordHover(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The text: line: 'Start a project' in mountFracturedWordHover. Words are split on spaces; each needs its
 *   data-word attribute to match its text (the markup helper does this).
 * - The layout() function (font size and position of the line).
 * - Colour via --fx-color on .fx-link, font in .fx-line.
 * - The zigzag: both clip-path polygons, as long as ::before and ::after share the same cut points.
 *
 * Do not change (the feel breaks)
 * - The shared cut line between the two clip-paths; if they differ you get a gap or a doubled band.
 * - The delayed hide on leave (the "opacity 0s linear var(--fx-shut)" transitions). Without it the real text pops back
 *   before the halves have closed.
 * - em-based offsets, so the crack scales with the font size.
 * - Inside .fx-stage, --fx-open / --fx-shut are durations and --fx-open-ease / --fx-shut-ease easings. Keep them scoped there.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - The visual part is pure CSS: you can copy the .fx-word rules and the markup
 *   <span class="fx-word" data-word="Start">Start</span> and toggle .is-hover on the parent .fx-link yourself, or
 *   rewrite the selector as .fx-link:hover.
 * - Using the JS: mount once on a ref after the element is in the DOM; call fx.destroy() on unmount. In React
 *   StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountFracturedWordHover on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The whole line is one link (<a href="#">, click prevented by default; remove the preventDefault to make it real).
 *   The duplicated half-words are pseudo-elements, so screen readers read the text once. Keyboard focus
 *   (focus-visible) cracks every word of the line and shows a focus ring. There are no other keyboard actions.
 * - Touch: a tap cracks the tapped word and keeps it open until you tap elsewhere.
 * - With reduced motion: the halves are hidden, words never crack, no demo cursor.
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
    { key: 'crack', type: 'range', default: 100, min: 0, max: 300, step: 10 },
    { key: 'spring', type: 'range', default: 100, min: 0, max: 200, step: 10 },
    { key: 'ms', type: 'range', default: 460, min: 200, max: 1200, step: 20 },
  ];

  // ---- the effect ----
  const NAV = ['Work', 'About', 'Journal', 'Contact'],
    SOCIAL = ['Instagram', 'Newsletter', 'Careers'];
  const link = (t, cls) =>
    '<a href="#" class="fx-link' +
    (cls ? ' ' + cls : '') +
    '">' +
    t
      .split(' ')
      .map((w) => '<span class="fx-word" data-word="' + w + '">' + w + '</span>')
      .join(' ') +
    '</a>';
  const lineLink = (t) =>
    '<a href="#" class="fx-link fx-line">' +
    t
      .split(' ')
      .map((w) => '<span class="fx-link fx-part"><span class="fx-word" data-word="' + w + '">' + w + '</span></span>')
      .join(' ') +
    '</a>';
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('fx-stage');
    const card = options.card || null,
      line = card && card.line ? String(card.line) : '',
      page = !card || (!!card.page && !line);
    if (page)
      element.innerHTML =
        '<div class="fx-page ck-panel" data-size="lg"><header class="fx-bar"><span class="fx-brand ck-text" data-strong><i class="ck-dot" data-accent aria-hidden="true"></i>Studio</span><nav class="fx-nav" aria-label="Sample navigation">' +
        NAV.map((t) => link(t)).join('') +
        '</nav></header>' +
        '<div class="fx-hero"><span class="ck-hint">Have something in mind?</span>' +
        link('Start a project', 'fx-cta') +
        '</div>' +
        '<footer class="fx-foot"><span class="ck-hint">Studio, 2026</span><nav class="fx-social" aria-label="Sample footer links">' +
        SOCIAL.map((t) => link(t)).join('') +
        '</nav></footer></div>' +
        (card
          ? ''
          : '<p class="cr-hint" data-cr-chrome>Hover or tab to any link</p><div class="fx-hand" aria-hidden="true"></div>') +
        '<p class="cr-sr fx-live" aria-live="polite"></p>';
    else if (line) element.innerHTML = lineLink(line) + '<p class="cr-sr fx-live" aria-live="polite"></p>';
    else
      element.innerHTML =
        '<div class="fx-mini ck-panel">' +
        link('Contact', 'fx-big') +
        '<nav class="fx-row" aria-label="Sample links">' +
        ['Work', 'About', 'Journal'].map((t) => link(t)).join('') +
        '</nav></div><p class="cr-sr fx-live" aria-live="polite"></p>';
    const links = [...element.querySelectorAll('.fx-link')],
      live = element.querySelector('.fx-live'),
      hand = element.querySelector('.fx-hand'),
      pageEl = element.querySelector('.fx-page'),
      lineEl = element.querySelector('.fx-line');
    const spots = lineEl ? links.filter((el) => el !== lineEl) : links,
      anchors = lineEl ? [lineEl] : links;
    if (card && !card.interactive) anchors.forEach((a) => (a.tabIndex = -1));
    const setHover = (el, on) => el.classList.toggle('is-hover', on);
    function apply() {
      const { crack, spring, ms } = api.params,
        vars = {
          '--fx-amt': crack / 100,
          '--fx-open': ms + 'ms',
          '--fx-shut': Math.round(ms * 0.65) + 'ms',
          '--fx-open-ease': 'cubic-bezier(.28,' + (1 + spring / 100).toFixed(2) + ',.36,1)',
        };
      for (const k in vars) element.style.setProperty(k, String(vars[k]));
    }
    let unit = null;
    function place() {
      if (lineEl) {
        if (!unit) {
          lineEl.style.setProperty('--fx-size', '100px');
          unit = { w: lineEl.offsetWidth / 100, h: lineEl.offsetHeight / 100 };
        }
        const W = api.width,
          H = api.height,
          L = card.layout ? card.layout(W, H, unit) : { size: Math.min(120, (W - 48) / unit.w) };
        const s = L.size,
          x = L.x == null ? (W - s * unit.w) / 2 : L.x,
          y = L.y == null ? (H - s * unit.h) / 2 : L.y;
        lineEl.style.setProperty('--fx-size', s.toFixed(2) + 'px');
        lineEl.style.setProperty('--fx-x', x.toFixed(1) + 'px');
        lineEl.style.setProperty('--fx-y', y.toFixed(1) + 'px');
        return;
      }
      if (!pageEl) return;
      const W = api.width,
        H = api.height;
      const L =
        card && card.layout
          ? card.layout(W, H)
          : (() => {
              const w = Math.min(820, W * 0.8);
              return { x: (W - w) / 2, y: null, w };
            })();
      pageEl.style.setProperty('--fx-w', L.w.toFixed(1) + 'px');
      pageEl.style.setProperty('--fx-x', L.x.toFixed(1) + 'px');
      const y = L.y == null ? (H - pageEl.offsetHeight) / 2 - (card ? 0 : H * 0.03) : L.y;
      pageEl.style.setProperty('--fx-y', Math.max(0, y).toFixed(1) + 'px');
    }
    api.on('resize', place);
    if (lineEl && document.fonts) {
      const again = () => {
        if (!api.destroyed) {
          unit = null;
          place();
        }
      };
      document.fonts.ready.then(again);
      api.listen(document.fonts, 'loadingdone', again);
    }
    let handOff = false,
      stuck = null,
      lastType = '',
      previewOver = null,
      previewCycle = -1;
    const live2 = !card || !!card.interactive;
    const intro = card && card.interactive && card.once && card.introDelay > 0 ? +card.introDelay : 0;
    links.forEach((el) => {
      if (spots.includes(el)) {
        api.listen(el, 'pointerenter', (e) => {
          if (e.pointerType !== 'touch' && live2 && !api.paused) setHover(el, true);
        });
        api.listen(el, 'pointerleave', () => {
          if (stuck === el) return;
          setHover(el, false);
        });
      }
      if (!anchors.includes(el)) return;
      api.listen(el, 'focus', () => {
        if (live2 && el.matches(':focus-visible')) setHover(el, true);
      });
      api.listen(el, 'blur', () => {
        if (stuck !== el) setHover(el, false);
      });
      api.listen(el, 'click', (e) => {
        e.preventDefault();
        if (!live2 || api.paused) return;
        if (e.detail && lastType === 'touch') {
          const t = (lineEl && spots.find((s) => s.contains(e.target))) || el;
          if (stuck && stuck !== t) setHover(stuck, false);
          stuck = t;
          setHover(t, true);
        }
        live.textContent = (el.textContent || '').trim() + ' clicked.';
      });
    });
    function clearAll() {
      links.forEach((el) => setHover(el, false));
      stuck = null;
      previewOver = null;
    }
    function takeOver() {
      if (handOff) return;
      handOff = true;
      if (previewOver) setHover(previewOver, false);
      previewOver = null;
      spots.forEach((el) => {
        if (el.matches(':hover')) setHover(el, true);
      });
      if (card && card.pointer) card.pointer({ x: 0, y: 0, opacity: 0, down: false });
      if (hand) hand.style.opacity = '0';
    }
    api.listen(
      element,
      'pointerdown',
      (e) => {
        lastType = e.pointerType;
        if (card && card.interactive) takeOver();
        if (stuck && !stuck.contains(e.target)) {
          setHover(stuck, false);
          stuck = null;
        }
      },
      true,
    );
    if (card && card.interactive) {
      api.listen(
        element,
        'pointermove',
        (e) => {
          if (!handOff && !(e.pointerType === 'mouse' && !e.movementX && !e.movementY)) takeOver();
        },
        true,
      );
      api.listen(element, 'focusin', () => takeOver());
      api.restore = () => {
        takeOver();
        clearAll();
        live.textContent = '';
      };
    }
    api.on('params', apply);
    api.on('replay', () => {
      clearAll();
      previewCycle = -1;
    });
    const center = (el, fx = 0.5, fy = 0.6) => {
      const s = element.getBoundingClientRect(),
        r = el.getBoundingClientRect();
      return { x: r.left - s.left + r.width * fx, y: r.top - s.top + r.height * fy };
    };
    function path(t) {
      const s = element.getBoundingClientRect(),
        rest = { x: s.width * 0.8, y: s.height * 0.9 },
        P = (i) => center(links[i]);
      let pts;
      if (page) {
        const c1 = center(links[4], 0.3, 0.6),
          c2 = center(links[4], 0.72, 0.55);
        pts = [
          [0, rest, 0],
          [0.3, rest, 0],
          [0.6, rest, 1],
          [1.1, P(0), 1],
          [1.6, P(0), 1],
          [1.85, P(1), 1],
          [2.35, P(1), 1],
          [2.6, P(2), 1],
          [3.1, P(2), 1],
          [3.75, c1, 1],
          [4.4, c1, 1],
          [4.7, c2, 1],
          [5.4, c2, 1],
          [6, P(6), 1],
          [6.5, P(6), 1],
          [6.75, P(7), 1],
          [7.2, P(7), 1],
          [7.6, rest, 1],
          [7.8, rest, 0],
          [8, rest, 0],
        ];
      } else if (lineEl) {
        pts = [[0, rest, 0]];
        let k = 0;
        spots.forEach((el, i) => {
          const c = center(el);
          k += i ? 0.35 : 0.45;
          pts.push([k, c, 1]);
          k += 0.5;
          pts.push([k, c, 1]);
        });
        pts.push([k + 0.6, rest, 1], [k + 0.8, rest, 0], [k + 0.95, rest, 0]);
      } else {
        const b = center(links[0], 0.45, 0.6);
        pts = [
          [0, rest, 0],
          [0.3, rest, 0],
          [0.6, rest, 1],
          [1.1, P(1), 1],
          [1.7, P(1), 1],
          [1.95, P(2), 1],
          [2.6, P(2), 1],
          [3.2, b, 1],
          [4.6, b, 1],
          [5.2, rest, 1],
          [5.6, rest, 0],
          [6, rest, 0],
        ];
      }
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
      if (card && card.interactive && handOff) return false;
      if (!options.preview || reduced) return false;
      const Lp = lineEl ? 1.05 + 0.85 * spots.length : page ? 8 : 6,
        ht = time - intro;
      if (ht < 0) return true;
      if (card && card.interactive && card.once && ht >= Lp) {
        takeOver();
        return false;
      }
      const c = Math.floor(ht / Lp),
        t = ht % Lp;
      if (c !== previewCycle) {
        previewCycle = c;
        if (previewOver) setHover(previewOver, false);
        previewOver = null;
      }
      const h = path(t),
        sr = element.getBoundingClientRect();
      let over = null;
      if (h.o > 0.5)
        spots.forEach((el) => {
          const r = el.getBoundingClientRect(),
            x = h.x + sr.left,
            y = h.y + sr.top;
          if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2) over = el;
        });
      if (over !== previewOver) {
        if (previewOver && previewOver !== stuck && !previewOver.matches(':hover')) setHover(previewOver, false);
        previewOver = over;
        if (over) setHover(over, true);
      }
      if (card && card.pointer) card.pointer({ x: h.x, y: h.y, opacity: h.o, down: false });
      else if (hand) {
        hand.style.opacity = h.o.toFixed(3);
        hand.style.transform = 'translate3d(' + h.x.toFixed(1) + 'px,' + h.y.toFixed(1) + 'px,0)';
      }
      return true;
    });
    apply();
    place();
    const status = api.status;
    api.status = () => ({
      ...status(),
      hovered: links.filter((el) => el.classList.contains('is-hover')).map((el) => el.textContent.trim()),
      handOff,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountFracturedWordHover(element, options) {
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
    element.classList.add('fractured-word-hover');
    element.innerHTML = '<div class="fx-board" data-fx></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-fx]'),
      cursor = createCursor(stage);
    const layout = (W, H, m) => {
      const Z = panelZone(stage, 3),
        fit = (w, h) => Math.min(120, w / m.w, h / m.h);
      if (!!matchMedia('(max-width: 760px)').matches) {
        const size = fit(W - 48, H - 48);
        return { size, x: null, y: null };
      }
      const top = Z.bottom + 24,
        left = Z.right + 24,
        mid = fit(W - 80, H - top - 40),
        side = fit(W - left - 40, H - 80);
      if (mid >= side) {
        const x = (W - mid * m.w) / 2,
          y = (H - mid * m.h) / 2;
        return { size: mid, x, y: x >= left ? y : Math.max(top, y) };
      }
      return { size: side, x: left + (W - left - 40 - side * m.w) / 2, y: null };
    };
    const inst = mount(board, {
      params: options.params,
      preview: true,
      card: { line: 'Start a project', layout, interactive: true, once: true, introDelay: 3, pointer: cursor.set },
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
  global.mountFracturedWordHover = mountFracturedWordHover;
  if (typeof module === 'object' && module.exports) module.exports = mountFracturedWordHover;
})(typeof window !== 'undefined' ? window : this);
