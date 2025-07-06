# Use official Nginx image as the base
FROM nginx:1.25-alpine

# Install envsubst
RUN apk add --no-cache gettext

# Set working directory
WORKDIR /usr/share/nginx/html

# Remove default nginx static assets
RUN rm -rf ./*

# Copy frontend static files to nginx html directory
COPY . .

# At container start, replace ${SENTRY_DSN} in config.js.tpl → config.js
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy custom nginx config (if needed)
# COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

# Use our entrypoint
ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
