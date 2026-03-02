/**
 * asyncHandler — wraps an async Express route handler so that any
 * rejected promise is forwarded to the next() error middleware
 * instead of crashing the process.
 *
 * Usage:
 *   router.get('/route', asyncHandler(async (req, res) => { ... }));
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
