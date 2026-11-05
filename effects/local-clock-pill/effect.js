/*
 * Local Clock Pill
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A white pill that shows a city, an open / closed dot, its UTC offset and the live time with a blinking colon. Hover
 * and the face rolls up to a "Contact us" button. As shipped, the city and time are the visitor's own, taken from the
 * browser's time zone (Shanghai for a visitor in China, New York for one in New York); set a fixed place to show your
 * studio's city instead. Made for a footer, a contact section or a header corner of a studio or agency site.
 *
 * How it moves
 * - The pill holds two faces stacked in an overflow mask: the time face and the contact face right below it.
 * - Hover, keyboard focus or a pin moves both faces up by 100% (translate3d), params.duration ms,
 *   cubic-bezier(.22,1,.36,1). Leaving moves them back the same way. It is a CSS transition on a class (.is-contact),
 *   so a quick in and out reverses from wherever it is.
 * - Click pins the contact face (aria-pressed); a second click unpins it. Hover still works on top of the pin.
 * - The colon is two 8 px dots that blink with a 1 s step animation (on half a second, off half a second).
 *   params.blink = false stops it.
 * - Time: read with Intl.DateTimeFormat, 24 h, in the zone picked by params.zone: by default the place's zone, which
 *   is the visitor's own zone unless you set a fixed one. The offset label comes from the same call (for example UTC+8,
 *   UTC+5:30, UTC-4 in New York in summer), so daylight saving is handled.
 *   It re-renders 20 ms after each full minute, not every frame, and again when the pill comes back into view.
 * - City, with timeZone 'visitor': the browser's zone name (Intl.DateTimeFormat().resolvedOptions().timeZone, read once
 *   on mount), its last part with spaces for underscores: Asia/Shanghai -> Shanghai, America/Argentina/Buenos_Aires ->
 *   Buenos Aires. Browsers still report some old names; the small OLD_NAMES table maps them (Asia/Calcutta -> Kolkata,
 *   Asia/Saigon -> Ho Chi Minh City, Europe/Kiev -> Kyiv, Asia/Katmandu -> Kathmandu, Asia/Rangoon -> Yangon,
 *   America/Godthab -> Nuuk ...). Zones without a city (UTC, Etc/GMT+5) show "Local time". No city database, no
 *   network. The longest name any zone gives (Ho Chi Minh City) still leaves about a quarter of the row free; a longer
 *   custom city is cut with an ellipsis, the row never wraps.
 * - Status dot: accent colour inside the place's hours (default Mon to Fri, 9:00 to 18:00, counted in the place's zone
 *   whatever zone the time is shown in), muted grey otherwise. With the visitor's zone it means "working hours where
 *   you are"; with a fixed studio it means "the studio is open".
 * - Size: the pill is 200 x 132 px of content at scale 1 and grows with the element up to 1.625x, never below 1.
 * - Demo, once on load (8 s): a fake cursor moves onto the pill at about 1.8 s, rests there until about 4.7 s so the
 *   face rolls up and back, and leaves. Any real pointer move, press or keyboard focus ends it for good.
 *
 * Options
 *   params.duration  200..800, default 400    ms for the roll
 *   params.blink     true / false, default true   blinking colon
 *   params.zone      'place' | 'local' | '0' | '1' | '8' | '-5', default 'place'. 'place' = the place's zone (the
 *                    visitor's own as shipped), 'local' = the visitor's zone, a number = that fixed UTC offset. Changes
 *                    apply at once.
 *   reducedMotion    true / false / null      force reduced motion; null follows prefers-reduced-motion live
 *   The place (whose city, zone and hours the pill shows) is the place: {...} inside mountLocalClockPill, two ways:
 *     visitor (as shipped)  {timeZone: 'visitor', hours: [9, 18], days: [1, 2, 3, 4, 5]}
 *     fixed studio          {city: 'Berlin', timeZone: 'Europe/Berlin', hours: [9, 18], days: [1, 2, 3, 4, 5]}
 *   Fields are under Safe to change.
 *
 * API
 *   const fx = mountLocalClockPill(element, {params: {...}, reducedMotion: null});
 *   fx.params                       copy of current params
 *   fx.setParams({duration: 600})   change params live
 *   fx.setPaused(true|false)        freeze / resume (also stops the blink; clicks are ignored while paused)
 *   fx.reset()                      params back to defaults, demo stopped, time face shown, pin cleared
 *   fx.setReducedMotion(bool)
 *   fx.destroy()                    removes listeners, observers, the minute timer and the fake cursor
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:420px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountLocalClockPill(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The place, in mountLocalClockPill (the place: {...} passed to mount), one of:
 *   - Visitor (as shipped): timeZone 'visitor'. City, time, offset label and dot all follow the visitor's browser zone.
 *     Leave city out to use the zone's city name, or set one to override it.
 *   - Fixed studio: city (label) and timeZone (any IANA name, for example 'America/New_York'), like
 *     {city: 'Berlin', timeZone: 'Europe/Berlin', hours: [9, 18], days: [1, 2, 3, 4, 5]}.
 *   - Both: hours ([open, close) in local hours there, decimals allowed, default [9, 18]) and days (0 = Sunday ...
 *     6 = Saturday, default Monday to Friday).
 * - OLD_NAMES: add a pair if a browser reports an old zone name you want spelled differently.
 * - The "Contact us" text and arrow in placeRoll, colours, fonts and radius via effect.css.
 * - params within their ranges.
 *
 * Do not change (the feel breaks)
 * - Both faces must move together by exactly 100% of the mask height, with the out-expo curve; the roll should read as
 *   one strip turning, not a fade.
 * - Keep the minute-aligned timer. A per-frame or per-second redraw wastes work and makes the digits flicker.
 * - Keep the step timing on the colon blink; a smooth fade looks like a loading spinner.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - The pill is a button that only toggles the face. To make it a real contact link, add your own click handler on
 *   .clock-pill (mailto, a contact page) or swap it for an anchor and keep the classes.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountLocalClockPill on an embed div with a fixed height.
 * - SSR: only call it in the browser. Server and client clocks differ and the visitor's zone is only known in the
 *   browser, so render the pill on the client only.
 *
 * Accessibility and reduced motion
 * - The button's label is kept current: "<city> HH:MM, <offset>. Within|Outside working hours. Contact us" with the
 *   visitor's zone, "<city> HH:MM, <offset>. Studio open|closed. Contact us" with a fixed studio. aria-pressed tells
 *   whether the contact face is pinned; the contact face itself is aria-hidden. A polite live region announces pin and
 *   unpin ("Showing Contact." / "Showing local time.").
 * - With reduced motion: no fake cursor, no roll transition (faces switch instantly) and no blink. The clock still
 *   updates every minute.
 * - The loop only runs for the demo; the minute timer is separate and is cleared by destroy().
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
    {
      key: 'zone',
      type: 'select',
      default: 'place',
      options: [
        { value: 'place' },
        { value: 'local' },
        { value: '0' },
        { value: '1' },
        { value: '8' },
        { value: '-5' },
      ],
    },
    { key: 'duration', type: 'range', default: 400, min: 200, max: 800, step: 50 },
    { key: 'blink', type: 'toggle', default: true },
  ];

  // ---- the effect ----
  const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const OLD_NAMES = {
    Calcutta: 'Kolkata',
    Saigon: 'Ho Chi Minh City',
    Ho_Chi_Minh: 'Ho Chi Minh City',
    Kiev: 'Kyiv',
    Katmandu: 'Kathmandu',
    Rangoon: 'Yangon',
    Godthab: 'Nuuk',
    Asmera: 'Asmara',
    Faeroe: 'Faroe',
  };
  function cityOf(tz) {
    const m =
      /^(?:Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific)\/(?:[\w-]+\/)?([A-Za-z][\w-]*)$/.exec(
        tz || '',
      );
    return m ? OLD_NAMES[m[1]] || m[1].replace(/_/g, ' ') : '';
  }
  function placeOf(p) {
    const visitor = p.timeZone === 'visitor',
      tz = visitor ? new Intl.DateTimeFormat().resolvedOptions().timeZone : p.timeZone;
    return {
      city: p.city || cityOf(tz) || 'Local time',
      timeZone: tz || undefined,
      hours: p.hours || [9, 18],
      days: p.days || [1, 2, 3, 4, 5],
      visitor,
    };
  }
  function placeRoll(place, time) {
    return (
      '<span class="clock-roll"><span class="clock-face clock-face--time"><span class="clock-row"><i class="ck-dot clock-status"></i><span class="clock-city">' +
      place.city +
      '</span><span class="clock-zone"></span></span><span class="clock-time">' +
      time +
      '</span></span><span class="clock-face clock-face--contact" aria-hidden="true"><span class="clock-cta">Contact us<span class="ck-dot ck-solid clock-go"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></span></span></span>'
    );
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    element.classList.add('clock-stage');
    const cardOpt = options.card || null,
      place = cardOpt && options.place ? placeOf(options.place) : null;
    if (cardOpt) {
      const time =
        '<span class="clock-h">00</span><span class="clock-dot" aria-hidden="true">' +
        (cardOpt.dot ? cardOpt.dot() + cardOpt.dot() : '<i></i><i></i>') +
        '</span><span class="clock-m">00</span>';
      element.innerHTML = cardOpt.pill(place ? placeRoll(place, time) : time);
    }
    if (place) element.classList.add('has-place');
    else
      element.innerHTML =
        '<div class="clock-wrap"><button type="button" class="clock-pill" aria-pressed="false" aria-describedby="clock-help"><span class="clock-roll"><span class="clock-face clock-face--time"><span class="clock-label"><span>Local time</span><span class="clock-zone"></span></span><span class="clock-time"><span class="clock-h">00</span><span class="clock-dot" aria-hidden="true"><i></i><i></i></span><span class="clock-m">00</span></span><span class="clock-sub"><span class="clock-date"></span><span>Studio</span></span></span><span class="clock-face clock-face--contact" aria-hidden="true"><span class="clock-label"><span>Contact</span><span>Studio</span></span><span class="clock-cta">Say hello <b aria-hidden="true">→</b></span><span class="clock-sub"><span>studio@example.com</span><span>Reply &lt; 24h</span></span></span></span></button><p class="clock-caption" id="clock-help" data-cr-chrome>Hover or focus to show Contact · Click to pin</p></div><p class="cr-sr clock-live" aria-live="polite"></p><div class="clock-hand" aria-hidden="true"></div>';
    const pill = element.querySelector('.clock-pill'),
      hEl = element.querySelector('.clock-h'),
      mEl = element.querySelector('.clock-m'),
      zoneEl = element.querySelector('.clock-zone'),
      dateEl = element.querySelector('.clock-date'),
      live = element.querySelector('.clock-live'),
      hand = element.querySelector('.clock-hand'),
      statusEl = element.querySelector('.clock-status');
    const fmt = (tz) =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'shortOffset',
      });
    const offset = (p) => p.timeZoneName.replace('GMT', 'UTC').replace('-', '−');
    const placeClock = place && fmt(place.timeZone);
    let shownZone = null,
      shownClock = placeClock;
    function parts(f) {
      return Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
    }
    function shownFmt() {
      const z = api.params.zone,
        tz =
          z === 'place'
            ? place.timeZone
            : z === 'local'
              ? undefined
              : Number(z) === 0
                ? 'Etc/UTC'
                : 'Etc/GMT' + (Number(z) > 0 ? '-' : '+') + Math.abs(Number(z));
      if (z !== shownZone) {
        shownZone = z;
        shownClock = z === 'place' ? placeClock : fmt(tz);
      }
      return shownClock;
    }
    let timer = 0,
      hover = false,
      pinned = false,
      previewCycle = -1;
    function now() {
      if (cardOpt && cardOpt.time)
        return {
          h: cardOpt.time.h,
          m: cardOpt.time.m,
          date: '',
          day: cardOpt.time.day,
          zone: cardOpt.time.zone || (place ? offset(parts(shownFmt())) : ''),
        };
      if (place) {
        const p = parts(shownFmt()),
          q = shownClock === placeClock ? p : parts(placeClock);
        return {
          h: Number(p.hour),
          m: Number(p.minute),
          date: '',
          day: WEEK.indexOf(p.weekday),
          zone: offset(p),
          ph: Number(q.hour) % 24,
          pm: Number(q.minute),
          pday: WEEK.indexOf(q.weekday),
        };
      }
      const zone = api.params.zone,
        d = new Date();
      if (zone === 'local' || zone === 'place')
        return {
          h: d.getHours(),
          m: d.getMinutes(),
          date: d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }),
        };
      const t = new Date(d.getTime() + Number(zone) * 3600e3);
      return {
        h: t.getUTCHours(),
        m: t.getUTCMinutes(),
        date: t.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }),
      };
    }
    function zoneLabel() {
      const z = api.params.zone;
      if (z === 'local' || z === 'place') {
        const o = -new Date().getTimezoneOffset() / 60;
        return 'UTC' + (o === 0 ? '' : (o > 0 ? '+' : '−') + Math.abs(o));
      }
      const n = Number(z);
      return 'UTC' + (n === 0 ? '' : (n > 0 ? '+' : '−') + Math.abs(n));
    }
    function render() {
      const t = now(),
        h = String(t.h).padStart(2, '0'),
        m = String(t.m).padStart(2, '0');
      hEl.textContent = h;
      mEl.textContent = m;
      dateEl.textContent = t.date;
      if (place) {
        const ph = t.ph === undefined ? t.h : t.ph,
          pm = t.pm === undefined ? t.m : t.pm,
          pd = t.pday === undefined ? t.day : t.pday,
          at = ph + pm / 60,
          open = place.days.includes(pd) && at >= place.hours[0] && at < place.hours[1];
        zoneEl.textContent = t.zone;
        statusEl.toggleAttribute('data-accent', open);
        statusEl.toggleAttribute('data-weak', !open);
        pill.setAttribute(
          'aria-label',
          place.city +
            ' ' +
            h +
            ':' +
            m +
            ', ' +
            t.zone +
            '. ' +
            (place.visitor
              ? (open ? 'Within' : 'Outside') + ' working hours'
              : 'Studio ' + (open ? 'open' : 'closed')) +
            '. Contact us',
        );
        return;
      }
      zoneEl.textContent = zoneLabel();
      pill.setAttribute('aria-label', 'Local time ' + h + ':' + m + ', ' + zoneLabel() + '. Contact us');
    }
    function schedule() {
      clearTimeout(timer);
      if (api.destroyed) return;
      const wait = 60000 - (Date.now() % 60000) + 20;
      timer = setTimeout(() => {
        render();
        schedule();
      }, wait);
    }
    function sync() {
      const open = hover || pinned;
      element.classList.toggle('is-contact', open);
      pill.setAttribute('aria-pressed', String(pinned));
    }
    function apply() {
      element.style.setProperty('--roll', api.params.duration + 'ms');
      element.classList.toggle('no-blink', !api.params.blink);
      render();
    }
    api.listen(pill, 'pointerenter', (e) => {
      if (e.pointerType !== 'touch' && !api.paused) {
        hover = true;
        sync();
      }
    });
    api.listen(pill, 'pointerleave', (e) => {
      if (e.pointerType !== 'touch') {
        hover = false;
        sync();
      }
    });
    api.listen(pill, 'focus', () => {
      if (pill.matches(':focus-visible')) {
        hover = true;
        sync();
      }
    });
    api.listen(pill, 'blur', () => {
      hover = false;
      sync();
    });
    api.listen(pill, 'click', () => {
      if (api.paused) return;
      pinned = !pinned;
      sync();
      live.textContent = pinned ? 'Showing Contact.' : 'Showing local time.';
    });
    api.on('params', apply);
    api.on('replay', () => {
      hover = false;
      pinned = false;
      previewCycle = -1;
      sync();
      render();
    });
    api.on('visibility', (v) => {
      if (v) {
        render();
        schedule();
      }
    });
    api.cleanup(() => clearTimeout(timer));
    const live2 = !!(cardOpt && cardOpt.interactive);
    let handOff = false;
    function takeOver(on) {
      if (handOff) return;
      handOff = true;
      hover = !!on;
      pinned = false;
      sync();
      if (cardOpt.pointer) cardOpt.pointer({ x: 0, y: 0, opacity: 0 });
    }
    if (live2) {
      const real = (e) => e.pointerType !== 'touch' && pill.contains(e.target);
      api.listen(
        element,
        'pointermove',
        (e) => {
          if (!handOff && !(e.pointerType === 'mouse' && !e.movementX && !e.movementY)) takeOver(real(e));
        },
        true,
      );
      api.listen(element, 'pointerdown', (e) => takeOver(real(e)), true);
      api.listen(pill, 'focus', () => {
        if (pill.matches(':focus-visible')) takeOver(true);
      });
      api.listen(pill, 'click', () => {
        if (!api.paused && cardOpt.touched) cardOpt.touched();
      });
      api.restore = () => {
        takeOver(false);
        hover = false;
        pinned = false;
        sync();
        live.textContent = '';
      };
    }
    function handAt(t) {
      const s = element.getBoundingClientRect(),
        r = pill.getBoundingClientRect(),
        cx = r.left - s.left + r.width * (place ? 0.8 : 0.7),
        cy = r.top - s.top + r.height * 0.62,
        ox = cardOpt ? r.right - s.left + 24 : s.width * 0.82,
        oy = cardOpt ? r.bottom - s.top + 22 : s.height * 0.84;
      if (t < 0.8) return { x: ox, y: oy, o: 0 };
      if (t < 1.1) return { x: ox, y: oy, o: (t - 0.8) / 0.3 };
      if (t < 1.9) {
        const u = R.smooth((t - 1.1) / 0.8);
        return { x: R.mix(ox, cx, u), y: R.mix(oy, cy, u), o: 1 };
      }
      if (t < 4.6) return { x: cx + Math.sin((t - 1.9) * 1.4) * 4, y: cy, o: 1 };
      if (t < 5.4) {
        const u = R.smooth((t - 4.6) / 0.8);
        return { x: R.mix(cx, ox, u), y: R.mix(cy, oy, u), o: 1 };
      }
      return { x: ox, y: oy, o: Math.max(0, 1 - (t - 5.4) / 0.4) };
    }
    api.frame(({ time, reduced }) => {
      if (live2 && !handOff && cardOpt.once && time >= 8) takeOver(pill.matches(':hover'));
      if (live2 && handOff) return false;
      if (!options.preview || reduced) return false;
      const t = time % 8,
        c = Math.floor(time / 8);
      if (c !== previewCycle) {
        previewCycle = c;
        hover = false;
        pinned = false;
        sync();
      }
      const h = handAt(t);
      if (cardOpt) {
        if (cardOpt.pointer) cardOpt.pointer({ x: h.x, y: h.y, opacity: h.o });
      } else {
        hand.style.opacity = h.o.toFixed(3);
        hand.style.transform = 'translate3d(' + h.x.toFixed(1) + 'px,' + h.y.toFixed(1) + 'px,0)';
      }
      const over = t >= 1.8 && t < 4.75;
      if (over !== hover) {
        hover = over;
        sync();
      }
      return true;
    });
    apply();
    schedule();
    const status = api.status;
    api.status = () => ({
      ...status(),
      time: hEl.textContent + ':' + mEl.textContent,
      contact: element.classList.contains('is-contact'),
      pinned,
      blink: api.params.blink,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountLocalClockPill(element, options) {
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
    element.classList.add('local-clock-pill');
    element.innerHTML = '<div class="fx-board" data-clock></div>';
    const stage = element,
      board = stage.querySelector('[data-clock]'),
      cursor = createCursor(stage);
    const fit = () => Math.max(1, Math.min(1.625, (stage.clientWidth - 96) / 256, (stage.clientHeight * 0.4) / 132));
    const place = () => board.style.setProperty('--clock-k', fit().toFixed(4));
    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);
    const inst = mount(board, {
      params: options.params,
      preview: true,
      place: { timeZone: 'visitor', hours: [9, 18], days: [1, 2, 3, 4, 5] },
      card: {
        pill: (roll) =>
          '<button type="button" class="clock-pill ck-panel" data-size="lg" aria-pressed="false">' +
          roll +
          '<span class="clock-date" hidden></span></button><span class="clock-live" aria-live="polite"></span>',
        interactive: true,
        once: true,
        pointer: cursor.set,
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
  global.mountLocalClockPill = mountLocalClockPill;
  if (typeof module === 'object' && module.exports) module.exports = mountLocalClockPill;
})(typeof window !== 'undefined' ? window : this);
