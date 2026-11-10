// Tiny vim emulator: only the subset the intro scripts use. Pure functions, no DOM.
// Unsupported keys throw, so a typo in a script fails `npm test` instead of playing wrong.

/** "iab<Esc>x" -> ["i","a","b","<Esc>","x"] */
export const splitKeys = (s) => s.match(/<(?:Esc|CR|BS)>|[\s\S]/g) ?? [];

export const initial = () => ({
  lines: [''], row: 0, col: 0, mode: 'normal',
  pending: [], register: null, lastFind: null, done: false,
});

const MOTIONS = 'hl0^$wbejkG;,';
const cls = (c) => (c === undefined || /\s/.test(c) ? 0 : /\w/.test(c) ? 2 : 1);
const firstNonBlank = (l) => Math.max(0, l.search(/\S/));
const bad = (p) => { throw new Error(`vim: unsupported keys "${p.join('')}"`); };

function parseMotion(p) {
  const [k, a] = p;
  if (k === undefined) return null;
  if (MOTIONS.includes(k)) return { motion: k };
  if ('fFtT'.includes(k) && k.length === 1) return a === undefined ? null : { motion: k, char: a };
  if (k === 'g') return a === undefined ? null : a === 'g' ? { motion: 'gg' } : bad(p);
  return bad(p);
}

/** Pending normal-mode keys -> command, or null if more keys are needed. */
export function parse(p) {
  const k = p[0];
  if (k === '<Esc>') return { op: 'noop' };
  if (k.length === 1 && 'iaIAoOC'.includes(k)) return { op: k, insert: true };
  if (k.length === 1 && 'xpD~'.includes(k)) return { op: k };
  if (k === 'r') return p.length < 2 ? null : { op: 'r', char: p[1] };
  if (k === ':') {
    const end = p.indexOf('<CR>');
    return end < 0 ? null : { op: ':', text: p.slice(1, end).join('') };
  }
  if (k === 'd' || k === 'c' || (k === 'g' && p[1] === 'q')) {
    const op = k === 'g' ? 'gq' : k;
    const rest = p.slice(op.length);
    const extra = { op, insert: op === 'c' };
    if (!rest.length) return null;
    if (rest[0] === op.at(-1)) return { ...extra, linewise: true }; // dd cc gqq
    if (rest[0] === 'i' || rest[0] === 'a') {
      if (rest.length < 2) return null;
      return rest[1] === 'w' ? { ...extra, obj: rest[0] } : bad(p);
    }
    const m = parseMotion(rest);
    return m && { ...extra, ...m };
  }
  const m = parseMotion(p);
  return m && { op: 'move', ...m };
}

const FLIP = { f: 'F', F: 'f', t: 'T', T: 't' };

function find(s, motion, ch) {
  const line = s.lines[s.row], { row, col } = s;
  if (motion === 'f' || motion === 't') {
    const i = line.indexOf(ch, col + 1);
    return i < 0 ? null : { row, col: motion === 'f' ? i : i - 1, inclusive: true };
  }
  const i = col > 0 ? line.lastIndexOf(ch, col - 1) : -1;
  return i < 0 ? null : { row, col: motion === 'F' ? i : i + 1 };
}

/** Where a motion lands: { row, col, inclusive?, linewise? }, or null if it fails. */
function target(s, m) {
  const line = s.lines[s.row], { row, col } = s, len = line.length;
  switch (m.motion) {
    case 'h': return { row, col: Math.max(0, col - 1) };
    case 'l': return { row, col: Math.min(len, col + 1) };
    case '0': return { row, col: 0 };
    case '^': return { row, col: firstNonBlank(line) };
    case '$': return { row, col: Math.max(0, len - 1), inclusive: true };
    case 'w': {
      let i = col;
      const c = cls(line[i]);
      if (c) while (i < len && cls(line[i]) === c) i++;
      while (i < len && !cls(line[i])) i++;
      if (i >= len && row < s.lines.length - 1) return { row: row + 1, col: firstNonBlank(s.lines[row + 1]) };
      return { row, col: i };
    }
    case 'e': {
      let i = col + 1;
      while (i < len && !cls(line[i])) i++;
      const c = cls(line[i]);
      while (i + 1 < len && cls(line[i + 1]) === c) i++;
      return { row, col: Math.min(i, Math.max(0, len - 1)), inclusive: true };
    }
    case 'b': {
      let i = col - 1;
      while (i > 0 && !cls(line[i])) i--;
      const c = cls(line[i]);
      while (i > 0 && cls(line[i - 1]) === c) i--;
      return { row, col: Math.max(0, i) };
    }
    case 'j': case 'k': {
      const r = row + (m.motion === 'j' ? 1 : -1);
      if (r < 0 || r >= s.lines.length) return null;
      return { row: r, col, linewise: true };
    }
    case 'gg': case 'G': {
      const r = m.motion === 'gg' ? 0 : s.lines.length - 1;
      return { row: r, col: firstNonBlank(s.lines[r]), linewise: true };
    }
    case ';': case ',': {
      const f = s.lastFind;
      return f && find(s, m.motion === ';' ? f.motion : FLIP[f.motion], f.char);
    }
    default: return find(s, m.motion, m.char);
  }
}

/** Inclusive [start, end] of the word (or whitespace run) under col; `around` adds surrounding space. */
function wordObj(line, col, around) {
  const c = cls(line[col]);
  let a = col, b = col;
  while (a > 0 && cls(line[a - 1]) === c) a--;
  while (b < line.length - 1 && cls(line[b + 1]) === c) b++;
  if (around && c) {
    if (b + 1 < line.length && !cls(line[b + 1])) while (b + 1 < line.length && !cls(line[b + 1])) b++;
    else while (a > 0 && !cls(line[a - 1])) a--;
  }
  return [a, b];
}

function operate(s, cmd) {
  const line = s.lines[s.row];
  let r0, r1, c0, c1; // linewise rows [r0, r1], or charwise columns [c0, c1) on the cursor row

  if (cmd.linewise) [r0, r1] = [s.row, s.row];
  else if (cmd.obj) { const [a, b] = wordObj(line, s.col, cmd.obj === 'a'); [c0, c1] = [a, b + 1]; }
  else if (cmd.op === 'c' && cmd.motion === 'w' && cls(line[s.col])) {
    [c0, c1] = [s.col, wordObj(line, s.col, false)[1] + 1]; // cw changes to end of word, like ce
  } else {
    const t = target(s, cmd);
    if (!t) return;
    if (cmd.char) s.lastFind = { motion: cmd.motion, char: cmd.char };
    if (t.linewise) [r0, r1] = [Math.min(s.row, t.row), Math.max(s.row, t.row)];
    else if (t.row !== s.row) [c0, c1] = [s.col, line.length]; // w at end of line stops at the line end
    else [c0, c1] = [Math.min(s.col, t.col), Math.max(s.col, t.col) + (t.inclusive ? 1 : 0)];
  }

  if (cmd.op === 'gq') return; // reflow: the browser already wraps text

  if (r0 !== undefined) {
    s.register = { text: s.lines.slice(r0, r1 + 1), linewise: true };
    if (cmd.op === 'c') {
      s.lines.splice(r0, r1 - r0 + 1, '');
      Object.assign(s, { row: r0, col: 0, mode: 'insert' });
    } else {
      s.lines.splice(r0, r1 - r0 + 1);
      if (!s.lines.length) s.lines.push('');
      s.row = Math.min(r0, s.lines.length - 1);
      s.col = firstNonBlank(s.lines[s.row]);
    }
    return;
  }

  s.register = { text: line.slice(c0, c1), linewise: false };
  s.lines[s.row] = line.slice(0, c0) + line.slice(c1);
  s.col = c0;
  if (cmd.op === 'c') s.mode = 'insert';
}

function exec(s, cmd) {
  const line = s.lines[s.row];
  switch (cmd.op) {
    case 'noop': break;
    case 'move': {
      const t = target(s, cmd);
      if (!t) break;
      if (cmd.char) s.lastFind = { motion: cmd.motion, char: cmd.char };
      s.row = t.row;
      s.col = t.col;
      break;
    }
    case 'i': s.mode = 'insert'; break;
    case 'a': s.mode = 'insert'; s.col = Math.min(s.col + 1, line.length); break;
    case 'I': s.mode = 'insert'; s.col = firstNonBlank(line); break;
    case 'A': s.mode = 'insert'; s.col = line.length; break;
    case 'o': s.lines.splice(s.row + 1, 0, ''); Object.assign(s, { row: s.row + 1, col: 0, mode: 'insert' }); break;
    case 'O': s.lines.splice(s.row, 0, ''); Object.assign(s, { col: 0, mode: 'insert' }); break;
    case 'C': operate(s, { op: 'c', motion: '$' }); break;
    case 'D': operate(s, { op: 'd', motion: '$' }); break;
    case 'x':
      if (!line) break;
      s.register = { text: line[s.col], linewise: false };
      s.lines[s.row] = line.slice(0, s.col) + line.slice(s.col + 1);
      break;
    case 'p': {
      const reg = s.register;
      if (!reg) break;
      if (reg.linewise) {
        s.lines.splice(s.row + 1, 0, ...reg.text);
        s.row++;
        s.col = firstNonBlank(s.lines[s.row]);
      } else {
        const at = line ? s.col + 1 : 0;
        s.lines[s.row] = line.slice(0, at) + reg.text + line.slice(at);
        s.col = at + reg.text.length - 1;
      }
      break;
    }
    case 'r':
      if (line) s.lines[s.row] = line.slice(0, s.col) + cmd.char + line.slice(s.col + 1);
      break;
    case '~': {
      const ch = line[s.col];
      if (ch === undefined) break;
      const flipped = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
      s.lines[s.row] = line.slice(0, s.col) + flipped + line.slice(s.col + 1);
      s.col++;
      break;
    }
    case ':':
      if (cmd.text !== 'wq') bad([':', cmd.text]);
      s.done = true;
      break;
    default: operate(s, cmd);
  }
}

function insertKey(s, key) {
  const line = s.lines[s.row];
  if (key === '<Esc>') {
    s.mode = 'normal';
    s.col = Math.max(0, s.col - 1);
  } else if (key === '<BS>') {
    if (s.col > 0) {
      s.lines[s.row] = line.slice(0, s.col - 1) + line.slice(s.col);
      s.col--;
    } else if (s.row > 0) {
      s.col = s.lines[s.row - 1].length;
      s.lines[s.row - 1] += line;
      s.lines.splice(s.row, 1);
      s.row--;
    }
  } else if (key === '<CR>') {
    s.lines.splice(s.row, 1, line.slice(0, s.col), line.slice(s.col));
    s.row++;
    s.col = 0;
  } else {
    s.lines[s.row] = line.slice(0, s.col) + key + line.slice(s.col);
    s.col++;
  }
}

/** Feed one key; returns the next state (the input state is not modified). */
export function feed(state, key) {
  const s = { ...state, lines: [...state.lines] };
  if (s.mode === 'insert') {
    insertKey(s, key);
    return s;
  }
  const pending = [...s.pending, key];
  const cmd = parse(pending);
  if (!cmd) return { ...s, pending };
  s.pending = [];
  exec(s, cmd);
  if (s.mode === 'normal') s.col = Math.min(s.col, Math.max(0, s.lines[s.row].length - 1));
  return s;
}

/**
 * Split a key string into commands: [{ label, keys }]. One command = one chip on screen.
 * Text typed in insert mode belongs to the command that entered insert mode (label "ciw", not "ciwML<Esc>").
 */
export function tokenize(str) {
  const cmds = [];
  let pending = [], inserting = null;
  for (const k of splitKeys(str)) {
    if (inserting) {
      inserting.keys.push(k);
      if (k === '<Esc>') inserting = null;
      continue;
    }
    pending.push(k);
    const cmd = parse(pending);
    if (!cmd) continue;
    const c = { label: pending.join('').replace('<CR>', ''), keys: pending };
    cmds.push(c);
    pending = [];
    if (cmd.insert) inserting = c;
  }
  if (pending.length) throw new Error(`vim: incomplete command "${pending.join('')}"`);
  return cmds;
}
