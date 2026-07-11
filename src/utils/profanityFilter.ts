/**
 * Profanity Filter Utility for the Senoia Area Historical Society Digital Archive
 * 
 * Since comments are contributed by authenticated society members and volunteers, 
 * this filter acts as a guardrail against inappropriate language, slurs, 
 * and common spam patterns.
 */

// A comprehensive list of common profanities, cuss words, slurs, and spam keywords.
// This list is kept in one place so administrators can easily add or remove terms.
const BANNED_WORDS: string[] = [
    // --- Common Swear Words & Vulgarities ---
    "fuck", "fucking", "fucker", "fucks", "shit", "shitting", "shitter", "shits", "shitty",
    "bitch", "bitches", "bitching", "bitchy", "asshole", "assholes", "bastard", "bastards",
    "cunt", "cunts", "dick", "dicks", "pussy", "pussies", "cocksucker", "motherfucker",
    "wanker", "prick", "twat", "bollocks", "arse", "arsehole", "jackass",

    // --- Inappropriate/Sexual Terms (often used out of historical context) ---
    "porn", "pornography", "porno", "nude", "nudes", "erotic", "xxx",

    // --- Slurs & Hate Speech (Highly offensive terms) ---
    // (Included here specifically to protect the Historical Society's website from abuse)
    "nigger", "nigga", "chink", "gook", "kike", "spic", "faggot", "fag", "dyke", "tranny",
    "retard", "retarded",

    // --- Common Web Spam / Scam Keywords ---
    "crypto", "casino", "viagra", "cialis", "pills", "cheap followers", "buy followers"
];

/**
 * Checks if the given text contains any banned words.
 * Handles case-insensitivity and ensures we match full words (so words like "classify" or "assume" aren't blocked).
 * 
 * @param text The comment or reply text to check
 * @returns true if inappropriate content is detected, false otherwise
 */
export const containsBannedWords = (text: string): boolean => {
    if (!text) return false;
    
    const lowercaseText = text.toLowerCase();
    
    return BANNED_WORDS.some(word => {
        // Escapes special regex characters if there are any
        const escapedWord = word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        // Matches word boundaries so we don't trigger false positives
        const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');
        return regex.test(lowercaseText);
    });
};

/**
 * Censers the banned words in the text with asterisks (e.g. "f***").
 * This can be used if we want to display censored comments rather than blocking them outright.
 * 
 * @param text The comment or reply text to censor
 * @returns Censored text
 */
export const censorText = (text: string): string => {
    if (!text) return "";
    
    let censoredText = text;
    BANNED_WORDS.forEach(word => {
        const escapedWord = word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
        censoredText = censoredText.replace(regex, match => {
            if (match.length <= 2) return "*".repeat(match.length);
            return match[0] + "*".repeat(match.length - 2) + match[match.length - 1];
        });
    });
    
    return censoredText;
};
