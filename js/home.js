import { play } from './player.js';

// Keys in vim notation; numbers are extra pauses (ms). One script is picked at random per page load.
// The test checks each ends at the text in index.html and that they all run for about the same time.
const BODY = 'I work on all sorts of software engineering from UI/UX, backends, and hardware.';
const NOW = 'Currently working on project one and project two.';
const END = ['gqG', ':wq<CR>'];

export const scripts = [
  [ // typos fixed after the fact
    400,
    "iI'm Byran<Esc>", 250, 'Fy', 'xp',                            // swap the transposed letters
    'o[linkedin.com/in/bryanz35]<Esc>',
    'o[github.com/bryanz53]<Esc>', 300, 'cT/bryanz35<Esc>', // retype the handle
    'oA Duke student with strong strong interests in AI, I work on all sorts of software ' +
      'engineering from UI/UX, backends, and hardwre<BS><BS>are.<Esc>',
    300, 'FA', 'ciwML<Esc>',                                         // AI -> ML
    'Fs', 'x',
    'Fg', 'daw',                                                     // drop the doubled word
    `A ${NOW}<Esc>`,
    ...END,
  ],
  [ // duplicate the linkedin line and edit the copy into the github one
    400,
    "iI'm Bryan<Esc>",
    'o[linkedin.com/in/bryanz35]<Esc>', 'dd', 'p', 'p',
    'l', 'ct/github.com<Esc>', 'f/', 'dt/',
    `oa Duke student with strong interest in ML, ${BODY} ` +
      'Currently working on project two and project one.<Esc>',
    300, '0', '~',                                                   // capitalise
    '$', 'b', 'cwtwo<Esc>', 'Fw', ';', 'ciwone<Esc>',                // swap the projects
    ...END,
  ],
  [ // links typed in the wrong order, then moved
    400,
    "iI'm Bryan<Esc>",
    'o[github.com/bryanz35]<Esc>',
    'o[linkedin.com/in/bryanz35]<Esc>', 300, 'dd', 'k', 'p', 'G',
    'oA duke student with strong interest in ML, I work on all sorts of software ' +
      'engineering from UX/UI, backends, and hardware.<Esc>',
    300, '0', 'w', '~',
    'fX', 'rI', 'fI', 'rX',                                          // UX/UI -> UI/UX
    `A ${NOW}<Esc>`,
    ...END,
  ],
  [ // missing pieces inserted, ending rewritten with C
    400,
    'iIm Bryan<Esc>', 250, '0', "a'<Esc>",
    'o[linkedin.com/bryanz35]<Esc>', 300, 'F/', 'i/in<Esc>',
    'o[github.com/bryanz35]<Esc>',
    `oA Duke student with strong interest in ML ${BODY} Currently building stuff.<Esc>`,
    400, 'Fb', 'Cworking on project one and project two.<Esc>',
    300, '0', 'fL', 'a,<Esc>',
    ...END,
  ],
  [ // paragraph first, the rest opened above it
    400,
    'iA duke student with strong intre<BS><BS>erest in ML, I work on all sorts of software ' +
      'engineering from UI/UX, backends, and hardwrae.<Esc>',
    300, 'Fr', 'xp', '0', 'w', '~',
    "OI'm Brian<Esc>", 250, 'Fi', 'ry',
    'o[linkedin.com/in/bryanz35]<Esc>',
    'o[github.com/bryan35]<Esc>', 300, 'F3', 'iz<Esc>',
    'G', `A ${NOW}<Esc>`,
    ...END,
  ],
  [ // too much typed, then deleted
    400,
    "iHello, I'm Bryan<Esc>", 250, '0', 'dtI',
    'o[linkedin.com/in/bryanz35]<Esc>',
    'o[github.com/in/bryanz35]<Esc>', 300, 'Fi', 'diw', 'x',
    'oA Duke student with strong interest in ml<Esc>', 'Fm', '~', '~',
    `A, ${BODY} Currently working on project one and and project two.<Esc>`,
    300, 'Fa', 'daw',
    ...END,
  ],
  [ // heading and paragraph first, links opened in between
    400,
    "iI'm bryan<Esc>", 250, 'Fb', '~',
    `oA student with big interest in ML, ${BODY} ` +
      'Currently working on project one and project two<Esc>',
    'O[linkedin.com/in/bryanz35]<Esc>',
    'o[github.con/bryanz35]<Esc>', 300, 'Fn', ';', 'rm',
    'G', 'w', 'iDuke <Esc>', 'fb', 'cwstrong<Esc>', 300, 'A.<Esc>',
    ...END,
  ],
];

if (globalThis.document) play(scripts[Math.floor(Math.random() * scripts.length)]);
