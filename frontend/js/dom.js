import * as state from './state.js';

export const DOMElements = {};

export function initDOMElements() {
    const elementIds = [
        'status', 'record-btn', 'play-btn', 'playback-btn', 'prev-btn', 'next-btn', 'submit-btn',
        'upload-progress-container', 'upload-progress-bar', 'phoneme', 'phoneme-progress',
        'progress-counter', 'status-container', 'phoneme-display'
    ];
    const querySelectors = {
        progressContainer: '.progress-container',
        controls: '.controls',
        gameContainer: '.game-container'
    };

    elementIds.forEach(id => {
        const camelCaseId = id.replace(/-(\w)/g, (_, c) => c.toUpperCase());
        DOMElements[camelCaseId] = document.getElementById(id);
    });

    Object.keys(querySelectors).forEach(key => {
        DOMElements[key] = document.querySelector(querySelectors[key]);
    });

    return DOMElements;
}

export function setStatus(message, type = "") {
    if (!DOMElements.statusElement) {
        return;
    }

    const trimmedMessage = message ? message.trim() : "";
    const statusEl = DOMElements.statusElement;

    if (trimmedMessage !== "") {
        statusEl.textContent = trimmedMessage;
        statusEl.className = 'status status-has-content';
        statusEl.style.display = '';
        if (type) {
            const trimmedType = type.trim();
            if (trimmedType) {
                statusEl.classList.add(trimmedType);
            }
        }
    } else {
        statusEl.textContent = "";
        statusEl.className = 'status';
        statusEl.style.display = 'none'; // Hide when empty
    }
}

export function updatePhonemeDisplay() {
    if (DOMElements.phoneme) {
        DOMElements.phoneme.textContent = state.getPhonemes()[state.getCurrentPhonemeIndex()];
    }
}

export function updateNavigationButtons() {
    const { nextBtn, prevBtn, submitBtn, playbackBtn } = DOMElements;
    if (state.getIsRecording()) {
        if (nextBtn) nextBtn.disabled = true;
        if (prevBtn) prevBtn.disabled = true;
        if (submitBtn) submitBtn.classList.add('hidden');
        if (playbackBtn) playbackBtn.disabled = true;
        return;
    }

    if (nextBtn) nextBtn.disabled = !state.getAudioBlob();

    const isFirstPhoneme = state.getCurrentPhonemeIndex() === 0;
    const isLastPhoneme = state.getCurrentPhonemeIndex() === state.getPhonemes().length - 1;

    if (prevBtn) {
        prevBtn.disabled = isFirstPhoneme;
        prevBtn.style.display = isFirstPhoneme ? 'none' : 'flex';
    }

    if (nextBtn) {
        nextBtn.style.display = isLastPhoneme ? 'none' : 'flex';
    }

    // Show submit button only on last phoneme and if it has a recording
    if (submitBtn) {
        const recordings = state.getRecordings();
        const currentPhoneme = state.getPhonemes()[state.getCurrentPhonemeIndex()];
        const isRecorded = !!recordings[currentPhoneme];
        if (isLastPhoneme && isRecorded) {
            submitBtn.classList.remove('hidden');
            submitBtn.disabled = false;
        } else {
            submitBtn.classList.add('hidden');
            submitBtn.disabled = true;
        }
    }

    // Enable playback button if there is a recording OR a current audioBlob (just recorded)
    if (playbackBtn) {
        const recordings = state.getRecordings();
        const currentPhoneme = state.getPhonemes()[state.getCurrentPhonemeIndex()];
        playbackBtn.disabled = !(recordings[currentPhoneme] || state.getAudioBlob());
    }
}

export function applyFadeOutEffect() {
    DOMElements.progressContainer.classList.add('fade-out');
    DOMElements.phonemeDisplay.classList.add('fade-out');
    DOMElements.controls.classList.add('fade-out');
    DOMElements.statusContainer.classList.add('fade-out');
}

export function showUploadProgress() {
    const { uploadProgressContainer } = DOMElements;
    if (uploadProgressContainer) {
        uploadProgressContainer.classList.remove('hidden');
    }
}

export function updateUploadProgress(progress) {
    const { uploadProgressBar } = DOMElements;
    if (uploadProgressBar) {
        uploadProgressBar.style.width = `${progress}%`;
    }
}

export function hideUploadProgress() {
    const { uploadProgressContainer } = DOMElements;
    if (uploadProgressContainer) {
        uploadProgressContainer.classList.add('hidden');
    }
}

export function createThankYouScreen(restartHandler, emailHandler) {
    setStatus("");

    // Hide phoneme-display directly (in case classList is not enough)
    const phonemeDisplay = document.getElementById('phoneme-display');
    if (phonemeDisplay) {
        phonemeDisplay.classList.add('hidden');
        phonemeDisplay.style.display = 'none';
    }

    DOMElements.progressContainer.classList.add('hidden');
    DOMElements.phonemeDisplay.classList.add('hidden');
    DOMElements.controls.classList.add('hidden');
    DOMElements.uploadProgressContainer.classList.add('hidden');

    const thankYouContainer = document.createElement('div');
    thankYouContainer.id = 'thank-you-container';
    thankYouContainer.className = 'thank-you-container';

    thankYouContainer.innerHTML = `
        <div class="llama-container">
            <img src="assets/png/llama.png" alt="Lama" class="llama-image">
            <div class="speech-bubble">Dzięki za twój głos!</div>
        </div>
        <div class="email-form">
            <p class="email-description">Podaj nam swojego maila, a poinformujemy cię o wynikach naszych badań!</p>
            <p class="email-ps">PS. Obiecujemy jednego maila, bez zbędnego spamu :)</p>
            <div class="email-input-container">
                <input type="email" id="email-input" class="email-input" placeholder="Twój adres email">
                <button id="email-submit" class="btn-email-submit" disabled>Wyślij</button>
            </div>
        </div>
        <div class="restart-button-container">
            <button id="restart-btn" class="btn btn-primary">Rozpocznij ponownie</button>
        </div>
    `;

    DOMElements.gameContainer.appendChild(thankYouContainer);

    // Email validation logic for enabling/disabling the button
    const emailInput = document.getElementById('email-input');
    const emailSubmit = document.getElementById('email-submit');
    emailInput.addEventListener('input', () => {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (re.test(emailInput.value.trim())) {
            emailSubmit.disabled = false;
        } else {
            emailSubmit.disabled = true;
        }
    });

    document.getElementById('restart-btn').addEventListener('click', restartHandler);
    document.getElementById('email-submit').addEventListener('click', emailHandler);
}

export function initializeProgressBar() {
    const { phonemeProgress } = DOMElements;
    if (!phonemeProgress) {
        console.error("Progress container not found!");
        return;
    }

    phonemeProgress.innerHTML = "";

    const phonemesContainer = document.createElement("div");
    phonemesContainer.className = "phonemes-container";
    phonemesContainer.style.display = "flex";
    phonemesContainer.style.position = "relative";

    const progressLine = document.createElement("div");
    progressLine.className = "progress-line";
    const progressLineFill = document.createElement("div");
    progressLineFill.id = "progress-line-fill";
    progressLine.appendChild(progressLineFill);
    phonemesContainer.appendChild(progressLine);

    state.getPhonemes().forEach((phoneme, index) => {
        const bubble = document.createElement("div");
        bubble.className = "phoneme-bubble";
        bubble.textContent = phoneme;
        bubble.id = `phoneme-bubble-${index}`;
        bubble.title = `Głoska ${index + 1} z ${state.getPhonemes().length}: ${phoneme}`;
        phonemesContainer.appendChild(bubble);
    });

    phonemeProgress.appendChild(phonemesContainer);
}

export function updateProgress() {
    const phonemes = state.getPhonemes();
    const recordings = state.getRecordings();
    const currentPhonemeIndex = state.getCurrentPhonemeIndex();

    for (let i = 0; i < phonemes.length; i++) {
        const bubble = document.getElementById(`phoneme-bubble-${i}`);
        if (!bubble) continue;

        bubble.classList.remove("completed", "current");

        const phonemeName = phonemes[i];
        if (recordings[phonemeName]) {
            bubble.classList.add("completed");
        }

        if (i === currentPhonemeIndex) {
            bubble.classList.add("current");
            bubble.classList.remove("completed");
        }
    }

    if (DOMElements.progressCounter) {
        DOMElements.progressCounter.textContent = `Głoska ${currentPhonemeIndex + 1} z ${phonemes.length}`;
    }

    const progressLineFill = document.getElementById("progress-line-fill");
    if (progressLineFill) {
        const recordedCount = phonemes.filter(p => recordings[p]).length;
        const progressPercent = (recordedCount / phonemes.length) * 100;
        progressLineFill.style.width = `${progressPercent}%`;
    }
}

export function scrollCurrentPhonemeIntoView() {
    const currentBubble = document.getElementById(`phoneme-bubble-${state.getCurrentPhonemeIndex()}`);
    const { phonemeProgress } = DOMElements;

    if (!currentBubble || !phonemeProgress) return;

    const containerStyle = window.getComputedStyle(phonemeProgress);
    const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
    const containerVisibleWidth = phonemeProgress.clientWidth - (paddingLeft * 2);
    const visibleCenter = containerVisibleWidth / 2;
    const bubbleWidth = currentBubble.offsetWidth;
    const scrollPosition = (currentBubble.offsetLeft - visibleCenter + (bubbleWidth / 2));

    phonemeProgress.scrollTo({
        left: scrollPosition + paddingLeft / 2,
        behavior: 'smooth'
    });
}

export function adjustViewportForMobile() {
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
        const windowHeight = window.innerHeight;
        document.documentElement.style.setProperty('--vh', `${windowHeight * 0.01}px`);
    }

    document.body.addEventListener('focusin', () => {
        document.body.scrollTop = 0;
    });

    document.body.addEventListener('focusout', () => {
        document.body.scrollTop = 0;
    });

    window.addEventListener('resize', () => {
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
        document.body.style.display = 'none';
        setTimeout(() => {
            document.body.style.display = '';
        }, 0);
    });
}

export function addCustomStyles() {
    const style = document.createElement("style");
    style.innerHTML = `
        @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-15px); }
        }
        .bounce {
            animation: bounce 0.5s;
        }
        @keyframes speaking {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        .speaking {
            animation: speaking 0.5s infinite;
        }

        /* --- START: CSS for Email Input Layout --- */

        .email-input-container {
            display: flex;
            align-items: center; /* Vertically aligns the items in the middle */
            gap: 5px; /* Optional: adds a small space between the input and button */
        }

        .email-input {
            flex-grow: 1; /* Allows the input field to take up the available space */
        }

        .btn-email-submit {
            flex-shrink: 0; /* Prevents the button from shrinking */
        }

        /* --- END: CSS for Email Input Layout --- */
    `;
    document.head.appendChild(style);
}

export function setMicrophoneAccessUI(isGranted) {
    const controls = document.querySelectorAll('.btn, .btn-submit, .btn-nav, .btn-play, .btn-playback');
    controls.forEach(btn => {
        // Don't disable the mic access button
        if (btn.id === 'mic-access-btn') return;
        btn.disabled = !isGranted;
        if (!isGranted) {
            btn.classList.add('disabled');
        } else {
            btn.classList.remove('disabled');
        }
    });
    // Show/hide overlay or message
    let micOverlay = document.getElementById('mic-access-overlay');
    if (!isGranted) {
        if (!micOverlay) {
            micOverlay = document.createElement('div');
            micOverlay.id = 'mic-access-overlay';
            micOverlay.style.position = 'fixed';
            micOverlay.style.top = 0;
            micOverlay.style.left = 0;
            micOverlay.style.width = '100vw';
            micOverlay.style.height = '100vh';
            micOverlay.style.background = 'rgba(255,255,255,0.95)';
            micOverlay.style.zIndex = 9999;
            micOverlay.style.display = 'flex';
            micOverlay.style.flexDirection = 'column';
            micOverlay.style.alignItems = 'center';
            micOverlay.style.justifyContent = 'center';
            micOverlay.innerHTML = `
                <div style="max-width: 350px; width: 90vw; text-align: center; display: flex; flex-direction: column; align-items: center;">
                  <h2 style="color: var(--error-color, #FC5C65); margin-bottom: 1rem;">Brak dostępu do mikrofonu</h2>
                  <p style="font-size: 1.1rem; margin-bottom: 1.5rem;">Aby korzystać z aplikacji, musisz zezwolić na dostęp do mikrofonu.<br>Proszę kliknąć poniższy przycisk, aby spróbować ponownie.</p>
                  <button id="mic-access-btn" class="btn btn-primary" style="margin-top: 1rem; display: block; margin-left: auto; margin-right: auto; padding: 1.1rem 2.5rem; font-size: 1.05rem; max-width: 100%; width: 100%; white-space: normal; word-break: break-word; line-height: 1.25; box-sizing: border-box;">Zezwól na dostęp do mikrofonu</button>
                </div>
            `;
            document.body.appendChild(micOverlay);
        } else {
            micOverlay.style.display = 'flex';
        }
    } else if (micOverlay) {
        micOverlay.style.display = 'none';
    }
}

export async function requestMicrophoneAccessAndUI() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.setMicrophoneStream(stream);
        setMicrophoneAccessUI(true);
        return true;
    } catch (error) {
        setMicrophoneAccessUI(false);
        // Optionally log error, but do not rethrow
        return false;
    }
}
