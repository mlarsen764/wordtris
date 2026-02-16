const fs = require("fs");

const inputPath = "./enable.txt";        // original file
const outputPath = "./public/words.txt"; // filtered output

const MIN_LEN = 4;
const MAX_LEN = 8;

const lines = fs.readFileSync(inputPath, "utf8").split(/\r?\n/);

const filtered = lines
  .map(w => w.trim().toUpperCase())
  .filter(w => /^[A-Z]+$/.test(w))       // only letters
  .filter(w => w.length >= MIN_LEN && w.length <= MAX_LEN);

fs.writeFileSync(outputPath, filtered.join("\n"));

console.log(`Filtered ${filtered.length} words written to ${outputPath}`);
