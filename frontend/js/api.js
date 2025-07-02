import * as state from './state.js';
import * as dom from './dom.js';
import { BACKEND_URL } from './constants.js';

const delay = ms => new Promise(res => setTimeout(res, ms));

export async function fetchPhonemes() {
    try {
        const response = await fetch(`${BACKEND_URL}/phonemes`);
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error fetching phonemes:", errorText);
            throw new Error(`Failed to fetch phonemes: ${response.statusText}`);
        }
        const phonemes = await response.json();
        state.setPhonemes(phonemes);
        return phonemes;
    } catch (error) {
        console.error("Error fetching phonemes:", error);
        dom.setStatus("Nie udało się załadować głosek. Spróbuj odświeżyć stronę.", "error");
        return null;
    }
}

export async function submitAllRecordings(restartHandler) {
    if (state.getIsUploading() || state.getHasSubmitted()) {
        return;
    }

    state.setIsUploading(true);
    dom.showUploadProgress(); // Ensure progress bar is shown
    // Also force display:block on .upload-progress in case CSS is overriding
    const uploadProgress = document.querySelector('.upload-progress');
    if (uploadProgress) {
        uploadProgress.style.display = 'block';
    }

    // Disable submit button and add disabled class
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('disabled');
    }

    const recordings = state.getRecordings();
    const totalRecordings = Object.keys(recordings).length;
    let uploadedCount = 0;
    let failedCount = 0;

    try {
        for (const [phoneme, blob] of Object.entries(recordings)) {
            try {
                const filename = `${phoneme}_${Date.now()}.webm`;
                const formData = new FormData();
                formData.append("audio", blob, filename);
                formData.append("phoneme", phoneme);

                const response = await fetch(`${BACKEND_URL}/upload`, {
                    method: "POST",
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`Upload failed for ${phoneme}`);
                }

                uploadedCount++;
                const progress = (uploadedCount / totalRecordings) * 100;
                dom.updateUploadProgress(progress);

            } catch (error) {
                console.error(`Error uploading ${phoneme}:`, error);
                failedCount++;
            }
        }

        if (failedCount === 0) {
            state.setHasSubmitted(true);
            state.setIsUploading(false);
            dom.updateUploadProgress(100);

            // Set margin-top of .control-row.submit-row to 0.1rem after successful submit
            const submitRow = document.querySelector('.control-row.submit-row');
            if (submitRow) {
                submitRow.style.marginTop = '0.1rem';
            }

            await delay(600);
            dom.hideUploadProgress();
            dom.setStatus(`Wysyłanie zakończone! (${totalRecordings}/${totalRecordings})`, "success");

            await delay(1000);
            dom.applyFadeOutEffect();

            await delay(1300);
            dom.createThankYouScreen(restartHandler, submitEmail);

        } else {
            dom.setStatus(`Wysłano ${uploadedCount} z ${totalRecordings} nagrań. ${failedCount} nie udało się wysłać.`, "error");
            state.setIsUploading(false);
            // Re-enable submit button on error
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('disabled');
            }
        }

    } catch (error) {
        console.error("Error during batch upload:", error);
        dom.setStatus("Wystąpił błąd podczas wysyłania nagrań.", "error");
        state.setIsUploading(false);
        // Re-enable submit button on error
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('disabled');
        }
    } finally {
        if (failedCount > 0) {
            state.setIsUploading(false);
            dom.hideUploadProgress();
        }
    }
}

export async function submitEmail() {
    const emailInput = document.getElementById('email-input');
    const email = emailInput.value.trim();
    const emailSubmitBtn = document.getElementById('email-submit');
    const emailForm = document.querySelector('.email-form');
    const emailDesc = emailForm ? emailForm.querySelector('.email-description') : null;

    function showInlineError(msg) {
        if (emailDesc) {
            emailDesc.textContent = msg;
            emailDesc.style.color = 'var(--error-color, red)';
        }
    }
    function showSuccess(msg) {
        if (emailForm) {
            emailForm.innerHTML = `<p class="email-description" style="color: var(--success-color); font-weight: bold;">${msg}</p>`;
        }
    }
    function showDuplicate() {
        if (emailForm) {
            emailForm.innerHTML = `<p class="email-description" style="font-weight: bold;">Ten email został już zapisany. Dziękujemy!</p>`;
        }
    }

    if (!email) {
        showInlineError('Proszę podać adres email.');
        return;
    }
    if (!isValidEmail(email)) {
        showInlineError('Proszę podać poprawny adres email.');
        return;
    }

    emailInput.disabled = true;
    emailSubmitBtn.disabled = true;
    emailSubmitBtn.classList.add('disabled');

    try {
        const response = await fetch(`${BACKEND_URL}/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            if (errorData.detail && errorData.detail.includes('already exists')) {
                showDuplicate();
            } else {
                showInlineError(errorData.detail || 'Błąd podczas zapisywania adresu email.');
            }
        } else {
            showSuccess('Poinformujemy Cię o wynikach badań.');
        }
    } catch (error) {
        console.error('Error submitting email:', error);
        showInlineError('Wystąpił błąd podczas zapisywania adresu email.');
        emailInput.disabled = false;
        emailSubmitBtn.disabled = false;
        emailSubmitBtn.classList.remove('disabled');
    }
}

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}
