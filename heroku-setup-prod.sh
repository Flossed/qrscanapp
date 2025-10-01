#!/bin/bash

# Heroku Production Environment Configuration
# This configuration uses minimal logging for production performance
# Run: bash heroku-setup-prod.sh

echo "==================================="
echo "Heroku Production Setup"
echo "==================================="
echo ""

# Heroku app name (change this to your app name)
APP_NAME="qrscanapp"

echo "Setting up production environment for: $APP_NAME"
echo ""

# Database Configuration
echo "Setting MongoDB variables..."
heroku config:set DB_USER=decaan --app $APP_NAME
heroku config:set DB_PASSWORD=PyKaLWgWomnrNqSz --app $APP_NAME
heroku config:set DB_CLUSTER=zanddmdb.18xek.mongodb.net --app $APP_NAME
heroku config:set DB_NAME=qrscanner --app $APP_NAME

# Session Configuration (CRITICAL for login)
echo "Setting session secret..."
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
heroku config:set SESSION_SECRET=$SESSION_SECRET --app $APP_NAME

# Production Mode Configuration
echo "Setting production mode..."
heroku config:set NODE_ENV=production --app $APP_NAME
heroku config:set MODE=PRODUCTION --app $APP_NAME

# Logging Configuration - MINIMAL LOGGING for production
echo "Setting logging configuration for production..."
heroku config:set LOG_LEVEL=error --app $APP_NAME
heroku config:set LOG_CONSOLE=on --app $APP_NAME

# SMTP Configuration (optional)
echo "Setting SMTP configuration..."
heroku config:set SMTP_HOST=zandd.my-cloud.nu --app $APP_NAME
heroku config:set SMTP_PORT=465 --app $APP_NAME
heroku config:set SMTP_USER=npmjs@zandd.eu --app $APP_NAME
# Note: Set SMTP_PASS manually for security:
# heroku config:set SMTP_PASS=your_password_here --app $APP_NAME

echo ""
echo "==================================="
echo "Configuration Complete!"
echo "==================================="
echo ""
echo "Current configuration:"
heroku config --app $APP_NAME
echo ""
echo "To apply changes, restart the app:"
echo "  heroku restart --app $APP_NAME"
echo ""
echo "To view logs:"
echo "  heroku logs -n 200 --app $APP_NAME"
echo ""
echo "IMPORTANT: Set SMTP_PASS manually:"
echo "  heroku config:set SMTP_PASS=your_password --app $APP_NAME"
