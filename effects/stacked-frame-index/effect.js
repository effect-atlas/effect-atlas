/*
 * Stacked Frame Index
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A compact collection index: rows with a name, a count and a small image slot. Hover a row and its image flips
 * through six stacked frames like a flipbook; leave and it rests on the first frame. Good for a project list,
 * a category index or a "collections" block on a portfolio.
 *
 * How it moves
 * - Rows: up to five collections (name, image slot, count in brackets; the order of the three parts differs per row).
 *   The number of rows is floor((stage height - 44) / 76), clamped to 1..5, and is recomputed whenever the element
 *   resizes (rows are rebuilt; a lit row that still exists stays lit). The list is centred horizontally; each row's
 *   height is capped so all rows fit the stage.
 * - Hover (mouse / pen): the row under the pointer gets data-on and its slot shows frame
 *   floor(time since lit / frameInterval) mod 6. Moving to another row restarts that row at frame 0. Leaving the
 *   list unlights everything.
 * - Keyboard: every row is in the Tab order (tabindex 0). Keyboard focus lights the row exactly like hover; moving
 *   focus away puts it out. Focusing a row also ends the demo.
 * - Touch, or any device where (hover: none) matches: a tap lights the tapped row, tapping it again unlights it.
 * - Demo, once on load: a fake cursor walks down the rows, 1.7 s per row, following the image slot of the lit row
 *   (aimed at 62% / 70% of the slot, exponential follow with a 110 ms time constant). After one pass through all rows
 *   it hides for good. A real pointer move (with actual movement) or any press ends it earlier.
 * - reset(): params back to defaults, every row unlit; row heights and slot sizes ease for 500 ms.
 *
 * Options
 *   params.frameInterval   80..600, default 150  ms per frame while a row is lit
 *   params.imageScale      75..140, default 100  image slot size in percent (44 x 56 px at 100)
 *
 * API
 *   const fx = mountStackedFrameIndex(element, {params: {...}});
 *   fx.params                           copy of current params
 *   fx.setParams({frameInterval: 300})  change params live
 *   fx.reset()                          defaults, demo stopped, rows unlit
 *   fx.destroy()                        stops the loop, removes listeners, observers and the fake cursor, empties the element
 * There is no pause or reduced-motion setter; reduced motion follows the system setting (see below).
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:520px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountStackedFrameIndex(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children. On resize the list
 * re-centres, the row count and the row height cap are recomputed.
 *
 * Safe to change
 * - Row content: the collections array (name, count, order of 'name' / 'image' / 'count') and the row() template in
 *   the mount function. The six frames per row are white cards with a mark (media()); swap them for real images,
 *   keeping six children inside the [data-slot] element.
 * - Colours, radius, shadow and type through the CSS variables and rules in effect.css.
 * - params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The frame switch is a hard cut (opacity 0 / 1), not a crossfade; that is what makes it read as a flipbook.
 * - Each lit row restarts at frame 0; do not share one global frame clock between rows.
 * - Keep exactly six children inside [data-slot] (FRAME_COUNT).
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). Without it the rAF loop and listeners leak. In React StrictMode the mount runs twice; destroy
 *   in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountStackedFrameIndex on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - Rows are focusable (tabindex 0) and light on keyboard focus the same way they light on hover; they have no role
 *   and no action, the frames are aria-hidden. If rows should lead somewhere, make them real links or buttons.
 * - With prefers-reduced-motion: no demo, no fake cursor; a lit row stays on frame 0 (the row still highlights).
 * - The loop pauses while the tab is hidden.
 */
(function (global) {
  'use strict';

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

  // ---- inlined from the shared card parts: a white card with a centred mark ----
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

  // ---- the effect ----
  const lib = {};
  (function () {
    'use strict';
    const controls = [
      {
        key: 'frameInterval',
        label: 'Frame interval',
        type: 'range',
        group: 'Hover',
        min: 80,
        max: 600,
        step: 10,
        default: 150,
        unit: 'ms',
        description: 'Time between the six stacked frames on hover or focus.',
        visualizer: 'timeline',
      },
      {
        key: 'imageScale',
        label: 'Image size',
        type: 'range',
        group: 'Layout',
        min: 75,
        max: 140,
        step: 1,
        default: 100,
        unit: '%',
        description: 'Size of the portrait image between title and count.',
        visualizer: 'grid',
      },
    ];
    const defaults = Object.fromEntries(controls.map((c) => [c.key, c.default]));
    const collections = [
      { name: 'Civic', count: 48, order: ['name', 'image', 'count'] },
      { name: 'Trail', count: 36, order: ['image', 'name', 'count'] },
      { name: 'Field', count: 24, order: ['name', 'count', 'image'] },
      { name: 'Renew', count: 8, order: ['name', 'image', 'count'] },
      { name: 'Detail', count: 12, order: ['image', 'name', 'count'] },
    ];
    const PREVIEW_ROW_MS = 1700,
      FRAME_COUNT = 6;
    function mountCard(el, cardOpt, options) {
      let values = { ...defaults, ...(options.params || {}) };
      let shown = [],
        rows = [];
      const hand = { x: 0, y: 0, set: false };
      let active = -1,
        cycleStart = 0;
      function setFrame(r, index) {
        r.frames.forEach((f, i) => (f.style.opacity = i === index ? '1' : '0'));
      }
      function build(n) {
        shown = collections.slice(0, n);
        el.innerHTML = shown.map((c, i) => cardOpt.row(c, i)).join('');
        rows = [...el.children].map((row) => ({
          row,
          slot: row.querySelector('[data-slot]'),
          frames: [...row.querySelectorAll('[data-slot]>*')],
        }));
        rows.forEach((r) => setFrame(r, 0));
        if (cardOpt.interactive)
          rows.forEach((r, i) => {
            r.row.tabIndex = 0;
            r.row.addEventListener('focus', () => {
              if (!r.row.matches(':focus-visible')) return;
              r.keyed = true;
              takeOver();
              light(i);
            });
            r.row.addEventListener('blur', () => {
              if (r.keyed && lit === i) light(-1);
              r.keyed = false;
            });
          });
      }
      build(cardOpt.count || 3);
      function target(r) {
        const a = el.getBoundingClientRect(),
          b = r.slot.getBoundingClientRect();
        return { x: b.left - a.left + b.width * 0.62, y: b.top - a.top + b.height * 0.7 };
      }
      const live = !!cardOpt.interactive,
        zone = cardOpt.zone || el,
        offs = [];
      const still = live && matchMedia('(prefers-reduced-motion: reduce)'),
        noHover = live && matchMedia('(hover: none)');
      let handOff = false,
        clock = 0,
        lit = -1,
        litStart = 0,
        dirty = false,
        downType = '';
      function takeOver() {
        if (handOff) return;
        handOff = true;
        dirty = true;
        cardOpt.pointer({ x: hand.x, y: hand.y, opacity: 0 });
      }
      function paint() {
        dirty = false;
        rows.forEach((r, i) => {
          const on = i === lit;
          r.row.toggleAttribute('data-on', on);
          setFrame(
            r,
            on && !still.matches ? Math.floor(Math.max(0, clock - litStart) / values.frameInterval) % FRAME_COUNT : 0,
          );
        });
      }
      function light(i) {
        if (i === lit) return;
        lit = i;
        litStart = clock;
        paint();
      }
      const rowOf = (node) => rows.findIndex((r) => r.row.contains(node)),
        tapping = (type) => type === 'touch' || noHover.matches;
      function on(target, type, fn) {
        target.addEventListener(type, fn);
        offs.push(() => target.removeEventListener(type, fn));
      }
      if (live) {
        el.style.setProperty('--index-scale', values.imageScale / 100);
        on(zone, 'pointermove', (e) => {
          if (!handOff && e.pointerType === 'mouse' && !e.movementX && !e.movementY) return;
          takeOver();
          if (!tapping(e.pointerType)) light(rowOf(e.target));
        });
        on(zone, 'pointerleave', (e) => {
          if (!tapping(e.pointerType)) light(-1);
        });
        on(zone, 'pointerdown', (e) => {
          downType = e.pointerType;
          takeOver();
        });
        on(zone, 'click', (e) => {
          if (!tapping(downType)) return;
          const i = rowOf(e.target);
          light(i === lit ? -1 : i);
          if (lit >= 0 && cardOpt.touched) cardOpt.touched();
        });
      }
      const control = cardOpt.loop((shown.length * PREVIEW_ROW_MS) / 1000, ({ t, dt, reduced, cycle }) => {
        if (live) {
          if (!handOff && (reduced || (cardOpt.once && cycle > 0))) takeOver();
          clock += dt * 1000;
          if (handOff) {
            if (lit >= 0 || dirty) paint();
            return;
          }
        }
        const ms = t * 1000,
          next = Math.floor(ms / PREVIEW_ROW_MS) % shown.length;
        if (next !== active) {
          active = next;
          cycleStart = ms;
          rows.forEach((r, i) => r.row.toggleAttribute('data-on', i === next));
        }
        rows.forEach((r, i) =>
          setFrame(
            r,
            i === active && !reduced
              ? Math.floor(Math.max(0, ms - cycleStart) / values.frameInterval) % FRAME_COUNT
              : 0,
          ),
        );
        const p = target(rows[active]);
        if (!hand.set || reduced) {
          hand.x = p.x;
          hand.y = p.y;
          hand.set = true;
        } else {
          const k = 1 - Math.exp((-dt * 1000) / 110);
          hand.x += (p.x - hand.x) * k;
          hand.y += (p.y - hand.y) * k;
        }
        cardOpt.pointer({ x: hand.x, y: hand.y, opacity: reduced ? 0 : 1 });
      });
      const api = {
        setParams(next) {
          values = { ...values, ...next };
        },
        replay() {
          active = -1;
          hand.set = false;
        },
        setPaused() {},
        destroy() {
          control.stop();
        },
      };
      api.setCount = (n) => {
        n = Math.max(1, Math.min(collections.length, n | 0));
        if (n === shown.length) return;
        const keep = lit < n ? lit : -1;
        build(n);
        active = -1;
        lit = -1;
        if (keep >= 0) light(keep);
        else if (live) paint();
      };
      if (live) {
        const setParams = api.setParams,
          destroy = api.destroy;
        api.setParams = (next) => {
          setParams(next);
          el.style.setProperty('--index-scale', values.imageScale / 100);
        };
        api.restore = () => {
          takeOver();
          lit = -1;
          paint();
        };
        api.destroy = () => {
          destroy();
          offs.splice(0).forEach((fn) => fn());
        };
      }
      return api;
    }
    function mount(el, options) {
      return mountCard(el, options.card, options);
    }
    lib.CommonIndex = { mount, controls };
  })();
  const LIB = lib;

  // the effect's API as the mount function sees it: every object a call returns that has destroy() is destroyed with the mount
  function ownInstances(api, owned) {
    const out = {};
    for (const name of Object.keys(api)) {
      const part = api[name];
      if (!part || typeof part !== 'object') {
        out[name] = part;
        continue;
      }
      const copy = Object.create(part);
      for (const key of Object.keys(part))
        if (typeof part[key] === 'function')
          copy[key] = function () {
            const made = part[key].apply(this === copy ? part : this, arguments);
            if (made && typeof made === 'object' && typeof made.destroy === 'function') owned.add(made);
            return made;
          };
      out[name] = copy;
    }
    return out;
  }

  // ---- mounting: stage markup, layout, motion and input ----
  function mountStackedFrameIndex(element, options) {
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
    const lib = ownInstances(LIB, mounted.owned);
    element.classList.add('stacked-frame-index');
    element.innerHTML = '<div class="fx-board" data-index-board></div>';
    const listeners = new AbortController();
    const stage = element,
      board = stage.querySelector('[data-index-board]'),
      cursor = createCursor(stage),
      still = matchMedia('(prefers-reduced-motion: reduce)');
    board.innerHTML = '<div class="ck-panel index-dir" data-size="lg"></div>';
    const dir = board.firstChild,
      M = 12,
      rowsFit = () => Math.max(1, Math.min(5, Math.floor((stage.clientHeight - 2 * M - 24 + 4) / 76)));
    let count = rowsFit();
    function loop(duration, fn) {
      let raf = 0,
        last = 0,
        time = 0,
        stopped = false;
      const tick = (now) => {
        raf = 0;
        if (stopped) return;
        if (document.hidden) {
          last = 0;
          return;
        }
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;
        time += dt;
        fn({ t: time % duration, dt, cycle: Math.floor(time / duration), duration });
        if (!raf && !stopped) raf = requestAnimationFrame(tick);
      };
      const wake = () => {
        if (!raf && !stopped && !still.matches) raf = requestAnimationFrame(tick);
      };
      document.addEventListener('visibilitychange', wake, { signal: listeners.signal });
      if (still.matches) fn({ t: duration * 0.5, dt: 0, cycle: 0, duration, reduced: true });
      else wake();
      return {
        wake,
        restart() {
          time = 0;
          last = 0;
          wake();
        },
        stop() {
          stopped = true;
          cancelAnimationFrame(raf);
          raf = 0;
          document.removeEventListener('visibilitychange', wake);
        },
      };
    }
    let inst = null,
      easing = 0;
    const applyParams = (p) => inst && inst.setParams(p),
      resetView = () => {
        if (!still.matches) {
          dir.setAttribute('data-easing', '');
          clearTimeout(easing);
          easing = setTimeout(() => dir.removeAttribute('data-easing'), 520);
        }
        if (inst) inst.restore();
      };
    function place() {
      count = rowsFit();
      if (inst && inst.setCount) inst.setCount(count);
      const W = stage.clientWidth,
        H = stage.clientHeight,
        w = dir.offsetWidth;
      let x = (W - w) / 2;

      dir.style.marginLeft = Math.round(x) + 'px';
      dir.style.setProperty('--index-row-max', ((H - 2 * M - 24 - 4 * (count - 1)) / count).toFixed(2) + 'px');
    }
    place();
    inst = lib.CommonIndex.mount(dir, {
      card: {
        count,
        row(c, i) {
          const parts = {
            name: '<span class="ck-text index-name" data-strong>' + c.name + '</span>',
            count: '<span class="ck-hint ck-num">(' + String(c.count).padStart(2, '0') + ')</span>',
            image:
              '<span class="index-slot" data-slot>' +
              Array.from({ length: 6 }, (_, j) =>
                media({ tone: 1 + ((j + i) % 2), glyph: (j + i) % 4, size: 'sm' }),
              ).join('') +
              '</span>',
          };
          return '<div class="ck-row">' + c.order.map((k) => parts[k]).join('') + '</div>';
        },
        interactive: true,
        once: true,
        zone: board,
        pointer: (s) => {
          const a = stage.getBoundingClientRect(),
            b = dir.getBoundingClientRect();
          cursor.set(Object.assign({}, s, { x: s.x + b.left - a.left, y: s.y + b.top - a.top }));
        },
        loop,
      },
    });
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);

    const DEFAULTS = Object.fromEntries(lib.CommonIndex.controls.map((c) => [c.key, c.default]));
    let params = Object.assign({}, DEFAULTS);
    const setParams = (next) => {
      params = Object.assign({}, params, next);
      if (applyParams) applyParams(Object.assign({}, params));
    };
    if (options.params) setParams(options.params);
    return {
      get params() {
        return Object.assign({}, params);
      },
      setParams,
      reset() {
        params = Object.assign({}, DEFAULTS);
        if (applyParams) applyParams(Object.assign({}, params));
        if (resetView) resetView();
      },
      destroy() {
        if (mounted.done) return;
        listeners.abort();
        observer0.disconnect();
        cursor.destroy();
        if (inst) mounted.owned.add(inst);
        mounted.restore();
      },
    };
  }
  global.mountStackedFrameIndex = mountStackedFrameIndex;
  if (typeof module === 'object' && module.exports) module.exports = mountStackedFrameIndex;
})(typeof window !== 'undefined' ? window : this);
