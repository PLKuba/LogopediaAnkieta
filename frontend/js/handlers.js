import * as state from './state.js';
import * as dom from './dom.js';
import * as api from './api.js';
import { AUDIO_URL } from './constants.js';

// Web Audio API fallback for Safari MediaRecorder issues
class WebAudioRecorder {
    constructor(stream) {
        this.stream = stream;
        this.isRecording = false;
        this.audioContext = null;
        this.sourceNode = null;
        this.processorNode = null;
        this.recordedBuffers = [];
        this.sampleRate = 44100;
    }

    async start() {
        try {
            // Clear any previous recordings
            this.recordedBuffers = [];
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });
            
            // Resume audio context if it's suspended (required on some browsers)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
            
            // Create a ScriptProcessor or use AudioWorklet if available
            if (this.audioContext.audioWorklet) {
                // AudioWorklet is preferred but might not be available in all browsers
                try {
                    await this.audioContext.audioWorklet.addModule(this.createWorkletProcessor());
                    this.processorNode = new AudioWorkletNode(this.audioContext, 'recorder-processor');
                    this.processorNode.port.onmessage = (event) => {
                        if (event.data.type === 'audio-data') {
                            this.recordedBuffers.push(...event.data.buffer);
                        }
                    };
                } catch (e) {
                    console.log('AudioWorklet not available, falling back to ScriptProcessor:', e.message);
                    this.useScriptProcessor();
                }
            } else {
                this.useScriptProcessor();
            }

            this.sourceNode.connect(this.processorNode);
            // Connect processor to dummy destination to keep it active
            if (this.dummyNode) {
                this.processorNode.connect(this.dummyNode);
            }
            
            this.isRecording = true;
            console.log('WebAudioRecorder started successfully');
        } catch (error) {
            console.error('WebAudioRecorder start error:', error);
            throw error;
        }
    }

    useScriptProcessor() {
        const bufferSize = 4096;
        this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
        let processedChunks = 0;
        
        this.processorNode.onaudioprocess = (event) => {
            if (this.isRecording) {
                const inputBuffer = event.inputBuffer.getChannelData(0);
                this.recordedBuffers.push(...inputBuffer);
                
                processedChunks++;
                if (processedChunks % 10 === 0) { // Log every 10th chunk
                    const maxSample = Math.max(...inputBuffer.map(Math.abs));
                    console.log(`ScriptProcessor chunk ${processedChunks}, max sample: ${maxSample}`);
                }
            }
        };
        
        // Create a dummy destination to keep the ScriptProcessor active without feedback
        this.dummyNode = this.audioContext.createGain();
        this.dummyNode.gain.value = 0; // Mute it so no audio plays
        this.dummyNode.connect(this.audioContext.destination);
    }

    createWorkletProcessor() {
        const workletCode = `
            class RecorderProcessor extends AudioWorkletProcessor {
                process(inputs, outputs) {
                    const input = inputs[0];
                    if (input.length > 0) {
                        const channelData = input[0];
                        this.port.postMessage({
                            type: 'audio-data',
                            buffer: channelData
                        });
                    }
                    return true;
                }
            }
            registerProcessor('recorder-processor', RecorderProcessor);
        `;
        
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        return URL.createObjectURL(blob);
    }

    stop() {
        this.isRecording = false;
        
        if (this.sourceNode) {
            this.sourceNode.disconnect();
        }
        
        if (this.processorNode) {
            this.processorNode.disconnect();
        }
        
        if (this.dummyNode) {
            this.dummyNode.disconnect();
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }

        return this.exportWAV();
    }

    exportWAV() {
        const buffer = new Float32Array(this.recordedBuffers);
        const length = buffer.length;
        
        console.log(`Exporting WAV: ${length} samples, ${this.recordedBuffers.length} buffer entries`);
        
        // Check if we have actual audio data
        let hasNonZeroSamples = false;
        let maxSample = 0;
        for (let i = 0; i < Math.min(length, 1000); i++) { // Check first 1000 samples
            const sample = Math.abs(buffer[i]);
            if (sample > 0.001) { // Threshold for silence
                hasNonZeroSamples = true;
            }
            maxSample = Math.max(maxSample, sample);
        }
        
        console.log(`Audio analysis - Has audio: ${hasNonZeroSamples}, Max sample: ${maxSample}`);
        
        if (length === 0) {
            console.error("No audio data recorded!");
            return new Blob([], { type: 'audio/wav' });
        }
        
        const arrayBuffer = new ArrayBuffer(44 + length * 2);
        const view = new DataView(arrayBuffer);

        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, this.sampleRate, true);
        view.setUint32(28, this.sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * 2, true);

        // Convert float samples to 16-bit PCM
        let offset = 44;
        for (let i = 0; i < length; i++) {
            const sample = Math.max(-1, Math.min(1, buffer[i]));
            view.setInt16(offset, sample * 0x7FFF, true);
            offset += 2;
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }
}

// Detect Safari browser
function isSafari() {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export async function requestMicrophonePermission() {
    try {
        // Check for Permissions API support
        if (navigator.permissions && navigator.permissions.query) {
            const permissionStatus = await navigator.permissions.query({ name: 'microphone' });

            if (permissionStatus.state === 'denied') {
                import('./dom.js').then(dom => dom.setMicrophoneAccessUI(false));
                console.error("Microphone access was previously denied.");
                return; // Stop execution if permission is denied
            }

            // Re-check status on change
            permissionStatus.onchange = () => {
                if (permissionStatus.state !== 'granted') {
                    import('./dom.js').then(dom => dom.setMicrophoneAccessUI(false));
                    state.setMicrophoneStream(null); // Clear stream if permissions are revoked
                }
            };
        }

        // Proceed to request microphone access. If already granted, this will not prompt the user.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.setMicrophoneStream(stream);
        import('./dom.js').then(dom => dom.setMicrophoneAccessUI(true));

    } catch (error) {
        // This will catch errors from getUserMedia, including user denial from a prompt.
        import('./dom.js').then(dom => dom.setMicrophoneAccessUI(false));
        console.error("Microphone access error:", error);
    }
}

async function startRecording() {
    try {
        const stream = state.getMicrophoneStream();
        console.log("Current stream state:", stream ? {
            active: stream.active,
            audioTracks: stream.getAudioTracks().length,
            trackState: stream.getAudioTracks()[0]?.readyState,
            hasIssues: stream._hasIssues
        } : "no stream");

        // Check if the stream is active and has a valid audio track, or had previous issues
        if (!stream || !stream.active || stream.getAudioTracks().length === 0 || 
            stream.getAudioTracks()[0].readyState === 'ended' || stream._hasIssues) {
            
            if (stream && stream._hasIssues) {
                console.log('Microphone stream had previous issues. Getting fresh stream for mobile Safari compatibility.');
                // Stop the problematic stream
                stream.getTracks().forEach(track => track.stop());
            } else {
                console.log('Microphone stream is inactive or ended. Requesting new stream.');
            }
            
            await requestMicrophonePermission(); // This will set a new stream in the state
        }

        const currentStream = state.getMicrophoneStream();
        console.log("Stream after check:", currentStream ? {
            active: currentStream.active,
            audioTracks: currentStream.getAudioTracks().length,
            trackState: currentStream.getAudioTracks()[0]?.readyState
        } : "no stream");
        
        if (!currentStream || !currentStream.active) {
            console.error("Failed to get a valid microphone stream.");
            dom.setStatus("Nie udało się uzyskać dostępu do mikrofonu.", "error");
            return;
        }

        // Check if we should use Web Audio API fallback
        // Only use it for Safari or after MediaRecorder failures, not by default
        const shouldUseWebAudioFallback = (isSafari() && currentStream._safariRecordingIssues) || state.getMediaRecorderFailureCount() > 0;
        
        if (shouldUseWebAudioFallback) {
            console.log("Using Web Audio API fallback for recording (Safari issues or MediaRecorder failures)");
            return startWebAudioRecording(currentStream);
        }

        // Try MediaRecorder first (for non-Safari browsers or first attempts)
        return startMediaRecorderRecording(currentStream);

    } catch (error) {
        dom.setStatus("Błąd podczas nagrywania. Sprawdź dostęp do mikrofonu.", "error");
        console.error("Recording error:", error);
    }
}

async function startWebAudioRecording(stream) {
    try {
        console.log("Starting Web Audio API recording");
        
        // Clean up any existing recorders
        const existingRecorder = state.getMediaRecorder();
        if (existingRecorder) {
            try {
                if (existingRecorder.state !== 'inactive') {
                    existingRecorder.stop();
                }
            } catch (e) {
                console.warn("Error stopping existing MediaRecorder:", e);
            }
            state.setMediaRecorder(null);
        }

        // Clean up any existing Web Audio recorder
        const existingWebAudioRecorder = state.getWebAudioRecorder();
        if (existingWebAudioRecorder) {
            try {
                if (existingWebAudioRecorder.isRecording) {
                    existingWebAudioRecorder.stop();
                }
            } catch (e) {
                console.warn("Error stopping existing WebAudioRecorder:", e);
            }
            state.setWebAudioRecorder(null);
        }

        // Always create a fresh WebAudioRecorder instance
        const webAudioRecorder = new WebAudioRecorder(stream);
        state.setWebAudioRecorder(webAudioRecorder);
        
        await webAudioRecorder.start();
        
        state.setIsRecording(true);
        dom.DOMElements.recordBtn.classList.add("recording");
        dom.DOMElements.playbackBtn.disabled = true;
        dom.DOMElements.nextBtn.disabled = true;
        dom.DOMElements.prevBtn.disabled = true;

        // Set auto-stop timeout
        if (state.getAutoStopTimeout()) {
            clearTimeout(state.getAutoStopTimeout());
        }

        const timeout = setTimeout(() => {
            if (state.getIsRecording()) {
                stopRecording();
            }
        }, 5000);
        state.setAutoStopTimeout(timeout);

    } catch (error) {
        console.error("Web Audio recording error:", error);
        dom.setStatus("Błąd nagrywania Web Audio. Sprawdź dostęp do mikrofonu.", "error");
    }
}

async function startMediaRecorderRecording(stream) {
    try {
        // Prioritize WAV for maximum iOS compatibility, then MP4.
        const mimeTypes = [
            'audio/wav',          // Uncompressed, best for compatibility
            'audio/mp4',          // Preferred for Safari/iOS (AAC), but can be buggy
            'audio/webm;codecs=opus', // Good quality, but not on iOS
            'audio/webm',         // Generic webm
            'audio/ogg;codecs=opus' // Ogg fallback
        ];

        let supportedMimeType = '';
        for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                console.log(`Supported mimeType found: ${type}`);
                supportedMimeType = type;
                break;
            }
        }

        if (!supportedMimeType) {
            console.log("No MediaRecorder support, falling back to Web Audio API");
            return startWebAudioRecording(stream);
        }

        // Clean up any existing MediaRecorder to prevent conflicts
        const existingRecorder = state.getMediaRecorder();
        if (existingRecorder) {
            try {
                if (existingRecorder.state !== 'inactive') {
                    console.log("Stopping existing recorder with state:", existingRecorder.state);
                    existingRecorder.stop();
                }
            } catch (e) {
                console.warn("Error stopping existing recorder:", e);
            }
            state.setMediaRecorder(null);
        }

        console.log("Creating new MediaRecorder for mimeType:", supportedMimeType);
        const mediaRecorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
        state.setMediaRecorder(mediaRecorder);
        
        // Always start with a completely fresh, empty chunks array
        const freshChunks = [];
        state.setAudioChunks(freshChunks);
        console.log("Created fresh chunks array, length:", freshChunks.length);

        mediaRecorder.ondataavailable = event => {
            console.log("Data available, chunk size:", event.data.size);
            freshChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            console.log("Recording stopped. Total chunks:", freshChunks.length);
            console.log("Chunk sizes:", freshChunks.map(chunk => chunk.size));
            
            const audioBlob = new Blob(freshChunks, { type: supportedMimeType });
            console.log("Created blob size:", audioBlob.size, "type:", audioBlob.type);
            
            if (audioBlob.size === 0) {
                console.error("MediaRecorder produced empty blob! Switching to Web Audio API fallback.");
                
                // Mark this stream as having Safari recording issues
                const currentStream = state.getMicrophoneStream();
                if (currentStream) {
                    currentStream._safariRecordingIssues = true;
                }
                
                // Increment failure count
                const failureCount = state.getMediaRecorderFailureCount() || 0;
                state.setMediaRecorderFailureCount(failureCount + 1);
                
                // Reset recording state
                state.setIsRecording(false);
                dom.DOMElements.recordBtn.classList.remove("recording");
                
                dom.setStatus("Przełączanie na alternatywną metodę nagrywania...", "info");
                
                // Automatically start recording again with Web Audio API
                setTimeout(() => {
                    startRecording();
                }, 500);
                
                return;
            }
            
            // Reset failure count on successful recording
            state.setMediaRecorderFailureCount(0);
            
            state.setAudioBlob(audioBlob);
            handleRecordingComplete();
        };

        console.log("Starting MediaRecorder with mimeType:", supportedMimeType);
        mediaRecorder.start(100); // Request data every 100ms
        console.log("MediaRecorder state after start:", mediaRecorder.state);
        
        state.setIsRecording(true);
        dom.DOMElements.recordBtn.classList.add("recording");
        dom.DOMElements.playbackBtn.disabled = true;
        dom.DOMElements.nextBtn.disabled = true;
        dom.DOMElements.prevBtn.disabled = true;

        if (state.getAutoStopTimeout()) {
            clearTimeout(state.getAutoStopTimeout());
        }

        const timeout = setTimeout(() => {
            if (state.getIsRecording()) {
                stopRecording();
            }
        }, 5000);
        state.setAutoStopTimeout(timeout);

    } catch (error) {
        console.error("MediaRecorder error, falling back to Web Audio API:", error);
        return startWebAudioRecording(stream);
    }
}

function handleRecordingComplete() {
    dom.DOMElements.playbackBtn.disabled = false;
    state.setIsRecording(false);

    dom.updateNavigationButtons();

    const isLastPhoneme = state.getCurrentPhonemeIndex() === state.getPhonemes().length - 1;
    if (isLastPhoneme) {
        const recordings = state.getRecordings();
        const currentPhoneme = state.getPhonemes()[state.getCurrentPhonemeIndex()];
        recordings[currentPhoneme] = state.getAudioBlob();
        state.setRecordings(recordings);
        dom.DOMElements.submitBtn.classList.remove("hidden");
        dom.DOMElements.submitBtn.disabled = false;
    }

    dom.DOMElements.recordBtn.classList.remove("recording");

    if (state.getAutoStopTimeout()) {
        clearTimeout(state.getAutoStopTimeout());
        state.setAutoStopTimeout(null);
    }
    
    dom.setStatus(""); // Clear any status messages
}

function stopRecording() {
    console.log("Stopping recording...");
    
    // Handle Web Audio API recorder
    const webAudioRecorder = state.getWebAudioRecorder();
    if (webAudioRecorder && webAudioRecorder.isRecording) {
        console.log("Stopping Web Audio recorder");
        try {
            const audioBlob = webAudioRecorder.stop();
            console.log("Web Audio recording complete, blob size:", audioBlob.size);
            
            if (audioBlob.size > 0) {
                state.setAudioBlob(audioBlob);
                handleRecordingComplete();
            } else {
                console.error("Web Audio recorder produced empty blob");
                dom.setStatus("Nagranie nie powiodło się. Spróbuj ponownie.", "error");
                state.setIsRecording(false);
                dom.DOMElements.recordBtn.classList.remove("recording");
            }
        } catch (error) {
            console.error("Error stopping Web Audio recorder:", error);
            dom.setStatus("Błąd podczas zatrzymywania nagrania.", "error");
            state.setIsRecording(false);
            dom.DOMElements.recordBtn.classList.remove("recording");
        }
        
        state.setWebAudioRecorder(null);
        
        if (state.getAutoStopTimeout()) {
            clearTimeout(state.getAutoStopTimeout());
            state.setAutoStopTimeout(null);
        }
        return;
    }
    
    // Handle MediaRecorder
    const mediaRecorder = state.getMediaRecorder();
    console.log("Stopping recording. MediaRecorder state:", mediaRecorder ? mediaRecorder.state : "no recorder");
    if (mediaRecorder && state.getIsRecording()) {
        console.log("Calling mediaRecorder.stop()");
        mediaRecorder.stop();
    }

    if (state.getAutoStopTimeout()) {
        clearTimeout(state.getAutoStopTimeout());
        state.setAutoStopTimeout(null);
    }

    const isLastPhoneme = state.getCurrentPhonemeIndex() === state.getPhonemes().length - 1;
    if (isLastPhoneme && state.getAudioBlob()) {
        dom.DOMElements.submitBtn.disabled = false;
        dom.DOMElements.submitBtn.classList.remove("hidden");
        dom.hideUploadProgress();
    }
}

export function handleRecord() {
    if (state.getIsRecording()) {
        stopRecording();
    } else {
        startRecording();
    }
}

// Cache for preloaded perfect pronunciation audio (phoneme -> blob URL)
const perfectPronunciationAudioCache = new Map();

export async function preloadPerfectPronunciationAudio(phonemes) {
    if (!Array.isArray(phonemes)) return;
    for (const phoneme of phonemes) {
        const url = `${AUDIO_URL}?file_name=${encodeURIComponent(phoneme)}.mp3`;
        try {
            const response = await fetch(url);
            if (!response.ok) continue;
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            perfectPronunciationAudioCache.set(phoneme, blobUrl);
        } catch (e) {
            // Optionally log the error, but don't throw
            console.warn(`Failed to preload audio for phoneme '${phoneme}':`, e);
        }
    }
}

function navigateToPhoneme(newIndex) {
    state.setCurrentPhonemeIndex(newIndex);
    state.setAudioBlob(null);
    state.setAudioChunks([]);

    dom.updatePhonemeDisplay();
    dom.updateProgress();
    dom.scrollCurrentPhonemeIntoView();

    const recordings = state.getRecordings();
    const currentPhoneme = state.getPhonemes()[newIndex];
    const existingRecording = recordings[currentPhoneme];
    if (existingRecording) {
        console.log("Restoring recording for phoneme:", currentPhoneme, "size:", existingRecording.size);
        // Simply use the existing recording without recreating it to avoid corruption
        if (existingRecording.size && existingRecording.size > 0) {
            state.setAudioBlob(existingRecording);
        } else {
            console.warn("Existing recording is empty or invalid, size:", existingRecording.size);
            state.setAudioBlob(null);
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
        let audioUrl = perfectPronunciationAudioCache.get(currentPhoneme);
        if (!audioUrl) {
            // Fallback if not preloaded
            audioUrl = `${AUDIO_URL}?file_name=${encodeURIComponent(currentPhoneme)}.mp3`;
        }
        const audio = new Audio(audioUrl);

        audio.onplay = () => {
            dom.toggleActionButtons(true);
        };

        audio.onerror = () => {
            console.error(`Error loading audio file for phoneme: ${currentPhoneme}`);
            dom.setStatus(`Nie można odtwarzać nagrania dla głoski: ${currentPhoneme}`, "error");
            dom.toggleActionButtons(false);
        };
        audio.onended = () => {
            dom.setStatus("");
            dom.toggleActionButtons(false);
        };
        audio.play();
    } catch (error) {
        console.error("Error playing phoneme recording:", error);
        dom.setStatus("Wystąpił błąd podczas odtwarzania nagrania.", "error");
    }
}

export function handlePlayback() {
    try {
        let audioBlob = state.getAudioBlob();
        if (!audioBlob) {
            throw new Error("Brak nagrania do odtwarzenia.");
        }

        console.log("Playback blob size:", audioBlob.size, "type:", audioBlob.type);

        // Validate blob - check if it's still valid and has data
        if (!audioBlob.size || audioBlob.size === 0) {
            console.error("Audio blob is empty or invalid, size:", audioBlob.size);
            dom.setStatus("Nagranie jest uszkodzone. Spróbuj nagrać ponownie.", "error");
            return;
        }

        // For mobile browsers, especially Safari, try to create a fresh blob URL directly
        // without recreating the blob itself to avoid corruption

        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        // Function to clean up the object URL
        const cleanup = () => {
            URL.revokeObjectURL(audioUrl);
            dom.updateNavigationButtons(false); // Enable nav buttons
            dom.toggleActionButtons(false); // Enable action buttons
            dom.setStatus("");
        };

        audio.onplay = () => {
            dom.updateNavigationButtons(true); // Disable nav buttons
            dom.toggleActionButtons(true); // Disable action buttons
        };

        audio.onended = cleanup;

        audio.onerror = () => {
            console.error("Error loading audio blob for playback.");
            dom.setStatus("Nie można odtworzyć nagrania.", "error");
            // No need to call cleanup here as onended will also be called, but good practice for robustness
            URL.revokeObjectURL(audioUrl); // Explicitly revoke on error
            dom.updateNavigationButtons(false); // Re-enable buttons on error
            dom.toggleActionButtons(false);
        };

        audio.play();
    } catch (error) {
        console.error("Error playing recording:", error);
        dom.setStatus("Wystąpił błąd podczas odtwarzania nagrania.", "error");
    }
}

export function handleNext() {
    if (state.getIsRecording()) {
        return;
    }

    const audioBlob = state.getAudioBlob();
    if (audioBlob) {
        const recordings = state.getRecordings();
        const currentPhoneme = state.getPhonemes()[state.getCurrentPhonemeIndex()];
        recordings[currentPhoneme] = audioBlob;
        state.setRecordings(recordings);
    }

    let currentIndex = state.getCurrentPhonemeIndex();
    if (currentIndex < state.getPhonemes().length - 1) {
        currentIndex++;
        navigateToPhoneme(currentIndex);
    }
}

export function handlePrev() {
    if (state.getIsRecording()) {
        return;
    }

    let currentIndex = state.getCurrentPhonemeIndex();
    if (currentIndex > 0) {
        currentIndex--;
        navigateToPhoneme(currentIndex);
    }
}

export function handleSubmit(restartHandler) {
    api.submitAllRecordings(restartHandler);
}
