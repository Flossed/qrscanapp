const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const packageJson = require('./package.json');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// MongoDB connection with retry logic for production
// Build MongoDB URI from individual environment variables or use full URI
let mongoUri;
if (process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_CLUSTER && process.env.DB_NAME) {
  mongoUri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_CLUSTER}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
  console.log('Using MongoDB Atlas with individual env variables');
  console.log('DB_USER:', process.env.DB_USER);
  console.log('DB_CLUSTER:', process.env.DB_CLUSTER);
  console.log('DB_NAME:', process.env.DB_NAME);
} else if (process.env.MONGODB_URI) {
  mongoUri = process.env.MONGODB_URI;
  console.log('Using MONGODB_URI environment variable');
} else if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: Production environment but no database credentials found!');
  console.error('Please set DB_USER, DB_PASSWORD, DB_CLUSTER, and DB_NAME environment variables');
  process.exit(1);
} else {
  mongoUri = 'mongodb://192.168.129.197:27017/qrscanapp';
  console.log('Using local MongoDB (development mode)');
}

// MongoDB options (removed deprecated options)
const mongoOptions = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

mongoose.connect(mongoUri, mongoOptions)
  .then(() => {
    console.log('MongoDB connected successfully');
    console.log('Database:', mongoose.connection.name);
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    // Exit process if can't connect to database
    process.exit(1);
  });

// Handle MongoDB connection events
mongoose.connection.on('error', err => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'ehic-verifier-secret-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: mongoUri,
    touchAfter: 24 * 3600 // lazy session update
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true in production with HTTPS
    httpOnly: true,
    maxAge: null // Session cookie - expires when browser is closed
  }
}));

// Cache control middleware - prevent caching of authenticated content
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Application mode configuration
const APP_MODE = (process.env.MODE || 'DEBUG').toUpperCase();
console.log(`Application running in ${APP_MODE} mode`);

// Make mode and version available to all views
app.use((req, res, next) => {
  res.locals.appMode = APP_MODE;
  res.locals.isDebugMode = APP_MODE === 'DEBUG';
  res.locals.isProductionMode = APP_MODE === 'PRODUCTION';
  res.locals.appVersion = packageJson.version;
  next();
});

// Load user middleware
const { loadUser } = require('./middleware/auth');
app.use(loadUser);

// Authentication routes (no auth required)
const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);

// Main application routes (auth required)
const scanRoutes = require('./routes/scanRoutes');
app.use('/', scanRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});