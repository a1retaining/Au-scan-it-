const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// One transaction is synchronous from lock acquisition through atomic rename.
// A leftover lock is intentionally not stolen: recovery requires operator review.
function createArrayStore(filename, validate = () => true) {
  const backup = filename + '.backup';
  const lock = filename + '.lock';
  function decode(text) {
    const data = JSON.parse(text);
    if (!Array.isArray(data) || !validate(data)) throw new Error('Invalid history format');
    return data;
  }
  function read() {
    try {
      return decode(fs.readFileSync(filename, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT' && !fs.existsSync(backup)) return [];
      throw new Error('History storage could not be read. Original data is preserved; restore a verified backup before writing. ' + error.message);
    }
  }
  function atomicWrite(target, text) {
    const temporary = target + '.' + randomUUID() + '.tmp';
    let fd;
    try {
      fd = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(fd, text);
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(temporary, target);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  function update(mutator) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    let fd;
    try {
      fd = fs.openSync(lock, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify({pid: process.pid, startedAt: new Date().toISOString()}));
    } catch (error) {
      throw new Error('History storage is busy or has an interrupted writer. No data was changed. ' + error.message);
    }
    try {
      const data = read();
      const before = JSON.stringify(data);
      const result = mutator(data);
      if (result && typeof result.then === 'function') throw new Error('History transactions must be synchronous');
      decode(JSON.stringify(data));
      if (before === JSON.stringify(data) && fs.existsSync(filename)) return result;
      // Validate current contents before replacing the recovery copy.
      if (fs.existsSync(filename)) {
        const previous = fs.readFileSync(filename, 'utf8');
        decode(previous);
        atomicWrite(backup, previous);
      }
      atomicWrite(filename, JSON.stringify(data, null, 2) + '\n');
      return result;
    } finally {
      fs.closeSync(fd);
      fs.unlinkSync(lock);
    }
  }
  return { read, update, filename, backup };
}

module.exports = { createArrayStore };
