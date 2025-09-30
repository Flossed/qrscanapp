const User = require('../models/User');

// Check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }

    // Save the original URL for redirect after login
    req.session.returnTo = req.originalUrl;

    // For API routes, return JSON error
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }

    // For page routes, redirect to login
    res.redirect('/auth/login');
};

// Check if user is NOT authenticated (for login/register pages)
const isNotAuthenticated = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return next();
    }

    // Already logged in, redirect to home
    res.redirect('/');
};

// Load user data for all authenticated requests
const loadUser = async (req, res, next) => {
    if (req.session && req.session.userId) {
        try {
            const user = await User.findById(req.session.userId)
                .select('-password -resetPasswordToken -resetPasswordExpires -emailVerificationToken');

            if (user && user.isActive) {
                req.user = user;
                res.locals.user = user;
            } else {
                // User not found or inactive, clear session
                req.session.destroy();
            }
        } catch (error) {
            console.error('Error loading user:', error);
        }
    }
    next();
};

// Check if user is admin
const isAdmin = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Admin access required'
        });
    }

    next();
};

// Update last login
const updateLastLogin = async (userId) => {
    try {
        await User.findByIdAndUpdate(userId, {
            lastLogin: new Date()
        });
    } catch (error) {
        console.error('Error updating last login:', error);
    }
};

module.exports = {
    isAuthenticated,
    isNotAuthenticated,
    loadUser,
    isAdmin,
    updateLastLogin
};