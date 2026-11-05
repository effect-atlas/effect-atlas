/*
 * Scroll Card Stack
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Three cards slide up one after another and pile onto a stage; the cards underneath shrink a little and keep their top
 * edge showing. Scroll, drag or use the arrow keys to move through the stack and back. Good for featured work, a
 * product launch or a chaptered case study.
 *
 * How it moves
 * - One number drives everything: progress, from 0 (first card alone) to 2 (all three stacked). Input sets a target;
 *   progress chases it each frame with exponential damping at rate 1000 / followLag per second (5 at the default
 *   200 ms). Stopping mid-way leaves the cards mid-way; reversing un-stacks continuously.
 * - Per card i: depth = max(0, progress - i), enter = max(0, i - progress).
 *   translateY = enter x stageHeight x 0.87 - depth x stackGap, scale = 1 - depth x shrink / 100,
 *   transform-origin top centre. A card not yet in waits 0.87 stage heights below; a buried card moves up stackGap px
 *   and shrinks shrink percent per level, so its top edge peeks out above the card in front.
 * - Input lives on a virtual track 2.5 stage heights long (one card = 1.25 stage heights).
 *   Wheel: deltaY maps 1:1 onto the track (line mode x 32, page mode x stage height); ctrl+wheel is ignored.
 *   Drag: one px of pointer travel moves the track by 2.5 / 1.74 px, so about 0.87 stage heights of drag is one card.
 *   On touch, drag that runs past either end scrolls the page instead.
 * - Page scroll handoff at the ends: a wheel gesture that moved the stack keeps being swallowed at the end until the
 *   wheel has been quiet for 250 ms (stops trackpad inertia leaking into the page). After that the page scrolls only
 *   once the cards have settled (within 0.02 of the target) and you push another 100 px outward; that count resets
 *   after 1.2 s idle or a direction change.
 * - Keys (the board is focusable): ArrowDown / PageDown / Space next card, ArrowUp / PageUp / Shift+Space previous,
 *   Home / End first / last. Each step is a whole card, eased by the same damping.
 * - Layout: the deck has a 1.62 aspect ratio, width = min(stage width - 2 x 32 px padding (16 under 760 px),
 *   stage height x 0.52 x 1.62, 620 px), centred and pushed 60 px down to leave room for the peeking edges.
 * - Demo, once on load (7 s): a fake cursor with a wheel badge scrolls one card in at 0.5 s, the next at 2.5 s, and both
 *   back out at 4.8 s, then fades. Its scroll is fed at a fixed 60 Hz through the same track. The first real wheel,
 *   press or key ends the demo for good.
 *
 * Options
 *   params.stackGap   16..54, default 30     px each buried card rises per level
 *   params.shrink     3..12, default 6       percent each buried card shrinks per level
 *   params.followLag  150..1000, default 200 ms; time constant of the chase, higher feels heavier
 *   reducedMotion     true / false / null    force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountScrollCardStack(element, {params: {...}, reducedMotion: null});
 *   fx.params                    copy of current params
 *   fx.setParams({stackGap: 40}) change params live
 *   fx.setPaused(true|false)     freeze / resume; input is ignored while paused
 *   fx.reset()                   params back to defaults, demo stopped, stack eases back to the first card over 0.5 s
 *                                (cubic-bezier(0.22, 1, 0.36, 1))
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                 removes listeners, observers and the fake cursor
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountScrollCardStack(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Card faces: the item callback in mountScrollCardStack returns the HTML for card i (now a white card with a centred
 *   mark, the middle one in the accent colour). Put images or text there. The card count is fixed at three
 *   (the projects array and the 0..2 range of progress).
 * - Colours, radius, shadow and accent via the CSS variables in effect.css.
 * - Stage height, params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The exponential chase toward a target. Swapping it for CSS transitions or snapping on a threshold loses the
 *   continuous scrub and the clean reversal.
 * - The 0.87 stage-height entry offset and transform-origin top centre; they make the buried card's top edge peek out.
 * - The wheel latch (250 ms) and the 100 px end push; without them the page jumps as soon as the last card lands.
 * - Keep touch-action: none on the board and pointer capture on drag.
 * - Do not let a framework re-render the cards while the effect runs; it writes transforms to them directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). Without it the rAF loop and listeners leak. In React StrictMode the mount runs twice; destroy
 *   in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - The effect scrolls its own virtual track; it does not use page scroll position or ScrollTrigger. To bind it to page
 *   scroll instead you would have to drive the target yourself.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountScrollCardStack on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The board is a focusable role="group" ("Three cards. Scroll, drag, or use arrow keys.") with a focus ring; the cards
 *   themselves are aria-hidden placeholders. If you put real content in them, give it its own accessible text.
 * - With reduced motion: no demo, no chase. The stack opens fully stacked on the last card; wheel, drag and keys jump
 *   whole cards instantly. It is not turned into a list.
 * - The loop stops when the tab is hidden, the stage is off screen, it is paused, or the cards have settled.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, rate, dt) => mix(a, b, 1 - Math.exp(-rate * dt));
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
  const R = { bars, mark, clamp, mix, damp };

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
    { key: 'stackGap', type: 'range', default: 30, min: 16, max: 54, step: 1 },
    { key: 'shrink', type: 'range', default: 6, min: 3, max: 12, step: 1 },
    { key: 'followLag', type: 'range', default: 200, min: 150, max: 1000, step: 50 },
  ];

  // ---- the effect ----
  const projects = ['01', '02', '03'];
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    const cardOpt = options.card || null;
    if (cardOpt) {
      element.classList.add('stack-stage');
      element.innerHTML =
        '<div class="stack-deck" aria-hidden="true">' +
        projects.map((p, i) => '<div class="stack-card">' + cardOpt.item(i) + '</div>').join('') +
        '</div>';
    } else {
      element.classList.add('stack-stage');
      element.innerHTML =
        '<div class="stack-scroller" tabindex="0" aria-label="Card stack. Scroll down to browse."><div class="stack-runway"><div class="stack-pin"><div class="stack-deck">' +
        projects
          .map(
            (p, i) =>
              '<article class="stack-card"><div class="stack-card-bar"><span>' +
              p +
              ' / 03</span><i aria-hidden="true"></i></div><div class="stack-card-content"><div class="stack-card-type"><h2>' +
              p +
              '</h2>' +
              R.bars() +
              '</div><div class="stack-card-media" data-tone="' +
              i +
              '" role="img" aria-label="Placeholder image ' +
              p +
              '">' +
              R.mark(i, 'stack-media-mark') +
              '</div></div></article>',
          )
          .join('') +
        '</div></div></div></div><div class="stack-bottom" data-cr-chrome><span class="stack-count" aria-live="polite">01 / 03</span><span>Scroll to switch · Cards keep catching up</span><button type="button" class="stack-next">Next ↓</button></div>';
    }
    const scroller = element.querySelector('.stack-scroller'),
      runway = element.querySelector('.stack-runway'),
      pin = element.querySelector('.stack-pin'),
      cards = [...element.querySelectorAll('.stack-card')],
      counter = element.querySelector('.stack-count'),
      button = element.querySelector('.stack-next');
    let progress = 0,
      target = 0,
      extent = 1,
      last = -1;
    function layout() {
      extent = api.height * 2.5;
      if (cardOpt) return;
      runway.style.height = api.reduced ? 'auto' : api.height + extent + 'px';
      pin.style.height = api.reduced ? 'auto' : api.height + 'px';
    }
    function scrollTo(top) {
      target = R.clamp((top / extent) * 2, 0, 2);
      api.wake();
      if (api.reduced) api.paint();
    }
    function input() {
      scrollTo(scroller.scrollTop);
    }
    api.on('resize', layout);
    if (!cardOpt) {
      api.on('motion', () => {
        layout();
        scroller.scrollTop = 0;
        progress = target = 0;
      });
      api.listen(scroller, 'scroll', input, { passive: true });
      function jump(index) {
        if (api.reduced) {
          scroller.scrollTo({ top: cards[index].offsetTop - 100, behavior: 'instant' });
          progress = target = index;
          api.paint();
        } else {
          scroller.scrollTop = (index / 2) * extent;
          input();
        }
      }
      api.listen(button, 'click', () => jump(target > 1.9 ? 0 : Math.min(2, Math.floor(target + 0.1) + 1)));
      api.listen(scroller, 'keydown', (event) => {
        let index = Math.round(target);
        if (['ArrowDown', 'ArrowRight', 'PageDown'].includes(event.key)) index++;
        else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key)) index--;
        else if (event.key === 'Home') index = 0;
        else if (event.key === 'End') index = 2;
        else return;
        event.preventDefault();
        jump(R.clamp(index, 0, 2));
      });
    } else
      api.on('motion', () => {
        progress = target = cardTop = 0;
      });
    api.on('replay', () => {
      progress = target = 0;
      if (scroller) scroller.scrollTop = 0;
      last = -1;
      cardTop = cardTime = cardSent = 0;
    });
    let cardTop = 0,
      cardTime = 0,
      cardSent = 0;
    function cardHand(dt) {
      if (live && (handOff || (cardOpt.once && cardTime + dt >= 7))) {
        take();
        return;
      }
      const L = 7,
        prev = cardTime;
      cardTime += dt;
      if (Math.floor(prev / L) !== Math.floor(cardTime / L)) {
        cardSent = Math.floor(cardTime / L) * L;
        cardTop = 0;
      }
      for (; cardSent + 1 / 60 <= cardTime; cardSent += 1 / 60) {
        const t = (cardSent + 1 / 60) % L,
          step = extent / 2 / 48;
        if (t >= 0.5 && t < 1.3) cardTop += step;
        else if (t >= 2.5 && t < 3.3) cardTop += step;
        else if (t >= 4.8 && t < 5.6) cardTop -= step * 2;
        else continue;
        cardTop = R.clamp(cardTop, 0, extent);
        scrollTo(cardTop);
      }
      const t = cardTime % L,
        ease = (u) => (u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u)),
        opacity = t < 0.4 ? ease(t / 0.3) : t > 5.9 ? 1 - ease((t - 5.9) / 0.4) : 1;
      cardOpt.pointer({
        x: api.width * 0.5 + 70,
        y: api.height * 0.55,
        opacity,
        wheel: (t >= 0.4 && t < 1.4) || (t >= 2.4 && t < 3.4) || (t >= 4.7 && t < 5.7),
      });
    }
    const live = !!(cardOpt && cardOpt.interactive),
      RESTORE = 0.5;
    let handOff = false,
      drag = null,
      back = null;
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
    function take() {
      if (handOff) return;
      handOff = true;
      if (cardOpt.pointer) cardOpt.pointer({ x: 0, y: 0, opacity: 0, wheel: false });
    }
    function release() {
      if (!drag) return;
      const pid = drag.id;
      drag = null;
      element.classList.remove('stack-dragging');
      if (element.hasPointerCapture(pid)) element.releasePointerCapture(pid);
    }
    function nudge(d, chain) {
      const was = cardTop;
      cardTop = R.clamp(cardTop + d, 0, extent);
      if (cardTop !== was) {
        back = null;
        scrollTo(cardTop);
        if (cardOpt.touched) cardOpt.touched();
      }
      const left = d - (cardTop - was);
      if (chain && Math.abs(left) > 0.5) window.scrollBy(0, (left * 1.74 * api.height) / extent);
    }
    function stepBack(dt) {
      back.t += dt;
      const u = Math.min(1, back.t / RESTORE);
      progress = R.mix(back.from, 0, outEase(u));
      if (u >= 1) back = null;
    }
    function whole(params) {
      progress = Math.round(target);
      cards.forEach((card, i) => {
        const depth = Math.max(0, progress - i),
          enter = Math.max(0, i - progress);
        card.style.transform =
          'translate3d(0,' +
          (enter * api.height * 0.87 - depth * params.stackGap) +
          'px,0) scale(' +
          (1 - depth * (params.shrink / 100)) +
          ')';
      });
    }
    if (live) {
      if (api.reduced) {
        handOff = true;
        progress = target = 2;
      }
      api.on('resize', () => {
        cardTop = (target / 2) * extent;
      });
      api.on('motion', (reduced) => {
        release();
        back = null;
        if (reduced) {
          take();
          progress = target = 2;
          cardTop = extent;
        }
      });
      const WHEEL_GAP = 250,
        gap = cardOpt.wheelLatch ? (typeof cardOpt.wheelLatch === 'number' ? cardOpt.wheelLatch : WHEEL_GAP) : 0;
      let wheelAt = -Infinity,
        held = false;
      const PUSH_IDLE = 1200,
        push = cardOpt.endPush ? (typeof cardOpt.endPush === 'number' ? cardOpt.endPush : 100) : 0;
      let pushed = 0,
        pushDir = 0,
        pushAt = -Infinity;
      api.listen(
        element,
        'wheel',
        (event) => {
          if (event.ctrlKey || api.paused) return;
          const d = event.deltaY * (event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? api.height : 1);
          if (gap && d) {
            const now = performance.now();
            if (now - wheelAt > gap) held = false;
            wheelAt = now;
          }
          if (!d || (d < 0 && cardTop <= 0) || (d > 0 && cardTop >= extent)) {
            if (gap && d && held) {
              event.preventDefault();
              return;
            }
            if (push && d) {
              const now = performance.now();
              if (Math.sign(d) !== pushDir || now - pushAt > PUSH_IDLE) pushed = 0;
              pushDir = Math.sign(d);
              pushAt = now;
              if (Math.abs(progress - target) > 0.02) {
                pushed = 0;
                event.preventDefault();
                return;
              }
              if (pushed < push) {
                pushed += Math.abs(d);
                event.preventDefault();
                return;
              }
            }
            return;
          }
          if (gap) held = true;
          pushed = 0;
          event.preventDefault();
          take();
          nudge(d, false);
        },
        { passive: false },
      );
      api.listen(element, 'pointerdown', (event) => {
        if (event.button !== 0 || api.paused) return;
        take();
        release();
        drag = { id: event.pointerId, y: event.clientY, touch: event.pointerType !== 'mouse' };
        element.setPointerCapture(event.pointerId);
        element.classList.add('stack-dragging');
      });
      api.listen(element, 'pointermove', (event) => {
        if (!drag || event.pointerId !== drag.id || api.paused) return;
        const dy = drag.y - event.clientY;
        drag.y = event.clientY;
        if (dy) nudge((dy * extent) / (1.74 * api.height), drag.touch);
      });
      api.listen(element, 'pointerup', release);
      api.listen(element, 'pointercancel', release);
      api.listen(element, 'lostpointercapture', release);
      api.listen(element, 'keydown', (event) => {
        const k = event.key,
          step =
            k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !event.shiftKey)
              ? 1
              : k === 'ArrowUp' || k === 'PageUp' || k === ' '
                ? -1
                : 0;
        if (api.paused || event.altKey || event.ctrlKey || event.metaKey || (!step && k !== 'Home' && k !== 'End'))
          return;
        const to = ((k === 'Home' ? 0 : k === 'End' ? 2 : R.clamp(Math.round(target) + step, 0, 2)) / 2) * extent;
        if (Math.abs(to - cardTop) < 0.5) return;
        event.preventDefault();
        take();
        nudge(to - cardTop, false);
      });
      api.on('destroy', release);
      api.restore = () => {
        take();
        release();
        if (api.reduced) {
          back = null;
          progress = target = 2;
          cardTop = extent;
          api.paint();
          return;
        }
        cardTop = 0;
        scrollTo(0);
        back = { t: 0, from: progress };
        api.wake();
      };
    }
    api.frame(({ dt, time, params, reduced }) => {
      if (cardOpt && cardOpt.pointer) {
        if (reduced) cardOpt.pointer({ opacity: 0, wheel: false });
        else cardHand(dt);
      }
      if (options.preview && !reduced) target = (1 - Math.cos(time * 0.55)) * 1;
      progress = reduced ? target : R.damp(progress, target, 1000 / params.followLag, dt);
      if (back) stepBack(dt);
      cards.forEach((card, i) => {
        const depth = Math.max(0, progress - i),
          enter = Math.max(0, i - progress),
          scale = 1 - depth * (params.shrink / 100),
          y = enter * api.height * 0.87 - depth * params.stackGap;
        card.style.transform = reduced ? 'none' : 'translate3d(0,' + y + 'px,0) scale(' + scale + ')';
        if (!cardOpt) card.inert = !reduced && i > progress + 0.9;
      });
      if (live && reduced) whole(params);
      const active = R.clamp(Math.round(progress), 0, 2);
      if (active !== last && counter) {
        counter.textContent = '0' + (active + 1) + ' / 03';
        button.textContent = active === 2 ? 'Start over ↗' : 'Next ↓';
        last = active;
      }
      element.dataset.progress = progress.toFixed(4);
      element.dataset.target = target.toFixed(4);
      element.dataset.active = active;
      if (live && handOff && !back && Math.abs(progress - target) <= 0.0001) return false;
      return options.preview || !!cardOpt || Math.abs(progress - target) > 0.0001;
    });
    layout();
    api.paint();
    const status = api.status;
    api.status = () => ({ ...status(), progress, target, active: last, extent });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountScrollCardStack(element, options) {
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
    element.classList.add('scroll-card-stack');
    element.innerHTML =
      '<div class="fx-board" data-stack-board tabindex="0" role="group" aria-label="Three cards. Scroll, drag, or use arrow keys."></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-stack-board]'),
      cursor = createCursor(stage),
      narrow = matchMedia('(max-width:760px)');
    let hand = [0, 0];
    const inst = mount(board, {
      params: options.params,
      card: {
        interactive: true,
        once: true,
        endPush: true,
        wheelLatch: true,
        item: (i) => media({ glyph: i, accent: i === 1 }),
        pointer: (s) => cursor.set(Object.assign({}, s, { x: hand[0], y: hand[1] })),
      },
    });
    const deck = board.querySelector('.stack-deck');
    function layout() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        lift = 60,
        pad = narrow.matches ? 16 : 32,
        AR = 1.62;
      let w = Math.min(W - pad * 2, H * 0.52 * AR, 620),
        top = null;
      const Z = panelZone(stage),
        R = Z.right + 16;
      if (!narrow.matches && (W - w) / 2 < R) {
        if (W - 2 * R >= w * 0.8) w = W - 2 * R;
        else {
          top = Math.max((H - w / AR - lift) / 2 + lift, Z.bottom + 24 + lift);
          w = Math.min(w, (H - 24 - top) * AR);
        }
      }
      const h = w / AR,
        left = (W - w) / 2;
      if (top === null) top = (H - h - lift) / 2 + lift;
      Object.assign(deck.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
      board.style.setProperty('--fx-k', (w / 256).toFixed(4));
      hand = [left + w * 0.773, top + h * 0.513];
    }
    layout();
    const observer0 = new ResizeObserver(layout);
    observer0.observe(stage);

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
  global.mountScrollCardStack = mountScrollCardStack;
  if (typeof module === 'object' && module.exports) module.exports = mountScrollCardStack;
})(typeof window !== 'undefined' ? window : this);
