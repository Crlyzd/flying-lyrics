/**
 * Google Fonts Catalog Sync Script
 * Fetches the latest live Google Fonts catalog from the official Google Fonts metadata endpoint,
 * filters out non-typographic icon sets, sorts alphabetically, and updates `src/popup/fonts.js`.
 *
 * Usage: node tools/update-fonts.js
 */

const fs = require('fs');
const path = require('path');

const METADATA_URL = 'https://fonts.google.com/metadata/fonts';
const TARGET_PATH = path.resolve(__dirname, '../src/popup/fonts.js');

async function syncGoogleFonts() {
  console.log(`[Google Fonts Sync] Fetching metadata from ${METADATA_URL}...`);
  const response = await fetch(METADATA_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch fonts metadata: ${response.status} ${response.statusText}`);
  }

  const rawText = await response.text();
  // Strip Google's XSSI protection prefix ")]}'\n"
  const cleanJson = rawText.replace(/^\)\]\}'\n/, '');
  const data = JSON.parse(cleanJson);

  if (!data.familyMetadataList || !Array.isArray(data.familyMetadataList)) {
    throw new Error('Invalid metadata format: familyMetadataList not found');
  }

  console.log(`[Google Fonts Sync] Received ${data.familyMetadataList.length} total families from catalog.`);

  // Filter out icon libraries (e.g. Material Icons, Material Symbols) which are not suitable for lyrics rendering
  const textFonts = data.familyMetadataList
    .map(item => item.family && item.family.trim())
    .filter(Boolean)
    .filter(name => !/^Material (Icons|Symbols)/i.test(name));

  // Deduplicate and sort alphabetically
  const uniqueSorted = Array.from(new Set(textFonts)).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

  console.log(`[Google Fonts Sync] Filtered down to ${uniqueSorted.length} typographic families.`);

  // Construct JavaScript payload matching extension format
  const outputCode = `const GOOGLE_FONTS = ${JSON.stringify(uniqueSorted)};\n`;

  fs.writeFileSync(TARGET_PATH, outputCode, 'utf8');
  console.log(`[Google Fonts Sync] Successfully wrote ${uniqueSorted.length} fonts to ${TARGET_PATH}`);
}

syncGoogleFonts().catch(err => {
  console.error('[Google Fonts Sync] Error:', err);
  process.exit(1);
});
