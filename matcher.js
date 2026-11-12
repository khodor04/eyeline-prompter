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

  /**
   * Given the script words (normalized), the current position (index of next
   * word to read) and the tail of what was just heard, return the new position
   * (index after the last word spoken) or -1 if no confident match.
   */
  function findNext(words, pos, tail, ahead = 60) {
    const m = tail.length;
    if (!m || !words.length) return -1;
    const last = tail[m - 1];
    const head = tail.slice(0, -1);
    const from = Math.max(0, pos - 3);
    const to = Math.min(words.length - 1, pos + ahead);
    let best = -1, bestVal = -Infinity;
    for (let j = from; j <= to; j++) {
      if (!sim(last, words[j])) continue;
      const start = Math.max(0, j - m - 3);
      const score = 1 + (head.length ? lcs(head, words.slice(start, j)) : 0);
      const dist = j - pos;
      // the further we jump, the more evidence we require
      const need = dist <= 2 ? 1 : dist <= 10 ? 2 : 3;
      if (score < Math.min(need, m)) continue;
      if (dist > 2) {
        // evidence must come from words *ahead* of the reader, not already-read history
        const fresh = 1 + (head.length ? lcs(head, words.slice(pos, j)) : 0);
        if (fresh < need) continue;
      }
      const val = score - Math.abs(dist) * 0.06;
      if (val > bestVal) { bestVal = val; best = j; }
    }
    return best >= 0 ? best + 1 : -1;
  }

  const api = { norm, splitWords, sim, lcs, findNext };
  root.Matcher = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
