# QR Scanner App - EHIC Verification System

## Overview
A comprehensive EHIC (European Health Insurance Card) verification system that processes QR codes and validates digital certificates using EBSI (European Blockchain Services Infrastructure).

## Current Status - Version 0.21.0 - 2025-10-01

### ✅ Completed Features

#### Core Verification Pipeline
- **QR Code Analysis** - Analyzes QR code version, error correction level, and optimal generation
- **BASE45 Decoding** - Processes alphanumeric BASE45 encoded data
- **ZLIB Decompression** - Decompresses data to extract JWT tokens
- **JWT Parsing** - Parses and validates JSON Web Token structure

#### Schema Validation System
- **Schema File Check** - Validates schema file existence based on JWT SID mapping
- **Schema Validation** - Comprehensive validation against EHIC schema definitions
- **Dynamic Schema Lookup** - Maps JWT SID (`eessi:prc:1.0`) to appropriate schema files

#### Digital Signature Verification
- **Signature Retrieval** - Fetches digital signatures from EBSI infrastructure
- **Signature Count Validation** - Ensures exactly one signature is present
- **Country Code Validation** - Matches country codes between JWT and signature response
- **Certificate Validity Date Verification** - Validates certificate validity period against document issuance date
- **JWT Signature Validation** - Cryptographic validation of digital signatures
- **Revocation Information Presence** - Checks for JWT ID (jti) and Revocation ID (rid) fields in the payload
- **Revocation Status Validation** - Fetches real-time revocation status from external endpoints when revocation information is present
- **Treatment Date Presence Validation** - Validates that a treatment date is provided when required
- **Treatment Date Range Validation** - Ensures treatment date falls within certificate validity period (startDate <= treatmentDate <= endDate)

#### User Interface
- **Comprehensive Validation Banner** - Step-by-step validation status with individual pass/fail indicators
- **Interactive Validation Tiles** - Clickable tiles that navigate to corresponding verification sections
- **Real-time Status Updates** - Live feedback during verification process
- **Responsive Design** - Mobile-friendly interface with proper error handling
- **OpenSSL Certificate Display** - Complete X.509 certificate details in Step 11 with proper formatting
- **Enhanced Navigation** - Smooth scrolling and visual highlighting for better user experience
- **Cross-Page Navigation** - Clickable validation tiles across verify, results, and finalization pages with seamless step navigation

#### Visual Verification System
- **Optional Identity Check** - Visual verification of patient identity after QR verification
- **PRC Data Display** - Shows extracted certificate information for comparison with identity documents
- **Improved Workflow** - Logical flow: Treatment Date → QR Verification → Results → Visual Verification → Finalization
- **Warning System** - Clear warnings in finalization, email, and PDF when visual verification is skipped

#### Results & Finalization
- **Detailed Results Display** - Shows all validation steps with success/failure status
- **PDF Report Generation** - Creates comprehensive verification reports with all test results
- **Dynamic PDF Language** - PDFs automatically render in issuing country's native language
- **Email Integration** - Sends verification summaries with detailed test status
- **JSON Output Attachment** - Structured JSON verification results attached to emails
- **JSON Schema Validation** - Validates output against comprehensive schema for data integrity
- **Complete Multi-language Support** - Full localization for all 26 EEA/EFTA languages
- **Technical/Business Validation Categories** - Clear separation of technical and business validations
- **Comprehensive Business Validations** - Date validations, institution validation, and card ID validation
- **Cross-Platform Validation Consistency** - All validations displayed consistently across web interface, email notifications, and PDF reports

#### Internationalization & Localization
- **26 Language Support** - Complete translations for all EEA/EFTA countries
- **Professional Healthcare Terminology** - Medical/government appropriate translations
- **Native Language Names** - Language selector displays options in native scripts
- **Full Character Support** - Cyrillic, Greek, and special character encoding
- **Dynamic Language Switching** - Seamless language changes with session persistence
- **Complete UI Coverage** - 260+ translation keys across all application features

#### Intelligent PDF Language Rendering
- **Automatic Language Detection** - PDFs render in the issuing country's native language
- **Country-to-Language Mapping** - Comprehensive ISO 3166-1 to ISO 639-1 mapping
- **Language Exceptions** - Belgium, Ireland, Luxembourg, Malta, and Switzerland render in English
- **Fallback Support** - Defaults to English for unknown countries
- **Email Language Independence** - Emails use user's selected language while PDFs use issuing country language

**Supported Languages:**
- **EU Languages**: Bulgarian, Czech, Danish, German, Estonian, Greek, Spanish, French, Croatian, Italian, Latvian, Lithuanian, Hungarian, Maltese, Dutch, Polish, Portuguese, Romanian, Slovak, Slovenian, Finnish, Swedish
- **EEA Languages**: Norwegian, Icelandic
- **Regional Languages**: Irish Gaelic (Gaeilge), West Frisian (Frysk)
- **EFTA Coverage**: German, French, Italian, Norwegian, Icelandic

#### Technical Infrastructure
- **MongoDB Integration** - Stores scan history and verification results
- **Express.js Backend** - RESTful API endpoints for all verification functions
- **Error Handling** - Comprehensive error reporting with detailed logging
- **Security** - Proper input validation and sanitization

### 🔧 Technical Validations (Complete)

1. **QR Code Analysis** ✅
   - Version detection and optimization
   - Error correction level validation
   - Data capacity analysis

2. **BASE45 Decoding** ✅
   - Alphanumeric character set validation
   - Proper decoding with error handling

3. **ZLIB Decompression** ✅
   - Data integrity validation
   - Compression ratio analysis

4. **JWT Parsing** ✅
   - Structure validation (header.payload.signature)
   - Base64URL encoding validation

5. **Schema File Check** ✅
   - SID-based schema mapping
   - File existence validation
   - Available alternatives listing

6. **Schema Validation** ✅
   - JSON Schema compliance checking
   - Field validation and type checking
   - Error reporting with field-level detail

7. **Signature Retrieval** ✅
   - EBSI infrastructure integration
   - Public key retrieval and caching

8. **Signature Count Validation** ✅
   - Ensures exactly one signature
   - Array/single signature handling

9. **Country Code Validation** ✅
   - JWT `ic` field validation
   - Signature `countryCode` field validation
   - Cross-validation between sources

10. **Certificate Validity Date Verification** ✅
    - X.509 certificate parsing using OpenSSL
    - Certificate validity period extraction
    - Document issuance date validation against certificate validity

11. **Kid Header Validation** ✅
    - JWT header `kid` field validation
    - Base64URL format conversion and validation
    - Pattern matching: `EESSI:x5t#S256:[A-Za-z0-9_-]+`

12. **Algorithm Header Validation** ✅
    - JWT header `alg` field validation
    - Allowed algorithms: ES256, RS256
    - Cryptographic algorithm security validation

13. **JWT Signature Validation** ✅
    - Cryptographic signature verification
    - Public key validation using EBSI

### 🏢 Business Validations (Complete)

1. **Certificate Validity Date** ✅
   - Validates certificate validity period against document issuance date

2. **EHIC Accreditation** ✅
   - European Health Insurance Card accreditation validation

3. **Date of Birth Validation** ✅
   - Validates date of birth ≤ start date of EHIC

4. **Start/End Date Validation** ✅
   - Validates start date ≤ end date of EHIC

5. **Start/Issuance Date Validation** ✅
   - Validates start date ≤ issuance date of EHIC

6. **Issuance/End Date Validation** ✅
   - Validates issuance date ≤ end date of EHIC

7. **Institution Length Validation** ✅ *(Optional - Warning Only)*
   - Validates combined institution ID + name length ≤ 25 characters
   - Only triggers when expiry date is present

8. **Card ID Digit Validation** ✅ *(Optional - Warning Only)*
   - Validates card ID contains only digits
   - Only triggers when card ID is present

9. **Institution ID Digit Validation** ✅ *(Optional - Warning Only)*
   - Validates institution ID contains only digits
   - Only triggers when institution ID is present

### 📋 Current Limitations

- **Missing Feature**:
  - User authentication/login system

### 🏗 Architecture

```
Frontend (EJS Templates + Vanilla JS)
├── Scanner Interface
├── Verification Progress Display
├── Results Dashboard
└── Finalization Workflow

Backend (Node.js + Express)
├── Verification Pipeline
├── Schema Validation Engine
├── EBSI Integration Layer
├── PDF Generation Service
└── Email Notification System

Database (MongoDB)
├── Scan History
├── Verification Results
└── User Sessions

External Services
├── EBSI Resolver API
└── SMTP Email Service
```

### 🔄 Verification Flow

1. **QR Code Scan** → BASE45 data extraction
2. **Data Processing** → BASE45 decode → ZLIB decompress → JWT parse
3. **Schema Validation** → File check → Structure validation
4. **Signature Verification** → EBSI lookup → Count validation → Country validation → Cryptographic verification
5. **Results** → Comprehensive status display
6. **Finalization** → PDF generation → Email delivery

### 📊 Validation Summary

The system provides a comprehensive validation banner showing:
- ✅ **Green** - Step passed successfully
- ❌ **Red** - Step failed with detailed error message
- ⚠ **Warning** - Step completed with warnings
- ○ **Pending** - Step not yet processed

### 🌍 Supported Standards

- **EHIC Standard** - European Health Insurance Card specification
- **BASE45 Encoding** - Alphanumeric data encoding for QR codes
- **JSON Web Tokens (JWT)** - Digital token standard
- **JSON Schema** - Data validation specification
- **EBSI** - European Blockchain Services Infrastructure
- **EESSI** - Electronic Exchange of Social Security Information

### 🚀 Next Steps

- User authentication and role management

---

## Installation & Usage

### Prerequisites
- Node.js 16+
- MongoDB
- Environment variables for SMTP and MongoDB connection

### Quick Start
```bash
npm install
npm start
```

The application will be available at `http://localhost:3000`

### Environment Variables
```
MONGODB_URI=your_mongodb_connection_string
SMTP_HOST=your_smtp_host
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
```

---

**Version 0.17.0** - JSON output + schema added - *September 29, 2025*