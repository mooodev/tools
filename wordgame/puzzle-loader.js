/**
 * puzzle-loader.js — Load puzzle data from GitHub with local fallback
 *
 * Fetches fresh puzzle data from the GitHub repository.
 * Falls back to the bundled local scripts if fetch fails.
 *
 * Must be loaded AFTER the local puzzle scripts (words.js, etc.)
 * and BEFORE game.js/ui.js so the data is ready.
 */

// =============================================
// CONFIG
// =============================================
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/mooodev/tools/main/wordgame';

const PUZZLE_SOURCES = [
    { url: `${GITHUB_RAW_BASE}/words.js`,              globalVar: 'WORD_PUZZLES',   varName: 'WORD_PUZZLES' },
    { url: `${GITHUB_RAW_BASE}/dailypuzzlewords.js`,   globalVar: 'DAILY_PUZZLES',  varName: 'DAILY_PUZZLES' },
    { url: `${GITHUB_RAW_BASE}/weeklypuzzlewords.js`,  globalVar: 'WEEKLY_PUZZLES', varName: 'WEEKLY_PUZZLES' },
    { url: `${GITHUB_RAW_BASE}/meanings.js`,           globalVar: 'WORD_MEANINGS',  varName: 'WORD_MEANINGS' },
];

// =============================================
// FETCH & PARSE
// =============================================

/**
 * Fetch a JS file from GitHub, extract the data array/object from it.
 * The file declares a const/let/var like: const WORD_PUZZLES = [...];
 * We evaluate only the data portion safely.
 */
async function fetchPuzzleFile(source) {
    try {
        const res = await fetch(source.url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();

        // Extract the main data: find the variable assignment
        // Pattern: const/let/var VARNAME = <data>;
        // We need to extract <data> which is either [...] or {...}
        const regex = new RegExp(
            `(?:const|let|var)\\s+${source.varName}\\s*=\\s*`,
        );
        const match = text.match(regex);
        if (!match) {
            // For files with functions after data (dailypuzzlewords.js, weeklypuzzlewords.js),
            // try to extract just the array
            throw new Error(`Variable ${source.varName} not found in fetched file`);
        }

        const dataStart = match.index + match[0].length;
        // Find the matching closing bracket
        const dataStr = extractBalancedExpression(text, dataStart);
        if (!dataStr) throw new Error('Could not parse data expression');

        // Safe evaluation using Function constructor
        const data = new Function(`return ${dataStr}`)();

        if (data !== undefined && data !== null) {
            window[source.globalVar] = data;
            console.log(`[puzzle-loader] Loaded ${source.varName} from GitHub (${Array.isArray(data) ? data.length + ' items' : 'object'})`);
            return true;
        }
    } catch (e) {
        console.warn(`[puzzle-loader] Failed to load ${source.varName} from GitHub:`, e.message);
        console.warn(`[puzzle-loader] Using local fallback for ${source.varName}`);
    }
    return false;
}

/**
 * Extract a balanced JSON-like expression (array or object) from text starting at pos.
 */
function extractBalancedExpression(text, pos) {
    // Skip whitespace
    while (pos < text.length && /\s/.test(text[pos])) pos++;

    const firstChar = text[pos];
    if (firstChar !== '[' && firstChar !== '{') return null;

    let depth = 0;
    let inString = false;
    let stringChar = '';
    let escaped = false;
    const start = pos;

    for (let i = pos; i < text.length; i++) {
        const ch = text[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (ch === '\\' && inString) {
            escaped = true;
            continue;
        }

        if (inString) {
            if (ch === stringChar) {
                inString = false;
            }
            continue;
        }

        if (ch === '"' || ch === "'" || ch === '`') {
            inString = true;
            stringChar = ch;
            continue;
        }

        // Skip line comments
        if (ch === '/' && i + 1 < text.length && text[i + 1] === '/') {
            const eol = text.indexOf('\n', i);
            if (eol === -1) break;
            i = eol;
            continue;
        }

        // Skip block comments
        if (ch === '/' && i + 1 < text.length && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            if (end === -1) break;
            i = end + 1;
            continue;
        }

        if (ch === '[' || ch === '{') depth++;
        if (ch === ']' || ch === '}') depth--;

        if (depth === 0) {
            return text.slice(start, i + 1);
        }
    }

    return null;
}

/**
 * Load all puzzle data from GitHub. Returns a promise.
 * Falls back gracefully to local bundled data.
 */
async function loadPuzzlesFromGitHub() {
    // Store original local data as fallback
    const localBackup = {};
    PUZZLE_SOURCES.forEach(source => {
        if (window[source.globalVar]) {
            localBackup[source.globalVar] = window[source.globalVar];
        }
    });

    // Fetch all in parallel
    const results = await Promise.allSettled(
        PUZZLE_SOURCES.map(source => fetchPuzzleFile(source))
    );

    // Restore any that failed
    results.forEach((result, i) => {
        const source = PUZZLE_SOURCES[i];
        if (result.status === 'rejected' || !result.value) {
            if (localBackup[source.globalVar]) {
                window[source.globalVar] = localBackup[source.globalVar];
            }
        }
    });

    // Re-sync bonus puzzles after fetch — the GitHub fetch may replace WORD_PUZZLES,
    // which loses any bonus words that were appended at load time.
    if (typeof syncBonusWords === 'function') {
        syncBonusWords();
        console.log(`[puzzle-loader] Re-synced bonus puzzles after fetch`);
    }

    const loaded = results.filter(r => r.status === 'fulfilled' && r.value).length;
    console.log(`[puzzle-loader] ${loaded}/${PUZZLE_SOURCES.length} sources loaded from GitHub`);
}

// Flag to indicate puzzles are being loaded
let puzzlesReady = false;
let puzzleLoadPromise = null;

function initPuzzleLoader() {
    puzzleLoadPromise = loadPuzzlesFromGitHub()
        .then(() => { puzzlesReady = true; })
        .catch(() => { puzzlesReady = true; }); // Always resolve
    return puzzleLoadPromise;
}
