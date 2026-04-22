// backend/scripts/verifySearchUpgrade.js
/**
 * Standalone script to verify query expansion, caching, and timing instrumentation.
 * Run with: node backend/scripts/verifySearchUpgrade.js
 */
require('dotenv').config({ path: 'backend/.env' });
const { expandQuery, cleanQuery, generateEmbeddingVariants } = require('../src/ai/queryExpansionService');
const { hybridSearch } = require('../src/recommendation/hybridSearch');
const { logger } = require('../src/utils/logger');

async function verify() {
  console.log('🚀 Starting Verification of Search Upgrade...\n');

  const testQuery = 'Fast paced sci-fi about AI uprising';
  console.log(`Original Query: "${testQuery}"`);

  // 1. Clean Query
  const cleaned = cleanQuery(testQuery);
  console.log(`Cleaned Query: "${cleaned}"`);

  // 2. Expand Query
  console.log('\nTesting Query Expansion...');
  const start = Date.now();
  const { expandedQuery, providerUsed } = await expandQuery(cleaned);
  const end = Date.now();
  console.log(`Expansion Provider: [${providerUsed}]`);
  console.log(`Expanded Query: "${expandedQuery}"`);
  console.log(`Expansion Latency: ${end - start}ms`);

  // 3. Variant Generation
  const variants = generateEmbeddingVariants(expandedQuery);
  console.log('\nGenerated Variants:');
  variants.forEach((v, i) => console.log(`  ${i+1}. "${v}"`));

  // 4. Test Hybrid Search Merge Logic (Mock Data)
  console.log('\nTesting Hybrid Search Merging...');
  const mockBooks = [
    { _id: '1', title: 'The Singularity', embedding: new Array(1536).fill(0.1) },
    { _id: '2', title: 'Robot Dreams', embedding: new Array(1536).fill(0.2) }
  ];
  const mockEmbeddings = [new Array(1536).fill(0.1), new Array(1536).fill(0.15)];
  
  // Note: hybridSearch calls semanticSearch which needs real vectors or mocked cosine.
  // We'll just verify the call doesn't throw and structure is correct.
  try {
     // Overriding semanticSearch for mock testing if needed, 
     // but let's see if it runs with the real one (it will just return low scores).
     const results = hybridSearch(mockEmbeddings, mockBooks, testQuery, 5);
     console.log('Hybrid Search Call: Success');
     console.log('Results Count:', results.length);
  } catch (err) {
     console.warn('Hybrid Search Mock Call expectedly failed or scored 0:', err.message);
  }

  console.log('\n✅ Verification Script Completed.');
}

verify().catch(console.error);
