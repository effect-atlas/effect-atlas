/*
 * Curved Gallery
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Six white cards stand on a curved wall in real 3D (Three.js): the card in front is the largest, cards toward the edges
 * turn away and recede. Drag to spin the wall; scroll the wheel over it to fold the curve flat into a grid and back.
 * On load a demo cursor plays the gestures once (drag one card, fold into the grid, unfold); the first real press or
 * wheel takes over for good.
 *
 * How it moves
 * - Each card sits at an angle of (its distance from the front, in cards) x curvature, 28 degrees per card by default
 *   (option "curvature"), on a circle of radius 4.2 world units (2.7 when the element is under 650 px wide). The x
 *   position is sin(angle) x radius, depth is (cos(angle) - 1) x radius, and the card turns by -angle to face the centre,
 *   so the perspective camera (40 degree field of view, 6.5 units away) does the shrinking and the layering. Each card
 *   plane is also bent along its width so the wall reads as one continuous curve.
 * - Dragging: one full element width of drag moves the wall by five cards. On release the wall keeps the drag velocity
 *   (capped at 8 cards per second), which decays exponentially at 6 per second (option "damping"); once it is slow it
 *   eases onto the nearest whole card. The displayed position chases the target at rate 10, so fast reversals never jump.
 * - Folding: 1800 px of wheel is a full fold, chased at rate 7 and shaped with smoothstep. Every card interpolates from
 *   its arc position to a 3 x 2 grid cell (2 columns on narrow screens); turn and bend go to zero, scale goes 1.18 -> 0.8.
 * - The wheel belongs to the gallery while it folds: one continuous wheel gesture that moved the fold keeps being
 *   swallowed after it reaches an end, and the page only scrolls after the fold has settled and you push one more notch
 *   (100 px) outward. That keeps trackpad inertia from running on into the page.
 * - The wall is centred in the element and sized to its height (at most (height - 48) / 4.34 world units per card).
 * - Without WebGL (or after a lost context) the same math drives CSS 3D transforms on plain HTML cards.
 *
 * Accessibility
 * - The gallery is decorative motion over static cards; with reduced motion there is no demo cursor, no glide and a
 *   swipe steps exactly one card.
 * - The loop sleeps when nothing moves, the tab is hidden or the element is off screen. destroy() releases the WebGL
 *   renderer, geometry, textures and materials.
 *
 * Usage
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="three.min.js"></script>
 *   <script src="effect.js"></script>
 *   <script>
 *     const fx = mountCurvedGallery(document.getElementById('stage'), {params: {curvature: 28, spacing: 100, damping: 6}});
 *     // fx.setParams({curvature: 40}); fx.setPaused(true); fx.reset(); fx.destroy();
 *   </script>
 *
 * Options
 *   params.curvature  angle between neighbouring cards in degrees, default 28
 *   params.spacing    distance between cards in percent, default 100
 *   params.damping    how fast the drag glide slows down and snaps, default 6
 *   reducedMotion     true / false / null  force reduced motion on or off; null follows the system setting
 * The card faces are drawn on canvases in texture(i); replace it to show your own images.
 *
 * Third-party: three.js r128 (three.min.js, MIT License, Copyright 2010-2021 Three.js Authors; see three.LICENSE.txt).
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
  const R = { clamp, mix, damp, smooth };

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
    { key: 'curvature', type: 'range', default: 28, min: 12, max: 46, step: 1 },
    { key: 'spacing', type: 'range', default: 100, min: 75, max: 140, step: 1 },
    { key: 'damping', type: 'range', default: 6, min: 3, max: 12, step: 0.5 },
  ];

  // ---- the effect ----
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    const cardOpt = options.card || null;
    const live = !!(cardOpt && cardOpt.interactive),
      cardGL = !!(cardOpt && cardOpt.texture && window.THREE),
      cardFull = !!(cardOpt && cardOpt.texture);
    let handOff = false,
      back = null,
      swipe = null;
    element.classList.add('arc-stage');
    if (cardOpt)
      element.innerHTML = '<div class="arc-viewport" aria-hidden="true"><div class="arc-fallback"></div></div>';
    else
      element.innerHTML =
        '<div class="arc-viewport" tabindex="0" role="group" aria-label="Curved gallery. Drag or use the left and right arrow keys."><canvas class="arc-webgl" aria-hidden="true"></canvas><div class="arc-fallback" aria-hidden="true"></div></div><div class="arc-caption" data-cr-chrome><strong aria-live="polite">03 / 06</strong></div><div class="arc-controls" data-cr-chrome><div class="cr-arrows"><button class="cr-arrow arc-prev" type="button" aria-label="Previous">←</button><button class="cr-arrow arc-next" type="button" aria-label="Next">→</button></div><label class="arc-progress"><span>Curve <b>Grid</b></span><input aria-label="Curve to grid" type="range" min="0" max="100" step="1" value="0"></label></div>';
    if (cardGL)
      element
        .querySelector('.arc-viewport')
        .insertAdjacentHTML('afterbegin', '<canvas class="arc-webgl" aria-hidden="true"></canvas>');
    const canvas = element.querySelector('canvas'),
      fallback = element.querySelector('.arc-fallback'),
      viewport = element.querySelector('.arc-viewport'),
      slider = element.querySelector('input'),
      caption = element.querySelector('.arc-caption strong');
    let renderer = null,
      scene,
      camera,
      meshes = [],
      textures = [],
      geometry,
      materials = [],
      offset = 0,
      target = 0,
      velocity = 0,
      progress = 0,
      targetProgress = 0,
      drag = null,
      lastActive = -1,
      contextLost = false;
    const css = getComputedStyle(element),
      tok = (n, f) => css.getPropertyValue(n).trim() || f;
    const INK = tok('--ink', '#17181a'),
      ACC = tok('--accent', '#4559ff'),
      INK3 = tok('--ink-3', '#9a9993');
    function card(i, cv) {
      const W = 520,
        H = 640,
        P = 20,
        w = W - 2 * P,
        h = H - 2 * P,
        c = cv || document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      const rr = (x, y, ww, hh, r) => {
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + ww, y, x + ww, y + hh, r);
        g.arcTo(x + ww, y + hh, x, y + hh, r);
        g.arcTo(x, y + hh, x, y, r);
        g.arcTo(x, y, x + ww, y, r);
        g.closePath();
      };
      g.save();
      g.shadowColor = 'rgba(23,24,26,.10)';
      g.shadowBlur = 16;
      g.shadowOffsetY = 4;
      rr(P, P, w, h, 30);
      g.fillStyle = '#ffffff';
      g.fill();
      g.restore();
      g.strokeStyle = 'rgba(23,24,26,.07)';
      g.lineWidth = 2;
      rr(P + 1, P + 1, w - 2, h - 2, 29);
      g.stroke();
      const n = i % 4,
        cx = W / 2,
        cy = P + h * 0.44;
      g.strokeStyle = i === 2 ? ACC : INK;
      g.lineWidth = 16;
      g.lineCap = 'round';
      g.beginPath();
      if (n === 0) g.arc(cx, cy, 78, 0, Math.PI * 2);
      else if (n === 1) {
        g.moveTo(cx, cy - 80);
        g.lineTo(cx, cy + 80);
        g.moveTo(cx - 80, cy);
        g.lineTo(cx + 80, cy);
      } else if (n === 2) g.rect(cx - 72, cy - 72, 144, 144);
      else {
        g.moveTo(cx - 64, cy - 64);
        g.lineTo(cx + 64, cy + 64);
        g.moveTo(cx + 64, cy - 64);
        g.lineTo(cx - 64, cy + 64);
      }
      g.stroke();
      g.fillStyle = INK3;
      g.font = '500 22px "Geist", "Inter", system-ui, sans-serif';
      g.fillText(String(i + 1).padStart(2, '0'), P + 36, P + 54);
      g.fillStyle = 'rgba(23,24,26,.12)';
      rr(P + 36, H - P - 92, 190, 10, 5);
      g.fill();
      rr(P + 36, H - P - 66, 120, 10, 5);
      g.fill();
      return c;
    }
    const originals = cardOpt ? [] : Array.from({ length: 6 }, (_, i) => card(i));
    const fallbacks = cardOpt
      ? Array.from({ length: 6 }, (_, i) => {
          const frame = document.createElement('div');
          frame.className = 'arc-flat-card';
          frame.innerHTML = cardOpt.item(i);
          fallback.append(frame);
          return frame;
        })
      : originals.map((poster, i) => {
          const frame = document.createElement('div');
          frame.className = 'arc-flat-card';
          const img = new Image();
          img.src = poster.toDataURL('image/png');
          img.alt = '';
          frame.append(img);
          fallback.append(frame);
          return frame;
        });
    if (!cardOpt && document.fonts)
      document.fonts.load('500 22px "Geist"').then(
        () => {
          if (api.destroyed) return;
          originals.forEach((c, i) => {
            card(i, c);
            const img = fallbacks[i].querySelector('img');
            if (img) img.src = c.toDataURL('image/png');
          });
          textures.forEach((t) => {
            t.needsUpdate = true;
          });
          if (!api.destroyed) api.paint();
        },
        () => {},
      );
    if (!cardOpt || cardGL)
      try {
        if (new URLSearchParams(location.search).has('fallback')) throw new Error('Explicit fallback preview.');
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
        renderer.outputEncoding = THREE.sRGBEncoding;
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
        camera.position.z = 6.5;
        geometry = new THREE.PlaneGeometry(1.8, 2.25, 16, 8);
        for (let i = 0; i < 6; i++) {
          const texture = new THREE.CanvasTexture(cardGL ? cardOpt.texture(i) : originals[i]);
          texture.encoding = THREE.sRGBEncoding;
          textures.push(texture);
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,
          });
          materials.push(material);
          const mesh = new THREE.Mesh(geometry, material);
          scene.add(mesh);
          meshes.push(mesh);
        }
        fallback.hidden = true;
      } catch (error) {
        if (renderer) {
          renderer.dispose();
          renderer.forceContextLoss();
          renderer = null;
        }
        canvas.hidden = true;
        fallback.hidden = false;
      }
    function sizing() {
      if (renderer && !contextLost) {
        renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
        camera.aspect = viewport.clientWidth / viewport.clientHeight;
        camera.updateProjectionMatrix();
      }
    }
    api.on('resize', sizing);
    if (!cardOpt) {
      api.listen(canvas, 'webglcontextlost', (event) => {
        event.preventDefault();
        contextLost = true;
        canvas.hidden = true;
        fallback.hidden = false;
        api.paint();
      });
      api.listen(canvas, 'webglcontextrestored', () => {
        contextLost = false;
        canvas.hidden = false;
        fallback.hidden = true;
        sizing();
        api.wake();
      });
      function go(delta) {
        target += delta;
        velocity = 0;
        if (api.reduced) offset = target;
        api.paint();
        api.wake();
      }
      api.listen(element.querySelector('.arc-prev'), 'click', () => go(-1));
      api.listen(element.querySelector('.arc-next'), 'click', () => go(1));
      api.listen(viewport, 'keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          go(event.key === 'ArrowLeft' ? -1 : 1);
        }
      });
      api.listen(slider, 'input', () => {
        targetProgress = +slider.value / 100;
        if (api.reduced) {
          progress = targetProgress;
          api.paint();
        }
        api.wake();
      });
      api.listen(
        viewport,
        'wheel',
        (event) => {
          if (api.paused) return;
          event.preventDefault();
          wheelBy(event.deltaY);
        },
        { passive: false },
      );
    }
    if (cardGL && renderer) {
      api.listen(canvas, 'webglcontextlost', (event) => {
        event.preventDefault();
        contextLost = true;
        canvas.hidden = true;
        fallback.hidden = false;
        api.paint();
      });
      api.listen(canvas, 'webglcontextrestored', () => {
        contextLost = false;
        canvas.hidden = false;
        fallback.hidden = true;
        sizing();
        api.paint();
        api.wake();
      });
    }
    function wheelBy(deltaY) {
      targetProgress = R.clamp(targetProgress + deltaY / 1800, 0, 1);
      if (slider) slider.value = Math.round(targetProgress * 100);
      if (api.reduced) {
        progress = targetProgress;
        api.paint();
      }
      api.wake();
    }
    api.listen(viewport, 'pointerdown', (event) => {
      if (event.button !== 0 || api.paused || api.reduced) return;
      grab(event.pointerId, event.clientX, performance.now());
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('is-dragging');
    });
    api.listen(viewport, 'pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId || api.paused) return;
      dragTo(event.clientX, performance.now());
    });
    function grab(pointerId, x, at) {
      drag = { id: pointerId, x, at };
      velocity = 0;
    }
    function dragTo(x, now) {
      const dx = x - drag.x,
        dt = Math.max(0.008, (now - drag.at) / 1000);
      const delta = (-dx / Math.max(240, api.width)) * 5;
      target += delta;
      velocity = R.clamp(delta / dt, -8, 8);
      drag.x = x;
      drag.at = now;
      api.wake();
    }
    function release(event) {
      if (!drag || event.pointerId !== drag.id) return;
      if (!cardOpt && viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      drag = null;
      viewport.classList.remove('is-dragging');
      api.wake();
    }
    api.listen(viewport, 'pointerup', release);
    api.listen(viewport, 'pointercancel', (event) => {
      velocity = 0;
      release(event);
    });
    api.on('pause', (paused) => {
      if (paused && drag && !cardOpt) {
        const pointerId = drag.id;
        release({ pointerId });
      }
    });
    api.on('replay', () => {
      offset = target = velocity = progress = targetProgress = 0;
      drag = null;
      if (slider) slider.value = 0;
      lastActive = -1;
      cardTime = 0;
    });
    let cardTime = 0,
      cardSent = 0;
    const HAND_X = 40,
      HAND_Y = 10,
      DRAG_PX = 62;
    function cardHand(dt) {
      if (live && (handOff || (cardOpt.once && cardTime >= 7))) {
        takeOver();
        return;
      }
      const hk = +cardOpt.handScale || 1;
      const L = 7,
        prev = cardTime;
      cardTime += dt;
      const ease = (u) => (u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u));
      if (Math.floor(prev / L) !== Math.floor(cardTime / L)) cardSent = Math.floor(cardTime / L) * L;
      for (; cardSent + 1 / 60 <= cardTime; cardSent += 1 / 60) {
        const t = (cardSent + 1 / 60) % L,
          now = (cardSent + 1 / 60) * 1000;
        if (t >= 0.6 && t < 1.7) {
          const x = (HAND_X - DRAG_PX * ease((t - 0.6) / 1.1)) * hk;
          if (!drag) grab(-1, HAND_X * hk, now - 1000 / 60);
          dragTo(x, now);
        } else if (drag) {
          release({ pointerId: -1 });
        }
        if (t >= 2.5 && t < 3.7) wheelBy(1800 / 72);
        else if (t >= 4.7 && t < 5.9) wheelBy(-1800 / 72);
      }
      const t = cardTime % L,
        x =
          (t < 1.7 ? HAND_X - DRAG_PX * ease((t - 0.6) / 1.1) : R.mix(HAND_X - DRAG_PX, 0, ease((t - 1.8) / 0.6))) * hk,
        y = (t < 1.7 ? HAND_Y : R.mix(HAND_Y, 0, ease((t - 1.8) / 0.6))) * hk;
      const opacity = t < 0.5 ? ease(t / 0.4) : t > 6.0 ? 1 - ease((t - 6.0) / 0.4) : 1;
      cardOpt.pointer({
        x: api.width / 2 + x,
        y: api.height / 2 + y,
        opacity,
        down: t >= 0.6 && t < 1.7,
        wheel: (t >= 2.4 && t < 3.8) || (t >= 4.6 && t < 6.0),
      });
    }
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
      if (drag && drag.id === -1) {
        velocity = 0;
        release({ pointerId: -1 });
      }
      if (cardOpt.pointer) cardOpt.pointer({ x: 0, y: 0, opacity: 0, down: false, wheel: false });
    }
    function stepBack(dt, reduced) {
      back.t += dt;
      const u = reduced ? 1 : Math.min(1, back.t / RESTORE),
        e = outEase(u);
      offset = target = R.mix(back.from, back.to, e);
      progress = targetProgress = R.mix(back.p, 0, e);
      velocity = 0;
      if (u >= 1) {
        offset = target = progress = targetProgress = 0;
        back = null;
      }
    }
    if (live) {
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
        viewport,
        'wheel',
        (event) => {
          if (api.paused) return;
          const d = event.deltaY,
            e = event;
          if (gap && d) {
            const now = performance.now();
            if (now - wheelAt > gap) held = false;
            wheelAt = now;
          }
          if (!d || (d > 0 && targetProgress >= 1) || (d < 0 && targetProgress <= 0)) {
            if (gap && d && held) {
              event.preventDefault();
              return;
            }
            if (push && d) {
              const now = performance.now();
              if (Math.sign(d) !== pushDir || now - pushAt > PUSH_IDLE) pushed = 0;
              pushDir = Math.sign(d);
              pushAt = now;
              if (!(!back && Math.abs(progress - targetProgress) <= 0.01)) {
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
            return;
          }
          if (gap) held = true;
          pushed = 0;
          event.preventDefault();
          takeOver();
          back = null;
          wheelBy(d);
          if (cardOpt.touched) cardOpt.touched();
        },
        { passive: false },
      );
      api.listen(viewport, 'pointerdown', (event) => {
        if (event.button !== 0 || api.paused) return;
        takeOver();
        back = null;
        if (api.reduced) {
          swipe = { id: event.pointerId, x: event.clientX };
          viewport.setPointerCapture(event.pointerId);
        }
      });
      api.listen(viewport, 'pointermove', (event) => {
        if (drag && drag.id === event.pointerId && !api.paused && cardOpt.touched) cardOpt.touched();
      });
      api.listen(viewport, 'pointerup', (event) => {
        if (!swipe || swipe.id !== event.pointerId) return;
        const dx = event.clientX - swipe.x;
        swipe = null;
        if (Math.abs(dx) > 24) {
          target = Math.round(target) + (dx < 0 ? 1 : -1);
          offset = target;
          if (cardOpt.touched) cardOpt.touched();
          api.paint();
        }
      });
      api.on('replay', () => {
        back = null;
        swipe = null;
      });
      api.restore = () => {
        takeOver();
        swipe = null;
        if (drag) {
          const id = drag.id;
          if (id !== -1 && viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
          release({ pointerId: id });
        }
        velocity = 0;
        if (api.reduced) {
          back = null;
          offset = target = progress = targetProgress = 0;
          api.paint();
          return;
        }
        back = { t: 0, from: offset, to: Math.round(offset / 6) * 6, p: progress };
        target = offset;
        targetProgress = progress;
        api.wake();
      };
    }
    api.frame(({ dt, time, params, reduced }) => {
      if (cardOpt) {
        if (reduced) {
          if (cardOpt.pointer) cardOpt.pointer({ opacity: 0, down: false, wheel: false });
        } else if (cardOpt.pointer) cardHand(dt);
      }
      if (options.preview && !reduced) {
        targetProgress = (Math.sin(time * 0.5 - Math.PI / 2) + 1) * 0.5;
        target = Math.sin(time * 0.2) * 0.45;
      }
      if (!drag && !reduced) {
        target += velocity * dt;
        velocity *= Math.exp(-params.damping * dt);
        if (Math.abs(velocity) < 0.02) {
          velocity = 0;
          target = R.damp(target, Math.round(target), params.damping, dt);
        }
      }
      offset = reduced ? target : R.damp(offset, target, 10, dt);
      progress = reduced ? targetProgress : R.damp(progress, targetProgress, 7, dt);
      if (back) stepBack(dt, reduced);
      const mix = R.smooth(progress),
        mobile = !options.preview && (!cardOpt || cardFull) && api.width < 650,
        radius = mobile ? 2.7 : 4.2,
        cameraZ = mobile ? R.mix(6.5, 9, mix) : 6.5,
        unit =
          cardOpt && !cardFull ? cardOpt.unit || 47 : viewport.clientHeight / (2 * Math.tan(Math.PI / 9) * cameraZ),
        scale = R.mix(mobile ? 1 : 1.18, mobile ? 0.82 : 0.8, mix),
        columns = mobile ? 2 : 3;
      if (camera) camera.position.z = cameraZ;
      for (let i = 0; i < 6; i++) {
        const rel = ((((i - 2.5 - offset + 9) % 6) + 6) % 6) - 3,
          theta = (rel * params.curvature * Math.PI) / 180;
        const xArc = Math.sin(theta) * radius * (params.spacing / 100),
          yArc = -xArc * 0.17 - 0.1 * Math.cos(theta),
          zArc = (Math.cos(theta) - 1) * radius;
        const gx = ((i % columns) - (columns - 1) / 2) * (mobile ? 1.56 : 2.12) * (params.spacing / 100),
          gy = ((Math.ceil(6 / columns) - 1) / 2 - Math.floor(i / columns)) * (mobile ? 1.92 : 2.66);
        const x = R.mix(xArc, gx, mix),
          y = R.mix(yArc, gy, mix),
          z = R.mix(zArc, 0, mix),
          rotation = R.mix(-theta, 0, mix);
        if (meshes[i]) {
          meshes[i].position.set(x, y, z);
          meshes[i].rotation.y = rotation;
          meshes[i].rotation.z = R.mix(-0.13 - theta * 0.035, 0, mix);
          meshes[i].scale.setScalar(scale);
        }
        const perspective = cameraZ / (cameraZ - z),
          el = fallbacks[i];
        el.style.width = 1.8 * unit * scale + 'px';
        el.style.height = 2.25 * unit * scale + 'px';
        el.style.transform =
          'translate(-50%,-50%) translate3d(' +
          x * unit * perspective +
          'px,' +
          -y * unit * perspective +
          'px,0) rotateY(' +
          rotation +
          'rad) scale(' +
          perspective +
          ')';
        el.style.zIndex = String(Math.round(100 + z * 10));
      }
      if (geometry) {
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          positions.setZ(i, -(1 - Math.cos((x * params.curvature) / 34)) * 1.4 * (1 - mix));
        }
        positions.needsUpdate = true;
      }
      if (renderer && !contextLost) renderer.render(scene, camera);
      const active = ((Math.round(offset + 2.5) % 6) + 6) % 6;
      if (active !== lastActive && caption) {
        caption.textContent = String(active + 1).padStart(2, '0') + ' / 06';
        lastActive = active;
      }
      element.dataset.progress = progress.toFixed(4);
      element.dataset.offset = offset.toFixed(4);
      element.dataset.renderer = renderer && !contextLost ? 'webgl' : 'css';
      element.dataset.phase = progress > 0.98 ? 'grid' : 'arc';
      return (
        options.preview ||
        (!!cardOpt && !(live && handOff)) ||
        !!back ||
        !!drag ||
        Math.abs(velocity) > 0.001 ||
        Math.abs(offset - target) > 0.0001 ||
        Math.abs(progress - targetProgress) > 0.0001
      );
    });
    api.on('destroy', () => {
      if (drag && viewport.hasPointerCapture(drag.id)) viewport.releasePointerCapture(drag.id);
      drag = null;
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      if (geometry) geometry.dispose();
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
      }
      meshes = [];
      textures = [];
      materials = [];
      if (canvas) canvas.width = canvas.height = 1;
    });
    const status = api.status;
    api.status = () => ({
      ...status(),
      offset,
      target,
      velocity,
      progress,
      targetProgress,
      renderer: renderer && !contextLost ? 'webgl' : 'css',
      resources: api.destroyed ? 0 : meshes.length + textures.length + materials.length,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountCurvedGallery(element, options) {
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
    element.classList.add('curved-gallery');
    element.innerHTML = '<div class="fx-board"><div class="arc-board" data-arc></div></div>';
    const stage = element,
      board = stage.querySelector('.fx-board'),
      box = board.querySelector('[data-arc]'),
      cursor = createCursor(stage, { inertia: false });
    const css = getComputedStyle(stage),
      OBJECT = css.getPropertyValue('--object').trim() || '#fff',
      INK = css.getPropertyValue('--ink').trim() || '#17181a',
      ACCENT = css.getPropertyValue('--accent').trim() || '#4559ff';
    const GLYPH = [
      (g) => g.arc(50, 50, 34, 0, Math.PI * 2),
      (g) => {
        g.moveTo(50, 16);
        g.lineTo(50, 84);
        g.moveTo(16, 50);
        g.lineTo(84, 50);
      },
      (g) => g.rect(20, 20, 60, 60),
      (g) => {
        g.moveTo(24, 24);
        g.lineTo(76, 76);
        g.moveTo(76, 24);
        g.lineTo(24, 76);
      },
    ];
    function texture(i) {
      const W = 512,
        H = 640,
        P = 20,
        w = W - 2 * P,
        h = H - 2 * P,
        r = w * 0.16,
        c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      const rr = () => {
        g.beginPath();
        g.moveTo(P + r, P);
        g.arcTo(P + w, P, P + w, P + h, r);
        g.arcTo(P + w, P + h, P, P + h, r);
        g.arcTo(P, P + h, P, P, r);
        g.arcTo(P, P, P + w, P, r);
        g.closePath();
      };
      g.save();
      g.shadowColor = 'rgba(23,24,26,.06)';
      g.shadowBlur = 16;
      g.shadowOffsetY = 4;
      rr();
      g.fillStyle = OBJECT;
      g.fill();
      g.restore();
      rr();
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(23,24,26,.06)';
      g.stroke();
      rr();
      g.fillStyle = OBJECT;
      g.fill();
      const s = (w * 0.34) / 100,
        n = i % 4;
      g.translate(W / 2 - 50 * s, H / 2 - 50 * s);
      g.scale(s, s);
      g.lineWidth = 7;
      g.lineCap = n === 1 || n === 3 ? 'round' : 'butt';
      g.strokeStyle = i === 2 ? ACCENT : INK;
      g.beginPath();
      GLYPH[n](g);
      g.stroke();
      return c;
    }
    const TAN = 2 * Math.tan(Math.PI / 9) * 6.5,
      M = 24;
    let ox = 0,
      oy = 0;
    function fit() {
      const W = stage.clientWidth,
        H = stage.clientHeight;
      let u,
        cx = W / 2,
        cy = H / 2;
      if (W < 650) u = Math.min((W / 2 - 8) / 2.25, (H - 32) / 4.02);
      else u = Math.min((H - 2 * M) / 4.34, (W / 2 - M) / 3.69);

      const bh = Math.round(u * TAN),
        bw = Math.round(2 * Math.min(cx, W - cx));
      ox = Math.round(cx - bw / 2);
      oy = Math.round(cy - bh / 2);
      box.style.cssText = 'left:' + ox + 'px;top:' + oy + 'px;width:' + bw + 'px;height:' + bh + 'px';
      board.style.setProperty('--fx-k', (bh / TAN / 47).toFixed(4));
    }
    fit();
    const observer0 = new ResizeObserver(fit);
    observer0.observe(stage);
    const inst = mount(box, {
      params: options.params,
      card: {
        interactive: true,
        once: true,
        texture,
        wheelLatch: true,
        endPush: true,
        item: (i) => media({ glyph: i % 4, accent: i === 2 }),
        get handScale() {
          return box.clientWidth / 336;
        },
        pointer: (s) => cursor.set(Object.assign({}, s, { x: s.x + ox, y: s.y + oy })),
      },
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
  global.mountCurvedGallery = mountCurvedGallery;
  if (typeof module === 'object' && module.exports) module.exports = mountCurvedGallery;
})(typeof window !== 'undefined' ? window : this);
