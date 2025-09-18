# Deployment Guide - QR Scanner App to Heroku with MongoDB Atlas

## Prerequisites

1. **Heroku CLI** installed
2. **Git** installed
3. **Heroku account** created
4. **MongoDB Atlas account** created

## Step 1: Set up MongoDB Atlas

1. **Create MongoDB Atlas Cluster:**
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Create a new cluster (free tier available)
   - Choose a cloud provider and region close to your Heroku region

2. **Configure Database Access:**
   - Go to Database Access
   - Add a new database user
   - Note the username and password (you'll need these)

3. **Configure Network Access:**
   - Go to Network Access
   - Click "Add IP Address"
   - Select "Allow Access from Anywhere" (0.0.0.0/0) for Heroku
   - Click Confirm

4. **Get Connection String:**
   - Go to Clusters → Connect
   - Choose "Connect your application"
   - Copy the connection string
   - It should look like: `mongodb+srv://<username>:<password>@cluster.mongodb.net/qrscanapp?retryWrites=true&w=majority`

## Step 2: Prepare Your Application

All necessary files have been created:
- ✅ `Procfile` - Tells Heroku how to start your app
- ✅ `package.json` - Updated with Node.js engine version
- ✅ `.env.example` - Example environment variables
- ✅ MongoDB connection updated for Atlas support

## Step 3: Initialize Git Repository (if not already done)

```bash
cd E:\_Applications\__ZNDPRODS\qrscanapp
git init
git add .
git commit -m "Initial commit for Heroku deployment"
```

## Step 4: Create Heroku App

```bash
# Login to Heroku
heroku login

# Create a new Heroku app (replace 'your-app-name' with your desired name)
heroku create your-app-name

# Or let Heroku generate a name
heroku create
```

## Step 5: Configure Environment Variables

Set your MongoDB Atlas connection string:

```bash
# Replace with your actual MongoDB Atlas connection string
heroku config:set MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/qrscanapp?retryWrites=true&w=majority"

# Optional: Set log level for production
heroku config:set LOG_LEVEL=info
heroku config:set CONSOLE_OUTPUT=off
heroku config:set NODE_ENV=production
```

## Step 6: Deploy to Heroku

```bash
# Add Heroku remote (if not automatically added)
heroku git:remote -a your-app-name

# Deploy to Heroku
git push heroku master

# Or if you're on main branch
git push heroku main
```

## Step 7: Verify Deployment

```bash
# Open your app in browser
heroku open

# Check logs if there are issues
heroku logs --tail

# Check app status
heroku ps
```

## Step 8: Initialize Database Collections

After deployment, your app will automatically create collections when first used. The following collections will be created:
- `scans` - Stores QR scan history
- `references` - Stores reference data
- `ebsicaches` - Stores EBSI cache data

## Monitoring and Maintenance

### View Logs
```bash
heroku logs --tail
```

### Restart App
```bash
heroku restart
```

### Scale Dynos
```bash
# Check current dynos
heroku ps

# Scale to 2 web dynos (paid feature)
heroku ps:scale web=2
```

### Database Management
Monitor your MongoDB Atlas cluster from the Atlas dashboard:
- View metrics
- Set up alerts
- Configure backups

## Environment Variables Summary

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB Atlas connection string | `mongodb+srv://...` |
| `PORT` | Server port (set automatically by Heroku) | `3000` |
| `NODE_ENV` | Environment | `production` |
| `LOG_LEVEL` | Logging level | `info` |
| `CONSOLE_OUTPUT` | Console logging | `off` |

## Troubleshooting

### MongoDB Connection Issues
- Ensure IP whitelist includes `0.0.0.0/0`
- Verify username and password are correct
- Check connection string format

### Application Crashes
```bash
# Check logs
heroku logs --tail

# Restart app
heroku restart

# Check dyno status
heroku ps
```

### Memory Issues
```bash
# Check memory usage
heroku ps:scale

# Upgrade dyno type if needed
heroku ps:type standard-1x
```

## Additional Features

### Custom Domain
```bash
heroku domains:add www.yourdomain.com
```

### SSL Certificate
Heroku provides free SSL for all apps on herokuapp.com domains.

### Backup Strategy
MongoDB Atlas provides:
- Automated backups (paid tiers)
- Point-in-time recovery
- Manual snapshots

## Security Notes

1. **Never commit `.env` files** with real credentials
2. **Use environment variables** for all sensitive data
3. **Enable 2FA** on both Heroku and MongoDB Atlas
4. **Regularly update dependencies** with `npm audit fix`
5. **Monitor logs** for suspicious activity

## Support

- **Heroku Documentation**: https://devcenter.heroku.com/
- **MongoDB Atlas Documentation**: https://docs.atlas.mongodb.com/
- **Application Issues**: Check `/logs` folder in your app

---

## Quick Deploy Commands Summary

```bash
# Full deployment sequence
cd E:\_Applications\__ZNDPRODS\qrscanapp
git add .
git commit -m "Update for deployment"
git push heroku master
heroku open
heroku logs --tail
```

## Rollback if Needed

```bash
# View releases
heroku releases

# Rollback to previous version
heroku rollback

# Rollback to specific version
heroku rollback v102
```