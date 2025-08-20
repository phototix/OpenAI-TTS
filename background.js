// Create context menu
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "readAloud",
        title: "Read Aloud",
        contexts: ["selection"]
    });
});

// Track injected tabs to avoid duplicate injections
const injectedTabs = new Set();

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "readAloud" && info.selectionText) {
        handleReadAloudRequest(tab, info.selectionText);
    }
});

async function handleReadAloudRequest(tab, text) {
    try {
        // First, try to stop any ongoing playback
        await chrome.tabs.sendMessage(tab.id, {
            action: "stopPlayback"
        }).catch(() => {
            // Ignore errors if content script isn't available
        });
        
        // Check if we've already injected into this tab
        if (!injectedTabs.has(tab.id)) {
            // Inject content script
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
            injectedTabs.add(tab.id);
            
            // Wait a bit for the content script to initialize
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Send message to content script
        await chrome.tabs.sendMessage(tab.id, {
            action: "readAloud",
            text: text
        });
        
    } catch (error) {
        console.error('Error handling read aloud request:', error);
        // If message fails, the content script might need to be reinjected
        injectedTabs.delete(tab.id);
    }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getSettings") {
        chrome.storage.sync.get(['apiKey', 'voice', 'model', 'instructions'], function(data) {
            sendResponse(data);
        });
        return true; // Will respond asynchronously
    }
});

// Clean up when tab is closed or updated
chrome.tabs.onRemoved.addListener((tabId) => {
    injectedTabs.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
        injectedTabs.delete(tabId);
    }
});

// Clean up when extension is reloaded
chrome.runtime.onSuspend.addListener(() => {
    // Send stop message to all tabs
    chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: "stopPlayback"
            }).catch(() => {
                // Ignore errors
            });
        });
    });
});