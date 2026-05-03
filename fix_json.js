const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scan_result.json', 'utf8'));

// Fix paths - replace backslashes with forward slashes in all strings
function fixStrings(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\\/g, '/');
  }
  if (Array.isArray(obj)) {
    return obj.map(fixStrings);
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = fixStrings(obj[key]);
    }
    return result;
  }
  return obj;
}

const fixed = fixStrings(data);
fs.writeFileSync('scan_result_fixed.json', JSON.stringify(fixed));
console.log('Fixed JSON written to scan_result_fixed.json');
