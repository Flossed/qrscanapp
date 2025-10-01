# Heroku Configuration Guide

## Overview

This document explains the environment variables and configuration options for deploying the QR Scanner App on Heroku.

## Quick Setup

### Development Environment (Full Logging)

For troubleshooting and development:

```bash
bash heroku-setup-dev.sh
```

### Production Environment (Minimal Logging)

For production deployment:

```bash
bash heroku-setup-prod.sh
```

## Environment Variables Explained

### Database Configuration

| Variable | Value | Description |
|----------|-------|-------------|
| `DB_USER` | `decaan` | MongoDB Atlas username |
| `DB_PASSWORD` | `PyKaLWgWomnrNqSz` | MongoDB Atlas password |
| `DB_CLUSTER` | `zanddmdb.18xek.mongodb.net` | MongoDB Atlas cluster URL |
| `DB_NAME` | `qrscanner` | Database name |

### Session Configuration (CRITICAL)

| Variable | Value | Description |
|----------|-------|-------------|
| `SESSION_SECRET` | *auto-generated* | **Required** for login to work. Randomly generated 64-character hex string |

**Why SESSION_SECRET is critical:**
- Without it, user sessions won't persist
- Login will appear to work but immediately log out
- Each environment should have a unique secret

### Application Mode

| Variable | Development | Production | Description |
|----------|-------------|------------|-------------|
| `NODE_ENV` | `development` | `production` | Node.js environment |
| `MODE` | `DEBUG` | `PRODUCTION` | Application mode (affects scan storage and UI) |

**DEBUG Mode:**
- ✅ All scans stored in database
- ✅ `/scan-history` accessible
- ✅ `/verify` page accessible
- ✅ Full verification details visible

**PRODUCTION Mode:**
- ❌ Scans NOT stored (privacy)
- ❌ `/scan-history` disabled (403)
- ❌ `/verify` page disabled (403)
- ✅ Auto-redirect to results page

### Logging Configuration

| Variable | Development | Production | Description |
|----------|-------------|------------|-------------|
| `LOG_LEVEL` | `debug` | `error` | Logging verbosity level |
| `LOG_CONSOLE` | `on` | `on` | Enable console output for Heroku logs |

**Log Levels (from most to least verbose):**
1. `debug` - Everything (development/troubleshooting)
2. `trace` - Detailed trace information
3. `http` - HTTP requests
4. `info` - General information
5. `warn` - Warnings only
6. `error` - Errors only (production)
7. `exception` - Exceptions only

**Recommendation:**
- Use `debug` when troubleshooting login or validation issues
- Use `info` for general development
- Use `error` for production to minimize log volume

### SMTP Configuration (Optional)

| Variable | Value | Description |
|----------|-------|-------------|
| `SMTP_HOST` | `zandd.my-cloud.nu` | SMTP server hostname |
| `SMTP_PORT` | `465` | SMTP port (465 for SSL) |
| `SMTP_USER` | `npmjs@zandd.eu` | SMTP username |
| `SMTP_PASS` | *manual* | SMTP password (set manually) |

**Set SMTP password manually:**
```bash
heroku config:set SMTP_PASS=your_password_here --app qrscanapp
```

## Manual Configuration

### Set Individual Variables

```bash
# Session secret (REQUIRED)
heroku config:set SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") --app qrscanapp

# Logging for troubleshooting
heroku config:set LOG_LEVEL=debug --app qrscanapp
heroku config:set LOG_CONSOLE=on --app qrscanapp

# Application mode
heroku config:set MODE=DEBUG --app qrscanapp
heroku config:set NODE_ENV=development --app qrscanapp
```

### View Current Configuration

```bash
heroku config --app qrscanapp
```

### View Specific Variable

```bash
heroku config:get LOG_LEVEL --app qrscanapp
```

### Remove a Variable

```bash
heroku config:unset VARIABLE_NAME --app qrscanapp
```

## Troubleshooting

### Login Issues

If users can't stay logged in:

1. **Check SESSION_SECRET is set:**
   ```bash
   heroku config:get SESSION_SECRET --app qrscanapp
   ```

2. **If missing or wrong, set it:**
   ```bash
   heroku config:set SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") --app qrscanapp
   ```

3. **Restart the app:**
   ```bash
   heroku restart --app qrscanapp
   ```

### No Logs Appearing

If you don't see logs in Heroku:

1. **Enable console output:**
   ```bash
   heroku config:set LOG_CONSOLE=on --app qrscanapp
   ```

2. **Increase log level:**
   ```bash
   heroku config:set LOG_LEVEL=debug --app qrscanapp
   ```

3. **Restart and watch logs:**
   ```bash
   heroku restart --app qrscanapp
   heroku logs --tail --app qrscanapp
   ```

### Database Connection Issues

If MongoDB connection fails:

1. **Verify all DB variables are set:**
   ```bash
   heroku config --app qrscanapp | grep DB_
   ```

2. **Check MongoDB Atlas:**
   - Verify credentials are correct
   - Check IP whitelist (add `0.0.0.0/0` for Heroku)
   - Verify database user has read/write permissions

### Viewing Logs

```bash
# Real-time logs (Ctrl+C to stop)
heroku logs --tail --app qrscanapp

# Last 200 lines
heroku logs -n 200 --app qrscanapp

# Filter by source
heroku logs --source app --app qrscanapp

# Filter by log level (when using debug mode)
heroku logs --tail --app qrscanapp | grep ERROR
heroku logs --tail --app qrscanapp | grep INFO
```

## Configuration Comparison

### Development vs Production

| Feature | Development | Production |
|---------|-------------|------------|
| Log Level | `debug` | `error` |
| Scan Storage | ✅ Yes | ❌ No |
| History Page | ✅ Enabled | ❌ Disabled |
| Verify Page | ✅ Enabled | ❌ Disabled |
| Performance | Slower (more logs) | Faster (minimal logs) |
| Privacy | Lower (stores data) | Higher (no storage) |

## Security Best Practices

1. **Never commit credentials to git**
   - Keep `.env` in `.gitignore`
   - Use environment variables on Heroku

2. **Use strong SESSION_SECRET**
   - Generate with crypto.randomBytes()
   - Different secret per environment
   - Never use default values

3. **Limit log verbosity in production**
   - Use `error` level only
   - Avoid logging sensitive data
   - Rotate logs regularly

4. **Whitelist IP addresses in MongoDB Atlas**
   - Use `0.0.0.0/0` for Heroku (dynamic IPs)
   - Or use AWS PrivateLink if available

## Additional Resources

- [Heroku Configuration Variables](https://devcenter.heroku.com/articles/config-vars)
- [Heroku Logging](https://devcenter.heroku.com/articles/logging)
- [MongoDB Atlas with Heroku](https://www.mongodb.com/developer/products/atlas/use-atlas-on-heroku/)
