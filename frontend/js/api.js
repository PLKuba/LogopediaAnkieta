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
            body: formData,
            // Add headers for better debugging
            headers: {
                'Accept': 'application/json, text/plain, */*'
            }
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
        
        // Enhanced error logging for debugging
        const errorContext = {
            errorName: error.name,
            errorMessage: error.message,
            backendUrl: BACKEND_URL,
            totalRecordings: totalRecordings,
            userAgent: navigator.userAgent,
            online: navigator.onLine,
            connectionType: navigator.connection?.effectiveType || 'unknown'
        };
        
        sentryUtils.logError('Bulk upload failed', errorContext, error);
        
        // Check if this is a network connectivity issue
        if (!navigator.onLine) {
            dom.setStatus("Brak połączenia z internetem. Sprawdź połączenie i spróbuj ponownie.", "error");
            state.setIsUploading(false);
            dom.hideUploadProgress();
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('disabled');
            }
            return;
        }

        // Check if this is a mobile device and we should retry with individual uploads
        const isMobile = isMobileDevice();
        const isLoadFailed = error.message && error.message.includes('Load failed');
        const isNetworkError = error.name === 'TypeError' && (error.message.includes('Load failed') || error.message.includes('Failed to fetch'));

        // Test connectivity to our backend
        if (isNetworkError || error.message.includes('Failed to fetch')) {
            console.log('Testing backend connectivity...');
            const connectivityTest = await testNetworkConnectivity();
            
            sentryUtils.logWarning('Network error detected, connectivity test result:', {
                connectivityResult: connectivityTest,
                originalError: error.message,
                willAttemptFallback: true
            });
            
            // Don't return early - let fallback mechanisms handle the issue
            // The connectivity test might fail for the same reasons as the bulk upload
        }
        
        if (isMobile && (isLoadFailed || isNetworkError)) {
            console.log('Bulk upload failed on mobile, retrying with individual uploads...');
            
            // Capture replay for mobile upload failures
            sentryUtils.replay.captureReplay('mobile_upload_failure');
            
            sentryUtils.logWarning('Bulk upload failed on mobile, falling back to individual uploads', {
                originalError: error.message,
                totalRecordings: totalRecordings,
                uploadMethod: 'bulk_to_individual_fallback',
                deviceInfo: {
                    userAgent: navigator.userAgent,
                    isMobile: isMobile,
                    connectionType: navigator.connection?.effectiveType || 'unknown'
                }
            });
            
            try {
                dom.setStatus("Próbuję wysłać nagrania pojedynczo...", "warning");
                dom.updateUploadProgress(10); // Reset progress
                
                const { uploadedCount, failedCount } = await submitRecordingsIndividually(recordings, totalRecordings);
                
                if (failedCount === 0) {
                    // All individual uploads succeeded
                    sentryUtils.logInfo('All recordings uploaded successfully via mobile fallback', { 
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
                    // Some individual uploads failed too - capture replay
                    sentryUtils.replay.captureReplay('individual_upload_partial_failure');
                    
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
                
                // Capture replay for complete upload failure
                sentryUtils.replay.captureReplay('complete_upload_failure');
                
                sentryUtils.captureException(fallbackError, { 
                    context: 'submitAllRecordings_fallback',
                    originalError: error.message,
                    totalRecordings: totalRecordings,
                    uploadMethod: 'bulk_to_individual_fallback'
                });
                dom.setStatus("Wystąpił błąd podczas wysyłania nagrań.", "error");
            }
        } else if (isNetworkError || error.message.includes('Failed to fetch')) {
            // Network error on desktop - also try individual uploads as fallback
            console.log('Bulk upload failed due to network error, retrying with individual uploads...');
            
            sentryUtils.logWarning('Bulk upload failed due to network error, falling back to individual uploads', {
                originalError: error.message,
                totalRecordings: totalRecordings,
                uploadMethod: 'bulk_to_individual_fallback_desktop',
                isDesktop: !isMobile
            });
            
            try {
                dom.setStatus("Błąd sieci. Próbuję wysłać nagrania pojedynczo...", "warning");
                dom.updateUploadProgress(10); // Reset progress
                
                const { uploadedCount, failedCount } = await submitRecordingsIndividually(recordings, totalRecordings);
                
                if (failedCount === 0) {
                    // Success via fallback
                    sentryUtils.logInfo('All recordings uploaded successfully via desktop fallback', { 
                        totalRecordings: totalRecordings,
                        uploadMethod: 'bulk_to_individual_fallback_desktop'
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
                    return;
                } else {
                    sentryUtils.logError('Desktop fallback also failed', { 
                        totalRecordings: totalRecordings,
                        failedCount: failedCount,
                        uploadedCount: uploadedCount
                    });
                    dom.setStatus(`Częściowe wysłanie: ${uploadedCount}/${totalRecordings} nagrań.`, "warning");
                }
                
            } catch (fallbackError) {
                console.error("Desktop individual upload fallback failed:", fallbackError);
                sentryUtils.captureException(fallbackError, { 
                    context: 'submitAllRecordings_desktop_fallback',
                    originalError: error.message,
                    totalRecordings: totalRecordings
                });
                dom.setStatus("Wystąpił błąd podczas wysyłania nagrań.", "error");
            }
        } else {
            // Regular error handling for non-network errors
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

    // Add retry logic for email submission
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;

    while (attempts < maxAttempts) {
        attempts++;
        
        try {
            console.log(`Submitting email (attempt ${attempts}/${maxAttempts})`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch(`${BACKEND_URL}/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorData = await response.json();
                if (errorData.detail && errorData.detail.includes('already exists')) {
                    showDuplicate();
                } else {
                    showInlineError(errorData.detail || 'Błąd podczas zapisywania adresu email.');
                }
            } else {
                showSuccess('Poinformujemy Cię o wynikach badań.');
                sentryUtils.logInfo('Email submitted successfully', { email: email });
            }
            return; // Success - exit function
            
        } catch (error) {
            lastError = error;
            console.error(`Error submitting email (attempt ${attempts}/${maxAttempts}):`, error);
            
            // Check if it's a network error
            const isNetworkError = error.name === 'TypeError' && 
                (error.message.includes('Failed to fetch') || error.message.includes('Load failed'));
            
            if (isNetworkError && attempts < maxAttempts) {
                // Wait before retry
                console.log(`⏳ Network error, waiting before retry...`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second wait
                continue;
            }
            
            // If not network error or max attempts reached, break
            break;
        }
    }
    
    // If we get here, all attempts failed
    console.error('All email submission attempts failed:', lastError);
    
    sentryUtils.captureException(lastError, {
        context: 'submitEmail_failed',
        email: email,
        attempts: attempts,
        maxAttempts: maxAttempts,
        errorMessage: lastError?.message || 'Unknown error'
    });
    
    // Try to store email locally as fallback
    const storedLocally = storeEmailLocally(email);
    
    if (storedLocally) {
        showSuccess('Email zapisany lokalnie. Zostanie wysłany gdy połączenie się poprawi.');
        sentryUtils.logInfo('Email stored locally for later submission', { email: email });
    } else {
        // Check network connectivity and show appropriate message
        if (!navigator.onLine) {
            showInlineError('Brak połączenia z internetem. Email nie został zapisany.');
        } else {
            showInlineError('Wystąpił błąd sieciowy. Spróbuj ponownie za chwilę.');
        }
        
        // Re-enable the form only if local storage also failed
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
        let attempts = 0;
        const maxAttempts = 2; // Try each recording twice
        let lastError = null;

        while (attempts < maxAttempts && uploadedCount + failedCount < totalRecordings) {
            attempts++;
            
            try {
                console.log(`Uploading ${phoneme} (attempt ${attempts}/${maxAttempts})`);
                
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
                    fetchOptions.signal = AbortSignal.timeout(45000); // 45 seconds timeout (longer for individual uploads)
                }

                const response = await fetch(`${BACKEND_URL}/upload`, fetchOptions);

                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Unknown error');
                    throw new Error(`Upload failed for ${phoneme}: ${response.status} - ${errorText}`);
                }

                uploadedCount++;
                const progress = Math.min(95, (uploadedCount / totalRecordings) * 100); // Cap at 95% until all done
                dom.updateUploadProgress(progress);

                console.log(`✅ Successfully uploaded ${phoneme} (${uploadedCount}/${totalRecordings})`);
                
                // Break out of retry loop on success
                break;

            } catch (error) {
                lastError = error;
                console.error(`❌ Error uploading ${phoneme} (attempt ${attempts}/${maxAttempts}):`, error);
                
                // Wait before retry (except on last attempt)
                if (attempts < maxAttempts) {
                    console.log(`⏳ Waiting before retry...`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second wait
                }
            }
        }

        // If we exhausted all attempts, count as failed
        if (attempts >= maxAttempts) {
            failedCount++;
            sentryUtils.captureException(lastError, { 
                context: 'uploadRecording_individual_failed',
                phoneme: phoneme,
                attempt: 'individual_fallback',
                blobSize: blob.size,
                maxAttempts: maxAttempts,
                errorMessage: lastError?.message || 'Unknown error'
            });
        }

        // Small delay between different phonemes to prevent overwhelming
        if (uploadedCount + failedCount < totalRecordings) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    // Set final progress
    if (failedCount === 0) {
        dom.updateUploadProgress(100);
    }

    console.log(`📊 Individual upload summary: ${uploadedCount} succeeded, ${failedCount} failed`);
    return { uploadedCount, failedCount };
}

// Test network connectivity to backend
export async function testNetworkConnectivity() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch(`${BACKEND_URL}/phonemes`, {
            method: 'HEAD', // Just check if endpoint is reachable
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        return {
            success: response.ok,
            status: response.status,
            message: response.ok ? 'Network connectivity OK' : `Server returned ${response.status}`
        };
    } catch (error) {
        return {
            success: false,
            status: 0,
            message: `Network error: ${error.message}`
        };
    }
}

// Fallback email storage for offline scenarios
function storeEmailLocally(email) {
    try {
        const storedEmails = JSON.parse(localStorage.getItem('pendingEmails') || '[]');
        storedEmails.push({
            email: email,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        });
        localStorage.setItem('pendingEmails', JSON.stringify(storedEmails));
        return true;
    } catch (error) {
        console.error('Failed to store email locally:', error);
        return false;
    }
}

// Try to submit any locally stored emails when network is available
export async function submitPendingEmails() {
    try {
        const pendingEmails = JSON.parse(localStorage.getItem('pendingEmails') || '[]');
        if (pendingEmails.length === 0) return;
        
        console.log(`Found ${pendingEmails.length} pending emails to submit`);
        
        const successfullySubmitted = [];
        
        for (const emailData of pendingEmails) {
            try {
                const response = await fetch(`${BACKEND_URL}/users`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        email: emailData.email,
                        submittedAt: emailData.timestamp 
                    }),
                    signal: AbortSignal.timeout(5000)
                });
                
                if (response.ok) {
                    successfullySubmitted.push(emailData);
                    console.log(`✅ Successfully submitted pending email: ${emailData.email}`);
                }
            } catch (error) {
                console.log(`❌ Failed to submit pending email: ${emailData.email}`, error);
            }
        }
        
        // Remove successfully submitted emails
        if (successfullySubmitted.length > 0) {
            const remainingEmails = pendingEmails.filter(email => 
                !successfullySubmitted.some(submitted => submitted.email === email.email)
            );
            localStorage.setItem('pendingEmails', JSON.stringify(remainingEmails));
            
            sentryUtils.logInfo('Submitted pending emails', {
                submitted: successfullySubmitted.length,
                remaining: remainingEmails.length
            });
        }
        
    } catch (error) {
        console.error('Error submitting pending emails:', error);
    }
}