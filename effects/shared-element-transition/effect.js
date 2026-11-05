/*
 * Shared Element Transition
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Three rounded thumbnails in a row. Click one and it grows in place into the large detail image while the other two
 * fade out; click again and it shrinks back into its slot. A single-page take on the list-to-detail shared element
 * transition, good for portfolios, product grids and galleries.
 *
 * How it moves
 * - Everything happens inside one box with a 336:260 aspect ratio, centred on the stage: height min(stage height - 80,
 *   520), narrowed to stage width - 64 (32 at 760 px and below) if needed. All positions are fractions of the box.
 * - List: thumbnails are 27% of the box wide and 50% high, at x = 5.5%, 36.5%, 67.5%, y = 25%.
 * - Detail: the selected one moves to (14%, 16%) and scales to 72% x 68% of the box. Others fade to opacity 0.
 * - It is one transform (translate + scale) on the thumbnail, eased with 1 - (1 - t)^4 over params.duration.
 *   The mark inside is counter-scaled so it never stretches.
 * - Corners: border-radius goes from params.roundness % (list) to a fixed 24 px (detail), corrected for the scale so
 *   the corner stays round mid-flight.
 * - Clicks: on a resting thumbnail it grows; anywhere while one is open (or opening) it shrinks; on the shrinking one it
 *   grows again; on another thumbnail that was still visible when pressed, the open one shrinks and then the clicked one
 *   grows. Enter / Space on a focused thumbnail does the same.
 * - Demo, once on load: a fake cursor presses the first thumbnail (it grows from 0.9 s), then presses the open image at
 *   2.5 s + duration (it shrinks) and fades out by max(2.5 + 2 x duration, 3.9 + duration) s, 4.6 s at the default.
 *   The first real press ends the demo for good; a grow or shrink under way carries on on the same curve.
 * - The box's data-phase attribute is "list", "transition" or "detail".
 *
 * Options
 *   params.duration   500..1600, default 700   grow / shrink time in ms
 *   params.roundness  0..50, default 42        corner radius of the list thumbnails in percent (detail is always 24 px)
 *   reducedMotion     true / false / null      force reduced motion; null follows prefers-reduced-motion live
 *
 * API
 *   const fx = mountSharedElementTransition(element, {params: {duration: 900}, reducedMotion: null});
 *   fx.params                     copy of current params
 *   fx.setParams({roundness: 20}) change params live (next frame)
 *   fx.setPaused(true|false)      freeze / resume
 *   fx.reset()                    params back to defaults, demo stopped; an open image shrinks back to the list
 *                                 over 0.5 s (with reduced motion it jumps)
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                  removes listeners, observers and the fake cursor
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountSharedElementTransition(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Thumbnail content: the item passed in the mount glue (a white card with a mark). Any HTML works; the rounding is
 *   applied to its first child. Keep content that tolerates a non-uniform scale or counter-scale it like the mark.
 * - The list / detail fractions (5.5%, 31% step, 25%; 14%, 16%, 72% x 68%), the 24 px detail radius, the box ratio.
 * - Colours, shadows and hover via effect.css.
 *
 * Do not change (the feel breaks)
 * - One element travels. Replacing it with a fade between two separate elements loses the shared-element read.
 * - The radius correction for scale; without it corners go oval mid-flight.
 * - The 1 - (1 - t)^4 ease (fast departure, soft landing).
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Let the effect own its children; push changes through fx.setParams, not a remount.
 * - For a real page-to-page version, use the View Transitions API with a shared view-transition-name on the image;
 *   this file is the in-page version only.
 * - Load effect.css globally (class names are not scoped). SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - Thumbnails are role="button", focusable, labelled "Project 01" to "Project 03"; Enter and Space open and close.
 * - With reduced motion: no fake cursor; clicks switch between list and detail at once.
 * - The loop stops when the tab is hidden, the effect is off screen or it is paused.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const R = { mix };

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
    { key: 'duration', type: 'range', default: 700, min: 500, max: 1600, step: 50 },
    { key: 'roundness', type: 'range', default: 42, min: 0, max: 50, step: 1 },
  ];

  // ---- the effect ----
  function mount(element, options) {
    const api = scope(element, CONTROLS, options),
      cardOpt = options.card;
    element.classList.add('shared-stage');
    element.innerHTML = [0, 1, 2]
      .map((i) => '<div class="shared-preview-art" data-preview-art="' + i + '">' + cardOpt.item(i) + '</div>')
      .join('');
    const art = [...element.querySelectorAll('.shared-preview-art')],
      round = art.map((a) => a.firstElementChild);
    let progress = 0,
      w = 1,
      h = 1,
      cardW = 1,
      cardH = 1;
    let sel = 0,
      handOff = false,
      userP = 0,
      tw = null,
      pending = null,
      aimP = null;
    const RESTORE = 0.5,
      live = () => handOff;
    function takeOver() {
      if (handOff) return;
      handOff = true;
      userP = progress;
      const d = api.params.duration / 1000,
        t = api.time % 8,
        back = 2.5 + d;
      if (t >= 0.9 && t < 0.9 + d) tw = { from: 0, to: 1, t: t - 0.9, d };
      else if (t >= back && t < back + d) tw = { from: 1, to: 0, t: t - back, d };
      cardOpt.pointer({ x: 0, y: 0, opacity: 0, down: false });
    }
    const ease = (t) => 1 - Math.pow(1 - t, 4);
    const smooth = (t) => t * t * (3 - 2 * t);
    api.on('resize', () => {
      w = api.width;
      h = api.height;
      cardW = w * 0.27;
      cardH = h * 0.5;
      art.forEach((a) => {
        a.style.width = cardW + 'px';
        a.style.height = cardH + 'px';
      });
    });
    api.frame(({ dt, time, params, reduced }) => {
      if (!handOff && (reduced || time >= Math.max(2.5 + (2 * params.duration) / 1000, 3.9 + params.duration / 1000)))
        takeOver();
      const t = time % 8,
        d = params.duration / 1000,
        back = 2.5 + d;
      progress =
        reduced || t < 0.9
          ? 0
          : t < 0.9 + d
            ? ease((t - 0.9) / d)
            : t < back
              ? 1
              : t < back + d
                ? 1 - ease((t - back) / d)
                : 0;
      if (live()) {
        if (tw) {
          tw.t += dt;
          const u = reduced ? 1 : Math.min(1, tw.t / tw.d);
          userP = R.mix(tw.from, tw.to, ease(u));
          if (u >= 1) {
            tw = null;
            if (userP === 0) {
              sel = 0;
              if (pending != null) {
                sel = pending;
                pending = null;
                tw = { from: 0, to: 1, t: 0, d };
                if (reduced) {
                  userP = 1;
                  tw = null;
                }
              }
            }
          }
        }
        progress = userP;
      }

      art.forEach((a, i) => {
        const x = w * (0.055 + i * 0.31),
          y = h * 0.25,
          sx = i === sel ? R.mix(1, (w * 0.72) / cardW, progress) : 1,
          sy = i === sel ? R.mix(1, (h * 0.68) / cardH, progress) : 1;
        a.style.transform =
          'translate3d(' +
          (i === sel ? R.mix(x, w * 0.14, progress) : x) +
          'px,' +
          (i === sel ? R.mix(y, h * 0.16, progress) : y) +
          'px,0) scale(' +
          sx +
          ',' +
          sy +
          ')';
        if (i === sel) {
          const q = progress,
            r = params.roundness * (1 - q);
          round[i].style.borderRadius =
            'calc(' +
            r +
            '% + ' +
            ((24 * q) / sx).toFixed(2) +
            'px) / calc(' +
            r +
            '% + ' +
            ((24 * q) / sy).toFixed(2) +
            'px)';
        } else round[i].style.borderRadius = params.roundness + '%';
        a.style.opacity = i === sel ? '1' : String(1 - progress);
        a.style.zIndex = i === sel ? '3' : '1';
        a.querySelector('svg').style.transform = 'scaleY(' + sx / sy + ')';
      });
      if (live()) {
        element.dataset.phase = progress === 0 ? 'list' : progress === 1 ? 'detail' : 'transition';
        return !!tw && !reduced;
      }
      const cx = w * 0.055 + cardW * 0.62,
        cy = h * 0.25 + cardH * 0.66,
        bx = w * 0.24,
        by = h * 0.3;
      let hx,
        hy,
        down = false,
        o = 1;
      if (t < 0.9) {
        const k = smooth(Math.min(1, t / 0.65));
        hx = R.mix(w * 0.5, cx, k);
        hy = R.mix(h * 0.9, cy, k);
        down = t > 0.72;
      } else if (t < back - 0.9) {
        const k = smooth(Math.min(1, (t - 0.9) / 0.8));
        hx = R.mix(cx, w * 0.82, k);
        hy = R.mix(cy, h * 0.9, k);
        o = 1 - k;
      } else if (t < back) {
        const k = smooth(Math.min(1, (t - back + 0.9) / 0.65));
        hx = R.mix(w * 0.82, bx, k);
        hy = R.mix(h * 0.9, by, k);
        o = k;
        down = t > back - 0.18;
      } else {
        const k = smooth(Math.min(1, (t - back) / 1.4));
        hx = R.mix(bx, w * 0.5, k);
        hy = R.mix(by, h * 0.9, k);
      }
      const end = Math.max(2.5 + 2 * d, 3.9 + d);
      o *= smooth(Math.min(1, t / 0.3)) * (1 - smooth(Math.max(0, Math.min(1, (t - end + 0.6) / 0.6))));
      cardOpt.pointer({ x: hx, y: hy, opacity: reduced ? 0 : Math.max(0, Math.min(1, o)), down });
      element.dataset.phase = progress === 0 ? 'list' : progress === 1 ? 'detail' : 'transition';
      return !reduced;
    });
    function toggle(i) {
      takeOver();
      const d = api.params.duration / 1000;
      const dir = tw ? tw.to : null,
        hit = i != null && i >= 0,
        seen = aimP != null ? aimP : userP;
      pending = null;
      aimP = null;
      if (dir === null && userP === 0) {
        if (!hit) return;
        sel = i;
        tw = { from: 0, to: 1, t: 0, d };
      } else if (hit && i === sel && dir === 1) return;
      else if (hit && i === sel && dir === 0) tw = { from: userP, to: 1, t: 0, d };
      else {
        tw = { from: userP, to: 0, t: 0, d };
        if (hit && i !== sel && seen < 0.5) pending = i;
      }
      api.paint();
      api.wake();
    }
    art.forEach((a, i) => {
      a.tabIndex = 0;
      a.setAttribute('role', 'button');
      a.setAttribute('aria-label', 'Project ' + String(i + 1).padStart(2, '0'));
    });
    api.listen(element, 'pointerdown', () => {
      takeOver();
      aimP = userP;
    });
    api.listen(element, 'click', (event) => {
      const a = event.target.closest('.shared-preview-art');
      toggle(a ? art.indexOf(a) : null);
    });
    api.listen(element, 'keydown', (event) => {
      const a = event.target.closest('.shared-preview-art');
      if (!a || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      toggle(art.indexOf(a));
    });
    api.restore = () => {
      takeOver();
      pending = null;
      if (!tw && userP === 0) {
        sel = 0;
        api.paint();
        return;
      }
      tw = { from: userP, to: 0, t: 0, d: RESTORE };
      api.paint();
      api.wake();
    };
    const status = api.status;
    api.status = () => ({ ...status(), view: 'preview', progress, project: 0 });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountSharedElementTransition(element, options) {
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
    element.classList.add('shared-element-transition');
    element.innerHTML = '<div class="fx-board" data-shared-board><div class="shared-box" data-shared-box></div></div>';
    const stage = element,
      box = stage.querySelector('[data-shared-box]'),
      cursor = createCursor(stage);
    const RATIO = 336 / 260,
      phone = matchMedia('(max-width: 760px)');
    function place() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        floating = !phone.matches;
      let bh = Math.min(H - 80, 520),
        bw = bh * RATIO;
      const maxW = W - (floating ? 64 : 32);
      if (bw > maxW) {
        bw = maxW;
        bh = bw / RATIO;
      }
      let x = (W - bw) / 2,
        y = (H - bh) / 2;

      [
        ['x', x],
        ['y', y],
        ['w', bw],
        ['h', bh],
      ].forEach(([k, v]) => box.style.setProperty('--sh-' + k, Math.round(v) + 'px'));
      box.style.setProperty('--fx-k', (Math.round(bw) / 336).toFixed(4));
    }
    place();
    const inst = mount(box, {
      params: options.params,
      card: {
        item: (i) => media({ glyph: i, accent: i === 0 }),
        pointer: (s) => cursor.set(Object.assign({}, s, { x: s.x + box.offsetLeft, y: s.y + box.offsetTop })),
      },
    });

    place();
    const observer0 = new ResizeObserver(place);
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
  global.mountSharedElementTransition = mountSharedElementTransition;
  if (typeof module === 'object' && module.exports) module.exports = mountSharedElementTransition;
})(typeof window !== 'undefined' ? window : this);
