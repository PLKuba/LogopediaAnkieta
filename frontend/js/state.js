function generateSessionId() {
    // https://stackoverflow.com/a/2117523/220636
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

let phonemes = [];
let currentPhonemeIndex = 0;
let completedPhonemes = 0;
let mediaRecorder;
let audioChunks = [];
let audioBlob;
let isRecording = false;
let microphoneStream = null;
let isUploading = false;
let recordings = {};
let hasSubmitted = false;
let autoStopTimeout = null;
let sessionId = generateSessionId();

export function getPhonemes() { return phonemes; }
export function getCurrentPhonemeIndex() { return currentPhonemeIndex; }
export function getCompletedPhonemes() { return completedPhonemes; }
export function getMediaRecorder() { return mediaRecorder; }
export function getAudioChunks() { return audioChunks; }
export function getAudioBlob() { return audioBlob; }
export function getIsRecording() { return isRecording; }
export function getMicrophoneStream() { return microphoneStream; }
export function getIsUploading() { return isUploading; }
export function getRecordings() { return recordings; }
export function getAutoStopTimeout() { return autoStopTimeout; }
export function getHasSubmitted() { return hasSubmitted; }
export function getSessionId() { return sessionId; }

export function setPhonemes(newPhonemes) {
    phonemes = newPhonemes;
}

export function setCurrentPhonemeIndex(index) {
    currentPhonemeIndex = index;
}

export function setCompletedPhonemes(count) {
    completedPhonemes = count;
}

export function setMediaRecorder(recorder) {
    mediaRecorder = recorder;
}

export function setAudioChunks(chunks) {
    audioChunks = chunks;
}

export function setAudioBlob(blob) {
    audioBlob = blob;
}

export function setIsRecording(recording) {
    isRecording = recording;
}

export function setMicrophoneStream(stream) {
    microphoneStream = stream;
}

export function setIsUploading(uploading) {
    isUploading = uploading;
}

export function setRecordings(newRecordings) {
    recordings = newRecordings;
}

export function setAutoStopTimeout(timeout) {
    autoStopTimeout = timeout;
}

export function setHasSubmitted(submitted) {
    hasSubmitted = submitted;
}

export function resetStateForRestart() {
    recordings = {};
    currentPhonemeIndex = 0;
    isRecording = false;
    isUploading = false;
    hasSubmitted = false;
    audioBlob = null;
    sessionId = generateSessionId();
}
