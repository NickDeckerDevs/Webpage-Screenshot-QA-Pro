// Content script for FullPage Screenshot Pro extension

class FullPageCapture {
  constructor() {
    this.isCapturing = false;
    this.originalStyles = new Map();
    this.captureCanvas = null;
    this.init();
  }

  init() {
    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'startCapture') {
        this.handleCaptureRequest(request, sendResponse);
        return true; // Keep message channel open
      }
      
      if (request.action === 'getPageInfo') {
        sendResponse(this.getPageInfo());
      }
    });

    // Check if this page is in screenshot mode
    this.checkScreenshotMode();

    console.log('FullPage Screenshot content script loaded');
  }

  async handleCaptureRequest(request, sendResponse) {
    if (this.isCapturing) {
      sendResponse({ 
        success: false, 
        error: 'Capture already in progress' 
      });
      return;
    }

    try {
      this.isCapturing = true;
      const { viewportWidth, options = {} } = request;
      
      // Prepare page for capture
      await this.preparePage(viewportWidth);
      
      // Get page dimensions
      const dimensions = this.getPageDimensions();
      
      // Perform capture
      const captureData = await this.captureFullPage(dimensions, options);
      
      sendResponse({ 
        success: true, 
        data: captureData,
        dimensions 
      });
      
    } catch (error) {
      console.error('Content script capture error:', error);
      sendResponse({ 
        success: false, 
        error: error.message 
      });
    } finally {
      this.isCapturing = false;
      this.restorePage();
    }
  }

  async preparePage(targetWidth) {
    // Store original scroll position
    this.originalScrollX = window.scrollX;
    this.originalScrollY = window.scrollY;
    
    // Scroll to top
    window.scrollTo(0, 0);
    
    // Store and modify viewport if needed
    if (targetWidth && Math.abs(window.innerWidth - targetWidth) > 50) {
      const zoomLevel = targetWidth / window.innerWidth;
      
      // Store original zoom
      this.originalZoom = document.body.style.zoom || '1';
      
      // Apply zoom
      document.body.style.zoom = zoomLevel.toString();
      
      // Wait for zoom to apply
      await this.sleep(300);
    }
    
    // Hide scrollbars temporarily
    this.hideScrollbars();
    
    // Wait for any dynamic content
    await this.waitForContent();
    
    // Additional stabilization time
    await this.sleep(500);
  }

  hideScrollbars() {
    const style = document.createElement('style');
    style.id = 'fullpage-screenshot-hide-scrollbars';
    style.textContent = `
      * {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      *::-webkit-scrollbar {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  restorePage() {
    // Restore zoom
    if (this.originalZoom !== undefined) {
      document.body.style.zoom = this.originalZoom;
    }
    
    // Restore scrollbars
    const hideScrollbarStyle = document.getElementById('fullpage-screenshot-hide-scrollbars');
    if (hideScrollbarStyle) {
      hideScrollbarStyle.remove();
    }
    
    // Restore scroll position
    if (this.originalScrollX !== undefined && this.originalScrollY !== undefined) {
      window.scrollTo(this.originalScrollX, this.originalScrollY);
    }
  }

  getPageDimensions() {
    const body = document.body;
    const html = document.documentElement;
    
    const height = Math.max(
      body.scrollHeight,
      body.offsetHeight,
      html.clientHeight,
      html.scrollHeight,
      html.offsetHeight
    );
    
    const width = Math.max(
      body.scrollWidth,
      body.offsetWidth,
      html.clientWidth,
      html.scrollWidth,
      html.offsetWidth
    );

    return {
      width,
      height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }

  async captureFullPage(dimensions, options = {}) {
    const { height, viewportHeight } = dimensions;
    const scrollSteps = Math.ceil(height / viewportHeight);
    
    if (scrollSteps <= 1) {
      // Single viewport capture
      return await this.captureSingleView();
    } else {
      // Multi-step capture for long pages
      return await this.captureMultipleViews(scrollSteps, viewportHeight, options);
    }
  }

  async captureSingleView() {
    // For single view, we'll rely on the popup to handle capture
    // This is a fallback method
    return {
      method: 'single',
      message: 'Use chrome.tabs.captureVisibleTab from popup'
    };
  }

  async captureMultipleViews(scrollSteps, viewportHeight, options) {
    const captures = [];
    
    for (let step = 0; step < scrollSteps; step++) {
      // Scroll to position
      const scrollY = step * viewportHeight;
      window.scrollTo(0, scrollY);
      
      // Wait for scroll and content to stabilize
      await this.sleep(200);
      
      // Mark this step for popup capture
      captures.push({
        step: step + 1,
        scrollY,
        isLast: step === scrollSteps - 1
      });
    }
    
    // Scroll back to top for final capture
    window.scrollTo(0, 0);
    await this.sleep(200);
    
    return {
      method: 'multiple',
      captures,
      totalSteps: scrollSteps,
      message: 'Multi-step capture data prepared'
    };
  }

  async waitForContent() {
    return new Promise((resolve) => {
      // Wait for images to load
      const images = document.querySelectorAll('img');
      let loadedCount = 0;
      const totalImages = images.length;
      
      if (totalImages === 0) {
        resolve();
        return;
      }
      
      const checkComplete = () => {
        loadedCount++;
        if (loadedCount >= totalImages) {
          resolve();
        }
      };
      
      images.forEach(img => {
        if (img.complete) {
          checkComplete();
        } else {
          img.addEventListener('load', checkComplete);
          img.addEventListener('error', checkComplete);
        }
      });
      
      // Timeout after 5 seconds
      setTimeout(resolve, 5000);
    });
  }

  getPageInfo() {
    return {
      title: document.title,
      url: window.location.href,
      dimensions: this.getPageDimensions(),
      readyState: document.readyState,
      imagesCount: document.querySelectorAll('img').length,
      hasScrollbars: {
        horizontal: document.body.scrollWidth > window.innerWidth,
        vertical: document.body.scrollHeight > window.innerHeight
      }
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  checkScreenshotMode() {
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('getVerticalSize') === 'true') {
      // Analysis mode - measure page dimensions
      this.showAnalysisModeIndicator();
      this.performDimensionAnalysis(urlParams.get('viewportWidth'));
    } else if (urlParams.get('screenshotMode') === 'true') {
      // Screenshot mode - prepare for capture
      this.showScreenshotModeIndicator();
      
      // Hide any unwanted elements during screenshot
      this.hideScreenshotModeElements();
      
      // Set viewport width if specified
      const viewportWidth = urlParams.get('viewportWidth');
      if (viewportWidth) {
        this.setViewportWidth(parseInt(viewportWidth));
      }
    }
  }

  showScreenshotModeIndicator() {
    // Create loading overlay
    const overlay = document.createElement('div');
    overlay.id = 'screenshot-mode-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white;
      pointer-events: none;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      text-align: center;
      background: rgba(255, 255, 255, 0.1);
      padding: 30px;
      border-radius: 12px;
      backdrop-filter: blur(10px);
    `;

    // Animated loading spinner
    const spinner = document.createElement('div');
    spinner.style.cssText = `
      width: 48px;
      height: 48px;
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-top: 4px solid #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    `;

    const text = document.createElement('div');
    text.innerHTML = `
      <h3 style="margin: 0 0 10px; font-size: 18px; font-weight: 600;">Screenshot Mode Active</h3>
      <p style="margin: 0; font-size: 14px; opacity: 0.9;">Please do not interact with this window</p>
      <p style="margin: 10px 0 0; font-size: 12px; opacity: 0.7;">Screenshot capture in progress...</p>
    `;

    // Add CSS for spinner animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    content.appendChild(spinner);
    content.appendChild(text);
    overlay.appendChild(content);
    document.body.appendChild(overlay);

    // Hide overlay after 3 seconds to allow screenshot capture
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 3000);
  }

  hideScreenshotModeElements() {
    // Hide common unwanted elements during screenshot
    const hideSelectors = [
      '[data-testid="cookie-banner"]',
      '.cookie-banner',
      '.gdpr-banner',
      '.notification-bar',
      '.floating-chat',
      '.live-chat',
      '[role="dialog"]',
      '.modal-backdrop',
      '.popup-overlay'
    ];

    hideSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        el.style.display = 'none';
      });
    });
  }

  setViewportWidth(targetWidth) {
    // This function helps ensure the page renders at the target width
    const currentWidth = window.innerWidth;
    
    if (Math.abs(currentWidth - targetWidth) > 50) {
      // Add a meta viewport tag if it doesn't exist
      let viewportMeta = document.querySelector('meta[name="viewport"]');
      if (!viewportMeta) {
        viewportMeta = document.createElement('meta');
        viewportMeta.name = 'viewport';
        document.head.appendChild(viewportMeta);
      }
      
      // Set viewport to target width
      viewportMeta.content = `width=${targetWidth}, initial-scale=1.0, user-scalable=no`;
    }
  }

  showAnalysisModeIndicator() {
    // Create analysis overlay
    const overlay = document.createElement('div');
    overlay.id = 'analysis-mode-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(59, 130, 246, 0.9);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white;
      pointer-events: none;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      text-align: center;
      background: rgba(255, 255, 255, 0.1);
      padding: 30px;
      border-radius: 12px;
      backdrop-filter: blur(10px);
    `;

    // Analysis spinner
    const spinner = document.createElement('div');
    spinner.style.cssText = `
      width: 48px;
      height: 48px;
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-top: 4px solid white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    `;

    const text = document.createElement('div');
    text.innerHTML = `
      <h3 style="margin: 0 0 10px; font-size: 18px; font-weight: 600;">Analyzing Website Page</h3>
      <p style="margin: 0; font-size: 14px; opacity: 0.9;">Measuring page dimensions for optimal capture</p>
      <p style="margin: 10px 0 0; font-size: 12px; opacity: 0.7;">This will only take a moment...</p>
    `;

    content.appendChild(spinner);
    content.appendChild(text);
    overlay.appendChild(content);
    document.body.appendChild(overlay);
  }

  performDimensionAnalysis(viewportWidth) {
    // Set viewport width first if specified
    if (viewportWidth) {
      this.setViewportWidth(parseInt(viewportWidth));
    }

    // Wait for page to fully load and render
    const startAnalysis = () => {
      // Force layout recalculation
      document.body.offsetHeight;
      
      // Get comprehensive page dimensions
      const body = document.body;
      const html = document.documentElement;
      
      // Wait a bit more for dynamic content
      setTimeout(() => {
        // Calculate all possible heights
        const heights = [
          body.scrollHeight,
          body.offsetHeight,
          html.scrollHeight,
          html.offsetHeight,
          html.clientHeight
        ];
        
        // Check all elements for maximum bounds
        let maxBottom = 0;
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
          try {
            const rect = el.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            maxBottom = Math.max(maxBottom, rect.bottom + scrollTop);
          } catch (e) {
            // Skip elements that can't be measured
          }
        });
        
        const totalHeight = Math.max(...heights, maxBottom, window.innerHeight);
        
        // Store dimensions globally for popup to access
        window.pageDimensions = {
          totalHeight,
          totalWidth: Math.max(
            body.scrollWidth,
            body.offsetWidth,
            html.scrollWidth,
            html.offsetWidth,
            html.clientWidth,
            window.innerWidth
          ),
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth,
          analysisComplete: true
        };
        
        // Mark analysis as complete
        window.dimensionAnalysisComplete = true;
        
        console.log('Dimension analysis complete:', window.pageDimensions);
        
        // Hide analysis overlay after a short delay
        setTimeout(() => {
          const overlay = document.getElementById('analysis-mode-overlay');
          if (overlay) {
            overlay.style.display = 'none';
          }
        }, 1000);
        
      }, 2000); // Give extra time for content to load
    };

    // Start analysis after page is ready
    if (document.readyState === 'complete') {
      startAnalysis();
    } else {
      window.addEventListener('load', startAnalysis);
    }
  }
}

// Initialize content script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new FullPageCapture();
  });
} else {
  new FullPageCapture();
}
