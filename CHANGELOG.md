# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

- **v0.9.0**: Added interactive validation tiles with click navigation and enhanced user experience
- **v0.8.0**: Fixed treatment date persistence, standardized validation nomenclature, and enhanced verification display
- **v0.7.0**: Enhanced certificate display and cleaned up validation summary tiles
- **v0.6.0**: Certificate validity date verification with OpenSSL parsing and document issuance date validation
- **v0.5.0**: Intelligent PDF language rendering and technical/business validation categories
- **v0.4.0**: Improved identity verification flow and PRC data display
- **v0.3.0**: Complete multi-language support for all EEA/EFTA countries
- **v0.2.0**: Full EHIC verification system with comprehensive validation pipeline
- **v0.1.0**: Initial QR scanning and basic verification functionality