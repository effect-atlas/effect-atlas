/*
 * Rotating Arrow
 *
 * Use your own content, links and host styles. Mount with mountRotatingArrow(host, options). update(options) changes settings; destroy() restores the original content and releases listeners. The core inherits the host font and respects reduced motion. No dependencies or automatic demonstration input.
 *
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 */
(function(global){
'use strict';
/** Effect Atlas — Rotating Arrow. No dependencies.
 * new RotatingArrow(anchorOrButton, options). update(options), setActive(bool), destroy().
 * Keep your link href/click handler. Size is px, angle is degrees, durations are ms.
 * Core inherits the host font. Original DOM and attributes are restored on destroy.
 */
class RotatingArrow {
  constructor(root, options = {}) {
    this.root = root;
    this.original = { style: root.getAttribute('style'), class: root.getAttribute('class'), active: root.getAttribute('data-ea-active'), reduced: root.getAttribute('data-ea-reduced') };
    this.nodes = [...root.childNodes];
    this.controller = new AbortController();
    const label = document.createElement('span');
    label.className = 'ea-arrow-label';
    label.append(...this.nodes);
    const slot = document.createElement('span');
    slot.className = 'ea-arrow-slot';
    slot.setAttribute('aria-hidden', 'true');
    slot.innerHTML = '<span class="ea-arrow-mark"><svg viewBox="0 0 24 24" fill="none"><path d="M4 12h15M13 5l7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
    root.append(label, slot);
    root.classList.add('ea-rotating-arrow');
    this.options = { size: 32, angle: -90, enter: 1000, exit: 300, direction: 'right', color: '#4559ff', reducedMotion: false };
    this.update(options);
    const on = (name, fn) => root.addEventListener(name, fn, { signal: this.controller.signal });
    on('pointerenter', e => { if (e.pointerType !== 'touch') this.setActive(true); });
    on('pointerleave', () => this.setActive(root.matches(':focus-visible')));
    on('focus', () => this.setActive(true));
    on('blur', () => this.setActive(false));
    on('pointercancel', () => this.setActive(false));
    this.setActive(false);
  }
  setActive(active) { if (!this.dead) this.root.dataset.eaActive = String(active); }
  update(options = {}) {
    if (this.dead) return;
    Object.assign(this.options, options);
    const o = this.options;
    const vars = { size: `${Math.max(8, Number(o.size) || 32)}px`, angle: `${Number(o.angle) || 0}deg`, enter: `${Math.max(0, Number(o.enter) || 0)}ms`, exit: `${Math.max(0, Number(o.exit) || 0)}ms`, direction: `${({ right: 0, up: -90, diagonal: -45, left: 180 })[o.direction] ?? 0}deg`, color: o.color };
    Object.entries(vars).forEach(([key, value]) => this.root.style.setProperty(`--ea-arrow-${key}`, value));
    this.root.dataset.eaReduced = String(o.reducedMotion);
  }
  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.controller.abort();
    this.root.replaceChildren(...this.nodes);
    for (const [key, name] of Object.entries({ style: 'style', class: 'class', active: 'data-ea-active', reduced: 'data-ea-reduced' })) {
      this.original[key] == null ? this.root.removeAttribute(name) : this.root.setAttribute(name, this.original[key]);
    }
  }
}

global.mountRotatingArrow=function(root,options={}){return new RotatingArrow(root,options);};
})(window);
