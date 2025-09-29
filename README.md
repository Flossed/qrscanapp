# QR Scanner App - EHIC Verification System

## Overview
A comprehensive EHIC (European Health Insurance Card) verification system that processes QR codes and validates digital certificates using EBSI (European Blockchain Services Infrastructure).

## Current Status - Version 0.6.0

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

#### User Interface
- **Comprehensive Validation Banner** - Step-by-step validation status with individual pass/fail indicators
- **Real-time Status Updates** - Live feedback during verification process
- **Responsive Design** - Mobile-friendly interface with proper error handling
- **OpenSSL Certificate Display** - Complete X.509 certificate details in Step 11 with proper formatting

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
- **Complete Multi-language Support** - Full localization for all 26 EEA/EFTA languages
- **Technical/Business Validation Categories** - Clear separation of technical and business validations

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

11. **JWT Signature Validation** ✅
    - Cryptographic signature verification
    - Public key validation using EBSI

### 📋 Current Limitations

- **One Exception**: Minor country code extraction debugging (resolved)
- **Missing Features**:
  - User authentication/login system
  - Advanced business logic validation rules
  - Comprehensive audit logging
  - Advanced reporting features

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

### 🚀 Next Steps (Version 0.3+)

- User authentication and role management
- Advanced business logic validation
- Comprehensive audit trails
- Enhanced reporting capabilities
- Performance optimizations
- Additional language support

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

**Version 0.6** - Added certificate validity date verification with OpenSSL parsing and document issuance date validation.