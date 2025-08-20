// Use an IIFE to create a private scope and avoid redeclaration errors
(function() {
    // Check if our global object already exists
    if (window.openAITTS) {
        // If it exists, clean up previous instance
        window.openAITTS.stopPlayback();
        delete window.openAITTS;
    }
    
    // Create our global namespace
    window.openAITTS = {
        // State variables
        audioInstance: null,
        isPlaying: false,
        currentSentences: [],
        currentSentenceIndex: 0,
        currentSettings: null,
        isManualAdvance: false,
        
        // Methods
        readAloud: async function(text) {
            this.stopPlayback();
            
            // Get settings from storage
            this.currentSettings = await new Promise(resolve => {
                chrome.runtime.sendMessage({action: "getSettings"}, resolve);
            });
            
            if (!this.currentSettings.apiKey) {
                alert('Please configure the OpenAI API settings in the extension options.');
                chrome.runtime.openOptionsPage();
                return;
            }
            
            // Split text into sentences using multiple punctuation marks
            this.currentSentences = this.splitIntoSentences(text);
            
            if (this.currentSentences.length === 0) {
                alert('No valid sentences found in the selected text.');
                return;
            }
            
            // Show popup
            this.showPopup();
            
            // Start playback from the beginning
            console.log('Starting playback for text:', text);
            this.currentSentenceIndex = 0;
            this.isPlaying = true;
            this.isManualAdvance = false;
            this.playAllSentences();
        },
        
        // Enhanced sentence splitting function
        splitIntoSentences: function(text) {
            // Trim and clean the text
            text = text.trim().replace(/\s+/g, ' ');
            
            if (!text) return [];
            
            // Regex to split on sentence endings: .!?。！？ (including Chinese punctuation)
            const sentenceRegex = /[^.!?。！？]+[.!?。！？]+/g;
            const sentences = text.match(sentenceRegex);
            
            if (!sentences) {
                // If no sentence endings found, treat the whole text as one sentence
                return [text];
            }
            
            // Clean up sentences (remove empty ones, trim whitespace)
            return sentences
                .map(sentence => sentence.trim())
                .filter(sentence => sentence.length > 0);
        },
        
        playAllSentences: async function() {
            while (this.isPlaying && this.currentSentenceIndex < this.currentSentences.length) {
                const sentence = this.currentSentences[this.currentSentenceIndex];
                console.log(`Playing sentence ${this.currentSentenceIndex + 1} of ${this.currentSentences.length}`);
                
                this.updatePopup(sentence, this.currentSentenceIndex + 1, this.currentSentences.length);
                
                try {
                    // Play current sentence and wait for it to complete
                    await this.playAudio(sentence);
                    
                    // Move to next sentence only after current one finishes
                    this.currentSentenceIndex++;
                    
                } catch (error) {
                    console.error('Error playing audio:', error);
                    this.hidePopup();
                    alert('Error: ' + error.message);
                    this.isPlaying = false;
                    break;
                }
            }
            
            // Playback completed - all sentences done or stopped
            if (this.currentSentenceIndex >= this.currentSentences.length) {
                console.log('All sentences completed');
                this.hidePopup();
            }
        },
        
        playAudio: function(text, newIndex = 0) {
            return new Promise((resolve, reject) => {
                // Clean up any existing audio first
                this.cleanupAudio();

                const url = 'https://api.openai.com/v1/audio/speech';
                
                const headers = {
                    'Authorization': `Bearer ${this.currentSettings.apiKey}`,
                    'Content-Type': 'application/json'
                };
                
                // Prepare request data for OpenAI TTS
                const data = {
                    model: this.currentSettings.model || 'tts-1',
                    input: text,
                    voice: this.currentSettings.voice || 'alloy'
                };
                
                // Add instructions if provided
                if (this.currentSettings.instructions) {
                    data.instructions = this.currentSettings.instructions;
                }
                
                fetch(url, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(data)
                })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(errorData => {
                            throw new Error(`API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
                        });
                    }
                    return response.blob();
                })
                .then(blob => {
                    // Clean up any previous audio before creating new one
                    this.cleanupAudio();
                    
                    const audioUrl = URL.createObjectURL(blob);
                    this.audioInstance = new Audio(audioUrl);
                    
                    // Store the URL to revoke it later
                    this.audioInstance._audioUrl = audioUrl;
                    
                    const indexRealNumber = newIndex + 1;
                    const sentence = this.currentSentences[newIndex + 1];

                    // Set up event listeners
                    const onEnded = () => {
                        console.log('Audio playback ended');
                        console.log('Current sentence index:', newIndex);
                        console.log('Current sentence:', indexRealNumber);
                        console.log('Total sentences:', this.currentSentences.length);
                        if(indexRealNumber == this.currentSentences.length) {
                            this.cleanupAudio();
                            resolve();
                            this.hidePopup();
                        }else if (this.currentSentenceIndex < this.currentSentences.length) {
                            this.updatePopup(sentence, indexRealNumber + 1, this.currentSentences.length);
                            this.playAudio(sentence, newIndex + 1);
                        }else{
                            this.cleanupAudio();
                            resolve();
                            this.hidePopup();
                        }
                    };
                    
                    const onError = (error) => {
                        console.error('Audio error:', error);
                        this.cleanupAudio();
                        reject(error);
                    };
                    
                    const onPlay = () => {
                        this.isPlaying = true;
                        this.updateControlButtons();
                    };
                    
                    const onPause = () => {
                        this.isPlaying = false;
                        this.updateControlButtons();
                    };
                    
                    // Add event listeners
                    this.audioInstance.addEventListener('ended', onEnded);
                    this.audioInstance.addEventListener('error', onError);
                    this.audioInstance.addEventListener('play', onPlay);
                    this.audioInstance.addEventListener('pause', onPause);
                    
                    // Store references for cleanup
                    this.audioInstance._eventListeners = {
                        ended: onEnded,
                        error: onError,
                        play: onPlay,
                        pause: onPause
                    };
                    
                    // Play the audio
                    this.audioInstance.play().catch(error => {
                        console.error('Play error:', error);
                        this.cleanupAudio();
                        reject(error);
                    });
                })
                .catch(error => {
                    this.cleanupAudio();
                    reject(error);
                });
            });
        },
        
        skipToNextSentence: function() {
            console.log('Skipping to next sentence');
            if (this.audioInstance) {
                this.isManualAdvance = true;
                this.cleanupAudio();
                this.currentSentenceIndex++;
                
                // If there are more sentences, continue playing
                if (this.currentSentenceIndex < this.currentSentences.length) {
                    this.playAllSentences();
                } else {
                    // No more sentences
                    this.hidePopup();
                }
            }
        },
        
        cleanupAudio: function() {
            if (this.audioInstance) {
                // Remove event listeners
                if (this.audioInstance._eventListeners) {
                    this.audioInstance.removeEventListener('ended', this.audioInstance._eventListeners.ended);
                    this.audioInstance.removeEventListener('error', this.audioInstance._eventListeners.error);
                    this.audioInstance.removeEventListener('play', this.audioInstance._eventListeners.play);
                    this.audioInstance.removeEventListener('pause', this.audioInstance._eventListeners.pause);
                }
                
                // Stop playback
                this.audioInstance.pause();
                
                // Revoke object URL if it exists
                if (this.audioInstance._audioUrl) {
                    URL.revokeObjectURL(this.audioInstance._audioUrl);
                }
                
                this.audioInstance = null;
            }
        },
        
        stopPlayback: function() {
            this.isPlaying = false;
            this.cleanupAudio();
            this.currentSentences = [];
            this.currentSentenceIndex = 0;
            this.currentSettings = null;
            this.hidePopup();
        },
        
        togglePause: function() {
            if (this.audioInstance) {
                if (this.audioInstance.paused) {
                    this.audioInstance.play().catch(error => {
                        console.error('Resume error:', error);
                    });
                } else {
                    this.audioInstance.pause();
                }
            }
        },
        
        updateControlButtons: function() {
            const pauseButton = document.getElementById('tts-pause');
            const nextButton = document.getElementById('tts-next');
            
            if (pauseButton && this.audioInstance) {
                pauseButton.textContent = this.audioInstance.paused ? 'Resume' : 'Pause';
            }
            
            if (nextButton) {
                // Enable next button only if there are more sentences
                nextButton.disabled = this.currentSentenceIndex >= this.currentSentences.length - 1;
                nextButton.style.opacity = nextButton.disabled ? '0.6' : '1';
                nextButton.style.cursor = nextButton.disabled ? 'not-allowed' : 'pointer';
            }
        },
        
        showPopup: function() {
            // Remove existing popup if any
            const existingPopup = document.getElementById('tts-popup');
            if (existingPopup) {
                existingPopup.remove();
            }
            
            // Create popup
            const popup = document.createElement('div');
            popup.id = 'tts-popup';
            popup.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                width: 380px;
                background: white;
                border: 1px solid #ccc;
                border-radius: 8px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                padding: 15px;
                z-index: 10000;
                font-family: Arial, sans-serif;
                max-height: 400px;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            `;
            
            // Show current settings in popup
            const voiceDisplay = this.getVoiceName(this.currentSettings.voice || 'alloy');
            const modelDisplay = this.getModelName(this.currentSettings.model || 'tts-1');
            
            popup.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0; color: #10a37f;">OpenAI TTS</h3>
                    <span style="font-size: 12px; color: #666; background: #f0f9ff; padding: 2px 8px; border-radius: 12px;">
                        ${modelDisplay}
                    </span>
                </div>
                <div style="margin-bottom: 10px; font-size: 12px; color: #4b5563;">
                    Voice: ${voiceDisplay}
                </div>
                <div id="tts-progress" style="margin-bottom: 10px; font-size: 14px; color: #4a5568;"></div>
                <div id="tts-text" style="flex: 1; overflow-y: auto; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; color:black; background: #f7fafc; font-size: 14px; line-height: 1.5; max-height: 200px;"></div>
                <div style="margin-top: 15px; display: flex; gap: 8px;">
                    <button id="tts-pause" style="flex: 1; padding: 8px; background: #10a37f; color: white; border: none; border-radius: 4px; cursor: pointer;">Pause</button>
                    <button id="tts-next" style="flex: 1; padding: 8px; background: #f59e0b; color: white; border: none; border-radius: 4px; cursor: pointer;">Next Sentence</button>
                    <button id="tts-stop" style="flex: 1; padding: 8px; background: #e53e3e; color: white; border: none; border-radius: 4px; cursor: pointer;">Stop</button>
                </div>
            `;
            
            document.body.appendChild(popup);
            
            // Add button functionality with proper event listener cleanup
            const stopButton = document.getElementById('tts-stop');
            const pauseButton = document.getElementById('tts-pause');
            const nextButton = document.getElementById('tts-next');
            
            // Remove any existing listeners
            const newStopButton = stopButton.cloneNode(true);
            const newPauseButton = pauseButton.cloneNode(true);
            const newNextButton = nextButton.cloneNode(true);
            
            stopButton.parentNode.replaceChild(newStopButton, stopButton);
            pauseButton.parentNode.replaceChild(newPauseButton, pauseButton);
            nextButton.parentNode.replaceChild(newNextButton, nextButton);
            
            newStopButton.addEventListener('click', () => {
                this.stopPlayback();
            });
            
            newPauseButton.addEventListener('click', () => {
                this.togglePause();
            });
            
            newNextButton.addEventListener('click', () => {
                this.skipToNextSentence();
                console.log('Next sentence requested');
            });
            
            // Update button states initially
            this.updateControlButtons();
        },
        
        getVoiceName: function(voiceCode) {
            const voiceMap = {
                'alloy': 'Alloy',
                'echo': 'Echo',
                'fable': 'Fable',
                'onyx': 'Onyx',
                'nova': 'Nova',
                'shimmer': 'Shimmer',
                'coral': 'Coral',
                'sage': 'Sage'
            };
            return voiceMap[voiceCode] || voiceCode;
        },
        
        getModelName: function(modelCode) {
            const modelMap = {
                'tts-1': 'TTS-1',
                'tts-1-hd': 'TTS-1-HD',
                'gpt-4o-mini-tts': 'GPT-4o Mini TTS',
                'gpt-4o-tts': 'GPT-4o TTS'
            };
            return modelMap[modelCode] || modelCode;
        },
        
        updatePopup: function(text, current, total) {
            const popup = document.getElementById('tts-popup');
            if (popup) {
                document.getElementById('tts-progress').textContent = `Sentence ${current} of ${total}`;
                document.getElementById('tts-text').textContent = text;
                this.updateControlButtons();
            }
        },
        
        hidePopup: function() {
            const popup = document.getElementById('tts-popup');
            if (popup) {
                popup.remove();
            }
        }
    };
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "readAloud") {
            window.openAITTS.readAloud(request.text);
        }
        
        if (request.action === "stopPlayback") {
            window.openAITTS.stopPlayback();
        }
    });
    
    // Clean up when page is unloaded
    window.addEventListener('beforeunload', () => {
        if (window.openAITTS) {
            window.openAITTS.stopPlayback();
            delete window.openAITTS;
        }
    });
})();