# Use official Nginx image as the base
FROM nginx:1.25-alpine

# Set working directory
WORKDIR /usr/share/nginx/html

# Remove default nginx static assets
RUN rm -rf ./*

# Copy frontend static files to nginx html directory
COPY . .

# Copy custom nginx config (if needed)
# COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

# Start Nginx server
CMD ["nginx", "-g", "daemon off;"]
