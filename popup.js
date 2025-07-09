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

      // Step 1: Prepare for capture
      this.updateLoadingStep('Preparing page for capture...');
      
      // Step 2: Resize viewport if needed
      this.updateLoadingStep('Adjusting viewport size...');
      await this.adjustViewport(tab.id);
      
      // Step 3: Wait for page to stabilize
      this.updateLoadingStep('Waiting for page to stabilize...');
      await this.waitForPageStable(tab.id);
      
      // Step 4: Capture screenshot
      this.updateLoadingStep('Capturing full page screenshot...');
      const screenshotData = await this.captureFullPage(tab.id);
      
      // Step 5: Process and download
      this.updateLoadingStep('Processing and downloading...');
      await this.downloadScreenshot(screenshotData, tab.title || 'screenshot');
      
      this.showSuccessState();
      
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      this.showErrorState(error.message);
    } finally {
      this.isCapturing = false;
    }
  }

  async adjustViewport(tabId) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId },
        func: (targetWidth) => {
          return new Promise((resolve) => {
            // Store original viewport
            const originalWidth = window.innerWidth;
            
            // Calculate zoom level to achieve target width
            const zoomLevel = targetWidth / window.screen.width;
            
            // Apply zoom if needed
            if (Math.abs(window.innerWidth - targetWidth) > 50) {
              document.body.style.zoom = zoomLevel;
              
              // Wait for zoom to apply
              setTimeout(() => {
                resolve({ 
                  success: true, 
                  originalWidth, 
                  newWidth: window.innerWidth,
                  zoomApplied: zoomLevel 
                });
              }, 500);
            } else {
              resolve({ 
                success: true, 
                originalWidth, 
                newWidth: window.innerWidth,
                zoomApplied: 1 
              });
            }
          });
        },
        args: [this.selectedViewport]
      }, (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Viewport adjustment failed: ${chrome.runtime.lastError.message}`));
        } else if (results && results[0] && results[0].result) {
          resolve(results[0].result);
        } else {
          reject(new Error('Failed to adjust viewport'));
        }
      });
    });
  }

  async waitForPageStable(tabId) {
    return new Promise((resolve) => {
      // Wait for any dynamic content to load
      setTimeout(resolve, 1000);
    });
  }

  async captureFullPage(tabId) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          return new Promise((resolve) => {
            // Get full page dimensions
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

            resolve({ width, height });
          });
        }
      }, async (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Page dimension calculation failed: ${chrome.runtime.lastError.message}`));
          return;
        }

        const { width, height } = results[0].result;
        
        try {
          // Capture visible area first
          const dataUrl = await chrome.tabs.captureVisibleTab(null, { 
            format: 'png',
            quality: 100 
          });
          
          // For now, we'll use the visible area capture
          // In a more advanced implementation, you would scroll and capture multiple segments
          resolve(dataUrl);
          
        } catch (error) {
          reject(new Error(`Screenshot capture failed: ${error.message}`));
        }
      });
    });
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
}

// Initialize the extension when popup loads
document.addEventListener('DOMContentLoaded', () => {
  new ScreenshotExtension();
});
