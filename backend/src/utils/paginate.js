/**
 * paginate — extract and normalise pagination parameters from a request query.
 *
 * Usage in a route handler:
 *   const { page, limit, skip } = paginate(req.query);
 *   const docs = await Model.find(filter).skip(skip).limit(limit);
 *
 * @param {object} query  - req.query object
 * @param {number} [defaultLimit=10]
 * @param {number} [maxLimit=100]
 * @returns {{ page: number, limit: number, skip: number }}
 */
const paginate = (query, defaultLimit = 10, maxLimit = 100) => {
  let page = parseInt(query.page, 10) || 1;
  let limit = parseInt(query.limit, 10) || defaultLimit;

  if (page < 1) page = 1;
  if (limit < 1) limit = 1;
  if (limit > maxLimit) limit = maxLimit;

  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

module.exports = paginate;
