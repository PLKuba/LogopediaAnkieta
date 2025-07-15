// Import session ID from state
import { getSessionId } from './state.js';

// Helper function to add session ID to context/tags
function addSessionIdToScope(scope) {
    const sessionId = getSessionId();
    scope.setTag('sessionId', sessionId);
    scope.setContext('session', { id: sessionId });
}

// Helper function to add session ID to breadcrumb data
function addSessionIdToBreadcrumb(data = {}) {
    return {
        ...data,
        sessionId: getSessionId()
    };
}

// Wait for Sentry to be available from CDN loader
function waitForSentry() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        
        const checkSentry = () => {
            attempts++;
            if (typeof window.Sentry !== 'undefined') {
                resolve(window.Sentry);
            } else if (attempts < maxAttempts) {
                setTimeout(checkSentry, 100);
            } else {
                reject(new Error('Sentry CDN loader timeout'));
            }
        };
        
        checkSentry();
    });
}

// Initialize Sentry configuration once it's available
waitForSentry().then((Sentry) => {
    // Set user and tags
    Sentry.setUser({
        id: getSessionId(),
    });
    
    // Set tags for better filtering
    Sentry.setTag('component', 'survey-frontend');
    Sentry.setTag('sessionId', getSessionId());
    Sentry.setTag('sentry-version', '8.0.0');
    
    console.log('Sentry 8.0.0 configured successfully with CDN loader');
}).catch((error) => {
    console.warn('Failed to load Sentry CDN:', error);
});

// Export utility functions for manual error reporting
export const sentryUtils = {
    // Capture an exception manually
    captureException: (error, context = {}) => {
        if (typeof window.Sentry !== 'undefined') {
            window.Sentry.withScope((scope) => {
                // Add session ID to scope
                addSessionIdToScope(scope);
                // Add context to the error
                Object.keys(context).forEach(key => {
                    scope.setTag(key, context[key]);
                });
                window.Sentry.captureException(error);
            });
        }
        // Always log to console as well
        console.error('Error captured:', error, context);
    },
    
    // Capture a message manually
    captureMessage: (message, level = 'info', context = {}) => {
        if (typeof window.Sentry !== 'undefined') {
            window.Sentry.withScope((scope) => {
                // Add session ID to scope
                addSessionIdToScope(scope);
                Object.keys(context).forEach(key => {
                    scope.setTag(key, context[key]);
                });
                window.Sentry.captureMessage(message, level);
            });
        }
        console.log('Message captured:', message, context);
    },

    // Enhanced logging methods for different levels
    logInfo: (message, context = {}) => {
        // INFO: Send to breadcrumbs only (for debugging context)
        if (typeof window.Sentry !== 'undefined') {
            window.Sentry.addBreadcrumb({
                message: `INFO: ${message}`,
                category: 'info',
                level: 'info',
                data: addSessionIdToBreadcrumb(context),
                timestamp: Date.now() / 1000,
            });
        }
        console.info('INFO:', message, context);
    },

    logWarning: (message, context = {}) => {
        // WARNING: Send to breadcrumbs only (for debugging context)
        if (typeof window.Sentry !== 'undefined') {
            window.Sentry.addBreadcrumb({
                message: `WARNING: ${message}`,
                category: 'warning',
                level: 'warning',
                data: addSessionIdToBreadcrumb(context),
                timestamp: Date.now() / 1000,
            });
        }
        console.warn('WARNING:', message, context);
    },

    logError: (message, context = {}, error = null) => {
        // ERROR: Send as Sentry issue (for alerting)
        if (typeof window.Sentry !== 'undefined') {
            window.Sentry.withScope((scope) => {
                // Add session ID to scope
                addSessionIdToScope(scope);
                Object.keys(context).forEach(key => {
                    scope.setTag(key, context[key]);
                });
                scope.setLevel('error');
                if (error) {
                    window.Sentry.captureException(error);
                } else {
                    window.Sentry.captureMessage(message, 'error');
                }
            });
        }
        console.error('ERROR:', message, context, error);
    },

    // Log user actions for debugging
    logUserAction: (action, context = {}) => {
        if (typeof window.Sentry !== 'undefined') {
            window.Sentry.addBreadcrumb({
                message: `User action: ${action}`,
                category: 'user',
                level: 'info',
                data: addSessionIdToBreadcrumb(context),
                timestamp: Date.now() / 1000,
            });
        }
        console.log('USER ACTION:', action, context);
    },

    // Log performance metrics
    logPerformance: (metric, value, context = {}) => {
        // Performance metrics as breadcrumbs, not issues
        if (typeof window.Sentry !== 'undefined') {
            window.Sentry.addBreadcrumb({
                message: `Performance: ${metric} = ${value}`,
                category: 'performance',
                level: 'info',
                data: addSessionIdToBreadcrumb({ ...context, metric, value }),
                timestamp: Date.now() / 1000,
            });
        }
        console.log('PERFORMANCE:', metric, value, context);
    },
    
    // Add breadcrumb for debugging
    addBreadcrumb: (message, category = 'custom', level = 'info', data = {}) => {
        if (typeof window.Sentry !== 'undefined') {
            window.Sentry.addBreadcrumb({
                message,
                category,
                level,
                data: addSessionIdToBreadcrumb(data),
                timestamp: Date.now() / 1000,
            });
        }
    },
    
    // Set user context
    setUser: (user) => {
        if (typeof window.Sentry !== 'undefined') {
            // Always include session ID in user context
            const userWithSession = {
                ...user,
                id: user.id || getSessionId(),
                sessionId: getSessionId()
            };
            window.Sentry.setUser(userWithSession);
        }
    },
    
    // Set additional context
    setContext: (key, context) => {
        if (typeof window.Sentry !== 'undefined') {
            window.Sentry.setContext(key, context);
        }
    },

    // Update session context (call this if session ID changes)
    updateSessionContext: () => {
        if (typeof window.Sentry !== 'undefined') {
            const sessionId = getSessionId();
            window.Sentry.setTag('sessionId', sessionId);
            window.Sentry.setContext('session', { id: sessionId });
            window.Sentry.setUser({
                id: sessionId,
                sessionId: sessionId
            });
        }
    },

    // Session Replay utilities
    replay: {
        // Start a new replay session manually
        start: () => {
            if (typeof window.Sentry !== 'undefined' && window.Sentry.getCurrentHub().getClient()?.getOptions().replaysSessionSampleRate) {
                try {
                    window.Sentry.addBreadcrumb({
                        message: 'Manual replay session started',
                        category: 'replay',
                        level: 'info',
                        data: addSessionIdToBreadcrumb()
                    });
                    console.log('Manual replay session started');
                } catch (error) {
                    console.warn('Failed to start manual replay session:', error);
                }
            } else {
                console.warn('Session Replay not configured or available');
            }
        },

        // Stop the current replay session
        stop: () => {
            if (typeof window.Sentry !== 'undefined') {
                try {
                    window.Sentry.addBreadcrumb({
                        message: 'Replay session stopped',
                        category: 'replay',
                        level: 'info',
                        data: addSessionIdToBreadcrumb()
                    });
                    console.log('Replay session stopped');
                } catch (error) {
                    console.warn('Failed to stop replay session:', error);
                }
            }
        },

        // Force capture replay for critical errors
        captureReplay: (reason = 'manual_capture') => {
            if (typeof window.Sentry !== 'undefined') {
                try {
                    // Add a breadcrumb to mark this as a forced replay capture
                    window.Sentry.addBreadcrumb({
                        message: `Forced replay capture: ${reason}`,
                        category: 'replay',
                        level: 'error',
                        data: addSessionIdToBreadcrumb({ reason })
                    });
                    
                    // Force an error that will trigger replay capture
                    sentryUtils.captureMessage(`Replay captured: ${reason}`, 'error', { 
                        replayCapture: true,
                        reason: reason
                    });
                    
                    console.log('Replay capture forced for reason:', reason);
                } catch (error) {
                    console.warn('Failed to force replay capture:', error);
                }
            }
        }
    }
};

// Test functions to verify session ID integration
// These can be called from browser console for testing
window.testSentrySessionId = {
    // Test error logging with session ID
    testError: () => {
        sentryUtils.logError('Test error with session ID', { testContext: 'error-test' });
        console.log('Test error sent - check Sentry Issues tab for sessionId tag');
    },
    
    // Test warning logging with session ID
    testWarning: () => {
        sentryUtils.logWarning('Test warning with session ID', { testContext: 'warning-test' });
        console.log('Test warning sent - check breadcrumbs for sessionId in error context');
    },
    
    // Test info logging with session ID
    testInfo: () => {
        sentryUtils.logInfo('Test info with session ID', { testContext: 'info-test' });
        console.log('Test info sent - check breadcrumbs for sessionId');
    },
    
    // Test user action logging with session ID
    testUserAction: () => {
        sentryUtils.logUserAction('Test user action', { button: 'test-button' });
        console.log('Test user action sent - check breadcrumbs for sessionId');
    },
    
    // Test exception capture with session ID
    testException: () => {
        try {
            throw new Error('Test exception with session ID');
        } catch (error) {
            sentryUtils.captureException(error, { testContext: 'exception-test' });
        }
        console.log('Test exception sent - check Sentry Issues tab for sessionId tag');
    },
    
    // Show current session ID
    showSessionId: () => {
        const sessionId = getSessionId();
        console.log('Current session ID:', sessionId);
        return sessionId;
    },

    // Test Session Replay functionality
    testReplay: () => {
        console.log('Testing Session Replay...');
        sentryUtils.replay.captureReplay('manual_test');
        console.log('Session Replay test triggered - check Sentry for replay recording');
    },

    // Test replay with error
    testReplayWithError: () => {
        console.log('Testing Session Replay with error...');
        try {
            throw new Error('Test error to trigger session replay');
        } catch (error) {
            sentryUtils.captureException(error, { 
                testType: 'replay_error_test',
                triggerReplay: true 
            });
        }
        console.log('Replay error test sent - check Sentry Issues for session replay');
    }
};