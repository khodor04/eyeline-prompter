// Run with: npm test   (Node 18+, no dependencies)
const test = require('node:test');
const assert = require('node:assert');
const M = require('../matcher.js');

const SCRIPT = "Hey everyone, welcome back to the channel. Today I'm going to show you the 3 best ways to film yourself at home without spending a fortune. Let's get into it. The first way is to use natural light from a window, and the second way is to use a cheap ring light.";
const words = M.splitWords(SCRIPT);

// Feed spoken words one at a time, like interim speech results, and return the final position.
// Engines re-send the same partial result several times, so each word is matched twice.
// Like the app, the position can also move back when the speaker repeats earlier text.
function follow(spoken, script = words) {
  let pos = 0;
  const heard = [];
  for (const w of M.splitWords(spoken)) {
    heard.push(w);
    for (let r = 0; r < 2; r++) {
      const next = M.findNext(script, pos, heard.slice(-8));
      if (next >= 0) pos = next;
    }
  }
  return pos;
}

test('norm: case, punctuation, apostrophes, accents, numbers', () => {
  assert.strictEqual(M.norm('Hello,'), 'hello');
  assert.strictEqual(M.norm("Don't"), 'dont');
  assert.strictEqual(M.norm('Café'), 'cafe');
  assert.strictEqual(M.norm('3'), 'three');
  assert.strictEqual(M.norm('—'), '');
});

test('splitWords splits hyphenated tokens', () => {
  assert.deepStrictEqual(M.splitWords('well-known self/made'), ['well', 'known', 'self', 'made']);
});

test('sim tolerates partial and misheard words', () => {
  assert.ok(M.sim('beaut', 'beautiful'));
  assert.ok(M.sim('channel', 'channels'));
  assert.ok(!M.sim('the', 'a'));
});

test('follows an exact read to the end', () => {
  assert.strictEqual(follow(SCRIPT), words.length);
});

test('follows a read with misheard words, filler and small deviations', () => {
  const spoken = "hey every one welcome back to this channel today i'm gonna show you three best ways to film yourself at home without spending fortune let's get into it uh so the first way is use natural light from the window and the second way is to use a cheap ring light";
  assert.strictEqual(follow(spoken), words.length);
});

test('catches up after a skipped sentence', () => {
  const spoken = 'hey everyone welcome back to the channel lets get into it the first way is to use natural light';
  assert.strictEqual(words[follow(spoken) - 1], 'light');
  assert.ok(follow(spoken) > 30);
});

test('does not move on off-script words', () => {
  assert.strictEqual(follow('hey everyone welcome back um yeah banana pizza'), 4);
});

test('does not jump far ahead on a single common word', () => {
  // "the" appears many times ahead; on its own it must not cause a big jump
  assert.ok(follow('hey everyone the') <= 3);
});

test('supports Arabic (diacritics stripped)', () => {
  const ar = M.splitWords('مَرْحَبًا بِكُمْ فِي القناة');
  assert.strictEqual(M.findNext(ar, 0, M.splitWords('مرحبا بكم')), 2);
});

const REPEATS = M.splitWords('I want to tell you a story. I want to tell you why I started this channel. It started when I was young. I want to tell you everything.');

test('repeated phrases in the script: stays on the one being read', () => {
  assert.strictEqual(follow('I want to tell you a', REPEATS), 6);
  assert.strictEqual(follow('I want to tell you a story I want to tell you', REPEATS), 12);
  assert.strictEqual(follow(REPEATS.join(' '), REPEATS), REPEATS.length);
});

test('re-reading a sentence follows you back instead of jumping ahead', () => {
  const upToHome = words.indexOf('home') + 1;
  const sentence = 'today im going to show you the three best ways to film yourself at home';
  const first = 'hey everyone welcome back to the channel ' + sentence;
  assert.strictEqual(follow(first), upToHome);
  // repeat the sentence: half-way through, the highlight must be back inside it, not ahead
  const half = follow(first + ' today im going to show you');
  assert.ok(half < upToHome, 'moved back to the repeated words, got ' + half);
  assert.strictEqual(words[half - 1], 'you');
  // finish the repeat and carry on reading
  assert.strictEqual(follow(first + ' ' + sentence), upToHome);
  assert.strictEqual(words[follow(first + ' ' + sentence + ' without spending a fortune') - 1], 'fortune');
});

test('a single common word at the start never jumps', () => {
  assert.strictEqual(follow('the'), 0);
  assert.strictEqual(follow('a'), 0);
});

test('does not jump to a similar phrase further on when a word is misheard', () => {
  const S = M.splitWords('The first thing I learned is that you have to show up every day. The third thing I learned is that you have to tell a story.');
  // "show" heard, then a stray "a": must not leap to "...you have to tell a"
  const p = follow('the first thing i learned is that you have to show a', S);
  assert.ok(p <= 12, 'jumped to ' + p);
});
