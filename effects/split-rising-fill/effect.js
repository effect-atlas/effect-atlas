/*
 * Split Rising Fill
 *
 * Use your own content, links and host styles. Mount with mountSplitFill(host, options). update(options) changes settings; destroy() restores the original content and releases listeners. The core inherits the host font and respects reduced motion. No dependencies or automatic demonstration input.
 *
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 */
(function(global){
'use strict';
/** Effect Atlas — Split Rising Fill. No dependencies.
 * new SplitFill(buttonOrAnchor, {color, ink, base, text, duration, radius, height, arrow}).
 * update(options), setActive(bool), destroy(). Replace the host label freely before mount.
 * Duration is ms; radius/height are px. Host font, href and click behavior are preserved.
 */
class SplitFill {
  constructor(root, options = {}) {
    this.root = root;
    this.original = Object.fromEntries(['style','class','data-ea-active','data-ea-reduced','data-ea-arrow'].map(k => [k, root.getAttribute(k)]));
    this.nodes = [...root.childNodes];
    this.controller = new AbortController();
    const piece = document.createElement('span');
    piece.className = 'ea-fill-piece';
    const label = document.createElement('span');
    label.className = 'ea-fill-label';
    label.append(...this.nodes);
    piece.append(label);
    const arrow = document.createElement('span');
    arrow.className = 'ea-fill-piece ea-fill-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 12h15M13 5l7 7-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    root.append(piece, arrow);
    root.classList.add('ea-split-fill');
    this.options = { color: '#4559ff', ink: '#fff', base: '#fff', text: '#24262e', duration: 700, radius: 9, height: 54, arrow: true, reducedMotion: false };
    this.update(options);
    const on = (name, fn) => root.addEventListener(name, fn, { signal: this.controller.signal });
    on('pointerenter', e => { if (e.pointerType !== 'touch') this.setActive(true); });
    on('pointerleave', () => this.setActive(root.matches(':focus-visible')));
    on('focus', () => this.setActive(true));
    on('blur', () => this.setActive(false));
    on('pointerdown', e => { if (e.pointerType === 'touch') this.setActive(true); });
    on('pointerup', e => { if (e.pointerType === 'touch') this.setActive(false); });
    on('pointercancel', () => this.setActive(false));
    this.setActive(false);
  }
  setActive(active) { if (!this.dead) this.root.dataset.eaActive = String(active); }
  update(options = {}) {
    if (this.dead) return;
    Object.assign(this.options, options);
    const o = this.options;
    for (const key of ['color','ink','base','text']) this.root.style.setProperty(`--ea-fill-${key}`, o[key]);
    for (const key of ['duration','radius','height']) this.root.style.setProperty(`--ea-fill-${key}`, `${Math.max(0, Number(o[key]) || 0)}${key === 'duration' ? 'ms' : 'px'}`);
    this.root.dataset.eaArrow = String(o.arrow);
    this.root.dataset.eaReduced = String(o.reducedMotion);
  }
  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.controller.abort();
    this.root.replaceChildren(...this.nodes);
    for (const [key,value] of Object.entries(this.original)) value == null ? this.root.removeAttribute(key) : this.root.setAttribute(key,value);
  }
}

global.mountSplitFill=function(root,options={}){return new SplitFill(root,options);};
})(window);
