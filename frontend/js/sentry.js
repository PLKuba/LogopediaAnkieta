// Sentry configuration
// Replace YOUR_DSN_HERE with your actual Sentry DSN from your project settings
const SENTRY_DSN = window.__CONFIG__.SENTRY_DSN

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
        
        // Configure integrations
        integrations: [
            new Sentry.BrowserTracing({
                // Set up automatic route change tracking if you add routing later
                tracePropagationTargets: ["localhost", /^https:\/\/api\.ankietalogopedyczna\.pl/],
            }),
        ],
    });
    
    // Set user context (optional)
    Sentry.setUser({
        id: 'anonymous-user',
        // You can add more user info later if needed
    });
    
    // Set tags for better filtering
    Sentry.setTag('component', 'survey-frontend');
    
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
        if (typeof Sentry !== 'undefined') {
            Sentry.withScope((scope) => {
                Object.keys(context).forEach(key => {
                    scope.setTag(key, context[key]);
                });
                scope.setLevel('info');
                Sentry.captureMessage(message, 'info');
            });
        }
        console.info('INFO:', message, context);
    },

    logWarning: (message, context = {}) => {
        if (typeof Sentry !== 'undefined') {
            Sentry.withScope((scope) => {
                Object.keys(context).forEach(key => {
                    scope.setTag(key, context[key]);
                });
                scope.setLevel('warning');
                Sentry.captureMessage(message, 'warning');
            });
        }
        console.warn('WARNING:', message, context);
    },

    logError: (message, context = {}, error = null) => {
        if (typeof Sentry !== 'undefined') {
            Sentry.withScope((scope) => {
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
                data: context,
                timestamp: Date.now() / 1000,
            });
        }
        console.log('USER ACTION:', action, context);
    },

    // Log performance metrics
    logPerformance: (metric, value, context = {}) => {
        if (typeof Sentry !== 'undefined') {
            Sentry.withScope((scope) => {
                Object.keys(context).forEach(key => {
                    scope.setTag(key, context[key]);
                });
                scope.setTag('metric', metric);
                scope.setTag('value', value);
                Sentry.captureMessage(`Performance: ${metric} = ${value}`, 'info');
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
                data,
                timestamp: Date.now() / 1000,
            });
        }
    },
    
    // Set user context
    setUser: (user) => {
        if (typeof Sentry !== 'undefined') {
            Sentry.setUser(user);
        }
    },
    
    // Set additional context
    setContext: (key, context) => {
        if (typeof Sentry !== 'undefined') {
            Sentry.setContext(key, context);
        }
    }
};