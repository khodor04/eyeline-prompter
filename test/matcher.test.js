// Run with: npm test   (Node 18+, no dependencies)
const test = require('node:test');
const assert = require('node:assert');
const M = require('../matcher.js');

const SCRIPT = "Hey everyone, welcome back to the channel. Today I'm going to show you the 3 best ways to film yourself at home without spending a fortune. Let's get into it. The first way is to use natural light from a window, and the second way is to use a cheap ring light.";
const words = M.splitWords(SCRIPT);

// Feed spoken words one at a time, like interim speech results, and return the final position.
function follow(spoken) {
  let pos = 0;
  const heard = [];
  for (const w of M.splitWords(spoken)) {
    heard.push(w);
    const next = M.findNext(words, pos, heard.slice(-8));
    if (next > pos) pos = next;
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
