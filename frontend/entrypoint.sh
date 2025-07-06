#!/bin/sh
# Render the template using the env var mounted by k8s
envsubst < /usr/share/nginx/html/config.js.tpl \
         > /usr/share/nginx/html/config.js

# Start nginx
exec "$@"
