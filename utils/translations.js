// Server-side translation utility
const fs = require('fs');
const path = require('path');

// Cache for translations to avoid repeated file reads
let translationCache = {};

/**
 * Load translations for a specific language
 * @param {string} language - Language code (en, nl)
 * @returns {Object} Translation object
 */
function loadTranslations(language = 'en') {
    // Return from cache if already loaded
    if (translationCache[language]) {
        return translationCache[language];
    }

    try {
        const translationPath = path.join(__dirname, '..', 'public', 'lang', `${language}.json`);
        const translationData = fs.readFileSync(translationPath, 'utf8');
        const translations = JSON.parse(translationData);

        // Cache the translations
        translationCache[language] = translations;

        return translations;
    } catch (error) {
        console.error(`Error loading translations for language ${language}:`, error);

        // Fallback to English if the requested language fails
        if (language !== 'en') {
            return loadTranslations('en');
        }

        // If English also fails, return empty object
        return {};
    }
}

/**
 * Get translated text for a specific key and language
 * @param {string} key - Translation key
 * @param {string} language - Language code (en, nl)
 * @param {Object} replacements - Object with replacement values for placeholders
 * @returns {string} Translated text
 */
function getTranslation(key, language = 'en', replacements = {}) {
    const translations = loadTranslations(language);
    let text = translations[key];

    // Fallback to English if translation not found
    if (!text && language !== 'en') {
        const englishTranslations = loadTranslations('en');
        text = englishTranslations[key];
    }

    // If still not found, return the key itself
    if (!text) {
        text = key;
    }

    // Handle replacements like {referenceNumber}, {status}, etc.
    Object.keys(replacements).forEach(placeholder => {
        text = text.replace(new RegExp(`{${placeholder}}`, 'g'), replacements[placeholder]);
    });

    return text;
}

/**
 * Get all translations for a specific language
 * @param {string} language - Language code (en, nl)
 * @returns {Object} All translations for the language
 */
function getAllTranslations(language = 'en') {
    return loadTranslations(language);
}

/**
 * Clear translation cache (useful for development/testing)
 */
function clearCache() {
    translationCache = {};
}

/**
 * Get translation function bound to a specific language
 * @param {string} language - Language code
 * @returns {Function} Translation function for the specific language
 */
function getTranslator(language = 'en') {
    return (key, replacements = {}) => getTranslation(key, language, replacements);
}

module.exports = {
    loadTranslations,
    getTranslation,
    getAllTranslations,
    clearCache,
    getTranslator
};