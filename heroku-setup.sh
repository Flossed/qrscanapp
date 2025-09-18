#!/bin/bash

# Set MongoDB Atlas environment variables on Heroku
# Run these commands in your terminal after logging into Heroku

echo "Setting up Heroku environment variables..."

# Set individual MongoDB variables
heroku config:set DB_USER=decaan
heroku config:set DB_PASSWORD=PyKaLWgWomnrNqSz
heroku config:set DB_CLUSTER=zanddmdb.18xek.mongodb.net
heroku config:set DB_NAME=ehicverifier

# Set additional environment variables
heroku config:set NODE_ENV=production
heroku config:set LOG_LEVEL=info
heroku config:set CONSOLE_OUTPUT=off

echo "Environment variables set!"
echo ""
echo "Verify with: heroku config"