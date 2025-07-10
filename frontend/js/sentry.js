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

// Sentry configuration
const SENTRY_DSN = 'https://45bffbc3cf8fcedd2230f1fcf444025d@o4509621956640768.ingest.de.sentry.io/4509621959000144'

// Initialize Sentry
if (typeof Sentry !== 'undefined') {
    Sentry.init({
        dsn: SENTRY_DSN,
        
        // Set sample rate for performance monitoring
        tracesSampleRate: 1.0,
        
        // Set sample rate for profiling
        profilesSampleRate: 1.0,
        
        // Capture unhandled rejections
        captureUnhandledRejections: true,
        
        // Set environment
        environment: window.location.hostname === 'localhost' ? 'development' : 'production',
        
        // Set release version (you can update this with your app version)
        release: '1.0.0',
        
        // Configure which URLs to capture
        beforeSend(event, hint) {
            // Filter out certain errors if needed
            if (event.exception) {
                const error = hint.originalException;
                // You can add custom filtering logic here
                console.log('Sentry capturing error:', error);
            }
            return event;
        },
        
        // Configure integrations - simplified for CDN compatibility
        integrations: [
            // Only add integrations that are definitely available
        ],
    });
    
    // Set user context with session ID
    Sentry.setUser({
        id: getSessionId(),
        // You can add more user info later if needed
    });
    
    // Set tags for better filtering
    Sentry.setTag('component', 'survey-frontend');
    Sentry.setTag('sessionId', getSessionId());
    
    console.log('Sentry initialized successfully');
} else {
    console.warn('Sentry not loaded - error reporting disabled');
}

// Export utility functions for manual error reporting
export const sentryUtils = {
    // Capture an exception manually
    captureException: (error, context = {}) => {
        if (typeof Sentry !== 'undefined') {
            Sentry.withScope((scope) => {
                // Add session ID to scope
                addSessionIdToScope(scope);
                // Add context to the error
                Object.keys(context).forEach(key => {
                    scope.setTag(key, context[key]);
                });
                Sentry.captureException(error);
            });
        }
        // Always log to console as well
        console.error('Error captured:', error, context);
    },
    
    // Capture a message manually
    captureMessage: (message, level = 'info', context = {}) => {
        if (typeof Sentry !== 'undefined') {
            Sentry.withScope((scope) => {
                // Add session ID to scope
                addSessionIdToScope(scope);
                Object.keys(context).forEach(key => {
                    scope.setTag(key, context[key]);
                });
                Sentry.captureMessage(message, level);
            });
        }
        console.log('Message captured:', message, context);
    },

    // Enhanced logging methods for different levels
    logInfo: (message, context = {}) => {
        // INFO: Send to breadcrumbs only (for debugging context)
        if (typeof Sentry !== 'undefined') {
            Sentry.addBreadcrumb({
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
        if (typeof Sentry !== 'undefined') {
            Sentry.addBreadcrumb({
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
        if (typeof Sentry !== 'undefined') {
            Sentry.withScope((scope) => {
                // Add session ID to scope
                addSessionIdToScope(scope);
                Object.keys(context).forEach(key => {
                    scope.setTag(key, context[key]);
                });
                scope.setLevel('error');
                if (error) {
                    Sentry.captureException(error);
                } else {
                    Sentry.captureMessage(message, 'error');
                }
            });
        }
        console.error('ERROR:', message, context, error);
    },

    // Log user actions for debugging
    logUserAction: (action, context = {}) => {
        if (typeof Sentry !== 'undefined') {
            Sentry.addBreadcrumb({
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
        if (typeof Sentry !== 'undefined') {
            Sentry.addBreadcrumb({
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
        if (typeof Sentry !== 'undefined') {
            Sentry.addBreadcrumb({
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
        if (typeof Sentry !== 'undefined') {
            // Always include session ID in user context
            const userWithSession = {
                ...user,
                id: user.id || getSessionId(),
                sessionId: getSessionId()
            };
            Sentry.setUser(userWithSession);
        }
    },
    
    // Set additional context
    setContext: (key, context) => {
        if (typeof Sentry !== 'undefined') {
            Sentry.setContext(key, context);
        }
    },

    // Update session context (call this if session ID changes)
    updateSessionContext: () => {
        if (typeof Sentry !== 'undefined') {
            const sessionId = getSessionId();
            Sentry.setTag('sessionId', sessionId);
            Sentry.setContext('session', { id: sessionId });
            Sentry.setUser({
                id: sessionId,
                sessionId: sessionId
            });
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
    }
};