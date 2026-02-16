// Dictionary.js
export async function loadWordSet(url, { minLen = 4 } = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load word list: ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  const set = new Set();
  for (let w of lines) {
    if (!w) continue;
    w = w.trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (!w) continue;
    if (w.length < minLen) continue;
    set.add(w);
  }
  return set;
}
