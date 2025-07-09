# FullPage Screenshot Pro Browser Extension

## Overview

FullPage Screenshot Pro is a Chrome browser extension that enables users to capture full-page screenshots with customizable viewport settings. The extension provides a clean popup interface for selecting different viewport widths (mobile, tablet, desktop) and captures complete webpage screenshots regardless of the page's actual length.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The extension follows Chrome Extension Manifest V3 architecture with a service worker-based background script, content script injection, and popup-based user interface. The system is designed as a client-side only solution that operates entirely within the browser environment.

### Key Architectural Decisions

**Problem**: Need to capture full webpage screenshots that extend beyond the visible viewport
**Solution**: Combination of Chrome extension APIs with HTML5 Canvas rendering and DOM manipulation
**Rationale**: Provides reliable screenshot capture without requiring external services or server-side processing

**Problem**: Supporting different viewport widths for responsive design testing
**Solution**: Viewport simulation through CSS manipulation before capture
**Rationale**: Allows designers and developers to capture screenshots at different breakpoints

## Key Components

### 1. Background Service Worker (`background.js`)
- **Purpose**: Handles extension lifecycle, message routing, and Chrome API coordination
- **Key Functions**: 
  - Extension installation handling
  - Message passing between popup and content scripts
  - Tab management and script injection

### 2. Content Script (`content.js`)
- **Purpose**: Injected into web pages to perform actual screenshot capture
- **Key Functions**:
  - Page preparation and viewport manipulation
  - Full page dimension calculation
  - Canvas-based screenshot generation
  - Communication with background script

### 3. Advanced Capture Module (`capture.js`)
- **Purpose**: Specialized screenshot capture utilities using HTML5 Canvas
- **Key Functions**:
  - DOM-to-image conversion
  - High-quality image rendering
  - Multiple format support (JPEG, PNG)
  - Pixel ratio handling

### 4. Popup Interface (`popup.html`, `popup.css`, `popup.js`)
- **Purpose**: User interface for viewport selection and capture initiation
- **Key Functions**:
  - Viewport width selection (420px, 768px, 1020px, 1440px)
  - Capture progress indication
  - Settings persistence
  - User feedback and error handling

## Data Flow

1. **User Interaction**: User clicks extension icon, popup opens with viewport options
2. **Viewport Selection**: User selects desired viewport width from predefined options
3. **Capture Initiation**: User clicks capture button, popup sends message to background script
4. **Script Injection**: Background script injects content script into active tab
5. **Page Preparation**: Content script modifies page viewport and prepares for capture
6. **Screenshot Generation**: Advanced capture module renders full page to canvas
7. **Image Processing**: Canvas content converted to desired image format
8. **Download/Save**: Processed image made available for download

## External Dependencies

### Chrome Extension APIs
- **chrome.runtime**: Message passing and extension lifecycle
- **chrome.scripting**: Dynamic script injection
- **chrome.tabs**: Tab management and communication
- **chrome.action**: Extension icon and popup handling
- **chrome.downloads**: File download functionality
- **chrome.storage**: Settings persistence

### Browser APIs
- **HTML5 Canvas**: Image rendering and manipulation
- **DOM APIs**: Page measurement and element manipulation
- **CSS APIs**: Viewport simulation and style management

### No External Services
The extension operates entirely client-side without requiring external APIs, databases, or cloud services.

## Deployment Strategy

### Chrome Web Store Distribution
- **Manifest V3 Compliance**: Uses service worker instead of background pages
- **Permission Model**: Requests minimal permissions (activeTab, scripting, downloads, storage)
- **Host Permissions**: Requires access to all URLs for screenshot functionality

### Local Development
- **Development Mode**: Can be loaded as unpacked extension for testing
- **No Build Process**: Pure JavaScript/HTML/CSS without compilation requirements
- **Hot Reload**: Changes require manual extension reload in development

### Security Considerations
- **Content Security Policy**: Follows Chrome extension CSP requirements
- **Sandboxed Execution**: Content scripts run in isolated environment
- **Permission Scope**: Limited to active tab and essential browser APIs

### Performance Optimization
- **Lazy Loading**: Content script only injected when needed
- **Memory Management**: Canvas cleanup after capture completion
- **Efficient Rendering**: Uses device pixel ratio for optimal image quality

## File Structure

```
/
├── manifest.json          # Extension configuration and permissions
├── background.js          # Service worker for Chrome API handling
├── content.js            # Page-injected script for capture logic
├── capture.js            # Advanced canvas-based capture utilities
├── popup.html            # User interface markup
├── popup.css             # Popup styling and responsive design
├── popup.js              # Popup interaction logic
└── icons/                # Extension icons (referenced but not included)
    ├── icon16.svg
    ├── icon48.svg
    └── icon128.svg
```