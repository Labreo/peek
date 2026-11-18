// The card between chapters: what you just learned, the next chapter's name and its new rule.

import type { Chapter } from '../game/tuning';
import { esc, mount, q } from './mount';

export function showChapterCard(o: {
  index: number; total: number; chapter: Chapter; previousOutro: string | null; retry: boolean; onGo: () => void;
}) {
  const el = mount(`
    ${o.previousOutro ? `<p class="small" style="font-style:italic">${esc(o.previousOutro)}</p><hr style="border-color:#2a2622"/>` : ''}
    <p class="small">${o.retry ? 'Try again' : `Chapter ${o.index + 1} of ${o.total}`}</p>
    <h1>${esc(o.chapter.title)}</h1>
    <p>${esc(o.chapter.rule)}</p>
    <p class="small">${o.chapter.clues.length} messages to find. Then look at it and steady yourself.</p>
    <div class="row"><button class="primary" id="go">${o.retry ? 'Retry' : 'Enter'} <span class="kbd">Enter</span></button></div>
  `);
  q(el, '#go').onclick = o.onGo;
  return {};
}
