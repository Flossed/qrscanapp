const express = require('express');
const router = express.Router();
const Scan = require('../models/Scan');
const Reference = require('../models/Reference');
const EbsiCache = require('../models/EbsiCache');
const base45 = require('base45');
const pako = require('pako');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const multer = require('multer');
const crypto = require('crypto');
const { createVerify } = require('crypto');
const Logger = require('@zandd/app-logger');

// Define logger configuration variables
const logTracelevel = 'debug';        // Log level: exception|error|warn|info|http|trace|debug
const consoleOutput = 'on';          // Console output: 'on'|'off'
const logPath = './logs';            // Path for log files
const logFileName = 'qr-scanner-certificate-processor';

const logConfig = {
    logTracelevel: logTracelevel,        // Log level: exception|error|warn|info|http|trace|debug
    consoleOutput: consoleOutput,          // Console output: 'on'|'off'
    logPath: logPath,           // Path for log files
    dateLocale: 'de-DE',          // Date formatting locale
    fileRotation: true,           // Enable daily file rotation
    maxFileSize: '20m',           // Maximum file size before rotation
    maxFiles: '14d'               // Keep files for 14 days
};

const logger = new Logger(logFileName, logConfig);

// Application name for trace logging
const applicationName = 'qr-scanner-app';

// Utility function to convert base64 to base64url encoding
function base64ToBase64Url(base64) {
    logger.trace(applicationName + ':base64ToBase64Url:Started');

    try {
        // Remove padding and replace characters according to RFC 7515
        const base64url = base64
            .replace(/\+/g, '-')  // Replace + with -
            .replace(/\//g, '_')  // Replace / with _
            .replace(/=/g, '');   // Remove padding =

        logger.debug('Base64 to base64url conversion', {
            originalLength: base64.length,
            convertedLength: base64url.length,
            original: base64.substring(0, 20) + '...',
            converted: base64url.substring(0, 20) + '...',
            hadPadding: base64.includes('='),
            hadPlus: base64.includes('+'),
            hadSlash: base64.includes('/')
        });

        logger.trace(applicationName + ':base64ToBase64Url:Completed');
        return base64url;
    } catch (error) {
        logger.error('Base64 to base64url conversion failed', {
            error: error.message,
            input: base64.substring(0, 20) + '...'
        });
        logger.trace(applicationName + ':base64ToBase64Url:Failed');
        return base64; // Return original on error
    }
}

// Utility function to convert base64url back to base64 (for storage consistency)
function base64UrlToBase64(base64url) {
    logger.trace(applicationName + ':base64UrlToBase64:Started');

    try {
        // Add padding and replace characters back to standard base64
        let base64 = base64url
            .replace(/-/g, '+')  // Replace - with +
            .replace(/_/g, '/'); // Replace _ with /

        // Add padding if needed
        const padding = base64.length % 4;
        if (padding) {
            base64 += '='.repeat(4 - padding);
        }

        logger.debug('Base64url to base64 conversion', {
            originalLength: base64url.length,
            convertedLength: base64.length,
            paddingAdded: 4 - (padding || 4)
        });

        logger.trace(applicationName + ':base64UrlToBase64:Completed');
        return base64;
    } catch (error) {
        logger.error('Base64url to base64 conversion failed', {
            error: error.message,
            input: base64url.substring(0, 20) + '...'
        });
        logger.trace(applicationName + ':base64UrlToBase64:Failed');
        return base64url; // Return original on error
    }
}

// Function to detect and normalize thumbprint encoding
function normalizeThumbprintForEbsi(thumbprint) {
    logger.trace(applicationName + ':normalizeThumbprintForEbsi:Started');

    try {
        const hasBase64Chars = thumbprint.includes('+') || thumbprint.includes('/') || thumbprint.includes('=');
        const hasBase64UrlChars = thumbprint.includes('-') || thumbprint.includes('_');

        let normalizedThumbprint;
        let conversionApplied = 'none';

        if (hasBase64Chars && !hasBase64UrlChars) {
            // Standard base64 encoding detected, convert to base64url
            normalizedThumbprint = base64ToBase64Url(thumbprint);
            conversionApplied = 'base64-to-base64url';
        } else if (hasBase64UrlChars && !hasBase64Chars) {
            // Already base64url encoded
            normalizedThumbprint = thumbprint;
            conversionApplied = 'already-base64url';
        } else if (!hasBase64Chars && !hasBase64UrlChars) {
            // No special characters, could be either, assume base64url
            normalizedThumbprint = thumbprint;
            conversionApplied = 'assumed-base64url';
        } else {
            // Mixed characters, unusual case, use as-is
            normalizedThumbprint = thumbprint;
            conversionApplied = 'mixed-encoding-kept-as-is';
        }

        logger.debug('Thumbprint encoding normalization', {
            original: thumbprint.substring(0, 20) + '...',
            normalized: normalizedThumbprint.substring(0, 20) + '...',
            conversionApplied,
            hasBase64Chars,
            hasBase64UrlChars
        });

        logger.trace(applicationName + ':normalizeThumbprintForEbsi:Completed');
        return {
            normalized: normalizedThumbprint,
            conversionApplied,
            original: thumbprint
        };
    } catch (error) {
        logger.error('Thumbprint normalization failed', {
            error: error.message,
            thumbprint: thumbprint.substring(0, 20) + '...'
        });
        logger.trace(applicationName + ':normalizeThumbprintForEbsi:Failed');
        return {
            normalized: thumbprint,
            conversionApplied: 'error-kept-original',
            original: thumbprint
        };
    }
}

// Landing page route
router.get('/landing', (req, res) => {
    res.render('landing');
});

// Treatment date route
router.get('/treatment-date', (req, res) => {
    res.render('treatment-date');
});

// Identity check route
router.get('/identity-check', (req, res) => {
    res.render('identity-check');
});

router.get('/', (req, res) => {
    res.render('landing');
});

// Scanner page (moved from root)
router.get('/scanner', (req, res) => {
    res.render('index');
});

router.get('/history', async (req, res) => {
    try {
        const scans = await Scan.find().sort({ scannedAt: -1 });
        res.render('history', {
            scans,
            formatBytes: function(bytes) {
                if (bytes === 0) return '0 Bytes';
                const k = 1024;
                const sizes = ['Bytes', 'KB', 'MB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            }
        });
    } catch (error) {
        console.error('Error fetching scans:', error);
        res.render('history', { scans: [], formatBytes: function() { return ''; } });
    }
});

router.post('/api/scans', async (req, res) => {
    try {
        const { content, type, deviceInfo } = req.body;

        // Get active reference for comparison
        const reference = await Reference.findOne({ isActive: true });
        let referenceComparison = { hasReference: false };

        if (reference) {
            const comparison = compareStrings(reference.content, content);
            referenceComparison = {
                hasReference: true,
                referenceContent: reference.content,
                isMatch: comparison.isMatch,
                differences: comparison.differences,
                similarity: comparison.similarity
            };
        }

        // Check if this content has been scanned before
        const existingScan = await Scan.findOne({ content }).sort({ scannedAt: -1 });

        if (existingScan) {
            // Update existing scan with new scan time and increment count
            existingScan.scannedAt = new Date();
            existingScan.duplicateCount += 1;
            existingScan.isDuplicate = true;
            existingScan.deviceInfo = deviceInfo;
            existingScan.referenceComparison = referenceComparison;

            await existingScan.save();
            res.status(201).json({
                message: 'Duplicate scan updated',
                scan: existingScan,
                isDuplicate: true,
                duplicateCount: existingScan.duplicateCount,
                referenceComparison
            });
        } else {
            // Create new scan
            const scan = new Scan({
                content,
                type,
                deviceInfo,
                firstScannedAt: new Date(),
                referenceComparison
            });

            await scan.save();
            res.status(201).json({
                message: 'New scan saved successfully',
                scan,
                isDuplicate: false,
                duplicateCount: 1,
                referenceComparison
            });
        }
    } catch (error) {
        console.error('Error saving scan:', error);
        res.status(500).json({ error: 'Failed to save scan' });
    }
});

router.get('/api/scans', async (req, res) => {
    try {
        const scans = await Scan.find().sort({ scannedAt: -1 });
        res.json(scans);
    } catch (error) {
        console.error('Error fetching scans:', error);
        res.status(500).json({ error: 'Failed to fetch scans' });
    }
});

router.get('/api/scans/recent', async (req, res) => {
    try {
        const scans = await Scan.find()
            .sort({ scannedAt: -1 })
            .limit(5);
        res.json(scans);
    } catch (error) {
        console.error('Error fetching recent scans:', error);
        res.status(500).json({ error: 'Failed to fetch recent scans' });
    }
});

router.delete('/api/scans/:id', async (req, res) => {
    try {
        await Scan.findByIdAndDelete(req.params.id);
        res.json({ message: 'Scan deleted successfully' });
    } catch (error) {
        console.error('Error deleting scan:', error);
        res.status(500).json({ error: 'Failed to delete scan' });
    }
});

// Reference management routes
router.post('/api/reference', async (req, res) => {
    try {
        const { content, name } = req.body;

        // Deactivate existing references
        await Reference.updateMany({}, { isActive: false });

        // Create new reference
        const reference = new Reference({
            content,
            name: name || 'Reference QR Code',
            isActive: true
        });

        await reference.save();
        res.status(201).json({ message: 'Reference saved successfully', reference });
    } catch (error) {
        console.error('Error saving reference:', error);
        res.status(500).json({ error: 'Failed to save reference' });
    }
});

router.get('/api/reference', async (req, res) => {
    try {
        const reference = await Reference.findOne({ isActive: true });
        res.json(reference);
    } catch (error) {
        console.error('Error fetching reference:', error);
        res.status(500).json({ error: 'Failed to fetch reference' });
    }
});

router.delete('/api/reference', async (req, res) => {
    try {
        await Reference.updateMany({}, { isActive: false });
        res.json({ message: 'Reference cleared successfully' });
    } catch (error) {
        console.error('Error clearing reference:', error);
        res.status(500).json({ error: 'Failed to clear reference' });
    }
});

// Comparison function
function compareStrings(reference, scanned) {
    const refBytes = Buffer.from(reference, 'utf8');
    const scanBytes = Buffer.from(scanned, 'utf8');
    const differences = [];

    const maxLength = Math.max(refBytes.length, scanBytes.length);
    let matches = 0;

    for (let i = 0; i < maxLength; i++) {
        const refByte = i < refBytes.length ? refBytes[i] : null;
        const scanByte = i < scanBytes.length ? scanBytes[i] : null;

        if (refByte === scanByte) {
            matches++;
        } else {
            differences.push({
                position: i,
                expected: refByte ? refByte.toString(16).padStart(2, '0') : 'missing',
                actual: scanByte ? scanByte.toString(16).padStart(2, '0') : 'missing'
            });
        }
    }

    return {
        isMatch: differences.length === 0,
        differences,
        similarity: Math.round((matches / maxLength) * 100)
    };
}

// Verification route
router.get('/verify', (req, res) => {
    res.render('verify');
});

// Results route
router.get('/results', (req, res) => {
    res.render('results');
});

router.get('/check-bridge', (req, res) => {
    res.render('check-bridge');
});

// Set up multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// API endpoint for checking certificates against bridge
router.post('/api/check-bridge', upload.single('certificateFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileContent = req.file.buffer.toString('utf8');
        const certificates = JSON.parse(fileContent);

        if (!Array.isArray(certificates)) {
            return res.status(400).json({ error: 'File must contain a JSON array' });
        }

        const results = await processCertificatesWithProgress(certificates, null);
        res.json(results);
    } catch (error) {
        console.error('Bridge check error:', error);
        res.status(500).json({
            error: 'Failed to process certificates',
            message: error.message
        });
    }
});

// SSE endpoint for real-time progress updates
router.get('/api/check-bridge/progress/:sessionId', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const sessionId = req.params.sessionId;

    // Store the response object for this session
    if (!global.progressSessions) {
        global.progressSessions = new Map();
    }
    global.progressSessions.set(sessionId, res);

    req.on('close', () => {
        global.progressSessions.delete(sessionId);
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Progress stream connected' })}\n\n`);
});

// Enhanced endpoint for checking certificates with progress updates
// Cache management endpoints

// Get cache statistics
router.get('/api/cache/stats', async (req, res) => {
    logger.trace(applicationName + ':getCacheStats:Started');

    try {
        const stats = await EbsiCache.getStats();
        logger.info('Cache statistics retrieved', stats);
        res.json(stats);
    } catch (error) {
        logger.error('Failed to get cache statistics', { error: error.message });
        res.status(500).json({ error: 'Failed to get cache statistics' });
    }

    logger.trace(applicationName + ':getCacheStats:Completed');
});

// Refresh all cache entries
router.post('/api/cache/refresh-all', async (req, res) => {
    logger.trace(applicationName + ':refreshAllCache:Started');

    try {
        // Mark all entries for refresh
        const result = await EbsiCache.markAllForRefresh();
        logger.info('Marked all cache entries for refresh', { modifiedCount: result.modifiedCount });

        // Start background refresh process
        setTimeout(() => {
            refreshCacheInBackground();
        }, 100);

        res.json({
            message: 'Cache refresh initiated',
            entriesMarked: result.modifiedCount
        });
    } catch (error) {
        logger.error('Failed to initiate cache refresh', { error: error.message });
        res.status(500).json({ error: 'Failed to initiate cache refresh' });
    }

    logger.trace(applicationName + ':refreshAllCache:Completed');
});

// Test encoding conversion endpoint
router.post('/api/test-encoding', async (req, res) => {
    logger.trace(applicationName + ':testEncoding:Started');

    try {
        const { thumbprint } = req.body;

        if (!thumbprint) {
            return res.status(400).json({ error: 'Thumbprint required' });
        }

        const normalizationResult = normalizeThumbprintForEbsi(thumbprint);

        // Also show the reverse conversion
        const backToBase64 = normalizationResult.conversionApplied === 'base64-to-base64url'
            ? base64UrlToBase64(normalizationResult.normalized)
            : 'N/A (no conversion applied)';

        // Generate example EBSI URL to show how it would be formatted
        const exampleEbsiUrl = `https://resolver-test.ebsi.eu/api/v1/issuers?x509Thumbprint=${normalizationResult.normalized}`;

        const result = {
            original: thumbprint,
            normalized: normalizationResult.normalized,
            conversionApplied: normalizationResult.conversionApplied,
            backToBase64: backToBase64,
            exampleEbsiUrl: exampleEbsiUrl,
            originalCharacteristics: {
                hasPlus: thumbprint.includes('+'),
                hasSlash: thumbprint.includes('/'),
                hasPadding: thumbprint.includes('='),
                hasDash: thumbprint.includes('-'),
                hasUnderscore: thumbprint.includes('_'),
                length: thumbprint.length
            },
            normalizedCharacteristics: {
                hasPlus: normalizationResult.normalized.includes('+'),
                hasSlash: normalizationResult.normalized.includes('/'),
                hasPadding: normalizationResult.normalized.includes('='),
                hasDash: normalizationResult.normalized.includes('-'),
                hasUnderscore: normalizationResult.normalized.includes('_'),
                length: normalizationResult.normalized.length
            }
        };

        logger.info('Encoding test completed', result);
        res.json(result);
    } catch (error) {
        logger.error('Encoding test failed', { error: error.message });
        res.status(500).json({ error: 'Encoding test failed' });
    }

    logger.trace(applicationName + ':testEncoding:Completed');
});

// Clear entire cache
router.post('/api/cache/clear', async (req, res) => {
    logger.trace(applicationName + ':clearCache:Started');

    try {
        const result = await EbsiCache.deleteMany({});
        logger.info('Cache cleared', { deletedCount: result.deletedCount });

        res.json({
            message: 'Cache cleared successfully',
            deletedCount: result.deletedCount
        });
    } catch (error) {
        logger.error('Failed to clear cache', { error: error.message });
        res.status(500).json({ error: 'Failed to clear cache' });
    }

    logger.trace(applicationName + ':clearCache:Completed');
});

// New endpoint to generate markdown report
router.post('/api/generate-markdown-report', async (req, res) => {
    logger.trace(applicationName + ':generateMarkdownReport:Started');

    try {
        const { results, metadata } = req.body;

        if (!results || !results.certificates) {
            return res.status(400).json({ error: 'Invalid results data' });
        }

        const markdown = generateMarkdownReport(results, metadata);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `certificate-bridge-report-${timestamp}.md`;

        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(markdown);

        logger.info('Markdown report generated successfully', {
            certificateCount: results.certificates.length,
            filename: filename
        });

    } catch (error) {
        logger.error('Error generating markdown report', { error: error.message });
        res.status(500).json({ error: 'Failed to generate markdown report' });
    }

    logger.trace(applicationName + ':generateMarkdownReport:Completed');
});

router.post('/api/check-bridge-with-progress', upload.single('certificateFile'), async (req, res) => {
    logger.trace(applicationName + ':checkBridgeWithProgress:Started');

    const requestId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    logger.info('Certificate check request started', {
        requestId: requestId,
        sessionId: req.body.sessionId,
        fileSize: req.file ? req.file.size : 'no file',
        timestamp: new Date().toISOString()
    });

    try {
        if (!req.file) {
            logger.warn('No file uploaded in request', { requestId });
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const sessionId = req.body.sessionId || Date.now().toString();
        logger.debug('Processing uploaded file', {
            requestId: requestId,
            sessionId: sessionId,
            fileSize: req.file.size,
            mimeType: req.file.mimetype
        });

        const fileContent = req.file.buffer.toString('utf8');
        const certificates = JSON.parse(fileContent);

        if (!Array.isArray(certificates)) {
            logger.error('Invalid file format - not an array', {
                requestId: requestId,
                fileType: typeof certificates,
                fileContent: typeof certificates === 'object' ? Object.keys(certificates) : 'not object'
            });
            return res.status(400).json({ error: 'File must contain a JSON array' });
        }

        logger.info('File parsed successfully', {
            requestId: requestId,
            certificateCount: certificates.length
        });

        // Send progress function
        const sendProgress = (type, message, data = null) => {
            if (global.progressSessions && global.progressSessions.has(sessionId)) {
                const progressRes = global.progressSessions.get(sessionId);
                try {
                    progressRes.write(`data: ${JSON.stringify({ type, message, data })}\n\n`);
                    logger.debug('Progress sent', { requestId, sessionId, type, message });
                } catch (error) {
                    logger.error('Error sending progress', { requestId, sessionId, error: error.message });
                    console.error('Error sending progress:', error);
                }
            }
        };

        logger.info('Starting certificate processing', {
            requestId: requestId,
            sessionId: sessionId,
            certificateCount: certificates.length
        });

        const results = await processCertificatesWithProgress(certificates, sendProgress);

        logger.info('Certificate processing completed successfully', {
            requestId: requestId,
            sessionId: sessionId,
            totalProcessed: results.certificates.length,
            foundInBridge: results.summary.foundInBridge,
            missingFromBridge: results.summary.missingFromBridge
        });

        // Send final results
        sendProgress('completed', 'Processing completed', results);

        res.json(results);
        logger.trace(applicationName + ':checkBridgeWithProgress:Completed');
    } catch (error) {
        logger.error('Bridge check request failed', {
            requestId: requestId,
            error: error.message,
            stack: error.stack
        });
        console.error('Bridge check error:', error);
        res.status(500).json({
            error: 'Failed to process certificates',
            message: error.message
        });
        logger.trace(applicationName + ':checkBridgeWithProgress:Failed');
    }
});

// API endpoint for verification processing
router.post('/api/verify', async (req, res) => {
    try {
        const { data } = req.body;
        const result = await processVerificationData(data);

        // Update scan record with verification result
        await updateScanVerification(data, result, null);

        res.json(result);
    } catch (error) {
        console.error('Verification error:', error);

        // Update scan record with verification error
        await updateScanVerification(req.body.data, null, error);

        res.status(500).json({
            error: 'Verification failed',
            message: error.message,
            step: error.step || 'unknown'
        });
    }
});

// Helper function to update scan with verification results
async function updateScanVerification(content, result, error) {
    try {
        const scan = await Scan.findOne({ content }).sort({ scannedAt: -1 });

        if (scan) {
            scan.verification.isVerified = true;
            scan.verification.verifiedAt = new Date();
            scan.verification.verificationCount += 1;

            if (result && result.success) {
                scan.verification.verificationResult = {
                    success: true,
                    steps: result.steps.map(step => ({
                        name: step.name,
                        size: step.size,
                        percentage: step.percentage
                    }))
                };
            } else if (error) {
                scan.verification.verificationResult = {
                    success: false,
                    error: {
                        message: error.message,
                        step: error.step || 'unknown'
                    }
                };
            }

            await scan.save();
        }
    } catch (updateError) {
        console.error('Error updating scan verification:', updateError);
    }
}

async function processVerificationData(originalData) {
    const steps = [];

    // Step 1: Original BASE45 data
    const originalSize = Buffer.byteLength(originalData, 'utf8');
    steps.push({
        name: 'Original BASE45 String',
        data: originalData,
        size: originalSize,
        percentage: 100
    });

    try {
        // Step 2: BASE45 decode to get ZLIB compressed data
        const base45Decoded = base45.decode(originalData);
        const base45Size = base45Decoded.length;
        steps.push({
            name: 'Decoded BASE45 (ZLIB Compressed)',
            data: Buffer.from(base45Decoded).toString('hex'),
            size: base45Size,
            percentage: Math.round((base45Size / originalSize) * 100)
        });

        try {
            // Step 3: ZLIB decompress to get JWT
            const zlibDecompressed = pako.inflate(base45Decoded, { to: 'string' });
            const zlibSize = Buffer.byteLength(zlibDecompressed, 'utf8');
            steps.push({
                name: 'Decompressed ZLIB (JWT)',
                data: zlibDecompressed,
                size: zlibSize,
                percentage: Math.round((zlibSize / base45Size) * 100)
            });

            try {
                // Step 4: Parse JWT
                const jwtDecoded = jwt.decode(zlibDecompressed, { complete: true });
                if (jwtDecoded) {
                    const jwtString = JSON.stringify(jwtDecoded, null, 2);
                    const jwtSize = Buffer.byteLength(jwtString, 'utf8');
                    steps.push({
                        name: 'Parsed JWT (Clear Text)',
                        data: jwtString,
                        size: jwtSize,
                        percentage: Math.round((jwtSize / zlibSize) * 100)
                    });

                    try {
                        // Step 5: Signature Verification
                        const signatureResponse = await verifySignature(jwtDecoded);
                        const responseString = JSON.stringify(signatureResponse, null, 2);
                        const responseSize = Buffer.byteLength(responseString, 'utf8');
                        steps.push({
                            name: 'Signature Verification Response',
                            data: responseString,
                            size: responseSize,
                            percentage: Math.round((responseSize / jwtSize) * 100)
                        });

                        try {
                            // Step 6: JWT Signature Validation using EBSI public key
                            const jwtValidationResult = await validateJwtSignature(zlibDecompressed, signatureResponse.data);
                            const validationString = JSON.stringify(jwtValidationResult, null, 2);
                            const validationSize = Buffer.byteLength(validationString, 'utf8');
                            steps.push({
                                name: 'JWT Signature Validation',
                                data: validationString,
                                size: validationSize,
                                percentage: Math.round((validationSize / responseSize) * 100)
                            });

                            logger.info('Complete QR code processing finished', {
                                totalSteps: steps.length,
                                signatureValid: jwtValidationResult.signatureValid,
                                ebsiResponseReceived: !signatureResponse.error,
                                finalStatus: jwtValidationResult.signatureValid ? 'VALID' : 'INVALID'
                            });

                        } catch (validationError) {
                            validationError.step = 'JWT signature validation';
                            logger.error('JWT signature validation step failed', {
                                error: validationError.message,
                                stack: validationError.stack
                            });

                            // Add failed validation step
                            steps.push({
                                name: 'JWT Signature Validation (FAILED)',
                                data: JSON.stringify({
                                    error: validationError.message,
                                    signatureValid: false,
                                    step: 'JWT signature validation'
                                }, null, 2),
                                size: 0,
                                percentage: 0
                            });
                        }
                    } catch (signatureError) {
                        signatureError.step = 'Signature verification';
                        throw signatureError;
                    }
                } else {
                    throw new Error('Invalid JWT format');
                }
            } catch (jwtError) {
                jwtError.step = 'JWT parsing';
                throw jwtError;
            }
        } catch (zlibError) {
            zlibError.step = 'ZLIB decompression';
            throw zlibError;
        }
    } catch (base45Error) {
        base45Error.step = 'BASE45 decoding';
        throw base45Error;
    }

    return { steps, success: true };
}

async function validateJwtSignature(jwtToken, publicKeyData) {
    logger.trace(applicationName + ':validateJwtSignature:Started');

    try {
        // Parse the JWT to extract header, payload, and signature
        const jwtParts = jwtToken.split('.');
        if (jwtParts.length !== 3) {
            throw new Error('Invalid JWT format - expected 3 parts');
        }

        const [headerB64, payloadB64, signatureB64] = jwtParts;

        // Parse header to get algorithm
        const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
        const algorithm = header.alg || 'RS256';

        logger.debug('JWT header analysis', {
            algorithm: algorithm,
            typ: header.typ,
            kid: header.kid?.substring(0, 50) + '...'
        });

        // Validate algorithm (currently only support RS256)
        if (algorithm !== 'RS256') {
            throw new Error(`Unsupported JWT algorithm: ${algorithm}. Only RS256 is supported.`);
        }

        // Create the signing input (header.payload)
        const signingInput = `${headerB64}.${payloadB64}`;

        // Decode the signature from base64url
        const signature = Buffer.from(signatureB64, 'base64url');

        // Extract public key from EBSI response structure
        // Response structure: { data: { results: [{ publicKeys: [...], certificates: [...] }] } }
        let publicKey;
        let issuerData;

        if (publicKeyData && publicKeyData.results && Array.isArray(publicKeyData.results) && publicKeyData.results.length > 0) {
            issuerData = publicKeyData.results[0];

            logger.debug('EBSI response structure analysis', {
                hasResults: !!publicKeyData.results,
                resultsCount: publicKeyData.results.length,
                hasPublicKeys: !!issuerData.publicKeys,
                publicKeysCount: issuerData.publicKeys ? issuerData.publicKeys.length : 0,
                hasCertificates: !!issuerData.certificates,
                certificatesCount: issuerData.certificates ? issuerData.certificates.length : 0,
                officialId: issuerData.officialId,
                countryCode: issuerData.countryCode,
                name: issuerData.name
            });

            // Try to get public key from publicKeys array first (JWK format)
            if (issuerData.publicKeys && Array.isArray(issuerData.publicKeys) && issuerData.publicKeys.length > 0) {
                const publicKeyJwk = issuerData.publicKeys[0];

                logger.debug('Found JWK public key in EBSI response', {
                    kty: publicKeyJwk.kty,
                    hasModulus: !!publicKeyJwk.n,
                    hasExponent: !!publicKeyJwk.e,
                    hasThumbprint: !!publicKeyJwk['x5t#S256']
                });

                // Convert JWK to PEM format for crypto operations
                if (publicKeyJwk.kty === 'RSA' && publicKeyJwk.n && publicKeyJwk.e) {
                    publicKey = convertRsaJwkToPem(publicKeyJwk);
                } else {
                    throw new Error(`Unsupported JWK key type: ${publicKeyJwk.kty}`);
                }
            }
            // Fallback to X509 certificate if available
            else if (issuerData.certificates && Array.isArray(issuerData.certificates) && issuerData.certificates.length > 0) {
                const x509Certificate = issuerData.certificates[0];
                logger.debug('Using X509 certificate as fallback for public key extraction');
                publicKey = extractPublicKeyFromX509(x509Certificate);
            } else {
                throw new Error('No public key or certificate found in EBSI response');
            }
        } else {
            throw new Error('Invalid EBSI response structure - expected data.results array');
        }

        logger.debug('Public key extracted for signature validation', {
            publicKeyType: typeof publicKey,
            publicKeyLength: publicKey ? publicKey.length : 0,
            publicKeyStart: publicKey ? publicKey.substring(0, 50) + '...' : 'N/A'
        });

        // Create verifier
        const verifier = createVerify('SHA256');
        verifier.update(signingInput);

        // Verify the signature
        const isValid = verifier.verify(publicKey, signature);

        logger.info('JWT signature validation completed', {
            signatureValid: isValid,
            signingInputLength: signingInput.length,
            signatureLength: signature.length
        });

        logger.trace(applicationName + ':validateJwtSignature:Completed');

        return {
            signatureValid: isValid,
            publicKeySource: issuerData,
            signingInput: signingInput,
            signatureLength: signature.length,
            algorithm: algorithm,
            thumbprintMatch: issuerData?.publicKeys?.[0]?.['x5t#S256'] || 'N/A',
            issuerInfo: {
                officialId: issuerData?.officialId,
                countryCode: issuerData?.countryCode,
                name: issuerData?.name,
                did: issuerData?.did
            }
        };

    } catch (error) {
        logger.error('JWT signature validation failed', {
            error: error.message,
            stack: error.stack
        });

        logger.trace(applicationName + ':validateJwtSignature:Failed');

        return {
            signatureValid: false,
            error: error.message,
            publicKeySource: null
        };
    }
}

// Helper function to convert RSA JWK to PEM format
function convertRsaJwkToPem(jwk) {
    logger.trace(applicationName + ':convertRsaJwkToPem:Started');

    try {
        if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) {
            throw new Error('Invalid RSA JWK - missing required fields');
        }

        // Decode base64url encoded modulus and exponent
        const modulus = Buffer.from(jwk.n, 'base64url');
        const exponent = Buffer.from(jwk.e, 'base64url');

        logger.debug('RSA JWK parameters decoded', {
            modulusLength: modulus.length,
            exponentLength: exponent.length,
            modulusStart: modulus.toString('hex').substring(0, 20) + '...',
            exponentHex: exponent.toString('hex')
        });

        // Use Node.js crypto to create public key from components
        const publicKey = crypto.createPublicKey({
            key: {
                kty: 'RSA',
                n: jwk.n,
                e: jwk.e
            },
            format: 'jwk'
        });

        // Export as PEM
        const pemKey = publicKey.export({
            type: 'spki',
            format: 'pem'
        });

        logger.debug('RSA JWK successfully converted to PEM', {
            pemLength: pemKey.length,
            pemStart: pemKey.substring(0, 50) + '...'
        });

        logger.trace(applicationName + ':convertRsaJwkToPem:Completed');
        return pemKey;

    } catch (error) {
        logger.error('RSA JWK to PEM conversion failed', {
            error: error.message,
            jwkKeys: Object.keys(jwk),
            hasN: !!jwk.n,
            hasE: !!jwk.e,
            kty: jwk.kty
        });
        logger.trace(applicationName + ':convertRsaJwkToPem:Failed');
        throw error;
    }
}

// Helper function to extract public key from X509 certificate
function extractPublicKeyFromX509(x509Cert) {
    logger.trace(applicationName + ':extractPublicKeyFromX509:Started');

    try {
        let certPem = x509Cert;

        // Ensure certificate has proper PEM format
        if (!certPem.includes('-----BEGIN CERTIFICATE-----')) {
            certPem = `-----BEGIN CERTIFICATE-----\n${certPem}\n-----END CERTIFICATE-----`;
        }

        // Create X509Certificate object and extract public key
        const cert = new crypto.X509Certificate(certPem);
        const publicKey = cert.publicKey.export({ type: 'spki', format: 'pem' });

        logger.debug('Public key extracted from X509 certificate', {
            publicKeyLength: publicKey.length,
            certificateSubject: cert.subject,
            certificateIssuer: cert.issuer
        });

        logger.trace(applicationName + ':extractPublicKeyFromX509:Completed');
        return publicKey;

    } catch (error) {
        logger.error('Public key extraction from X509 failed', {
            error: error.message,
            certLength: x509Cert ? x509Cert.length : 0
        });
        logger.trace(applicationName + ':extractPublicKeyFromX509:Failed');
        throw error;
    }
}

async function verifySignature(jwtDecoded) {
    try {
        // Extract KID from JWT header
        const kid = jwtDecoded.header.kid;
        if (!kid) {
            throw new Error('No KID found in JWT header');
        }

        // Extract the x5t#S256 part from KID
        // Format: "EESSI:x5t#S256:DPNTPbCkYBEYz/ZucBtb8emHYDPXZDnv1Kf2f/iL+0g="
        const kidParts = kid.split(':');
        if (kidParts.length < 3 || kidParts[1] !== 'x5t#S256') {
            throw new Error(`Invalid KID format: ${kid}`);
        }

        const x509Thumbprint = kidParts[2];

        // Extract country code from JWT payload (assuming it's in the payload)
        // You might need to adjust this based on where the country code is stored
        const payload = jwtDecoded.payload;
        let countryCode = 'BE'; // Default to BE, but try to extract from payload

        // Look for country code in common locations
        if (payload.iss && typeof payload.iss === 'string') {
            // Try to extract country code from issuer
            const issuerParts = payload.iss.split('/');
            for (const part of issuerParts) {
                if (part.length === 2 && part.match(/^[A-Z]{2}$/)) {
                    countryCode = part;
                    break;
                }
            }
        } else if (payload.c) {
            countryCode = payload.c;
        } else if (payload.country) {
            countryCode = payload.country;
        }

        // Use cache-aware EBSI bridge check instead of direct API call
        logger.debug('Using cache-aware EBSI bridge check for signature verification', {
            originalThumbprint: x509Thumbprint.substring(0, 16) + '...',
            extractedKid: kid,
            detectedCountryCode: countryCode
        });

        // This will check cache first, then EBSI if needed, and update cache
        const bridgeFound = await checkThumbprintInBridge(x509Thumbprint);

        // Get the cached entry to return full EBSI response data
        const cacheEntry = await EbsiCache.findOne({ thumbprint: x509Thumbprint });

        let ebsiResponseData = null;
        let status = 200;
        let statusText = 'OK';

        if (cacheEntry && cacheEntry.ebsiResponse) {
            ebsiResponseData = cacheEntry.ebsiResponse;
            status = cacheEntry.lastStatus || 200;
        }

        // Construct response URL for compatibility
        const normalizationResult = normalizeThumbprintForEbsi(x509Thumbprint);
        const fullUrl = `https://resolver-test.ebsi.eu/api/v1/issuers?x509Thumbprint=${normalizationResult.normalized}`;

        logger.info('Signature verification using cached EBSI response', {
            thumbprint: x509Thumbprint.substring(0, 16) + '...',
            foundInBridge: bridgeFound,
            cacheEntryExists: !!cacheEntry,
            lastChecked: cacheEntry?.lastChecked
        });

        return {
            url: fullUrl,
            status: status,
            statusText: statusText,
            headers: { 'content-type': 'application/json' },
            data: ebsiResponseData,
            extractedKid: kid,
            extractedThumbprint: x509Thumbprint,
            detectedCountryCode: countryCode,
            fromCache: !!cacheEntry,
            cacheHitCount: cacheEntry?.hitCount || 0
        };
    } catch (error) {
        if (error.response) {
            // HTTP error response
            return {
                error: 'HTTP Error',
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data,
                message: error.message
            };
        } else {
            // Other error (network, parsing, etc.)
            return {
                error: 'Verification Error',
                message: error.message,
                details: error.toString()
            };
        }
    }
}

async function processCertificates(certificates) {
    logger.trace(applicationName + ':processCertificates:Started');

    const results = [];
    const bridgeThumbprints = new Set();

    // First, get all thumbprints from bridge to check what exists
    try {
        const bridgeResponse = await axios.get('https://resolver-test.ebsi.eu/api/v1/issuers', {
            timeout: 10000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'QR-Scanner-App/1.0'
            }
        });

        // Extract thumbprints from bridge response
        if (bridgeResponse.data && Array.isArray(bridgeResponse.data)) {
            bridgeResponse.data.forEach(item => {
                if (item.x509Thumbprint) {
                    bridgeThumbprints.add(item.x509Thumbprint);
                }
            });
        }
    } catch (error) {
        console.warn('Failed to fetch bridge data:', error.message);
    }

    // Process each certificate
    for (const cert of certificates) {
        try {
            const result = await processCertificate(cert, bridgeThumbprints);
            results.push(result);
        } catch (error) {
            results.push({
                officialId: cert.OFFICIALID || 'Unknown',
                countryCode: cert.COUNTRYCODE || 'Unknown',
                name: cert.NAME || 'Unknown',
                thumbprint: 'Error',
                found: false,
                error: error.message
            });
        }
    }

    // Calculate statistics
    const totalCertificates = results.length;
    const foundInBridge = results.filter(r => r.found).length;
    const missingFromBridge = totalCertificates - foundInBridge;

    // Find certificates in bridge but not in file
    const fileThumbprints = new Set(results.map(r => r.thumbprint).filter(t => t !== 'Error'));
    const inBridgeNotInFile = Array.from(bridgeThumbprints).filter(t => !fileThumbprints.has(t));

    const returnValue = {
        certificates: results,
        summary: {
            totalInFile: totalCertificates,
            foundInBridge: foundInBridge,
            missingFromBridge: missingFromBridge,
            inBridgeNotInFile: inBridgeNotInFile.length,
            bridgeOnlyThumbprints: inBridgeNotInFile
        }
    };

    logger.trace(applicationName + ':processCertificates:Completed');
    return returnValue;
}

async function processCertificatesWithProgress(certificates, sendProgress) {
    logger.trace(applicationName + ':processCertificatesWithProgress:Started');

    const startTime = Date.now();
    logger.info('Starting certificate processing', {
        certificateCount: certificates.length,
        sessionStart: new Date().toISOString()
    });

    const results = [];

    // Send initial progress
    if (sendProgress) sendProgress('info', `Starting to process ${certificates.length} certificates`);
    if (sendProgress) sendProgress('info', 'Processing certificates individually with bridge lookups...');

    // Process each certificate
    logger.info('Starting individual certificate processing', {
        totalCertificates: certificates.length
    });

    for (let i = 0; i < certificates.length; i++) {
        const cert = certificates[i];
        const certNum = i + 1;
        const certStartTime = Date.now();

        logger.debug('Processing certificate', {
            certNumber: certNum,
            totalCerts: certificates.length,
            certData: {
                officialId: cert.OFFICIALID,
                countryCode: cert.COUNTRYCODE,
                name: cert.NAME,
                hasPrefix: cert.certificate ? cert.certificate.startsWith('-----BEGIN') : 'no cert field'
            }
        });

        if (sendProgress) {
            sendProgress('info', `Processing certificate ${certNum}/${certificates.length}: ${cert.NAME || cert.OFFICIALID || 'Unknown'}`);
        }

        try {
            logger.debug('Calling processCertificate function', {
                certNumber: certNum
            });

            const result = await processCertificateWithBridgeLookup(cert);
            const certProcessTime = Date.now() - certStartTime;

            logger.info('Certificate processed successfully', {
                certNumber: certNum,
                processTime: certProcessTime,
                found: result.found,
                thumbprint: result.thumbprint?.substring(0, 16) + '...',
                officialId: result.officialId
            });

            results.push(result);

            if (sendProgress) {
                const status = result.found ? 'FOUND' : 'NOT FOUND';
                sendProgress(result.found ? 'success' : 'warning',
                    `Certificate ${certNum}: ${status} in bridge (${result.thumbprint?.substring(0, 16)}...)`);
            }

            // Add delay between API calls (10 seconds)
            if (certNum < certificates.length) {
                if (sendProgress) {
                    sendProgress('info', `Waiting 50ms before processing next certificate...`);
                }
                logger.debug('Adding 50ms delay between API calls');
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        } catch (error) {
            const certProcessTime = Date.now() - certStartTime;
            logger.error('Certificate processing failed', {
                certNumber: certNum,
                processTime: certProcessTime,
                error: error.message,
                stack: error.stack,
                certData: {
                    officialId: cert.OFFICIALID,
                    countryCode: cert.COUNTRYCODE,
                    name: cert.NAME
                }
            });

            const errorResult = {
                officialId: cert.OFFICIALID || 'Unknown',
                countryCode: cert.COUNTRYCODE || 'Unknown',
                name: cert.NAME || 'Unknown',
                thumbprint: 'Error',
                found: false,
                error: error.message
            };
            results.push(errorResult);

            if (sendProgress) {
                sendProgress('error', `Certificate ${certNum}: Processing error - ${error.message}`);
            }
        }
    }

    // Calculate statistics
    const totalCertificates = results.length;
    const foundInBridge = results.filter(r => r.found).length;
    const missingFromBridge = totalCertificates - foundInBridge;

    const totalProcessTime = Date.now() - startTime;
    logger.info('Certificate processing completed', {
        totalProcessTime: totalProcessTime,
        totalCertificates: totalCertificates,
        foundInBridge: foundInBridge,
        missingFromBridge: missingFromBridge,
        averageTimePerCert: Math.round(totalProcessTime / totalCertificates),
        successRate: Math.round((foundInBridge / totalCertificates) * 100) + '%'
    });

    if (sendProgress) {
        sendProgress('info', `Processing complete! Summary: ${foundInBridge}/${totalCertificates} found, ${missingFromBridge} missing`);
    }

    const returnValue = {
        certificates: results,
        summary: {
            totalInFile: totalCertificates,
            foundInBridge: foundInBridge,
            missingFromBridge: missingFromBridge,
            inBridgeNotInFile: 0, // Not applicable with individual lookups
            bridgeOnlyThumbprints: [] // Not applicable with individual lookups
        }
    };

    logger.trace(applicationName + ':processCertificatesWithProgress:Completed');
    return returnValue;
}

async function processCertificateWithBridgeLookup(cert) {
    logger.trace(applicationName + ':processCertificateWithBridgeLookup:Started');

    const certStartTime = Date.now();
    logger.debug('Starting processCertificateWithBridgeLookup', {
        officialId: cert.OFFICIALID || cert.officialId,
        name: cert.NAME || cert.name,
        countryCode: cert.COUNTRYCODE || cert.countryCode,
        availableFields: Object.keys(cert)
    });

    try {
        // First calculate the thumbprint
        const thumbprint = await calculateThumbprintFromCert(cert);

        // Then check against bridge using the thumbprint
        const found = await checkThumbprintInBridge(thumbprint);

        const totalProcessTime = Date.now() - certStartTime;

        logger.info('Certificate with bridge lookup completed', {
            officialId: cert.OFFICIALID || cert.officialId,
            name: cert.NAME || cert.name,
            thumbprint: thumbprint,
            found: found,
            totalProcessTime: totalProcessTime
        });

        const returnValue = {
            officialId: cert.OFFICIALID || cert.officialId || 'Unknown',
            countryCode: cert.COUNTRYCODE || cert.countryCode || 'Unknown',
            name: cert.NAME || cert.name || 'Unknown',
            thumbprint: thumbprint,
            found: found
        };

        logger.trace(applicationName + ':processCertificateWithBridgeLookup:Completed');
        return returnValue;
    } catch (error) {
        const totalProcessTime = Date.now() - certStartTime;
        logger.error('Failed to process certificate with bridge lookup', {
            error: error.message,
            stack: error.stack,
            officialId: cert.OFFICIALID || cert.officialId,
            processingTime: totalProcessTime
        });
        logger.trace(applicationName + ':processCertificateWithBridgeLookup:Failed');
        throw error;
    }
}

async function processCertificate(cert, bridgeThumbprints) {
    logger.trace(applicationName + ':processCertificate:Started');

    const certStartTime = Date.now();
    logger.debug('Starting processCertificate', {
        officialId: cert.OFFICIALID || cert.officialId,
        name: cert.NAME || cert.name,
        countryCode: cert.COUNTRYCODE || cert.countryCode,
        availableFields: Object.keys(cert),
        bridgeThumbprintsSize: bridgeThumbprints.size
    });

    // Extract certificate PEM from the object
    let pemCertificate = null;

    // Look for certificate in common field names
    const certFields = ['certificate', 'cert', 'pem', 'x509Certificate', 'Certificate', 'certificates'];
    logger.debug('Searching for certificate field', {
        searchFields: certFields,
        availableFields: Object.keys(cert)
    });

    for (const field of certFields) {
        if (cert[field]) {
            // Handle both single certificate and array of certificates
            if (Array.isArray(cert[field])) {
                // Take the first certificate from the array
                pemCertificate = cert[field][0];
                logger.debug('Found certificate array field', {
                    fieldName: field,
                    arrayLength: cert[field].length,
                    pemLength: pemCertificate?.length || 0,
                    startsWithBegin: pemCertificate?.startsWith('-----BEGIN') || false,
                    endsWithEnd: pemCertificate?.endsWith('-----END CERTIFICATE-----') || false
                });
            } else {
                pemCertificate = cert[field];
                logger.debug('Found certificate field', {
                    fieldName: field,
                    pemLength: pemCertificate.length,
                    startsWithBegin: pemCertificate.startsWith('-----BEGIN'),
                    endsWithEnd: pemCertificate.endsWith('-----END CERTIFICATE-----')
                });
            }
            break;
        }
    }

    if (!pemCertificate) {
        logger.error('No certificate field found', {
            availableFields: Object.keys(cert),
            searchedFields: certFields
        });
        throw new Error('No certificate field found in object');
    }

    // Fix the PEM format by replacing \n with actual newlines
    logger.debug('Processing PEM format', {
        originalLength: pemCertificate.length,
        hasEscapedNewlines: pemCertificate.includes('\\n')
    });

    let cleanPem = pemCertificate.replace(/\\n/g, '\n');

    // Ensure proper PEM format
    if (!cleanPem.startsWith('-----BEGIN CERTIFICATE-----')) {
        logger.debug('Adding missing BEGIN header');
        cleanPem = '-----BEGIN CERTIFICATE-----\n' + cleanPem;
    }
    if (!cleanPem.endsWith('-----END CERTIFICATE-----')) {
        logger.debug('Adding missing END footer');
        cleanPem = cleanPem + '\n-----END CERTIFICATE-----';
    }

    logger.debug('PEM format finalized', {
        finalLength: cleanPem.length,
        startsCorrectly: cleanPem.startsWith('-----BEGIN CERTIFICATE-----'),
        endsCorrectly: cleanPem.endsWith('-----END CERTIFICATE-----')
    });

    // Calculate SHA256 thumbprint
    logger.debug('Calculating certificate thumbprint');
    const thumbprintStartTime = Date.now();

    try {
        const thumbprint = calculateCertificateThumbprint(cleanPem);
        const thumbprintTime = Date.now() - thumbprintStartTime;

        logger.debug('Thumbprint calculated', {
            thumbprint: thumbprint,
            calculationTime: thumbprintTime
        });

        // Check if found in bridge (using the Set we built earlier)
        logger.debug('Checking thumbprint against bridge', {
            thumbprint: thumbprint,
            bridgeSize: bridgeThumbprints.size
        });

        const found = bridgeThumbprints.has(thumbprint);
        const totalProcessTime = Date.now() - certStartTime;

        logger.info('Certificate processing completed', {
            officialId: cert.OFFICIALID || cert.officialId,
            name: cert.NAME || cert.name,
            thumbprint: thumbprint,
            found: found,
            totalProcessTime: totalProcessTime,
            thumbprintTime: thumbprintTime
        });

        const returnValue = {
            officialId: cert.OFFICIALID || cert.officialId || 'Unknown',
            countryCode: cert.COUNTRYCODE || cert.countryCode || 'Unknown',
            name: cert.NAME || cert.name || 'Unknown',
            thumbprint: thumbprint,
            found: found
        };

        logger.trace(applicationName + ':processCertificate:Completed');
        return returnValue;
    } catch (error) {
        const totalProcessTime = Date.now() - certStartTime;
        logger.error('Failed to calculate thumbprint', {
            error: error.message,
            stack: error.stack,
            officialId: cert.OFFICIALID || cert.officialId,
            pemLength: cleanPem?.length || 'undefined',
            processingTime: totalProcessTime
        });
        logger.trace(applicationName + ':processCertificate:Failed');
        throw error;
    }
}

function calculateCertificateThumbprint(pemCertificate) {
    logger.trace(applicationName + ':calculateCertificateThumbprint:Started');

    logger.debug('Starting thumbprint calculation', {
        pemLength: pemCertificate.length,
        hasBeginHeader: pemCertificate.includes('-----BEGIN CERTIFICATE-----'),
        hasEndHeader: pemCertificate.includes('-----END CERTIFICATE-----')
    });

    // Extract the certificate data (remove headers and newlines)
    const certificateData = pemCertificate
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\n/g, '')
        .replace(/\r/g, '');

    logger.debug('Certificate data extracted', {
        originalLength: pemCertificate.length,
        extractedLength: certificateData.length,
        isValidBase64: /^[A-Za-z0-9+/]*={0,2}$/.test(certificateData)
    });

    try {
        // Convert from base64 to binary
        const certificateBuffer = Buffer.from(certificateData, 'base64');
        logger.debug('Base64 decoded', {
            bufferLength: certificateBuffer.length
        });

        // Calculate SHA256 hash
        const hash = crypto.createHash('sha256');
        hash.update(certificateBuffer);
        const sha256 = hash.digest();

        // Convert to base64
        const thumbprint = sha256.toString('base64');

        logger.debug('Thumbprint calculation completed', {
            thumbprint: thumbprint,
            sha256Length: sha256.length
        });

        logger.trace(applicationName + ':calculateCertificateThumbprint:Completed');
        return thumbprint;
    } catch (error) {
        logger.error('Failed to calculate thumbprint', {
            error: error.message,
            stack: error.stack,
            certificateDataLength: certificateData?.length || 'undefined',
            certificateDataSample: certificateData?.substring(0, 100) || 'undefined'
        });
        logger.trace(applicationName + ':calculateCertificateThumbprint:Failed');
        throw error;
    }
}

async function calculateThumbprintFromCert(cert) {
    logger.trace(applicationName + ':calculateThumbprintFromCert:Started');

    // Extract certificate PEM from the object
    let pemCertificate = null;

    // Look for certificate in common field names
    const certFields = ['certificate', 'cert', 'pem', 'x509Certificate', 'Certificate', 'certificates'];
    logger.debug('Searching for certificate field', {
        searchFields: certFields,
        availableFields: Object.keys(cert)
    });

    for (const field of certFields) {
        if (cert[field]) {
            // Handle both single certificate and array of certificates
            if (Array.isArray(cert[field])) {
                // Take the first certificate from the array
                pemCertificate = cert[field][0];
                logger.debug('Found certificate array field', {
                    fieldName: field,
                    arrayLength: cert[field].length,
                    pemLength: pemCertificate?.length || 0,
                    startsWithBegin: pemCertificate?.startsWith('-----BEGIN') || false,
                    endsWithEnd: pemCertificate?.endsWith('-----END CERTIFICATE-----') || false
                });
            } else {
                pemCertificate = cert[field];
                logger.debug('Found certificate field', {
                    fieldName: field,
                    pemLength: pemCertificate.length,
                    startsWithBegin: pemCertificate.startsWith('-----BEGIN'),
                    endsWithEnd: pemCertificate.endsWith('-----END CERTIFICATE-----')
                });
            }
            break;
        }
    }

    if (!pemCertificate) {
        logger.error('No certificate field found', {
            availableFields: Object.keys(cert),
            searchedFields: certFields
        });
        throw new Error('No certificate field found in object');
    }

    // Fix the PEM format by replacing \n with actual newlines
    let cleanPem = pemCertificate.replace(/\\n/g, '\n');

    // Ensure proper PEM format
    if (!cleanPem.startsWith('-----BEGIN CERTIFICATE-----')) {
        cleanPem = '-----BEGIN CERTIFICATE-----\n' + cleanPem;
    }
    if (!cleanPem.endsWith('-----END CERTIFICATE-----')) {
        cleanPem = cleanPem + '\n-----END CERTIFICATE-----';
    }

    // Calculate SHA256 thumbprint
    const thumbprint = calculateCertificateThumbprint(cleanPem);

    logger.trace(applicationName + ':calculateThumbprintFromCert:Completed');
    return thumbprint;
}

async function checkThumbprintInBridge(thumbprint, forceRefresh = false) {
    logger.trace(applicationName + ':checkThumbprintInBridge:Started');

    try {
        // First, check cache unless forcing refresh
        let cacheEntry = null;
        if (!forceRefresh) {
            cacheEntry = await EbsiCache.findOne({ thumbprint });
            if (cacheEntry) {
                logger.debug('Cache hit for thumbprint', {
                    thumbprint: thumbprint.substring(0, 16) + '...',
                    found: cacheEntry.found,
                    lastChecked: cacheEntry.lastChecked,
                    hitCount: cacheEntry.hitCount
                });

                // Update hit count
                cacheEntry.hitCount += 1;
                await cacheEntry.save();

                logger.trace(applicationName + ':checkThumbprintInBridge:Completed');
                return cacheEntry.found;
            }
        }

        // Cache miss or forced refresh - query EBSI bridge
        logger.debug('Cache miss for thumbprint, querying EBSI bridge', {
            thumbprint: thumbprint.substring(0, 16) + '...',
            forceRefresh
        });

        // Normalize thumbprint for EBSI query (convert to base64url if needed)
        const normalizationResult = normalizeThumbprintForEbsi(thumbprint);
        const ebsiThumbprint = normalizationResult.normalized;

        logger.info('Thumbprint encoding for EBSI query', {
            originalThumbprint: thumbprint.substring(0, 16) + '...',
            normalizedThumbprint: ebsiThumbprint.substring(0, 16) + '...',
            conversionApplied: normalizationResult.conversionApplied
        });

        const bridgeStartTime = Date.now();
        // Use raw base64url thumbprint without URL encoding for EBSI
        const url = `https://resolver-test.ebsi.eu/api/v1/issuers?x509Thumbprint=${ebsiThumbprint}`;

        logger.debug('Making EBSI bridge API request for thumbprint', {
            url: url,
            originalThumbprint: thumbprint.substring(0, 16) + '...',
            ebsiThumbprint: ebsiThumbprint.substring(0, 16) + '...',
            conversionApplied: normalizationResult.conversionApplied,
            timeout: 10000
        });

        const bridgeResponse = await axios.get(url, {
            timeout: 10000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'QR-Scanner-App/1.0'
            }
        });

        const bridgeRequestTime = Date.now() - bridgeStartTime;
        logger.info('EBSI bridge API response received for thumbprint', {
            responseTime: bridgeRequestTime,
            status: bridgeResponse.status,
            dataType: typeof bridgeResponse.data,
            isArray: Array.isArray(bridgeResponse.data),
            dataLength: Array.isArray(bridgeResponse.data) ? bridgeResponse.data.length : 'N/A',
            thumbprint: thumbprint.substring(0, 16) + '...'
        });

        // Check if certificate was found in bridge
        const found = bridgeResponse.data && Array.isArray(bridgeResponse.data) && bridgeResponse.data.length > 0;

        // Update or create cache entry
        if (cacheEntry) {
            // Update existing entry
            await cacheEntry.updateWithEbsiResponse(bridgeResponse.data, bridgeResponse.status);
        } else {
            // Create new cache entry
            cacheEntry = await EbsiCache.findOrCreate(thumbprint);
            await cacheEntry.updateWithEbsiResponse(bridgeResponse.data, bridgeResponse.status);
        }

        logger.debug('Cache updated for thumbprint', {
            originalThumbprint: thumbprint.substring(0, 16) + '...',
            ebsiThumbprint: ebsiThumbprint.substring(0, 16) + '...',
            conversionApplied: normalizationResult.conversionApplied,
            found: found,
            cacheId: cacheEntry._id
        });

        logger.trace(applicationName + ':checkThumbprintInBridge:Completed');
        return found;

    } catch (error) {
        logger.error('Failed to check thumbprint in bridge', {
            error: error.message,
            stack: error.stack,
            thumbprint: thumbprint.substring(0, 16) + '...',
            code: error.code,
            response: error.response ? {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            } : 'No response'
        });

        // Still try to update/create cache entry with error info
        try {
            let cacheEntry = await EbsiCache.findOrCreate(thumbprint);
            await cacheEntry.updateWithEbsiResponse(
                null,
                error.response?.status || 0,
                error.message
            );
        } catch (cacheError) {
            logger.error('Failed to update cache with error', {
                cacheError: cacheError.message,
                originalError: error.message
            });
        }

        logger.trace(applicationName + ':checkThumbprintInBridge:Failed');
        return false;
    }
}

// Function to generate markdown report
function generateMarkdownReport(results, metadata = {}) {
    logger.trace(applicationName + ':generateMarkdownReport:Started');

    const { certificates, summary } = results;
    const reportDate = new Date().toISOString();
    const processingTime = metadata.processingTime || 'Unknown';
    const fileName = metadata.fileName || 'Unknown';

    let markdown = `# Certificate Bridge Check Report

## Report Information
- **Generated**: ${new Date(reportDate).toLocaleString()}
- **Source File**: ${fileName}
- **Processing Time**: ${processingTime}
- **Total Certificates Processed**: ${summary.totalInFile}

## Summary Statistics

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total Certificates in File** | ${summary.totalInFile} | 100% |
| **Found in EBSI Bridge** | ${summary.foundInBridge} | ${summary.totalInFile > 0 ? Math.round((summary.foundInBridge / summary.totalInFile) * 100) : 0}% |
| **Missing from Bridge** | ${summary.missingFromBridge} | ${summary.totalInFile > 0 ? Math.round((summary.missingFromBridge / summary.totalInFile) * 100) : 0}% |
| **Bridge Only (not in file)** | ${summary.inBridgeNotInFile} | - |

`;

    if (summary.foundInBridge > 0) {
        markdown += `## ✅ Certificates Found in Bridge (${summary.foundInBridge})\n\n`;
        markdown += `| Official ID | Country | Name | Thumbprint |\n`;
        markdown += `|-------------|---------|------|------------|\n`;

        certificates
            .filter(cert => cert.found)
            .forEach(cert => {
                markdown += `| ${cert.officialId} | ${cert.countryCode} | ${cert.name} | \`${cert.thumbprint}\` |\n`;
            });
        markdown += '\n';
    }

    if (summary.missingFromBridge > 0) {
        markdown += `## ❌ Certificates Missing from Bridge (${summary.missingFromBridge})\n\n`;
        markdown += `| Official ID | Country | Name | Thumbprint |\n`;
        markdown += `|-------------|---------|------|------------|\n`;

        certificates
            .filter(cert => !cert.found)
            .forEach(cert => {
                markdown += `| ${cert.officialId} | ${cert.countryCode} | ${cert.name} | \`${cert.thumbprint}\` |\n`;
            });
        markdown += '\n';
    }

    // Add detailed certificate list
    markdown += `## 📋 Complete Certificate List\n\n`;
    markdown += `| # | Official ID | Country | Name | Status | Thumbprint |\n`;
    markdown += `|---|-------------|---------|------|--------|------------|\n`;

    certificates.forEach((cert, index) => {
        const status = cert.found ? '✅ Found' : '❌ Missing';
        markdown += `| ${index + 1} | ${cert.officialId} | ${cert.countryCode} | ${cert.name} | ${status} | \`${cert.thumbprint}\` |\n`;
    });

    // Add footer
    markdown += `\n---\n\n`;
    markdown += `**Report generated by QR Scanner Certificate Processor**  \n`;
    markdown += `*EBSI Bridge: https://resolver-test.ebsi.eu/api/v1/issuers*  \n`;
    markdown += `*Generated on ${new Date(reportDate).toLocaleString()}*\n`;

    logger.trace(applicationName + ':generateMarkdownReport:Completed');
    return markdown;
}

// Background cache refresh function
async function refreshCacheInBackground() {
    logger.trace(applicationName + ':refreshCacheInBackground:Started');

    try {
        const entriesToRefresh = await EbsiCache.getEntriesNeedingRefresh(50); // Batch of 50
        logger.info('Starting background cache refresh', {
            entryCount: entriesToRefresh.length
        });

        for (const entry of entriesToRefresh) {
            try {
                // Use the cache-aware bridge check with force refresh
                await checkThumbprintInBridge(entry.thumbprint, true);

                // Small delay between requests to avoid overwhelming EBSI
                await new Promise(resolve => setTimeout(resolve, 100));

                logger.debug('Cache entry refreshed', {
                    thumbprint: entry.thumbprint.substring(0, 16) + '...'
                });
            } catch (error) {
                logger.error('Failed to refresh cache entry', {
                    thumbprint: entry.thumbprint.substring(0, 16) + '...',
                    error: error.message
                });
            }
        }

        // Check if there are more entries to refresh
        const remainingEntries = await EbsiCache.countDocuments({ needsRefresh: true });
        if (remainingEntries > 0) {
            logger.info('More cache entries need refresh, scheduling next batch', {
                remaining: remainingEntries
            });
            // Schedule next batch in 5 seconds
            setTimeout(() => {
                refreshCacheInBackground();
            }, 5000);
        } else {
            logger.info('Cache refresh completed');
        }

    } catch (error) {
        logger.error('Background cache refresh failed', {
            error: error.message,
            stack: error.stack
        });
    }

    logger.trace(applicationName + ':refreshCacheInBackground:Completed');
}

// Initialize cache on startup and set up periodic refresh
async function initializeCache() {
    logger.trace(applicationName + ':initializeCache:Started');

    try {
        const stats = await EbsiCache.getStats();
        logger.info('Cache initialization - current stats', stats);

        // Check if cache needs initial refresh (older than 24 hours or no entries)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const staleEntries = await EbsiCache.countDocuments({
            lastChecked: { $lt: twentyFourHoursAgo }
        });

        if (staleEntries > 0 || stats.total === 0) {
            logger.info('Cache needs refresh, marking entries', {
                staleEntries,
                totalEntries: stats.total
            });
            await EbsiCache.markAllForRefresh();

            // Start background refresh after a short delay
            setTimeout(() => {
                refreshCacheInBackground();
            }, 5000);
        }

        // Set up periodic refresh (every 24 hours)
        setInterval(async () => {
            logger.info('Periodic cache refresh triggered');
            await EbsiCache.markAllForRefresh();
            setTimeout(() => {
                refreshCacheInBackground();
            }, 1000);
        }, 24 * 60 * 60 * 1000); // 24 hours

    } catch (error) {
        logger.error('Cache initialization failed', {
            error: error.message,
            stack: error.stack
        });
    }

    logger.trace(applicationName + ':initializeCache:Completed');
}

// Call cache initialization when the module loads
initializeCache();

module.exports = router;