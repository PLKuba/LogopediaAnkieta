import * as state from './state.js';
import * as dom from './dom.js';
import * as api from './api.js';
import { AUDIO_URL } from './constants.js';

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
        if (!state.getMicrophoneStream()) {
            await requestMicrophonePermission();
        }

        const mimeTypes = [
            'audio/mp4',
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/wav'
        ];
        let supportedMimeType = '';
        for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                supportedMimeType = type;
                break;
            }
        }

        if (!supportedMimeType) {
            console.error("No supported mimeType found for MediaRecorder");
            dom.setStatus("Twoja przeglądarka nie wspiera nagrywania w wymaganym formacie.", "error");
            return;
        }

        const mediaRecorder = new MediaRecorder(state.getMicrophoneStream(), { mimeType: supportedMimeType });
        state.setMediaRecorder(mediaRecorder);
        state.setAudioChunks([]);

        mediaRecorder.ondataavailable = event => {
            state.getAudioChunks().push(event.data);
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(state.getAudioChunks(), { type: supportedMimeType });
            state.setAudioBlob(audioBlob);
            dom.DOMElements.playbackBtn.disabled = false;
            state.setIsRecording(false);

            dom.updateNavigationButtons();

            const isLastPhoneme = state.getCurrentPhonemeIndex() === state.getPhonemes().length - 1;
            if (isLastPhoneme) {
                const recordings = state.getRecordings();
                const currentPhoneme = state.getPhonemes()[state.getCurrentPhonemeIndex()];
                recordings[currentPhoneme] = audioBlob;
                state.setRecordings(recordings);
                dom.DOMElements.submitBtn.classList.remove("hidden");
                dom.DOMElements.submitBtn.disabled = false;
            }

            dom.DOMElements.recordBtn.classList.remove("recording");

            if (state.getAutoStopTimeout()) {
                clearTimeout(state.getAutoStopTimeout());
                state.setAutoStopTimeout(null);
            }
        };

        mediaRecorder.start();
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
        dom.setStatus("Błąd podczas nagrywania. Sprawdź dostęp do mikrofonu.", "error");
        console.error("Recording error:", error);
    }
}

function stopRecording() {
    const mediaRecorder = state.getMediaRecorder();
    if (mediaRecorder && state.getIsRecording()) {
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
        state.setAudioBlob(existingRecording);
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
        const audioBlob = state.getAudioBlob();
        if (!audioBlob) {
            throw new Error("Brak nagrania do odtwarzenia.");
        }

        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.onplay = () => {
            dom.updateNavigationButtons(true); // Disable nav buttons
            dom.toggleActionButtons(true); // Disable action buttons
        };

        audio.onended = () => {
            dom.updateNavigationButtons(false); // Enable nav buttons
            dom.toggleActionButtons(false); // Enable action buttons
            dom.setStatus("");
        };

        audio.onerror = () => {
            console.error("Error loading audio blob for playback.");
            dom.setStatus("Nie można odtworzyć nagrania.", "error");
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
