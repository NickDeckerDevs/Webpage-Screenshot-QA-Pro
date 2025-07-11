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

      // Step 1: Create analysis window to measure page height
      this.updateLoadingStep('Analyzing website page...');
      const analysisWindow = await this.createAnalysisWindow(tab.url);
      
      // Step 2: Wait for analysis to complete and get dimensions
      this.updateLoadingStep('Measuring page dimensions...');
      const pageDimensions = await this.waitForDimensionAnalysis(analysisWindow.tabs[0].id);
      
      // Step 3: Log analysis results and keep window open for debugging
      console.log('📐 ANALYSIS COMPLETE - Page Dimensions:', pageDimensions);
      console.log('📐 Analysis window will remain open for debugging');
      
      // Step 4: Create capture window with exact dimensions
      this.updateLoadingStep('Creating capture window...');
      const captureWindow = await this.createCaptureWindow(tab.url, pageDimensions);
      
      // Step 5: Wait for page to load completely
      this.updateLoadingStep('Loading page in capture window...');
      await this.waitForPageLoad(captureWindow.tabs[0].id);
      
      // Step 6: Take single screenshot of entire viewport
      this.updateLoadingStep('Capturing full page screenshot...');
      const screenshotData = await chrome.tabs.captureVisibleTab(captureWindow.id, { 
        format: 'png',
        quality: 100 
      });
      
      // Step 7: Process and download
      this.updateLoadingStep('Processing and downloading...');
      await this.downloadScreenshot(screenshotData, tab.title || 'screenshot');
      
      // Step 8: Keep capture window open for debugging
      console.log('📸 CAPTURE COMPLETE - Both windows left open for manual inspection');
      
      this.showSuccessState();
      
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      this.showErrorState(error.message);
    } finally {
      this.isCapturing = false;
    }
  }

  async createAnalysisWindow(url) {
    // Add analysis mode parameter to URL
    const analysisUrl = new URL(url);
    analysisUrl.searchParams.set('getVerticalSize', 'true');
    
    // Create window with selected viewport width and standard height for analysis
    // Ensure values are integers for Chrome API
    const windowWidth = parseInt(this.selectedViewport);
    const windowHeight = 1200; // Always 1200px for analysis
    
    console.log('🔍 CREATING ANALYSIS WINDOW:');
    console.log('  - URL:', analysisUrl.toString());
    console.log('  - Selected viewport width:', this.selectedViewport);
    console.log('  - Window dimensions:', `${windowWidth}x${windowHeight}`);
    console.log('  - Data types:', `width: ${typeof windowWidth}, height: ${typeof windowHeight}`);
    
    const window = await chrome.windows.create({
      url: analysisUrl.toString(),
      type: 'normal',
      width: windowWidth,
      height: windowHeight,
      focused: false // Don't steal focus from current window
    });
    
    console.log('🔍 Analysis window created:', window);
    return window;
  }

  async createCaptureWindow(url, dimensions) {
    // Add screenshot mode parameter to URL
    const captureUrl = new URL(url);
    captureUrl.searchParams.set('screenshotMode', 'true');
    
    // Create window with exact dimensions: selected width × analyzed height
    // Ensure values are integers for Chrome API
    const windowWidth = parseInt(this.selectedViewport);
    const windowHeight = parseInt(dimensions.totalHeight);
    
    console.log('📸 CREATING CAPTURE WINDOW:');
    console.log('  - URL:', captureUrl.toString());
    console.log('  - Page dimensions from analysis:', dimensions);
    console.log('  - Selected viewport width:', this.selectedViewport);
    console.log('  - Analyzed page height:', dimensions.totalHeight);
    console.log('  - Final window dimensions:', `${windowWidth}x${windowHeight}`);
    console.log('  - Data types:', `width: ${typeof windowWidth}, height: ${typeof windowHeight}`);
    
    const window = await chrome.windows.create({
      url: captureUrl.toString(),
      type: 'normal',
      width: windowWidth,
      height: windowHeight,
      focused: false // Don't steal focus from current window
    });
    
    console.log('📸 Capture window created:', window);
    return window;
  }

  async waitForDimensionAnalysis(tabId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Dimension analysis timeout'));
      }, 15000); // 15 second timeout

      const checkForDimensions = () => {
        chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            // Check if analysis is complete
            return window.dimensionAnalysisComplete || false;
          }
        }, (results) => {
          if (chrome.runtime.lastError || !results || !results[0]) {
            setTimeout(checkForDimensions, 500);
            return;
          }

          if (results[0].result) {
            // Analysis complete, get dimensions
            chrome.scripting.executeScript({
              target: { tabId },
              func: () => window.pageDimensions
            }, (dimensionResults) => {
              clearTimeout(timeout);
              if (dimensionResults && dimensionResults[0] && dimensionResults[0].result) {
                console.log('✅ Successfully retrieved dimensions from analysis window:', dimensionResults[0].result);
                resolve(dimensionResults[0].result);
              } else {
                console.error('❌ Failed to retrieve dimensions from analysis window');
                reject(new Error('Failed to get page dimensions'));
              }
            });
          } else {
            console.log('⏳ Analysis still in progress, checking again...');
            setTimeout(checkForDimensions, 500);
          }
        });
      };

      // Start checking after initial load
      setTimeout(checkForDimensions, 1000);
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
