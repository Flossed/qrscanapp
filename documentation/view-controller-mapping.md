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
| `/scanner` | GET | `index.ejs` | `scanRoutes.js:180` | QR code scanner interface |
| `/results` | GET | `results.ejs` | `scanRoutes.js:378` | Verification results display |
| `/finalization` | GET | `finalization.ejs` | `scanRoutes.js:383` | Final verification summary |
| `/history` | GET | `history.ejs` | `scanRoutes.js:184` | Scan history with database query |
| `/verify` | GET | `verify.ejs` | `scanRoutes.js:373` | Manual verification interface |
| `/check-bridge` | GET | `check-bridge.ejs` | `scanRoutes.js:748` | Bridge connection testing |

### API Routes (No Views)

| Route | HTTP Method | Controller | Description |
|-------|-------------|------------|-------------|
| `/api/scans` | POST | `scanRoutes.js:203` | Save scan data |
| `/api/scans` | GET | `scanRoutes.js:266` | Retrieve all scans |
| `/api/scans/recent` | GET | `scanRoutes.js:276` | Get recent scans |
| `/api/verify` | POST | `scanRoutes.js:1051` | Process QR verification |
| `/api/send-verification-email` | POST | `scanRoutes.js:388` | Send verification email with PDF |
| `/api/check-bridge` | POST | `scanRoutes.js:759` | File upload and bridge check |
| `/api/reference` | GET/POST | `scanRoutes.js:321/299` | Reference data operations |

## View Files Analysis

### Core Navigation Views

#### 1. `landing.ejs` - Welcome Page
- **Purpose**: Application entry point with welcome message
- **Translation Support**: ✅ Full i18n implementation
- **Breadcrumb Position**: Step 1 (Welcome)
- **Internal Links**:
  - Continue button → `/treatment-date`
  - Navigation menu → `/scanner`, `/history`, `/check-bridge`
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

#### 4. `index.ejs` - Scanner Interface
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

#### 9. `check-bridge.ejs` - Bridge Testing
- **Purpose**: Test bridge connections and file uploads
- **API Integration**: `/api/check-bridge` for file processing
- **Internal Links**: Navigation menu only
- **Features**: File upload, progress tracking

#### 10. `layout.ejs` - Base Template
- **Purpose**: Common layout template (if used)
- **Internal Links**: Basic navigation structure
- **Features**: Common CSS/JS includes

## Navigation Flow Diagram

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

## Breadcrumb Navigation System

The application uses a consistent breadcrumb system across the main workflow:

| Step | Page | Route | Status Classes |
|------|------|-------|----------------|
| 1 | Welcome | `/` | `active` (on landing), `completed` (after) |
| 2 | Treatment Date | `/treatment-date` | `active` (on page), `completed` (after) |
| 3 | Identity Check | `/identity-check` | `active` (on page), `completed` (after) |
| 4 | QR Verification | `/scanner` | `active` (on page), `completed` (after) |
| 5 | Results | `/results` | `active` (on page), `completed` (after) |
| 6 | Finalization | `/finalization` | `active` (on page) |

### Breadcrumb CSS Classes
- `.breadcrumb-item.active` - Current step (blue highlight)
- `.breadcrumb-item.completed` - Completed step (green, clickable)
- `.breadcrumb-item.disabled` - Future step (grey, non-clickable)

## Global Navigation Menu

All pages include a consistent navigation menu:

| Menu Item | Route | Available On |
|-----------|-------|--------------|
| Home | `/` | All pages |
| Scanner | `/scanner` | All pages |
| History | `/history` | All pages |
| Check Bridge | `/check-bridge` | All pages |

## Language Support

### Translation-Enabled Views
- ✅ `landing.ejs` - Full translation support
- ⏳ Other views - Pending translation implementation

### Translation System
- **Script**: `/js/manageLocale.js`
- **Language Files**: `/lang/en.json`, `/lang/nl.json`
- **Key Format**: `view-description` (e.g., `landing-title`, `nav-home`)
- **Selector**: Dropdown in navigation header

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
├── landing.ejs           # Welcome page (/)
├── treatment-date.ejs    # Treatment date input (/treatment-date)
├── identity-check.ejs    # Identity verification (/identity-check)
├── index.ejs            # Scanner interface (/scanner)
├── results.ejs          # Verification results (/results)
├── finalization.ejs     # Final summary (/finalization)
├── history.ejs          # Scan history (/history)
├── verify.ejs           # Manual verification (/verify)
├── check-bridge.ejs     # Bridge testing (/check-bridge)
└── layout.ejs           # Base template

routes/
└── scanRoutes.js        # All route definitions and controllers

public/
├── css/style.css        # Global styles (includes breadcrumb, language selector)
├── js/manageLocale.js   # Translation system
└── lang/
    ├── en.json          # English translations
    └── nl.json          # Dutch translations
```

## Special Features

### Dynamic Script Loading (Scanner)
The scanner page (`index.ejs`) dynamically loads different scanner implementations based on URL parameters:
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

---

*Last Updated: 2024*
*Generated from: EHIC Verifier Application Analysis*