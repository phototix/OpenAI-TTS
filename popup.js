document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('read').addEventListener('click', function() {
    // Query the active tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      // First stop any ongoing playback
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "stopPlayback"
      }).catch(() => {
        // Ignore errors if content script isn't available
      });
      
      // Execute script to get selected text
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        function: getSelectedText
      }, (results) => {
        if (results && results[0] && results[0].result) {
          // Send message to content script to read the text
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "readAloud",
            text: results[0].result
          }).catch(error => {
            console.error('Error sending message:', error);
            alert('Error: Could not communicate with content script. Please refresh the page and try again.');
          });
        } else {
          alert('No text selected. Please select some text to read aloud.');
        }
      });
    });
  });
  
  document.getElementById('options').addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
  });
});

function getSelectedText() {
  return window.getSelection().toString();
}