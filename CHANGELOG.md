# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

- **v0.3.0**: Complete multi-language support for all EEA/EFTA countries
- **v0.2.0**: Full EHIC verification system with comprehensive validation pipeline
- **v0.1.0**: Initial QR scanning and basic verification functionality