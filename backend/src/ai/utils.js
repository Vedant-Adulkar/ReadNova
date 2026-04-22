// backend/src/ai/utils.js
// Shared utility functions for AI services

/**
 * classifyError — returns a human‑readable reason for a failure.
 * Used by fallbackService and the new queryExpansionService.
 *
 * @param {Error} err
 * @returns {string}
 */
function classifyError(err) {
  const msg = err && err.message ? err.message : '';
  if (msg === 'TIMEOUT' || msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('aborted')) {
    return 'timeout';
  }
  if (msg.includes('429') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('quota')) {
    return 'rate-limited';
  }
  if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
    return 'server-error';
  }
  if (msg.includes('Empty response')) {
    return 'empty-response';
  }
  return msg.slice(0, 80);
}

module.exports = { classifyError };
