// Plays a vim key script into the page's [data-vim] elements (buffer line i -> element i).
import { initial, feed, tokenize } from './vim.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const textOf = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const SKIP_EVENTS = ['keydown', 'pointerdown', 'wheel', 'touchstart'];

/** script: array of key strings (vim notation) and numbers (extra pause in ms). */
export async function play(script) {
  const root = document.documentElement;
  if (!root.classList.contains('js')) return; // reduced motion: page stays as authored

  const els = [...document.querySelectorAll('[data-vim]')];
  const html = els.map((el) => el.innerHTML);
  const targets = els.map(textOf);
  const keysBox = document.getElementById('keys');
  const main = els[0]?.closest('main');

  // 1.35x the authored timings; repeat visitors get a further 1.5x. Storage can throw (private mode, blocked site data).
  let speed = 1.35;
  try {
    if (localStorage.getItem('introSeen')) speed *= 1.5;
    localStorage.setItem('introSeen', '1');
  } catch {}
  const wait = (ms) => sleep(ms / speed);

  let s = initial();
  let skipped = false;
  const skip = () => { skipped = true; };
  SKIP_EVENTS.forEach((e) => addEventListener(e, skip, { passive: true }));

  const anchors = els.map((el) => [...el.querySelectorAll('a')]);
  const cursor = (ch) => {
    const cur = document.createElement('span');
    cur.className = s.mode === 'insert' ? 'cur ins' : 'cur';
    cur.textContent = !ch || ch === ' ' ? '\u00a0' : ch; // nbsp so the cursor keeps its width at line end
    return cur;
  };
  // Typed link text goes inside a copy of its <a>, so the page looks the same while typing as after.
  const render = () => els.forEach((el, i) => {
    const line = s.lines[i] ?? '';
    const col = i === s.row ? s.col : -1;
    const nodes = linkSpans(line, anchors[i].map(textOf)).map(([a, b, k]) => {
      const box = k < 0 ? document.createDocumentFragment() : anchors[i][k].cloneNode(false);
      if (col >= a && col < b) box.append(line.slice(a, col), cursor(line[col]), line.slice(col + 1, b));
      else box.append(line.slice(a, b));
      return box;
    });
    if (col >= line.length) nodes.push(cursor());
    el.replaceChildren(...nodes);
  });

  // main is vertically centred, so hold it at its finished height or it drifts up as lines get typed.
  await document.fonts.ready;
  if (main) main.style.minHeight = `${main.offsetHeight}px`;
  main?.setAttribute('aria-busy', 'true');
  root.classList.add('vim');
  render();

  try {
    run: for (const step of script) {
      if (typeof step === 'number') { await wait(step); continue; }
      for (const { label, keys } of tokenize(step)) {
        if (skipped) break run;
        const chip = keysBox && showChip(keysBox, label);
        for (const k of keys) {
          if (skipped) break;
          const typing = s.mode === 'insert' && k !== '<Esc>';
          s = feed(s, k);
          render();
          await wait(typing ? rand(18, 45) : 90);
        }
        if (chip) launch(chip);
        await wait(rand(250, 400));
      }
    }
    if (!skipped && s.lines.join('\n') !== targets.join('\n')) {
      console.error('vim intro ended at', s.lines, 'but the page says', targets);
    }
  } catch (err) {
    console.error(err);
  } finally {
    els.forEach((el, i) => { el.innerHTML = html[i]; });
    main?.removeAttribute('aria-busy');
    if (main) main.style.minHeight = '';
    SKIP_EVENTS.forEach((e) => removeEventListener(e, skip));
  }
}

function showChip(box, label) {
  const el = document.createElement('kbd');
  el.textContent = label;
  box.append(el);
  return el;
}

/** Throw the chip up and to the left; gravity brings it down. */
function launch(el) {
  const T = rand(0.9, 1.2), vx = rand(-320, -200), vy = rand(-650, -520), g = 1600, spin = rand(-120, -30);
  const N = 12;
  const frames = Array.from({ length: N + 1 }, (_, i) => {
    const t = (i / N) * T;
    return {
      transform: `translate(${vx * t}px, ${vy * t + (g * t * t) / 2}px) rotate(${(spin * i) / N}deg)`,
      opacity: i < 8 ? 1 : 1 - (i - 8) / (N - 8),
    };
  });
  el.animate(frames, { duration: T * 1000, fill: 'forwards' });
  setTimeout(() => el.remove(), T * 1000);
}

/** Split line into [start, end, linkIndex] spans; linkIndex is -1 for plain text. Links match in order. */
export function linkSpans(line, links) {
  const spans = [];
  let i = 0;
  links.forEach((t, k) => {
    const at = t ? line.indexOf(t, i) : -1;
    if (at < 0) return;
    spans.push([i, at, -1], [at, at + t.length, k]);
    i = at + t.length;
  });
  spans.push([i, line.length, -1]);
  return spans;
}
