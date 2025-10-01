const express = require('express');
const router = express.Router();
const Scan = require('../models/Scan');
const EbsiCache = require('../models/EbsiCache');
const { isAuthenticated } = require('../middleware/auth');
const { getTranslation } = require('../utils/translations');

// Get application mode from environment
const APP_MODE = (process.env.MODE || 'DEBUG').toUpperCase();
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

// Schema lookup table - maps JWT SID to schema file names
const fs = require('fs');
const path = require('path');

// SID to schema version mapping
const sidSchemaMapping = {
    'eessi:prc:1.0': 'schema-prc-jws-v1.json'
};

// Schema retrieval endpoint - uses JWT SID to find correct schema
router.post('/api/schema', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                error: 'Missing token',
                message: 'JWT token is required in request body'
            });
        }

        let sid = null;
        let payload = null;

        try {
            // Decode JWT without verification to get payload and SID
            const parts = token.split('.');
            if (parts.length === 3) {
                payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                sid = payload.sid || null;
            }
        } catch (decodeError) {
            logger.error('Failed to decode JWT:', decodeError);
            return res.status(400).json({
                error: 'Invalid token',
                message: 'Failed to decode JWT token'
            });
        }

        logger.info('Schema requested for SID:', { sid });

        // Determine which schema file to use based on SID
        let schemaFileName = sidSchemaMapping[sid];

        if (!schemaFileName) {
            return res.status(404).json({
                success: false,
                error: 'Schema mapping not found',
                message: `No schema mapping found for SID: ${sid}`,
                availableSids: Object.keys(sidSchemaMapping)
            });
        }

        // If there's a specific mapping for this SID's pattern, use it
        // For example, if SID contains version info
        if (sid && sid.includes('v2')) {
            schemaFileName = 'ehic-v2.0.json';
        } else if (sid && sid.includes('v1')) {
            schemaFileName = 'ehic-v1.0.json';
        }

        // Build path to schema file
        const schemaPath = path.join(__dirname, '..', 'schemas', schemaFileName);

        // Check if schema file exists
        if (!fs.existsSync(schemaPath)) {
            logger.warn('Schema file not found:', { schemaPath, sid });
            return res.status(404).json({
                error: 'Schema not found',
                message: `No schema file found: ${schemaFileName}`,
                sid: sid
            });
        }

        // Read and parse schema file
        const schemaContent = fs.readFileSync(schemaPath, 'utf8');
        const schema = JSON.parse(schemaContent);

        // Return the schema
        logger.info('Schema retrieved successfully:', {
            sid,
            schemaFile: schemaFileName
        });

        res.json({
            sid: sid,
            schemaVersion: schemaFileName.replace('.json', ''),
            schema: schema,
            retrieved: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error retrieving schema:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to retrieve schema'
        });
    }
});

// Schema validation endpoint - validates JWT payload against retrieved schema
router.post('/api/validate-jwt-with-schema', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                error: 'Missing token',
                message: 'JWT token is required in request body'
            });
        }

        let sid = null;
        let payload = null;
        let cert = null;

        try {
            // Decode JWT to get payload, SID, and certificate data
            const parts = token.split('.');
            if (parts.length === 3) {
                payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                sid = payload.sid || null;
                cert = payload.prc || payload.cert || null;
            }
        } catch (decodeError) {
            logger.error('Failed to decode JWT:', decodeError);
            return res.status(400).json({
                error: 'Invalid token',
                message: 'Failed to decode JWT token'
            });
        }

        if (!cert) {
            return res.status(400).json({
                error: 'No certificate data',
                message: 'JWT does not contain certificate data (prc or cert field)'
            });
        }

        // Determine which schema file to use based on SID
        let schemaFileName = sidSchemaMapping[sid];

        if (!schemaFileName) {
            return res.status(404).json({
                success: false,
                error: 'Schema mapping not found',
                message: `No schema mapping found for SID: ${sid}`,
                availableSids: Object.keys(sidSchemaMapping)
            });
        }

        if (sid && sid.includes('v2')) {
            schemaFileName = 'ehic-v2.0.json';
        } else if (sid && sid.includes('v1')) {
            schemaFileName = 'ehic-v1.0.json';
        }

        // Build path to schema file
        const schemaPath = path.join(__dirname, '..', 'schemas', schemaFileName);

        // Check if schema file exists
        if (!fs.existsSync(schemaPath)) {
            return res.status(404).json({
                error: 'Schema not found',
                message: `No schema file found: ${schemaFileName}`,
                sid: sid
            });
        }

        // Read and parse schema file
        const schemaContent = fs.readFileSync(schemaPath, 'utf8');
        const schema = JSON.parse(schemaContent);

        // Perform validation
        const validationErrors = [];

        // Check required fields
        if (schema.required) {
            for (const field of schema.required) {
                if (!cert[field]) {
                    validationErrors.push({
                        field: field,
                        error: 'Required field missing',
                        value: cert[field]
                    });
                }
            }
        }

        // Check property types and patterns
        if (schema.properties) {
            for (const [key, rules] of Object.entries(schema.properties)) {
                if (cert[key] !== undefined && cert[key] !== null) {
                    // Pattern check for strings
                    if (rules.pattern && typeof cert[key] === 'string') {
                        const pattern = new RegExp(rules.pattern);
                        if (!pattern.test(cert[key])) {
                            validationErrors.push({
                                field: key,
                                error: `Value does not match pattern ${rules.pattern}`,
                                value: cert[key]
                            });
                        }
                    }

                    // String length checks
                    if (typeof cert[key] === 'string') {
                        if (rules.minLength && cert[key].length < rules.minLength) {
                            validationErrors.push({
                                field: key,
                                error: `Minimum length is ${rules.minLength}`,
                                value: cert[key],
                                actualLength: cert[key].length
                            });
                        }
                        if (rules.maxLength && cert[key].length > rules.maxLength) {
                            validationErrors.push({
                                field: key,
                                error: `Maximum length is ${rules.maxLength}`,
                                value: cert[key],
                                actualLength: cert[key].length
                            });
                        }
                    }
                }
            }
        }

        // Log validation result
        logger.info('Schema validation completed:', {
            sid: sid,
            schemaVersion: schemaFileName,
            valid: validationErrors.length === 0,
            errorCount: validationErrors.length
        });

        // Return validation result
        if (validationErrors.length > 0) {
            return res.status(422).json({
                valid: false,
                sid: sid,
                schemaVersion: schemaFileName.replace('.json', ''),
                errors: validationErrors,
                validated: new Date().toISOString()
            });
        }

        res.json({
            valid: true,
            sid: sid,
            schemaVersion: schemaFileName.replace('.json', ''),
            message: 'Certificate data is valid according to schema',
            validated: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error validating JWT data:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to validate data'
        });
    }
});

// Landing page route
router.get('/landing', isAuthenticated, (req, res) => {
    res.render('landing');
});

// Treatment date route
router.get('/treatment-date', isAuthenticated, (req, res) => {
    res.render('treatment-date');
});

// Identity check route
router.get('/identity-check', isAuthenticated, (req, res) => {
    res.render('identity-check');
});

router.get('/', (req, res) => {
    res.render('landing', { user: req.user });
});

// Scanner page (moved from root)
router.get('/scanner', isAuthenticated, (req, res) => {
    res.render('scan', { user: req.user });
});

router.get('/scan-history', isAuthenticated, async (req, res) => {
    // Only accessible in DEBUG mode
    if (APP_MODE !== 'DEBUG') {
        return res.status(403).render('error', {
            message: 'History is not available in production mode',
            user: req.user
        });
    }

    try {
        const scans = await Scan.find({ userId: req.user._id }).sort({ scannedAt: -1 });
        res.render('history', {
            scans,
            user: req.user,
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
        res.render('history', {
            scans: [],
            user: req.user,
            formatBytes: function() { return ''; }
        });
    }
});

router.post('/api/scans', isAuthenticated, async (req, res) => {
    try {
        const { content, type, deviceInfo } = req.body;

        // In PRODUCTION mode, don't save scans to database
        if (APP_MODE === 'PRODUCTION') {
            return res.status(201).json({
                message: 'Scan processed (not saved in production mode)',
                scan: {
                    content,
                    type,
                    deviceInfo,
                    scannedAt: new Date()
                },
                isDuplicate: false,
                duplicateCount: 1,
                productionMode: true
            });
        }

        // DEBUG mode: Save scans to database
        // Check if this content has been scanned before (for this user)
        const existingScan = await Scan.findOne({
            content: content,
            userId: req.user._id
        }).sort({ scannedAt: -1 });

        if (existingScan) {
            // Update existing scan with new scan time and increment count
            existingScan.scannedAt = new Date();
            existingScan.duplicateCount += 1;
            existingScan.isDuplicate = true;
            existingScan.deviceInfo = deviceInfo;

            await existingScan.save();
            res.status(201).json({
                message: 'Duplicate scan updated',
                scan: existingScan,
                isDuplicate: true,
                duplicateCount: existingScan.duplicateCount
            });
        } else {
            // Create new scan
            const scan = new Scan({
                userId: req.user._id,
                content,
                type,
                deviceInfo,
                firstScannedAt: new Date()
            });

            await scan.save();
            res.status(201).json({
                message: 'New scan saved successfully',
                scan,
                isDuplicate: false,
                duplicateCount: 1
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


// Verification route
router.get('/verify', isAuthenticated, (req, res) => {
    // Only accessible in DEBUG mode
    if (APP_MODE !== 'DEBUG') {
        return res.status(403).render('error', {
            message: 'Verify page is not available in production mode',
            user: req.user
        });
    }
    res.render('verify', { user: req.user });
});

// Results route
router.get('/results', isAuthenticated, (req, res) => {
    res.render('results', { user: req.user });
});

// Finalization route
router.get('/finalization', isAuthenticated, (req, res) => {
    res.render('finalization', { user: req.user });
});

// Email verification summary endpoint
router.post('/api/send-verification-email', isAuthenticated, async (req, res) => {
    try {
        const { email, referenceNumber, treatmentDate, verificationData, verificationStatus, identityVerification, timestamp, language } = req.body;

        // Validate email
        if (!email || !email.includes('@')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email address'
            });
        }

        // Log the email request
        logger.info('Verification email request', {
            to: email,
            referenceNumber: referenceNumber,
            timestamp: timestamp
        });

        // In production, you would configure nodemailer here
        // For now, we'll simulate the email sending

        // Example of what the email implementation would look like:
        
        const nodemailer = require('nodemailer');

        // Check if email configuration is available
        if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
            logger.warn('Email configuration missing, email will not be sent', {
                hasHost: !!process.env.SMTP_HOST,
                hasUser: !!process.env.SMTP_USER,
                hasPass: !!process.env.SMTP_PASS
            });

            // Return success but indicate email was not actually sent
            return res.json({
                success: true,
                message: 'Email configuration pending - summary saved',
                recipient: email,
                note: 'Email service not configured on this server'
            });
        }

        // Configure transporter (this would use environment variables in production)
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        // Generate PDF attachment with verification evidence
        const PDFDocument = require('pdfkit');
        const QRCode = require('qrcode');
        const fs = require('fs');
        const path = require('path');

        // Create PDF document
        const doc = new PDFDocument();
        const pdfFileName = `verification-${referenceNumber}.pdf`;
        const pdfPath = path.join(__dirname, '..', 'temp', pdfFileName);

        // Ensure temp directory exists
        const tempDir = path.join(__dirname, '..', 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }

        // Stream to file
        doc.pipe(fs.createWriteStream(pdfPath));

        // Add PRC Certificate header with translation
        const userLanguage = language || 'en';

        // Initialize pdfLanguage with default value (will be updated after prcData is populated)
        let pdfLanguage = 'en'; // Default fallback

        // Determine PDF language based on issuing country
        // Country code to language mapping (ISO 3166-1 alpha-2 to ISO 639-1)
        const countryToLanguageMap = {
            // EU/EEA countries
            'AT': 'de', // Austria - German
            'BE': 'en', // Belgium - Exception: English
            'BG': 'bg', // Bulgaria - Bulgarian
            'HR': 'hr', // Croatia - Croatian
            'CY': 'el', // Cyprus - Greek
            'CZ': 'cs', // Czech Republic - Czech
            'DK': 'da', // Denmark - Danish
            'EE': 'et', // Estonia - Estonian
            'FI': 'fi', // Finland - Finnish
            'FR': 'fr', // France - French
            'DE': 'de', // Germany - German
            'GR': 'el', // Greece - Greek
            'HU': 'hu', // Hungary - Hungarian
            'IS': 'is', // Iceland - Icelandic
            'IE': 'en', // Ireland - Exception: English
            'IT': 'it', // Italy - Italian
            'LV': 'lv', // Latvia - Latvian
            'LI': 'de', // Liechtenstein - German
            'LT': 'lt', // Lithuania - Lithuanian
            'LU': 'en', // Luxembourg - Exception: English
            'MT': 'en', // Malta - Exception: English
            'NL': 'nl', // Netherlands - Dutch
            'NO': 'no', // Norway - Norwegian
            'PL': 'pl', // Poland - Polish
            'PT': 'pt', // Portugal - Portuguese
            'RO': 'ro', // Romania - Romanian
            'SK': 'sk', // Slovakia - Slovak
            'SI': 'sl', // Slovenia - Slovenian
            'ES': 'es', // Spain - Spanish
            'SE': 'sv', // Sweden - Swedish
            'CH': 'en'  // Switzerland - Exception: English
        };

        // Move up to reduce top margin before main title
        doc.moveUp(2.5);

        // Main titles: Arial 12pt Bold (always in English)
        doc.font('Helvetica-Bold').fontSize(12)
           .text(getTranslation('pdf-title1', pdfLanguage), { align: 'center' });
        doc.text(getTranslation('pdf-title2', pdfLanguage), { align: 'center' });
        doc.text(getTranslation('pdf-title3', pdfLanguage), { align: 'center' });

        // Subtitles: Arial 9pt Italics (always in English)
        doc.font('Helvetica-Oblique').fontSize(9)
           .text(getTranslation('pdf-subtitle1', pdfLanguage), { align: 'center' });
        doc.text(getTranslation('pdf-subtitle2', pdfLanguage), { align: 'center' });
        doc.moveDown(1); // Add some margin between subtitle and next section

        // STATUS SYMBOLS - to be used later
        const statusSymbol = (status) => status ? '✅' : '❌';

        // Helper function to get validation status (used by both PDF and email)
        const validationData = verificationStatus?.validationSummary || verificationStatus?.steps || {};
        const getValidationStatus = (key, fallbackKey) => {
            const validation = validationData[key];
            if (validation && typeof validation === 'object') {
                return validation.status === 'success';
            }
            // Fallback to old boolean format
            return validationData[fallbackKey] || false;
        };

        // Helper function to check if validation was skipped
        const getValidationSkipped = (key) => {
            const validation = validationData[key];
            if (validation && typeof validation === 'object') {
                return validation.status === 'skipped';
            }
            return false;
        };

        // Extract EHIC/PRC data from JWT payload
        let prcData = {
            issuingMemberState: 'N/A',
            cardHolderName: 'N/A',
            cardHolderGivenName: 'N/A',
            dateOfBirth: 'N/A',
            personalIdNumber: 'N/A',
            institutionId: 'N/A',
            institutionName: 'N/A',
            cardId: 'N/A',
            expiryDate: 'N/A',
            validityStart: 'N/A',
            validityEnd: 'N/A',
            deliveryDate: 'N/A'
        };

        // Debug: Log the verification status structure
        logger.debug('Verification status structure for JWT parsing', {
            hasVerificationStatus: !!verificationStatus,
            hasDetails: !!verificationStatus?.details,
            hasJwt: !!verificationStatus?.details?.jwt,
            hasPayload: !!verificationStatus?.details?.jwt?.payload,
            verificationStatusKeys: verificationStatus ? Object.keys(verificationStatus) : [],
            detailsKeys: verificationStatus?.details ? Object.keys(verificationStatus.details) : []
        });

        if (verificationStatus?.details?.jwt?.payload) {
            const payload = verificationStatus.details.jwt.payload;

            logger.debug('JWT payload structure', {
                payloadKeys: Object.keys(payload),
                hasHcert: !!payload.hcert,
                hcertStructure: payload.hcert ? Object.keys(payload.hcert) : []
            });

            // Check for EHIC/PRC specific structure - try both formats
            let cert = null;

            if (payload.prc) {
                // New structure: payload.prc
                cert = payload.prc;
                logger.debug('Certificate data found in payload.prc', {
                    certKeys: Object.keys(cert),
                    ic: cert.ic,
                    fn: cert.fn,
                    gn: cert.gn,
                    dob: cert.dob,
                    hi: cert.hi,
                    ii: cert.ii,
                    in: cert.in
                });
            } else if (payload.hcert && payload.hcert.v) {
                // Legacy structure: payload.hcert.v[0]
                cert = payload.hcert.v[0];
                logger.debug('Certificate data found in payload.hcert.v[0]', {
                    certKeys: Object.keys(cert),
                    ic: cert.ic,
                    fn: cert.fn,
                    gn: cert.gn,
                    dob: cert.dob,
                    hi: cert.hi,
                    ii: cert.ii,
                    in: cert.in
                });
            }

            if (cert) {

                // Debug: Log all certificate fields to see what's available
                logger.info('Certificate fields available:', Object.keys(cert));
                logger.info('Certificate institution fields:', {
                    ii: cert.ii,
                    in: cert.in,
                    raw_cert: JSON.stringify(cert)
                });

                // Institution fields - ii is the ID, in is the name
                // According to EHIC spec, field 7 should show the institution ID (ii)
                let institutionId = cert.ii || 'N/A';
                let institutionName = cert.in || 'N/A';

                prcData = {
                    issuingMemberState: cert.ic || payload.iss?.split('/').pop() || 'N/A',  // 2. Issuing Member State
                    cardHolderName: cert.fn || 'N/A',                                        // 3. Name
                    cardHolderGivenName: cert.gn || 'N/A',                                   // 4. Given name(s)
                    dateOfBirth: cert.dob ? formatDate(cert.dob) : 'N/A',                   // 5. Date of birth
                    personalIdNumber: cert.hi || 'N/A',                                      // 6. Personal identification number
                    institutionId: institutionId,                                            // 7. Institution ID (ii field)
                    institutionName: institutionName,                                        // Institution name (in field)
                    cardId: cert.ci || 'N/A',                                                // 8. Card ID (not in mapping but keeping)
                    expiryDate: cert.xd ? formatDate(cert.xd) : 'N/A',                     // 9. Expiry date (not in mapping but keeping)
                    validityStart: cert.sd ? formatDate(cert.sd) : 'N/A',                   // (a). Certificate validity period From
                    validityEnd: cert.ed ? formatDate(cert.ed) : 'N/A',                     // (b). Certificate validity period To
                    deliveryDate: cert.di ? formatDate(cert.di) : 'N/A'                     // (c). Certificate delivery date
                };

                logger.info('PRC data successfully extracted from JWT', {
                    issuingMemberState: prcData.issuingMemberState,
                    cardHolderName: prcData.cardHolderName,
                    cardHolderGivenName: prcData.cardHolderGivenName,
                    institutionId: prcData.institutionId
                });
            } else {
                logger.warn('JWT payload structure not as expected', {
                    hasHcert: !!payload.hcert,
                    hcertType: typeof payload.hcert,
                    payloadStructure: JSON.stringify(payload, null, 2).substring(0, 500)
                });
            }
        } else {
            logger.warn('No JWT payload found in verification status', {
                verificationStatusStructure: JSON.stringify(verificationStatus, null, 2).substring(0, 500)
            });

            // Try alternative data sources
            if (verificationData) {
                logger.info('Attempting to parse JWT from verification data directly');
                try {
                    // Try to decode the JWT from verification data if it's available
                    const jwt = require('jsonwebtoken');
                    const decoded = jwt.decode(verificationData, { complete: true });

                    let cert = null;
                    if (decoded && decoded.payload) {
                        if (decoded.payload.prc) {
                            cert = decoded.payload.prc;
                        } else if (decoded.payload.hcert && decoded.payload.hcert.v) {
                            cert = decoded.payload.hcert.v[0];
                        }
                    }

                    if (cert) {

                        logger.info('Successfully decoded JWT from verification data', {
                            certKeys: Object.keys(cert)
                        });

                        // Institution fields - ii is the ID, in is the name
                        let institutionId = cert.ii || 'N/A';
                        let institutionName = cert.in || 'N/A';

                        prcData = {
                            issuingMemberState: cert.ic || 'N/A',
                            cardHolderName: cert.fn || 'N/A',
                            cardHolderGivenName: cert.gn || 'N/A',
                            dateOfBirth: cert.dob ? formatDate(cert.dob) : 'N/A',
                            personalIdNumber: cert.hi || 'N/A',
                            institutionId: institutionId,
                            institutionName: institutionName,
                            cardId: cert.ci || 'N/A',
                            expiryDate: cert.xd ? formatDate(cert.xd) : 'N/A',
                            validityStart: cert.sd ? formatDate(cert.sd) : 'N/A',
                            validityEnd: cert.ed ? formatDate(cert.ed) : 'N/A',
                            deliveryDate: cert.di ? formatDate(cert.di) : 'N/A'
                        };

                        logger.info('PRC data extracted from direct JWT parsing', {
                            issuingMemberState: prcData.issuingMemberState,
                            cardHolderName: prcData.cardHolderName,
                            cardHolderGivenName: prcData.cardHolderGivenName,
                            institutionId: prcData.institutionId
                        });
                    }
                } catch (directJwtError) {
                    logger.error('Failed to decode JWT directly from verification data', {
                        error: directJwtError.message
                    });

                    // Last resort: try to process the verification data through the full chain
                    logger.info('Attempting full QR code processing chain');
                    try {
                        const base45 = require('base45');
                        const pako = require('pako');

                        // Step 1: BASE45 decode
                        const base45Decoded = base45.decode(verificationData);

                        // Step 2: ZLIB decompress
                        const zlibDecompressed = pako.inflate(base45Decoded, { to: 'string' });

                        // Step 3: Parse JWT
                        const jwtDecoded = jwt.decode(zlibDecompressed, { complete: true });

                        let cert = null;
                        if (jwtDecoded && jwtDecoded.payload) {
                            if (jwtDecoded.payload.prc) {
                                cert = jwtDecoded.payload.prc;
                            } else if (jwtDecoded.payload.hcert && jwtDecoded.payload.hcert.v) {
                                cert = jwtDecoded.payload.hcert.v[0];
                            }
                        }

                        if (cert) {

                            logger.info('Successfully processed full QR code chain', {
                                certKeys: Object.keys(cert)
                            });

                            // Institution fields - ii is the ID, in is the name
                            let institutionId = cert.ii || 'N/A';
                            let institutionName = cert.in || 'N/A';

                            prcData = {
                                issuingMemberState: cert.ic || 'N/A',
                                cardHolderName: cert.fn || 'N/A',
                                cardHolderGivenName: cert.gn || 'N/A',
                                dateOfBirth: cert.dob ? formatDate(cert.dob) : 'N/A',
                                personalIdNumber: cert.hi || 'N/A',
                                institutionId: institutionId,
                                institutionName: institutionName,
                                cardId: cert.ci || 'N/A',
                                expiryDate: cert.xd ? formatDate(cert.xd) : 'N/A',
                                validityStart: cert.sd ? formatDate(cert.sd) : 'N/A',
                                validityEnd: cert.ed ? formatDate(cert.ed) : 'N/A',
                                deliveryDate: cert.di ? formatDate(cert.di) : 'N/A'
                            };

                            logger.info('PRC data extracted from full QR processing chain', {
                                issuingMemberState: prcData.issuingMemberState,
                                cardHolderName: prcData.cardHolderName,
                                cardHolderGivenName: prcData.cardHolderGivenName,
                                institutionId: prcData.institutionId
                            });
                        }
                    } catch (fullChainError) {
                        logger.error('Failed to process full QR code chain', {
                            error: fullChainError.message
                        });
                    }
                }
            }
        }

        // Final verification that we have some data
        logger.info('Final PRC data status', {
            issuingMemberState: prcData.issuingMemberState,
            cardHolderName: prcData.cardHolderName,
            cardHolderGivenName: prcData.cardHolderGivenName,
            hasRealData: prcData.cardHolderName !== 'N/A' || prcData.issuingMemberState !== 'N/A'
        });

        // Update the PDF language based on issuing country
        if (prcData && prcData.issuingMemberState && prcData.issuingMemberState !== 'N/A') {
            pdfLanguage = countryToLanguageMap[prcData.issuingMemberState.toUpperCase()] || 'en';
        }

        logger.info('PDF language determination', {
            issuingCountry: prcData?.issuingMemberState || 'unknown',
            determinedLanguage: pdfLanguage,
            userRequestedLanguage: userLanguage
        });

        // Helper function to format dates
        function formatDate(dateStr) {
            try {
                if (!dateStr) return 'N/A';
                const date = new Date(dateStr);
                return date.toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
            } catch (e) {
                return dateStr; // Return original if parsing fails
            }
        }

        // PRC Certificate sections - exact template format

        // Calculate true page dimensions for left-aligned boxes
        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const leftMargin = doc.page.margins.left;  // True left edge
        const fullPageWidth = doc.page.width - leftMargin - doc.page.margins.right;  // Full width from true left

        // Ensure pageWidth is valid
        if (!pageWidth || isNaN(pageWidth) || pageWidth <= 0) {
            logger.error('Invalid page width calculated', { pageWidth, docPageWidth: doc.page.width });
            throw new Error('Invalid page dimensions for PDF generation');
        }

        // Right-aligned section header: Arial 9pt italics
        doc.font('Helvetica-Oblique').fontSize(9)
           .text(getTranslation('pdf-issuing-member-state', pdfLanguage), { align: 'right' });
        doc.moveDown(0.5);

        // Create bordered text boxes for fields 1 and 2
        const currentY = doc.y;
        const boxHeight = 30;
        const box1Width = pageWidth * 0.48;  // 48% of page width
        const box2Width = pageWidth * 0.48;  // 48% of page width
        const box2X = doc.x + pageWidth * 0.52; // Start at 52% to leave 2% gap

        // Validate coordinates
        if (isNaN(currentY) || isNaN(box1Width) || isNaN(box2Width) || isNaN(box2X)) {
            logger.error('Invalid coordinates calculated', {
                currentY, box1Width, box2Width, box2X, docX: doc.x, docY: doc.y
            });
            throw new Error('Invalid coordinates for PDF box generation');
        }

        // Box 1: "1." (0% to 48%) - Arial 9pt, reduced border weight
        doc.lineWidth(0.5); // Reduce border weight by 50%
        doc.rect(doc.x, currentY, box1Width, boxHeight).stroke();
        doc.font('Helvetica').fontSize(9).text('1.', doc.x + 5, currentY + 10);

        // Box 2: "2. [Country]" (52% to 100%) - Arial 9pt, reduced border weight
        doc.rect(box2X, currentY, box2Width, boxHeight).stroke();
        doc.text(`2. ${prcData.issuingMemberState}`, box2X + 5, currentY + 10);

        // Move cursor below the boxes
        doc.y = currentY + boxHeight + 10;

        // Card holder-related information - truly left-aligned header, Arial 9pt italics
        doc.font('Helvetica-Oblique').fontSize(9)
           .text(getTranslation('pdf-card-holder-info', pdfLanguage), leftMargin, doc.y);
        doc.moveDown(0.5);

        // Create grouped box for fields 3-6 - positioned at true left edge
        let fieldY = doc.y;

        // Validate fieldY
        if (isNaN(fieldY)) {
            logger.error('Invalid fieldY at field 3', { fieldY, docY: doc.y });
            fieldY = 300; // Set a safe starting position
        }

        const groupBoxHeight = 80; // Reduced height for tighter spacing (20px each)

        // Draw the outer group box from true left edge with reduced border weight
        doc.lineWidth(0.5); // Reduce border weight by 50%
        doc.rect(leftMargin, fieldY, fullPageWidth, groupBoxHeight).stroke();

        // Define consistent left margin for all fields (from true left edge)
        const fieldLeftMargin = leftMargin + 5;

        // Field 3: Name - Arial 9pt, truly left-aligned within box
        doc.font('Helvetica').fontSize(9)
           .text(`3. ${getTranslation('pdf-name-field', pdfLanguage)} ${prcData.cardHolderName}`,
                  fieldLeftMargin, fieldY + 8);

        // Field 4: Given name(s) - aligned exactly under field 3 with reduced spacing
        doc.text(`4. ${getTranslation('pdf-given-name-field', pdfLanguage)} ${prcData.cardHolderGivenName}`,
                 fieldLeftMargin, fieldY + 28);

        // Field 5: Date of birth - aligned exactly under field 4 with reduced spacing
        doc.text(`5. ${getTranslation('pdf-date-of-birth-field', pdfLanguage)} ${prcData.dateOfBirth}`,
                 fieldLeftMargin, fieldY + 48);

        // Field 6: Personal identification number - aligned exactly under field 5 with reduced spacing
        doc.text(`6. ${getTranslation('pdf-personal-id-field', pdfLanguage)} ${prcData.personalIdNumber}`,
                 fieldLeftMargin, fieldY + 68);

        // Move cursor below the group box
        const newDocY = fieldY + groupBoxHeight + 10;
        if (isNaN(newDocY)) {
            logger.error('Invalid doc.y calculation after card holder section', { fieldY, newDocY });
            doc.y = 400; // Safe fallback
        } else {
            doc.y = newDocY;
        }

        // Competent institution-related information - Arial 9pt italics, truly left-aligned
        doc.font('Helvetica-Oblique').fontSize(9)
           .text(getTranslation('pdf-competent-institution-info', pdfLanguage), leftMargin, doc.y);
        doc.moveDown(0.5);

        // Field 7: Institution information (larger box for multi-line content) - at true left edge
        fieldY = doc.y;

        // Validate fieldY for institution section
        if (isNaN(fieldY)) {
            logger.error('Invalid fieldY at institution section', { fieldY, docY: doc.y });
            fieldY = 450; // Set a safe position
        }

        const institutionBoxHeight = 35; // Increased to accommodate multi-line text
        doc.lineWidth(0.5); // Reduce border weight by 50%
        doc.rect(leftMargin, fieldY, fullPageWidth, institutionBoxHeight).stroke();

        // Institution ID and name content - render label and data separately for precise spacing control
        doc.font('Helvetica').fontSize(9);

        // Render the label first
        doc.text(`7. ${getTranslation('pdf-institution-id-field', pdfLanguage)}`, leftMargin + 5, fieldY + 5);

        // Move down by 0.35 line height (approximately 3.15 pixels for 9pt font)
        const lineSpacing = 3.15; // 0.35 * 9pt

        // Render the concatenated institution data with indentation
        let institutionData = "";
        if (prcData.institutionId !== 'N/A' && prcData.institutionName !== 'N/A') {
            institutionData = `    ${prcData.institutionId} - ${prcData.institutionName}`;
        } else if (prcData.institutionId !== 'N/A') {
            institutionData = `    ${prcData.institutionId}`;
        } else if (prcData.institutionName !== 'N/A') {
            institutionData = `    ${prcData.institutionName}`;
        } else {
            institutionData = `    N/A`;
        }

        // Debug: Log what we're trying to render
        logger.info('Rendering institution text in PDF:', {
            institutionId: prcData.institutionId,
            institutionName: prcData.institutionName,
            institutionData: institutionData
        });

        // Render the institution data at the calculated position with 0.35 line spacing
        // 9pt font has approximately 12 pixels line height, so 0.35 * 12 = 4.2 pixels
        doc.text(institutionData, leftMargin + 5, fieldY + 5 + 12 + lineSpacing, {
            width: fullPageWidth - 10
        });
        doc.moveDown(0.5);

        // Move cursor below the box
        doc.y = fieldY + institutionBoxHeight + 10;

        // Card-related information - Arial 9pt italics, truly left-aligned
        doc.font('Helvetica-Oblique').fontSize(9)
           .text(getTranslation('pdf-card-info', pdfLanguage), leftMargin, doc.y);
        doc.moveDown(0.5);

        // Fields 8 and 9: Combined in one box - Arial 9pt, at true left edge with reduced border weight
        fieldY = doc.y;
        const combinedBoxHeight = 45; // Height for both fields combined
        doc.lineWidth(0.5); // Reduce border weight by 50%
        doc.rect(leftMargin, fieldY, fullPageWidth, combinedBoxHeight).stroke();
        doc.font('Helvetica').fontSize(9)
           .text(`8. ${getTranslation('pdf-card-id-field', pdfLanguage)} ${prcData.cardId}`, leftMargin + 5, fieldY + 8);
        doc.text(`9. ${getTranslation('pdf-expiry-date-field', pdfLanguage)} ${prcData.expiryDate}`, leftMargin + 5, fieldY + 28);

        // Move cursor below the combined box
        doc.y = fieldY + combinedBoxHeight + 10;

        // Certificate validity period and delivery date - side by side layout
        // Calculate split box dimensions like the first section
        const validityBoxWidth = fullPageWidth * 0.48;  // 48% of page width
        const deliveryBoxWidth = fullPageWidth * 0.48;  // 48% of page width
        const deliveryBoxX = leftMargin + fullPageWidth * 0.52; // Start at 52% to leave 2% gap
        const splitBoxHeight = 50; // Height for both fields (a) and (b)

        // Save Y position for headers on same line
        const headerY = doc.y;

        // Certificate validity period header - left-aligned
        doc.font('Helvetica-Oblique').fontSize(9)
           .text(getTranslation('pdf-certificate-validity-period', pdfLanguage), leftMargin, headerY);

        // Certificate delivery date header - right-aligned at same Y position
        doc.text(getTranslation('pdf-certificate-delivery-date', pdfLanguage), deliveryBoxX, headerY);
        doc.moveDown(0.5);

        // Create split boxes at same Y level
        fieldY = doc.y;

        // Left box: Certificate validity period (48% width) with reduced border weight
        doc.lineWidth(0.5); // Reduce border weight by 50% (default is 1)
        doc.rect(leftMargin, fieldY, validityBoxWidth, splitBoxHeight).stroke();

        // Right box: Certificate delivery date (48% width, starting at 52%) with reduced border weight
        doc.rect(deliveryBoxX, fieldY, deliveryBoxWidth, splitBoxHeight).stroke();

        // Content for left box - Certificate validity period
        doc.font('Helvetica').fontSize(9)
           .text(`(a). ${getTranslation('pdf-from-field', pdfLanguage)} ${prcData.validityStart}`,
                  leftMargin + 5, fieldY + 8);
        doc.text(`(b). ${getTranslation('pdf-to-field', pdfLanguage)} ${prcData.validityEnd}`,
                 leftMargin + 5, fieldY + 28);

        // Content for right box - Certificate delivery date
        doc.text(`(c). ${prcData.deliveryDate}`, deliveryBoxX + 5, fieldY + 18);

        // Move cursor below the split boxes
        doc.y = fieldY + splitBoxHeight + 10;

        // Add signature section with QR code in signature box
        // Validate current Y position
        if (isNaN(doc.y)) {
            logger.error('Invalid doc.y before signature section', { docY: doc.y });
            doc.y = 500; // Set a safe fallback position
        }

        // Position "Signature and stamp of the institution" at 50% of page width
        const signatureHeaderX = leftMargin + (pageWidth * 0.52);
        doc.font('Helvetica-Oblique').fontSize(9)
           .text(getTranslation('pdf-signature-stamp', pdfLanguage), signatureHeaderX, doc.y);
        doc.moveDown();

        // Create signature box with QR code inside - positioned at 50% of page width (increased by 15%)
        const signatureBoxY = doc.y;
        const signatureBoxHeight = 160; // 150 * 1.15 = 172.5 ≈ 173
        const signatureBoxWidth = pageWidth * 0.35; // 48% * 1.15 ≈ 55% width
        const signatureBoxX = leftMargin + (pageWidth * 0.52); // Start at 52% to accommodate larger width

        // Validate signature box coordinates
        if (isNaN(signatureBoxY) || isNaN(signatureBoxHeight) || isNaN(signatureBoxWidth)) {
            logger.error('Invalid signature box coordinates', {
                signatureBoxY, signatureBoxHeight, signatureBoxWidth
            });
            throw new Error('Invalid signature box coordinates');
        }

        // Draw signature box border with reduced weight
        doc.lineWidth(0.5); // Reduce border weight by 50%
        doc.rect(signatureBoxX, signatureBoxY, signatureBoxWidth, signatureBoxHeight).stroke();

        // Add optimal QR code in the center of signature box
        if (verificationData) {
            try {
                // Generate optimal QR code with Q or H error correction and SVG output
                const optimalQR = await generateOptimalQRCodeForPDF(verificationData);

                if (optimalQR.success) {
                    // Calculate optimal size based on module count (increased by 15%)
                    const baseSize = 150; // 120 * 1.15 = 138
                    const scaleFactor = Math.max(1, Math.min(2, baseSize / optimalQR.moduleCount));
                    const qrCodeSize = Math.min(150, optimalQR.moduleCount * scaleFactor); // 130 * 1.15 ≈ 150

                    // Center QR code in signature box
                    const qrCodeX = signatureBoxX + (signatureBoxWidth - qrCodeSize) / 2;
                    const qrCodeY = signatureBoxY + (signatureBoxHeight - qrCodeSize) / 2;

                    

                    // Convert SVG to high-quality PNG buffer for PDF
                    const sharp = require('sharp');
                    const svgBuffer = Buffer.from(optimalQR.svgString);

                    // Convert SVG to PNG at high resolution for crisp rendering
                    const pngBuffer = await sharp(svgBuffer)
                        .png({
                            quality: 100,
                            compressionLevel: 0
                        })
                        .resize(qrCodeSize * 3, qrCodeSize * 3) // 3x resolution for crisp output
                        .toBuffer();

                    // Add high-resolution PNG to PDF
                    doc.image(pngBuffer, qrCodeX, qrCodeY, {
                        width: qrCodeSize,
                        height: qrCodeSize,
                        fit: [qrCodeSize, qrCodeSize]
                    });

                    // QR code label removed - provides no added value

                    logger.info('Optimal QR code generated for PDF', {
                        requestedVersion: optimalQR.requestedVersion,
                        actualVersion: optimalQR.actualVersion,
                        version: optimalQR.version,
                        errorCorrection: optimalQR.errorCorrectionLevel,
                        moduleCount: optimalQR.moduleCount,
                        utilization: optimalQR.capacityUtilization,
                        dataLength: optimalQR.dataLength,
                        requestedCapacity: optimalQR.requestedCapacity,
                        optimizationNote: optimalQR.optimizationNote
                    });
                } else {
                    throw new Error(optimalQR.error);
                }
            } catch (qrError) {
                logger.error('Failed to generate optimal QR code for PDF', { error: qrError.message });
                // If QR code fails, add detailed error info in signature box
                doc.fontSize(9);
                doc.text('QR Code Generation Failed', signatureBoxX + 20, signatureBoxY + 60);
                doc.fontSize(7);
                doc.text(`Error: ${qrError.message}`, signatureBoxX + 20, signatureBoxY + 80);
                doc.text(`Data length: ${verificationData.length} chars`, signatureBoxX + 20, signatureBoxY + 95);
            }
        }

        // Move past signature box with extra spacing for QR code label
        const newY = signatureBoxY + signatureBoxHeight + 15;

        // Validate the new Y position
        if (isNaN(newY)) {
            logger.error('Invalid Y position after signature box', {
                signatureBoxY, signatureBoxHeight, calculatedY: newY
            });
            doc.y = 700; // Set a safe fallback position
        } else {
            doc.y = newY;
        }

        // Add horizontal ruler after signature section
        doc.moveTo(leftMargin, doc.y)
           .lineTo(leftMargin + pageWidth, doc.y)
           .lineWidth(0.5)
           .stroke();
        doc.moveDown(0.5);
        
        doc.font('Helvetica-Oblique').fontSize(9)
           .text(getTranslation('pdf-notes-title', pdfLanguage), leftMargin, doc.y);
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(9)
           .text(getTranslation('pdf-notes-text', pdfLanguage), leftMargin, doc.y, {
            width: pageWidth,
            align: 'justify'
        });
        

        

        

        // === PAGE 2: VERIFICATION STATUS ===
        // Add new page for verification status
        doc.addPage();

        // Add verification header on page 2 - Arial fonts
        const pdfOverallSuccess = verificationStatus?.overall || verificationStatus?.overallStatus === 'success';
        const pdfOverallStatusText = pdfOverallSuccess ? getTranslation('email-successful', pdfLanguage) : getTranslation('email-failed', pdfLanguage);
        doc.font('Helvetica-Bold').fontSize(12)
           .text(`${getTranslation('pdf-verification-status', pdfLanguage)} ${statusSymbol(pdfOverallSuccess)} ${pdfOverallStatusText}`, { align: 'center' });
        doc.font('Helvetica').fontSize(9)
           .text(`${getTranslation('pdf-reference', pdfLanguage)} ${referenceNumber} | ${getTranslation('pdf-treatment-date', pdfLanguage)} ${treatmentDate}`, { align: 'center' });
        doc.text(`${getTranslation('pdf-verified', pdfLanguage)} ${new Date(timestamp).toLocaleString()}`, { align: 'center' });
        doc.moveDown(2);

        // Add verification results section - Arial 9pt italics header, Arial 9pt content
        doc.font('Helvetica-Oblique').fontSize(9)
           .text(getTranslation('pdf-verification-results', pdfLanguage), { align: 'center' });
        doc.moveDown();
        doc.font('Helvetica').fontSize(9);
        const passedText = getTranslation('email-passed', pdfLanguage);
        const failedText = getTranslation('email-failed', pdfLanguage);
        const skippedText = 'SKIPPED';

        // Add identity verification warning if skipped
        if (identityVerification) {
            try {
                const identityData = JSON.parse(identityVerification);
                let warningMessages = [];

                if (!identityData.identityVerified) {
                    warningMessages.push('Identity (name) verification was skipped');
                }
                if (!identityData.birthdateVerified) {
                    warningMessages.push('Birthdate verification was skipped');
                }

                if (warningMessages.length > 0) {
                    // Create a highlighted warning box
                    const pageWidth = doc.page.width;
                    const margin = 50;
                    const boxWidth = pageWidth - (margin * 2);
                    const boxHeight = 30 + (warningMessages.length > 1 ? 15 : 0);
                    const currentY = doc.y;

                    // Draw warning box background
                    doc.rect(margin, currentY, boxWidth, boxHeight)
                       .fillAndStroke('#FFE4B5', '#FFA500');

                    // Add warning text
                    doc.fillColor('#B8860B')
                       .font('Helvetica-Bold')
                       .fontSize(10);

                    let textY = currentY + 8;
                    warningMessages.forEach((msg) => {
                        doc.text(`WARNING: ${msg}`, margin + 10, textY, {
                            width: boxWidth - 20,
                            align: 'center'
                        });
                        textY += 15;
                    });

                    // Reset text color and move down
                    doc.fillColor('black')
                       .font('Helvetica')
                       .fontSize(9);
                    doc.y = currentY + boxHeight + 10;
                }
            } catch (e) {
                console.error('Could not parse identity verification data for PDF');
            }
        }

        // Technical Validations Section
        doc.font('Helvetica-Bold').fontSize(10)
           .text('TECHNICAL VALIDATIONS', { align: 'left' });
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(9);

        doc.text(`${statusSymbol(getValidationStatus('qrCodeAnalysis', 'qrCodeAnalysis'))} QR Code Analysis: ${getValidationStatus('qrCodeAnalysis', 'qrCodeAnalysis') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('base45Decode', 'base45Decode'))} BASE45 Decoding: ${getValidationStatus('base45Decode', 'base45Decode') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('zlibDecompress', 'zlibDecompression'))} ZLIB Decompression: ${getValidationStatus('zlibDecompress', 'zlibDecompression') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('jwtParsing', 'jwtParsing'))} JWT Parsing: ${getValidationStatus('jwtParsing', 'jwtParsing') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('schemaFileCheck', 'schemaFileCheck'))} Schema File Check: ${getValidationStatus('schemaFileCheck', 'schemaFileCheck') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('schemaValidation', 'schemaValidation'))} Schema Validation: ${getValidationStatus('schemaValidation', 'schemaValidation') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('kidHeaderValidation', 'kidHeaderValidation'))} Kid Header Validation: ${getValidationStatus('kidHeaderValidation', 'kidHeaderValidation') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('algorithmHeaderValidation', 'algorithmHeaderValidation'))} Algorithm Header Validation: ${getValidationStatus('algorithmHeaderValidation', 'algorithmHeaderValidation') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('signatureVerification', 'certificateAuthority'))} Signature Retrieval: ${getValidationStatus('signatureVerification', 'certificateAuthority') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('signatureCountValidation', 'signatureCountValidation'))} Signature Count Validation: ${getValidationStatus('signatureCountValidation', 'signatureCountValidation') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('countryCodeValidation', 'countryCodeValidation'))} Country Code Validation: ${getValidationStatus('countryCodeValidation', 'countryCodeValidation') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('jwtSignatureValidation', 'signatureVerification'))} JWT Signature Validation: ${getValidationStatus('jwtSignatureValidation', 'signatureVerification') ? passedText : failedText}`);

        doc.moveDown(1);

        // Business Validations Section
        doc.font('Helvetica-Bold').fontSize(10)
           .text('BUSINESS VALIDATIONS', { align: 'left' });
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(9);

        doc.text(`${statusSymbol(getValidationStatus('certificateValidityDate', 'certificateValidityDate'))} Certificate Validity Date: ${getValidationStatus('certificateValidityDate', 'certificateValidityDate') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('ehicAccreditation', 'ehicAccreditation'))} EHIC Accreditation: ${getValidationStatus('ehicAccreditation', 'ehicAccreditation') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('dateOfBirthValidation', 'dateOfBirthValidation'))} Date of Birth Validation: ${getValidationStatus('dateOfBirthValidation', 'dateOfBirthValidation') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('dateRangeValidation', 'dateRangeValidation'))} Start/End Date Validation: ${getValidationStatus('dateRangeValidation', 'dateRangeValidation') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('startIssuanceValidation', 'startIssuanceValidation'))} Start/Issuance Date Validation: ${getValidationStatus('startIssuanceValidation', 'startIssuanceValidation') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('issuanceEndValidation', 'issuanceEndValidation'))} Issuance/End Date Validation: ${getValidationStatus('issuanceEndValidation', 'issuanceEndValidation') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('expiryDateValidation', 'expiryDateValidation'))} Expiry Date Validation: ${getValidationStatus('expiryDateValidation', 'expiryDateValidation') ? passedText : getValidationSkipped('expiryDateValidation') ? skippedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('institutionLengthValidation', 'institutionLengthValidation'))} Institution Length Validation (Optional): ${getValidationStatus('institutionLengthValidation', 'institutionLengthValidation') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('cardIdDigitValidation', 'cardIdDigitValidation'))} Card ID Digit Validation (Optional): ${getValidationStatus('cardIdDigitValidation', 'cardIdDigitValidation') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('institutionIdDigitValidation', 'institutionIdDigitValidation'))} Institution ID Digit Validation (Optional): ${getValidationStatus('institutionIdDigitValidation', 'institutionIdDigitValidation') ? passedText : failedText}`);

        doc.moveDown(1);

        // Revocation Validations Section
        doc.font('Helvetica-Bold').fontSize(10)
           .text('REVOCATION VALIDATIONS', { align: 'left' });
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(9);

        doc.text(`${statusSymbol(getValidationStatus('revocationPresence', 'revocationPresence'))} Revocation Information Presence: ${getValidationStatus('revocationPresence', 'revocationPresence') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('revocationStatus', 'revocationStatus'))} Revocation Status Check: ${getValidationStatus('revocationStatus', 'revocationStatus') ? passedText : failedText}`);

        doc.moveDown(1);

        // Treatment Date Validations Section
        doc.font('Helvetica-Bold').fontSize(10)
           .text('TREATMENT DATE VALIDATIONS', { align: 'left' });
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(9);

        doc.text(`${statusSymbol(getValidationStatus('treatmentDatePresence', 'treatmentDatePresence'))} Treatment Date Presence: ${getValidationStatus('treatmentDatePresence', 'treatmentDatePresence') ? passedText : failedText}`);
        doc.text(`${statusSymbol(getValidationStatus('treatmentDateRange', 'treatmentDateRange'))} Treatment Date Range Validation: ${getValidationStatus('treatmentDateRange', 'treatmentDateRange') ? passedText : failedText}`);
        doc.moveDown(2);

        // === PDF DIGITAL SIGNATURE SECTION (at end of document) ===
        // Add separation and digital signature section - Arial 9pt italics header
        doc.font('Helvetica-Oblique').fontSize(9)
           .text(getTranslation('pdf-digital-signature', pdfLanguage));
        doc.moveDown();

        // Digital signature information - Arial 9pt
        doc.font('Helvetica').fontSize(9);
        doc.text(getTranslation('pdf-digitally-signed-by', pdfLanguage));
        doc.text('EHIC/PRC Verification System');
        doc.text(`${getTranslation('pdf-institution', pdfLanguage)} ${prcData.institutionName !== 'N/A' ? prcData.institutionName : 'Healthcare Provider'}`);
        doc.text(`${getTranslation('pdf-institution-id-signature', pdfLanguage)} ${prcData.institutionId}`);
        doc.text(`${getTranslation('pdf-signed-on', pdfLanguage)} ${new Date(timestamp).toLocaleDateString('en-GB')}`);
        doc.text(`${getTranslation('pdf-time', pdfLanguage)} ${new Date(timestamp).toLocaleTimeString('en-GB')}`);

        // Add verification hash/fingerprint
        const verificationHash = require('crypto')
            .createHash('sha256')
            .update(verificationData + timestamp)
            .digest('hex')
            .substring(0, 16)
            .toUpperCase();

        doc.text(`${getTranslation('pdf-verification-hash', pdfLanguage)} ${verificationHash}`);

        // Finalize PDF
        doc.end();

        // Wait for PDF to be written
        await new Promise(resolve => setTimeout(resolve, 500));

        // Determine overall status
        const overallSuccess = verificationStatus?.overall || verificationStatus?.overallStatus === 'success';
        const statusIcon = overallSuccess ? '✅' : '❌';

        // Get translated status text
        const statusText = getTranslation(overallSuccess ? 'email-successful' : 'email-failed', userLanguage);

        // Process identity verification data
        let identityVerificationWarning = '';
        if (identityVerification) {
            try {
                const identityData = JSON.parse(identityVerification);
                let warningMessages = [];

                if (!identityData.identityVerified) {
                    warningMessages.push('Identity (name) verification was skipped');
                }
                if (!identityData.birthdateVerified) {
                    warningMessages.push('Birthdate verification was skipped');
                }

                if (warningMessages.length > 0) {
                    identityVerificationWarning = `
                        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin: 10px 0; border-radius: 5px;">
                            <p style="color: #856404; margin: 0;"><strong>⚠️ Warning:</strong></p>
                            <ul style="color: #856404; margin: 5px 0 0 20px;">
                                ${warningMessages.map(msg => `<li>${msg}</li>`).join('')}
                            </ul>
                        </div>
                    `;
                }
            } catch (e) {
                console.error('Could not parse identity verification data for email');
            }
        }

        // Email HTML content with translated text
        const emailHTML = `
            <h2>${getTranslation('email-title', userLanguage, { status: statusText })}</h2>
            <p><strong>${getTranslation('email-reference-number', userLanguage)}</strong> ${referenceNumber}</p>
            <p><strong>${getTranslation('email-treatment-date', userLanguage)}</strong> ${treatmentDate}</p>
            <p><strong>${getTranslation('email-verification-time', userLanguage)}</strong> ${new Date(timestamp).toLocaleString()}</p>
            <hr>
            ${identityVerificationWarning}
            <h3>${getTranslation('email-verification-status', userLanguage, { icon: statusIcon, status: statusText })}</h3>

            <h4 style="color: #2c3e50; margin-top: 20px;">Technical Validations</h4>
            <ul>
                <li>${statusSymbol(getValidationStatus('qrCodeAnalysis', 'qrCodeAnalysis'))} QR Code Analysis</li>
                <li>${statusSymbol(getValidationStatus('base45Decode', 'base45Decode'))} BASE45 Decoding</li>
                <li>${statusSymbol(getValidationStatus('zlibDecompress', 'zlibDecompression'))} ZLIB Decompression</li>
                <li>${statusSymbol(getValidationStatus('jwtParsing', 'jwtParsing'))} JWT Parsing</li>
                <li>${statusSymbol(getValidationStatus('schemaFileCheck', 'schemaFileCheck'))} Schema File Check</li>
                <li>${statusSymbol(getValidationStatus('schemaValidation', 'schemaValidation'))} Schema Validation</li>
                <li>${statusSymbol(getValidationStatus('kidHeaderValidation', 'kidHeaderValidation'))} Kid Header Validation</li>
                <li>${statusSymbol(getValidationStatus('algorithmHeaderValidation', 'algorithmHeaderValidation'))} Algorithm Header Validation</li>
                <li>${statusSymbol(getValidationStatus('signatureVerification', 'certificateAuthority'))} Signature Retrieval</li>
                <li>${statusSymbol(getValidationStatus('signatureCountValidation', 'signatureCountValidation'))} Signature Count Validation</li>
                <li>${statusSymbol(getValidationStatus('countryCodeValidation', 'countryCodeValidation'))} Country Code Validation</li>
                <li>${statusSymbol(getValidationStatus('jwtSignatureValidation', 'signatureVerification'))} JWT Signature Validation</li>
            </ul>

            <h4 style="color: #2c3e50; margin-top: 20px;">Business Validations</h4>
            <ul>
                <li>${statusSymbol(getValidationStatus('certificateValidityDate', 'certificateValidityDate'))} Certificate Validity Date</li>
                <li>${statusSymbol(getValidationStatus('ehicAccreditation', 'ehicAccreditation'))} EHIC Accreditation</li>
                <li>${statusSymbol(getValidationStatus('dateOfBirthValidation', 'dateOfBirthValidation'))} Date of Birth Validation</li>
                <li>${statusSymbol(getValidationStatus('dateRangeValidation', 'dateRangeValidation'))} Start/End Date Validation</li>
                <li>${statusSymbol(getValidationStatus('startIssuanceValidation', 'startIssuanceValidation'))} Start/Issuance Date Validation</li>
                <li>${statusSymbol(getValidationStatus('issuanceEndValidation', 'issuanceEndValidation'))} Issuance/End Date Validation</li>
                <li>${statusSymbol(getValidationStatus('expiryDateValidation', 'expiryDateValidation'))} Expiry Date Validation ${getValidationSkipped('expiryDateValidation') ? '<span style="color: #f39c12;">(Skipped - No expiry date found)</span>' : ''}</li>
                <li>${statusSymbol(getValidationStatus('institutionLengthValidation', 'institutionLengthValidation'))} Institution Length Validation <span style="color: #f39c12;">(Optional)</span></li>
                <li>${statusSymbol(getValidationStatus('cardIdDigitValidation', 'cardIdDigitValidation'))} Card ID Digit Validation <span style="color: #f39c12;">(Optional)</span></li>
                <li>${statusSymbol(getValidationStatus('institutionIdDigitValidation', 'institutionIdDigitValidation'))} Institution ID Digit Validation <span style="color: #f39c12;">(Optional)</span></li>
            </ul>

            <h4 style="color: #2c3e50; margin-top: 20px;">Revocation Validations</h4>
            <ul>
                <li>${statusSymbol(getValidationStatus('revocationPresence', 'revocationPresence'))} Revocation Information Presence</li>
                <li>${statusSymbol(getValidationStatus('revocationStatus', 'revocationStatus'))} Revocation Status Check</li>
            </ul>

            <h4 style="color: #2c3e50; margin-top: 20px;">Treatment Date Validations</h4>
            <ul>
                <li>${statusSymbol(getValidationStatus('treatmentDatePresence', 'treatmentDatePresence'))} Treatment Date Presence</li>
                <li>${statusSymbol(getValidationStatus('treatmentDateRange', 'treatmentDateRange'))} Treatment Date Range Validation</li>
            </ul>
            <hr>
            <h3>${getTranslation('email-prc-certificate-info', userLanguage)}</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 5px; font-weight: bold;">${getTranslation('email-name', userLanguage)}</td><td style="padding: 5px;">${prcData.cardHolderName}</td></tr>
                <tr><td style="padding: 5px; font-weight: bold;">${getTranslation('email-given-name', userLanguage)}</td><td style="padding: 5px;">${prcData.cardHolderGivenName}</td></tr>
                <tr><td style="padding: 5px; font-weight: bold;">${getTranslation('email-date-of-birth', userLanguage)}</td><td style="padding: 5px;">${prcData.dateOfBirth}</td></tr>
                <tr><td style="padding: 5px; font-weight: bold;">${getTranslation('email-personal-id', userLanguage)}</td><td style="padding: 5px;">${prcData.personalIdNumber}</td></tr>
                <tr><td style="padding: 5px; font-weight: bold;">${getTranslation('email-issuing-state', userLanguage)}</td><td style="padding: 5px;">${prcData.issuingMemberState}</td></tr>
                <tr><td style="padding: 5px; font-weight: bold;">${getTranslation('email-institution-id', userLanguage)}</td><td style="padding: 5px;">${prcData.institutionId}</td></tr>
                <tr><td style="padding: 5px; font-weight: bold;">${getTranslation('email-card-id', userLanguage)}</td><td style="padding: 5px;">${prcData.cardId}</td></tr>
                <tr><td style="padding: 5px; font-weight: bold;">${getTranslation('email-valid-from', userLanguage)}</td><td style="padding: 5px;">${prcData.validityStart}</td></tr>
                <tr><td style="padding: 5px; font-weight: bold;">${getTranslation('email-valid-to', userLanguage)}</td><td style="padding: 5px;">${prcData.validityEnd}</td></tr>
                <tr><td style="padding: 5px; font-weight: bold;">${getTranslation('email-expiry-date', userLanguage)}</td><td style="padding: 5px;">${prcData.expiryDate}</td></tr>
            </table>
            <hr>
            <p><strong>${getTranslation('email-note-label', userLanguage)}</strong> ${getTranslation('email-note-text', userLanguage)}</p>
            <p>${getTranslation('email-automated-message', userLanguage)}</p>
            <p>${getTranslation('email-keep-records', userLanguage)}</p>
        `;

        // Format treatment date to YYYY-MM-DD if it exists
        let formattedTreatmentDate = null;
        if (treatmentDate) {
            try {
                // Parse the treatment date and format it as YYYY-MM-DD
                const dateObj = new Date(treatmentDate);
                if (!isNaN(dateObj.getTime())) {
                    formattedTreatmentDate = dateObj.toISOString().split('T')[0];
                } else {
                    // If it's already in YYYY-MM-DD format, use it as-is
                    if (/^\d{4}-\d{2}-\d{2}$/.test(treatmentDate)) {
                        formattedTreatmentDate = treatmentDate;
                    } else {
                        logger.warn('Invalid treatment date format', {
                            treatmentDate: treatmentDate,
                            referenceNumber: referenceNumber
                        });
                    }
                }
            } catch (dateError) {
                logger.error('Error formatting treatment date', {
                    error: dateError.message,
                    treatmentDate: treatmentDate,
                    referenceNumber: referenceNumber
                });
            }
        }

        // Generate JSON verification output
        const verificationOutput = {
            overall: verificationStatus?.overall || false,
            overallStatus: verificationStatus?.overall ? 'success' : 'error',
            validationSummary: verificationStatus?.validationSummary || {},
            verificationTimestamp: new Date(timestamp).toISOString(),
            treatmentDate: formattedTreatmentDate,
            steps: verificationStatus?.steps || [],
            details: verificationStatus?.details || {},
            referenceNumber: referenceNumber,
            language: language || 'en'
        };

        // Validate JSON output against schema
        try {
            const Ajv = require('ajv');
            const addFormats = require('ajv-formats');

            // Try to load the schema file with proper error handling
            let schema;
            try {
                schema = require('../schemas/verification-output-schema.json');
            } catch (schemaLoadError) {
                logger.warn('Could not load verification schema file', {
                    error: schemaLoadError.message,
                    referenceNumber: referenceNumber
                });
                // Continue without validation if schema can't be loaded
                schema = null;
            }

            if (schema) {
                const ajv = new Ajv({
                    strict: false,  // Disable strict mode to allow union types
                    allErrors: true // Collect all errors, not just the first one
                });
                addFormats(ajv);
                const validate = ajv.compile(schema);
                const valid = validate(verificationOutput);

                if (!valid) {
                    logger.warn('Generated verification JSON does not conform to schema', {
                        errors: validate.errors,
                        referenceNumber: referenceNumber
                    });
                    // Continue with email sending even if validation fails, but log the issue
                } else {
                    logger.info('Verification JSON successfully validated against schema', {
                        referenceNumber: referenceNumber
                    });
                }
            }
        } catch (validationError) {
            logger.error('JSON schema validation failed', {
                error: validationError.message,
                stack: validationError.stack,
                referenceNumber: referenceNumber
            });
            // Continue with email sending even if validation fails
        }

        // Create JSON file
        const jsonFileName = `verification-${referenceNumber}.json`;
        const jsonPath = path.join(__dirname, '..', 'temp', jsonFileName);
        fs.writeFileSync(jsonPath, JSON.stringify(verificationOutput, null, 2));

        // Read files for attachments
        const pdfContent = fs.readFileSync(pdfPath);
        const jsonContent = fs.readFileSync(jsonPath);

        // Send email with PDF and JSON attachments
        await transporter.sendMail({
            from: '"EHIC Verifier" <noreply@ehic-verifier.com>',
            to: email,
            subject: getTranslation('email-subject', userLanguage, {
                referenceNumber: referenceNumber,
                status: statusText
            }),
            html: emailHTML,
            attachments: [
                {
                    filename: pdfFileName,
                    content: pdfContent,
                    contentType: 'application/pdf'
                },
                {
                    filename: jsonFileName,
                    content: jsonContent,
                    contentType: 'application/json'
                }
            ]
        });

        // Clean up temp files
        fs.unlinkSync(pdfPath);
        fs.unlinkSync(jsonPath);
        

        // For demonstration, we'll save the email request to the database
        // or log it, and return success

        // Simulate a delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Log successful email send
        logger.info('Verification email sent successfully', {
            recipient: email,
            referenceNumber: referenceNumber,
            treatmentDate: treatmentDate,
            overallStatus: verificationStatus?.overall ? 'PASSED' : 'FAILED',
            withAttachment: true
        });

        res.json({
            success: true,
            message: 'Email sent successfully with PDF attachment',
            recipient: email
        });

    } catch (error) {
        logger.error('Failed to send verification email', {
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            error: 'Failed to send email. Please try again later.'
        });
    }
});


// Set up multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
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


// API endpoint for verification processing
router.post('/api/verify', isAuthenticated, async (req, res) => {
    try {
        const { data, treatmentDate } = req.body;
        const result = await processVerificationData(data, treatmentDate);

        // Update scan record with verification result
        await updateScanVerification(data, result, null);

        res.json(result);
    } catch (error) {
        console.error('Verification error:', error);

        // Try to get partial results if processVerificationData was called
        let partialResult = null;
        let validationSummary = null;

        // If error has a validationSummary attached, use it
        if (error.validationSummary) {
            validationSummary = error.validationSummary;
        } else {
            // Create a minimal validation summary showing what failed
            validationSummary = {
                qrCodeAnalysis: { status: 'pending', message: '' },
                base45Decode: { status: 'pending', message: '' },
                zlibDecompress: { status: 'pending', message: '' },
                jwtParsing: { status: 'pending', message: '' },
                schemaFileCheck: { status: 'pending', message: '' },
                schemaValidation: { status: 'pending', message: '' },
                kidHeaderValidation: { status: 'pending', message: '' },
                algorithmHeaderValidation: { status: 'pending', message: '' },
                signatureVerification: { status: 'pending', message: '' },
                signatureCountValidation: { status: 'pending', message: '' },
                countryCodeValidation: { status: 'pending', message: '' },
                certificateValidityDate: { status: 'pending', message: '' },
                ehicAccreditation: { status: 'pending', message: '' },
                dateOfBirthValidation: { status: 'pending', message: '' },
                dateRangeValidation: { status: 'pending', message: '' },
                startIssuanceValidation: { status: 'pending', message: '' },
                issuanceEndValidation: { status: 'pending', message: '' },
                institutionLengthValidation: { status: 'pending', message: '' },
                cardIdDigitValidation: { status: 'pending', message: '' },
                institutionIdDigitValidation: { status: 'pending', message: '' },
                revocationPresence: { status: 'pending', message: '' },
                revocationStatus: { status: 'pending', message: '' },
                jwtSignatureValidation: { status: 'pending', message: '' }
            };

            // Mark the step where it failed if we know it
            if (error.step) {
                const stepMapping = {
                    'BASE45 decoding': 'base45Decode',
                    'ZLIB decompression': 'zlibDecompress',
                    'JWT parsing': 'jwtParsing',
                    'Schema validation': 'schemaValidation',
                    'Signature verification': 'signatureVerification'
                };

                const summaryKey = stepMapping[error.step];
                if (summaryKey && validationSummary[summaryKey]) {
                    validationSummary[summaryKey] = {
                        status: 'error',
                        message: error.message || 'Validation failed'
                    };
                }
            }

            // Mark all remaining as skipped
            Object.keys(validationSummary).forEach(key => {
                if (validationSummary[key].status === 'pending') {
                    validationSummary[key] = {
                        status: 'skipped',
                        message: 'Skipped due to previous failure'
                    };
                }
            });
        }

        // Update scan record with verification error
        await updateScanVerification(req.body.data, null, error);

        // Send response with validation summary even in error case
        res.status(500).json({
            success: false,
            error: 'Verification failed',
            message: error.message || 'Unknown error occurred',
            step: error.step || 'unknown',
            validationSummary: validationSummary,
            overallStatus: 'error',
            steps: [] // Empty steps array for consistency
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

// QR Code Analysis Function - Determines Exact Properties
async function analyzeQRCodeData(data) {
    const QRCode = require('qrcode');
    const qrGenerator = require('qrcode-generator');

    try {
        const dataLength = data.length;
        const versionTable = getQRCodeVersionTable();

        // Find the smallest version that fits (same logic as PDF generation)
        let optimalVersion = null;
        let optimalErrorLevel = null;

        // Check each version from smallest to largest
        for (let version = 1; version <= 40; version++) {
            const versionData = versionTable[version];
            if (!versionData) continue;

            // Check each error level for this version
            for (const errorLevel of ['L', 'M', 'Q', 'H']) {
                const capacity = versionData.alphanumeric[errorLevel];
                if (capacity >= dataLength) {
                    optimalVersion = version;
                    optimalErrorLevel = errorLevel;
                    break; // Found the smallest version that fits
                }
            }
            if (optimalVersion) break; // Stop searching once we find a fit
        }

        // Now try to generate with the optimal version
        let actualProperties = null;

        if (optimalVersion && optimalErrorLevel) {
            try {
                // Use the specific version number instead of auto-detect
                logger.info('Attempting optimal QR generation in analysis:', {
                    version: optimalVersion,
                    errorLevel: optimalErrorLevel,
                    dataLength: dataLength
                });

                const qr = qrGenerator(optimalVersion, optimalErrorLevel);
                qr.addData(data);
                qr.make();

                const moduleCount = qr.getModuleCount();
                const capacity = versionTable[optimalVersion].alphanumeric[optimalErrorLevel];

                actualProperties = {
                    version: optimalVersion,
                    moduleCount: moduleCount,
                    moduleDimensions: `${moduleCount}x${moduleCount}`,
                    errorCorrectionLevel: optimalErrorLevel,
                    actualDataLength: dataLength,
                    qrCodeSvg: qr.createSvgTag(4, 0),
                    detectionMethod: 'Optimal version selection (smallest that fits)',
                    capacity: capacity,
                    utilization: `${(dataLength / capacity * 100).toFixed(1)}%`
                };
            } catch (genError) {
                // If optimal version fails, fall back to auto-detect
                logger.warn('Optimal QR generation failed in analysis, falling back to auto-detect:', {
                    attemptedVersion: optimalVersion,
                    attemptedErrorLevel: optimalErrorLevel,
                    error: genError.message,
                    dataLength: dataLength
                });

                const qr = qrGenerator(0, 'L'); // Auto-detect with L
                qr.addData(data);
                qr.make();

                const moduleCount = qr.getModuleCount();
                const version = Math.floor((moduleCount - 17) / 4);

                actualProperties = {
                    version: version,
                    moduleCount: moduleCount,
                    moduleDimensions: `${moduleCount}x${moduleCount}`,
                    errorCorrectionLevel: 'L',
                    actualDataLength: dataLength,
                    qrCodeSvg: qr.createSvgTag(4, 0),
                    detectionMethod: 'Auto-detect fallback'
                };
            }
        }

        // If no error correction level worked, provide detailed error info
        if (!actualProperties) {
            throw new Error(`Data too large for QR code generation. Length: ${dataLength} characters`);
        }

        // Also generate with different library for cross-validation
        let qrCodeBuffer = null;
        let generationError = null;
        try {
            qrCodeBuffer = await QRCode.toBuffer(data, {
                errorCorrectionLevel: actualProperties.errorCorrectionLevel,
                type: 'png',
                width: 300,
                margin: 2
            });
        } catch (genError) {
            generationError = genError.message;
        }

        const capacityInfo = getMaxCapacityForVersion(actualProperties.version, actualProperties.errorCorrectionLevel);

        return {
            dataCharacteristics: {
                originalDataLength: dataLength,
                dataType: 'BASE45 Encoded EHIC Data',
                startsWithHC1: data.startsWith('HC1:'),
                dataPrefix: data.substring(0, 30),
                dataEncoding: 'Alphanumeric'
            },
            actualQRProperties: {
                version: actualProperties.version,
                moduleCount: actualProperties.moduleCount,
                moduleDimensions: actualProperties.moduleDimensions,
                errorCorrectionLevel: actualProperties.errorCorrectionLevel,
                detectionMethod: actualProperties.detectionMethod,
                dataCapacityUsed: `${dataLength} characters`,
                maxCapacityAtThisLevel: actualProperties.capacity || capacityInfo.capacity,
                capacityUtilization: actualProperties.utilization || `${Math.round((dataLength / capacityInfo.capacity) * 100)}%`
            },
            completeQRVersionTable: getQRCodeVersionTable(),
            generatedQRInfo: {
                bufferSize: qrCodeBuffer ? qrCodeBuffer.length : null,
                imageFormat: qrCodeBuffer ? 'PNG' : null,
                generationSuccess: qrCodeBuffer !== null,
                generationError: generationError,
                generatedAt: new Date().toISOString()
            },
            analysisMetadata: {
                analysisVersion: '4.0',
                detectionMethod: 'BASE45 alphanumeric QR code optimization',
                librariesUsed: ['qrcode-generator', 'qrcode'],
                note: 'Alphanumeric capacity table for BASE45 data (Versions 1-40)',
                tableDescription: 'Each version shows: modules, alphanumeric capacity (L/M/Q/H) for BASE45 encoding'
            }
        };
    } catch (error) {
        throw new Error(`QR Code analysis failed: ${error.message}`);
    }
}

// Helper function to detect data encoding type
function detectDataEncoding(data) {
    // Check for numeric only
    if (/^[0-9]+$/.test(data)) return 'Numeric';

    // Check for QR code alphanumeric mode characters
    // Alphanumeric mode: 0-9, A-Z, space, $, %, *, +, -, ., /, :
    if (/^[0-9A-Z $%*+\-./:]+$/.test(data)) return 'Alphanumeric';

    // If it contains any other characters, it must use binary mode
    return 'Binary/UTF-8';
}

// QR Code Version Table - Alphanumeric Capacity Only (for BASE45 data)
function getQRCodeVersionTable() {
    return {
        1: { modules: 21, alphanumeric: { L: 25, M: 20, Q: 16, H: 10 } },
        2: { modules: 25, alphanumeric: { L: 47, M: 38, Q: 29, H: 20 } },
        3: { modules: 29, alphanumeric: { L: 77, M: 61, Q: 47, H: 35 } },
        4: { modules: 33, alphanumeric: { L: 114, M: 90, Q: 67, H: 50 } },
        5: { modules: 37, alphanumeric: { L: 154, M: 122, Q: 87, H: 64 } },
        6: { modules: 41, alphanumeric: { L: 195, M: 154, Q: 108, H: 84 } },
        7: { modules: 45, alphanumeric: { L: 224, M: 178, Q: 125, H: 93 } },
        8: { modules: 49, alphanumeric: { L: 279, M: 221, Q: 157, H: 122 } },
        9: { modules: 53, alphanumeric: { L: 335, M: 262, Q: 189, H: 143 } },
        10: { modules: 57, alphanumeric: { L: 395, M: 311, Q: 221, H: 174 } },
        11: { modules: 61, alphanumeric: { L: 468, M: 366, Q: 259, H: 200 } },
        12: { modules: 65, alphanumeric: { L: 535, M: 419, Q: 296, H: 227 } },
        13: { modules: 69, alphanumeric: { L: 619, M: 483, Q: 352, H: 259 } },
        14: { modules: 73, alphanumeric: { L: 667, M: 528, Q: 376, H: 283 } },
        15: { modules: 77, alphanumeric: { L: 758, M: 600, Q: 426, H: 321 } },
        16: { modules: 81, alphanumeric: { L: 852, M: 656, Q: 470, H: 365 } },
        17: { modules: 85, alphanumeric: { L: 938, M: 734, Q: 531, H: 408 } },
        18: { modules: 89, alphanumeric: { L: 1046, M: 816, Q: 574, H: 452 } },
        19: { modules: 93, alphanumeric: { L: 1153, M: 909, Q: 644, H: 493 } },
        20: { modules: 97, alphanumeric: { L: 1249, M: 970, Q: 702, H: 557 } },
        21: { modules: 101, alphanumeric: { L: 1352, M: 1035, Q: 742, H: 587 } },
        22: { modules: 105, alphanumeric: { L: 1460, M: 1134, Q: 823, H: 640 } },
        23: { modules: 109, alphanumeric: { L: 1588, M: 1248, Q: 890, H: 672 } },
        24: { modules: 113, alphanumeric: { L: 1704, M: 1326, Q: 963, H: 744 } },
        25: { modules: 117, alphanumeric: { L: 1853, M: 1451, Q: 1041, H: 779 } },
        26: { modules: 121, alphanumeric: { L: 1990, M: 1542, Q: 1094, H: 864 } },
        27: { modules: 125, alphanumeric: { L: 2132, M: 1637, Q: 1172, H: 910 } },
        28: { modules: 129, alphanumeric: { L: 2223, M: 1732, Q: 1263, H: 958 } },
        29: { modules: 133, alphanumeric: { L: 2369, M: 1839, Q: 1322, H: 1016 } },
        30: { modules: 137, alphanumeric: { L: 2520, M: 1994, Q: 1429, H: 1080 } },
        31: { modules: 141, alphanumeric: { L: 2677, M: 2113, Q: 1499, H: 1150 } },
        32: { modules: 145, alphanumeric: { L: 2840, M: 2238, Q: 1618, H: 1226 } },
        33: { modules: 149, alphanumeric: { L: 3009, M: 2369, Q: 1700, H: 1307 } },
        34: { modules: 153, alphanumeric: { L: 3183, M: 2506, Q: 1787, H: 1394 } },
        35: { modules: 157, alphanumeric: { L: 3351, M: 2632, Q: 1867, H: 1431 } },
        36: { modules: 161, alphanumeric: { L: 3537, M: 2780, Q: 1966, H: 1530 } },
        37: { modules: 165, alphanumeric: { L: 3729, M: 2894, Q: 2071, H: 1591 } },
        38: { modules: 169, alphanumeric: { L: 3927, M: 3054, Q: 2181, H: 1658 } },
        39: { modules: 173, alphanumeric: { L: 4087, M: 3220, Q: 2298, H: 1774 } },
        40: { modules: 177, alphanumeric: { L: 4296, M: 3391, Q: 2420, H: 1852 } }
    };
}

// Helper function to get alphanumeric capacity for a QR version and error correction level
function getMaxCapacityForVersion(version, errorLevel) {
    const versionTable = getQRCodeVersionTable();
    const versionData = versionTable[version];

    if (!versionData) {
        return `Version ${version} not in table (max 40)`;
    }

    return {
        capacity: versionData.alphanumeric[errorLevel],
        modules: versionData.modules
    };
}

// Optimal QR Code Generator for PDF - Selects the smallest QR version that fits the data for best scanability
async function generateOptimalQRCodeForPDF(data) {
    const QRCode = require('qrcode');

    const dataLength = data.length;
    const versionTable = getQRCodeVersionTable();

    // Find all viable options first
    const viableOptions = [];

    // Check all combinations of version and error correction level
    for (let version = 1; version <= 40; version++) {
        const versionData = versionTable[version];
        if (!versionData) continue;

        // Check each error correction level for this version
        for (const errorLevel of ['L', 'M', 'Q', 'H']) {
            // BASE45 is always alphanumeric
            const capacity = versionData.alphanumeric[errorLevel];

            // If this version can fit the data, add it as an option
            if (capacity >= dataLength) {
                const utilization = (dataLength / capacity * 100).toFixed(1);
                viableOptions.push({
                    version: version,
                    errorLevel: errorLevel,
                    capacity: capacity,
                    utilization: parseFloat(utilization),
                    moduleCount: 17 + version * 4
                });
            }
        }
    }

    // Sort options by optimal criteria:
    // PRIORITY: Smallest version that fits the data (easier to scan)
    // For 818 bytes: L16, M19, Q22, H26 - we want L16!
    viableOptions.sort((a, b) => {
        // Simply sort by version number (ascending) - smallest QR code first
        if (a.version !== b.version) {
            return a.version - b.version;
        }

        // If same version (shouldn't happen), prefer lower error correction for that version
        // (though this case is unlikely since each version will have different capacities)
        const errorLevelOrder = { 'L': 1, 'M': 2, 'Q': 3, 'H': 4 };
        return errorLevelOrder[a.errorLevel] - errorLevelOrder[b.errorLevel];
    });

    // Log all viable options for debugging
    logger.info('QR Code viable options for PDF:', {
        dataLength: dataLength,
        topOptions: viableOptions.slice(0, 10).map(opt =>
            `V${opt.version}-${opt.errorLevel} (${opt.utilization}% util, ${opt.capacity} cap)`
        ),
        selectedOption: viableOptions[0] ? `V${viableOptions[0].version}-${viableOptions[0].errorLevel}` : 'None',
        totalOptions: viableOptions.length
    });

    // Try the sorted options until one works
    for (const option of viableOptions) {
        try {
            // Force specific version and error correction level
            const svgString = await QRCode.toString(data, {
                type: 'svg',
                version: option.version,
                errorCorrectionLevel: option.errorLevel,
                margin: 2,
                width: 300,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            });

            // Verify the actual version from the SVG output
            // Count the modules from SVG to verify actual version
            const svgModuleMatch = svgString.match(/viewBox="0 0 (\d+) \d+"/);
            let actualModuleCount = null;
            if (svgModuleMatch) {
                // ViewBox size includes margin, so subtract margins (2*2=4)
                actualModuleCount = parseInt(svgModuleMatch[1]) - 4;
            }

            // Also try to count rect elements in SVG for verification
            const rectMatches = svgString.match(/<rect/g);
            const rectCount = rectMatches ? rectMatches.length : 0;

            const actualVersion = actualModuleCount ? Math.floor((actualModuleCount - 17) / 4) : option.version;

            // Detailed logging to catch discrepancies
            logger.info('SVG QR Code Analysis:', {
                requestedVersion: option.version,
                expectedModules: option.moduleCount,
                svgViewBoxSize: svgModuleMatch ? svgModuleMatch[1] : 'not found',
                actualModules: actualModuleCount,
                calculatedVersion: actualVersion,
                rectElementCount: rectCount,
                svgSizeBytes: svgString.length,
                svgPreview: svgString.substring(0, 200) + '...'
            });

            // Log if version mismatch detected
            if (actualVersion !== option.version) {
                logger.warn('QR Version Mismatch!', {
                    requested: option.version,
                    actual: actualVersion,
                    requestedModules: option.moduleCount,
                    actualModules: actualModuleCount,
                    errorLevel: option.errorLevel
                });
                // Continue to next option if version doesn't match
                continue;
            }

            // Return the optimal QR code with all metadata
                    return {
                        success: true,
                        requestedVersion: option.version,
                        actualVersion: actualVersion,
                        version: actualVersion,
                        errorCorrectionLevel: option.errorLevel,
                        moduleCount: option.moduleCount,
                        moduleDimensions: `${option.moduleCount}x${option.moduleCount}`,
                        dataEncoding: 'Alphanumeric',
                        dataLength: dataLength,
                        requestedCapacity: option.capacity,
                        capacityUsed: option.capacity,
                        capacityUtilization: `${option.utilization}%`,
                        svgString: svgString,
                        svgSize: svgString.length,
                        optimizationNote: `Smallest QR: V${option.version}-${option.errorLevel} (capacity: ${option.capacity}, utilization: ${option.utilization}%)`
                    };
                } catch (generateError) {
                    // Log which version failed and why
                    logger.warn('QR generation failed for option:', {
                        version: option.version,
                        errorLevel: option.errorLevel,
                        capacity: option.capacity,
                        dataLength: dataLength,
                        error: generateError.message
                    });
                    // Continue to next version if generation fails
                    continue;
                }
    }

    // If no version worked, return error info
    return {
        success: false,
        error: `Data too large for QR code generation. Length: ${dataLength} characters`,
        dataLength: dataLength,
        dataEncoding: 'Alphanumeric',
        maxSupportedLength: versionTable[40].alphanumeric.H // Largest possible
    };
}

async function processVerificationData(originalData, treatmentDate = null) {
    const steps = [];
    const validationSummary = {
        qrCodeAnalysis: { status: 'pending', message: '' },
        base45Decode: { status: 'pending', message: '' },
        zlibDecompress: { status: 'pending', message: '' },
        jwtParsing: { status: 'pending', message: '' },
        schemaFileCheck: { status: 'pending', message: '' },
        schemaValidation: { status: 'pending', message: '' },
        kidHeaderValidation: { status: 'pending', message: '' },
        algorithmHeaderValidation: { status: 'pending', message: '' },
        signatureVerification: { status: 'pending', message: '' },
        signatureCountValidation: { status: 'pending', message: '' },
        countryCodeValidation: { status: 'pending', message: '' },
        certificateValidityDate: { status: 'pending', message: '' },
        ehicAccreditation: { status: 'pending', message: '' },
        dateOfBirthValidation: { status: 'pending', message: '' },
        dateRangeValidation: { status: 'pending', message: '' },
        startIssuanceValidation: { status: 'pending', message: '' },
        issuanceEndValidation: { status: 'pending', message: '' },
        institutionLengthValidation: { status: 'pending', message: '' },
        cardIdDigitValidation: { status: 'pending', message: '' },
        treatmentDatePresence: { status: 'pending', message: '' },
        treatmentDateRange: { status: 'pending', message: '' },
        jwtSignatureValidation: { status: 'pending', message: '' }
    };

    // Step 1-1: QR Code Analysis
    try {
        const QRCode = require('qrcode');

        // Check if data is valid for QR code analysis
        if (!originalData || originalData.length === 0) {
            throw new Error('No data provided for QR Code analysis');
        }

        if (originalData.length < 3) {
            throw new Error('Data too short for meaningful QR Code analysis');
        }

        // Analyze QR code characteristics by generating it and examining properties
        const qrAnalysis = await analyzeQRCodeData(originalData);
        const analysisSize = Buffer.byteLength(JSON.stringify(qrAnalysis), 'utf8');

        steps.push({
            name: 'QR Code Analysis (Step 1-1)',
            data: JSON.stringify(qrAnalysis, null, 2),
            size: analysisSize,
            percentage: 100
        });

        // Check if analysis has valid data
        const version = qrAnalysis?.actualQRProperties?.version;
        const errorLevel = qrAnalysis?.actualQRProperties?.errorCorrectionLevel;

        if (version && errorLevel) {
            validationSummary.qrCodeAnalysis = {
                status: 'success',
                message: `QR Code analyzed - Version ${version}, Error Level ${errorLevel}`
            };
        } else {
            validationSummary.qrCodeAnalysis = {
                status: 'error',
                message: `QR Code analysis incomplete - missing version or error correction level data`
            };
        }
    } catch (qrError) {
        // If QR analysis fails, add error info
        const errorInfo = {
            error: 'QR Code analysis failed',
            message: qrError.message,
            dataLength: originalData.length,
            dataPreview: originalData.substring(0, 100) + '...'
        };
        steps.push({
            name: 'QR Code Analysis (Step 1-1) - Error',
            data: JSON.stringify(errorInfo, null, 2),
            size: Buffer.byteLength(JSON.stringify(errorInfo), 'utf8'),
            percentage: 100
        });

        validationSummary.qrCodeAnalysis = {
            status: 'error',
            message: `QR Code analysis failed: ${qrError.message}`
        };
    }


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

        validationSummary.base45Decode = {
            status: 'success',
            message: `BASE45 decoded successfully (${base45Size} bytes)`
        };

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
            validationSummary.zlibDecompress = { status: 'success', message: 'ZLIB decompressed successfully' };

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

                    validationSummary.jwtParsing = {
                        status: 'success',
                        message: 'JWT parsed successfully'
                    };

                    // Step 4.1: Schema Validation
                    try {
                        logger.info('Starting schema validation for JWT');

                        // Extract SID from JWT payload
                        const payload = jwtDecoded.payload;
                        const sid = payload?.sid || null;

                        // For JWS validation, we need to match the JWS structure
                        // The schema expects "protected" (base64url encoded header) not "header"
                        // Get the original JWT parts from the zlibDecompressed string
                        const jwtParts = zlibDecompressed.split('.');

                        // Check if we have all three parts of a JWT
                        if (jwtParts.length !== 3) {
                            throw new Error(`Invalid JWT structure: expected 3 parts, got ${jwtParts.length}`);
                        }

                        // Preprocess the header to fix Base64 to Base64URL encoding in kid
                        const processedHeader = { ...jwtDecoded.header };
                        if (processedHeader.kid && typeof processedHeader.kid === 'string') {
                            // Convert Base64 to Base64URL by replacing + with - and / with _
                            // and removing any padding = characters
                            const originalKid = processedHeader.kid;

                            // Extract the parts of the kid
                            const kidMatch = originalKid.match(/^(EESSI:(?:x5t#S256|jkt):)(.+)$/);
                            if (kidMatch) {
                                const prefix = kidMatch[1];
                                const base64Part = kidMatch[2];

                                // Convert Base64 to Base64URL
                                const base64UrlPart = base64Part
                                    .replace(/\+/g, '-')
                                    .replace(/\//g, '_')
                                    .replace(/=/g, '');

                                processedHeader.kid = prefix + base64UrlPart;

                                logger.info('Converted kid to Base64URL format:', {
                                    original: originalKid,
                                    converted: processedHeader.kid
                                });
                            }
                        }

                        // Check what format the schema expects
                        // If schema expects 'protected' as an object, use decoded header
                        // If schema expects 'protected' as a string, use encoded header
                        const jwtToValidate = {
                            protected: processedHeader, // Use processed header with Base64URL kid
                            payload: jwtDecoded.payload, // Decoded payload object
                            signature: jwtParts[2] // Base64URL signature
                        };

                        logger.info('JWT parts for validation:', {
                            hasProtected: !!jwtParts[0],
                            protectedLength: jwtParts[0]?.length || 0,
                            hasPayload: !!jwtDecoded.payload,
                            hasSignature: !!jwtParts[2],
                            signatureLength: jwtParts[2]?.length || 0
                        });

                        logger.info('Schema validation context:', {
                            sid: sid,
                            jwtFields: Object.keys(jwtToValidate),
                            payloadFields: payload ? Object.keys(payload) : []
                        });

                        // Determine which schema file to use based on SID
                        let schemaFileName = sidSchemaMapping[sid];

                        if (!schemaFileName) {
                            // Schema mapping not found - create error response
                            const schemaErrorResult = {
                                found: false,
                                sid: sid,
                                error: 'Schema mapping not found',
                                message: `No schema mapping found for SID: ${sid}`,
                                availableSids: Object.keys(sidSchemaMapping),
                                timestamp: new Date().toISOString()
                            };

                            const errorString = JSON.stringify(schemaErrorResult, null, 2);
                            const errorSize = Buffer.byteLength(errorString, 'utf8');

                            steps.push({
                                name: 'Schema File Check (Step 4.1a) - Mapping Not Found',
                                data: errorString,
                                size: errorSize,
                                percentage: Math.round((errorSize / jwtSize) * 100)
                            });

                            validationSummary.schemaFileCheck = {
                                status: 'error',
                                message: `No schema mapping found for SID: ${sid}`
                            };

                            validationSummary.schemaValidation = {
                                status: 'error',
                                message: 'Skipped due to missing schema mapping'
                            };

                            logger.error('Schema mapping not found:', { sid, availableSids: Object.keys(sidSchemaMapping) });
                            throw new Error(`No schema mapping found for SID: ${sid}`);
                        }

                        // Build path to schema file
                        const schemaPath = path.join(__dirname, '..', 'schemas', schemaFileName);

                        // Step 4.1a: Check if schema file exists
                        if (!fs.existsSync(schemaPath)) {
                            const schemaNotFoundResult = {
                                found: false,
                                sid: sid,
                                requestedSchema: schemaFileName,
                                schemaPath: schemaPath,
                                availableSchemas: fs.existsSync(path.join(__dirname, '..', 'schemas')) ?
                                    fs.readdirSync(path.join(__dirname, '..', 'schemas')).filter(f => f.endsWith('.json')) : [],
                                message: `Schema file not found: ${schemaFileName}`,
                                timestamp: new Date().toISOString()
                            };

                            const notFoundString = JSON.stringify(schemaNotFoundResult, null, 2);
                            const notFoundSize = Buffer.byteLength(notFoundString, 'utf8');

                            steps.push({
                                name: 'Schema File Check (Step 4.1a) - Not Found',
                                data: notFoundString,
                                size: notFoundSize,
                                percentage: Math.round((notFoundSize / jwtSize) * 100)
                            });

                            validationSummary.schemaFileCheck = {
                                status: 'error',
                                message: `Schema file not found: ${schemaFileName}`
                            };

                            validationSummary.schemaValidation = {
                                status: 'error',
                                message: 'Skipped due to missing schema file'
                            };

                            logger.error('Schema file not found:', { schemaPath, sid });
                            throw new Error(`Schema file not found: ${schemaFileName}`);
                        }

                        // Schema file exists - log success
                        const schemaFoundResult = {
                            found: true,
                            sid: sid,
                            schemaFile: schemaFileName,
                            schemaPath: schemaPath,
                            message: `Schema file found: ${schemaFileName}`,
                            timestamp: new Date().toISOString()
                        };

                        const foundString = JSON.stringify(schemaFoundResult, null, 2);
                        const foundSize = Buffer.byteLength(foundString, 'utf8');

                        steps.push({
                            name: 'Schema File Check (Step 4.1a) - Found',
                            data: foundString,
                            size: foundSize,
                            percentage: Math.round((foundSize / jwtSize) * 100)
                        });

                        validationSummary.schemaFileCheck = {
                            status: 'success',
                            message: `Schema file found: ${schemaFileName}`
                        };

                        logger.info('Schema file check completed successfully:', { schemaPath, sid });

                        // Read and parse schema file
                        const schemaContent = fs.readFileSync(schemaPath, 'utf8');
                        const schema = JSON.parse(schemaContent);

                        // Perform validation
                        const validationErrors = [];

                        // Recursive validation function to handle nested objects
                        function validateObject(obj, schemaObj, path = '') {
                            // Check required fields
                            if (schemaObj.required) {
                                for (const field of schemaObj.required) {
                                    if (obj[field] === undefined || obj[field] === null) {
                                        validationErrors.push({
                                            field: path ? `${path}.${field}` : field,
                                            error: 'Required field missing',
                                            value: obj[field]
                                        });
                                    }
                                }
                            }

                            // Check property types and patterns
                            if (schemaObj.properties) {
                                for (const [key, rules] of Object.entries(schemaObj.properties)) {
                                    const fieldPath = path ? `${path}.${key}` : key;
                                    const value = obj[key];

                                    if (value !== undefined && value !== null) {
                                        // Handle nested objects
                                        if (rules.type === 'object' && rules.properties) {
                                            if (typeof value === 'object') {
                                                validateObject(value, rules, fieldPath);
                                            } else {
                                                validationErrors.push({
                                                    field: fieldPath,
                                                    error: `Expected object, got ${typeof value}`,
                                                    value: value
                                                });
                                            }
                                        }
                                        // Handle strings
                                        else if (typeof value === 'string') {
                                            // Pattern check
                                            if (rules.pattern) {
                                                const pattern = new RegExp(rules.pattern);
                                                if (!pattern.test(value)) {
                                                    validationErrors.push({
                                                        field: fieldPath,
                                                        error: `Value does not match pattern ${rules.pattern}`,
                                                        value: value
                                                    });
                                                }
                                            }
                                            // Length checks
                                            if (rules.minLength && value.length < rules.minLength) {
                                                validationErrors.push({
                                                    field: fieldPath,
                                                    error: `Minimum length is ${rules.minLength}`,
                                                    value: value,
                                                    actualLength: value.length
                                                });
                                            }
                                            if (rules.maxLength && value.length > rules.maxLength) {
                                                validationErrors.push({
                                                    field: fieldPath,
                                                    error: `Maximum length is ${rules.maxLength}`,
                                                    value: value,
                                                    actualLength: value.length
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Validate the entire JWT structure
                        validateObject(jwtToValidate, schema);

                        // Create validation result
                        const schemaValidationResult = {
                            valid: validationErrors.length === 0,
                            sid: sid,
                            schemaVersion: schemaFileName.replace('.json', ''),
                            schemaFile: schemaFileName,
                            errors: validationErrors,
                            errorCount: validationErrors.length,
                            validated: new Date().toISOString(),
                            jwtStructure: {
                                hasProtected: !!jwtToValidate.protected,
                                hasPayload: !!jwtToValidate.payload,
                                hasSignature: !!jwtToValidate.signature,
                                payloadFields: payload ? Object.keys(payload) : []
                            },
                            requiredFields: schema.required || [],
                            message: validationErrors.length === 0
                                ? 'JWT structure is valid according to schema'
                                : `Validation failed with ${validationErrors.length} error(s)`
                        };

                        const validationString = JSON.stringify(schemaValidationResult, null, 2);
                        const validationSize = Buffer.byteLength(validationString, 'utf8');

                        steps.push({
                            name: 'Schema Validation (Step 4.1b)',
                            data: validationString,
                            size: validationSize,
                            percentage: Math.round((validationSize / jwtSize) * 100)
                        });

                        logger.info('Schema validation completed:', {
                            valid: schemaValidationResult.valid,
                            errorCount: schemaValidationResult.errorCount,
                            sid: sid,
                            schema: schemaFileName
                        });

                        validationSummary.schemaValidation = {
                            status: schemaValidationResult.valid ? 'success' : 'error',
                            message: schemaValidationResult.message,
                            errorCount: schemaValidationResult.errorCount || 0
                        };

                    } catch (schemaError) {
                        // Schema validation failed - add error info but don't stop the process
                        const schemaErrorResult = {
                            valid: false,
                            error: 'Schema validation error',
                            message: schemaError.message,
                            sid: jwtDecoded?.payload?.sid || null,
                            timestamp: new Date().toISOString()
                        };

                        const errorString = JSON.stringify(schemaErrorResult, null, 2);
                        const errorSize = Buffer.byteLength(errorString, 'utf8');

                        steps.push({
                            name: 'Schema Validation (Step 4.1b) - Error',
                            data: errorString,
                            size: errorSize,
                            percentage: Math.round((errorSize / jwtSize) * 100)
                        });

                        logger.error('Schema validation failed:', {
                            error: schemaError.message,
                            sid: jwtDecoded?.payload?.sid || null
                        });

                        validationSummary.schemaValidation = {
                            status: 'error',
                            message: `Schema validation error: ${schemaError.message}`
                        };
                    }

                    // Step 7: Kid Header Validation
                    // Validate that header contains kid with pattern "^EESSI:x5t#S256:[A-Za-z0-9_-]+$"
                    const kidValidationResult = (() => {
                        const originalKid = jwtDecoded?.header?.kid;
                        let translatedKid = originalKid;

                        // Convert Base64 to Base64URL if needed for the translated version
                        if (originalKid && typeof originalKid === 'string') {
                            const kidMatch = originalKid.match(/^(EESSI:(?:x5t#S256|jkt):)(.+)$/);
                            if (kidMatch) {
                                const prefix = kidMatch[1];
                                const base64Part = kidMatch[2];

                                // Convert Base64 to Base64URL
                                const base64UrlPart = base64Part
                                    .replace(/\+/g, '-')
                                    .replace(/\//g, '_')
                                    .replace(/=/g, '');

                                translatedKid = prefix + base64UrlPart;
                            }
                        }

                        const kidPattern = /^EESSI:x5t#S256:[A-Za-z0-9_-]+$/;

                        if (!originalKid) {
                            return {
                                valid: false,
                                message: 'No kid field found in JWT header',
                                kid: null,
                                translatedKid: null,
                                timestamp: new Date().toISOString()
                            };
                        }

                        // Validate against the translated (base64url) version
                        const isValid = kidPattern.test(translatedKid);
                        return {
                            valid: isValid,
                            message: isValid
                                ? `Kid header validation passed: ${translatedKid}`
                                : `Kid header validation failed. Expected pattern: EESSI:x5t#S256:[A-Za-z0-9_-]+, got: ${translatedKid}`,
                            kid: originalKid,
                            translatedKid: translatedKid,
                            pattern: 'EESSI:x5t#S256:[A-Za-z0-9_-]+',
                            timestamp: new Date().toISOString()
                        };
                    })();

                    const kidValidationString = JSON.stringify(kidValidationResult, null, 2);
                    const kidValidationSize = Buffer.byteLength(kidValidationString, 'utf8');

                    steps.push({
                        name: 'Step 7: Kid Header Validation',
                        data: kidValidationString,
                        size: kidValidationSize,
                        percentage: Math.round((kidValidationSize / jwtSize) * 100)
                    });

                    validationSummary.kidHeaderValidation = {
                        status: kidValidationResult.valid ? 'success' : 'error',
                        message: kidValidationResult.message
                    };

                    if (!kidValidationResult.valid) {
                        logger.error('Kid header validation failed', {
                            kid: kidValidationResult.kid,
                            expected: 'EESSI:x5t#S256:[A-Za-z0-9_-]+',
                            jwtHeader: jwtDecoded?.header
                        });
                        // Don't throw error immediately - let other validations complete
                        logger.warn('Continuing with signature verification despite kid header validation failure');
                    }

                    // Step 8: Algorithm Header Validation
                    // Validate that header contains alg field with value from enum [ES256, RS256]
                    const algValidationResult = (() => {
                        const algorithm = jwtDecoded?.header?.alg;
                        const allowedAlgorithms = ['ES256', 'RS256'];

                        if (!algorithm) {
                            return {
                                valid: false,
                                message: 'No alg field found in JWT header',
                                algorithm: null,
                                allowedAlgorithms: allowedAlgorithms,
                                timestamp: new Date().toISOString()
                            };
                        }

                        const isValid = allowedAlgorithms.includes(algorithm);
                        return {
                            valid: isValid,
                            message: isValid
                                ? `Algorithm header validation passed: ${algorithm}`
                                : `Algorithm header validation failed. Expected one of: ${allowedAlgorithms.join(', ')}, got: ${algorithm}`,
                            algorithm: algorithm,
                            allowedAlgorithms: allowedAlgorithms,
                            timestamp: new Date().toISOString()
                        };
                    })();

                    const algValidationString = JSON.stringify(algValidationResult, null, 2);
                    const algValidationSize = Buffer.byteLength(algValidationString, 'utf8');

                    steps.push({
                        name: 'Step 8: Algorithm Header Validation',
                        data: algValidationString,
                        size: algValidationSize,
                        percentage: Math.round((algValidationSize / jwtSize) * 100)
                    });

                    validationSummary.algorithmHeaderValidation = {
                        status: algValidationResult.valid ? 'success' : 'error',
                        message: algValidationResult.message
                    };

                    if (!algValidationResult.valid) {
                        logger.error('Algorithm header validation failed', {
                            algorithm: algValidationResult.algorithm,
                            expected: allowedAlgorithms,
                            jwtHeader: jwtDecoded?.header
                        });
                        // Don't throw error immediately - let other validations complete
                        logger.warn('Continuing with signature verification despite algorithm header validation failure');
                    }

                    try {
                        // Step 5: Signature Verification
                        const signatureResponse = await verifySignature(jwtDecoded);
                        const responseString = JSON.stringify(signatureResponse, null, 2);
                        const responseSize = Buffer.byteLength(responseString, 'utf8');
                        steps.push({
                            name: 'Step 8: Signature Retrieval',
                            data: responseString,
                            size: responseSize,
                            percentage: Math.round((responseSize / jwtSize) * 100)
                        });
                        validationSummary.signatureVerification = {
                            status: 'success',
                            message: 'Signature retrieval completed'
                        };

                        // Step 8.1: Signature Count Validation
                        const signatureCount = signatureResponse.data && Array.isArray(signatureResponse.data) ?
                            signatureResponse.data.length :
                            (signatureResponse.data ? 1 : 0);

                        const countValidationResult = {
                            signatureCount: signatureCount,
                            expectedCount: 1,
                            valid: signatureCount === 1,
                            message: signatureCount === 1 ?
                                'Exactly one signature found' :
                                signatureCount === 0 ?
                                    'No signatures found' :
                                    `Too many signatures found: ${signatureCount}`,
                            timestamp: new Date().toISOString()
                        };

                        const countValidationString = JSON.stringify(countValidationResult, null, 2);
                        const countValidationSize = Buffer.byteLength(countValidationString, 'utf8');

                        steps.push({
                            name: 'Step 8.1: Signature Count Validation',
                            data: countValidationString,
                            size: countValidationSize,
                            percentage: Math.round((countValidationSize / responseSize) * 100)
                        });

                        validationSummary.signatureCountValidation = {
                            status: countValidationResult.valid ? 'success' : 'error',
                            message: countValidationResult.message
                        };

                        if (!countValidationResult.valid) {
                            logger.error('Signature count validation failed', {
                                expected: 1,
                                actual: signatureCount,
                                signatureResponse: signatureResponse
                            });
                            throw new Error(`Invalid signature count: expected 1, got ${signatureCount}`);
                        }

                        // Step 8.2: Country Code Validation
                        // Enhanced debugging to see full structures
                        logger.debug('JWT PAYLOAD FULL STRUCTURE:', JSON.stringify(jwtDecoded?.payload, null, 2));
                        logger.debug('SIGNATURE RESPONSE FULL STRUCTURE:', JSON.stringify(signatureResponse, null, 2));

                        // Try multiple possible paths for JWT country code
                        const jwtCountryCode = jwtDecoded?.payload?.ic ||
                                             jwtDecoded?.payload?.prc?.ic ||
                                             jwtDecoded?.payload?.cert?.ic ||
                                             jwtDecoded?.payload?.iss ||
                                             jwtDecoded?.payload?.countryCode ||
                                             null;

                        // Try multiple possible paths for signature country code
                        const signatureCountryCode = signatureResponse.data?.results && Array.isArray(signatureResponse.data.results) ?
                            signatureResponse.data.results[0]?.countryCode || signatureResponse.data.results[0]?.country :
                            signatureResponse.data?.countryCode || signatureResponse.data?.country ||
                            signatureResponse.detectedCountryCode || null;

                        logger.debug('Extracted country codes:', {
                            jwtCountryCode: jwtCountryCode,
                            signatureCountryCode: signatureCountryCode
                        });

                        const countryCodeValidationResult = {
                            jwtCountryCode: jwtCountryCode,
                            signatureCountryCode: signatureCountryCode,
                            match: jwtCountryCode && signatureCountryCode &&
                                   (jwtCountryCode === signatureCountryCode ||
                                    jwtCountryCode.includes(signatureCountryCode) ||
                                    signatureCountryCode.includes(jwtCountryCode)),
                            message: !jwtCountryCode ?
                                'No country code found in JWT' :
                                !signatureCountryCode ?
                                    'No country code found in signature response' :
                                    jwtCountryCode === signatureCountryCode ?
                                        `Country codes match: ${jwtCountryCode}` :
                                        `Country code mismatch: JWT=${jwtCountryCode}, Signature=${signatureCountryCode}`,
                            timestamp: new Date().toISOString()
                        };

                        const countryCodeValidationString = JSON.stringify(countryCodeValidationResult, null, 2);
                        const countryCodeValidationSize = Buffer.byteLength(countryCodeValidationString, 'utf8');

                        steps.push({
                            name: 'Step 8.2: Country Code Validation',
                            data: countryCodeValidationString,
                            size: countryCodeValidationSize,
                            percentage: Math.round((countryCodeValidationSize / countValidationSize) * 100)
                        });

                        validationSummary.countryCodeValidation = {
                            status: countryCodeValidationResult.match ? 'success' : 'error',
                            message: countryCodeValidationResult.message
                        };

                        if (!countryCodeValidationResult.match) {
                            logger.error('Country code validation failed', {
                                jwtCountryCode: jwtCountryCode,
                                signatureCountryCode: signatureCountryCode,
                                jwtPayload: jwtDecoded?.payload,
                                signatureData: signatureResponse.data
                            });
                            // Don't throw error immediately - let other validations complete
                            logger.warn('Continuing with JWT signature validation despite country code mismatch');
                        }

                        // Step 8.3: Certificate Validity Date Verification
                        // Verify that document issuance date falls within certificate validity period
                        let certificateValidityPassed = false;
                        let certificateValidityMessage = '';

                        // Get document issuance date (di) from JWT payload for certificate validity check
                        const issuanceDateStr = jwtDecoded?.payload?.prc?.di || treatmentDate || new Date().toISOString().split('T')[0];
                        const issuanceDateObj = new Date(issuanceDateStr);

                        logger.info('Using document issuance date for certificate validity check', {
                            issuanceDate: issuanceDateStr,
                            treatmentDate: treatmentDate,
                            source: jwtDecoded?.payload?.prc?.di ? 'JWT payload (di field)' : 'fallback'
                        });

                        try {

                            // Get certificate validity dates from signature response
                            let notBefore = null;
                            let notAfter = null;

                            // Extract certificate from EBSI response structure
                            if (signatureResponse.data?.results?.[0]?.certificates?.[0]) {
                                const certPem = signatureResponse.data.results[0].certificates[0];

                                try {
                                    // Parse the PEM certificate to extract validity dates
                                    const crypto = require('crypto');

                                    // For now, let's try to parse basic info without node-forge
                                    // Extract dates from the PEM certificate manually
                                    const certBase64 = certPem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
                                    const certBuffer = Buffer.from(certBase64, 'base64');

                                    // Note: This is a simplified approach. For production, we should use a proper ASN.1 parser
                                    logger.info('Certificate extracted from EBSI response', {
                                        certificateLength: certPem.length,
                                        certificateStart: certPem.substring(0, 50) + '...'
                                    });

                                    // For now, we'll leave the dates as null and log that we have the certificate
                                    // but couldn't parse the validity dates without proper ASN.1 parsing
                                    certificateValidityMessage = 'Certificate found but validity dates require ASN.1 parsing';

                                } catch (parseError) {
                                    logger.warn('Could not parse certificate', {
                                        error: parseError.message,
                                        certificateLength: certPem ? certPem.length : 0
                                    });
                                }

                                // Note: For a complete solution, we would need to parse the X.509 certificate
                                // to extract the actual validity dates. For now, we'll skip this complexity.
                            }

                            // Certificate validity check will be performed after extracting dates from OpenSSL output

                            // Extract detailed certificate information from EBSI response structure
                            let certificateDetails = null;

                            // Debug logging to see the response structure
                            logger.info('EBSI Response Structure Debug', {
                                hasData: !!signatureResponse.data,
                                hasDataData: !!signatureResponse.data?.data,
                                hasResults: !!signatureResponse.data?.data?.results,
                                resultsLength: signatureResponse.data?.data?.results?.length || 0,
                                hasFirstResult: !!signatureResponse.data?.results?.[0],
                                hasCertificates: !!signatureResponse.data?.results?.[0]?.certificates,
                                certificatesLength: signatureResponse.data?.results?.[0]?.certificates?.length || 0,
                                hasFirstCert: !!signatureResponse.data?.results?.[0]?.certificates?.[0]
                            });

                            if (signatureResponse.data?.results?.[0]?.certificates?.[0]) {
                                const result = signatureResponse.data.results[0];
                                const certPem = result.certificates[0];

                                logger.info('Certificate found in EBSI response', {
                                    certificateLength: certPem.length,
                                    certificateStart: certPem.substring(0, 100) + '...'
                                });

                                // Clean up the PEM certificate (replace \n with actual newlines)
                                const cleanCertPem = certPem.replace(/\\n/g, '\n');

                                // Parse the X.509 certificate using OpenSSL
                                let parsedCertInfo = null;
                                let opensslCertDetails = null;
                                try {
                                    const crypto = require('crypto');
                                    const fs = require('fs');
                                    const path = require('path');
                                    const { execSync } = require('child_process');

                                    // Create fingerprint from certificate buffer
                                    const certBase64 = cleanCertPem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
                                    const certBuffer = Buffer.from(certBase64, 'base64');
                                    const fingerprint = crypto.createHash('sha256').update(certBuffer).digest('hex').toUpperCase().match(/.{2}/g).join(':');

                                    // Write certificate to temporary file
                                    const tempCertPath = path.join(__dirname, '..', 'temp', `cert_${Date.now()}.crt`);

                                    // Ensure temp directory exists
                                    const tempDir = path.dirname(tempCertPath);
                                    if (!fs.existsSync(tempDir)) {
                                        fs.mkdirSync(tempDir, { recursive: true });
                                    }

                                    fs.writeFileSync(tempCertPath, cleanCertPem);

                                    // Use OpenSSL to parse certificate details
                                    try {
                                        const opensslOutput = execSync(`openssl x509 -in "${tempCertPath}" -text -noout`, {
                                            encoding: 'utf8',
                                            timeout: 5000 // 5 second timeout
                                        });
                                        // Format the OpenSSL output for better readability
                                        // Convert Windows line endings (\r\n) to Unix line endings (\n)
                                        opensslCertDetails = opensslOutput.trim().replace(/\r\n/g, '\n');

                                        // Extract validity dates from OpenSSL output
                                        const notBeforeMatch = opensslCertDetails.match(/Not Before:\s*(.+)/);
                                        const notAfterMatch = opensslCertDetails.match(/Not After\s*:\s*(.+)/);

                                        if (notBeforeMatch && notAfterMatch) {
                                            try {
                                                notBefore = new Date(notBeforeMatch[1].trim());
                                                notAfter = new Date(notAfterMatch[1].trim());

                                                logger.info('Certificate validity dates extracted from OpenSSL', {
                                                    notBefore: notBefore.toISOString(),
                                                    notAfter: notAfter.toISOString()
                                                });
                                            } catch (dateParseError) {
                                                logger.warn('Could not parse validity dates from OpenSSL output', {
                                                    error: dateParseError.message,
                                                    notBeforeString: notBeforeMatch[1],
                                                    notAfterString: notAfterMatch[1]
                                                });
                                            }
                                        }

                                        logger.info('Certificate parsed successfully with OpenSSL', {
                                            outputLength: opensslOutput.length,
                                            validityDatesExtracted: !!(notBefore && notAfter)
                                        });
                                    } catch (opensslError) {
                                        logger.warn('OpenSSL parsing failed, falling back to basic info', {
                                            error: opensslError.message
                                        });
                                    }

                                    // Clean up temp file
                                    try {
                                        fs.unlinkSync(tempCertPath);
                                    } catch (cleanupError) {
                                        logger.warn('Could not clean up temp certificate file', {
                                            error: cleanupError.message,
                                            path: tempCertPath
                                        });
                                    }

                                    parsedCertInfo = {
                                        size: certBuffer.length + ' bytes',
                                        format: 'X.509 PEM Certificate',
                                        fingerprint: fingerprint,
                                        opensslDetails: opensslCertDetails || 'OpenSSL parsing not available',
                                        note: opensslCertDetails ? 'Complete certificate details parsed with OpenSSL' : 'Basic certificate info only'
                                    };

                                } catch (parseError) {
                                    logger.warn('Could not parse certificate details', {
                                        error: parseError.message,
                                        certificateLength: cleanCertPem.length
                                    });
                                    parsedCertInfo = {
                                        error: 'Could not parse certificate details',
                                        reason: parseError.message,
                                        certificateLength: cleanCertPem.length
                                    };
                                }

                                certificateDetails = {
                                    sha256Thumbprint: result.publicKeys?.[0]?.['x5t#S256'] || 'N/A',
                                    validityPeriod: {
                                        notBefore: notBefore ? notBefore.toISOString() : 'N/A',
                                        notAfter: notAfter ? notAfter.toISOString() : 'N/A'
                                    },
                                    certificatePresent: true,
                                    parsedInfo: parsedCertInfo,
                                    rawCertificateLength: cleanCertPem.length,
                                    certificateDisplay: {
                                        format: 'X.509 PEM Certificate',
                                        length: cleanCertPem.length + ' characters',
                                        note: 'Full certificate data shown in rawCertificateData section'
                                    },
                                    fullCertificatePEM: cleanCertPem
                                };

                                logger.info('Certificate details extracted successfully', {
                                    thumbprint: certificateDetails.sha256Thumbprint,
                                    length: certificateDetails.rawCertificateLength,
                                    hasFullPEM: !!certificateDetails.fullCertificatePEM
                                });

                            } else {
                                logger.warn('Certificate not found in expected EBSI response location');
                                certificateDetails = {
                                    message: 'Certificate not found in EBSI response - check response structure'
                                };
                            }

                            // Now that we have extracted dates from OpenSSL, perform proper validity check
                            if (notBefore && notAfter) {
                                const isValid = issuanceDateObj >= notBefore && issuanceDateObj <= notAfter;

                                certificateValidityPassed = isValid;
                                certificateValidityMessage = isValid
                                    ? `Document issuance date ${issuanceDateStr} is within certificate validity period (${notBefore.toISOString().split('T')[0]} to ${notAfter.toISOString().split('T')[0]})`
                                    : `Document issuance date ${issuanceDateStr} is OUTSIDE certificate validity period (${notBefore.toISOString().split('T')[0]} to ${notAfter.toISOString().split('T')[0]})`;

                                logger.info('Certificate validity check completed with extracted dates', {
                                    issuanceDate: issuanceDateStr,
                                    treatmentDate: treatmentDate,
                                    notBefore: notBefore.toISOString(),
                                    notAfter: notAfter.toISOString(),
                                    isValid: isValid
                                });
                            }

                            // Create a clean, minimal response for the step data
                            const certificateValidityResult = {
                                validityCheck: {
                                    passed: certificateValidityPassed,
                                    documentIssuanceDate: issuanceDateStr,
                                    certificateNotBefore: notBefore ? notBefore.toISOString().split('T')[0] : null,
                                    certificateNotAfter: notAfter ? notAfter.toISOString().split('T')[0] : null,
                                    message: certificateValidityMessage
                                }
                            };

                            const validityString = JSON.stringify(certificateValidityResult, null, 2);
                            const validitySize = Buffer.byteLength(validityString, 'utf8');

                            steps.push({
                                name: 'Step 8.3: Certificate Validity Date Verification',
                                data: validityString,
                                size: validitySize,
                                percentage: Math.round((validitySize / responseSize) * 100),
                                certificateDetails: certificateDetails // Add certificate details to step for frontend access
                            });

                            // Ensure opensslDetails is either an object or null (not a string)
                            let opensslDetailsForSummary = certificateDetails?.parsedInfo?.opensslDetails || null;
                            if (typeof opensslDetailsForSummary === 'string') {
                                opensslDetailsForSummary = null; // Convert string to null for schema compliance
                            }

                            validationSummary.certificateValidityDate = {
                                status: certificateValidityPassed ? 'success' : 'error',
                                message: certificateValidityMessage,
                                opensslDetails: opensslDetailsForSummary
                            };

                            // Debug logging
                            logger.info('Certificate validation summary created', {
                                hasOpensslDetails: !!certificateDetails?.parsedInfo?.opensslDetails,
                                opensslDetailsLength: certificateDetails?.parsedInfo?.opensslDetails?.length || 0,
                                opensslDetailsPreview: certificateDetails?.parsedInfo?.opensslDetails?.substring(0, 100) || 'N/A'
                            });

                            logger.info('Certificate validity date check completed', certificateValidityResult);

                        } catch (validityError) {
                            logger.error('Certificate validity date verification failed:', validityError);

                            // Still try to extract certificate details even if validity check failed
                            let certificateDetails = null;
                            if (signatureResponse.data?.results?.[0]) {
                                const result = signatureResponse.data.results[0];

                                // Get the first certificate from the certificates array (it's a string, not an object)
                                const certPem = result.certificates?.[0];

                                // Try to parse the X.509 certificate for more details using OpenSSL
                                let parsedCertInfo = null;
                                if (certPem && typeof certPem === 'string') {
                                    try {
                                        const crypto = require('crypto');
                                        const fs = require('fs');
                                        const path = require('path');
                                        const { execSync } = require('child_process');

                                        // Clean up the PEM certificate
                                        const cleanCertPem = certPem.replace(/\\n/g, '\n');
                                        const certBuffer = Buffer.from(cleanCertPem.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''), 'base64');
                                        const fingerprint = crypto.createHash('sha256').update(certBuffer).digest('hex').toUpperCase().match(/.{2}/g).join(':');

                                        // Try OpenSSL parsing (in error case too)
                                        let opensslCertDetails = null;
                                        try {
                                            const tempCertPath = path.join(__dirname, '..', 'temp', `cert_error_${Date.now()}.crt`);
                                            const tempDir = path.dirname(tempCertPath);
                                            if (!fs.existsSync(tempDir)) {
                                                fs.mkdirSync(tempDir, { recursive: true });
                                            }

                                            fs.writeFileSync(tempCertPath, cleanCertPem);
                                            const opensslOutput = execSync(`openssl x509 -in "${tempCertPath}" -text -noout`, {
                                                encoding: 'utf8',
                                                timeout: 5000
                                            });
                                            opensslCertDetails = opensslOutput.trim().replace(/\r\n/g, '\n');

                                            // Clean up temp file
                                            try {
                                                fs.unlinkSync(tempCertPath);
                                            } catch (cleanupError) {
                                                logger.warn('Could not clean up temp certificate file in error case', {
                                                    error: cleanupError.message
                                                });
                                            }
                                        } catch (opensslError) {
                                            logger.warn('OpenSSL parsing failed in error case', {
                                                error: opensslError.message
                                            });
                                        }

                                        parsedCertInfo = {
                                            size: certBuffer.length + ' bytes',
                                            format: 'X.509 PEM Certificate',
                                            fingerprint: fingerprint,
                                            opensslDetails: opensslCertDetails || 'OpenSSL parsing not available in error case',
                                            note: opensslCertDetails ? 'Complete certificate details parsed with OpenSSL (despite validation error)' : 'Basic certificate info only'
                                        };
                                    } catch (parseError) {
                                        parsedCertInfo = {
                                            error: 'Could not parse certificate details',
                                            reason: parseError.message
                                        };
                                    }
                                }

                                certificateDetails = {
                                    sha256Thumbprint: result.publicKeys?.[0]?.['x5t#S256'] || 'N/A',
                                    validityPeriod: {
                                        notBefore: 'Error occurred during validity check',
                                        notAfter: 'Error occurred during validity check'
                                    },
                                    certificatePresent: !!certPem,
                                    parsedInfo: parsedCertInfo || 'Certificate parsing not available',
                                    rawCertificateLength: certPem ? certPem.length : 0,
                                    certificateDisplay: {
                                        format: 'X.509 PEM Certificate',
                                        length: certPem ? certPem.length + ' characters' : '0',
                                        note: 'Full certificate data shown below'
                                    },
                                    fullCertificatePEM: certPem || 'Certificate data not available'
                                };
                            }

                            const errorResult = {
                                validityCheck: {
                                    passed: false,
                                    documentIssuanceDate: issuanceDateStr,
                                    error: validityError.message,
                                    message: 'Certificate validity date verification failed'
                                },
                                issuerInfo: signatureResponse.data?.results?.[0] ? {
                                    name: signatureResponse.data.results[0].name || 'Unknown',
                                    countryCode: signatureResponse.data.results[0].countryCode || 'Unknown',
                                    officialId: signatureResponse.data.results[0].officialId || 'Unknown',
                                    did: signatureResponse.data.results[0].did || 'Not available'
                                } : {
                                    message: 'No issuer information available'
                                },
                                certificateDetails: certificateDetails || {
                                    message: 'No certificate details available from EBSI response'
                                },
                                rawCertificateData: {
                                    description: 'Complete X.509 Certificate in PEM Format (despite validation error)',
                                    certificate: certificateDetails?.fullCertificatePEM || 'No certificate available'
                                },
                                timestamp: new Date().toISOString()
                            };

                            steps.push({
                                name: 'Step 8.3: Certificate Validity Date Verification (ERROR)',
                                data: JSON.stringify(errorResult, null, 2),
                                size: Buffer.byteLength(JSON.stringify(errorResult), 'utf8'),
                                percentage: 100
                            });

                            // Ensure opensslDetails is either an object or null (not a string) for error case too
                            let opensslDetailsForError = certificateDetails?.parsedInfo?.opensslDetails || null;
                            if (typeof opensslDetailsForError === 'string') {
                                opensslDetailsForError = null; // Convert string to null for schema compliance
                            }

                            validationSummary.certificateValidityDate = {
                                status: 'error',
                                message: `Verification failed: ${validityError.message}`,
                                opensslDetails: opensslDetailsForError
                            };
                        }

                        try {
                            // Step 9: JWT Signature Validation using EBSI public key
                            const jwtValidationResult = await validateJwtSignature(zlibDecompressed, signatureResponse.data);
                            const validationString = JSON.stringify(jwtValidationResult, null, 2);
                            const validationSize = Buffer.byteLength(validationString, 'utf8');
                            steps.push({
                                name: 'JWT Signature Validation',
                                data: validationString,
                                size: validationSize,
                                percentage: Math.round((validationSize / responseSize) * 100)
                            });

                            validationSummary.jwtSignatureValidation = {
                                status: jwtValidationResult.signatureValid ? 'success' : 'error',
                                message: jwtValidationResult.signatureValid ?
                                    'JWT signature validation successful' :
                                    'JWT signature validation failed'
                            };

                            // Step 10: EHIC Accreditation Validation
                            try {
                                let accreditationPassed = false;
                                let accreditationMessage = 'EHIC accreditation check failed';

                                if (signatureResponse.data?.results?.[0]) {
                                    const issuerInfo = signatureResponse.data.results[0];
                                    const accreditedFor = issuerInfo.accreditedFor || [];

                                    accreditationPassed = accreditedFor.includes('EHIC');
                                    accreditationMessage = accreditationPassed
                                        ? `Issuer "${issuerInfo.name || issuerInfo.officialId}" is accredited to issue EHIC documents`
                                        : `Issuer "${issuerInfo.name || issuerInfo.officialId}" is not accredited to issue EHIC documents. Accredited for: [${accreditedFor.join(', ')}]`;

                                    logger.info('EHIC accreditation check completed', {
                                        issuerName: issuerInfo.name,
                                        officialId: issuerInfo.officialId,
                                        accreditedFor: accreditedFor,
                                        isEHICAccredited: accreditationPassed
                                    });
                                } else {
                                    accreditationMessage = 'EHIC accreditation check failed: No issuer information available';
                                    logger.warn('EHIC accreditation check failed: No issuer information in signature response');
                                }

                                const accreditationString = JSON.stringify({
                                    accreditationPassed,
                                    message: accreditationMessage,
                                    issuerInfo: signatureResponse.data?.results?.[0] ? {
                                        name: signatureResponse.data.results[0].name,
                                        officialId: signatureResponse.data.results[0].officialId,
                                        countryCode: signatureResponse.data.results[0].countryCode,
                                        accreditedFor: signatureResponse.data.results[0].accreditedFor
                                    } : null
                                }, null, 2);
                                const accreditationSize = Buffer.byteLength(accreditationString, 'utf8');

                                steps.push({
                                    name: 'Step 10: EHIC Accreditation Validation',
                                    data: accreditationString,
                                    size: accreditationSize,
                                    percentage: Math.round((accreditationSize / responseSize) * 100)
                                });

                                validationSummary.ehicAccreditation = {
                                    status: accreditationPassed ? 'success' : 'error',
                                    message: accreditationMessage
                                };

                            } catch (accreditationError) {
                                logger.error('EHIC accreditation validation failed:', accreditationError);

                                validationSummary.ehicAccreditation = {
                                    status: 'error',
                                    message: `EHIC accreditation validation failed: ${accreditationError.message}`
                                };
                            }

                            // Step 11: Date of Birth Validation
                            try {
                                let dobValidationPassed = false;
                                let dobValidationMessage = 'Date of birth validation failed';

                                const prcData = jwtDecoded?.payload?.prc;
                                if (prcData?.dob && prcData?.sd) {
                                    const dobDate = new Date(prcData.dob);
                                    const startDate = new Date(prcData.sd);

                                    // Check if dates are valid
                                    if (!isNaN(dobDate.getTime()) && !isNaN(startDate.getTime())) {
                                        dobValidationPassed = dobDate <= startDate;

                                        if (dobValidationPassed) {
                                            dobValidationMessage = `Date of birth (${dobDate.toISOString().split('T')[0]}) is valid - occurs before or on EHIC start date (${startDate.toISOString().split('T')[0]})`;
                                        } else {
                                            dobValidationMessage = `Date of birth (${dobDate.toISOString().split('T')[0]}) is invalid - occurs after EHIC start date (${startDate.toISOString().split('T')[0]})`;
                                        }

                                        logger.info('Date of birth validation completed', {
                                            dateOfBirth: dobDate.toISOString(),
                                            startDate: startDate.toISOString(),
                                            isValid: dobValidationPassed
                                        });
                                    } else {
                                        dobValidationMessage = 'Date of birth validation failed: Invalid date format';
                                        logger.warn('Date of birth validation failed: Invalid date format', {
                                            dob: prcData.dob,
                                            sd: prcData.sd,
                                            dobValid: !isNaN(dobDate.getTime()),
                                            sdValid: !isNaN(startDate.getTime())
                                        });
                                    }
                                } else {
                                    dobValidationMessage = 'Date of birth validation failed: Missing date of birth or start date in PRC data';
                                    logger.warn('Date of birth validation failed: Missing required fields', {
                                        hasDob: !!prcData?.dob,
                                        hasSd: !!prcData?.sd,
                                        prcDataExists: !!prcData
                                    });
                                }

                                const dobValidationString = JSON.stringify({
                                    dobValidationPassed,
                                    message: dobValidationMessage,
                                    dateOfBirth: prcData?.dob || null,
                                    startDate: prcData?.sd || null,
                                    dateComparison: prcData?.dob && prcData?.sd ? {
                                        dobParsed: new Date(prcData.dob).toISOString(),
                                        sdParsed: new Date(prcData.sd).toISOString(),
                                        dobBeforeOrEqualSd: new Date(prcData.dob) <= new Date(prcData.sd)
                                    } : null
                                }, null, 2);
                                const dobValidationSize = Buffer.byteLength(dobValidationString, 'utf8');

                                steps.push({
                                    name: 'Step 11: Date of Birth Validation',
                                    data: dobValidationString,
                                    size: dobValidationSize,
                                    percentage: Math.round((dobValidationSize / responseSize) * 100)
                                });

                                validationSummary.dateOfBirthValidation = {
                                    status: dobValidationPassed ? 'success' : 'error',
                                    message: dobValidationMessage
                                };

                            } catch (dobError) {
                                logger.error('Date of birth validation failed:', dobError);

                                validationSummary.dateOfBirthValidation = {
                                    status: 'error',
                                    message: `Date of birth validation failed: ${dobError.message}`
                                };
                            }

                            // Step 12: Start Date vs End Date Validation
                            try {
                                let dateRangeValidationPassed = false;
                                let dateRangeValidationMessage = 'Start/End date validation failed';

                                const prcData = jwtDecoded?.payload?.prc;
                                if (prcData?.sd && prcData?.ed) {
                                    const startDate = new Date(prcData.sd);
                                    const endDate = new Date(prcData.ed);

                                    // Check if dates are valid
                                    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                                        dateRangeValidationPassed = startDate <= endDate;

                                        if (dateRangeValidationPassed) {
                                            dateRangeValidationMessage = `EHIC date range is valid - start date (${startDate.toISOString().split('T')[0]}) is before or on end date (${endDate.toISOString().split('T')[0]})`;
                                        } else {
                                            dateRangeValidationMessage = `EHIC date range is invalid - start date (${startDate.toISOString().split('T')[0]}) is after end date (${endDate.toISOString().split('T')[0]})`;
                                        }

                                        logger.info('Start/End date validation completed', {
                                            startDate: startDate.toISOString(),
                                            endDate: endDate.toISOString(),
                                            isValid: dateRangeValidationPassed,
                                            daysDifference: Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24))
                                        });
                                    } else {
                                        dateRangeValidationMessage = 'Start/End date validation failed: Invalid date format';
                                        logger.warn('Start/End date validation failed: Invalid date format', {
                                            sd: prcData.sd,
                                            ed: prcData.ed,
                                            sdValid: !isNaN(startDate.getTime()),
                                            edValid: !isNaN(endDate.getTime())
                                        });
                                    }
                                } else {
                                    dateRangeValidationMessage = 'Start/End date validation failed: Missing start date or end date in PRC data';
                                    logger.warn('Start/End date validation failed: Missing required fields', {
                                        hasSd: !!prcData?.sd,
                                        hasEd: !!prcData?.ed,
                                        prcDataExists: !!prcData
                                    });
                                }

                                const dateRangeValidationString = JSON.stringify({
                                    dateRangeValidationPassed,
                                    message: dateRangeValidationMessage,
                                    startDate: prcData?.sd || null,
                                    endDate: prcData?.ed || null,
                                    dateComparison: prcData?.sd && prcData?.ed ? {
                                        sdParsed: new Date(prcData.sd).toISOString(),
                                        edParsed: new Date(prcData.ed).toISOString(),
                                        sdBeforeOrEqualEd: new Date(prcData.sd) <= new Date(prcData.ed),
                                        daysDifference: Math.floor((new Date(prcData.ed) - new Date(prcData.sd)) / (1000 * 60 * 60 * 24))
                                    } : null
                                }, null, 2);
                                const dateRangeValidationSize = Buffer.byteLength(dateRangeValidationString, 'utf8');

                                steps.push({
                                    name: 'Step 12: Start/End Date Validation',
                                    data: dateRangeValidationString,
                                    size: dateRangeValidationSize,
                                    percentage: Math.round((dateRangeValidationSize / responseSize) * 100)
                                });

                                validationSummary.dateRangeValidation = {
                                    status: dateRangeValidationPassed ? 'success' : 'error',
                                    message: dateRangeValidationMessage
                                };

                            } catch (dateRangeError) {
                                logger.error('Start/End date validation failed:', dateRangeError);

                                validationSummary.dateRangeValidation = {
                                    status: 'error',
                                    message: `Start/End date validation failed: ${dateRangeError.message}`
                                };
                            }

                            // Step 13: Start Date vs Issuance Date Validation
                            try {
                                let startIssuanceValidationPassed = false;
                                let startIssuanceValidationMessage = 'Start/Issuance date validation failed';

                                const prcData = jwtDecoded?.payload?.prc;
                                if (prcData?.sd && prcData?.di) {
                                    const startDate = new Date(prcData.sd);
                                    const issuanceDate = new Date(prcData.di);

                                    // Check if dates are valid
                                    if (!isNaN(startDate.getTime()) && !isNaN(issuanceDate.getTime())) {
                                        startIssuanceValidationPassed = startDate <= issuanceDate;

                                        if (startIssuanceValidationPassed) {
                                            startIssuanceValidationMessage = `EHIC start/issuance date validation passed - start date (${startDate.toISOString().split('T')[0]}) is before or on issuance date (${issuanceDate.toISOString().split('T')[0]})`;
                                        } else {
                                            startIssuanceValidationMessage = `EHIC start/issuance date validation failed - start date (${startDate.toISOString().split('T')[0]}) is after issuance date (${issuanceDate.toISOString().split('T')[0]})`;
                                        }

                                        logger.info('Start/Issuance date validation completed', {
                                            startDate: startDate.toISOString(),
                                            issuanceDate: issuanceDate.toISOString(),
                                            isValid: startIssuanceValidationPassed,
                                            daysDifference: Math.floor((issuanceDate - startDate) / (1000 * 60 * 60 * 24))
                                        });
                                    } else {
                                        startIssuanceValidationMessage = 'Start/Issuance date validation failed: Invalid date format';
                                        logger.warn('Start/Issuance date validation failed: Invalid date format', {
                                            sd: prcData.sd,
                                            di: prcData.di,
                                            sdValid: !isNaN(startDate.getTime()),
                                            diValid: !isNaN(issuanceDate.getTime())
                                        });
                                    }
                                } else {
                                    startIssuanceValidationMessage = 'Start/Issuance date validation failed: Missing start date or issuance date in PRC data';
                                    logger.warn('Start/Issuance date validation failed: Missing required fields', {
                                        hasSd: !!prcData?.sd,
                                        hasDi: !!prcData?.di,
                                        prcDataExists: !!prcData
                                    });
                                }

                                const startIssuanceValidationString = JSON.stringify({
                                    startIssuanceValidationPassed,
                                    message: startIssuanceValidationMessage,
                                    startDate: prcData?.sd || null,
                                    issuanceDate: prcData?.di || null,
                                    dateComparison: prcData?.sd && prcData?.di ? {
                                        sdParsed: new Date(prcData.sd).toISOString(),
                                        diParsed: new Date(prcData.di).toISOString(),
                                        sdBeforeOrEqualDi: new Date(prcData.sd) <= new Date(prcData.di),
                                        daysDifference: Math.floor((new Date(prcData.di) - new Date(prcData.sd)) / (1000 * 60 * 60 * 24))
                                    } : null
                                }, null, 2);
                                const startIssuanceValidationSize = Buffer.byteLength(startIssuanceValidationString, 'utf8');

                                steps.push({
                                    name: 'Step 13: Start/Issuance Date Validation',
                                    data: startIssuanceValidationString,
                                    size: startIssuanceValidationSize,
                                    percentage: Math.round((startIssuanceValidationSize / responseSize) * 100)
                                });

                                validationSummary.startIssuanceValidation = {
                                    status: startIssuanceValidationPassed ? 'success' : 'error',
                                    message: startIssuanceValidationMessage
                                };

                            } catch (startIssuanceError) {
                                logger.error('Start/Issuance date validation failed:', startIssuanceError);

                                validationSummary.startIssuanceValidation = {
                                    status: 'error',
                                    message: `Start/Issuance date validation failed: ${startIssuanceError.message}`
                                };
                            }

                            // Step 14: Issuance Date vs End Date Validation
                            try {
                                let issuanceEndValidationPassed = false;
                                let issuanceEndValidationMessage = 'Issuance/End date validation failed';

                                const prcData = jwtDecoded?.payload?.prc;
                                if (prcData?.di && prcData?.ed) {
                                    const issuanceDate = new Date(prcData.di);
                                    const endDate = new Date(prcData.ed);

                                    // Check if dates are valid
                                    if (!isNaN(issuanceDate.getTime()) && !isNaN(endDate.getTime())) {
                                        issuanceEndValidationPassed = issuanceDate <= endDate;

                                        if (issuanceEndValidationPassed) {
                                            issuanceEndValidationMessage = `EHIC issuance/end date validation passed - issuance date (${issuanceDate.toISOString().split('T')[0]}) is before or on end date (${endDate.toISOString().split('T')[0]})`;
                                        } else {
                                            issuanceEndValidationMessage = `EHIC issuance/end date validation failed - issuance date (${issuanceDate.toISOString().split('T')[0]}) is after end date (${endDate.toISOString().split('T')[0]})`;
                                        }

                                        logger.info('Issuance/End date validation completed', {
                                            issuanceDate: issuanceDate.toISOString(),
                                            endDate: endDate.toISOString(),
                                            isValid: issuanceEndValidationPassed,
                                            daysDifference: Math.floor((endDate - issuanceDate) / (1000 * 60 * 60 * 24))
                                        });
                                    } else {
                                        issuanceEndValidationMessage = 'Issuance/End date validation failed: Invalid date format';
                                        logger.warn('Issuance/End date validation failed: Invalid date format', {
                                            di: prcData.di,
                                            ed: prcData.ed,
                                            diValid: !isNaN(issuanceDate.getTime()),
                                            edValid: !isNaN(endDate.getTime())
                                        });
                                    }
                                } else {
                                    issuanceEndValidationMessage = 'Issuance/End date validation failed: Missing issuance date or end date in PRC data';
                                    logger.warn('Issuance/End date validation failed: Missing required fields', {
                                        hasDi: !!prcData?.di,
                                        hasEd: !!prcData?.ed,
                                        prcDataExists: !!prcData
                                    });
                                }

                                const issuanceEndValidationString = JSON.stringify({
                                    issuanceEndValidationPassed,
                                    message: issuanceEndValidationMessage,
                                    issuanceDate: prcData?.di || null,
                                    endDate: prcData?.ed || null,
                                    dateComparison: prcData?.di && prcData?.ed ? {
                                        diParsed: new Date(prcData.di).toISOString(),
                                        edParsed: new Date(prcData.ed).toISOString(),
                                        diBeforeOrEqualEd: new Date(prcData.di) <= new Date(prcData.ed),
                                        daysDifference: Math.floor((new Date(prcData.ed) - new Date(prcData.di)) / (1000 * 60 * 60 * 24))
                                    } : null
                                }, null, 2);
                                const issuanceEndValidationSize = Buffer.byteLength(issuanceEndValidationString, 'utf8');

                                steps.push({
                                    name: 'Step 14: Issuance/End Date Validation',
                                    data: issuanceEndValidationString,
                                    size: issuanceEndValidationSize,
                                    percentage: Math.round((issuanceEndValidationSize / responseSize) * 100)
                                });

                                validationSummary.issuanceEndValidation = {
                                    status: issuanceEndValidationPassed ? 'success' : 'error',
                                    message: issuanceEndValidationMessage
                                };

                            } catch (issuanceEndError) {
                                logger.error('Issuance/End date validation failed:', issuanceEndError);

                                validationSummary.issuanceEndValidation = {
                                    status: 'error',
                                    message: `Issuance/End date validation failed: ${issuanceEndError.message}`
                                };
                            }

                            // Step 15: Institution ID/Name Length Validation (Optional - Warning Only)
                            try {
                                let institutionValidationPassed = true; // Default to passed (warning only)
                                let institutionValidationMessage = 'Institution ID/Name length validation skipped - no expiry date found';
                                let validationTriggered = false;

                                const prcData = jwtDecoded?.payload?.prc;

                                // Only perform validation if expiry date exists (ed field)
                                if (prcData?.ed) {
                                    validationTriggered = true;
                                    const institutionId = prcData?.ii || '';
                                    const institutionName = prcData?.in || '';
                                    const combinedLength = institutionId.length + institutionName.length;
                                    const maxLength = 25;

                                    if (combinedLength <= maxLength) {
                                        institutionValidationMessage = `Institution validation passed - combined ID/Name length (${combinedLength}) is within limit (${maxLength} characters). ID: "${institutionId}" (${institutionId.length}), Name: "${institutionName}" (${institutionName.length})`;
                                        institutionValidationPassed = true;
                                    } else {
                                        institutionValidationMessage = `Institution validation warning - combined ID/Name length (${combinedLength}) exceeds recommended limit (${maxLength} characters). ID: "${institutionId}" (${institutionId.length}), Name: "${institutionName}" (${institutionName.length})`;
                                        institutionValidationPassed = false; // This will show as warning, not error
                                    }

                                    logger.info('Institution ID/Name length validation completed', {
                                        institutionId: institutionId,
                                        institutionName: institutionName,
                                        idLength: institutionId.length,
                                        nameLength: institutionName.length,
                                        combinedLength: combinedLength,
                                        maxLength: maxLength,
                                        isWithinLimit: combinedLength <= maxLength,
                                        hasExpiryDate: !!prcData.ed
                                    });
                                } else {
                                    logger.info('Institution ID/Name length validation skipped - no expiry date found', {
                                        hasExpiryDate: false,
                                        prcDataExists: !!prcData
                                    });
                                }

                                const institutionValidationString = JSON.stringify({
                                    institutionValidationPassed,
                                    validationTriggered,
                                    message: institutionValidationMessage,
                                    institutionId: prcData?.ii || null,
                                    institutionName: prcData?.in || null,
                                    expiryDate: prcData?.ed || null,
                                    lengthAnalysis: validationTriggered ? {
                                        idLength: (prcData?.ii || '').length,
                                        nameLength: (prcData?.in || '').length,
                                        combinedLength: (prcData?.ii || '').length + (prcData?.in || '').length,
                                        maxRecommendedLength: 25,
                                        isWithinLimit: ((prcData?.ii || '').length + (prcData?.in || '').length) <= 25
                                    } : null
                                }, null, 2);
                                const institutionValidationSize = Buffer.byteLength(institutionValidationString, 'utf8');

                                steps.push({
                                    name: 'Step 15: Institution ID/Name Length Validation (Optional)',
                                    data: institutionValidationString,
                                    size: institutionValidationSize,
                                    percentage: Math.round((institutionValidationSize / responseSize) * 100)
                                });

                                // Set status as warning for failed validation (not error), success for passed, or skipped if not triggered
                                validationSummary.institutionLengthValidation = {
                                    status: !validationTriggered ? 'skipped' : (institutionValidationPassed ? 'success' : 'warning'),
                                    message: institutionValidationMessage
                                };

                            } catch (institutionError) {
                                logger.error('Institution ID/Name length validation failed:', institutionError);

                                validationSummary.institutionLengthValidation = {
                                    status: 'warning', // Still warning, not error
                                    message: `Institution ID/Name length validation encountered an error: ${institutionError.message}`
                                };
                            }

                            // Step 16: Card ID Digit Validation (Optional - Warning Only)
                            try {
                                let cardIdValidationPassed = true; // Default to passed (warning only)
                                let cardIdValidationMessage = 'Card ID digit validation skipped - no card ID found';
                                let validationTriggered = false;

                                const prcData = jwtDecoded?.payload?.prc;

                                // Only perform validation if card ID exists (ci field)
                                if (prcData?.ci) {
                                    validationTriggered = true;
                                    const cardId = String(prcData.ci); // Convert to string to handle potential numbers
                                    const isAllDigits = /^\d+$/.test(cardId);

                                    if (isAllDigits) {
                                        cardIdValidationMessage = `Card ID digit validation passed - card ID "${cardId}" contains only digits (${cardId.length} characters)`;
                                        cardIdValidationPassed = true;
                                    } else {
                                        // Find non-digit characters for detailed reporting
                                        const nonDigits = cardId.split('').filter(char => !/\d/.test(char));
                                        const uniqueNonDigits = [...new Set(nonDigits)];

                                        cardIdValidationMessage = `Card ID digit validation warning - card ID "${cardId}" contains non-digit characters: [${uniqueNonDigits.join(', ')}]. Expected all digits only.`;
                                        cardIdValidationPassed = false; // This will show as warning, not error
                                    }

                                    logger.info('Card ID digit validation completed', {
                                        cardId: cardId,
                                        length: cardId.length,
                                        isAllDigits: isAllDigits,
                                        nonDigitCount: cardId.split('').filter(char => !/\d/.test(char)).length,
                                        nonDigitChars: cardId.split('').filter(char => !/\d/.test(char))
                                    });
                                } else {
                                    logger.info('Card ID digit validation skipped - no card ID found', {
                                        hasCardId: false,
                                        prcDataExists: !!prcData
                                    });
                                }

                                const cardIdValidationString = JSON.stringify({
                                    cardIdValidationPassed,
                                    validationTriggered,
                                    message: cardIdValidationMessage,
                                    cardId: prcData?.ci || null,
                                    digitAnalysis: validationTriggered ? {
                                        cardIdValue: String(prcData.ci),
                                        length: String(prcData.ci).length,
                                        isAllDigits: /^\d+$/.test(String(prcData.ci)),
                                        digitCount: String(prcData.ci).split('').filter(char => /\d/.test(char)).length,
                                        nonDigitCount: String(prcData.ci).split('').filter(char => !/\d/.test(char)).length,
                                        nonDigitChars: String(prcData.ci).split('').filter(char => !/\d/.test(char))
                                    } : null
                                }, null, 2);
                                const cardIdValidationSize = Buffer.byteLength(cardIdValidationString, 'utf8');

                                steps.push({
                                    name: 'Step 16: Card ID Digit Validation (Optional)',
                                    data: cardIdValidationString,
                                    size: cardIdValidationSize,
                                    percentage: Math.round((cardIdValidationSize / responseSize) * 100)
                                });

                                // Set status as warning for failed validation (not error), success for passed, or skipped if not triggered
                                validationSummary.cardIdDigitValidation = {
                                    status: !validationTriggered ? 'skipped' : (cardIdValidationPassed ? 'success' : 'warning'),
                                    message: cardIdValidationMessage
                                };

                            } catch (cardIdError) {
                                logger.error('Card ID digit validation failed:', cardIdError);

                                validationSummary.cardIdDigitValidation = {
                                    status: 'warning', // Still warning, not error
                                    message: `Card ID digit validation encountered an error: ${cardIdError.message}`
                                };
                            }

                            // Step 17: Institution ID Digit Validation (Optional - Warning Only)
                            try {
                                let institutionIdValidationPassed = true; // Default to passed (warning only)
                                let institutionIdValidationMessage = 'Institution ID digit validation skipped - no institution ID found';
                                let validationTriggered = false;

                                const prcData = jwtDecoded?.payload?.prc;

                                // Only perform validation if institution ID exists (ii field)
                                if (prcData?.ii) {
                                    validationTriggered = true;
                                    const institutionId = String(prcData.ii); // Convert to string to handle potential numbers
                                    const isAllDigits = /^\d+$/.test(institutionId);

                                    if (isAllDigits) {
                                        institutionIdValidationMessage = `Institution ID digit validation passed - institution ID "${institutionId}" contains only digits (${institutionId.length} characters)`;
                                        institutionIdValidationPassed = true;
                                    } else {
                                        // Find non-digit characters for detailed reporting
                                        const nonDigits = institutionId.split('').filter(char => !/\d/.test(char));
                                        const uniqueNonDigits = [...new Set(nonDigits)];

                                        institutionIdValidationMessage = `Institution ID digit validation warning - institution ID "${institutionId}" contains non-digit characters: [${uniqueNonDigits.join(', ')}]. Expected all digits only.`;
                                        institutionIdValidationPassed = false; // This will show as warning, not error
                                    }

                                    logger.info('Institution ID digit validation completed', {
                                        institutionId: institutionId,
                                        length: institutionId.length,
                                        isAllDigits: isAllDigits,
                                        nonDigitCount: institutionId.split('').filter(char => !/\d/.test(char)).length,
                                        nonDigitChars: institutionId.split('').filter(char => !/\d/.test(char))
                                    });
                                } else {
                                    logger.info('Institution ID digit validation skipped - no institution ID found', {
                                        hasInstitutionId: false,
                                        prcDataExists: !!prcData
                                    });
                                }

                                const institutionIdValidationString = JSON.stringify({
                                    institutionIdValidationPassed,
                                    validationTriggered,
                                    message: institutionIdValidationMessage,
                                    institutionId: prcData?.ii || null,
                                    digitAnalysis: validationTriggered ? {
                                        institutionIdValue: String(prcData.ii),
                                        length: String(prcData.ii).length,
                                        isAllDigits: /^\d+$/.test(String(prcData.ii)),
                                        digitCount: String(prcData.ii).split('').filter(char => /\d/.test(char)).length,
                                        nonDigitCount: String(prcData.ii).split('').filter(char => !/\d/.test(char)).length,
                                        nonDigitChars: String(prcData.ii).split('').filter(char => !/\d/.test(char))
                                    } : null
                                }, null, 2);
                                const institutionIdValidationSize = Buffer.byteLength(institutionIdValidationString, 'utf8');

                                steps.push({
                                    name: 'Step 17: Institution ID Digit Validation (Optional)',
                                    data: institutionIdValidationString,
                                    size: institutionIdValidationSize,
                                    percentage: Math.round((institutionIdValidationSize / responseSize) * 100)
                                });

                                // Set status as warning for failed validation (not error), success for passed, or skipped if not triggered
                                validationSummary.institutionIdDigitValidation = {
                                    status: !validationTriggered ? 'skipped' : (institutionIdValidationPassed ? 'success' : 'warning'),
                                    message: institutionIdValidationMessage
                                };

                            } catch (institutionIdError) {
                                logger.error('Institution ID digit validation failed:', institutionIdError);

                                validationSummary.institutionIdDigitValidation = {
                                    status: 'warning', // Still warning, not error
                                    message: `Institution ID digit validation encountered an error: ${institutionIdError.message}`
                                };
                            }

                            // Step 18: Revocation Information Presence Validation
                            try {
                                let revocationPresenceValidationPassed = false;
                                let revocationPresenceValidationMessage = 'Revocation information presence validation N/A - JWT ID (jti) and/or Revocation ID (rid) not present in payload';

                                const payload = jwtDecoded?.payload;

                                // Check if both jti and rid are present in the payload
                                const hasJti = payload?.jti !== undefined && payload?.jti !== null && payload?.jti !== '';
                                const hasRid = payload?.rid !== undefined && payload?.rid !== null && payload?.rid !== '';

                                if (hasJti && hasRid) {
                                    revocationPresenceValidationMessage = `Revocation information presence validation passed - both JWT ID (jti): "${payload.jti}" and Revocation ID (rid): "${payload.rid}" are present`;
                                    revocationPresenceValidationPassed = true;
                                } else if (hasJti && !hasRid) {
                                    revocationPresenceValidationMessage = `Revocation information presence validation N/A - JWT ID (jti): "${payload.jti}" is present but Revocation ID (rid) is missing`;
                                    revocationPresenceValidationPassed = false;
                                } else if (!hasJti && hasRid) {
                                    revocationPresenceValidationMessage = `Revocation information presence validation N/A - Revocation ID (rid): "${payload.rid}" is present but JWT ID (jti) is missing`;
                                    revocationPresenceValidationPassed = false;
                                } else {
                                    revocationPresenceValidationMessage = 'Revocation information presence validation N/A - both JWT ID (jti) and Revocation ID (rid) are missing from payload';
                                    revocationPresenceValidationPassed = false;
                                }

                                logger.info('Revocation information presence validation completed', {
                                    hasJti: hasJti,
                                    hasRid: hasRid,
                                    jtiValue: payload?.jti || null,
                                    ridValue: payload?.rid || null,
                                    validationPassed: revocationPresenceValidationPassed
                                });

                                const revocationPresenceValidationString = JSON.stringify({
                                    revocationPresenceValidationPassed,
                                    message: revocationPresenceValidationMessage,
                                    revocationInfo: {
                                        hasJti: hasJti,
                                        hasRid: hasRid,
                                        jtiValue: payload?.jti || null,
                                        ridValue: payload?.rid || null,
                                        jtiType: typeof payload?.jti,
                                        ridType: typeof payload?.rid
                                    }
                                }, null, 2);
                                const revocationPresenceValidationSize = Buffer.byteLength(revocationPresenceValidationString, 'utf8');

                                steps.push({
                                    name: 'Step 18: Revocation Information Presence Validation',
                                    data: revocationPresenceValidationString,
                                    size: revocationPresenceValidationSize,
                                    percentage: Math.round((revocationPresenceValidationSize / responseSize) * 100)
                                });

                                // Set status - success if both present, warning if not available
                                validationSummary.revocationPresence = {
                                    status: revocationPresenceValidationPassed ? 'success' : 'warning',
                                    message: revocationPresenceValidationMessage
                                };

                            } catch (revocationPresenceError) {
                                logger.error('Revocation information presence validation failed:', revocationPresenceError);

                                validationSummary.revocationPresence = {
                                    status: 'warning',
                                    message: `Revocation information presence validation encountered an error: ${revocationPresenceError.message}`
                                };
                            }

                            // Step 19: Revocation Status Validation
                            try {
                                let revocationStatusValidationPassed = false;
                                let revocationStatusValidationMessage = 'Revocation status validation N/A - missing required jti or rid fields';
                                let revocationStatus = 'N/A';

                                const payload = jwtDecoded?.payload;
                                const hasJti = payload?.jti !== undefined && payload?.jti !== null && payload?.jti !== '';
                                const hasRid = payload?.rid !== undefined && payload?.rid !== null && payload?.rid !== '';

                                if (hasJti && hasRid) {
                                    // Both jti and rid are present, attempt to fetch revocation status
                                    try {
                                        logger.info('Attempting to fetch revocation status', {
                                            jti: payload.jti,
                                            rid: payload.rid
                                        });

                                        // TODO: Replace with actual revocation endpoint URL
                                        const revocationEndpoint = process.env.REVOCATION_ENDPOINT || 'https://api.ebsi.eu/revocation/v1/status';

                                        const revocationResponse = await axios.get(revocationEndpoint, {
                                            params: {
                                                jti: payload.jti,
                                                rid: payload.rid
                                            },
                                            timeout: 10000, // 10 second timeout
                                            headers: {
                                                'Accept': 'application/json',
                                                'User-Agent': 'EHIC-Verification-System/1.0'
                                            }
                                        });

                                        if (revocationResponse.status === 200 && revocationResponse.data) {
                                            const revocationData = revocationResponse.data;

                                            // Check if the credential is revoked
                                            const isRevoked = revocationData.revoked === true || revocationData.status === 'revoked';

                                            if (isRevoked) {
                                                revocationStatus = 'REVOKED';
                                                revocationStatusValidationMessage = `Revocation status validation failed - credential is REVOKED (jti: "${payload.jti}", rid: "${payload.rid}")`;
                                                revocationStatusValidationPassed = false;
                                            } else {
                                                revocationStatus = 'ACTIVE';
                                                revocationStatusValidationMessage = `Revocation status validation passed - credential is ACTIVE (jti: "${payload.jti}", rid: "${payload.rid}")`;
                                                revocationStatusValidationPassed = true;
                                            }

                                            logger.info('Revocation status check completed', {
                                                jti: payload.jti,
                                                rid: payload.rid,
                                                revocationStatus: revocationStatus,
                                                isRevoked: isRevoked,
                                                endpointResponse: revocationData
                                            });

                                        } else {
                                            revocationStatus = 'UNKNOWN';
                                            revocationStatusValidationMessage = `Revocation status validation warning - unable to determine status from endpoint response (jti: "${payload.jti}", rid: "${payload.rid}")`;
                                            revocationStatusValidationPassed = false;
                                        }

                                    } catch (revocationFetchError) {
                                        logger.warn('Failed to fetch revocation status from endpoint', {
                                            jti: payload.jti,
                                            rid: payload.rid,
                                            error: revocationFetchError.message,
                                            endpoint: process.env.REVOCATION_ENDPOINT || 'https://api.ebsi.eu/revocation/v1/status'
                                        });

                                        revocationStatus = 'UNKNOWN';
                                        revocationStatusValidationMessage = `Revocation status validation warning - failed to fetch status from endpoint: ${revocationFetchError.message} (jti: "${payload.jti}", rid: "${payload.rid}")`;
                                        revocationStatusValidationPassed = false;
                                    }
                                } else {
                                    // Missing jti or rid, status is N/A
                                    revocationStatusValidationMessage = `Revocation status validation N/A - missing required fields (jti: ${hasJti ? 'present' : 'missing'}, rid: ${hasRid ? 'present' : 'missing'})`;
                                    revocationStatusValidationPassed = false; // N/A is treated as skipped
                                }

                                const revocationStatusValidationString = JSON.stringify({
                                    revocationStatusValidationPassed,
                                    message: revocationStatusValidationMessage,
                                    revocationStatusInfo: {
                                        status: revocationStatus,
                                        hasJti: hasJti,
                                        hasRid: hasRid,
                                        jtiValue: payload?.jti || null,
                                        ridValue: payload?.rid || null,
                                        endpoint: process.env.REVOCATION_ENDPOINT || 'https://api.ebsi.eu/revocation/v1/status'
                                    }
                                }, null, 2);
                                const revocationStatusValidationSize = Buffer.byteLength(revocationStatusValidationString, 'utf8');

                                steps.push({
                                    name: 'Step 19: Revocation Status Validation',
                                    data: revocationStatusValidationString,
                                    size: revocationStatusValidationSize,
                                    percentage: Math.round((revocationStatusValidationSize / responseSize) * 100)
                                });

                                // Set status based on revocation check result
                                const finalStatus = revocationStatus === 'N/A' ? 'skipped' : (revocationStatusValidationPassed ? 'success' : 'warning');
                                validationSummary.revocationStatus = {
                                    status: finalStatus,
                                    message: revocationStatusValidationMessage
                                };

                            } catch (revocationStatusError) {
                                logger.error('Revocation status validation failed:', revocationStatusError);

                                validationSummary.revocationStatus = {
                                    status: 'warning',
                                    message: `Revocation status validation encountered an error: ${revocationStatusError.message}`
                                };
                            }

                            // Step 20: Treatment Date Presence Validation
                            try {
                                let treatmentDatePresenceValidationPassed = false;
                                let treatmentDatePresenceValidationMessage = 'Treatment date presence validation N/A - no treatment date provided';

                                if (treatmentDate && treatmentDate !== null && treatmentDate !== '') {
                                    treatmentDatePresenceValidationMessage = `Treatment date presence validation passed - treatment date provided: ${treatmentDate}`;
                                    treatmentDatePresenceValidationPassed = true;
                                } else {
                                    treatmentDatePresenceValidationMessage = 'Treatment date presence validation N/A - no treatment date provided';
                                    treatmentDatePresenceValidationPassed = false;
                                }

                                logger.info('Treatment date presence validation completed', {
                                    treatmentDateProvided: !!treatmentDate,
                                    treatmentDateValue: treatmentDate || null,
                                    validationPassed: treatmentDatePresenceValidationPassed
                                });

                                const treatmentDatePresenceValidationString = JSON.stringify({
                                    treatmentDatePresenceValidationPassed,
                                    message: treatmentDatePresenceValidationMessage,
                                    treatmentDateInfo: {
                                        provided: !!treatmentDate,
                                        value: treatmentDate || null,
                                        type: typeof treatmentDate
                                    }
                                }, null, 2);
                                const treatmentDatePresenceValidationSize = Buffer.byteLength(treatmentDatePresenceValidationString, 'utf8');

                                steps.push({
                                    name: 'Step 20: Treatment Date Presence Validation',
                                    data: treatmentDatePresenceValidationString,
                                    size: treatmentDatePresenceValidationSize,
                                    percentage: Math.round((treatmentDatePresenceValidationSize / responseSize) * 100)
                                });

                                // Set status - success if present, skipped if not available
                                validationSummary.treatmentDatePresence = {
                                    status: treatmentDatePresenceValidationPassed ? 'success' : 'skipped',
                                    message: treatmentDatePresenceValidationMessage
                                };

                            } catch (treatmentDatePresenceError) {
                                logger.error('Treatment date presence validation failed:', treatmentDatePresenceError);

                                validationSummary.treatmentDatePresence = {
                                    status: 'warning',
                                    message: `Treatment date presence validation encountered an error: ${treatmentDatePresenceError.message}`
                                };
                            }

                            // Step 21: Treatment Date Range Validation
                            try {
                                let treatmentDateRangeValidationPassed = false;
                                let treatmentDateRangeValidationMessage = 'Treatment date range validation N/A - no treatment date or certificate dates available';

                                if (treatmentDate && treatmentDate !== null && treatmentDate !== '') {
                                    const payload = jwtDecoded?.payload;
                                    let cert = null;

                                    if (payload?.prc) {
                                        cert = payload.prc;
                                    } else if (payload?.hcert && payload.hcert.v) {
                                        cert = payload.hcert.v[0];
                                    }

                                    if (cert) {
                                        const startDate = cert.sd; // Start date
                                        const endDate = cert.ed;   // End date

                                        if (startDate && endDate) {
                                            const treatmentDateObj = new Date(treatmentDate);
                                            const startDateObj = new Date(startDate);
                                            const endDateObj = new Date(endDate);

                                            if (treatmentDateObj >= startDateObj && treatmentDateObj <= endDateObj) {
                                                treatmentDateRangeValidationMessage = `Treatment date range validation passed - treatment date ${treatmentDate} is within certificate validity period (${startDate} to ${endDate})`;
                                                treatmentDateRangeValidationPassed = true;
                                            } else {
                                                treatmentDateRangeValidationMessage = `Treatment date range validation warning - treatment date ${treatmentDate} is outside certificate validity period (${startDate} to ${endDate})`;
                                                treatmentDateRangeValidationPassed = false;
                                            }
                                        } else {
                                            treatmentDateRangeValidationMessage = `Treatment date range validation warning - certificate validity dates not available (start: ${startDate || 'N/A'}, end: ${endDate || 'N/A'})`;
                                            treatmentDateRangeValidationPassed = false;
                                        }
                                    } else {
                                        treatmentDateRangeValidationMessage = 'Treatment date range validation warning - certificate data not available for date range comparison';
                                        treatmentDateRangeValidationPassed = false;
                                    }
                                } else {
                                    treatmentDateRangeValidationMessage = 'Treatment date range validation N/A - no treatment date provided';
                                    treatmentDateRangeValidationPassed = false; // N/A is treated as skipped
                                }

                                logger.info('Treatment date range validation completed', {
                                    treatmentDate: treatmentDate || null,
                                    validationPassed: treatmentDateRangeValidationPassed,
                                    validationMessage: treatmentDateRangeValidationMessage
                                });

                                const treatmentDateRangeValidationString = JSON.stringify({
                                    treatmentDateRangeValidationPassed,
                                    message: treatmentDateRangeValidationMessage,
                                    treatmentDateRangeInfo: {
                                        treatmentDate: treatmentDate || null,
                                        isWithinRange: treatmentDateRangeValidationPassed,
                                        certificateStartDate: jwtDecoded?.payload?.prc?.sd || jwtDecoded?.payload?.hcert?.v?.[0]?.sd || null,
                                        certificateEndDate: jwtDecoded?.payload?.prc?.ed || jwtDecoded?.payload?.hcert?.v?.[0]?.ed || null
                                    }
                                }, null, 2);
                                const treatmentDateRangeValidationSize = Buffer.byteLength(treatmentDateRangeValidationString, 'utf8');

                                steps.push({
                                    name: 'Step 21: Treatment Date Range Validation',
                                    data: treatmentDateRangeValidationString,
                                    size: treatmentDateRangeValidationSize,
                                    percentage: Math.round((treatmentDateRangeValidationSize / responseSize) * 100)
                                });

                                // Set status based on validation result
                                const rangeStatus = !treatmentDate ? 'skipped' : (treatmentDateRangeValidationPassed ? 'success' : 'warning');
                                validationSummary.treatmentDateRange = {
                                    status: rangeStatus,
                                    message: treatmentDateRangeValidationMessage
                                };

                            } catch (treatmentDateRangeError) {
                                logger.error('Treatment date range validation failed:', treatmentDateRangeError);

                                validationSummary.treatmentDateRange = {
                                    status: 'warning',
                                    message: `Treatment date range validation encountered an error: ${treatmentDateRangeError.message}`
                                };
                            }

                            // Step 22: Expiry Date Validation (xd >= ed)
                            try {
                                let expiryDateValidationPassed = false;
                                let expiryDateValidationMessage = 'Expiry date not found in payload';
                                let expiryDateValidationStatus = 'skipped';

                                // Extract payload from JWT
                                const payload = jwtDecoded?.payload;

                                // Check if expiry date exists in payload.prc.xd
                                const expiryDate = payload?.prc?.xd;
                                const endDate = payload?.prc?.ed;

                                if (expiryDate) {
                                    if (endDate) {
                                        // Parse dates for comparison
                                        const expiryDateObj = new Date(expiryDate);
                                        const endDateObj = new Date(endDate);

                                        // Validate: expiry date should be >= end date
                                        if (expiryDateObj >= endDateObj) {
                                            expiryDateValidationPassed = true;
                                            expiryDateValidationMessage = `Expiry date validation passed: Expiry date (${expiryDate}) is equal to or greater than end date (${endDate})`;
                                            expiryDateValidationStatus = 'success';
                                        } else {
                                            expiryDateValidationPassed = false;
                                            expiryDateValidationMessage = `Expiry date validation failed: Expiry date (${expiryDate}) is before end date (${endDate})`;
                                            expiryDateValidationStatus = 'warning';
                                        }
                                    } else {
                                        expiryDateValidationMessage = 'Expiry date found but end date is missing - cannot validate';
                                        expiryDateValidationStatus = 'warning';
                                    }
                                } else {
                                    expiryDateValidationMessage = 'Expiry date not found in payload (prc.xd) - validation skipped';
                                    expiryDateValidationStatus = 'skipped';
                                }

                                logger.info('Expiry date validation', {
                                    expiryDate: expiryDate || 'N/A',
                                    endDate: endDate || 'N/A',
                                    passed: expiryDateValidationPassed,
                                    status: expiryDateValidationStatus
                                });

                                const expiryDateValidationString = JSON.stringify({
                                    expiryDate: expiryDate || 'N/A',
                                    endDate: endDate || 'N/A',
                                    validationPassed: expiryDateValidationPassed,
                                    message: expiryDateValidationMessage,
                                    status: expiryDateValidationStatus
                                }, null, 2);

                                const expiryDateValidationSize = Buffer.byteLength(expiryDateValidationString, 'utf8');

                                steps.push({
                                    name: 'Step 22: Expiry Date Validation',
                                    data: expiryDateValidationString,
                                    size: expiryDateValidationSize,
                                    percentage: Math.round((expiryDateValidationSize / responseSize) * 100)
                                });

                                validationSummary.expiryDateValidation = {
                                    status: expiryDateValidationStatus,
                                    message: expiryDateValidationMessage,
                                    expiryDate: expiryDate || null,
                                    endDate: endDate || null,
                                    passed: expiryDateValidationPassed
                                };

                            } catch (expiryDateError) {
                                logger.error('Expiry date validation failed:', expiryDateError);

                                validationSummary.expiryDateValidation = {
                                    status: 'error',
                                    message: `Expiry date validation encountered an error: ${expiryDateError.message}`
                                };
                            }

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

                            validationSummary.jwtSignatureValidation = {
                                status: 'error',
                                message: `JWT signature validation failed: ${validationError.message}`
                            };
                        }
                    } catch (signatureError) {
                        validationSummary.signatureVerification = {
                            status: 'error',
                            message: `Signature verification failed: ${signatureError.message}`
                        };
                        // Mark all remaining validations as skipped
                        Object.keys(validationSummary).forEach(key => {
                            if (validationSummary[key].status === 'pending') {
                                validationSummary[key] = {
                                    status: 'skipped',
                                    message: 'Validation skipped due to previous failure'
                                };
                            }
                        });

                        signatureError.step = 'Signature verification';
                        signatureError.validationSummary = validationSummary;
                        throw signatureError;
                    }
                } else {
                    validationSummary.jwtParsing = {
                        status: 'error',
                        message: 'JWT parsing failed: Invalid JWT format'
                    };
                    throw new Error('Invalid JWT format');
                }
            } catch (jwtError) {
                validationSummary.jwtParsing = {
                    status: 'error',
                    message: `JWT parsing failed: ${jwtError.message}`
                };
                // Mark all remaining validations as skipped
                Object.keys(validationSummary).forEach(key => {
                    if (validationSummary[key].status === 'pending') {
                        validationSummary[key] = {
                            status: 'skipped',
                            message: 'Validation skipped due to previous failure'
                        };
                    }
                });

                jwtError.step = 'JWT parsing';
                jwtError.validationSummary = validationSummary;
                throw jwtError;
            }
        } catch (zlibError) {
            validationSummary.zlibDecompress = {
                status: 'error',
                message: `ZLIB decompression failed: ${zlibError.message}`
            };

            // Mark all remaining validations as skipped
            Object.keys(validationSummary).forEach(key => {
                if (validationSummary[key].status === 'pending') {
                    validationSummary[key] = {
                        status: 'skipped',
                        message: 'Validation skipped due to previous failure'
                    };
                }
            });

            zlibError.step = 'ZLIB decompression';
            zlibError.validationSummary = validationSummary;
            throw zlibError;
        }
    } catch (base45Error) {
        validationSummary.base45Decode = {
            status: 'error',
            message: `BASE45 decoding failed: ${base45Error.message}`
        };

        // Mark all remaining validations as skipped
        Object.keys(validationSummary).forEach(key => {
            if (validationSummary[key].status === 'pending') {
                validationSummary[key] = {
                    status: 'skipped',
                    message: 'Validation skipped due to previous failure'
                };
            }
        });

        base45Error.step = 'BASE45 decoding';
        base45Error.validationSummary = validationSummary;
        throw base45Error;
    }

    // Mark any remaining 'pending' validations as 'skipped'
    Object.keys(validationSummary).forEach(key => {
        if (validationSummary[key].status === 'pending') {
            validationSummary[key] = {
                status: 'skipped',
                message: 'Validation skipped due to previous failure'
            };
        }
    });

    // Determine overall validation status
    // Exclude revocation validations from overall status calculation since they're optional
    const coreValidations = Object.entries(validationSummary)
        .filter(([key, _]) => !key.startsWith('revocation'))
        .map(([_, validation]) => validation);

    const overallStatus = coreValidations.every(v =>
        v.status === 'success' || v.status === 'skipped'
    ) ? 'success' :
    coreValidations.some(v => v.status === 'error') ? 'error' : 'warning';

    return {
        steps,
        success: overallStatus === 'success',
        validationSummary,
        overallStatus
    };
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