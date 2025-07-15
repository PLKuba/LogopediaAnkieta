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

// New function to fetch initial phonemes for quick start
export async function fetchInitialPhonemes(count = 2) {
    try {
        sentryUtils.logInfo('Fetching initial phonemes for quick start', { 
            url: `${BACKEND_URL}/phonemes`,
            requestedCount: count
        });
        
        const response = await fetch(`${BACKEND_URL}/phonemes`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch phonemes: ${response.status} ${errorText}`);
        }
        const allPhonemes = await response.json();
        
        // Take only the first 'count' phonemes for quick start
        const initialPhonemes = allPhonemes.slice(0, count);
        
        sentryUtils.logInfo('Initial phonemes fetched successfully', { 
            totalPhonemes: allPhonemes.length,
            initialCount: initialPhonemes.length,
            initialPhonemes: initialPhonemes.join(', ')
        });
        
        // Set initial phonemes in state
        state.setPhonemes(initialPhonemes);
        
        return { initialPhonemes, allPhonemes };
    } catch (error) {
        console.error("Error fetching initial phonemes:", error);
        sentryUtils.captureException(error, { 
            context: 'fetchInitialPhonemes',
            step: 'network_request'
        });
        throw error;
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

    try {
        // Check if we should use mobile-friendly upload
        const isMobile = isMobileDevice();
        const isIOS = isIOSDevice();
        const estimatedSize = estimateFormDataSize(recordings);
        const sizeLimitMB = isIOS ? 25 : 50; // iOS has stricter limits
        const shouldUseFallback = isMobile && (estimatedSize > sizeLimitMB * 1024 * 1024);

        console.log('Upload strategy decision:', {
            isMobile,
            isIOS,
            estimatedSizeMB: Math.round(estimatedSize / (1024 * 1024)),
            sizeLimitMB,
            shouldUseFallback,
            totalRecordings
        });

        if (shouldUseFallback) {
            sentryUtils.logInfo('Using individual upload fallback for mobile', {
                reason: 'size_limit_exceeded',
                estimatedSizeMB: Math.round(estimatedSize / (1024 * 1024)),
                device: isIOS ? 'iOS' : 'mobile'
            });

            // Use individual uploads for mobile when size is too large
            const { uploadedCount, failedCount } = await submitRecordingsIndividually(recordings, totalRecordings);
            
            if (failedCount === 0) {
                // All individual uploads succeeded
                sentryUtils.logInfo('All recordings uploaded successfully via individual upload', { 
                    totalRecordings: totalRecordings,
                    uploadMethod: 'individual_fallback'
                });
                sentryUtils.logUserAction('submit_recordings_success', { 
                    totalRecordings: totalRecordings,
                    uploadMethod: 'individual_fallback'
                });
                
                state.setHasSubmitted(true);
                state.setIsUploading(false);

                // Set margin-top of .control-row.submit-row to 0.1.2rem after successful submit
                const submitRow = document.querySelector('.control-row.submit-row');
                if (submitRow) {
                    submitRow.style.marginTop = '0.1.2rem';
                }

                await delay(600);
                dom.hideUploadProgress();
                dom.setStatus(`Wysyłanie zakończone! (${totalRecordings}/${totalRecordings})`, "success");

                await delay(1000);
                dom.applyFadeOutEffect();

                await delay(1300);
                dom.createThankYouScreen(restartHandler, submitEmail);

            } else {
                // Some individual uploads failed
                sentryUtils.logError('Some recordings failed to upload via individual upload', { 
                    totalRecordings: totalRecordings,
                    failedCount: failedCount,
                    uploadedCount: uploadedCount,
                    uploadMethod: 'individual_fallback'
                });
                
                dom.setStatus(`Wysłano ${uploadedCount} z ${totalRecordings} nagrań. ${failedCount} nie udało się wysłać.`, "error");
                state.setIsUploading(false);
                dom.hideUploadProgress();
                // Re-enable submit button on error
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('disabled');
                }
            }
            return; // Exit early after individual upload
        }

        // Continue with bulk upload for desktop/small uploads
        // Prepare FormData for bulk upload
        const formData = new FormData();
        const phonemes = [];
        
        // Add all audio files and collect phoneme names
        for (const [phoneme, blob] of Object.entries(recordings)) {
            const filename = `${phoneme}_${Date.now()}.wav`;
            formData.append("audios", blob, filename);
            phonemes.push(phoneme);
        }
        
        console.log('Preparing bulk upload:', { 
            totalRecordings: totalRecordings, 
            phonemes: phonemes 
        });
        
        // Add phonemes as form data
        phonemes.forEach(phoneme => {
            formData.append("phonemes", phoneme);
        });

        // Show upload progress
        dom.updateUploadProgress(50); // Show progress while uploading

        // Single bulk upload request
        const response = await fetch(`${BACKEND_URL}/upload_bulk`, {
            method: "POST",
            body: formData
        });

        const responseText = await response.text();
        console.log('Bulk upload response:', { status: response.status, message: responseText });
        
        if (response.ok) {
            // Success: all files uploaded
            dom.updateUploadProgress(100);
            sentryUtils.logInfo('All recordings uploaded successfully', { 
                totalRecordings: totalRecordings,
                responseMessage: responseText
            });
            sentryUtils.logUserAction('submit_recordings_success', { 
                totalRecordings: totalRecordings 
            });
            
            state.setHasSubmitted(true);
            state.setIsUploading(false);

            // Set margin-top of .control-row.submit-row to 0.1.2rem after successful submit
            const submitRow = document.querySelector('.control-row.submit-row');
            if (submitRow) {
                submitRow.style.marginTop = '0.1.2rem';
            }

            await delay(600);
            dom.hideUploadProgress();
            dom.setStatus(`Wysyłanie zakończone! (${totalRecordings}/${totalRecordings})`, "success");

            await delay(1000);
            dom.applyFadeOutEffect();

            await delay(1300);
            dom.createThankYouScreen(restartHandler, submitEmail);

        } else if (response.status === 207) {
            // Partial success (some files failed)
            console.warn('Partial upload success:', responseText);
            sentryUtils.logWarning('Some recordings failed to upload', { 
                totalRecordings: totalRecordings,
                responseMessage: responseText,
                statusCode: response.status
            });
            sentryUtils.logUserAction('submit_recordings_partial_failure', { 
                totalRecordings: totalRecordings,
                responseMessage: responseText
            });
            
            dom.setStatus(`Częściowe wysłanie zakończone. Sprawdź szczegóły.`, "warning");
            state.setIsUploading(false);
            dom.hideUploadProgress();
            // Re-enable submit button on partial failure
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('disabled');
            }

        } else {
            // Complete failure
            throw new Error(`Upload failed with status ${response.status}: ${responseText}`);
        }

    } catch (error) {
        console.error("Error during bulk upload:", error);
        
        // Check if this is a mobile device and we should retry with individual uploads
        const isMobile = isMobileDevice();
        const isLoadFailed = error.message && error.message.includes('Load failed');
        const isNetworkError = error.name === 'TypeError' && (error.message.includes('Load failed') || error.message.includes('Failed to fetch'));
        
        if (isMobile && (isLoadFailed || isNetworkError)) {
            console.log('Bulk upload failed on mobile, retrying with individual uploads...');
            sentryUtils.logWarning('Bulk upload failed on mobile, falling back to individual uploads', {
                originalError: error.message,
                totalRecordings: totalRecordings,
                uploadMethod: 'bulk_to_individual_fallback'
            });
            
            try {
                dom.setStatus("Bulk upload failed, retrying with individual uploads...", "warning");
                dom.updateUploadProgress(10); // Reset progress
                
                const { uploadedCount, failedCount } = await submitRecordingsIndividually(recordings, totalRecordings);
                
                if (failedCount === 0) {
                    // All individual uploads succeeded
                    sentryUtils.logInfo('All recordings uploaded successfully via fallback', { 
                        totalRecordings: totalRecordings,
                        uploadMethod: 'bulk_to_individual_fallback'
                    });
                    sentryUtils.logUserAction('submit_recordings_success', { 
                        totalRecordings: totalRecordings,
                        uploadMethod: 'bulk_to_individual_fallback'
                    });
                    
                    state.setHasSubmitted(true);
                    state.setIsUploading(false);

                    const submitRow = document.querySelector('.control-row.submit-row');
                    if (submitRow) {
                        submitRow.style.marginTop = '0.1.2rem';
                    }

                    await delay(600);
                    dom.hideUploadProgress();
                    dom.setStatus(`Wysyłanie zakończone! (${totalRecordings}/${totalRecordings})`, "success");

                    await delay(1000);
                    dom.applyFadeOutEffect();

                    await delay(1300);
                    dom.createThankYouScreen(restartHandler, submitEmail);
                    return; // Success, exit function
                    
                } else {
                    // Some individual uploads failed too
                    sentryUtils.logError('Individual upload fallback also failed', { 
                        totalRecordings: totalRecordings,
                        failedCount: failedCount,
                        uploadedCount: uploadedCount,
                        uploadMethod: 'bulk_to_individual_fallback'
                    });
                    
                    dom.setStatus(`Częściowe wysłanie: ${uploadedCount}/${totalRecordings} nagrań.`, "warning");
                }
                
            } catch (fallbackError) {
                console.error("Individual upload fallback also failed:", fallbackError);
                sentryUtils.captureException(fallbackError, { 
                    context: 'submitAllRecordings_fallback',
                    originalError: error.message,
                    totalRecordings: totalRecordings,
                    uploadMethod: 'bulk_to_individual_fallback'
                });
                dom.setStatus("Wystąpił błąd podczas wysyłania nagrań.", "error");
            }
        } else {
            // Regular error handling for non-mobile or non-network errors
            sentryUtils.captureException(error, { 
                context: 'submitAllRecordings_bulk',
                totalRecordings: totalRecordings,
                uploadMethod: 'bulk_upload'
            });
            dom.setStatus("Wystąpił błąd podczas wysyłania nagrań.", "error");
        }
        
        state.setIsUploading(false);
        dom.hideUploadProgress();
        // Re-enable submit button on error
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('disabled');
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

// Mobile detection utility
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad detection
}

function isIOSDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Calculate total FormData size estimate
function estimateFormDataSize(recordings) {
    let totalSize = 0;
    for (const [phoneme, blob] of Object.entries(recordings)) {
        totalSize += blob.size;
        totalSize += phoneme.length * 2; // Rough estimate for text fields
        totalSize += 100; // Headers and boundaries estimate
    }
    return totalSize;
}

// Fallback function for individual uploads (mobile-friendly)
async function submitRecordingsIndividually(recordings, totalRecordings) {
    let uploadedCount = 0;
    let failedCount = 0;

    for (const [phoneme, blob] of Object.entries(recordings)) {
        try {
            const filename = `${phoneme}_${Date.now()}.wav`;
            const formData = new FormData();
            formData.append("audio", blob, filename);
            formData.append("phoneme", phoneme);

            // Create fetch options with timeout handling
            const fetchOptions = {
                method: "POST",
                body: formData
            };

            // Add timeout if supported
            if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
                fetchOptions.signal = AbortSignal.timeout(30000); // 30 seconds timeout
            }

            const response = await fetch(`${BACKEND_URL}/upload`, fetchOptions);

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`Upload failed for ${phoneme}: ${response.status} - ${errorText}`);
            }

            uploadedCount++;
            const progress = (uploadedCount / totalRecordings) * 100;
            dom.updateUploadProgress(progress);

            console.log(`Successfully uploaded ${phoneme} (${uploadedCount}/${totalRecordings})`);

            // Small delay between uploads to prevent overwhelming mobile
            await new Promise(resolve => setTimeout(resolve, 200));

        } catch (error) {
            console.error(`Error uploading ${phoneme}:`, error);
            sentryUtils.captureException(error, { 
                context: 'uploadRecording_individual',
                phoneme: phoneme,
                attempt: 'mobile_fallback',
                blobSize: blob.size,
                errorMessage: error.message
            });
            failedCount++;
        }
    }

    return { uploadedCount, failedCount };
}