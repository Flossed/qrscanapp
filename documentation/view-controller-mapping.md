# View-Controller Mapping Documentation

## Overview
This document maps all views to their corresponding routes/controllers and documents internal navigation links within the EHIC Verifier application.

## Application Architecture
- **Framework**: Express.js with EJS templating
- **Main Controller**: `routes/scanRoutes.js`
- **View Engine**: EJS (Embedded JavaScript)
- **Static Assets**: `public/` directory

## Route-View Mappings

### Main Application Routes

| Route | HTTP Method | View File | Controller | Description |
|-------|-------------|-----------|------------|-------------|
| `/` | GET | `landing.ejs` | `scanRoutes.js:175` | Welcome/Home page |
| `/landing` | GET | `landing.ejs` | `scanRoutes.js:161` | Landing page (alternative route) |
| `/treatment-date` | GET | `treatment-date.ejs` | `scanRoutes.js:166` | Treatment date input page |
| `/identity-check` | GET | `identity-check.ejs` | `scanRoutes.js:171` | Identity verification checklist |
| `/scanner` | GET | `scan.ejs` | `scanRoutes.js:180` | QR code scanner interface |
| `/results` | GET | `results.ejs` | `scanRoutes.js:378` | Verification results display |
| `/finalization` | GET | `finalization.ejs` | `scanRoutes.js:383` | Final verification summary |
| `/history` | GET | `history.ejs` | `scanRoutes.js:184` | Scan history with database query |
| `/verify` | GET | `verify.ejs` | `scanRoutes.js:373` | Manual verification interface |

### API Routes (No Views)

| Route | HTTP Method | Controller | Description |
|-------|-------------|------------|-------------|
| `/api/scans` | POST | `scanRoutes.js:203` | Save scan data |
| `/api/scans` | GET | `scanRoutes.js:266` | Retrieve all scans |
| `/api/scans/recent` | GET | `scanRoutes.js:276` | Get recent scans |
| `/api/verify` | POST | `scanRoutes.js:1051` | Process QR verification |
| `/api/send-verification-email` | POST | `scanRoutes.js:388` | Send verification email with PDF |
| `/api/reference` | GET/POST | `scanRoutes.js:321/299` | Reference data operations |

## View Files Analysis

### Core Navigation Views

#### 1. `landing.ejs` - Welcome Page
- **Purpose**: Application entry point with welcome message
- **Translation Support**: ✅ Full i18n implementation
- **Breadcrumb Position**: Step 1 (Welcome)
- **Internal Links**:
  - Continue button → `/treatment-date`
- **Features**: Language selector, translation system

#### 2. `treatment-date.ejs` - Treatment Date Input
- **Purpose**: Collect treatment date for verification
- **Breadcrumb Position**: Step 2 (Treatment Date)
- **Form Action**: Internal JavaScript processing
- **Internal Links**:
  - Submit → `/identity-check` (JavaScript redirect)
  - Breadcrumb navigation to previous steps
- **Features**: Calendar-only date picker, validation

#### 3. `identity-check.ejs` - Identity Verification
- **Purpose**: Identity verification checklist
- **Breadcrumb Position**: Step 3 (Identity Check)
- **Internal Links**:
  - Continue button → `/scanner` (when checklist complete)
  - Breadcrumb navigation to previous steps
- **Features**: Interactive checkbox validation

#### 4. `scan.ejs` - Scanner Interface
- **Purpose**: QR code scanning functionality
- **Breadcrumb Position**: Step 4 (QR Verification)
- **Internal Links**:
  - Scanner mode switchers → `?scanner=simple|debug|original`
  - Show Verification Results → `/results`
  - Breadcrumb navigation to previous steps
- **Features**: Multiple scanner modes, dynamic script loading

#### 5. `results.ejs` - Verification Results
- **Purpose**: Display verification results with status indicators
- **Breadcrumb Position**: Step 5 (Results)
- **Internal Links**:
  - Continue to Finalize → `/finalization`
  - Breadcrumb navigation to previous steps
- **Features**: Real-time verification processing, status display

#### 6. `finalization.ejs` - Final Summary
- **Purpose**: Final verification summary with email functionality
- **Breadcrumb Position**: Step 6 (Finalization)
- **Internal Links**:
  - Start New Verification → `/` (with session clear)
- **Features**: Email form, PDF generation, print functionality

### Utility Views

#### 7. `history.ejs` - Scan History
- **Purpose**: Display scan history from database
- **Data Source**: `/api/scans` endpoint
- **Internal Links**:
  - Start scanning → `/` (when no history)
  - Navigation menu to other sections
- **Features**: Async data loading, timestamp formatting

#### 8. `verify.ejs` - Manual Verification
- **Purpose**: Manual verification interface
- **Data Source**: Session storage for verification data
- **Internal Links**:
  - Back to Scanner → `/`
  - Redirect if no data → `/`
- **Features**: Step-by-step verification display

- **Purpose**: Test bridge connections and file uploads
- **Internal Links**: Navigation menu only
- **Features**: File upload, progress tracking

#### 10. `layout.ejs` - Base Template
- **Purpose**: Common layout template (if used)
- **Internal Links**: Basic navigation structure
- **Features**: Common CSS/JS includes

## Navigation Overview

The application supports multiple navigation patterns to accommodate different user workflows and access patterns.

### Primary Workflow Navigation

The main verification workflow follows a linear progression through breadcrumb navigation:

```
┌─────────────┐    Continue     ┌─────────────────┐    Continue     ┌──────────────────┐
│   Landing   │ ──────────────→ │ Treatment Date  │ ──────────────→ │  Identity Check  │
│     (/)     │                 │(/treatment-date)│                 │(/identity-check) │
└─────────────┘                 └─────────────────┘                 └──────────────────┘
       ▲                                                                       │
       │                                                                Continue
       │                                                                       ▼
┌─────────────┐   Finalize      ┌─────────────────┐    Show Results ┌──────────────────┐
│Finalization │ ◄─────────────  │    Results      │ ◄─────────────── │    Scanner       │
│(/finalization)│                │   (/results)    │                 │   (/scanner)     │
└─────────────┘                 └─────────────────┘                 └──────────────────┘
```

### Global Navigation Bar Flows

The navbar provides direct access to key sections, allowing users to break from the linear workflow:

```
┌─────────────────────────────────────────────────────────────────┐
│ [EHIC Verifier] [Home] [Scanner] [History] [Check Bridge] [🌐]  │
└─────────────────────────────────────────────────────────────────┘
        │         │        │         │           │            │
        │         │        │         │           │            └─ Language Selector
        │         │        │         └─ Scan History (/history)
        │         │        └─ Direct Scanner Access (/scanner)
        │         └─ Restart Workflow (/)
        └─ Brand Link (/)
```

#### Navigation Bar Flow Patterns:

1. **Home Navigation**: Returns user to landing page, clears session workflow
2. **Direct Scanner Access**: Bypasses treatment date and identity check
3. **History Review**: View previous scans and verification results
4. **Bridge Testing**: Standalone utility for connection testing

### Scanner Page Workflow Variations

The scanner page (`/scanner`) supports three different scanning implementations, each affecting the user experience:

```
┌──────────────────────────────────────────────────────────────────┐
│                        Scanner Page                              │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │
│  │   Simple    │  │    Debug    │  │       Original          │   │
│  │ (?scanner=  │  │ (?scanner=  │  │    (?scanner=           │   │
│  │   simple)   │  │   debug)    │  │     original)           │   │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘   │
│         │               │                      │                 │
│         ▼               ▼                      ▼                 │
│  [scanner-simple.js] [scanner-debug.js] [scanner.js]            │
└──────────────────────────────────────────────────────────────────┘
```

#### Scanner Implementation Differences:

1. **Simple Scanner** (`?scanner=simple` or default):
   - Streamlined interface
   - Basic QR code detection
   - Minimal debugging information

2. **Debug Scanner** (`?scanner=debug`):
   - Enhanced logging and error reporting
   - Real-time scanning feedback
   - Developer-oriented diagnostic information

3. **Original Scanner** (`?scanner=original`):
   - Legacy implementation
   - Full feature set
   - Backward compatibility

### Breadcrumb Navigation System

The breadcrumb system provides contextual navigation within the main workflow:

| Step | Page | Route | Status Classes | Clickable When |
|------|------|-------|----------------|----------------|
| 1 | Welcome | `/` | `active` (on landing), `completed` (after) | Always |
| 2 | Treatment Date | `/treatment-date` | `active` (on page), `completed` (after) | After visiting |
| 3 | Identity Check | `/identity-check` | `active` (on page), `completed` (after) | After visiting |
| 4 | QR Verification | `/scanner` | `active` (on page), `completed` (after) | After visiting |
| 5 | Results | `/results` | `active` (on page), `completed` (after) | After visiting |
| 6 | Finalization | `/finalization` | `active` (on page) | Never (final step) |

#### Breadcrumb CSS Classes:
- `.breadcrumb-item.active` - Current step (blue highlight)
- `.breadcrumb-item.completed` - Completed step (green, clickable)
- `.breadcrumb-item.disabled` - Future step (grey, non-clickable)

### Navigation State Management

The application manages navigation state through multiple mechanisms:

1. **SessionStorage Variables**:
   - `treatmentData` - Treatment date and notes
   - `identityVerification` - Identity check completion status
   - `verificationData` - QR scan results
   - `usedLanguage` - Language preference

2. **URL Parameters**:
   - `?scanner=simple|debug|original` - Scanner implementation selection

3. **Breadcrumb State**:
   - Dynamically updated based on workflow progression
   - Persistent across page refreshes within session

### Cross-Navigation Scenarios

#### Scenario 1: Direct Scanner Access
```
User clicks "Scanner" in navbar → `/scanner` → Bypasses treatment date/identity check
```

#### Scenario 2: History Review
```
User clicks "History" → `/history` → View past scans → Can return to any workflow step
```

#### Scenario 3: Bridge Testing
```
```

#### Scenario 4: Breadcrumb Navigation
```
User in step 4 (Scanner) → Clicks step 2 breadcrumb → Returns to Treatment Date → Can modify data
```

### Global Navigation Menu

All pages include consistent navigation access:

| Menu Item | Route | Purpose | Available On |
|-----------|-------|---------|--------------|
| Home | `/` | Restart verification workflow | All pages |
| Scanner | `/scanner` | Direct QR scanning access | All pages |
| History | `/history` | Review past verifications | All pages |
| Language Selector | N/A | Switch interface language | All translated pages |

## Language Support

### Translation-Enabled Views
- ✅ `landing.ejs` - Full translation support with externalized styles
- ✅ `treatment-date.ejs` - Full translation support with externalized styles and JavaScript
- ✅ `identity-check.ejs` - Full translation support with externalized styles and JavaScript
- ✅ `scan.ejs` - Full translation support with externalized styles and JavaScript
- ⏳ `results.ejs` - Pending translation implementation
- ⏳ `finalization.ejs` - Pending translation implementation
- ⏳ `history.ejs` - Pending translation implementation
- ⏳ `verify.ejs` - Pending translation implementation

### Translation System
- **Script**: `/js/manageLocale.js`
- **Language Files**: `/lang/en.json`, `/lang/nl.json`
- **Key Format**: `view-description` (e.g., `landing-title`, `treatment-date-label`, `identity-why-title`, `scan-title`)
- **Selector**: Dropdown in navigation header (available on all translated pages)
- **Session Storage**: Language preference persisted across page navigation

## Session and State Management

### SessionStorage Usage
- `verificationData` - Original QR code data
- `verificationResults` - Processed verification results
- `treatmentDate` - Selected treatment date
- `usedLanguage` - Selected interface language
- `actualTranslations` - Cached translations

### Data Flow
1. **Landing** → **Treatment Date** (via button click)
2. **Treatment Date** → **Identity Check** (via form submission)
3. **Identity Check** → **Scanner** (via checklist completion)
4. **Scanner** → **Results** (via verification button)
5. **Results** → **Finalization** (via continue button)
6. **Finalization** → **Landing** (via new verification, clears session)

## File Structure

```
views/
├── landing.ejs           # Welcome page (/) - ✅ Translated + Externalized
├── treatment-date.ejs    # Treatment date input (/treatment-date) - ✅ Translated + Externalized
├── identity-check.ejs    # Identity verification (/identity-check) - ✅ Translated + Externalized
├── scan.ejs             # Scanner interface (/scanner) - ✅ Translated + Externalized
├── results.ejs          # Verification results (/results)
├── finalization.ejs     # Final summary (/finalization)
├── history.ejs          # Scan history (/history)
├── verify.ejs           # Manual verification (/verify)
└── layout.ejs           # Base template

routes/
└── scanRoutes.js        # All route definitions and controllers

public/
├── css/
│   └── style.css        # Global styles (includes all page-specific styles)
├── js/
│   ├── manageLocale.js  # Translation system
│   ├── treatment-date.js # Treatment date page logic
│   ├── identity-check.js # Identity verification logic
│   ├── scan.js          # Scanner page logic and version selection
│   ├── scanner-simple.js # Simple scanner implementation
│   ├── scanner-debug.js  # Debug scanner implementation
│   ├── scanner.js       # Original scanner implementation
│   ├── history.js       # History page functionality
│   └── reference.js     # Reference data management
└── lang/
    ├── en.json          # English translations (comprehensive)
    └── nl.json          # Dutch translations (comprehensive)
```

## Special Features

### Dynamic Script Loading (Scanner)
The scanner page (`scan.ejs`) dynamically loads different scanner implementations based on URL parameters:
- `?scanner=simple` → `scanner-simple.js`
- `?scanner=debug` → `scanner-debug.js`
- `?scanner=original` → `scanner-original.js`

### Email Integration
The finalization page includes email functionality that:
- Generates PDF certificates with verification data
- Sends emails with attachments via `/api/send-verification-email`
- Includes actual verification status and QR code data

### Responsive Design
All views are mobile-responsive with:
- Flexible navigation that collapses on mobile
- Responsive breadcrumb system
- Mobile-optimized form layouts
- Touch-friendly button sizing

## Architectural Improvements

### Code Organization
- **Separation of Concerns**: All inline styles and JavaScript have been externalized
- **Modular JavaScript**: Each page has its own dedicated JS file for page-specific logic
- **Centralized Styling**: All styles consolidated in `/css/style.css` with organized sections
- **Translation System**: Complete i18n implementation with session persistence

### Page-Specific JavaScript Files
- `treatment-date.js` - Date validation, form handling, and navigation
- `identity-check.js` - Checkbox validation and verification state management
- `scan.js` - Scanner version selection and dynamic script loading
- `manageLocale.js` - Language switching and translation management

### CSS Architecture
- **Global Styles**: Navigation, buttons, forms, breadcrumbs
- **Page-Specific Sections**:
  - Landing page styles
  - Treatment date page styles
  - Identity check page styles
  - Scan page styles
- **Responsive Design**: Mobile-first approach with media queries

### Translation Coverage
- **English (en.json)**: 82 translation keys covering all implemented pages
- **Dutch (nl.json)**: 82 translation keys with complete translations
- **Key Naming**: Structured with page prefixes (`landing-`, `treatment-`, `identity-`, `scan-`)
- **Dynamic Content**: Scanner version indicators and form placeholders

---

*Last Updated: September 2024*
*Generated from: EHIC Verifier Application Analysis - Post Translation Implementation*