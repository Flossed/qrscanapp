#!/bin/bash

# Heroku Development Environment Configuration
# This configuration enables full logging and debugging for troubleshooting
# Run: bash heroku-setup-dev.sh

echo "==================================="
echo "Heroku Development Setup"
echo "==================================="
echo ""

# Heroku app name (change this to your app name)
APP_NAME="qrscanapp"

echo "Setting up development environment for: $APP_NAME"
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

# Development Mode Configuration
echo "Setting development mode..."
heroku config:set NODE_ENV=development --app $APP_NAME
heroku config:set MODE=DEBUG --app $APP_NAME

# Logging Configuration - FULL DEBUGGING
echo "Setting logging configuration for full debugging..."
heroku config:set LOG_LEVEL=debug --app $APP_NAME
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
echo "To view logs in real-time:"
echo "  heroku logs --tail --app $APP_NAME"
echo ""
echo "IMPORTANT: Set SMTP_PASS manually:"
echo "  heroku config:set SMTP_PASS=your_password --app $APP_NAME"
