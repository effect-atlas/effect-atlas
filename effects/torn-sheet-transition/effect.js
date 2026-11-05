/*
 * Torn Sheet Transition
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A small four-page site (Index / Work / Gallery / About) with nav pills at the bottom. Pick a pill and a dark sheet
 * rises from the bottom edge, its top edge torn into loose islands and holes, covers the page, the page is swapped
 * underneath, and the same torn edge keeps rising and clears off the top. Good as a page transition for a portfolio or
 * a studio site.
 *
 * How it moves
 * - One WebGL canvas over the page area, one fragment shader. Every spot has a moment it gets torn through: its height,
 *   seen through a spherical lens (sin r / r, strength = params.bow), plus a stack of surflet noise added BEFORE the cut.
 *   That is what tears off islands instead of drawing a wavy line. Through the lens the edge sags in the lower half of
 *   the screen and sweeps up at the sides in the upper half.
 * - Phases: cover (1400 ms x params.pace) -> hold 200 ms (page swapped when fully covered) -> clear (2400 ms x pace).
 *   Both halves travel upward, so a switch reads as one gesture, not an undo.
 * - Easing: reach = 1 - (1 - k)^c, k = elapsed / duration; c is 2.5 for cover and 4.8 for clear, which starts at reach
 *   0.12, where the first tear shows. Quick to answer the click, long settle.
 * - Picking another pill during cover or hold only changes the target page; during clear it starts a fresh cover.
 * - The canvas only draws while a switch runs; idle it is hidden. Device pixel ratio is capped at 2.
 * - No WebGL, or the context is lost: the same moments are computed in JS on a 3 px grid and drawn with canvas 2D. The
 *   noise is plain integer arithmetic, so the tear has the same shapes, with a softer edge.
 * - Layout: the site is centred, width min(760, stage width - 64), height min(width x 0.62, stage height - 64).
 *   At 760 px and below it fills the stage with a 16 px inset.
 * - Demo, once on load: a fake cursor moves to the "Work" pill, presses it at 1.1 s (the real switch runs) and fades
 *   out by 6 s. The first real press anywhere on the effect ends the demo for good. After that, pills switch pages.
 *
 * Options
 *   params.grain   3..18, default 8.2          noise cells per canvas height; higher = smaller, denser shards
 *   params.tear    0.05..0.3, default 0.16     how far the noise moves the cut (fraction of height); deeper holes
 *   params.bow     0..1, default 0.55          lens strength; 0 = flat edge
 *   params.pace    0.4..1.5, default 1         duration multiplier for cover and clear
 *   params.sheet   'ink' (default) | 'graphite' | 'stone' | 'accent'
 *                  sheet colour, a vertical gradient a step darker at the top:
 *                  ink #17181a -> #2b2c2f, graphite #5c5b56 -> #6e6d68, stone #9a9993 -> #aaa9a4, accent #4559ff -> #5d6eff
 *   fallback       true / false, default false force the canvas 2D path instead of WebGL (read once at mount)
 *   reducedMotion  true / false / null         force reduced motion; null follows prefers-reduced-motion live
 * All params apply on the next frame, including mid-switch.
 *
 * API
 *   const fx = mountTornSheetTransition(element, {params: {sheet: 'accent'}, reducedMotion: null});
 *   fx.params                      copy of current params
 *   fx.setParams({sheet: 'stone'}) change params live
 *   fx.setPaused(true|false)       freeze / resume; pills ignore clicks while paused
 *   fx.reset()                     params back to defaults, demo stopped; the site fades out (200 ms), returns to
 *                                  Index with no sheet and fades in (300 ms). Nothing replays.
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                   stops the loop, removes listeners and observers, releases the WebGL context
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountTornSheetTransition(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - Page content: pagesHTML() (four <section class="tr-page"> blocks) and the NAV labels. Keep four pages, or change
 *   NAV and the sections together.
 * - Sheet colours: the SHEETS table ([top, foot] hex pairs); add a key there to allow a new params.sheet value.
 * - Card look, radius, pills and the dotted stage via effect.css.
 *
 * Do not change (the feel breaks)
 * - Noise before the cut. Moving it after (or animating a clip-path / SVG wave instead) gives a wavy line with no islands.
 * - Both halves rising. Reversing the clear direction makes it read as the cover being undone.
 * - The fast start of the easing: the sheet has to answer the click at once.
 * - The noise does not move over time on purpose: the tear has the same shape every switch.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Let the effect own its children; push changes through fx.setParams, not a remount.
 * - To drive real routes: keep the shader and timing, call your router at the moment the page is swapped (end of
 *   cover), and let the uncover run over the new page.
 * - Load effect.css globally (class names are not scoped). SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - Pills are real buttons; the current page has aria-current="page". The canvas is aria-hidden.
 * - A visually hidden polite live region (.tr-live) announces the page being switched to ("Work.", "Gallery." ...).
 * - With reduced motion: no fake cursor, no sheet; a pill click swaps the page at once.
 * - The loop stops when the tab is hidden, the effect is off screen or it is paused.
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
    { key: 'grain', type: 'range', default: 8.2, min: 3, max: 18, step: 0.1 },
    { key: 'tear', type: 'range', default: 0.16, min: 0.05, max: 0.3, step: 0.005 },
    { key: 'bow', type: 'range', default: 0.55, min: 0, max: 1, step: 0.01 },
    { key: 'pace', type: 'range', default: 1, min: 0.4, max: 1.5, step: 0.05 },
    {
      key: 'sheet',
      type: 'select',
      default: 'ink',
      options: [{ value: 'ink' }, { value: 'graphite' }, { value: 'stone' }, { value: 'accent' }],
    },
  ];

  // ---- the effect ----
  const NAV = ['Index', 'Work', 'Gallery', 'About'];
  const BEAT = { coverMs: 1400, holdMs: 200, clearMs: 2400, coverCurve: 2.5, clearCurve: 4.8, clearFrom: 0.12 };
  const SHEETS = {
    ink: ['#17181a', '#2b2c2f'],
    graphite: ['#5c5b56', '#6e6d68'],
    stone: ['#9a9993', '#aaa9a4'],
    accent: ['#4559ff', '#5d6eff'],
  };
  const GLYPHS = [
    '<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M50 16v68M16 50h68" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
    '<rect x="20" y="20" width="60" height="60" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M24 24l52 52M76 24L24 76" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
  ];
  const media = (tone, glyph, extra) =>
    '<div class="ck-media' +
    (extra && extra.cls ? ' ' + extra.cls : '') +
    '"' +
    (tone ? ' data-tone="' + tone + '"' : '') +
    (extra && extra.sm ? ' data-size="sm"' : '') +
    (extra && extra.accent ? ' data-accent' : '') +
    ' aria-hidden="true"><svg class="ck-glyph" viewBox="0 0 100 100">' +
    GLYPHS[glyph % 4] +
    '</svg></div>';
  const STACK = [
    [1, 1, 0, 0, 0],
    [2.3, 0.46, 0.83, 5.3, 1.9],
    [4.9, 0.2, 2.1, 11.7, 8.2],
    [10.7, 0.085, 3.7, 2.4, 17.6],
    [23, 0.035, 5.2, 29.1, 6.3],
  ].map(([f, w, a, sx, sy]) => ({ w, c: Math.cos(a) * f, s: Math.sin(a) * f, sx, sy }));
  const DRAG_FREQ = 0.31,
    DRAG_PUSH = 1.05,
    NOISE_GAIN = 2.55,
    BULGE = 4.3,
    RIM = 0.004;
  const f4 = (x) => x.toFixed(4);
  const SHEET_VERT =
    'attribute vec2 aCorner;varying vec2 vSpot;void main(){vSpot=aCorner;gl_Position=vec4(aCorner*2.0-1.0,0.0,1.0);}';
  const SHEET_FRAG = `
precision highp float;
varying vec2 vSpot;
uniform float uReach, uClearing, uWide, uCells, uRip, uBulge, uFeather;
uniform vec3 uInkFoot, uInkCrown;
/* lattice gradient from three rounds of a quadratic permutation modulo a prime */
vec2 latticeSlope(vec2 c){
  c = mod(c, 257.0);
  float h = mod(c.x * (c.x * 23.0 + 5.0) + c.y, 257.0);
  float gx = mod(h * (h * 11.0 + 3.0) + c.y * 19.0 + c.x * 7.0, 257.0);
  float gy = mod(gx * (gx * 5.0 + 2.0) + c.x * 13.0, 257.0);
  return vec2(gx, gy) / 128.0 - 1.0;
}
/* one surflet: the corner's slope, faded out to nothing at distance 1 */
float surflet(vec2 corner, vec2 rel){
  float fade = 1.0 - dot(rel, rel);
  if (fade <= 0.0) return 0.0;
  fade *= fade;
  return fade * fade * dot(latticeSlope(corner), rel);
}
float ripple(vec2 q){
  vec2 c = floor(q), r = q - c;
  return surflet(c, r)
       + surflet(c + vec2(1.0, 0.0), r - vec2(1.0, 0.0))
       + surflet(c + vec2(0.0, 1.0), r - vec2(0.0, 1.0))
       + surflet(c + vec2(1.0, 1.0), r - vec2(1.0, 1.0));
}
float tornness(vec2 q){
  vec2 slow = q * ${f4(DRAG_FREQ)};
  q += vec2(ripple(slow + vec2(3.7, 9.1)), ripple(slow + vec2(14.3, 2.6))) * ${f4(DRAG_PUSH)};
  float n = 0.0;
  ${STACK.map((l) => 'n += ' + f4(l.w) + ' * ripple(vec2(' + f4(l.c) + ' * q.x - (' + f4(l.s) + ') * q.y + ' + f4(l.sx) + ', (' + f4(l.s) + ') * q.x + ' + f4(l.c) + ' * q.y + ' + f4(l.sy) + '));').join('\n  ')}
  return clamp(n * ${f4(NOISE_GAIN)}, -1.0, 1.0);
}
void main(){
  /* spherical lens: sin(r) / r pulls the rim towards the middle */
  vec2 fromMiddle = vSpot - 0.5;
  float r = length(fromMiddle) * uBulge;
  vec2 seen = 0.5 + fromMiddle * (r < 0.001 ? 1.0 : sin(r) / r);
  /* how far the cut has passed this spot, before tearing; spots out of the noise's reach skip it */
  float margin = uRip + ${f4(RIM)};
  float past = uReach * (1.0 + 2.0 * margin) - margin - seen.y;
  if (abs(past) < uRip + uFeather) past += uRip * tornness(vec2(seen.x * uWide, seen.y) * uCells);
  float cover = smoothstep(-uFeather, uFeather, past);
  float alpha = uClearing > 0.5 ? 1.0 - cover : cover;
  gl_FragColor = vec4(mix(uInkFoot, uInkCrown, vSpot.y) * alpha, alpha);
}`;
  const lat = (x) => x - 257 * Math.floor(x / 257);
  function surflet(cx, cy, rx, ry) {
    let fade = 1 - rx * rx - ry * ry;
    if (fade <= 0) return 0;
    fade *= fade;
    const x = lat(cx),
      y = lat(cy),
      h = lat(x * (x * 23 + 5) + y),
      gx = lat(h * (h * 11 + 3) + y * 19 + x * 7),
      gy = lat(gx * (gx * 5 + 2) + x * 13);
    return fade * fade * ((gx / 128 - 1) * rx + (gy / 128 - 1) * ry);
  }
  function ripple(x, y) {
    const cx = Math.floor(x),
      cy = Math.floor(y),
      rx = x - cx,
      ry = y - cy;
    return (
      surflet(cx, cy, rx, ry) +
      surflet(cx + 1, cy, rx - 1, ry) +
      surflet(cx, cy + 1, rx, ry - 1) +
      surflet(cx + 1, cy + 1, rx - 1, ry - 1)
    );
  }
  function tornness(x, y) {
    const sx = x * DRAG_FREQ,
      sy = y * DRAG_FREQ,
      qx = x + ripple(sx + 3.7, sy + 9.1) * DRAG_PUSH,
      qy = y + ripple(sx + 14.3, sy + 2.6) * DRAG_PUSH;
    let n = 0;
    for (const l of STACK) n += l.w * ripple(l.c * qx - l.s * qy + l.sx, l.s * qx + l.c * qy + l.sy);
    return Math.max(-1, Math.min(1, n * NOISE_GAIN));
  }
  function moment(vx, vy, wide, cells, rip, bulge) {
    const mx = vx - 0.5,
      my = vy - 0.5,
      r = Math.hypot(mx, my) * bulge,
      k = r < 0.001 ? 1 : Math.sin(r) / r,
      x = 0.5 + mx * k,
      y = 0.5 + my * k,
      margin = rip + RIM;
    return (y + margin - rip * tornness(x * wide * cells, y * cells)) / (1 + 2 * margin);
  }
  const settle = (k, curve) => 1 - Math.pow(1 - k, curve);
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
  const rgb = (h) => [
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  ];
  function pagesHTML(text) {
    const T = (s, strong) => '<span class="ck-text"' + (strong ? ' data-strong' : '') + '>' + s + '</span>',
      H = (s) => '<span class="ck-hint">' + s + '</span>';
    const p0 =
      '<section class="tr-page tr-p0" data-page="0"><div class="tr-hero">' +
      media(2, 0) +
      '</div><div class="tr-side">' +
      (text
        ? '<div class="tr-head">' +
          T('Studio', 1) +
          H('Independent design practice') +
          '</div><i class="ck-rule"></i>' +
          ['Identity', 'Motion', 'Web']
            .map((w) => '<div class="ck-row"><i class="ck-dot"></i>' + T(w) + '</div>')
            .join('')
        : '<i class="ck-dot" data-size="lg"></i><i class="ck-line tr-ln" style="width:86%"></i><i class="ck-line tr-ln" style="width:64%"></i><i class="ck-line tr-ln" style="width:74%"></i>') +
      '</div></section>';
    const p1 =
      '<section class="tr-page tr-p1" data-page="1" hidden>' +
      (text
        ? '<div class="tr-head tr-head--row">' + T('Selected work', 1) + H('Identity, motion and web') + '</div>'
        : '') +
      '<div class="tr-grid">' +
      [1, 0, 2, 0, 2, 1].map((tone, i) => media(tone, i, { sm: 1 })).join('') +
      '</div></section>';
    const p2 =
      '<section class="tr-page tr-p2" data-page="2" hidden>' +
      media(2, 1, { accent: 1, cls: 'tr-bleed' }) +
      '</section>';
    const p3 =
      '<section class="tr-page tr-p3" data-page="3" hidden><div class="tr-about"><i class="ck-dot" data-size="lg"></i>' +
      (text
        ? T('About', 1) +
          '<p class="tr-copy">' +
          H('A small studio for identity and motion.') +
          H('Two people, one long table.') +
          '</p><i class="ck-rule"></i><div class="ck-row">' +
          T('hello@studio.example') +
          '</div>'
        : '<i class="ck-line tr-ln" style="width:70%"></i><i class="ck-line tr-ln" style="width:48%"></i>') +
      '</div></section>';
    return p0 + p1 + p2 + p3;
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    const cardOpt = options.card || null,
      live = !!(cardOpt && cardOpt.interactive),
      text = !cardOpt || !!cardOpt.text;
    element.classList.add('tr-stage');
    if (cardOpt) element.dataset.card = live ? 'live' : 'auto';
    element.innerHTML =
      '<div class="tr-site ck-panel" data-size="lg"><div class="tr-view">' +
      pagesHTML(text) +
      '<canvas class="tr-sheet" aria-hidden="true"></canvas></div>' +
      '<nav class="tr-nav" aria-label="Sample navigation">' +
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
      '</nav></div>' +
      (cardOpt
        ? ''
        : '<p class="cr-hint" data-cr-chrome>Use the bottom nav to switch pages</p><div class="tr-hand" aria-hidden="true"></div>') +
      '<p class="cr-sr tr-live" aria-live="polite"></p>';
    const view = element.querySelector('.tr-view'),
      pages = [...element.querySelectorAll('.tr-page')],
      pills = [...element.querySelectorAll('.tr-nav .ck-pill')],
      live_ = element.querySelector('.tr-live'),
      hand = element.querySelector('.tr-hand');
    let canvas = element.querySelector('.tr-sheet');
    function glPainter(target) {
      const g = target.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        preserveDrawingBuffer: false,
        powerPreference: 'low-power',
      });
      if (!g) throw new Error('webgl unavailable');
      const program = g.createProgram();
      [
        [g.VERTEX_SHADER, SHEET_VERT],
        [g.FRAGMENT_SHADER, SHEET_FRAG],
      ].forEach(([kind, text]) => {
        const part = g.createShader(kind);
        g.shaderSource(part, text);
        g.compileShader(part);
        g.attachShader(program, part);
      });
      g.linkProgram(program);
      if (!g.getProgramParameter(program, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(program) || 'link');
      g.useProgram(program);
      const floats = ['uReach', 'uClearing', 'uWide', 'uCells', 'uRip', 'uBulge', 'uFeather'].map((name) =>
          g.getUniformLocation(program, name),
        ),
        crown = g.getUniformLocation(program, 'uInkCrown'),
        foot = g.getUniformLocation(program, 'uInkFoot');
      const quad = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, quad);
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), g.STATIC_DRAW);
      const corner = g.getAttribLocation(program, 'aCorner');
      g.enableVertexAttribArray(corner);
      g.vertexAttribPointer(corner, 2, g.FLOAT, false, 0, 0);
      return {
        kind: 'webgl',
        paint(s) {
          g.viewport(0, 0, target.width, target.height);
          [s.reach, s.clearing, s.wide, s.cells, s.rip, s.bulge, 1.1 / target.height].forEach((v, i) =>
            g.uniform1f(floats[i], v),
          );
          g.uniform3fv(crown, s.crown);
          g.uniform3fv(foot, s.foot);
          g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
        },
        blank() {
          g.clearColor(0, 0, 0, 0);
          g.clear(g.COLOR_BUFFER_BIT);
        },
        free() {
          g.deleteBuffer(quad);
          g.deleteProgram(program);
          const lose = g.getExtension('WEBGL_lose_context');
          if (lose) lose.loseContext();
        },
      };
    }
    function gridPainter(target) {
      const pen = target.getContext('2d'),
        small = document.createElement('canvas'),
        smallPen = small.getContext('2d'),
        CELL = 3;
      let wanted = '',
        cols = 0,
        rows = 0,
        moments = null,
        image = null;
      function prepare(s, w, h) {
        const nc = Math.max(2, Math.ceil(w / CELL)),
          nr = Math.max(2, Math.ceil(h / CELL)),
          key = [nc, nr, s.cells, s.rip, s.bulge].join();
        if (key === wanted) return;
        wanted = key;
        cols = nc;
        rows = nr;
        small.width = cols;
        small.height = rows;
        moments = new Float32Array(cols * rows);
        image = smallPen.createImageData(cols, rows);
        let at = 0;
        for (let row = 0; row < rows; row++)
          for (let col = 0; col < cols; col++)
            moments[at++] = moment((col + 0.5) / cols, 1 - (row + 0.5) / rows, s.wide, s.cells, s.rip, s.bulge);
      }
      return {
        kind: 'canvas',
        paint(s, w, h) {
          prepare(s, w, h);
          const px = image.data;
          let at = 0,
            o = 0;
          for (let row = 0; row < rows; row++) {
            const up = 1 - (row + 0.5) / rows,
              [r, g, b] = s.foot.map((low, i) => (low + (s.crown[i] - low) * up) * 255);
            for (let col = 0; col < cols; col++, at++, o += 4) {
              const on = s.reach > moments[at];
              px[o] = r;
              px[o + 1] = g;
              px[o + 2] = b;
              px[o + 3] = (s.clearing ? !on : on) ? 255 : 0;
            }
          }
          smallPen.putImageData(image, 0, 0);
          pen.setTransform(1, 0, 0, 1, 0, 0);
          pen.clearRect(0, 0, target.width, target.height);
          pen.imageSmoothingEnabled = true;
          pen.drawImage(small, 0, 0, (cols * CELL * target.width) / w, (rows * CELL * target.height) / h);
        },
        blank() {},
        free() {},
      };
    }
    let painter = null,
      renderer = 'none',
      cssW = 1,
      cssH = 1;
    function useGrid() {
      if (renderer === 'webgl') {
        const fresh = document.createElement('canvas');
        fresh.className = canvas.className;
        fresh.setAttribute('aria-hidden', 'true');
        if (canvas.hasAttribute('data-on')) fresh.setAttribute('data-on', '');
        canvas.replaceWith(fresh);
        canvas = fresh;
      }
      painter = gridPainter(canvas);
      renderer = painter.kind;
      element.dataset.renderer = renderer;
    }
    const forced = !!options.fallback;
    try {
      if (forced) throw new Error('forced');
      painter = glPainter(canvas);
      renderer = painter.kind;
    } catch (error) {
      useGrid();
    }
    if (renderer === 'webgl')
      api.listen(canvas, 'webglcontextlost', (event) => {
        event.preventDefault();
        useGrid();
        sizeCanvas();
        if (phase !== 'idle') draw();
      });
    function sizeCanvas() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      cssW = Math.max(1, canvas.clientWidth);
      cssH = Math.max(1, canvas.clientHeight);
      const wantW = Math.round(cssW * ratio),
        wantH = Math.round(cssH * ratio);
      if (canvas.width !== wantW) canvas.width = wantW;
      if (canvas.height !== wantH) canvas.height = wantH;
    }
    function draw() {
      if (!painter) return;
      const prm = api.params,
        ink = SHEETS[prm.sheet] || SHEETS.ink;
      painter.paint(
        {
          reach: p,
          clearing: out,
          wide: cssW / cssH,
          cells: prm.grain,
          rip: prm.tear,
          bulge: prm.bow * BULGE,
          crown: rgb(ink[0]),
          foot: rgb(ink[1]),
        },
        cssW,
        cssH,
      );
    }
    let page = 0,
      target = 0,
      phase = 'idle',
      t = 0,
      dur = 0,
      p = 0,
      out = 0,
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
    function sheet(on) {
      canvas.toggleAttribute('data-on', on);
      if (!on && painter) painter.blank();
    }
    function setPhase(next) {
      phase = next;
      t = 0;
      element.dataset.phase = next;
      dur =
        next === 'cover'
          ? BEAT.coverMs * api.params.pace
          : next === 'uncover'
            ? BEAT.clearMs * api.params.pace
            : next === 'hold'
              ? BEAT.holdMs
              : 0;
    }
    function go(i) {
      if (restoring || (i === target && (phase !== 'idle' || i === page))) return false;
      target = i;
      markNav(i);
      live_.textContent = NAV[i] + '.';
      if (api.reduced) {
        phase = 'idle';
        element.dataset.phase = 'idle';
        page = i;
        showPage(i);
        sheet(false);
        return true;
      }
      if (phase === 'idle' || phase === 'uncover') {
        setPhase('cover');
        p = 0;
        out = 0;
        sheet(true);
        sizeCanvas();
      }
      api.wake();
      return true;
    }
    function step(dt) {
      if (phase === 'idle') return;
      t += dt * 1000;
      const k = Math.min(1, t / dur);
      if (phase === 'cover') {
        out = 0;
        p = settle(k, BEAT.coverCurve);
        if (k >= 1) {
          p = 1;
          page = target;
          showPage(page);
          setPhase('hold');
        }
      } else if (phase === 'hold') {
        out = 0;
        p = 1;
        if (t >= dur) {
          if (page !== target) {
            page = target;
            showPage(page);
          }
          setPhase('uncover');
          p = BEAT.clearFrom;
          out = 1;
        }
      } else {
        out = 1;
        p = BEAT.clearFrom + (1 - BEAT.clearFrom) * settle(k, BEAT.clearCurve);
        if (k >= 1) {
          p = 1;
          setPhase('idle');
          sheet(false);
          return;
        }
      }
      draw();
    }
    function settleIdle(i) {
      phase = 'idle';
      element.dataset.phase = 'idle';
      page = target = i;
      p = 0;
      out = 0;
      showPage(i);
      markNav(i);
      sheet(false);
    }
    pills.forEach((btn, i) =>
      api.listen(btn, 'click', () => {
        if (api.paused || (cardOpt && !live)) return;
        takeOver();
        if (go(i) && cardOpt && cardOpt.touched) cardOpt.touched();
      }),
    );
    api.on('resize', () => {
      sizeCanvas();
      if (phase !== 'idle') draw();
    });
    api.on('params', () => {
      if (phase !== 'idle') draw();
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
    api.on('destroy', () => {
      if (painter) painter.free();
      painter = null;
    });
    const L = 6;
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
        if (c === 0) settleIdle(0);
        aim = (target + 1) % NAV.length;
      }
      const s = element.getBoundingClientRect(),
        site = element.querySelector('.tr-site').getBoundingClientRect(),
        rest = { x: site.right - s.left - site.width * 0.14, y: site.top - s.top + site.height * 0.58 },
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
        b = pts[1];
      for (let i = 0; i < pts.length - 1; i++)
        if (tt >= pts[i][0] && tt <= pts[i + 1][0]) {
          a = pts[i];
          b = pts[i + 1];
          break;
        }
      const u = b[0] === a[0] ? 1 : R.smooth((tt - a[0]) / (b[0] - a[0])),
        x = R.mix(a[1].x, b[1].x, u),
        y = R.mix(a[1].y, b[1].y, u);
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
        if (restoring || (phase === 'idle' && page === 0 && target === 0)) return;
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
    settleIdle(0);
    const status = api.status;
    api.status = () => ({ ...status(), page, target, phase, progress: p, out, renderer });
    element.dataset.renderer = renderer;
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountTornSheetTransition(element, options) {
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
    element.classList.add('torn-sheet-transition');
    element.innerHTML = '<div class="fx-board" data-tr-board></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      board = stage.querySelector('[data-tr-board]'),
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
        w = Math.min(760, W - 64);
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
      ].forEach(([k, v]) => board.style.setProperty('--tr-' + k, Math.round(v) + 'px'));
      board.style.setProperty('--fx-k', (w / 336).toFixed(4));
    }
    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);

    const inst = mount(board, {
      params: options.params,
      preview: true,
      fallback: !!options.fallback,
      card: { text: true, interactive: true, once: true, pointer: cursor.set },
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
  global.mountTornSheetTransition = mountTornSheetTransition;
  if (typeof module === 'object' && module.exports) module.exports = mountTornSheetTransition;
})(typeof window !== 'undefined' ? window : this);
