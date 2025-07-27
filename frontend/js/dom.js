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

export function showGameUI(shouldShow) {
    const displayStyle = shouldShow ? '' : 'none';
    const elements = [
        DOMElements.progressContainer,
        DOMElements.phonemeDisplay,
        DOMElements.controls,
        DOMElements.statusContainer
    ];
    elements.forEach(el => {
        if (el) {
            el.style.display = displayStyle;
            // Also remove the hidden class if we are showing the UI
            if (shouldShow) {
                el.classList.remove('hidden');
            }
        }
    });
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

export function updateNavigationButtons(isPlaying) {
    const { nextBtn, prevBtn, submitBtn, playbackBtn } = DOMElements;

    if (isPlaying) {
        if (nextBtn) nextBtn.disabled = true;
        if (prevBtn) prevBtn.disabled = true;
        if (submitBtn) submitBtn.disabled = true;
        // playbackBtn should remain enabled
        return;
    }

    if (state.getIsRecording()) {
        if (nextBtn) nextBtn.disabled = true;
        if (prevBtn) prevBtn.disabled = true;
        if (submitBtn) submitBtn.classList.add('hidden');
        if (playbackBtn) playbackBtn.disabled = true;
        // Also reset playback button states when recording
        setPlaybackButtonStates(false, false);
        return;
    }

    // Reset playback button states when not playing and not recording
    if (isPlaying === false || isPlaying === undefined) {
        setPlaybackButtonStates(false, false);
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
            submitBtn.classList.remove('disabled');
            submitBtn.style.backgroundColor = ''; // Reset background color
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

export function removeFadeOutEffect() {
    DOMElements.progressContainer.classList.remove('fade-out');
    DOMElements.phonemeDisplay.classList.remove('fade-out');
    DOMElements.controls.classList.remove('fade-out');
    DOMElements.statusContainer.classList.remove('fade-out');
}

export function toggleActionButtons(disabled) {
    const { recordBtn, playBtn } = DOMElements;
    if (recordBtn) recordBtn.disabled = disabled;
    if (playBtn) playBtn.disabled = disabled;
}

export function setPlaybackButtonStates(playingPerfect, playingUserRecording) {
    const { playBtn, playbackBtn } = DOMElements;
    
    if (playingPerfect) {
        // Perfect pronunciation is playing
        if (playBtn) {
            playBtn.classList.add('active');
            playBtn.disabled = false; // Keep it enabled so user can see it's active
        }
        if (playbackBtn) {
            playbackBtn.disabled = true; // Disable user recording playback
        }
    } else if (playingUserRecording) {
        // User recording is playing
        if (playbackBtn) {
            playbackBtn.classList.add('active');
            playbackBtn.disabled = false; // Keep it enabled so user can see it's active
        }
        if (playBtn) {
            playBtn.disabled = true; // Disable perfect pronunciation
        }
    } else {
        // Nothing is playing - reset both buttons
        if (playBtn) {
            playBtn.classList.remove('active');
            playBtn.disabled = false;
        }
        if (playbackBtn) {
            playbackBtn.classList.remove('active');
            playbackBtn.disabled = !state.getAudioBlob(); // Enable only if there's a recording
        }
    }
}

export function showUploadProgress() {
    const { uploadProgressContainer } = DOMElements;
    if (uploadProgressContainer) {
        uploadProgressContainer.classList.remove('hidden');
        uploadProgressContainer.style.display = '';
    }
}

export function updateUploadProgress(progress) {
    const { uploadProgressBar } = DOMElements;
    if (uploadProgressBar) {
        uploadProgressBar.style.width = `${progress}%`;
    }
}

export function hideUploadProgress() {
    const { uploadProgressContainer, uploadProgressBar, submitBtn } = DOMElements;
    if (uploadProgressContainer) {
        uploadProgressContainer.classList.add('hidden');
        uploadProgressContainer.style.display = 'none';
    }
    if (uploadProgressBar) {
        uploadProgressBar.style.width = '0%';
    }
    if (submitBtn) {
        submitBtn.style.display = 'block';
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
        <div class="thank-you-content" style="display: flex; flex-direction: column; align-items: center;">
            <div class="llama-container" style="position: relative; display: flex; flex-direction: column; align-items: center;">
                <img src="assets/png/llama.png" alt="Lama" class="llama-image" style="max-width: 180px;">
                <div class="speech-bubble">Udało się!</div>
            </div>
            <h2 style="color: var(--text-primary-color); margin-top: 1.2rem;">Dzięki!</h2>
            
            <div class="email-form" style="margin-bottom: 2rem; width: 100%; max-width: 420px;">
                <p class="email-description" style="margin-bottom: 1.2rem;">Chcesz otrzymać powiadomienie o wynikach badania? Zostaw nam swój adres email.</p>
                <p class="email-ps">PS. Nie wysyłamy spamu, obiecujemy!</p>
                <div class="email-input-container">
                    <input type="email" id="email-input" class="email-input" placeholder="twój@email.com">
                    <button id="email-submit" class="btn-email-submit">Wyślij</button>
                </div>
            </div>

            <div class="restart-button-container">
                <button id="restart-btn" class="btn btn-primary btn-restart">Zacznij ponownie</button>
            </div>
        </div>
    `;

    DOMElements.gameContainer.appendChild(thankYouContainer);

    document.getElementById('restart-btn').addEventListener('click', restartHandler);
    document.getElementById('email-submit').addEventListener('click', emailHandler);
}

export function removeThankYouScreen() {
    const thankYouContainer = document.getElementById('thank-you-container');
    if (thankYouContainer) {
        thankYouContainer.remove();
    }
}

export function createStartScreen(startHandler) {
    showGameUI(false);

    const startContainer = document.createElement('div');
    startContainer.id = 'start-container';
    startContainer.style.textAlign = 'center';
    startContainer.style.padding = '2rem';
    startContainer.style.display = 'flex';
    startContainer.style.flexDirection = 'column';
    startContainer.style.alignItems = 'center';
    startContainer.style.justifyContent = 'center';
    startContainer.style.height = '100%';


    startContainer.innerHTML = `
        <div class="llama-container" style="margin-bottom: 1.2rem;">
             <img src="assets/png/llama.png" alt="Lama" class="llama-image" style="max-width: 150px; margin-bottom: 1.2rem;">
        </div>
        <h2 style="margin-bottom: 1.2rem; color: var(--text-primary-color);">Hejo! Jestem lama</h2>
        <p style="margin-bottom: 2rem; font-size: 1.1.2rem; max-width: 400px; color: var(--text-secondary-color);">Chcesz być moim pomocnikiem i powiedzieć kilka głosek?</p>
        <button id="start-app-btn" class="btn btn-primary btn-start">Zaczynamy!</button>
    `;

    DOMElements.gameContainer.prepend(startContainer);

    document.getElementById('start-app-btn').addEventListener('click', startHandler, { once: true });
}

export function toggleStartButtonLoading(isLoading) {
    const startButton = document.getElementById('start-app-btn');
    if (!startButton) return;

    if (isLoading) {
        startButton.disabled = true;
        startButton.innerHTML = `
            <span class="loader"></span>
            Ładowanie...
        `;
    } else {
        startButton.disabled = false;
        startButton.innerHTML = 'Zaczynamy!';
    }
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
        @keyframes pulse {
            0%, 100% { opacity: 0.7; }
            50% { opacity: 0.3; }
        }

        /* --- START: CSS for Email Input Layout --- */

        .email-input-container {
            display: flex;
            align-items: center; /* Vertically aligns the items in the middle */
            gap: 5px;
        }

        .email-input {
            flex: 1;
            padding: 0.75rem;
            font-size: 1.2rem;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            outline: none;
            transition: border-color 0.3s;
        }

        .email-input:focus {
            border-color: var(--primary-color);
        }

        .btn-email-submit {
            padding: 0.75rem 1.5rem;
            font-size: 1.2rem;
            color: #fff;
            background-color: var(--primary-color);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.3s;
        }

        .btn-email-submit:hover {
            background-color: var(--primary-color-hover);
        }

        .email-ps {
            font-size: 0.5rem;
            color: #D3D3D3;
            margin-top: 0.5rem;
        }

        /* --- END: CSS for Email Input Layout --- */
    `;
    document.head.appendChild(style);
}

export function setMicrophoneAccessUI(isGranted, message = "", hideRetryButton = false) {
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
                  <h2 style="color: var(--error-color, #FC5C65); margin-bottom: 1.2rem;">Brak dostępu do mikrofonu</h2>
                  <p id="mic-access-message" style="font-size: 1.1.2rem; margin-bottom: 1.5rem;">${message || 'Aby korzystać z aplikacji, musisz zezwolić na dostęp do mikrofonu.<br>Proszę kliknąć poniższy przycisk, aby spróbować ponownie.'}</p>
                  <button id="mic-access-btn" class="btn btn-primary" style="margin-top: 1.2rem; display: ${hideRetryButton ? 'none' : 'block'}; margin-left: auto; margin-right: auto; padding: 1.1.2rem 2.5rem; font-size: 1.05rem; max-width: 100%; width: 100%; white-space: normal; word-break: break-word; line-height: 1.25; box-sizing: border-box;">Zezwól na dostęp do mikrofonu</button>
                </div>
            `;
            document.body.appendChild(micOverlay);
        } else {
            const messageEl = document.getElementById('mic-access-message');
            const buttonEl = document.getElementById('mic-access-btn');
            if (messageEl) {
                messageEl.innerHTML = message || 'Aby korzystać z aplikacji, musisz zezwolić na dostęp do mikrofonu.<br>Proszę kliknąć poniższy przycisk, aby spróbować ponownie.';
            }
            if(buttonEl) {
                buttonEl.style.display = hideRetryButton ? 'none' : 'block';
            }
            micOverlay.style.display = 'flex';
        }
    } else if (micOverlay) {
        micOverlay.style.display = 'none';
    }
}

export async function requestMicrophoneAccessAndUI() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error("getUserMedia not supported on this browser!");
        // Display a message to the user that their browser is not supported.
        setMicrophoneAccessUI(false, "Twoja przeglądarka nie wspiera nagrywania dźwięku. Spróbuj użyć innej przeglądarki, np. Chrome lub Safari.", true);
        return false;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.setMicrophoneStream(stream);
        setMicrophoneAccessUI(true);
        return true;
    } catch (error) {
        console.error("Error requesting microphone access:", error);
        if (navigator.permissions) {
            try {
                const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
                
                const handlePermissionChange = () => {
                    if (permissionStatus.state === 'denied') {
                        const message = `Wygląda na to, że dostęp do mikrofonu został zablokowany. <br><br> Aby kontynuować, musisz ręcznie włączyć uprawnienia w ustawieniach przeglądarki (zazwyczaj ikona kłódki obok paska adresu).`;
                        setMicrophoneAccessUI(false, message, true); // hideRetryButton = true
                    } else {
                        setMicrophoneAccessUI(false);
                    }
                };

                permissionStatus.onchange = handlePermissionChange;
                handlePermissionChange(); // Initial check

            } catch (permError) {
                console.error("Could not query permissions:", permError);
                setMicrophoneAccessUI(false);
            }
        } else {
            // Fallback for browsers that don't support Permissions API
            setMicrophoneAccessUI(false);
        }
        return false;
    }
}

export function showInstructionsPopup(phonemeCount, onContinue) {
    const popup = document.createElement('div');
    popup.id = 'instructions-popup';
    popup.style.animation = 'fadeIn 0.3s ease-out';

    const popupContent = document.createElement('div');
    popupContent.className = 'popup-content';
    popupContent.style.animation = 'slideIn 0.4s ease-out';

    popupContent.innerHTML = `
        <h2>🦙 Zanim zaczniemy, krótka instrukcja</h2>
        <div class="instruction-text">
            <p>Twoim zadaniem będzie nagranie <strong>${phonemeCount} głosek</strong>.</p>
            <ul style="text-align: left; margin: 1rem 0; padding-left: 1.5rem;">
                <li>Bez obaw twoje nagrania są w <strong style="color: var(--primary-color, #007bff);">pełni anonimowe</strong>, nie zbierane są <strong style="color: var(--primary-color, #007bff);">żadne</strong> dodatkowe informacje oprócz głosu</li>
                <li>Aby rozpocząć nagrywanie, kliknij <strong style="color: #FC5C65;">czerwony</strong> przycisk mikrofonu</li>
                <li>Jeśli nagranie się nie udało, bez obaw - po prostu kliknij mikrofon ponownie</li>
                <li>Jeśli nie jesteś pewien poprawnej wymowy, kliknij <strong style="color: #FFD23F;">żółty</strong> przycisk - usłyszysz głos logopedy</li>
            </ul>
            <p style="font-size: 0.9rem; margin-top: 1.5rem; color: var(--text-secondary-color);">
                Korzystając z aplikacji, wyrażasz zgodę na przetwarzanie nagrań głosowych zgodnie z 
                <a href="privacy-policy" target="_blank" style="color: var(--primary-color); text-decoration: underline;">
                    Polityką Prywatności
                </a>.
            </p>
        </div>
        <button id="instructions-continue-btn" class="btn btn-primary" style="padding: 0.8rem 2rem;">
            Jedziemy!
        </button>
    `;

    popup.appendChild(popupContent);
    document.body.appendChild(popup);

    // Continue button handler
    document.getElementById('instructions-continue-btn').addEventListener('click', () => {
        popup.style.animation = 'fadeOut 0.3s ease-out forwards';
        popupContent.style.animation = 'slideOut 0.3s ease-out forwards';
        
        setTimeout(() => {
            document.body.removeChild(popup);
            onContinue();
        }, 300);
    }, { once: true });
}
