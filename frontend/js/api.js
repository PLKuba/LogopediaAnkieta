import * as state from './state.js';
import * as dom from './dom.js';
import { BACKEND_URL } from './constants.js';
import { sentryUtils } from './sentry.js';

const delay = ms => new Promise(res => setTimeout(res, ms));

export async function fetchPhonemes() {
    try {
        sentryUtils.logInfo('Fetching phonemes from API', { url: `${BACKEND_URL}/phonemes` });
        
        const response = await fetch(`${BACKEND_URL}/phonemes`);
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error fetching phonemes:", errorText);
            sentryUtils.captureException(new Error(`Failed to fetch phonemes: ${response.status} ${errorText}`), {
                context: 'fetchPhonemes',
                responseStatus: response.status,
                responseText: errorText
            });
            throw new Error(`Failed to fetch phonemes: ${response.status}`);
        }
        const phonemes = await response.json();
        
        sentryUtils.logInfo('Phonemes fetched successfully', { 
            phonemesCount: phonemes.length,
            phonemes: phonemes.join(', ')
        });
        
        state.setPhonemes(phonemes);
        return phonemes;
    } catch (error) {
        console.error("Error fetching phonemes:", error);
        sentryUtils.captureException(error, { 
            context: 'fetchPhonemes',
            step: 'network_request'
        });
        dom.setStatus("Nie udało się załadować głosek. Spróbuj odświeżyć stronę.", "error");
        return null;
    }
}

export async function submitAllRecordings(restartHandler) {
    if (state.getIsUploading() || state.getHasSubmitted()) {
        sentryUtils.logWarning('Submission already in progress or completed', {
            isUploading: state.getIsUploading(),
            hasSubmitted: state.getHasSubmitted()
        });
        return;
    }

    sentryUtils.logInfo('Starting recording submission', { 
        recordingsCount: Object.keys(state.getRecordings()).length 
    });
    sentryUtils.logUserAction('submit_recordings_started');

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
                sentryUtils.captureException(error, { 
                    context: 'uploadRecording',
                    phoneme: phoneme,
                    attempt: 'single_upload'
                });
                failedCount++;
            }
        }

        if (failedCount === 0) {
            sentryUtils.logInfo('All recordings uploaded successfully', { 
                totalRecordings: Object.keys(recordings).length,
                failedCount: 0
            });
            sentryUtils.logUserAction('submit_recordings_success', { 
                totalRecordings: Object.keys(recordings).length 
            });
            
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
            sentryUtils.logError('Some recordings failed to upload', { 
                totalRecordings: Object.keys(recordings).length,
                failedCount: failedCount,
                uploadedCount: uploadedCount
            });
            sentryUtils.logUserAction('submit_recordings_partial_failure', { 
                totalRecordings: Object.keys(recordings).length,
                failedCount: failedCount
            });
            
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
        sentryUtils.captureException(error, { 
            context: 'submitAllRecordings',
            totalRecordings: Object.keys(state.getRecordings()).length
        });
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