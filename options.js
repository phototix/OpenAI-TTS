document.addEventListener('DOMContentLoaded', function() {
  // Load saved settings
  chrome.storage.sync.get(['apiKey', 'voice', 'model', 'instructions'], function(data) {
    if (data.apiKey) document.getElementById('apiKey').value = data.apiKey;
    if (data.voice) document.getElementById('voice').value = data.voice;
    if (data.model) document.getElementById('model').value = data.model;
    if (data.instructions) document.getElementById('instructions').value = data.instructions;
  });

  // Save settings
  document.getElementById('save').addEventListener('click', function() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const voice = document.getElementById('voice').value;
    const model = document.getElementById('model').value;
    const instructions = document.getElementById('instructions').value.trim();
    
    if (!apiKey) {
      showStatus('API key is required', 'error');
      return;
    }
    
    chrome.storage.sync.set({
      apiKey: apiKey,
      voice: voice,
      model: model,
      instructions: instructions
    }, function() {
      showStatus('Settings saved successfully!', 'success');
    });
  });
  
  function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'status ' + type;
    status.style.display = 'block';
    
    setTimeout(function() {
      status.style.display = 'none';
    }, 3000);
  }
});