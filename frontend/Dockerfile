# Use official Nginx image as the base
FROM nginx:1.25-alpine

# Allow passing in a Sentry version (defaults to latest stable)
ARG SENTRY_VERSION=7.0.0

# Install envsubst (for your entrypoint) and curl (to download bundles)
RUN apk add --no-cache gettext curl

# Set working directory
WORKDIR /usr/share/nginx/html

# Remove default nginx static assets
RUN rm -rf ./*

# Copy frontend static files to nginx html directory
COPY . .

# Download Sentry bundles at build time
RUN curl -fsSL https://browser.sentry-cdn.com/${SENTRY_VERSION}/bundle.min.js -o sentry.bundle.min.js
RUN curl -fsSL https://browser.sentry-cdn.com/${SENTRY_VERSION}/bundle.tracing.min.js -o sentry.bundle.tracing.min.js

# Copy & make your entrypoint executable
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port 80
EXPOSE 80

# Entrypoint and default command
ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
