// Tiny helpers for DOM screens drawn over the 3D scene.

const root = () => document.getElementById('screen')!;

export function mount(html: string): HTMLElement {
  const r = root();
  r.innerHTML = `<div class="card">${html}</div>`;
  const first = r.querySelector<HTMLElement>('button.primary');
  first?.focus();
  return r.firstElementChild as HTMLElement;
}

export function clear() {
  root().innerHTML = '';
}

export function q<T extends HTMLElement = HTMLElement>(el: HTMLElement, sel: string): T {
  return el.querySelector<T>(sel)!;
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
