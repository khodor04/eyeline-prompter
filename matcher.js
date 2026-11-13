// Speech -> script alignment. Pure functions, no DOM (testable in Node).
(function (root) {
  'use strict';

  const NUM = {
    0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven',
    8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen',
    15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen', 20: 'twenty',
    30: 'thirty', 40: 'forty', 50: 'fifty', 60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety',
    100: 'hundred',
  };
  // Latin combining accents + Arabic harakat/tatweel
  const MARKS = /[̀-ًͯ-ٰٟـ]/g;

  function norm(token) {
    let s = String(token).toLowerCase().normalize('NFD').replace(MARKS, '')
      .replace(/[’'`]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
    if (/^\d+$/.test(s) && NUM[+s]) s = NUM[+s];
    return s;
  }

  // Split a display token / transcript into normalized words ("well-known" -> well, known)
  function splitWords(text) {
    return String(text).split(/[\s\-–—\/]+/).map(norm).filter(Boolean);
  }

  function lev(a, b) {
    const m = a.length, n = b.length;
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }

  // Are two normalized words "the same" (tolerant to recognition errors)?
  function sim(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    // interim partials ("beaut" -> "beautiful"), plurals, etc.
    if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
    const L = Math.max(a.length, b.length);
    if (L < 4) return false;
    return lev(a, b) <= (L >= 8 ? 2 : 1);
  }

  // Longest common subsequence length using fuzzy equality
  function lcs(a, b) {
    const dp = new Array(b.length + 1).fill(0);
    for (const x of a) {
      let prev = 0;
      for (let k = 1; k <= b.length; k++) {
        const tmp = dp[k];
        dp[k] = sim(x, b[k - 1]) ? prev + 1 : Math.max(dp[k], dp[k - 1]);
        prev = tmp;
      }
    }
    return dp[b.length];
  }

  // Short words ("the", "to", "a") are everywhere, so they're weaker evidence.
  const weight = w => (w.length >= 4 ? 1 : 0.6);

  /**
   * How well do the last words heard line up with the script *ending at* words[j]?
   * Walks backwards through both, word by word, so the evidence has to be the same
   * words in the same order right next to each other — not a few common words
   * scattered over a paragraph. Tolerates a skipped, extra or misheard word (≤2).
   */
  function suffixScore(tail, words, j) {
    let t = tail.length - 2, w = j - 1, skips = 0;
    let score = weight(words[j]);
    while (t >= 0 && w >= 0) {
      if (sim(tail[t], words[w])) { score += weight(words[w]); t--; w--; continue; }
      if (++skips > 2) break;
      if (w >= 1 && sim(tail[t], words[w - 1])) w--;          // reader skipped a script word
      else if (t >= 1 && sim(tail[t - 1], words[w])) t--;     // extra / repeated spoken word
      else { t--; w--; }                                      // misheard word
    }
    return score - 0.3 * Math.min(skips, 2);
  }

  /**
   * Given the script words (normalized), the current position (index of next
   * word to read) and the tail of what was just heard, return the new position
   * (index after the last word spoken) or -1 if no confident match.
   * The result can be *behind* pos when the speaker clearly repeats earlier text.
   */
  function findNext(words, pos, tail, ahead = 60, behind = 60) {
    const m = tail.length;
    if (!m || !words.length) return -1;
    const last = tail[m - 1];
    const from = Math.max(0, pos - behind);
    const to = Math.min(words.length - 1, pos + ahead);
    let best = -1, bestVal = -Infinity, bestScore = 0;
    for (let j = from; j <= to; j++) {
      if (!sim(last, words[j])) continue;
      const dist = j - pos; // 0 = the next word, -1 = the word just read
      const near = dist >= -3 && dist <= 2;
      // A real jump must end on the last two words heard, side by side in the script.
      if (!near && (m < 2 || j < 1 || !sim(tail[m - 2], words[j - 1]))) continue;
      // the further we move, the more evidence we require
      const need = dist < -3 ? 3 : near ? 0.6 : dist <= 10 ? 1.8 : 2.6;
      const score = suffixScore(tail, words, j);
      if (score < need) continue;
      const val = score - Math.abs(dist) * 0.05 + (near ? 0.5 : 0);
      if (val > bestVal) { bestVal = val; best = j; bestScore = score; }
    }
    if (best < 0) return -1;
    // Going back (re-reading) needs ~4 words in a row; a weaker match near the
    // reader just means "still here".
    if (best + 1 < pos && bestScore < 3) return pos;
    return best + 1;
  }

  const api = { norm, splitWords, sim, lcs, findNext };
  root.Matcher = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
