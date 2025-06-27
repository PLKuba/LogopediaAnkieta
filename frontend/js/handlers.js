import * as state from './state.js';
import * as dom from './dom.js';
import * as api from './api.js';
import { AUDIO_URL } from './constants.js';

export async function requestMicrophonePermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.setMicrophoneStream(stream);
        import('./dom.js').then(dom => dom.setMicrophoneAccessUI(true));
    } catch (error) {
        import('./dom.js').then(dom => dom.setMicrophoneAccessUI(false));
        // No need to setStatus here, handled by overlay
        console.error("Microphone access error:", error);
    }
}

async function startRecording() {
    try {
        if (!state.getMicrophoneStream()) {
            await requestMicrophonePermission();
        }

        const mediaRecorder = new MediaRecorder(state.getMicrophoneStream());
        state.setMediaRecorder(mediaRecorder);
        state.setAudioChunks([]);

        mediaRecorder.ondataavailable = event => {
            state.getAudioChunks().push(event.data);
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(state.getAudioChunks(), { type: 'audio/webm' });
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

export function handlePlayPerfectPronunciation() {
    try {
        const currentPhoneme = state.getPhonemes()[state.getCurrentPhonemeIndex()];
        let audioUrl = perfectPronunciationAudioCache.get(currentPhoneme);
        if (!audioUrl) {
            // Fallback if not preloaded
            audioUrl = `${AUDIO_URL}?file_name=${encodeURIComponent(currentPhoneme)}.mp3`;
        }
        const audio = new Audio(audioUrl);
        audio.onerror = () => {
            console.error(`Error loading audio file for phoneme: ${currentPhoneme}`);
            dom.setStatus(`Nie można odtwarzać nagrania dla głoski: ${currentPhoneme}`, "error");
        };
        audio.onended = () => dom.setStatus("");
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
            throw new Error("Brak nagrania do odtworzenia.");
        }

        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.onerror = () => {
            console.error("Error loading audio blob for playback.");
            dom.setStatus("Nie można odtworzyć nagrania.", "error");
        };
        audio.onended = () => dom.setStatus("");
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
        state.setCurrentPhonemeIndex(currentIndex);
    }

    state.setAudioBlob(null);
    state.setAudioChunks([]);

    dom.updatePhonemeDisplay();
    dom.updateProgress();
    dom.scrollCurrentPhonemeIntoView();

    const recordings = state.getRecordings();
    const currentPhoneme = state.getPhonemes()[currentIndex];
    const existingRecording = recordings[currentPhoneme];
    if (existingRecording) {
        state.setAudioBlob(existingRecording);
    }

    dom.updateNavigationButtons();
    dom.DOMElements.playbackBtn.disabled = !state.getAudioBlob();

    const isLastPhoneme = currentIndex === state.getPhonemes().length - 1;
    if (isLastPhoneme && state.getAudioBlob()) {
        dom.DOMElements.submitBtn.disabled = false;
        dom.DOMElements.submitBtn.classList.remove("hidden");
    } else {
        dom.DOMElements.submitBtn.classList.add("hidden");
    }
}

export function handlePrev() {
    if (state.getIsRecording()) {
        return;
    }

    let currentIndex = state.getCurrentPhonemeIndex();
    if (currentIndex > 0) {
        currentIndex--;
        state.setCurrentPhonemeIndex(currentIndex);
    }

    state.setAudioBlob(null);
    state.setAudioChunks([]);

    dom.updatePhonemeDisplay();
    dom.updateProgress();
    dom.scrollCurrentPhonemeIntoView();

    const recordings = state.getRecordings();
    const currentPhoneme = state.getPhonemes()[currentIndex];
    const existingRecording = recordings[currentPhoneme];
    if (existingRecording) {
        state.setAudioBlob(existingRecording);
    }

    dom.updateNavigationButtons();
    dom.DOMElements.playbackBtn.disabled = !state.getAudioBlob();
    dom.DOMElements.submitBtn.classList.add("hidden");
}

export function handleSubmit() {
    api.submitAllRecordings();
}
