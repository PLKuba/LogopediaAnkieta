import {
    initDOMElements,
    initializeProgressBar as createPhonemeBubbles,
    updatePhonemeDisplay,
    updateProgress as updateProgressCounter,
    updateNavigationButtons,
    requestMicrophoneAccessAndUI,
    createStartScreen,
    toggleStartButtonLoading,
    showGameUI,
    removeThankYouScreen,
    createThankYouScreen,
    removeFadeOutEffect,
    hideUploadProgress
} from './dom.js';
import {
    handleRecord,
    handlePlayback,
    handlePlayPerfectPronunciation,
    handleNext,
    handlePrev,
    handleSubmit,
    preloadPerfectPronunciationAudio,
    initializeAudioRecorder,
    cleanupAudioRecorder
} from './handlers.js';
import { fetchPhonemes } from './api.js';
import * as state from './state.js';
import { sentryUtils } from './sentry.js';

const recordBtn = document.getElementById('record-btn');
const playbackBtn = document.getElementById('playback-btn');
const playBtn = document.getElementById('play-btn');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');
const submitBtn = document.getElementById('submit-btn');

let dataLoadingPromise = null;

const preloadData = async () => {
    try {
        const phonemes = await fetchPhonemes();
        if (!phonemes || phonemes.length === 0) {
            throw new Error("No phonemes fetched.");
        }
        await preloadPerfectPronunciationAudio(phonemes);
        return phonemes;
    } catch (error) {
        console.error('Preloading data failed:', error);
        sentryUtils.captureException(error, { 
            context: 'preloadData',
            phonemesLength: phonemes ? phonemes.length : 0 
        });
        throw error;
    }
};

const restartApp = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    removeThankYouScreen();
    state.resetStateForRestart();
    hideUploadProgress();

    // Clean up audio recorder resources
    cleanupAudioRecorder();

    // Restore the main UI
    removeFadeOutEffect();
    showGameUI(true);

    // Reset UI components
    updatePhonemeDisplay();
    updateProgressCounter();
    updateNavigationButtons();
};

const startApp = async () => {
    try {
        toggleStartButtonLoading(true);

        // Initialize audio recorder
        initializeAudioRecorder();

        const micGranted = await requestMicrophoneAccessAndUI();
        if (!micGranted) {
            toggleStartButtonLoading(false); // Hide loading on failure
            return; // The UI for mic access is handled by requestMicrophoneAccessAndUI
        }

        const phonemes = await dataLoadingPromise;

        // This check is important in case preloading failed
        if (!phonemes) {
            throw new Error("Phonemes not available. Preloading might have failed.");
        }

        const startContainer = document.getElementById('start-container');
        if (startContainer) {
            startContainer.remove();
        }
        showGameUI(true);

        createPhonemeBubbles();
        updatePhonemeDisplay();
        updateProgressCounter();
        updateNavigationButtons();

    } catch (error) {
        console.error('Starting app failed:', error);
        sentryUtils.captureException(error, { 
            context: 'startApp',
            step: 'app_initialization'
        });
        toggleStartButtonLoading(false);
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = 'Błąd podczas uruchamiania aplikacji.';
        }
        // Optionally, show the error on the start screen itself
        const startButton = document.getElementById('start-app-btn');
        if(startButton) {
            startButton.textContent = 'Błąd. Spróbuj odświeżyć stronę.';
        }
    }
};

const initializeApp = () => {
    initDOMElements();
    // Start preloading data in the background
    dataLoadingPromise = preloadData();
    createStartScreen(startApp);
};

recordBtn.addEventListener('click', handleRecord);
playbackBtn.addEventListener('click', handlePlayback);
playBtn.addEventListener('click', handlePlayPerfectPronunciation);
nextBtn.addEventListener('click', handleNext);
prevBtn.addEventListener('click', handlePrev);
submitBtn.addEventListener('click', () => handleSubmit(restartApp));

// Clean up resources when page is unloaded
window.addEventListener('beforeunload', () => {
    cleanupAudioRecorder();
});

// Handle page visibility change to stop recording if user switches tabs
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Only stop recording if there's actually a recording in progress
        try {
            if (state.getIsRecording()) {
                handleRecord(); // This will stop recording if currently recording
            }
        } catch (error) {
            console.log('Error stopping recording on visibility change:', error);
            sentryUtils.captureException(error, { 
                context: 'visibilitychange',
                isRecording: state.getIsRecording()
            });
        }
    }
});

document.addEventListener('DOMContentLoaded', initializeApp);
