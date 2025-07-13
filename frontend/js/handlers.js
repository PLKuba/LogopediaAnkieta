import * as state from './state.js';
import * as dom from './dom.js';
import * as api from './api.js';
import { AUDIO_URL } from './constants.js';
import { sentryUtils } from './sentry.js';

// Enhanced audio recording class based on working demo
class AudioRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioBlob = null;
        this.audioUrl = null;
        this.isRecording = false;
        this.stream = null;
        this.hasPermission = false;
        this.permissionChecked = false;
        
        this.checkBrowserSupport();
        this.checkMicrophonePermission();
    }
    
    checkBrowserSupport() {
        console.log('=== BROWSER ENVIRONMENT CHECK ===');
        console.log('User Agent:', navigator.userAgent);
        console.log('Platform:', navigator.platform);
        console.log('Is iOS Safari:', /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream);
        console.log('MediaDevices available:', !!navigator.mediaDevices);
        console.log('getUserMedia available:', !!navigator.mediaDevices?.getUserMedia);
        console.log('MediaRecorder available:', !!window.MediaRecorder);
        console.log('URL.createObjectURL available:', !!URL.createObjectURL);
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('Browser does not support audio recording');
            dom.setStatus('Twoja przeglądarka nie wspiera nagrywania audio.', 'error');
            return false;
        }
        
        if (!window.MediaRecorder) {
            console.error('MediaRecorder not supported in browser');
            dom.setStatus('MediaRecorder nie jest wspierany w tej przeglądarce.', 'error');
            return false;
        }
        
        return true;
    }
    
    async checkMicrophonePermission() {
        try {
            // Check if permissions API is supported
            if ('permissions' in navigator) {
                console.log('Permissions API available');
                const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
                console.log('Current microphone permission state:', permissionStatus.state);
                
                if (permissionStatus.state === 'granted') {
                    this.hasPermission = true;
                } else if (permissionStatus.state === 'denied') {
                    console.log('Microphone access denied');
                    dom.setStatus('Dostęp do mikrofonu został odmówiony. Włącz go w ustawieniach przeglądarki.', 'error');
                }
                
                // Listen for permission changes
                permissionStatus.addEventListener('change', () => {
                    console.log('Permission state changed to:', permissionStatus.state);
                    if (permissionStatus.state === 'granted') {
                        this.hasPermission = true;
                    } else if (permissionStatus.state === 'denied') {
                        this.hasPermission = false;
                        dom.setStatus('Dostęp do mikrofonu został odmówiony.', 'error');
                    }
                });
            } else {
                console.log('Permissions API not available - using fallback');
            }
            
            this.permissionChecked = true;
        } catch (error) {
            console.log('Could not check permissions:', error);
            this.permissionChecked = true;
        }
    }
    
    async startRecording() {
        console.log('=== START RECORDING ATTEMPT ===');
        console.log('Current recording state:', this.isRecording);
        console.log('Existing stream active:', this.stream?.active);
        
        sentryUtils.logInfo('Starting audio recording', { 
            hasPermission: this.hasPermission,
            hasExistingStream: !!this.stream,
            isRecording: this.isRecording,
            streamActive: this.stream?.active
        });
        sentryUtils.logUserAction('start_recording');

        // Add loading animation immediately
        dom.DOMElements.recordBtn.classList.add('loading');

        try {
            // For iOS Safari, always get a fresh stream for each recording
            const isIOSSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            
            if (!this.stream || !this.stream.active || isIOSSafari) {
                console.log('Getting fresh microphone access...');
                sentryUtils.logInfo('Requesting fresh microphone access', { isIOSSafari });
                
                // Clean up any existing stream first
                if (this.stream) {
                    console.log('Cleaning up existing stream');
                    this.stream.getTracks().forEach(track => track.stop());
                    this.stream = null;
                }
                
                const constraints = {
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: 44100
                    }
                };
                
                this.stream = await navigator.mediaDevices.getUserMedia(constraints);
                this.hasPermission = true;
                console.log('Got fresh microphone stream:', this.stream);
                console.log('Stream tracks:', this.stream.getTracks().map(t => ({
                    kind: t.kind,
                    enabled: t.enabled,
                    readyState: t.readyState
                })));
            } else {
                console.log('Reusing existing microphone stream');
                // Add a small delay to show the loading animation even when reusing stream
                await new Promise(resolve => setTimeout(resolve, 250));
            }
            
            // Remove loading animation after stream is ready (always, regardless of fresh or reused)
            setTimeout(() => {
                dom.DOMElements.recordBtn.classList.remove('loading');
            }, 100); // Small delay to ensure smooth transition
            
            // Determine the best MIME type for the browser
            // Note: Most browsers don't support audio/wav natively with MediaRecorder
            // We'll record in a supported format and convert to WAV
            const mimeTypes = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/mp4',
                'audio/wav',
                'audio/ogg;codecs=opus',
                'audio/ogg'
            ];
            
            console.log('=== SELECTING MIME TYPE ===');
            console.log('Available MIME types to test:', mimeTypes);
            
            let selectedMimeType = '';
            for (const mimeType of mimeTypes) {
                const isSupported = MediaRecorder.isTypeSupported(mimeType);
                console.log(`${mimeType}: ${isSupported ? 'SUPPORTED' : 'not supported'}`);
                if (isSupported && !selectedMimeType) {
                    selectedMimeType = mimeType;
                }
            }
            
            console.log('Selected MIME type:', selectedMimeType || 'none (using default)');
            
            const options = selectedMimeType ? { mimeType: selectedMimeType } : {};
            console.log('MediaRecorder options:', options);
            this.mediaRecorder = new MediaRecorder(this.stream, options);
            
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                console.log('MediaRecorder data available:', event.data.size, 'bytes');
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    console.log('Added chunk to array. Total chunks now:', this.audioChunks.length);
                } else {
                    console.log('WARNING: Received empty data chunk');
                }
            };
            
            this.mediaRecorder.onerror = (event) => {
                console.log('=== MEDIARECORDER ERROR ===');
                console.log('Error event:', event);
                console.log('MediaRecorder state:', this.mediaRecorder.state);
            };
            
            this.mediaRecorder.onstart = () => {
                console.log('MediaRecorder started successfully');
            };
            
            this.mediaRecorder.onstop = async () => {
                console.log('=== RECORDING STOPPED - CREATING AUDIO BLOB ===');
                console.log('Audio chunks count:', this.audioChunks.length);
                console.log('Total audio data size:', this.audioChunks.reduce((total, chunk) => total + chunk.size, 0), 'bytes');
                console.log('Selected MIME type:', selectedMimeType || 'audio/wav');
                
                const originalBlob = new Blob(this.audioChunks, { 
                    type: selectedMimeType || 'audio/wav' 
                });
                
                console.log('Created original audio blob:');
                console.log('- Size:', originalBlob.size, 'bytes');
                console.log('- Type:', originalBlob.type);
                
                // Convert to WAV format if not already WAV
                if (!originalBlob.type.includes('wav')) {
                    console.log('Converting audio to WAV format...');
                    this.audioBlob = await convertBlobToWAV(originalBlob);
                } else {
                    console.log('Audio already in WAV format');
                    this.audioBlob = originalBlob;
                }
                
                console.log('Final audio blob:');
                console.log('- Size:', this.audioBlob.size, 'bytes');
                console.log('- Type:', this.audioBlob.type);
                console.log('- Browser info:', navigator.userAgent);
                
                // Clean up previous URL
                if (this.audioUrl) {
                    console.log('Cleaning up previous audio URL:', this.audioUrl);
                    URL.revokeObjectURL(this.audioUrl);
                }
                
                this.audioUrl = URL.createObjectURL(this.audioBlob);
                console.log('Created new audio URL:', this.audioUrl);
                console.log('URL.createObjectURL successful');
                
                // Update application state
                state.setAudioBlob(this.audioBlob);
                this.handleRecordingComplete();
            };
            
            this.mediaRecorder.start(100); // Collect data every 100ms
            this.isRecording = true;
            
            console.log('MediaRecorder.start() called');
            console.log('Recording state set to:', this.isRecording);
            console.log('MediaRecorder state after start:', this.mediaRecorder.state);
            
            state.setIsRecording(true);
            this.updateUI();
            
        } catch (error) {
            console.error('Error starting recording:', error);
            sentryUtils.captureException(error, { 
                context: 'startRecording',
                errorName: error.name,
                hasPermission: this.hasPermission,
                streamExists: !!this.stream
            });
            
            // Remove loading animation on error
            dom.DOMElements.recordBtn.classList.remove('loading');
            
            let errorMessage = 'Nie udało się uzyskać dostępu do mikrofonu. ';
            
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Proszę zezwolić na dostęp do mikrofonu i spróbować ponownie.';
                this.hasPermission = false;
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'Nie znaleziono mikrofonu.';
            } else {
                errorMessage += 'Sprawdź ustawienia mikrofonu.';
            }
            
            dom.setStatus(errorMessage, 'error');
        }
    }
    
    stopRecording() {
        console.log('=== STOP RECORDING ===');
        console.log('MediaRecorder state before stop:', this.mediaRecorder?.state);
        
        sentryUtils.logInfo('Stopping audio recording', { 
            mediaRecorderState: this.mediaRecorder?.state,
            isRecording: this.isRecording
        });
        sentryUtils.logUserAction('stop_recording');
        
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            console.log('MediaRecorder.stop() called');
            console.log('Recording state set to:', this.isRecording);
            
            // For iOS Safari, stop the stream after recording to ensure fresh streams
            const isIOSSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIOSSafari && this.stream) {
                console.log('iOS Safari detected - stopping stream tracks for fresh stream next time');
                sentryUtils.logInfo('iOS Safari - stopping stream tracks for fresh stream');
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            
            state.setIsRecording(false);
            this.updateUI();
        }
    }
    
    handleRecordingComplete() {
        dom.DOMElements.playbackBtn.disabled = false;
        dom.updateNavigationButtons();

        const isLastPhoneme = state.getCurrentPhonemeIndex() === state.getPhonemes().length - 1;
        if (isLastPhoneme) {
            const recordings = state.getRecordings();
            const currentPhoneme = state.getPhonemes()[state.getCurrentPhonemeIndex()];
            const audioBlob = state.getAudioBlob();
            console.log('Saving audio recording:', {
                phoneme: currentPhoneme,
                blobType: audioBlob.type,
                blobSize: audioBlob.size,
                format: audioBlob.type.includes('wav') ? 'WAV' : 'Other'
            });
            recordings[currentPhoneme] = audioBlob;
            state.setRecordings(recordings);
            dom.DOMElements.submitBtn.classList.remove("hidden");
            dom.DOMElements.submitBtn.disabled = false;
        }

        dom.DOMElements.recordBtn.classList.remove("recording", "loading");

        if (state.getAutoStopTimeout()) {
            clearTimeout(state.getAutoStopTimeout());
            state.setAutoStopTimeout(null);
        }
    }
    
    updateUI() {
        if (this.isRecording) {
            dom.DOMElements.recordBtn.classList.remove('loading'); // Ensure loading is removed
            dom.DOMElements.recordBtn.classList.add("recording");
            dom.DOMElements.playbackBtn.disabled = true;
            dom.DOMElements.nextBtn.disabled = true;
            dom.DOMElements.prevBtn.disabled = true;
            
            // Set auto-stop timeout
            if (state.getAutoStopTimeout()) {
                clearTimeout(state.getAutoStopTimeout());
            }

            const timeout = setTimeout(() => {
                if (this.isRecording) {
                    this.stopRecording();
                }
            }, 5000);
            state.setAutoStopTimeout(timeout);
        } else {
            dom.DOMElements.recordBtn.classList.remove("recording", "loading"); // Remove both classes
            dom.updateNavigationButtons();
        }
    }
    
    playRecording() {
        console.log('=== ATTEMPTING TO PLAY RECORDING ===');
        console.log('Audio URL exists:', !!this.audioUrl);
        console.log('Audio URL:', this.audioUrl);
        console.log('Audio blob exists:', !!this.audioBlob);
        console.log('Audio blob size:', this.audioBlob ? this.audioBlob.size : 'N/A');
        console.log('Audio blob type:', this.audioBlob ? this.audioBlob.type : 'N/A');
        
        if (this.audioUrl) {
            const audio = new Audio(this.audioUrl);
            
            console.log('Created Audio element');
            console.log('Audio element src:', audio.src);
            console.log('Audio element properties:');
            console.log('- readyState:', audio.readyState);
            console.log('- networkState:', audio.networkState);
            console.log('- currentSrc:', audio.currentSrc);
            console.log('- duration:', audio.duration);
            
            audio.addEventListener('loadstart', () => {
                console.log('Audio event: loadstart');
            });
            
            audio.addEventListener('loadedmetadata', () => {
                console.log('Audio event: loadedmetadata');
                console.log('- duration:', audio.duration);
                console.log('- readyState:', audio.readyState);
            });
            
            audio.addEventListener('canplay', () => {
                console.log('Audio event: canplay');
                console.log('- readyState:', audio.readyState);
            });
            
            audio.addEventListener('play', () => {
                console.log('Audio event: play - playback started successfully');
                dom.updateNavigationButtons(true); // Disable nav buttons
                dom.setPlaybackButtonStates(false, true); // Playing user recording
            });
            
            audio.addEventListener('playing', () => {
                console.log('Audio event: playing');
            });
            
            audio.addEventListener('ended', () => {
                console.log('Audio event: ended - playback finished');
                dom.updateNavigationButtons(false); // Enable nav buttons
                dom.setPlaybackButtonStates(false, false); // Reset button states
                dom.setStatus("");
            });
            
            audio.addEventListener('error', (e) => {
                console.log('=== AUDIO ERROR EVENT ===');
                console.log('Error event:', e);
                console.log('Audio error details:');
                console.log('- error.code:', audio.error ? audio.error.code : 'N/A');
                console.log('- error.message:', audio.error ? audio.error.message : 'N/A');
                console.log('- readyState:', audio.readyState);
                console.log('- networkState:', audio.networkState);
                console.log('- currentSrc:', audio.currentSrc);
                
                // Error code meanings
                if (audio.error) {
                    const errorCodes = {
                        1: 'MEDIA_ERR_ABORTED - The fetching process was aborted',
                        2: 'MEDIA_ERR_NETWORK - A network error occurred',
                        3: 'MEDIA_ERR_DECODE - An error occurred while decoding',
                        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED - Audio format not supported'
                    };
                    console.log('Error meaning:', errorCodes[audio.error.code] || 'Unknown error');
                }
                
                dom.setStatus('Błąd odtwarzania audio. Spróbuj nagrać ponownie.', 'error');
                dom.updateNavigationButtons(false);
                dom.setPlaybackButtonStates(false, false); // Reset button states
            });
            
            console.log('About to call audio.play()...');
            audio.play().then(() => {
                console.log('audio.play() promise resolved successfully');
            }).catch(error => {
                console.log('=== AUDIO PLAY PROMISE REJECTED ===');
                console.log('Play error:', error);
                console.log('Error name:', error.name);
                console.log('Error message:', error.message);
                console.log('Error stack:', error.stack);
                console.log('Audio element state when error occurred:');
                console.log('- readyState:', audio.readyState);
                console.log('- networkState:', audio.networkState);
                console.log('- paused:', audio.paused);
                console.log('- currentTime:', audio.currentTime);
                console.log('- duration:', audio.duration);
                console.log('- src:', audio.src);
                
                dom.setStatus('Nie można odtworzyć audio. Spróbuj nagrać ponownie.', 'error');
                dom.updateNavigationButtons(false);
                dom.setPlaybackButtonStates(false, false); // Reset button states
            });
        } else {
            console.log('No audio URL available for playback');
            dom.setStatus('Brak nagrania do odtworzenia.', 'error');
        }
    }
    
    cleanup() {
        // Stop recording if active
        if (this.isRecording) {
            this.stopRecording();
        }
        
        // Clean up stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        // Clean up audio URL
        if (this.audioUrl) {
            URL.revokeObjectURL(this.audioUrl);
            this.audioUrl = null;
        }
    }
}

// Global audio recorder instance
let audioRecorder = null;

export async function requestMicrophonePermission() {
    // This function is now handled by the AudioRecorder class
    if (!audioRecorder) {
        audioRecorder = new AudioRecorder();
    }
    return audioRecorder.hasPermission;
}

export function handleRecord() {
    if (!audioRecorder) {
        audioRecorder = new AudioRecorder();
    }
    
    if (audioRecorder.isRecording) {
        audioRecorder.stopRecording();
    } else {
        audioRecorder.startRecording();
    }
}

// Cache for preloaded perfect pronunciation audio (phoneme -> blob URL)
const perfectPronunciationAudioCache = new Map();

export async function preloadPerfectPronunciationAudio(phonemes) {
    if (!Array.isArray(phonemes)) return;
    
    sentryUtils.logInfo('Starting perfect pronunciation audio preload', { 
        phonemesCount: phonemes.length 
    });
    
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;
    
    for (const phoneme of phonemes) {
        const url = `${AUDIO_URL}?file_name=${encodeURIComponent(phoneme)}.mp3`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                failureCount++;
                continue;
            }
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            perfectPronunciationAudioCache.set(phoneme, blobUrl);
            successCount++;
        } catch (e) {
            // Optionally log the error, but don't throw
            console.warn(`Failed to preload audio for phoneme '${phoneme}':`, e);
            sentryUtils.logWarning('Failed to preload perfect pronunciation audio', { 
                phoneme: phoneme,
                error: e.message
            });
            failureCount++;
        }
    }
    
    const loadTime = Date.now() - startTime;
    sentryUtils.logPerformance('perfect_pronunciation_preload', loadTime, { 
        phonemesCount: phonemes.length,
        successCount: successCount,
        failureCount: failureCount,
        loadTimeMs: loadTime
    });
    
    sentryUtils.logInfo('Perfect pronunciation audio preload completed', { 
        phonemesCount: phonemes.length,
        successCount: successCount,
        failureCount: failureCount,
        loadTimeMs: loadTime
    });
}

// New function for progressive audio loading
export async function preloadAudioProgressively(allPhonemes, initialCount = 2) {
    if (!Array.isArray(allPhonemes)) return;
    
    const initialPhonemes = allPhonemes.slice(0, initialCount);
    const remainingPhonemes = allPhonemes.slice(initialCount);
    
    sentryUtils.logInfo('Starting progressive audio preload', { 
        totalPhonemes: allPhonemes.length,
        initialCount: initialPhonemes.length,
        remainingCount: remainingPhonemes.length
    });
    
    // Load initial phonemes synchronously
    await preloadPerfectPronunciationAudio(initialPhonemes);
    
    // Load remaining phonemes in background
    if (remainingPhonemes.length > 0) {
        sentryUtils.logInfo('Starting background audio preload', { 
            remainingCount: remainingPhonemes.length 
        });
        
        // Don't await this - let it run in background
        preloadPerfectPronunciationAudio(remainingPhonemes).then(() => {
            sentryUtils.logInfo('Background audio preload completed', { 
                remainingCount: remainingPhonemes.length 
            });
        }).catch((error) => {
            sentryUtils.logWarning('Background audio preload failed', { 
                remainingCount: remainingPhonemes.length,
                error: error.message
            });
        });
    }
}

function navigateToPhoneme(newIndex) {
    state.setCurrentPhonemeIndex(newIndex);
    state.setAudioBlob(null);
    state.setAudioChunks([]);

    // Clear current audio recorder recording
    if (audioRecorder) {
        audioRecorder.audioBlob = null;
        audioRecorder.audioUrl = null;
    }

    dom.updatePhonemeDisplay();
    dom.updateProgress();
    dom.scrollCurrentPhonemeIntoView();

    const recordings = state.getRecordings();
    const currentPhoneme = state.getPhonemes()[newIndex];
    const existingRecording = recordings[currentPhoneme];
    if (existingRecording) {
        state.setAudioBlob(existingRecording);
        
        // Update audio recorder with existing recording
        if (audioRecorder) {
            audioRecorder.audioBlob = existingRecording;
            if (audioRecorder.audioUrl) {
                URL.revokeObjectURL(audioRecorder.audioUrl);
            }
            audioRecorder.audioUrl = URL.createObjectURL(existingRecording);
        }
    }

    dom.updateNavigationButtons();
    dom.DOMElements.playbackBtn.disabled = !state.getAudioBlob();

    const isLastPhoneme = newIndex === state.getPhonemes().length - 1;
    if (isLastPhoneme && state.getAudioBlob()) {
        dom.DOMElements.submitBtn.disabled = false;
        dom.DOMElements.submitBtn.classList.remove("hidden");
    } else {
        dom.DOMElements.submitBtn.classList.add("hidden");
    }
}

export function handlePlayPerfectPronunciation() {
    try {
        const currentPhoneme = state.getPhonemes()[state.getCurrentPhonemeIndex()];
        
        sentryUtils.logInfo('Playing perfect pronunciation', { 
            phoneme: currentPhoneme,
            phonemeIndex: state.getCurrentPhonemeIndex()
        });
        sentryUtils.logUserAction('play_perfect_pronunciation', { phoneme: currentPhoneme });
        
        let audioUrl = perfectPronunciationAudioCache.get(currentPhoneme);
        if (!audioUrl) {
            sentryUtils.logWarning('Perfect pronunciation audio not preloaded, using fallback', { 
                phoneme: currentPhoneme 
            });
            // Fallback if not preloaded
            audioUrl = `${AUDIO_URL}?file_name=${encodeURIComponent(currentPhoneme)}.mp3`;
        }
        const audio = new Audio(audioUrl);

        audio.onplay = () => {
            sentryUtils.logInfo('Perfect pronunciation audio started playing', { phoneme: currentPhoneme });
            dom.setPlaybackButtonStates(true, false); // Playing perfect pronunciation
            dom.updateNavigationButtons(true); // Disable nav buttons
        };

        audio.onerror = () => {
            console.error(`Error loading audio file for phoneme: ${currentPhoneme}`);
            sentryUtils.logError('Perfect pronunciation audio failed to load', { 
                phoneme: currentPhoneme,
                audioUrl: audioUrl
            });
            dom.setStatus(`Nie można odtwarzać nagrania dla głoski: ${currentPhoneme}`, "error");
            dom.setPlaybackButtonStates(false, false); // Reset button states
            dom.updateNavigationButtons(false); // Enable nav buttons
        };
        audio.onended = () => {
            sentryUtils.logInfo('Perfect pronunciation audio ended', { phoneme: currentPhoneme });
            dom.setStatus("");
            dom.setPlaybackButtonStates(false, false); // Reset button states
            dom.updateNavigationButtons(false); // Enable nav buttons
        };
        audio.play();
    } catch (error) {
        console.error("Error playing phoneme recording:", error);
        sentryUtils.captureException(error, { 
            context: 'handlePlayPerfectPronunciation',
            currentPhoneme: state.getPhonemes()[state.getCurrentPhonemeIndex()]
        });
        dom.setStatus("Wystąpił błąd podczas odtwarzania nagrania.", "error");
    }
}

export function handlePlayback() {
    sentryUtils.logInfo('Playing user recording');
    sentryUtils.logUserAction('play_user_recording');
    
    if (!audioRecorder) {
        sentryUtils.logError('No audio recorder available for playback');
        dom.setStatus("Brak nagrania do odtworzenia.", "error");
        return;
    }
    
    if (!audioRecorder.audioBlob) {
        sentryUtils.logWarning('No audio blob available for playback');
        dom.setStatus("Brak nagrania do odtworzenia.", "error");
        return;
    }
    
    sentryUtils.logInfo('Starting user recording playback', { 
        audioBlobSize: audioRecorder.audioBlob.size,
        audioBlobType: audioRecorder.audioBlob.type
    });
    
    audioRecorder.playRecording();
}

export function handleNext() {
    if (state.getIsRecording()) {
        sentryUtils.logWarning('Attempted to navigate next while recording');
        return;
    }

    let currentIndex = state.getCurrentPhonemeIndex();
    const currentPhoneme = state.getPhonemes()[currentIndex];
    
    sentryUtils.logInfo('Navigating to next phoneme', { 
        fromIndex: currentIndex,
        fromPhoneme: currentPhoneme,
        toIndex: currentIndex + 1
    });
    sentryUtils.logUserAction('navigate_next', { 
        fromPhoneme: currentPhoneme,
        phonemeIndex: currentIndex 
    });

    const audioBlob = state.getAudioBlob();
    if (audioBlob) {
        const recordings = state.getRecordings();
        recordings[currentPhoneme] = audioBlob;
        state.setRecordings(recordings);
        
        sentryUtils.logInfo('Recording saved for current phoneme', { 
            phoneme: currentPhoneme,
            recordingSize: audioBlob.size
        });
    }

    if (currentIndex < state.getPhonemes().length - 1) {
        currentIndex++;
        navigateToPhoneme(currentIndex);
    }
}

export function handlePrev() {
    if (state.getIsRecording()) {
        sentryUtils.logWarning('Attempted to navigate prev while recording');
        return;
    }

    let currentIndex = state.getCurrentPhonemeIndex();
    const currentPhoneme = state.getPhonemes()[currentIndex];
    
    sentryUtils.logInfo('Navigating to previous phoneme', { 
        fromIndex: currentIndex,
        fromPhoneme: currentPhoneme,
        toIndex: currentIndex - 1
    });
    sentryUtils.logUserAction('navigate_prev', { 
        fromPhoneme: currentPhoneme,
        phonemeIndex: currentIndex 
    });

    if (currentIndex > 0) {
        currentIndex--;
        navigateToPhoneme(currentIndex);
    }
}

export function handleSubmit(restartHandler) {
    api.submitAllRecordings(restartHandler);
}

// Clean up audio recorder resources
export function cleanupAudioRecorder() {
    if (audioRecorder) {
        audioRecorder.cleanup();
        audioRecorder = null;
    }
}

// Initialize audio recorder when needed
export function initializeAudioRecorder() {
    if (!audioRecorder) {
        audioRecorder = new AudioRecorder();
    }
    return audioRecorder;
}

// Function to update phonemes progressively
export function updatePhonemesProgressively(allPhonemes) {
    // Update state with all phonemes
    state.setPhonemes(allPhonemes);
    
    // Update UI components (we'll need to call this from main.js after DOM is available)
    sentryUtils.logInfo('Phonemes state updated with all phonemes', { 
        totalPhonemes: allPhonemes.length 
    });
}

// WAV audio conversion utilities
function encodeWAV(samples, sampleRate = 44100) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    
    // PCM data
    const floatTo16BitPCM = (output, offset, input) => {
        for (let i = 0; i < input.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    };
    
    floatTo16BitPCM(view, 44, samples);
    return buffer;
}

async function convertBlobToWAV(blob) {
    try {
        sentryUtils.logInfo('Converting audio blob to WAV format', {
            originalType: blob.type,
            originalSize: blob.size
        });
        
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const samples = audioBuffer.getChannelData(0);
        const wavBuffer = encodeWAV(samples, audioBuffer.sampleRate);
        const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
        
        sentryUtils.logInfo('Audio conversion to WAV completed', {
            originalSize: blob.size,
            wavSize: wavBlob.size,
            sampleRate: audioBuffer.sampleRate
        });
        
        return wavBlob;
    } catch (error) {
        sentryUtils.logError('Failed to convert audio to WAV', {
            error: error.message,
            originalType: blob.type
        });
        console.error('WAV conversion failed:', error);
        // Return original blob as fallback
        return blob;
    }
}