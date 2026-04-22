/**
 * concurrency.js
 * Implementation of a queue-based limiter to manage parallel async tasks.
 * Replacement for p-limit to ensure CommonJS compatibility.
 */
module.exports = function createLimiter(limit = 3) {
  let active = 0;
  const queue = [];

  const next = () => {
    if (queue.length === 0 || active >= limit) return;

    active++;
    const { fn, resolve, reject } = queue.shift();

    fn()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        active--;
        next();
      });
  };

  return function run(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
};
