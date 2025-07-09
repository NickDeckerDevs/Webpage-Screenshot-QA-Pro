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
}

// Initialize content script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new FullPageCapture();
  });
} else {
  new FullPageCapture();
}
