/**
 * cosineSimilarity — compute the cosine similarity between two numeric vectors.
 *
 * Returns a value in [-1, 1]:
 *   1  → identical direction
 *   0  → orthogonal (no similarity)
 *  -1  → opposite direction
 *
 * Returns 0 for zero-magnitude vectors to avoid NaN.
 *
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number}
 */
const cosineSimilarity = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  if (vecA.length !== vecB.length) {
    // Align to the shorter vector's length (defensive)
    const minLen = Math.min(vecA.length, vecB.length);
    vecA = vecA.slice(0, minLen);
    vecB = vecB.slice(0, minLen);
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) return 0;

  return dot / (magA * magB);
};

module.exports = cosineSimilarity;
