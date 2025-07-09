// Background service worker for the screenshot extension

chrome.runtime.onInstalled.addListener(() => {
  console.log('FullPage Screenshot Pro extension installed');
});

// Handle extension icon click when popup is not available
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // This will only trigger if popup fails to open
    console.log('Extension icon clicked for tab:', tab.id);
  } catch (error) {
    console.error('Error handling action click:', error);
  }
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureScreenshot') {
    handleScreenshotCapture(request, sender, sendResponse);
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'getTabInfo') {
    sendResponse({
      tabId: sender.tab?.id,
      url: sender.tab?.url,
      title: sender.tab?.title
    });
  }
});

async function handleScreenshotCapture(request, sender, sendResponse) {
  try {
    const { viewportWidth, options = {} } = request;
    const tabId = sender.tab?.id;
    
    if (!tabId) {
      throw new Error('No valid tab ID found');
    }

    // Inject capture script if needed
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['capture.js']
    });

    // Send capture command to content script
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'startCapture',
      viewportWidth,
      options
    });

    sendResponse({ success: true, data: response });
    
  } catch (error) {
    console.error('Screenshot capture error:', error);
    sendResponse({ 
      success: false, 
      error: error.message || 'Unknown error occurred' 
    });
  }
}

// Handle download completion events
chrome.downloads.onChanged.addListener((downloadDelta) => {
  if (downloadDelta.state && downloadDelta.state.current === 'complete') {
    console.log('Screenshot download completed:', downloadDelta.id);
  }
  
  if (downloadDelta.error) {
    console.error('Screenshot download error:', downloadDelta.error);
  }
});

// Clean up on extension unload
chrome.runtime.onSuspend.addListener(() => {
  console.log('Extension suspending - cleaning up');
});

// Error handling for unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection in background script:', event.reason);
});

// Utility function to validate tab permissions
async function validateTabPermissions(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    
    // Check if we can access this tab
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('about:')) {
      throw new Error('Cannot capture screenshots of browser internal pages');
    }
    
    return true;
  } catch (error) {
    throw new Error(`Tab access validation failed: ${error.message}`);
  }
}

// Extension context validation
function validateExtensionContext() {
  if (!chrome || !chrome.runtime) {
    throw new Error('Chrome extension context not available');
  }
  
  if (!chrome.tabs || !chrome.scripting || !chrome.downloads) {
    throw new Error('Required Chrome APIs not available');
  }
  
  return true;
}

// Initialize background script
try {
  validateExtensionContext();
  console.log('FullPage Screenshot Pro background script initialized');
} catch (error) {
  console.error('Background script initialization failed:', error);
}
