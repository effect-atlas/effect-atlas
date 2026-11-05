/*
 * Curtain Menu
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A full-screen menu that drops over the page like a curtain: a white panel slides down from the top, the big menu
 * words rise into place one after another, and hovering a word dims the others and swaps a preview picture. Made for
 * the main navigation of a portfolio, studio or brand site.
 *
 * How it moves
 * - Open / close is a class toggle (.is-open). The panel sits at translate3d(0, -102%, 0) and slides to 0 in
 *   params.panelDuration ms with cubic-bezier(.22,1,.36,1). Closing slides it back up 1.15 times slower, then hides it.
 * - Menu words: on open each one rises from below with the Web Animations API, same curve, duration .9 x panelDuration,
 *   delay 160 ms + params.itemStagger x index. The rise is 64 px scaled to the word size (64 x word height / 61.4), so
 *   big and small layouts travel the same share of a line. On close the words go up with the panel, no separate exit.
 * - Hover (or keyboard focus) on a word: the stage gets .has-hover, every other word fades to params.dim percent opacity
 *   in 240 ms, and the preview frame shows the picture for that word. Leaving brings everyone back and the frame returns
 *   to its default picture.
 * - Picture swap: params.swap = 'cut' switches instantly; 'fade' crossfades in 180 ms.
 * - Menu button: two 1.5 px lines. Hover pulls them 1 px towards each other; open turns them into an X (+45 / -45 deg)
 *   in 0.5 s. Its label switches between "Open menu" and "Close menu".
 * - Until the first real click on the button, a soft accent ring breathes around it (two outlines growing 10 px and
 *   fading, 2.4 s, half a cycle apart). It hides while the demo cursor is near the button and goes away for good after
 *   the first click.
 * - Layout: the words sit bottom left, sized to fit the height (at least 40 px). The preview frame (4:5) sits right on
 *   wide screens and top left on narrow ones (760 px viewport or less).
 * - Demo, once, starting 3 s after load: a fake cursor clicks the button, runs down the first four words, steps aside,
 *   closes the menu at about 6 s and leaves. Any real pointer move, press or key ends it for good.
 *
 * Options
 *   params.panelDuration  500..1400, default 900    ms for the panel; each word takes .9 x this
 *   params.itemStagger    30..120, default 60       ms between words
 *   params.dim            5..60, default 20         opacity in percent of the words you are not on
 *   params.swap           'cut' | 'fade', default 'cut'   how the preview picture changes
 *   reducedMotion         true / false / null       force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountCurtainMenu(element, {params: {...}, reducedMotion: null});
 *   fx.params                          copy of current params
 *   fx.setParams({itemStagger: 90})    change params live
 *   fx.setPaused(true|false)           freeze / resume
 *   fx.reset()                         params back to defaults, demo stopped, menu closed (quickly if it was open)
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                       removes listeners, observers and the fake cursor
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:600px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountCurtainMenu(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children. For a real site menu make
 * it a fixed, full-viewport layer.
 *
 * Safe to change
 * - Menu words: ITEMS (the layout is tuned for five; fewer is fine, more needs a smaller word size).
 * - Preview pictures: the looks array in mountCurtainMenu; one default picture plus one per word. Put your own images in
 *   the .ct-art blocks.
 * - Colours, font, the frame radius via effect.css. params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The curves on panel and words, and the 160 ms head start before the first word.
 * - Words must move with transforms only, never with top or margin, or the stagger stutters.
 * - Closing slower than opening (x1.15) is deliberate; it reads as the curtain falling back on its own weight.
 * - Do not let a framework re-render the words while the effect runs; it animates them directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountCurtainMenu on an embed div with a fixed height.
 * - Word links are href="#" and their click is prevented; the menu just closes and focus goes back to the button.
 *   A visually hidden polite live region (.ct-live) announces "Menu opened." / "Menu closed." and "Go to <word>.".
 *   Replace that click handler with your router navigation.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The button has aria-expanded and a changing label. The menu is a labelled section, aria-hidden and out of the tab
 *   order while closed. Escape closes it and returns focus to the button. Focus on a word previews it like hover.
 * - On touch the first tap on a word previews it; a second tap on the same word follows it.
 * - With reduced motion: no fake cursor, no demo, all transitions off and no word animation, so the menu opens and
 *   closes instantly. The ring around the button stays still.
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
  const R = { smooth, mix, clamp };

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
    { key: 'panelDuration', type: 'range', default: 900, min: 500, max: 1400, step: 50 },
    { key: 'itemStagger', type: 'range', default: 60, min: 30, max: 120, step: 5 },
    { key: 'dim', type: 'range', default: 20, min: 5, max: 60, step: 5 },
    { key: 'swap', type: 'select', default: 'cut', options: [{ value: 'cut' }, { value: 'fade' }] },
  ];

  // ---- the effect ----
  const CARD_LEAD = 1.25,
    CARD_RISE = 38;
  const CARD_ONCE = 8.2;
  const ITEMS = ['Work', 'Studio', 'Journal', 'Contact', 'Careers'];
  const OUT = 'cubic-bezier(.22,1,.36,1)',
    SPRING = 'cubic-bezier(.28,1.3,.36,1)';
  const T = {
    rise: 64,
    itemLength: 0.9,
    itemLead: 160,
    itemEase: OUT,
    wordDur: 640,
    wordLead: 520,
    wordGap: 45,
    wordExit: 560,
    wordExitGap: 36,
    blockGap: 360,
    lineGap: 80,
    charGap: 16,
    charDur: 220,
    handleLead: 880,
  };
  const ART = [
    '<rect width="80" height="100" fill="#f0f0ef"/>' +
      Array.from(
        { length: 24 },
        (_, i) =>
          '<circle cx="' +
          (16 + (i % 4) * 16) +
          '" cy="' +
          (22 + Math.floor(i / 4) * 12) +
          '" r="1.4" fill="rgba(23,24,26,.32)"/>',
      ).join(''),
    '<rect width="80" height="100" fill="#17181a"/><circle cx="40" cy="46" r="17" fill="none" stroke="#fff" stroke-width="3"/>',
    '<rect width="80" height="100" fill="rgba(23,24,26,.16)"/><rect x="24" y="30" width="32" height="32" fill="#17181a"/>',
    '<rect width="80" height="100" fill="#4559ff"/><circle cx="40" cy="50" r="12" fill="#fff"/>',
    '<rect width="80" height="100" fill="rgba(23,24,26,.32)"/>' +
      [0, 1, 2, 3, 4].map((i) => '<rect x="14" y="' + (26 + i * 10) + '" width="52" height="3" fill="#fff"/>').join(''),
    '<rect width="80" height="100" fill="rgba(23,24,26,.08)"/><path d="M22 32 58 68M58 32 22 68" stroke="#17181a" stroke-width="3"/>',
  ];
  const chars = (text) =>
    [...text].map((c) => '<span class="ct-ch">' + (c === ' ' ? '&nbsp;' : c) + '</span>').join('');
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('ct-stage');
    const card = options.card || null;
    const burger =
      '<button type="button" class="ct-burger" aria-label="Open menu" aria-expanded="false"><span class="ct-lines"><i></i><i></i></span></button>';
    if (card) {
      element.dataset.card = '';
      element.innerHTML =
        '<button type="button" class="ct-burger ck-pill" tabindex="-1" aria-label="Open menu" aria-expanded="false"><span class="ct-lines"><i class="ck-line" data-strong></i><i class="ck-line" data-strong></i></span></button>' +
        '<div class="ct-drop"><section class="ct-menu ck-panel" data-size="lg" aria-label="Main menu" aria-hidden="true"><nav class="ct-list">' +
        ITEMS.map(
          (t, i) =>
            '<a href="#" class="ct-item ck-row ck-text" data-strong data-i="' + i + '" tabindex="-1">' + t + '</a>',
        ).join('') +
        '</nav>' +
        '<div class="ct-shot" aria-hidden="true">' +
        ART.map(
          (a, i) =>
            '<div class="ct-art' +
            (i === 0 ? ' is-on' : '') +
            '" data-a="' +
            i +
            '">' +
            (card.media ? card.media(i) : '') +
            '</div>',
        ).join('') +
        '</div></section></div><p class="ct-live" aria-live="polite"></p>';
    } else
      element.innerHTML =
        '<div class="ct-screen">' +
        '<div class="ct-page"><header class="ct-head"><span class="ct-mark"><b>Studio</b></span><nav class="ct-mini" aria-hidden="true">' +
        ITEMS.map((t) => '<span>' + t + '</span>').join('') +
        '</nav><span class="ct-chip" aria-hidden="true">Contact</span></header>' +
        '<div class="ct-body" aria-hidden="true"><p class="ct-lede">Quiet, exact rooms<br>for people who cook.</p><div class="ct-blocks"><i></i><i></i><i></i></div></div></div>' +
        '<div class="ct-shade" aria-hidden="true"></div>' +
        '<section class="ct-menu" aria-label="Main menu" aria-hidden="true"><nav class="ct-list">' +
        ITEMS.map(
          (t, i) => '<a href="#" class="ct-item" data-i="' + i + '" tabindex="-1"><span>' + t + '</span></a>',
        ).join('') +
        '</nav>' +
        '<div class="ct-side"><div class="ct-frame" aria-hidden="true">' +
        ART.map(
          (a, i) =>
            '<svg class="ct-art' +
            (i === 0 ? ' is-on' : '') +
            '" data-a="' +
            i +
            '" viewBox="0 0 80 100" preserveAspectRatio="xMidYMid slice">' +
            a +
            '</svg>',
        ).join('') +
        '</div>' +
        '<div class="ct-foot"><div class="ct-sec"><p class="ct-t">' +
        chars('Studio') +
        '</p><p>' +
        chars('12 Long Street') +
        '</p><p>' +
        chars('North Quarter') +
        '</p></div><div class="ct-sec"><p class="ct-t">' +
        chars('Enquiries') +
        '</p><p>' +
        chars('hello@studio.test') +
        '</p></div></div></div>' +
        '<span class="ct-word" aria-hidden="true">' +
        [...'Studio'].map((c) => '<span class="ct-wl"><span>' + c + '</span></span>').join('') +
        '</span><span class="ct-handle" aria-hidden="true">' +
        chars('@studio') +
        '</span></section>' +
        burger +
        '</div><p class="cr-hint" data-cr-chrome>Click the menu button · Hover items to preview · Esc to close</p><p class="cr-sr ct-live" aria-live="polite"></p><div class="ct-hand" aria-hidden="true"></div>';
    const $ = (s) => element.querySelector(s),
      screen = $('.ct-screen'),
      page = $('.ct-page'),
      menu = $('.ct-menu'),
      btn = $('.ct-burger'),
      live = $('.ct-live'),
      hand = $('.ct-hand');
    const items = [...element.querySelectorAll('.ct-item')],
      arts = [...element.querySelectorAll('.ct-art')],
      secs = [...element.querySelectorAll('.ct-sec')],
      letters = [...element.querySelectorAll('.ct-wl>span')],
      handle = [...element.querySelectorAll('.ct-handle .ct-ch')];
    if (card && card.big)
      items.forEach((it) => {
        it.classList.remove('ck-row', 'ck-text');
        it.removeAttribute('data-strong');
      });
    let open = false,
      hover = -1,
      running = [],
      previewCycle = -1,
      fired = {},
      handDown = false,
      previewOver = -2;
    function apply() {
      const p = api.params;
      element.style.setProperty('--panel', p.panelDuration + 'ms');
      element.style.setProperty('--dim', String(p.dim / 100));
      element.classList.toggle('is-fade', p.swap === 'fade');
    }
    function anim(el, frames, o) {
      const a = api.animate(el, frames, Object.assign({ fill: 'both' }, o));
      running.push(a);
      return a;
    }
    function stopRunning() {
      running.forEach((a) => {
        try {
          a.cancel();
        } catch {}
      });
      running = [];
    }
    function setHover(i) {
      hover = i;
      element.classList.toggle('has-hover', i >= 0);
      items.forEach((it, n) => it.classList.toggle('is-hot', n === i));
      arts.forEach((a, n) => a.classList.toggle('is-on', n === i + 1 || (i < 0 && n === 0)));
    }
    function setOpen(next, announce) {
      if (next === open) return;
      open = next;
      stopRunning();
      const D = api.params.panelDuration,
        S = api.params.itemStagger;
      element.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', String(!open));
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      items.forEach((it) => (it.tabIndex = open ? 0 : -1));
      if (announce) live.textContent = open ? 'Menu opened.' : 'Menu closed.';
      if (api.reduced) {
        setHover(-1);
        return;
      }
      if (open) {
        setHover(-1);
        items.forEach((it, i) =>
          anim(
            it,
            [
              { transform: 'translateY(' + (card ? (card.big ? pitchRise() : CARD_RISE) : T.rise) + 'px)' },
              { transform: 'translateY(0)' },
            ],
            { duration: D * T.itemLength, delay: T.itemLead + i * S, easing: T.itemEase },
          ),
        );
        letters.forEach((l, i) =>
          anim(l, [{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }], {
            duration: T.wordDur,
            delay: T.wordLead + i * T.wordGap,
            easing: OUT,
          }),
        );
        secs.forEach((sec, si) => {
          const base = T.blockGap * si;
          [...sec.children].forEach((p, pi) =>
            [...p.querySelectorAll('.ct-ch')].forEach((ch, ci) =>
              anim(ch, [{ opacity: 0 }, { opacity: 1 }], {
                duration: T.charDur,
                delay: base + (pi ? T.lineGap : 0) + ci * T.charGap,
                easing: 'linear',
              }),
            ),
          );
        });
        handle.forEach((ch, ci) =>
          anim(ch, [{ opacity: 0 }, { opacity: 1 }], {
            duration: T.charDur,
            delay: T.handleLead + ci * T.charGap,
            easing: 'linear',
          }),
        );
      } else {
        setHover(-1);
        if (page)
          anim(page, [{ transform: 'translateY(22%)' }, { transform: 'translateY(0)' }], {
            duration: D,
            easing: OUT,
            fill: 'none',
          });
        letters.forEach((l, i) =>
          anim(l, [{ transform: 'translateY(0)' }, { transform: 'translateY(110%)' }], {
            duration: T.wordExit,
            delay: (letters.length - 1 - i) * T.wordExitGap,
            easing: OUT,
          }),
        );
        [...secs.flatMap((s) => [...s.querySelectorAll('.ct-ch')]), ...handle].forEach((ch) =>
          anim(ch, [{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: 'ease-in-out' }),
        );
      }
    }
    items.forEach((it, i) => {
      api.listen(it, 'pointerenter', (e) => {
        if (e.pointerType !== 'touch' && open && !api.paused) setHover(i);
      });
      api.listen(it, 'pointerleave', (e) => {
        if (e.pointerType !== 'touch' && hover === i) setHover(-1);
      });
      api.listen(it, 'focus', () => {
        if (open) setHover(i);
      });
      api.listen(it, 'blur', () => {
        if (hover === i) setHover(-1);
      });
      api.listen(it, 'click', (e) => {
        e.preventDefault();
        if (api.paused) return;
        live.textContent = 'Go to ' + ITEMS[i] + '.';
        setOpen(false, false);
        btn.focus({ preventScroll: true });
      });
    });
    api.listen(btn, 'click', () => {
      if (!api.paused) setOpen(!open, true);
    });
    api.listen(element, 'keydown', (e) => {
      if (e.key === 'Escape' && open) {
        setOpen(false, true);
        btn.focus();
      }
    });
    function reset() {
      stopRunning();
      open = true;
      setOpen(false, false);
      stopRunning();
      setHover(-1);
    }
    api.on('params', apply);
    api.on('replay', () => {
      reset();
      previewCycle = -1;
      previewOver = -2;
    });
    api.on('motion', () => {
      stopRunning();
    });
    const center = (el, fx = 0.5, fy = 0.5) => {
      const s = element.getBoundingClientRect(),
        r = el.getBoundingClientRect();
      return { x: r.left - s.left + r.width * fx, y: r.top - s.top + r.height * fy };
    };
    function itemAt(i) {
      if (card) {
        const it = items[i];
        let x = 0,
          y = 0;
        for (let n = it; n && n !== element; n = n.offsetParent) {
          x += n.offsetLeft;
          y += n.offsetTop;
        }
        return { x: x + Math.min(it.offsetWidth * 0.55, 140), y: y + it.offsetHeight * 0.55 };
      }
      const s = element.getBoundingClientRect(),
        sc = screen.getBoundingClientRect(),
        it = items[i];
      return {
        x: sc.left - s.left + it.offsetLeft + Math.min(it.offsetWidth * 0.55, 140),
        y: sc.top - s.top + it.offsetTop + it.offsetHeight * 0.55,
      };
    }
    function path(t) {
      const s = element.getBoundingClientRect(),
        rest = { x: s.width * 0.6, y: s.height * 0.86 },
        b = center(btn, 0.55, 0.6),
        gap =
          card && card.big
            ? { x: besideList(), y: itemAt(4).y }
            : { x: itemAt(3).x + 60, y: itemAt(4).y + (card ? 0 : 60) };
      const pts = [
        [0, rest, 0],
        [card ? 0.15 : 0.25, rest, 0],
        [0.45, rest, 1],
        [0.95, b, 1],
        [1.25, b, 1],
        [2.2, itemAt(0), 1],
        [2.7, itemAt(0), 1],
        [2.95, itemAt(1), 1],
        [3.4, itemAt(1), 1],
        [3.65, itemAt(2), 1],
        [4.1, itemAt(2), 1],
        [4.35, itemAt(3), 1],
        [4.8, itemAt(3), 1],
        [5.2, gap, 1],
        [5.5, gap, 1],
        [6.0, b, 1],
        [6.35, b, 1],
        [7.1, rest, 1],
        [7.5, rest, 0],
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
    let handOff = false;
    const live2 = card && card.interactive;
    const intro = live2 && card.once && card.introDelay > 0 ? +card.introDelay : 0;
    function pitchRise() {
      return Math.round((T.rise * items[0].offsetHeight) / 61.4);
    }
    function besideList() {
      let x = 0;
      for (let n = items[0].offsetParent; n && n !== element; n = n.offsetParent) x += n.offsetLeft;
      return x + Math.max(...items.map((it) => it.offsetLeft + it.offsetWidth)) + 40;
    }
    function takeOver() {
      if (handOff) return;
      handOff = true;
      if (card.pointer) card.pointer({ x: 0, y: 0, opacity: 0, down: false });
      if (hover >= 0 && !items[hover].matches(':hover')) setHover(-1);
    }
    if (live2) {
      btn.tabIndex = 0;
      let lastType = 'mouse',
        tapHot = -1;
      const touched = () => {
        if (!api.paused && card.touched) card.touched();
      };
      api.listen(element, 'pointermove', (e) => {
        if (e.pointerType === 'mouse' && !e.movementX && !e.movementY) return;
        takeOver();
      });
      api.listen(element, 'pointerdown', (e) => {
        lastType = e.pointerType;
        takeOver();
        tapHot = hover;
      });
      api.listen(
        element,
        'keydown',
        (e) => {
          if (e.key === 'Escape' && open) touched();
          takeOver();
        },
        true,
      );
      api.listen(
        element,
        'click',
        (e) => {
          if (lastType !== 'touch' || !open || api.paused) return;
          const it = e.target.closest('.ct-item');
          if (!it) {
            if (hover >= 0 && !e.target.closest('.ct-burger')) setHover(-1);
            return;
          }
          const i = +it.dataset.i;
          if (i === tapHot) return;
          e.preventDefault();
          e.stopPropagation();
          setHover(i);
          touched();
        },
        true,
      );
      api.listen(btn, 'click', touched);
      items.forEach((it) => api.listen(it, 'click', touched));
      api.restore = () => {
        takeOver();
        stopRunning();
        if (intro) {
          if (open) {
            if (!api.reduced) element.style.setProperty('--panel', '500ms');
            setOpen(false, false);
            running.forEach((a) => a.finish());
            void getComputedStyle(menu).transform;
            apply();
          }
        } else if (!open) {
          if (!api.reduced) element.style.setProperty('--panel', '500ms');
          setOpen(true, false);
          running.forEach((a) => a.finish());
          void getComputedStyle(menu).transform;
          apply();
        }
        setHover(-1);
      };
    }
    api.frame(({ time, reduced }) => {
      if (live2 && handOff) return false;
      if (card && reduced) {
        if (!intro && !open) setOpen(true, false);
        return false;
      }
      if (!options.preview || reduced) return false;
      if (intro) {
        if (time < intro) return true;
        time -= intro;
        if (time >= 8) {
          takeOver();
          return false;
        }
      } else if (live2 && card.once && time >= CARD_ONCE) {
        takeOver();
        return false;
      }
      const tt = intro ? time : card ? time + CARD_LEAD : time,
        c = Math.floor(tt / 8),
        t = tt % 8;
      let snap = false;
      if (c !== previewCycle) {
        if (card && !intro && previewCycle < 0) {
          snap = true;
          element.dataset.reduced = 'true';
        }
        previewCycle = c;
        fired = {};
        reset();
        previewOver = -2;
      }
      const h = path(t),
        down = (t >= 1.0 && t < 1.15) || (t >= 6.05 && t < 6.2);
      if (live2 && card.once && !intro) h.o *= R.clamp((CARD_ONCE - time) / 0.3, 0, 1);
      if (card) {
        if (card.pointer) card.pointer({ x: h.x, y: h.y, opacity: h.o * R.clamp(time / 0.4, 0, 1), down });
      } else {
        hand.style.opacity = h.o.toFixed(3);
        hand.style.transform = 'translate3d(' + h.x.toFixed(1) + 'px,' + h.y.toFixed(1) + 'px,0)';
        if (down !== handDown) {
          handDown = down;
          hand.classList.toggle('is-down', down);
        }
      }
      if (t >= 1.05 && !fired.o) {
        fired.o = true;
        setOpen(true, false);
      }
      if (t >= 6.1 && !fired.c) {
        fired.c = true;
        setOpen(false, false);
      }
      if (open && t > 2.0 && t < 6) {
        const sr = element.getBoundingClientRect();
        let over = -1;
        items.forEach((it, n) => {
          const r = it.getBoundingClientRect(),
            x = h.x + sr.left,
            y = h.y + sr.top;
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) over = n;
        });
        if (over !== previewOver) {
          previewOver = over;
          setHover(over);
        }
      }
      if (snap) {
        running.forEach((a) => a.finish());
        void element.offsetHeight;
        element.dataset.reduced = String(api.reduced);
      }
      return true;
    });
    apply();
    const status = api.status;
    api.status = () => ({ ...status(), open, hover, preview: arts.findIndex((a) => a.classList.contains('is-on')) });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountCurtainMenu(element, options) {
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
    element.classList.add('curtain-menu');
    element.innerHTML = '<div class="fx-board" data-curtain></div>';
    const listeners = new AbortController();
    const stage = element,
      board = stage.querySelector('[data-curtain]'),
      cursor = createCursor(stage, { inertia: false });
    const looks = [
      { tone: 1, glyph: false },
      { tone: 2, glyph: 0 },
      { tone: 1, glyph: 2 },
      { tone: 2, glyph: 1, accent: true },
      { tone: 1, glyph: 3 },
      { tone: 2, glyph: 0 },
    ];
    const M = 8,
      RESERVE = 16 + 142 + 24,
      narrowQ = matchMedia('(max-width:760px)');
    function layout() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        sw = W - 2 * M,
        sh = H - 2 * M,
        narrow = narrowQ.matches;
      const pad = narrow ? 20 : Math.round(Math.min(56, Math.max(32, sw * 0.045)));
      let f, pw, ph, px, py;
      if (!narrow) {
        f = Math.floor(Math.max(40, Math.min(sh * 0.126, (H - M - pad - RESERVE) / 4.95)));
        const top = sh - pad - 4.95 * f;
        py = Math.round(top + 0.13 * f);
        ph = Math.round(Math.min((sw * 0.19) / 0.8, sh - pad - py));
        pw = Math.round(ph * 0.8);
        px = sw - pad - pw;
      } else {
        f = Math.floor(Math.min(sh * 0.09, sw * 0.15));
        const top = sh - pad - 4.95 * f;
        ph = Math.round(Math.min(top - pad - 24, sh * 0.42));
        pw = Math.round(ph * 0.8);
        px = pad;
        py = pad;
      }
      const s = board.style;
      s.setProperty('--ct-f', f + 'px');
      s.setProperty('--ct-x', pad + 'px');
      s.setProperty('--ct-b', pad + 'px');
      s.setProperty('--ct-px', px + 'px');
      s.setProperty('--ct-py', py + 'px');
      s.setProperty('--ct-pw', pw + 'px');
      s.setProperty('--ct-ph', ph + 'px');
      s.setProperty('--ct-k', (pw / 144).toFixed(4));
    }
    layout();
    let ring = null,
      btn = null;
    const inst = mount(board, {
      params: options.params,
      preview: true,
      card: {
        big: true,
        interactive: true,
        once: true,
        introDelay: 3,
        media: (i) => media(Object.assign({ size: 'sm' }, looks[i])),
        pointer: (st) => {
          cursor.set(st);
          handNear(st);
        },
      },
    });
    btn = board.querySelector('.ct-burger');
    if (btn) {
      ring = document.createElement('div');
      ring.className = 'ctx-ring';
      ring.setAttribute('aria-hidden', 'true');
      btn.after(ring);
      btn.addEventListener(
        'click',
        (e) => {
          if (!e.isTrusted || !ring) return;
          const r = ring;
          ring = null;
          r.setAttribute('data-gone', '');
          setTimeout(() => r.remove(), 340);
        },
        { signal: listeners.signal },
      );
    }
    function placeRing() {
      if (!ring) return;
      const b = board.getBoundingClientRect(),
        r = btn.getBoundingClientRect();
      ring.style.cssText =
        '--ctx-x:' +
        (r.left - b.left) +
        'px;--ctx-y:' +
        (r.top - b.top) +
        'px;--ctx-w:' +
        r.width +
        'px;--ctx-h:' +
        r.height +
        'px';
    }
    function handNear(st) {
      if (!ring) return;
      const b = board.getBoundingClientRect(),
        r = btn.getBoundingClientRect();
      const dx = st.x - (r.left - b.left + r.width / 2),
        dy = st.y - (r.top - b.top + r.height / 2);
      ring.toggleAttribute('data-quiet', (+st.opacity || 0) > 0.05 && Math.hypot(dx, dy) < 140);
    }
    placeRing();
    const observer0 = new ResizeObserver(() => {
      layout();
      placeRing();
    });
    observer0.observe(stage);

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
  global.mountCurtainMenu = mountCurtainMenu;
  if (typeof module === 'object' && module.exports) module.exports = mountCurtainMenu;
})(typeof window !== 'undefined' ? window : this);
