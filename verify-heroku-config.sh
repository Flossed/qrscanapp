#!/bin/bash

echo "Checking Heroku configuration..."
echo ""

# Check if all required variables are set
echo "Verifying environment variables:"
heroku config:get DB_USER
heroku config:get DB_PASSWORD
heroku config:get DB_CLUSTER
heroku config:get DB_NAME
heroku config:get NODE_ENV

echo ""
echo "Full configuration:"
heroku config

echo ""
echo "If any variables are missing, set them with:"
echo "heroku config:set DB_USER=decaan"
echo "heroku config:set DB_PASSWORD=PyKaLWgWomnrNqSz"
echo "heroku config:set DB_CLUSTER=zanddmdb.18xek.mongodb.net"
echo "heroku config:set DB_NAME=ehicverifier"
echo "heroku config:set NODE_ENV=production"