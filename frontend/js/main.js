import {
    initDOMElements,
    initializeProgressBar as createPhonemeBubbles,
    updatePhonemeDisplay,
    updateProgress as updateProgressCounter,
    updateNavigationButtons,
    requestMicrophoneAccessAndUI,
    setMicrophoneAccessUI
} from './dom.js';
import {
    handleRecord,
    handlePlayback,
    handlePlayPerfectPronunciation,
    handleNext,
    handlePrev,
    handleSubmit,
    preloadPerfectPronunciationAudio,
} from './handlers.js';
import { fetchPhonemes } from './api.js';

const recordBtn = document.getElementById('record-btn');
const playbackBtn = document.getElementById('playback-btn');
const playBtn = document.getElementById('play-btn');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');
const submitBtn = document.getElementById('submit-btn');

const initializeApp = async () => {
    try {
        initDOMElements();
        // Check microphone access at start
        const micGranted = await requestMicrophoneAccessAndUI();
        if (!micGranted) {
            // Add event listener for retry button ONCE, not every time
            const retryHandler = async (e) => {
                if (e.target && e.target.id === 'mic-access-btn') {
                    const granted = await requestMicrophoneAccessAndUI();
                    if (granted) {
                        setMicrophoneAccessUI(true);
                        document.body.removeEventListener('click', retryHandler);
                        // Continue app initialization after permission granted
                        const phonemes = await fetchPhonemes();
                        if (!phonemes || phonemes.length === 0) {
                            throw new Error("No phonemes fetched.");
                        }
                        createPhonemeBubbles();
                        updatePhonemeDisplay();
                        updateProgressCounter();
                        updateNavigationButtons();
                        preloadPerfectPronunciationAudio(phonemes);
                    }
                }
            };
            document.body.addEventListener('click', retryHandler);
            return;
        }
        const phonemes = await fetchPhonemes();
        if (!phonemes || phonemes.length === 0) {
            throw new Error("No phonemes fetched.");
        }
        createPhonemeBubbles();
        updatePhonemeDisplay();
        updateProgressCounter();
        updateNavigationButtons();
        // Preload all perfect pronunciation audio files in the background
        preloadPerfectPronunciationAudio(phonemes);
    } catch (error) {
        console.error('Initialization failed:', error);
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = 'Błąd podczas inicjalizacji aplikacji.';
        }
    }
};

recordBtn.addEventListener('click', handleRecord);
playbackBtn.addEventListener('click', handlePlayback);
playBtn.addEventListener('click', handlePlayPerfectPronunciation);
nextBtn.addEventListener('click', handleNext);
prevBtn.addEventListener('click', handlePrev);
submitBtn.addEventListener('click', handleSubmit);

document.addEventListener('DOMContentLoaded', initializeApp);
