/*
 * Corner Expanding Menu
 *
 * Use your own content, links and host styles. Mount with mountCornerMenu(host, options). update(options) changes settings; destroy() restores the original content and releases listeners. The core inherits the host font and respects reduced motion. No dependencies or automatic demonstration input.
 *
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 */
(function(global){
'use strict';
/** Effect Atlas — Corner Expanding Menu. No dependencies.
 * Host markup: positioned container > root > nav > ordinary links/buttons.
 * new CornerMenu(root, {width:228, speed:1, anchor:'right', inset:24, accent:'#4559ff'}).
 * open(), close({focus:false}), update(options), destroy(). Speed scales the animation timing.
 * Hover opens; click pins; outside click/Escape/focus exit closes. Links keep native behavior.
 * Optional openLabel/closeLabel override the accessible trigger text for localization.
 */
let instanceId = 0;
const clamp = n => Math.max(0, Math.min(1, n));
const expo = n => n === 1 ? 1 : 1 - 2 ** (-10 * n);

class CornerMenu {
  constructor(root, options = {}) {
    this.root = root;
    this.nodes = [...root.childNodes];
    this.original = Object.fromEntries(['style','class','data-ea-anchor','data-ea-open'].map(k => [k, root.getAttribute(k)]));
    this.controller = new AbortController();
    this.options = { width: 228, speed: 1, anchor: 'right', inset: 24, accent: '#4559ff', surface: '#fff', ink: '#17181a', reducedMotion: false, label: 'Menu' };
    this.time = 0;
    this.barValues = [0,0];
    this.frame = 0;
    this.opened = false;
    this.mode = null;
    const panel = this.panel = document.createElement('div');
    panel.className = 'ea-menu-panel';
    const content = this.content = document.createElement('div');
    content.className = 'ea-menu-content';
    content.id = `ea-corner-content-${++instanceId}`;
    content.append(...this.nodes);
    panel.append(content);
    const trigger = this.trigger = document.createElement('button');
    trigger.className = 'ea-menu-trigger';
    trigger.type = 'button';
    trigger.setAttribute('aria-controls', content.id);
    trigger.innerHTML = '<span class="ea-menu-bars" aria-hidden="true"><span class="ea-menu-bar"></span><span class="ea-menu-bar"></span></span><svg class="ea-menu-close" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 3 10 10M13 3 3 13" stroke="currentColor" stroke-width="1.4"/></svg>';
    this.bars = [...trigger.querySelectorAll('.ea-menu-bar')];
    this.cross = trigger.querySelector('.ea-menu-close');
    this.items = [...content.querySelectorAll('a,button')];
    this.itemOriginals = this.items.map(el => el.getAttribute('class'));
    this.rows = this.items.map(item => {
      const row = document.createElement('div');
      row.className = 'ea-menu-row';
      item.before(row);
      row.append(item);
      item.classList.add('ea-menu-item');
      return row;
    });
    root.append(trigger, panel);
    root.classList.add('ea-corner-menu');
    this.media = matchMedia('(prefers-reduced-motion: reduce)');
    const on = (target, event, fn, opts = {}) => target.addEventListener(event, fn, { ...opts, signal: this.controller.signal });
    on(root, 'pointerenter', e => { if (e.pointerType !== 'touch' && this.mode !== 'click') { this.mode = 'hover'; this.open(); } });
    on(root, 'pointerleave', () => { if (this.mode !== 'click' && !content.contains(document.activeElement)) this.close(); });
    on(root, 'pointercancel', () => { if (this.mode !== 'click') this.close(); });
    on(trigger, 'click', e => {
      if (e.detail > 0 && this.mode === 'hover') { this.mode = 'click'; this.open(); }
      else if (this.opened) this.close();
      else { this.mode = 'click'; this.open(); }
    });
    on(root, 'keydown', e => {
      if (e.key === 'Escape' && this.opened) { e.preventDefault(); this.close({ focus: true }); }
      if (e.key === 'ArrowDown' && e.target === trigger) { e.preventDefault(); this.mode = 'click'; this.open(); this.items[0]?.focus({preventScroll:true}); }
    });
    on(root, 'focusout', e => { if (!root.contains(e.relatedTarget)) this.close(); });
    on(document, 'pointerdown', e => { if (!root.contains(e.target)) this.close(); });
    on(content, 'click', e => { if (e.target.closest('a,button')) this.close({ focus: true }); });
    on(this.media, 'change', () => this.update());
    on(document, 'visibilitychange', () => { if (document.hidden) this.settle(); });
    this.observer = new ResizeObserver(() => { if (!this.dead) { this.measure(); this.render(); } });
    this.update(options);
    this.observer.observe(root.parentElement);
    this.observer.observe(content);
  }
  get reduced() { return this.options.reducedMotion || this.media.matches; }
  measure() {
    const available = Math.max(60, this.root.parentElement.clientWidth - this.options.inset * 2);
    this.width = Math.min(Math.max(60, Number(this.options.width) || 228), available);
    this.root.style.setProperty('--ea-menu-max-height', `${Math.max(106, this.root.parentElement.clientHeight - this.options.inset * 2)}px`);
    this.content.style.width = `${this.width}px`;
    this.height = this.content.offsetHeight;
    this.duration = Math.max(600, 150 + Math.max(0,this.items.length - 1) * 25 + 650);
  }
  update(options = {}) {
    if (this.dead) return;
    Object.assign(this.options, options);
    this.options.speed = Math.max(.2, Number(this.options.speed) || 1);
    this.options.inset = Math.max(0, Number(this.options.inset) || 0);
    this.root.dataset.eaAnchor = this.options.anchor;
    this.root.style.setProperty('--ea-menu-inset', `${this.options.inset}px`);
    this.root.style.setProperty('--ea-menu-accent', this.options.accent);
    this.root.style.setProperty('--ea-menu-surface', this.options.surface);
    this.root.style.setProperty('--ea-menu-ink', this.options.ink);
    this.measure();
    this.sync();
    this.reduced ? this.settle() : this.render();
  }
  sync() {
    this.trigger.setAttribute('aria-expanded', String(this.opened));
    this.trigger.setAttribute('aria-label', (this.opened ? this.options.closeLabel : this.options.openLabel) ?? `${this.opened ? 'Close' : 'Open'} ${this.options.label}`);
    this.content.inert = !this.opened;
    this.content.setAttribute('aria-hidden', String(!this.opened));
    this.root.dataset.eaOpen = String(this.opened);
    this.rows.forEach(row => { row.style.visibility = this.opened || this.time > 0 ? 'visible' : 'hidden'; });
  }
  open() {
    if (this.dead || this.opened) return;
    this.opened = true;
    this.delay = this.time === 0 ? 150 : 0;
    this.barAnimation = { from: [...this.barValues], to: 1, elapsed: 0, duration: 750 };
    this.sync();
    this.reduced ? this.settle() : this.start();
  }
  close({focus = false} = {}) {
    if (this.dead || !this.opened) return;
    if (focus || this.content.contains(document.activeElement)) this.trigger.focus({preventScroll:true});
    this.opened = false;
    this.mode = null;
    this.delay = 0;
    this.barAnimation = null;
    this.sync();
    this.reduced ? this.settle() : this.start();
  }
  start() {
    if (this.frame) return;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(t => this.tick(t));
  }
  tick(now) {
    this.frame = 0;
    if (this.dead) return;
    const dt = Math.min(64, now - this.lastTime) * this.options.speed;
    this.lastTime = now;
    if (this.opened) {
      const usedDelay = Math.min(this.delay || 0, dt);
      this.delay -= usedDelay;
      this.time = Math.min(this.duration, this.time + dt - usedDelay);
    } else {
      this.time = Math.max(0, this.time - dt * 1.7);
      if (this.time === 0 && !this.barAnimation && this.barValues.some(v => v > 0)) this.barAnimation = { from: [...this.barValues], to: 0, elapsed: 0, duration: 200 };
    }
    if (this.barAnimation) {
      const b = this.barAnimation;
      b.elapsed += dt;
      this.barValues = b.from.map((v,i) => v + (b.to - v) * expo(clamp((b.elapsed - i * 80) / b.duration)));
      if (b.elapsed >= b.duration + 80) this.barAnimation = null;
    }
    this.render();
    if (this.barAnimation || this.time !== (this.opened ? this.duration : 0)) this.frame = requestAnimationFrame(t => this.tick(t));
  }
  render() {
    const p = expo(clamp(this.time / this.duration));
    this.root.style.width = `${60 + (this.width - 60) * p}px`;
    this.root.style.height = `${40 + (this.height - 40) * p}px`;
    this.panel.style.borderRadius = `${10 + 6 * p}px`;
    this.rows.forEach((row,i) => {
      const t = expo(clamp((this.time - 150 - i * 25) / 650));
      row.style.transform = `translateX(${(1-t)*40}px)`;
      row.style.visibility = this.opened || this.time > 0 ? 'visible' : 'hidden';
    });
    this.bars.forEach((bar,i) => { bar.style.transform = `translateX(${-this.width * this.barValues[i]}px)`; });
    this.cross.style.opacity = String(clamp((this.time / this.duration - .6) / .4));
  }
  settle() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.barAnimation = null;
    this.time = this.opened ? this.duration : 0;
    this.barValues = [Number(this.opened), Number(this.opened)];
    this.render();
  }
  destroy() {
    if (this.dead) return;
    this.dead = true;
    cancelAnimationFrame(this.frame);
    this.controller.abort();
    this.observer.disconnect();
    this.items.forEach((item,i) => {
      this.rows[i].replaceWith(item);
      const value = this.itemOriginals[i];
      value == null ? item.removeAttribute('class') : item.setAttribute('class',value);
    });
    this.root.replaceChildren(...this.nodes);
    for (const [key,value] of Object.entries(this.original)) value == null ? this.root.removeAttribute(key) : this.root.setAttribute(key,value);
  }
}

global.mountCornerMenu=function(root,options={}){return new CornerMenu(root,options);};
})(window);
