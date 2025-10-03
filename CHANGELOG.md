# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.26.0] - 2025-10-03

### Fixed
- **EBSI API Call Enhancement**: Fixed EBSI resolver API calls to include countryCode and officialId parameters
  - EBSI URL now includes: `?x509Thumbprint=[thumbprint]&countryCode=[ic]&officialId=[ii]`
  - Extracts countryCode from `payload.prc.ic` (required field per schema)
  - Extracts officialId from `payload.prc.ii` (required field per schema)
  - Cache invalidation for signature verification to force fresh calls with new parameters
  - Reduces EBSI response from 53 issuers to exactly 1 matching issuer

### Added
- **Official ID Validation**: New technical validation step (Step 8.2a)
  - Validates `payload.prc.ii` matches `signatureResponse.data.results[0].officialId`
  - Positioned after Country Code Validation in technical validations
  - Returns error status if mismatch or either value is missing
  - Skipped if signature count validation fails
  - Added to frontend tiles in verify.js, results.js, and finalization.js
  - Added to PDF and email reports
  - Added to validation summary initialization

### Changed
- **Institution ID Digit Validation**: Moved from Business Validations to Technical Validations
  - Backend validation (Step 8.2b) runs after Official ID Validation
  - Frontend tile remains in Business Validations section (last position)
  - Maintains optional/warning status
  - Validates institution ID contains only digits

### Technical Improvements
- **Cache Management**: Force cache invalidation before signature verification
  - Deletes existing cache entry for thumbprint
  - Forces fresh EBSI API call with countryCode and officialId parameters
  - Ensures filtered results (1 issuer instead of 53)
- **Parameter Passing**: Enhanced EBSI bridge function signatures
  - `checkThumbprintInBridge()` accepts optional countryCode and officialId
  - `verifySignature()` extracts and passes required PRC fields
  - `processCertificateWithBridgeLookup()` passes certificate data
- **Debug Logging**: Added validation data logging for PDF/Email generation
  - Logs presence of validationSummary
  - Logs validation data keys
  - Logs sample validation objects for debugging
- **Frontend Tile Organization**: Updated all three frontend pages
  - verify.js: Added officialIdValidation, moved institutionIdDigitValidation
  - results.js: Added officialIdValidation, moved institutionIdDigitValidation
  - finalization.js: Added officialIdValidation, moved institutionIdDigitValidation
  - Updated step mappings for proper tile display

## [0.25.0] - 2025-10-01

### Fixed
- **Signature Verification Critical Bugs**: Fixed multiple critical issues in signature verification process
  - **HTTP 200 with Error Body**: Fixed signature retrieval treating HTTP 200 responses with error messages in body as successful
  - **Signature Count Validation**: Completely rewrote signature count validation with proper structure validation
    - Now validates results array exists and contains exactly 1 issuer
    - Validates publicKeys array exists in issuer
    - Verifies JWT thumbprint matches one in publicKeys array (x5t#S256 field)
    - Provides detailed error messages for each validation failure
  - **Dependent Validation Skip Logic**: Fixed validations running without valid signature data
    - Country code validation now skipped if signature count validation fails
    - Certificate validity validation now skipped if signature count validation fails
    - JWT signature validation now skipped if signature count validation fails
  - **BASE64 Transformation Removal**: Removed all BASE64 to BASE64URL conversions for KID and thumbprint validation
    - KID pattern now accepts both BASE64 and BASE64URL characters: `/^EESSI:x5t#S256:[A-Za-z0-9_\-+=\/]+$/`
    - Thumbprints used as-is without conversion in EBSI queries
    - Simplified `normalizeThumbprintForEbsi()` function to return thumbprint unchanged
    - Removed BASE64 detection and conversion logic throughout verification pipeline

### Enhanced
- **Finalization Status Display**: Dynamic status based on verification results
  - Shows "❌ Verification Failed" (red) when any validation has error status
  - Shows "⚠️ Verification Complete with Warnings" (yellow) when warnings but no errors
  - Shows "✅ Verification Complete" (green) when all validations passed
  - Added translation keys for all status variants across 27 languages
- **Debug Mode Indicator**: Added "DEBUG" badge in navbar when MODE=DEBUG in environment

### Technical Improvements
- **Signature Validation Structure**: Enhanced validation to check complete EBSI response structure
  - Validates results array presence and type
  - Validates issuer count (exactly 1 required)
  - Validates publicKeys array in issuer
  - Validates thumbprint match with detailed logging
- **Error Handling**: Improved error detection and reporting
  - Check response body for error field even with HTTP 200 status
  - Detailed error messages for each validation failure point
  - Comprehensive logging of validation failures
- **Code Cleanup**: Removed unused BASE64 conversion functions
  - `base64ToBase64Url()` no longer called anywhere
  - `base64UrlToBase64()` no longer called anywhere
  - Comments updated to reflect no conversion approach

## [0.24.0] - 2025-10-01

### Added
- **Debug Mode BASE45 Input**: Added manual BASE45 text input field on scan page (debug mode only)
  - Textarea accepts up to 2000 characters
  - Only visible when MODE=DEBUG in environment
  - Styled with yellow warning theme to indicate debug functionality
  - "OR" separator between manual input and QR scanner
  - Process button to submit BASE45 text directly

- **Proceed to Results Button**: Added button on verify page to skip to results
  - Button navigates directly to results page with current BASE45 data
  - Automatically sets treatment date to current system date
  - Triggers normal verification flow (identity check, finalization, etc.)
  - Includes proper translation support

### Enhanced
- **Email Prefill on Finalization**: Email input now prefilled with user's profile email
  - User email automatically populated in email summary section
  - Email remains editable for sending to alternative addresses
  - Improves workflow by reducing manual entry

- **Navigation Cleanup**: Simplified navigation bar on profile page
  - Removed Home, Verify, and History links from main navbar
  - Logo click still navigates to home page
  - History link moved to user dropdown (debug mode only)
  - Cleaner interface focused on profile management

- **Translation Updates**: Updated email section heading
  - Changed "Email Summary" to "Send the verification results as email"
  - More descriptive and action-oriented label

### Fixed
- **Translation Support**: Added "verify-proceed-button" translation key to all 27 language files
  - Fixed "undefined" display on Proceed to Results button
  - Consistent translation across all supported languages

### Technical Improvements
- **Frontend Updates**:
  - scan.ejs: Added debug mode BASE45 input section with conditional rendering
  - verify.ejs: Added Proceed to Results button with translation key
  - finalization.ejs: Added script to expose user email to JavaScript
  - partials/navbar.ejs: Removed main navigation links, added debug mode check for History

- **JavaScript Updates**:
  - scan.js: Added BASE45 input handler with validation and sessionStorage integration
  - verify.js: Added Proceed to Results handler with treatment date auto-setting
  - finalization.js: Added email prefill logic using window.userEmail

- **CSS Updates**:
  - Added debug-input-container styling with yellow warning theme
  - Added debug-base45-input styling with monospace font
  - Added debug-separator styling with horizontal line and centered text

## [0.22.0] - 2025-10-01

### Enhanced
- **Verification Page UI Cleanup**: Comprehensive cleanup of validation step names and summary display
  - Removed all step number prefixes from validation names (e.g., "Step 1-1:", "Step 4.1a", "Step 7:", etc.)
  - Changed terminology from "validation" to "verification" throughout the interface
  - Added complete verification summary structure with overall status, statistics, separator, and breakdown header
  - Improved visual layout with horizontal overall status display (icon + text)
  - Added statistics cards showing total verifications, succeeded, failed, warnings, and skipped counts
  - Statistics cards feature colored borders matching status types (green for success, red for error, orange for warning, gray for skipped)
  - Added horizontal separator and "Verification Breakdown" header for better organization
  - Cleaned up validation step names: "QR Code Analysis", "Schema File Check - Found", "Schema Validation", "Kid Header Validation", "Algorithm Header Validation", "Signature Count Validation", "Country Code Validation", "Certificate Validity Date Verification", and all business validation names
  - Removed "Step X:" prefixes from detailed verification steps display

### Technical Improvements
- **Frontend Updates** (public/js/verify.js):
  - Added statistics calculation logic for all verification categories
  - Restructured verification summary HTML generation with overall status at top
  - Updated all validation category headers to use "verification" terminology
  - Removed step numbering from technical and business validation display
  - Added click-to-navigate functionality for verification tiles

- **Backend Updates** (routes/scanRoutes.js):
  - Cleaned up all step names to remove numbering prefixes
  - Updated 20+ validation step names for consistency

- **CSS Updates** (public/css/style.css):
  - Added horizontal layout styling for overall status with gap spacing
  - Added validation-stats styling with flex layout and colored borders
  - Added stat-item styling with success/error/warning/skipped variants
  - Added validation-separator and breakdown-header styling
  - Added responsive stat-value and stat-label styling

## [0.21.0] - 2025-10-01

### Added
- **Heroku Deployment Scripts**: Created dedicated deployment configuration scripts
  - **heroku-setup-dev.sh**: Development environment setup with full debug logging
  - **heroku-setup-prod.sh**: Production environment setup with minimal logging
  - **HEROKU-CONFIG.md**: Comprehensive Heroku configuration documentation

- **Environment Variable Documentation**: Complete guide for all configuration variables
  - Database configuration (DB_USER, DB_PASSWORD, DB_CLUSTER, DB_NAME)
  - Session configuration (SESSION_SECRET)
  - Logging configuration (LOG_LEVEL, LOG_CONSOLE)
  - Application mode (MODE, NODE_ENV)
  - SMTP configuration (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)

### Fixed
- **Heroku Login Issues**: Fixed session persistence by ensuring SESSION_SECRET is properly configured
  - Added SESSION_SECRET generation and configuration to deployment scripts
  - Sessions now persist correctly across requests
  - Users can successfully login and stay authenticated

- **Logging Configuration**: Made logging configurable via environment variables
  - `LOG_LEVEL` now configurable (debug|trace|http|info|warn|error|exception)
  - `LOG_CONSOLE` now configurable (on|off)
  - Default log level changed from hardcoded `debug` to environment-based `info`
  - Logging configuration now displayed on startup for verification

### Enhanced
- **Heroku Deployment Process**: Improved deployment workflow with clear documentation
  - Separate scripts for development vs production environments
  - Automatic SESSION_SECRET generation for security
  - Clear environment variable explanations and troubleshooting guides
  - Configuration verification steps included

### Technical Improvements
- **Logger Configuration**: Updated scanRoutes.js to use environment variables
  - Added `process.env.LOG_LEVEL` with fallback to 'info'
  - Added `process.env.LOG_CONSOLE` with fallback to 'on'
  - Added `process.env.LOG_PATH` with fallback to './logs'
  - Added startup logging to display current logger configuration

- **Development vs Production Settings**:
  - **Development**: LOG_LEVEL=debug, MODE=DEBUG, stores all scans
  - **Production**: LOG_LEVEL=error, MODE=PRODUCTION, no scan storage for privacy

### Documentation
- **HEROKU-CONFIG.md**: Complete Heroku configuration reference
  - Environment variable explanations
  - Development vs production comparisons
  - Troubleshooting guides for common issues
  - Security best practices
  - Log viewing commands and examples

## [0.20.0] - 2025-10-01

### Added
- **Scan History Enhancements**: Enhanced scan history display with duplicate scan tracking
  - **Scan Count Display**: Shows total number of scans for each unique QR code
  - **Timeline Information**: Displays first scan and last scan timestamps
  - **Visual Badges**: Scan count badges and duplicate indicators for better visibility
  - **Deduplication Logic**: Same QR codes update existing records rather than creating duplicates

- **Birthdate Verification**: Added birthdate verification checkbox to identity check page
  - **Identity Check Enhancement**: New checkbox for birthdate verification alongside name verification
  - **Independent Tracking**: Birthdate and name verifications tracked separately
  - **Finalization Display**: Separate birthdate verification status shown on finalization page
  - **Email Integration**: Birthdate verification status included in email notifications
  - **PDF Integration**: Birthdate verification warnings included in PDF reports

- **Expiry Date Validation**: Comprehensive expiry date validation for PRC certificates
  - **Optional Validation**: Validates expiry date (xd) >= end date (ed) when expiry date is present
  - **Greyed Out Tile**: Shows as "skipped" when no expiry date is found
  - **Business Validation Category**: Positioned after Issuance/End Date Validation
  - **Cross-Platform Consistency**: Displayed across /verify, /results, /finalization, email, and PDF

### Enhanced
- **Validation Organization**: All validations now properly categorized and positioned
  - **Business Validations**: Expiry Date Validation moved from Treatment Date to Business Validations section
  - **Consistent Placement**: Same validation order across web interface, email, and PDF reports
  - **Helper Functions**: Added getValidationSkipped() helper for checking skipped validations

- **Identity Verification Warnings**: Enhanced warning system for identity checks
  - **Dual Warnings**: Separate warnings for skipped name verification and skipped birthdate verification
  - **PDF Warning Display**: Multi-line warning box in PDF for multiple skipped verifications
  - **Email Warning Display**: Bulleted list of skipped verifications in email notifications

### Fixed
- **Email Sending Error**: Fixed "getValidationSkipped is not defined" error
  - **Missing Helper Function**: Added getValidationSkipped() function to scanRoutes.js
  - **Missing Constant**: Added skippedText constant for PDF generation
  - **Validation Display**: Expiry date validation now correctly shows "SKIPPED" status when not present

### Technical Improvements
- **Scan History Styling**: Enhanced CSS for scan count badges and timeline displays
  - **Visual Design**: Gradient backgrounds, icons, and professional styling
  - **Responsive Layout**: Timeline displays work on mobile and desktop
  - **Translation Support**: Added history-scanned, history-times, history-first-scan, history-last-scan keys

- **Translation Keys**: Added new translation keys for enhanced features
  - `identity-checklist-birthdate`: Birthdate verification checkbox label
  - `finalization-birthdate-verified`: Birthdate verification status label
  - `history-scanned`, `history-times`, `history-first-scan`, `history-last-scan`: History display labels

- **Validation Pipeline**: Enhanced validation summary structure
  - **Expiry Date Validation**: Step 22 added for expiry date checking
  - **Status Mapping**: Proper status handling for success/warning/skipped states
  - **Error Handling**: Comprehensive error handling for all validation steps

### Notes
- **All validations conform document**: Validation structure and categorization follows EHIC specification
- **Missing verification official ID**: Physical identity document verification not yet implemented
- **Missing retrieval of official ID**: Automated ID retrieval functionality not yet implemented

## [0.19.0] - 2025-09-30

### Added
- **Environment Mode Switching**: Application now supports DEBUG and PRODUCTION modes
  - **MODE Environment Variable**: Set `MODE=DEBUG` or `MODE=PRODUCTION` in .env file
  - **DEBUG Mode Features**:
    - All EHIC scans are stored in the database
    - Users can access scan history via `/scan-history`
    - Users can access detailed verification via `/verify` page
    - Full verification step-by-step details available
  - **PRODUCTION Mode Features**:
    - Scans are NOT stored in the database for privacy
    - History page is disabled and returns 403
    - Verify page is disabled and returns 403
    - Automatic redirect to results page after successful scan
    - Streamlined workflow for production use

- **Mode Indicators**:
  - Console logs display current mode on server startup
  - Mode information available to all views via `res.locals`
  - JavaScript has access to mode via `window.APP_MODE`

### Changed
- **Navigation**: History link only visible in DEBUG mode
- **Scan Page**: "Verify QR Code" button only visible in DEBUG mode
- **Scan Workflow**: Auto-redirect to results in PRODUCTION mode (no manual button click needed)
- **Route Protection**: Mode-based access control for `/scan-history` and `/verify` routes

### Fixed
- **Heroku Deployment**: Fixed cross-platform compatibility for `copy-vendor` script
  - Replaced Windows-specific commands with Node.js script
  - Now works on both Windows and Linux/Heroku environments
  - Resolves "Syntax error: end of file unexpected" on Heroku deployment

### Technical Improvements
- **Cross-Platform Script**: `copy-vendor` now uses Node.js fs module instead of OS-specific commands
- **Mode Middleware**: Centralized mode configuration in server.js
- **Conditional Rendering**: EJS templates check mode before rendering certain elements
- **Scanner Updates**: Updated scanner-simple.js to handle missing verify button gracefully

## [0.18.0] - 2025-09-30

### Added
- **User Authentication System**: Comprehensive login and user management functionality
  - **User Registration**: New users can create accounts with email, password, and profile information
  - **Login/Logout**: Secure session-based authentication with bcrypt password hashing
  - **Profile Management**: Users can view and update their profile information
  - **Password Management**: Change password and forgot password functionality
  - **Account Deletion**: Users can delete their accounts with cascade deletion of all associated data
  - **User-Specific Data Isolation**: Users can only view and access their own scan history
  - **Session Management**: Session cookies expire when browser is closed for enhanced security
  - **Cache Control**: Strict no-cache headers to prevent sensitive data caching

- **Multilingual Authentication UI**: Complete translations for authentication features
  - Added authentication translations across all 27 supported languages
  - Profile management interface translations
  - Login/logout button translations in navigation bar

- **Navigation Improvements**:
  - Simplified navigation bar with only essential elements
  - Login button prominently displayed for unauthenticated users
  - User profile dropdown with avatar for authenticated users
  - History access moved to profile dropdown menu
  - Removed standalone verify and history navigation links

- **Landing Page Enhancement**:
  - Landing page now accessible without authentication
  - Login notification message for unauthenticated users
  - Translation key: "landing-login-required"

### Changed
- **Theme Update**: Changed from indigo/purple to mint green healthcare theme
  - Updated all gradients, buttons, and accent colors to mint green (#10b981, #059669)
  - Applied consistently across navigation bar, authentication pages, and main application
  - Enhanced healthcare-appropriate visual identity

- **Protected Routes**:
  - Treatment date and identity check routes now require authentication
  - Landing page remains public with login prompt
  - All scan operations require user authentication

- **Verify Page Navigation**: "Back to Scanner" button changed to "Back to History"
  - Updated route to navigate to scan history
  - Updated translations across all 27 languages

### Technical Improvements
- **Database Schema**:
  - New User model with bcrypt password hashing
  - User reference added to Scan model for data isolation
  - Removed deprecated Reference model and functionality
  - Cascade delete for user data when account is deleted

- **Dependencies Added**:
  - `bcrypt@^5.1.1`: Password hashing
  - `express-session@^1.17.3`: Session management
  - `connect-mongo@^5.0.0`: MongoDB session store

- **Middleware**:
  - Authentication middleware for protected routes
  - User loading middleware for session management
  - Cache control middleware for security

- **Security Enhancements**:
  - HTTP-only session cookies
  - Session cookies expire on browser close (maxAge: null)
  - Strict cache-control headers (no-store, no-cache, must-revalidate)
  - Password hashing with bcrypt (salt rounds: 10)

### Removed
- **Reference System**: Completely removed reference comparison functionality
  - Deleted Reference model and associated routes
  - Removed reference-related UI elements and comparison logic
  - Cleaned up Scan model by removing referenceComparison fields

## [0.17.0] - 2025-09-29

### Added
- **JSON Output Attachment to Emails**: Structured JSON verification results now attached alongside PDF reports
  - **Comprehensive JSON Schema**: Created detailed schema defining all verification output fields and validation steps
  - **Schema Validation**: Implemented AJV-based validation to ensure data integrity and consistency
  - **Dual Attachments**: Email recipients receive both human-readable PDF and machine-readable JSON files
  - **Complete Verification Data**: JSON includes all validation results, overall status, treatment date, and verification timestamp
  - **Schema Location**: New schema file at `schemas/verification-output-schema.json` defining structure for 25 validation steps

### Enhanced
- **Email Functionality**: Enhanced email endpoint to generate and attach JSON verification output
  - **Automatic JSON Generation**: Creates structured JSON file with complete verification results
  - **Schema Compliance**: Validates generated JSON against defined schema before sending
  - **Error Resilience**: Email sending continues even if JSON validation fails, with proper logging
  - **Treatment Date Formatting**: Ensures treatment dates are properly formatted as YYYY-MM-DD for schema compliance

### Fixed
- **Treatment Date Format Validation**: Fixed date format issues causing schema validation errors
  - **Date Parsing**: Added robust date parsing to handle various input formats
  - **ISO Format Conversion**: Converts dates to YYYY-MM-DD format for JSON schema compliance
  - **Null Handling**: Properly handles missing treatment dates with null values

- **AJV Strict Mode Warning**: Resolved union type warnings in schema validation
  - **Configuration Update**: Set AJV strict mode to false to allow union types
  - **OpenSSL Details Handling**: Fixed type mismatch for opensslDetails field (string vs object)
  - **Schema Type Flexibility**: Updated schema to accept string, object, or null for opensslDetails

- **Nodemon Restart Issue**: Fixed server restarts during email generation
  - **Added nodemon.json Configuration**: Created ignore rules for temp files, PDFs, and JSON files
  - **Prevented Unnecessary Restarts**: Server no longer restarts when generating verification files
  - **Improved Stability**: Eliminated network errors caused by mid-request server restarts

### Technical Improvements
- **Dependencies Added**:
  - `ajv@^8.12.0`: JSON schema validation library
  - `ajv-formats@^2.1.1`: Format validators for date-time, email, etc.

- **Error Handling**: Enhanced error handling for schema loading and validation
  - **Schema Load Protection**: Graceful handling when schema file cannot be loaded
  - **Validation Error Logging**: Comprehensive error logging with stack traces
  - **Continuous Operation**: Email sending continues regardless of validation errors

- **Data Structure Improvements**:
  - **Consistent Field Types**: Ensured all validation fields have consistent types
  - **Proper Null Handling**: Fields that can be null are properly defined in schema
  - **Format Validation**: Added format validators for dates and timestamps

## [0.16.0] - 2025-01-01

### Added
- **Treatment Date Verification System**: Comprehensive validation of treatment dates against certificate validity periods
  - **Treatment Date Presence Validation**: Validates that a treatment date is provided when required (Step 20)
  - **Treatment Date Range Validation**: Ensures treatment date falls within certificate validity period with startDate <= treatmentDate <= endDate logic (Step 21)
  - **Frontend Integration**: Added Treatment Date Validations section across all user interfaces (verify, results, finalization pages)
  - **Email and PDF Integration**: Treatment date validation results included in email notifications and PDF reports
  - **Interactive Navigation**: Clickable validation tiles with step navigation for treatment date validations
  - **Cross-Platform Consistency**: Treatment date validations displayed consistently across web, email, and PDF outputs

### Enhanced
- **Validation Logic**: Added comprehensive date range validation comparing treatment date against certificate start date (cert.sd) and end date (cert.ed)
- **Error Handling**: Updated error handling validation summary to include treatment date validations
- **Status Management**: Proper status mapping for treatment date validations (success/warning/skipped)
- **User Experience**: Clear validation feedback distinguishing between missing treatment dates and invalid date ranges
- **Backend Validation**: Added Steps 20-21 to verification pipeline with comprehensive logging and status reporting

### Technical Improvements
- **Date Comparison Logic**: Robust date parsing and comparison for certificate validity period validation
- **Dual Certificate Support**: Supports both payload.prc.sd/ed and payload.hcert.v[0].sd/ed certificate structures
- **Optional Validation Framework**: Treatment date validations are optional and don't block verification when dates are not provided
- **Step Navigation**: Complete step mapping integration for treatment date validations across all frontend pages
- **Comprehensive Logging**: Detailed logging for treatment date validation steps with validation results and error handling

### Removed
- **Treatment Date Format Validation**: Removed unnecessary format validation to focus on business logic requirements
- **Simplified Interface**: Streamlined treatment date validation to essential presence and range checks only

## [0.15.0] - 2025-01-01

### Enhanced
- **Cross-Page Navigation for Revocation Validations**: Extended interactive validation tiles across all user interface pages
  - **Results Page Navigation**: Added clickable validation tiles with smooth scrolling to corresponding verification steps
  - **Finalization Page Navigation**: Implemented clickable tiles that redirect to verify page with step anchoring
  - **Comprehensive Step Mapping**: Added complete step mapping functions for revocation validations across all pages
  - **Visual Feedback Enhancement**: Added hover effects, cursor pointers, and tooltip indicators for clickable tiles
  - **Seamless User Experience**: Users can now navigate from validation summaries to detailed verification steps on any page

### Added
- **Step Navigation Infrastructure**: Implemented consistent navigation functionality across verify, results, and finalization pages
- **Revocation Step Integration**: Added specific step mappings for "Revocation Information Presence Validation" and "Revocation Status Validation"
- **Cross-Page Redirection**: Finalization page tiles redirect to verify page with appropriate step anchoring for detailed view
- **Visual Highlighting**: Added background highlighting effect when navigating to verification steps for better user feedback

### Technical Improvements
- **Unified Navigation Functions**: Consistent `getStepIdFromName()` and `addTileClickHandlers()` implementations across all pages
- **Enhanced User Interface**: Clickable tiles with `data-step-key` attributes for precise navigation targeting
- **Responsive Design**: Navigation works seamlessly across desktop and mobile interfaces
- **Cross-Platform Consistency**: Same navigation behavior and visual feedback across all validation display contexts

## [0.14.0] - 2025-01-01

### Added
- **Revocation Validation System**: Comprehensive revocation checking for EHIC/PRC certificates
  - **Revocation Information Presence Validation**: Checks for JWT ID (jti) and Revocation ID (rid) fields in the payload
  - **Revocation Status Validation**: Fetches real-time revocation status from configurable external endpoints (defaults to EBSI API)
  - **Frontend Integration**: Added revocation validation sections across all user interfaces (verify, results, finalization pages)
  - **Email and PDF Integration**: Revocation validation results included in email notifications and PDF reports
  - **Configurable Endpoint**: Support for custom revocation endpoints via REVOCATION_ENDPOINT environment variable
  - **Graceful Error Handling**: Network failures and missing revocation information handled appropriately
  - **Non-blocking Validation**: Revocation validations do not affect overall verification success when information is not present

### Enhanced
- **Overall Status Calculation**: Revocation validations excluded from overall pass/fail determination since they are optional
- **Validation Status Levels**: Revocation presence shows as warning when information is missing, making it visible without blocking verification
- **Error Handling**: Updated error handling validation summary to include revocation validations
- **User Experience**: Clear distinction between "not checked" vs "checked and passed" for revocation status
- **Security**: When revocation information is present and indicates a revoked certificate, appropriate warnings are displayed

### Technical Improvements
- **Step 18**: Revocation Information Presence Validation with comprehensive logging and status reporting
- **Step 19**: Revocation Status Validation with external API integration and timeout handling
- **Validation Summary Structure**: Enhanced to support revocation validation categories
- **Cross-Platform Consistency**: Revocation validations displayed consistently across web, email, and PDF outputs
- **Optional Validation Logic**: Framework for handling optional validations that enhance but don't block verification

## [0.12.1] - 2025-09-29

### Fixed
- **Cross-Platform Validation Consistency**: All validation results now properly reflected across all output formats
  - Updated email template to include complete technical and business validation sections
  - Enhanced PDF generation with full validation breakdown including business validations
  - Added missing Kid Header and Algorithm Header validations to technical validations in email and PDF
  - Replaced placeholder "No business validations configured" in PDF with actual business validation results
  - Added missing institutionIdDigitValidation to error handling validation summary

### Enhanced
- **Email Notifications**: Comprehensive validation display with technical/business categorization and optional validation indicators
- **PDF Reports**: Complete validation listing with proper technical/business separation and clear status indicators
- **Validation Display Consistency**: Synchronized validation information across verify page, results page, finalization page, email notifications, and PDF reports
- **User Experience**: Users now receive consistent validation information regardless of output format

### Technical Improvements
- **Email Template Structure**: Organized validation display with styled section headers and color-coded optional validation indicators
- **PDF Generation Logic**: Enhanced validation status mapping and comprehensive validation listing
- **Error Handling**: Improved validation summary completeness in error scenarios
- **Output Format Synchronization**: Unified validation structure across all user-facing outputs

## [0.11.0] - 2025-09-29

### Added
- **Comprehensive Business Validations**: Added 9 new business validation steps for EHIC data validation
  - **Date of Birth Validation**: Validates date of birth ≤ start date of EHIC (payload.prc.dob vs payload.prc.sd)
  - **Start/End Date Validation**: Validates start date ≤ end date of EHIC (payload.prc.sd vs payload.prc.ed)
  - **Start/Issuance Date Validation**: Validates start date ≤ issuance date of EHIC (payload.prc.sd vs payload.prc.di)
  - **Issuance/End Date Validation**: Validates issuance date ≤ end date of EHIC (payload.prc.di vs payload.prc.ed)
  - **Institution Length Validation**: *(Optional - Warning Only)* Validates combined institution ID + name length ≤ 25 characters (payload.prc.ii + payload.prc.in)
  - **Card ID Digit Validation**: *(Optional - Warning Only)* Validates card ID contains only digits (payload.prc.ci)
  - **Institution ID Digit Validation**: *(Optional - Warning Only)* Validates institution ID contains only digits (payload.prc.ii)
- **Certificate Validity Date**: Moved from technical to business validations category for better organization
- **EHIC Accreditation**: Enhanced EHIC accreditation validation in business category
- **Clickable Business Validation Tiles**: All business validation tiles are clickable and navigate to corresponding verification sections
- **Warning-Only Validations**: Optional validations that show warnings instead of errors, preventing overall verification failure

### Enhanced
- **Business Validation Categorization**: Clear separation of business logic validations from technical validations
- **Date Comparison Logic**: Comprehensive date validation across all EHIC date fields with proper error reporting
- **Validation Display**: Enhanced frontend display with business validation section and interactive tiles
- **Error Messaging**: Detailed error messages for each validation type with specific field information
- **Step Navigation**: Business validation tiles integrate with existing click-to-navigate functionality

### Technical Improvements
- **Frontend Consistency**: Updated verify.js, results.js, and finalization.js with business validation sections
- **Step Mapping**: Added comprehensive step mappings for all business validations
- **Validation Pipeline**: Extended verification pipeline with 9 new business validation steps (Steps 11-17)
- **Optional Validation Framework**: Implemented warning-only validation system for non-critical checks
- **Data Extraction**: Enhanced PRC data extraction and validation from JWT payload structure

### Validation Framework Enhancements
- **Conditional Validation**: Smart validation logic that only triggers when relevant data is present
- **Comprehensive Logging**: Detailed logging for all business validation results and analysis
- **Error Handling**: Robust error handling for all business validation steps with fallback messaging
- **Status Mapping**: Clear status mapping (success/warning/error) for different validation outcomes

## [0.10.0] - 2025-09-29

### Added
- **Kid Header Validation**: New Step 7 validation for JWT header `kid` field
  - Base64URL format conversion and validation
  - Pattern matching for `EESSI:x5t#S256:[A-Za-z0-9_-]+` format
  - Support for both original and translated kid values in validation results
- **Algorithm Header Validation**: New Step 8 validation for JWT header `alg` field
  - Validation against allowed algorithms: ES256, RS256
  - Comprehensive error messaging for unsupported algorithms
  - Security validation for cryptographic algorithm compliance

### Enhanced
- **JWT Header Security**: Enhanced security validation for JWT headers
- **Base64URL Processing**: Improved handling of Base64 to Base64URL conversion
- **Validation Pipeline**: Extended verification pipeline with additional header validations
- **Error Reporting**: Enhanced error reporting for header validation failures

### Technical Improvements
- **Validation Steps Integration**: New validation steps integrated across all verification pages
- **Frontend Updates**: Updated verify.js, results.js, and finalization.js to display new validations
- **Step Mapping**: Added step mappings for kid and algorithm header validations
- **Consistent Nomenclature**: Maintained consistent validation naming across all media

### Security Enhancements
- **Algorithm Validation**: Ensures only secure algorithms (ES256, RS256) are accepted
- **Kid Format Validation**: Validates proper EESSI kid header format structure
- **Header Integrity**: Comprehensive JWT header validation for security compliance

## [0.9.0] - 2025-09-29

### Added
- **Interactive Validation Tiles**: Validation tiles in `/verify` page are now clickable and navigate to corresponding verification sections
- **Smart Navigation System**: Click tiles to smoothly scroll to related verification step details
- **Visual Feedback System**: Hover effects, click animations, and temporary highlighting of target sections
- **Step Name Mapping**: Intelligent mapping system that connects validation tiles to both basic and detailed verification steps

### Enhanced
- **User Experience**: Improved navigation with smooth scrolling and visual indicators
- **Verification Display**: Enhanced interactivity makes it easier to connect validation results with detailed data
- **Visual Design**: Added hover effects, click animations, and section highlighting for better user feedback
- **Navigation Arrows**: Added right-pointing arrows (→) to indicate clickable tiles

### Technical Improvements
- **CSS Transitions**: Smooth animations for all interactive elements
- **Event Handling**: Robust click handlers with fallback navigation
- **ID Management**: Unique IDs for all verification step sections for precise navigation
- **Responsive Design**: Interactive features work seamlessly on mobile and desktop

### UI/UX Improvements
- **Immediate Feedback**: Visual confirmation when tiles are clicked
- **Clear Indication**: Users can easily identify clickable elements
- **Smooth Experience**: No jarring jumps - all navigation is smooth and fluid
- **Temporary Highlights**: Target sections are highlighted briefly to show connection

## [0.8.0] - 2025-09-29

### Fixed
- **Treatment Date Persistence**: Fixed treatment date not persisting across verification pages due to sessionStorage key mismatch
- **QR Code Analysis Validation**: Corrected status mismatch where green tiles showed for invalid data with "Version undefined" errors
- **Validation Nomenclature**: Standardized validation step names across all media (results, verify, email, PDF)
- **Broken Email Display**: Fixed corrupted validation step names in email notifications
- **PDF Validation Names**: Cleaned up inconsistent translation keys and fallback labels in PDF reports

### Enhanced
- **Raw Data Display**: Added raw QR code data block to `/verify` page for complete transparency
- **Verification Steps Overview**: Enhanced `/verify` page to show all verification results, not just summary tiles
- **Format Agnostic Processing**: Removed artificial HC1 prefix requirement to allow processing of any data format

### Technical Improvements
- **SessionStorage Consistency**: Fixed `treatmentData` vs `treatmentDate` key mismatch across all JavaScript files
- **Validation Display**: Unified validation step labels across frontend and backend
- **Error Handling**: Better error status mapping between backend validation and frontend display
- **Code Cleanup**: Removed unnecessary EHIC/HC1 format restrictions

### UI/UX Improvements
- **Complete Verification Visibility**: Users now see detailed breakdown of all 11 validation steps
- **Consistent Naming**: Same validation step names in tiles, emails, and PDF reports
- **Better Error Feedback**: Accurate tile colors that match validation results
- **Enhanced Verify Page**: Raw data display with copy functionality and step-by-step breakdown

## [0.7.0] - 2025-09-29

### Fixed
- **Certificate Display Cleanup**: Removed certificate dump from validation summary tiles in results page
- **UI Enhancement**: Certificate validity date tile now shows clean validation message without overwhelming certificate details
- **User Experience**: Certificate details remain accessible in Step 11 where appropriate

### Technical Improvements
- **Results Page Optimization**: Simplified certificate validation display in summary tiles
- **Code Cleanup**: Removed special handling of OpenSSL output in validation summary

## [0.6.0] - 2025-09-29

### Added
- **Certificate Validity Date Verification**: Added comprehensive X.509 certificate validation using OpenSSL
- **Document Issuance Date Validation**: Certificate validity period is now validated against document issuance date (`di` field) instead of treatment date
- **OpenSSL Certificate Display**: Complete X.509 certificate details now displayed in Step 11 with proper line formatting
- **Enhanced Certificate Details**: Full certificate parsing showing validity periods, issuer, subject, and extensions

### Changed
- **Certificate Validation Logic**: Updated to use document issuance date from JWT payload (`jwtDecoded?.payload?.prc?.di`) for certificate validity checking
- **Step 11 Enhancement**: Certificate Validity Date Verification step now includes complete OpenSSL certificate output with proper formatting
- **Validation Response**: Cleaned up Step 11 JSON response to show essential validity information with correct dates

### Fixed
- **Certificate Display Location**: Fixed certificate details to display in Step 11 section instead of validation summary banner
- **Line Break Formatting**: OpenSSL certificate output now properly displays with actual line breaks instead of `\n` characters
- **Variable Reference Error**: Fixed "treatmentDateStr is not defined" error by consolidating validation logic
- **Date Validation**: Corrected certificate validity verification to use document issuance date as intended

### Technical Improvements
- **OpenSSL Integration**: Added secure certificate parsing using `openssl x509 -text -noout` command
- **Temporary File Handling**: Proper certificate file creation and cleanup for OpenSSL processing
- **Frontend Certificate Parsing**: Enhanced JavaScript to parse and display multi-line certificate details
- **Error Handling**: Improved error handling for certificate parsing and OpenSSL execution

## [0.5.0] - 2025-09-26

### Added
- **Intelligent PDF Language Rendering**: PDFs now automatically render in the issuing country's native language
- **Technical/Business Validation Categories**: Added clear separation of technical and business validations throughout the application
- **Country-to-Language Mapping**: Comprehensive mapping of ISO 3166-1 country codes to ISO 639-1 language codes
- **Automated Security Scanning**: Trivy security scanning with email reports via GitHub Actions
- **Validation Category Banners**: Visual separation of Technical Validations and Business Validations in all views

### Changed
- **PDF Language Logic**: PDFs render based on issuing country language with exceptions for Belgium, Ireland, Luxembourg, Malta, and Switzerland (render in English)
- **Validation Display**: All validation results now grouped under Technical or Business categories
- **Email Workflow**: Improved bulletproof email workflow with better error handling

### Fixed
- **prcData Initialization Error**: Fixed "Cannot access 'prcData' before initialization" error in PDF generation
- **pdfLanguage Initialization Error**: Fixed "Cannot access 'pdfLanguage' before initialization" by properly scoping variable
- **Trivy Workflow**: Fixed email configuration to match working test email workflow

### Improved
- **PDF Localization**: Each country receives PDFs in their native language for better understanding
- **Validation Clarity**: Clear categorization helps distinguish technical from business requirements
- **Security Monitoring**: Automated vulnerability scanning with scheduled reports

## [0.4.0] - 2025-09-24

### Changed
- **Identity Check Flow**: Moved identity verification to occur after QR verification results instead of before
- **Optional Identity Verification**: Identity check is now optional with single checkbox instead of 4 required checkboxes
- **Visual Verification**: Renamed "Identity Check" to "Visual Verification" for better clarity
- **PRC Data Display**: Identity check page now shows actual PRC certificate data extracted from verified QR code
- **Warning System**: Added warnings in finalization, email, and PDF when identity verification is skipped

### Fixed
- **Flow Sequence**: Updated breadcrumb navigation to reflect new flow: Treatment Date → QR Verification → Results → Visual Verification → Finalization
- **Button Navigation**: Fixed all navigation buttons to follow the correct flow sequence
- **Translation Updates**: Updated all translation keys to reflect new terminology and flow
- **JWT Field Mapping**: Fixed PRC data extraction to use correct JWT field mappings from PDF generation
- **PDF Warning**: Fixed identity verification warning in PDF with proper highlighting and removed encoding issues

### Improved
- **User Experience**: More logical flow where users can see verification results before deciding on identity check
- **Data Consistency**: PRC data display uses same mapping as email and PDF generation
- **Visual Clarity**: Enhanced warning display in PDF with highlighted warning box

## [0.3.0] - 2025-01-24

### Added
- **Complete Multi-Language Support**: Added comprehensive translations for all EEA/EFTA countries
- **26 Language Options**: Full localization support including:
  - All 27 EU Member State languages
  - EEA countries: Norwegian, Icelandic
  - EFTA countries: German, French, Italian (Switzerland), Norwegian, Icelandic
  - Regional languages: Irish Gaelic (Gaeilge), West Frisian (Frysk)
- **Professional Healthcare Translations**: All translations use appropriate medical/government terminology
- **Complete UI Coverage**: 260+ translation keys covering all application features:
  - Navigation and common elements
  - Landing page workflow
  - Treatment date and identity verification
  - QR code scanning interface
  - Results and verification pages
  - Email templates and notifications
  - PDF report generation
  - Error messages and help text
- **Native Language Names**: Language selector displays options in their native scripts
- **Character Encoding Support**: Full support for Cyrillic, Greek, and special characters
- **Dynamic Language Switching**: Seamless language switching with session persistence

### Language Files Added
- Bulgarian (bg.json) - Български
- Czech (cs.json) - Čeština
- Danish (da.json) - Dansk
- German (de.json) - Deutsch
- Estonian (et.json) - Eesti
- Greek (el.json) - Ελληνικά
- Spanish (es.json) - Español
- French (fr.json) - Français
- Frisian (fy.json) - Frysk
- Irish Gaelic (ga.json) - Gaeilge
- Croatian (hr.json) - Hrvatski
- Icelandic (is.json) - Íslenska
- Italian (it.json) - Italiano
- Latvian (lv.json) - Latviešu
- Lithuanian (lt.json) - Lietuvių
- Hungarian (hu.json) - Magyar
- Maltese (mt.json) - Malti
- Norwegian (no.json) - Norsk
- Polish (pl.json) - Polski
- Portuguese (pt.json) - Português
- Romanian (ro.json) - Română
- Slovak (sk.json) - Slovenčina
- Slovenian (sl.json) - Slovenščina
- Finnish (fi.json) - Suomi
- Swedish (sv.json) - Svenska

### Technical Improvements
- Enhanced language selector with alphabetical ordering by native name
- Improved internationalization infrastructure
- Consistent translation key structure across all languages
- Professional healthcare and government terminology throughout

### Fixed
- Portuguese language file structure corrected to match application expectations
- Language selector properly loads all translation files
- Session storage correctly maintains language preferences across pages

## [0.2.0] - 2025-01-23

### Added
- Complete EHIC verification pipeline with 10-step validation process
- QR Code Analysis with version detection and error correction
- BASE45 decoding and ZLIB decompression
- JWT parsing and structure validation
- Schema validation system with SID-based mapping
- EBSI (European Blockchain Services Infrastructure) integration
- Digital signature verification with country code validation
- Comprehensive validation summary tracking
- Real-time status updates during verification process
- PDF report generation with detailed validation results
- Email integration with verification summaries
- Multi-step validation banner with individual pass/fail indicators
- Comprehensive error handling and logging
- MongoDB integration for scan history
- Responsive design with mobile support

### Technical Features
- 10-step verification process:
  1. QR Code Analysis
  2. BASE45 Decoding
  3. ZLIB Decompression
  4. JWT Parsing
  5. Schema File Check
  6. Schema Validation
  7. Signature Retrieval
  8. Signature Count Validation
  9. Country Code Validation
  10. JWT Signature Validation
- Express.js backend with EJS templating
- Real-time validation status tracking
- EHIC/PRC standard compliance
- European healthcare verification standards

### Documentation
- Comprehensive README with architecture overview
- Detailed feature documentation
- Installation and usage instructions
- Technical validation specifications

## [0.1.0] - Initial Release

### Added
- Basic QR code scanning functionality
- Simple verification workflow
- MongoDB integration
- Express.js server setup
- Basic UI components

---

## Version History Summary

- **v0.12.1**: Business validations reflected also in the email and document with cross-platform validation consistency
- **v0.11.0**: Added comprehensive business validations with date comparisons, institution validations, and optional warning-only checks
- **v0.10.0**: Implemented header verification (Kid and Algorithm header validation)
- **v0.9.0**: Added interactive validation tiles with click navigation and enhanced user experience
- **v0.8.0**: Fixed treatment date persistence, standardized validation nomenclature, and enhanced verification display
- **v0.7.0**: Enhanced certificate display and cleaned up validation summary tiles
- **v0.6.0**: Certificate validity date verification with OpenSSL parsing and document issuance date validation
- **v0.5.0**: Intelligent PDF language rendering and technical/business validation categories
- **v0.4.0**: Improved identity verification flow and PRC data display
- **v0.3.0**: Complete multi-language support for all EEA/EFTA countries
- **v0.2.0**: Full EHIC verification system with comprehensive validation pipeline
- **v0.1.0**: Initial QR scanning and basic verification functionality