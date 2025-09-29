# EHIC/PRC Validation Documentation

## Overview
This document provides a comprehensive overview of all validation steps performed during the verification of Electronic Provisional Replacement Certificates (ePRC) and European Health Insurance Cards (EHIC). Each validation is mapped to its source specification and implementation.

## Source Documents
1. **Verifier Specifications** (`verifier specifications.txt`)
2. **EHIC PDF QR Code PoC - Technical Specifications** (Version 1)
3. **Implementation** (`routes/scanRoutes.js`)

---

## 1. Technical Validations

### 1.1 QR Code Analysis [VAL-001]
**Origin:** Technical Specifications Section 3
**Specification Reference:** Verifier Process Step 2 - "read QR to base45"
**Implementation:** `scanRoutes.js:2263-2300`

**Description:** Analyzes the QR code structure and characteristics, including version detection, error correction level, and data capacity.

**Success Criteria:**
- QR code can be generated and analyzed
- Version and error correction level are determined
- Data fits within QR code capacity

**Error Message:** "QR Code analysis failed: [error details]"

---

### 1.2 BASE45 Decode [VAL-002]
**Origin:** Verifier Specifications Step 2
**Specification Reference:** "read QR to base45 => Unhappy: Red output 'QR invalid'"
**Implementation:** `scanRoutes.js:2317-2331`

**Description:** Decodes the BASE45-encoded string from the QR code into compressed binary data.

**Success Criteria:**
- Valid BASE45 format
- Successful decoding to binary data

**Error Message:** "BASE45 decoding failed: [error details]"

---

### 1.3 ZLIB Decompression [VAL-003]
**Origin:** Verifier Specifications Step 2
**Specification Reference:** "uncompress (zlib) to encoded JWT => Unhappy: Red output 'QR invalid'"
**Implementation:** `scanRoutes.js:2334-2343`

**Description:** Decompresses the ZLIB-compressed data to obtain the JWT string.

**Success Criteria:**
- Valid ZLIB format
- Successful decompression
- Result is a valid string

**Error Message:** "ZLIB decompression failed: [error details]"

---

### 1.4 JWT Parsing [VAL-004]
**Origin:** Verifier Specifications Step 2
**Specification Reference:** "decode JWT to header, payload, signature => Unhappy: Red output 'QR invalid'"
**Implementation:** `scanRoutes.js:2346-2361`

**Description:** Parses the JWT into its three components: header, payload, and signature.

**Success Criteria:**
- JWT has exactly 3 parts (header.payload.signature)
- Each part is valid base64url encoded
- Header contains required fields (typ, alg, kid)
- Payload contains required fields (sid, prc)

**Error Message:** "JWT parsing failed: Invalid JWT format"

---

### 1.5 Schema File Check [VAL-005]
**Origin:** Verifier Specifications Step 3
**Specification Reference:** "Resolve the schema mentioned in payload/sid => Unhappy: Red output 'QR invalid'"
**Implementation:** `scanRoutes.js:2479-2555`

**Description:** Verifies that the schema file corresponding to the SID (Schema ID) exists and is accessible.

**Success Criteria:**
- SID is recognized (e.g., "eessi:prc:1.0")
- Corresponding schema file exists
- Schema file is readable

**Error Message:** "Schema file not found: [schema filename]"

---

### 1.6 Schema Validation [VAL-006]
**Origin:** Verifier Specifications Step 3
**Specification Reference:** "Validate header and payload to the schema mentioned in payload/sid => Unhappy: Red output 'QR invalid'"
**Implementation:** `scanRoutes.js:2577-2708`

**Description:** Validates JWT header and payload against the JSON schema specified by the SID.

**Success Criteria:**
- Header matches schema requirements
- Payload matches schema requirements
- All required fields present
- Field formats are correct

**Error Message:** "Schema validation failed: [validation errors]"

---

### 1.7 Signature Verification (EBSI Lookup) [VAL-007]
**Origin:** Verifier Specifications Step 4
**Specification Reference:** "Resolve Key with Resolver API ebsi"
**Implementation:** `scanRoutes.js:2691-2703`

**Description:** Retrieves the public key from EBSI resolver API for signature verification.

**Success Criteria:**
- EBSI API responds successfully
- Public key found for the institution
- Certificate matches the thumbprint in KID

**Error Message:** "Signature verification failed: [error details]"

---

### 1.8 Signature Count Validation [VAL-008]
**Origin:** Verifier Specifications Step 4
**Specification Reference:** "Verify the single issuer is correctly returned"
**Implementation:** `scanRoutes.js:2716-2794`

**Description:** Ensures exactly one issuer/certificate is returned from EBSI.

**Success Criteria:**
- Exactly one result returned from EBSI
- No multiple issuers found

**Error Message:** "Invalid signature count: expected 1, got [count]"

---

### 1.9 Country Code Validation [VAL-009]
**Origin:** Verifier Specifications Step 4
**Specification Reference:** "officialid or countrycode in the returned issuer is not equal to officialid/countrycode requested"
**Implementation:** `scanRoutes.js:2796-2857`

**Description:** Validates that the country code and official ID from EBSI match the JWT payload.

**Success Criteria:**
- Country code in EBSI response matches payload/prc/ic
- Official ID in EBSI response matches payload/prc/ii

**Error Message:** "Country code mismatch: expected [country], got [country]"

---

### 1.10 Certificate Validity Date Verification [VAL-010]
**Origin:** Technical Specifications Section 5.5
**Specification Reference:** "Public key must be valid on payload/prc/di"
**Implementation:** `scanRoutes.js:2859-2905`

**Description:** Verifies that the treatment date falls within the certificate validity period.

**Success Criteria:**
- Certificate notBefore ≤ treatment date
- Treatment date ≤ certificate notAfter

**Error Message:** "Certificate validity date verification failed: Treatment date outside certificate validity period"

---

### 1.11 JWT Signature Validation [VAL-011]
**Origin:** Verifier Specifications Step 4
**Specification Reference:** "Use the public key found to verify the JWT signature => Unhappy: Red output 'QR invalid'"
**Implementation:** `scanRoutes.js:2907-2956`

**Description:** Validates the JWT signature using the public key from EBSI.

**Success Criteria:**
- Signature algorithm matches header (RS256 or ES256)
- Signature is valid for the signing input (header.payload)
- Public key successfully verifies signature

**Error Message:** "JWT signature validation failed"

---

## 2. Business Validations

### 2.1 Date Logic Validations [VAL-012]
**Origin:** Technical Specifications Section 2.4.1
**Specification Reference:** Business rules for date consistency
**Status:** **NOT IMPLEMENTED**

**Required Validations:**
- `dob <= sd` (Date of birth before start date)
- `sd <= ed` (Start date before end date)
- `sd <= di` (Start date before/equal to issuance date)
- `di <= ed` (Issuance date before/equal to end date)
- If `xd` present: `xd >= ed` (Expiry date after end date)

---

### 2.2 Institution Accreditation [VAL-013]
**Origin:** Verifier Specifications Step 5
**Specification Reference:** "Institution must be accredited for EHIC on payload/prc/di"
**Status:** **NOT IMPLEMENTED**

**Description:** Verifies institution was accredited to issue EHIC on the issuance date.

---

### 2.3 Treatment Date Validation [VAL-014]
**Origin:** Verifier Specifications Step 7
**Specification Reference:** "verify treatment date lies in period [payload/prc/sd, payload/prc/ed]"
**Status:** **PARTIALLY IMPLEMENTED** (only in certificate validity check)

**Description:** Verifies treatment date is within PRC validity period.

---

### 2.4 Field Format Validations [VAL-015]
**Origin:** Technical Specifications Section 2.4.1
**Status:** **NOT IMPLEMENTED**

**Warning-Level Validations:**
- Length of `ii + in` ≤ 25 characters
- `ci` contains only digits
- `ii` contains only digits

---

### 2.5 Revocation Check [VAL-016]
**Origin:** Verifier Specifications Step 6
**Specification Reference:** "verify that payload/jti is not present on the revocation list exposed on payload/rid"
**Status:** **NOT IMPLEMENTED**

---

## Cross-Reference Table

| ID | Validation Name | Category | Implementation Status | Origin | Priority | Error Type |
|---|---|---|---|---|---|---|
| VAL-001 | QR Code Analysis | Technical | ✅ Implemented | Tech Spec 3, Verifier 2 | Required | Error |
| VAL-002 | BASE45 Decode | Technical | ✅ Implemented | Verifier 2 | Required | Error |
| VAL-003 | ZLIB Decompression | Technical | ✅ Implemented | Verifier 2 | Required | Error |
| VAL-004 | JWT Parsing | Technical | ✅ Implemented | Verifier 2 | Required | Error |
| VAL-005 | Schema File Check | Technical | ✅ Implemented | Verifier 3 | Required | Error |
| VAL-006 | Schema Validation | Technical | ✅ Implemented | Verifier 3 | Required | Error |
| VAL-007 | Signature Verification | Technical | ✅ Implemented | Verifier 4 | Required | Error |
| VAL-008 | Signature Count | Technical | ✅ Implemented | Verifier 4 | Required | Error |
| VAL-009 | Country Code Check | Technical | ✅ Implemented | Verifier 4 | Required | Error |
| VAL-010 | Certificate Validity | Technical | ✅ Implemented | Tech Spec 5.5 | Required | Error |
| VAL-011 | JWT Signature | Technical | ✅ Implemented | Verifier 4 | Required | Error |
| VAL-012 | Date Logic | Business | ❌ Not Implemented | Tech Spec 2.4.1 | Required | Error |
| VAL-013 | Accreditation | Business | ❌ Not Implemented | Verifier 5 | Required | Error |
| VAL-014 | Treatment Date | Business | ⚠️ Partial | Verifier 7 | Required | Error |
| VAL-015 | Field Formats | Business | ❌ Not Implemented | Tech Spec 2.4.1 | Optional | Warning |
| VAL-016 | Revocation | Business | ❌ Not Implemented | Verifier 6 | Optional | Error |

## Implementation Summary

### Currently Implemented (11/16)
All technical validations are fully implemented:
- QR code processing chain (VAL-001 to VAL-004)
- Schema validation (VAL-005, VAL-006)
- Signature and certificate validations (VAL-007 to VAL-011)

### Not Implemented (5/16)
Business validations requiring implementation:
- **VAL-012**: Date logic validations (critical)
- **VAL-013**: Institution accreditation check
- **VAL-014**: Full treatment date validation (partially done)
- **VAL-015**: Field format warnings
- **VAL-016**: Revocation list check

## Validation Flow

```
1. QR Code Processing
   ├── VAL-001: QR Analysis
   ├── VAL-002: BASE45 Decode
   ├── VAL-003: ZLIB Decompress
   └── VAL-004: JWT Parse

2. Schema Validation
   ├── VAL-005: Schema File Check
   └── VAL-006: Schema Validation

3. Signature Verification
   ├── VAL-007: EBSI Lookup
   ├── VAL-008: Signature Count
   ├── VAL-009: Country Code
   ├── VAL-010: Certificate Validity
   └── VAL-011: JWT Signature

4. Business Rules (NOT FULLY IMPLEMENTED)
   ├── VAL-012: Date Logic
   ├── VAL-013: Accreditation
   ├── VAL-014: Treatment Date
   ├── VAL-015: Field Formats
   └── VAL-016: Revocation
```

## Recommendations

1. **High Priority**: Implement VAL-012 (Date Logic) as these are critical business rules
2. **Medium Priority**: Complete VAL-014 (Treatment Date) and VAL-013 (Accreditation)
3. **Low Priority**: Add VAL-015 (warnings) and VAL-016 (revocation) for completeness

## Notes

- All technical validations follow a fail-fast approach where subsequent validations are skipped if earlier ones fail
- Business validations should be executed even if some fail (collect all errors)
- Warning-level validations (VAL-015) should not prevent successful verification
- The implementation uses a `validationSummary` object to track all validation states