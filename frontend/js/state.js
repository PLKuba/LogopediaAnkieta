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
