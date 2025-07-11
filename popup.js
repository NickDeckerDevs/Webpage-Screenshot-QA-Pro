class ScreenshotExtension {
  constructor() {
    this.selectedViewport = 1440; // Default viewport width
    this.isCapturing = false;
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadSavedSettings();
  }

  bindEvents() {
    // Viewport selection buttons
    document.querySelectorAll('.viewport-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (this.isCapturing) return;
        
        this.selectViewport(parseInt(e.currentTarget.dataset.width));
      });
    });

    // Capture button
    document.getElementById('captureBtn').addEventListener('click', () => {
      if (!this.isCapturing) {
        this.startCapture();
      }
    });

    // Retry and new capture buttons
    document.getElementById('retryBtn').addEventListener('click', () => {
      this.resetToSelection();
    });

    document.getElementById('newCaptureBtn').addEventListener('click', () => {
      this.resetToSelection();
    });
  }

  selectViewport(width) {
    this.selectedViewport = width;
    
    // Update UI
    document.querySelectorAll('.viewport-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    
    document.querySelector(`[data-width="${width}"]`).classList.add('active');
    
    // Save selection
    chrome.storage.local.set({ selectedViewport: width });
  }

  async loadSavedSettings() {
    try {
      const result = await chrome.storage.local.get(['selectedViewport']);
      if (result.selectedViewport) {
        this.selectViewport(result.selectedViewport);
      }
    } catch (error) {
      console.log('No saved settings found');
    }
  }

  async startCapture() {
    this.isCapturing = true;
    this.showLoadingState();

    try {
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('No active tab found');
      }

      // Step 1: Create new window with target viewport size
      this.updateLoadingStep('Creating capture window...');
      const captureWindow = await this.createCaptureWindow(tab.url);
      
      // Step 2: Wait for page to load in new window
      this.updateLoadingStep('Loading page in capture window...');
      await this.waitForPageLoad(captureWindow.tabs[0].id);
      
      // Step 3: Capture full page with scroll and stitch
      this.updateLoadingStep('Capturing full page screenshot...');
      const screenshotData = await this.captureFullPageScrollStitch(captureWindow.tabs[0].id);
      
      // Step 4: Process and download
      this.updateLoadingStep('Processing and downloading...');
      await this.downloadScreenshot(screenshotData, tab.title || 'screenshot');
      
      // Step 5: Close capture window
      await chrome.windows.remove(captureWindow.id);
      
      this.showSuccessState();
      
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      this.showErrorState(error.message);
    } finally {
      this.isCapturing = false;
    }
  }

  async createCaptureWindow(url) {
    // Add screenshot mode parameter to URL
    const captureUrl = new URL(url);
    captureUrl.searchParams.set('screenshotMode', 'true');
    captureUrl.searchParams.set('viewportWidth', this.selectedViewport);
    
    // Create new window with exact viewport dimensions
    // Add extra space for browser chrome (approximately 80px for address bar, etc.)
    const windowWidth = this.selectedViewport + 20; // Small padding for scrollbars
    const windowHeight = 800; // Reasonable initial height
    
    return await chrome.windows.create({
      url: captureUrl.toString(),
      type: 'normal',
      width: windowWidth,
      height: windowHeight,
      focused: false // Don't steal focus from current window
    });
  }

  async waitForPageLoad(tabId) {
    return new Promise((resolve) => {
      const checkComplete = () => {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            resolve(); // Tab might be closed
            return;
          }
          
          if (tab.status === 'complete') {
            // Additional wait for dynamic content
            setTimeout(resolve, 2000);
          } else {
            setTimeout(checkComplete, 500);
          }
        });
      };
      
      checkComplete();
    });
  }

  async captureFullPageScrollStitch(tabId) {
    // First, scroll to top to ensure consistent starting point
    await this.scrollToPosition(tabId, 0);
    await this.sleep(500);
    
    // Get page dimensions
    const dimensions = await this.getPageDimensions(tabId);
    const { totalHeight, viewportHeight } = dimensions;
    
    console.log('Page dimensions:', dimensions);
    
    // Calculate number of scroll steps needed with some overlap to avoid gaps
    const overlap = Math.floor(viewportHeight * 0.1); // 10% overlap
    const effectiveScrollHeight = viewportHeight - overlap;
    const scrollSteps = Math.max(1, Math.ceil((totalHeight - viewportHeight) / effectiveScrollHeight) + 1);
    
    console.log(`Will capture ${scrollSteps} sections with ${overlap}px overlap`);
    
    if (scrollSteps <= 1) {
      // Single viewport capture
      return await chrome.tabs.captureVisibleTab(null, { 
        format: 'png',
        quality: 100 
      });
    }
    
    // Multiple viewport captures with stitching
    const captures = [];
    
    for (let step = 0; step < scrollSteps; step++) {
      this.updateLoadingStep(`Capturing section ${step + 1} of ${scrollSteps}...`);
      
      // Calculate scroll position
      let scrollY;
      if (step === 0) {
        scrollY = 0;
      } else if (step === scrollSteps - 1) {
        // Last capture - scroll to show the bottom of the page
        scrollY = Math.max(0, totalHeight - viewportHeight);
      } else {
        scrollY = step * effectiveScrollHeight;
      }
      
      console.log(`Step ${step + 1}: scrolling to ${scrollY}`);
      
      // Scroll to position
      await this.scrollToPosition(tabId, scrollY);
      
      // Wait for scroll to complete and content to stabilize
      await this.sleep(800);
      
      // Capture this section
      const sectionCapture = await chrome.tabs.captureVisibleTab(null, { 
        format: 'png',
        quality: 100 
      });
      
      captures.push({
        dataUrl: sectionCapture,
        step,
        scrollY
      });
    }
    
    // Scroll back to top
    await this.scrollToPosition(tabId, 0);
    
    // Stitch all captures together
    this.updateLoadingStep('Stitching screenshots together...');
    return await this.stitchScreenshots(captures, dimensions);
  }

  async downloadScreenshot(dataUrl, title) {
    return new Promise((resolve, reject) => {
      // Convert PNG to JPG
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Fill white background for JPG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw image
        ctx.drawImage(img, 0, 0);
        
        // Convert to JPG
        const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.95);
        
        // Create filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedTitle = title.replace(/[^\w\s-]/g, '').substring(0, 50);
        const filename = `screenshot-${sanitizedTitle}-${this.selectedViewport}px-${timestamp}.jpg`;
        
        // Download file
        chrome.downloads.download({
          url: jpgDataUrl,
          filename: filename,
          saveAs: false
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Download failed: ${chrome.runtime.lastError.message}`));
          } else {
            resolve(downloadId);
          }
        });
      };
      
      img.onerror = () => {
        reject(new Error('Failed to process screenshot image'));
      };
      
      img.src = dataUrl;
    });
  }

  showLoadingState() {
    document.getElementById('viewportSelection').classList.add('hidden');
    document.getElementById('successState').classList.add('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('loadingState').classList.remove('hidden');
  }

  showSuccessState() {
    document.getElementById('viewportSelection').classList.add('hidden');
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('successState').classList.remove('hidden');
  }

  showErrorState(message) {
    document.getElementById('viewportSelection').classList.add('hidden');
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('successState').classList.add('hidden');
    document.getElementById('errorState').classList.remove('hidden');
    document.getElementById('errorMessage').textContent = message;
  }

  resetToSelection() {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('successState').classList.add('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('viewportSelection').classList.remove('hidden');
  }

  updateLoadingStep(step) {
    document.getElementById('loadingStep').textContent = step;
  }

  async getPageDimensions(tabId) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Wait for page to fully load and measure
          const measureDimensions = () => {
            const body = document.body;
            const html = document.documentElement;
            
            // Force a layout calculation
            body.offsetHeight;
            
            // Get all possible height measurements
            const heights = [
              body.scrollHeight,
              body.offsetHeight,
              html.scrollHeight,
              html.offsetHeight,
              html.clientHeight
            ];
            
            const widths = [
              body.scrollWidth,
              body.offsetWidth,
              html.scrollWidth,
              html.offsetWidth,
              html.clientWidth
            ];
            
            // Also check for any absolutely positioned elements that might extend beyond
            const allElements = document.querySelectorAll('*');
            let maxBottom = 0;
            let maxRight = 0;
            
            allElements.forEach(el => {
              const rect = el.getBoundingClientRect();
              const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
              const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
              
              maxBottom = Math.max(maxBottom, rect.bottom + scrollTop);
              maxRight = Math.max(maxRight, rect.right + scrollLeft);
            });
            
            return {
              totalHeight: Math.max(...heights, maxBottom, window.innerHeight),
              totalWidth: Math.max(...widths, maxRight, window.innerWidth),
              viewportHeight: window.innerHeight,
              viewportWidth: window.innerWidth,
              debug: {
                bodyScrollHeight: body.scrollHeight,
                htmlScrollHeight: html.scrollHeight,
                maxElementBottom: maxBottom,
                calculatedHeights: heights
              }
            };
          };
          
          // Wait a bit for dynamic content to load
          return new Promise(resolve => {
            setTimeout(() => {
              resolve(measureDimensions());
            }, 1000);
          });
        }
      }, (results) => {
        if (chrome.runtime.lastError || !results || !results[0]) {
          reject(new Error('Failed to get page dimensions'));
        } else {
          console.log('Page dimensions:', results[0].result);
          resolve(results[0].result);
        }
      });
    });
  }

  async scrollToPosition(tabId, scrollY) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId },
        func: (targetY) => {
          // Use smooth scroll behavior for better content loading
          window.scrollTo({
            top: targetY,
            left: 0,
            behavior: 'auto'
          });
          
          // Force a layout recalculation
          document.body.offsetHeight;
          
          // Return actual scroll position after scrolling
          return {
            requestedY: targetY,
            actualY: window.scrollY,
            maxScrollY: document.documentElement.scrollHeight - window.innerHeight
          };
        },
        args: [scrollY]
      }, (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error('Failed to scroll to position'));
        } else {
          console.log('Scroll result:', results[0].result);
          resolve(results[0].result);
        }
      });
    });
  }

  async stitchScreenshots(captures, dimensions) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Set canvas size to full page dimensions
      canvas.width = dimensions.viewportWidth;
      canvas.height = dimensions.totalHeight;
      
      console.log(`Creating canvas: ${canvas.width}x${canvas.height} for ${captures.length} captures`);
      
      // Fill with white background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      let loadedImages = 0;
      const totalImages = captures.length;
      
      if (totalImages === 0) {
        reject(new Error('No captures to stitch'));
        return;
      }
      
      captures.forEach((capture, index) => {
        const img = new Image();
        img.onload = () => {
          // Calculate position - be more careful about overlaps
          let yPosition = capture.scrollY;
          
          // For the last capture, make sure it fits within canvas bounds
          if (index === captures.length - 1) {
            yPosition = Math.min(yPosition, dimensions.totalHeight - img.height);
          }
          
          console.log(`Drawing capture ${index + 1} at position y=${yPosition}, image size: ${img.width}x${img.height}`);
          
          // Draw the image
          ctx.drawImage(img, 0, yPosition);
          
          loadedImages++;
          if (loadedImages === totalImages) {
            // All images loaded and drawn
            console.log('All captures stitched, converting to data URL');
            const finalDataUrl = canvas.toDataURL('image/png', 1.0);
            resolve(finalDataUrl);
          }
        };
        
        img.onerror = () => {
          console.error(`Failed to load capture ${index + 1}`);
          reject(new Error(`Failed to load screenshot section ${index + 1}`));
        };
        
        img.src = capture.dataUrl;
      });
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize the extension when popup loads
document.addEventListener('DOMContentLoaded', () => {
  new ScreenshotExtension();
});
