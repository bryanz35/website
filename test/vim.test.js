import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initial, feed, splitKeys, tokenize } from '../js/vim.js';
import { scripts } from '../js/home.js';

const run = (keys, s = initial()) => splitKeys(keys).reduce((st, k) => feed(st, k), s);
const text = (keys) => run(keys).lines.join('\n');

test('insert, escape, backspace, enter', () => {
  assert.equal(text('ihellp<BS>o<Esc>'), 'hello');
  assert.equal(text('iab<CR>cd<Esc>'), 'ab\ncd');
  assert.equal(text('iab<CR><BS>c<Esc>'), 'abc');
  assert.equal(text('ib<Esc>Ia<Esc>Ac<Esc>'), 'abc');
  assert.equal(text('ione<Esc>otwo<Esc>Ozero<Esc>'), 'one\nzero\ntwo');
});

test('x, p, r, ~', () => {
  assert.equal(text("iI'm Byran<Esc>Fyxp"), "I'm Bryan");
  assert.equal(text('icat<Esc>0rb'), 'bat');
  assert.equal(text('iabc<Esc>0~~'), 'ABc');
});

test('motions and finds', () => {
  const s = run('ifoo bar.baz qux<Esc>0w');
  assert.equal(s.col, 4);
  assert.equal(run('e', s).col, 6);
  assert.equal(run('w', s).col, 7);
  assert.equal(run('$b', s).col, 12);
  assert.equal(run('0fa;', s).col, 9);
  assert.equal(run('0fa;,', s).col, 5);
  assert.equal(run('0tq', s).col, 11);
});

test('operators', () => {
  assert.equal(text('ione two three<Esc>0dw'), 'two three');
  assert.equal(text('ione two three<Esc>0cwONE<Esc>'), 'ONE two three');
  assert.equal(text('ione two three<Esc>0wdaw'), 'one three');
  assert.equal(text('ihello AI there<Esc>FAciwML<Esc>'), 'hello ML there');
  assert.equal(text('ia.com/bryanz53]<Esc>cT/bryanz35<Esc>'), 'a.com/bryanz35]');
  assert.equal(text('ione two<Esc>0wD'), 'one ');
  assert.equal(text('ione two<Esc>0wCx<Esc>'), 'one x');
  assert.equal(text('ia<CR>b<CR>c<Esc>ggddp'), 'b\na\nc');
  assert.equal(text('ia<CR>b<Esc>dk'), '');
  assert.equal(text('iab<Esc>gqG'), 'ab');
});

test('unsupported keys throw', () => {
  assert.throws(() => run('Q'), /unsupported/);
  assert.throws(() => run(':q<CR>'), /unsupported/);
  assert.throws(() => tokenize('dz'), /unsupported/);
  assert.throws(() => tokenize('f'), /incomplete/);
});

test('tokenize groups insert text with its command', () => {
  const cmds = tokenize('iab<Esc>FyxpciwML<Esc>gqG:wq<CR>');
  assert.deepEqual(cmds.map((c) => c.label), ['i', 'Fy', 'x', 'p', 'ciw', 'gqG', ':wq']);
  assert.deepEqual(cmds[4].keys, splitKeys('ciwML<Esc>'));
});

test('every home script ends at the text in index.html', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const targets = [...html.matchAll(/<(\w+)[^>]*\bdata-vim\b[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((m) => m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  assert.equal(targets.length, 4);
  assert.equal(scripts.length, 7);

  // Mean play time, mirroring the waits in player.js: 18-45ms per typed key, 90ms otherwise, 250-400ms per command.
  const times = scripts.map((script, n) => {
    let s = initial(), ms = 0;
    for (const step of script) {
      if (typeof step !== 'string') { ms += step; continue; }
      for (const { keys } of tokenize(step)) {
        for (const k of keys) {
          ms += s.mode === 'insert' && k !== '<Esc>' ? 31.5 : 90;
          s = feed(s, k);
        }
        ms += 325;
      }
    }
    assert.deepEqual(s.lines, targets, `script ${n}`);
    assert.equal(s.mode, 'normal', `script ${n}`);
    assert.ok(s.done, `script ${n} should end with :wq`);
    return ms;
  });
  const mean = times.reduce((a, b) => a + b) / times.length;
  times.forEach((ms, n) => assert.ok(Math.abs(ms - mean) < mean * 0.1, `script ${n} runs ${ms}ms, mean is ${mean}ms`));
});

test('linkSpans wraps only fully typed link text', async () => {
  const { linkSpans } = await import('../js/player.js');
  assert.deepEqual(linkSpans('[gh.com/x]', ['gh.com/x']), [[0, 1, -1], [1, 9, 0], [9, 10, -1]]);
  assert.deepEqual(linkSpans('[gh.co', ['gh.com/x']), [[0, 6, -1]]);
  assert.deepEqual(linkSpans('on one and two', ['one', 'two']),
    [[0, 3, -1], [3, 6, 0], [6, 11, -1], [11, 14, 1], [14, 14, -1]]);
});
