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
        sentryUtils.logInfo('Starting data preload', { step: 'preload_start' });
        
        const phonemes = await fetchPhonemes();
        if (!phonemes || phonemes.length === 0) {
            sentryUtils.logError('No phonemes fetched during preload', { phonemesCount: 0 });
            throw new Error("No phonemes fetched.");
        }
        
        sentryUtils.logInfo('Phonemes fetched successfully', { phonemesCount: phonemes.length });
        
        await preloadPerfectPronunciationAudio(phonemes);
        
        sentryUtils.logInfo('Data preload completed successfully', { 
            phonemesCount: phonemes.length,
            step: 'preload_complete' 
        });
        
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
        sentryUtils.logInfo('Starting application', { step: 'app_start' });
        sentryUtils.logUserAction('app_start_initiated');
        
        toggleStartButtonLoading(true);

        // Initialize audio recorder
        sentryUtils.logInfo('Initializing audio recorder');
        initializeAudioRecorder();

        const micGranted = await requestMicrophoneAccessAndUI();
        if (!micGranted) {
            sentryUtils.logWarning('Microphone access denied by user', { step: 'microphone_access' });
            toggleStartButtonLoading(false); // Hide loading on failure
            return; // The UI for mic access is handled by requestMicrophoneAccessAndUI
        }
        
        sentryUtils.logInfo('Microphone access granted', { step: 'microphone_access' });

        const phonemes = await dataLoadingPromise;

        // This check is important in case preloading failed
        if (!phonemes) {
            sentryUtils.logError('Phonemes not available after preload', { step: 'phonemes_check' });
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
        
        sentryUtils.logInfo('Application started successfully', { 
            phonemesCount: phonemes.length,
            step: 'app_complete' 
        });
        sentryUtils.logUserAction('app_started', { phonemesCount: phonemes.length });

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
    sentryUtils.logInfo('Initializing application', { step: 'init_start' });
    
    initDOMElements();
    // Start preloading data in the background
    dataLoadingPromise = preloadData();
    createStartScreen(startApp);
    
    sentryUtils.logInfo('Application initialization complete', { step: 'init_complete' });
};

recordBtn.addEventListener('click', () => {
    sentryUtils.logUserAction('record_button_clicked');
    handleRecord();
});
playbackBtn.addEventListener('click', () => {
    sentryUtils.logUserAction('playback_button_clicked');
    handlePlayback();
});
playBtn.addEventListener('click', () => {
    sentryUtils.logUserAction('perfect_pronunciation_button_clicked');
    handlePlayPerfectPronunciation();
});
nextBtn.addEventListener('click', () => {
    sentryUtils.logUserAction('next_button_clicked', { 
        currentPhoneme: state.getCurrentPhonemeIndex() 
    });
    handleNext();
});
prevBtn.addEventListener('click', () => {
    sentryUtils.logUserAction('prev_button_clicked', { 
        currentPhoneme: state.getCurrentPhonemeIndex() 
    });
    handlePrev();
});
submitBtn.addEventListener('click', () => {
    sentryUtils.logUserAction('submit_button_clicked');
    handleSubmit(restartApp);
});

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