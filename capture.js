// Advanced capture utilities for FullPage Screenshot Pro

class AdvancedCapture {
  constructor() {
    this.canvas = null;
    this.context = null;
    this.devicePixelRatio = window.devicePixelRatio || 1;
  }

  // Create a full page screenshot using HTML5 Canvas and dom-to-image techniques
  async capturePageAsImage(options = {}) {
    const {
      quality = 0.95,
      format = 'jpeg',
      backgroundColor = '#ffffff',
      scale = 1
    } = options;

    try {
      // Get page dimensions
      const dimensions = this.getFullPageDimensions();
      
      // Create canvas
      this.createCanvas(dimensions, scale);
      
      // Render page content to canvas
      await this.renderPageToCanvas(backgroundColor);
      
      // Convert to desired format
      return this.canvasToDataURL(format, quality);
      
    } catch (error) {
      throw new Error(`Advanced capture failed: ${error.message}`);
    }
  }

  getFullPageDimensions() {
    const body = document.body;
    const html = document.documentElement;
    
    return {
      width: Math.max(
        body.scrollWidth,
        body.offsetWidth,
        html.clientWidth,
        html.scrollWidth,
        html.offsetWidth
      ),
      height: Math.max(
        body.scrollHeight,
        body.offsetHeight,
        html.clientHeight,
        html.scrollHeight,
        html.offsetHeight
      ),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  }

  createCanvas(dimensions, scale) {
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    
    // Set canvas size
    this.canvas.width = dimensions.width * scale * this.devicePixelRatio;
    this.canvas.height = dimensions.height * scale * this.devicePixelRatio;
    
    // Scale context for high DPI
    this.context.scale(scale * this.devicePixelRatio, scale * this.devicePixelRatio);
    
    // Set high quality rendering
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = 'high';
  }

  async renderPageToCanvas(backgroundColor) {
    // Fill background
    this.context.fillStyle = backgroundColor;
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // This is a simplified version - in a full implementation,
    // you would need to walk the DOM tree and render each element
    // For now, we'll use a fallback approach
    
    try {
      // Try to use html2canvas if available (would need to be injected)
      if (window.html2canvas) {
        const canvasFromHtml2Canvas = await window.html2canvas(document.body, {
          height: this.canvas.height / this.devicePixelRatio,
          width: this.canvas.width / this.devicePixelRatio,
          useCORS: true,
          backgroundColor: backgroundColor,
          scale: 1
        });
        
        this.context.drawImage(canvasFromHtml2Canvas, 0, 0);
        return;
      }
    } catch (error) {
      console.warn('html2canvas not available, using fallback method');
    }
    
    // Fallback: render basic page structure
    await this.renderBasicPageStructure();
  }

  async renderBasicPageStructure() {
    // This is a basic fallback that renders some page information
    // In a production version, you'd want a more sophisticated DOM-to-canvas renderer
    
    this.context.fillStyle = '#333333';
    this.context.font = '24px Arial, sans-serif';
    this.context.fillText('Page Screenshot', 50, 50);
    
    this.context.font = '16px Arial, sans-serif';
    this.context.fillText(`URL: ${window.location.href}`, 50, 100);
    this.context.fillText(`Title: ${document.title}`, 50, 130);
    this.context.fillText(`Dimensions: ${this.canvas.width}x${this.canvas.height}`, 50, 160);
    this.context.fillText('Note: This is a fallback render. Full DOM rendering requires additional libraries.', 50, 190);
  }

  canvasToDataURL(format, quality) {
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    return this.canvas.toDataURL(mimeType, quality);
  }

  // Utility method to inject html2canvas library
  static async injectHtml2Canvas() {
    return new Promise((resolve, reject) => {
      if (window.html2canvas) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load html2canvas'));
      document.head.appendChild(script);
    });
  }

  // Clean up resources
  destroy() {
    if (this.canvas) {
      this.canvas = null;
      this.context = null;
    }
  }
}

// Scroll-based capture for very long pages
class ScrollCapture {
  constructor() {
    this.captures = [];
    this.originalScrollPosition = { x: 0, y: 0 };
  }

  async captureByScrolling(viewportHeight, totalHeight) {
    this.originalScrollPosition = {
      x: window.scrollX,
      y: window.scrollY
    };

    const scrollSteps = Math.ceil(totalHeight / viewportHeight);
    this.captures = [];

    for (let step = 0; step < scrollSteps; step++) {
      const scrollY = step * viewportHeight;
      
      // Scroll to position
      window.scrollTo(0, scrollY);
      
      // Wait for content to stabilize
      await this.sleep(300);
      
      // Capture this viewport
      // Note: actual capture would need to be done via chrome.tabs.captureVisibleTab
      // from the extension context, not from content script
      this.captures.push({
        step,
        scrollY,
        timestamp: Date.now()
      });
    }

    // Restore original scroll position
    window.scrollTo(this.originalScrollPosition.x, this.originalScrollPosition.y);
    
    return this.captures;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export for use in content script
window.AdvancedCapture = AdvancedCapture;
window.ScrollCapture = ScrollCapture;
