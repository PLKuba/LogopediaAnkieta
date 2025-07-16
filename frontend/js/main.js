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
    hideUploadProgress,
    scrollCurrentPhonemeIntoView,
    showInstructionsPopup
} from './dom.js';
import {
    handleRecord,
    handlePlayback,
    handlePlayPerfectPronunciation,
    handleNext,
    handlePrev,
    handleSubmit,
    preloadAudioProgressively,
    updatePhonemesProgressively,
    initializeAudioRecorder,
    cleanupAudioRecorder
} from './handlers.js';
import { fetchInitialPhonemes } from './api.js';
import * as state from './state.js';
import { sentryUtils } from './sentry.js';

const recordBtn = document.getElementById('record-btn');
const playbackBtn = document.getElementById('playback-btn');
const playBtn = document.getElementById('play-btn');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');
const submitBtn = document.getElementById('submit-btn');

let dataLoadingPromise = null;
let backgroundLoadingPromise = null;

const preloadData = async () => {
    try {
        sentryUtils.logInfo('Starting progressive data preload', { step: 'preload_start' });
        
        // Fetch initial phonemes (first 2) for quick start
        const { initialPhonemes, allPhonemes } = await fetchInitialPhonemes(2);
        
        if (!initialPhonemes || initialPhonemes.length === 0) {
            sentryUtils.logError('No initial phonemes fetched during preload', { phonemesCount: 0 });
            throw new Error("No initial phonemes fetched.");
        }
        
        sentryUtils.logInfo('Initial phonemes fetched successfully', { 
            initialCount: initialPhonemes.length,
            totalCount: allPhonemes.length
        });
        
        // Preload audio for initial phonemes only
        await preloadAudioProgressively(allPhonemes, 2);
        
        sentryUtils.logInfo('Initial data preload completed successfully', { 
            initialPhonemes: initialPhonemes.length,
            totalPhonemes: allPhonemes.length,
            step: 'initial_preload_complete' 
        });
        
        // Start background loading of remaining phonemes
        backgroundLoadingPromise = loadRemainingDataInBackground(allPhonemes);
        
        return { initialPhonemes, allPhonemes };
    } catch (error) {
        console.error('Preloading initial data failed:', error);
        sentryUtils.captureException(error, { 
            context: 'preloadData',
            step: 'initial_preload'
        });
        throw error;
    }
};

const loadRemainingDataInBackground = async (allPhonemes) => {
    try {
        sentryUtils.logInfo('Starting background data loading', { 
            totalPhonemes: allPhonemes.length 
        });
        
        // Small delay to ensure UI is shown first
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Update state and UI with all phonemes
        updatePhonemesProgressively(allPhonemes);
        
        // Update UI components with all phonemes
        createPhonemeBubbles();
        updateProgressCounter();
        updateNavigationButtons();
        
        // Scroll to current phoneme after UI update (in case user is not on first phoneme)
        setTimeout(() => {
            scrollCurrentPhonemeIntoView();
        }, 200);
        
        sentryUtils.logInfo('Background data loading completed', { 
            totalPhonemes: allPhonemes.length 
        });
        
        return allPhonemes;
    } catch (error) {
        console.error('Background loading failed:', error);
        sentryUtils.logWarning('Background data loading failed', { 
            error: error.message,
            totalPhonemes: allPhonemes.length
        });
        // Don't throw - app can continue with initial phonemes
        return null;
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
    
    // Auto-scroll to the first phoneme
    setTimeout(() => {
        scrollCurrentPhonemeIntoView();
        sentryUtils.logUserAction('app_restarted', { 
            scrolledToFirstPhoneme: true 
        });
    }, 100); // Small delay to ensure UI is rendered
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

        const { initialPhonemes, allPhonemes } = await dataLoadingPromise;

        // This check is important in case preloading failed
        if (!initialPhonemes || !allPhonemes) {
            sentryUtils.logError('Phonemes not available after preload', { step: 'phonemes_check' });
            throw new Error("Phonemes not available. Preloading might have failed.");
        }

        // Show instructions popup only on first launch
        if (!state.getHasShownInstructions()) {
            sentryUtils.logInfo('Showing instructions popup for first-time user');
            sentryUtils.logUserAction('instructions_popup_shown');
            
            await new Promise(resolve => {
                showInstructionsPopup(allPhonemes.length, () => {
                    state.setHasShownInstructions(true);
                    sentryUtils.logUserAction('instructions_popup_dismissed');
                    resolve();
                });
            });
        }

        const startContainer = document.getElementById('start-container');
        if (startContainer) {
            startContainer.remove();
        }
        showGameUI(true);

        // Initialize UI with initial phonemes - will be updated when background loading completes
        createPhonemeBubbles();
        updatePhonemeDisplay();
        updateProgressCounter();
        updateNavigationButtons();
        
        // Show subtle loading indicator for background loading
        const progressContainer = document.querySelector('.progress-container');
        if (progressContainer && allPhonemes.length > initialPhonemes.length) {
            const loadingIndicator = document.createElement('div');
            loadingIndicator.id = 'background-loading-indicator';
            loadingIndicator.style.cssText = `
                position: absolute;
                top: -10px;
                right: 10px;
                font-size: 0.7rem;
                color: #666;
                opacity: 0.7;
                animation: pulse 2s infinite;
            `;
            loadingIndicator.textContent = 'Ładowanie...';
            progressContainer.style.position = 'relative';
            progressContainer.appendChild(loadingIndicator);
            
            // Remove indicator when background loading completes
            backgroundLoadingPromise.finally(() => {
                const indicator = document.getElementById('background-loading-indicator');
                if (indicator) {
                    indicator.remove();
                }
            });
        }
        
        sentryUtils.logInfo('Application started successfully with initial phonemes', { 
            initialPhonemes: initialPhonemes.length,
            totalPhonemes: allPhonemes.length,
            step: 'app_complete' 
        });
        sentryUtils.logUserAction('app_started', { 
            initialPhonemes: initialPhonemes.length,
            totalPhonemes: allPhonemes.length 
        });

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
    
    // Check if Session Replay is available and log its status
    if (typeof window.Sentry !== 'undefined') {
        try {
            // In Sentry 8.0.0, we can check for replay integration differently
            const client = window.Sentry.getClient();
            const options = client?.getOptions();
            
            if (options?.replaysSessionSampleRate || options?.replaysOnErrorSampleRate) {
                sentryUtils.logInfo('Sentry Session Replay initialized', {
                    sessionSampleRate: options.replaysSessionSampleRate,
                    errorSampleRate: options.replaysOnErrorSampleRate,
                    feature: 'session_replay_enabled'
                });
                console.log('✅ Sentry Session Replay is active');
            } else {
                console.log('ℹ️ Sentry Session Replay configuration not detected, but may still be active via CDN');
            }
        } catch (error) {
            console.log('ℹ️ Could not check Sentry Session Replay status, but Sentry is loaded:', error.message);
        }
    }
    
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