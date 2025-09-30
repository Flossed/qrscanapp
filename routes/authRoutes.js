const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Scan = require('../models/Scan');
const { isAuthenticated, isNotAuthenticated, updateLastLogin } = require('../middleware/auth');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Configure email transporter
const getTransporter = () => {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return null;
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_PORT == 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
};

// Login page
router.get('/login', isNotAuthenticated, (req, res) => {
    res.render('auth/login', {
        title: 'Login - EHIC Verifier',
        error: req.query.error,
        success: req.query.success
    });
});

// Login POST
router.post('/login', isNotAuthenticated, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.redirect('/auth/login?error=' + encodeURIComponent('Please provide email and password'));
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user || !(await user.comparePassword(password))) {
            return res.redirect('/auth/login?error=' + encodeURIComponent('Invalid email or password'));
        }

        if (!user.isActive) {
            return res.redirect('/auth/login?error=' + encodeURIComponent('Your account has been deactivated'));
        }

        // Create session
        req.session.userId = user._id;
        req.session.userEmail = user.email;
        req.session.userName = user.fullName;

        // Update last login
        await updateLastLogin(user._id);

        // Redirect to original URL or home
        const returnTo = req.session.returnTo || '/';
        delete req.session.returnTo;
        res.redirect(returnTo);

    } catch (error) {
        console.error('Login error:', error);
        res.redirect('/auth/login?error=' + encodeURIComponent('Login failed. Please try again.'));
    }
});

// Register page
router.get('/register', isNotAuthenticated, (req, res) => {
    res.render('auth/register', {
        title: 'Register - EHIC Verifier',
        error: req.query.error
    });
});

// Register POST
router.post('/register', isNotAuthenticated, async (req, res) => {
    try {
        const { email, password, confirmPassword, firstName, lastName, organization } = req.body;

        // Validation
        if (!email || !password || !firstName || !lastName) {
            return res.redirect('/auth/register?error=' + encodeURIComponent('All fields are required'));
        }

        if (password !== confirmPassword) {
            return res.redirect('/auth/register?error=' + encodeURIComponent('Passwords do not match'));
        }

        if (password.length < 6) {
            return res.redirect('/auth/register?error=' + encodeURIComponent('Password must be at least 6 characters'));
        }

        // Check if email exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.redirect('/auth/register?error=' + encodeURIComponent('Email already registered'));
        }

        // Create new user
        const user = new User({
            email: email.toLowerCase(),
            password,
            firstName,
            lastName,
            organization: organization || '',
            emailVerified: true // For now, auto-verify. In production, send verification email
        });

        await user.save();

        // Auto-login after registration
        req.session.userId = user._id;
        req.session.userEmail = user.email;
        req.session.userName = user.fullName;

        res.redirect('/?success=' + encodeURIComponent('Registration successful! Welcome to EHIC Verifier.'));

    } catch (error) {
        console.error('Registration error:', error);
        res.redirect('/auth/register?error=' + encodeURIComponent('Registration failed. Please try again.'));
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/auth/login?success=' + encodeURIComponent('You have been logged out successfully'));
    });
});

// Forgot password page
router.get('/forgot-password', isNotAuthenticated, (req, res) => {
    res.render('auth/forgot-password', {
        title: 'Forgot Password - EHIC Verifier',
        error: req.query.error,
        success: req.query.success
    });
});

// Forgot password POST
router.post('/forgot-password', isNotAuthenticated, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.redirect('/auth/forgot-password?error=' + encodeURIComponent('Please provide your email'));
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Don't reveal if email exists
            return res.redirect('/auth/forgot-password?success=' + encodeURIComponent('If an account exists with this email, you will receive password reset instructions'));
        }

        // Generate reset token
        const resetToken = user.createPasswordResetToken();
        await user.save({ validateBeforeSave: false });

        // Send email
        const transporter = getTransporter();
        if (transporter) {
            const resetURL = `${req.protocol}://${req.get('host')}/auth/reset-password/${resetToken}`;

            await transporter.sendMail({
                from: '"EHIC Verifier" <noreply@ehic-verifier.com>',
                to: user.email,
                subject: 'Password Reset Request',
                html: `
                    <h2>Password Reset Request</h2>
                    <p>Hi ${user.firstName},</p>
                    <p>You requested a password reset for your EHIC Verifier account.</p>
                    <p>Click the link below to reset your password (valid for 30 minutes):</p>
                    <a href="${resetURL}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
                    <p>If you didn't request this, please ignore this email.</p>
                    <p>Link: ${resetURL}</p>
                `
            });
        }

        res.redirect('/auth/forgot-password?success=' + encodeURIComponent('If an account exists with this email, you will receive password reset instructions'));

    } catch (error) {
        console.error('Forgot password error:', error);
        res.redirect('/auth/forgot-password?error=' + encodeURIComponent('Failed to process request. Please try again.'));
    }
});

// Reset password page
router.get('/reset-password/:token', isNotAuthenticated, async (req, res) => {
    try {
        const hashedToken = crypto
            .createHash('sha256')
            .update(req.params.token)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.redirect('/auth/forgot-password?error=' + encodeURIComponent('Invalid or expired reset link'));
        }

        res.render('auth/reset-password', {
            title: 'Reset Password - EHIC Verifier',
            token: req.params.token,
            error: req.query.error
        });

    } catch (error) {
        console.error('Reset password page error:', error);
        res.redirect('/auth/forgot-password?error=' + encodeURIComponent('Invalid or expired reset link'));
    }
});

// Reset password POST
router.post('/reset-password/:token', isNotAuthenticated, async (req, res) => {
    try {
        const { password, confirmPassword } = req.body;

        if (!password || !confirmPassword) {
            return res.redirect(`/auth/reset-password/${req.params.token}?error=` + encodeURIComponent('All fields are required'));
        }

        if (password !== confirmPassword) {
            return res.redirect(`/auth/reset-password/${req.params.token}?error=` + encodeURIComponent('Passwords do not match'));
        }

        if (password.length < 6) {
            return res.redirect(`/auth/reset-password/${req.params.token}?error=` + encodeURIComponent('Password must be at least 6 characters'));
        }

        const hashedToken = crypto
            .createHash('sha256')
            .update(req.params.token)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.redirect('/auth/forgot-password?error=' + encodeURIComponent('Invalid or expired reset link'));
        }

        // Update password
        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.redirect('/auth/login?success=' + encodeURIComponent('Password reset successful. Please login with your new password.'));

    } catch (error) {
        console.error('Reset password error:', error);
        res.redirect(`/auth/reset-password/${req.params.token}?error=` + encodeURIComponent('Failed to reset password. Please try again.'));
    }
});

// Profile page
router.get('/profile', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).select('-password');
        const scanCount = await Scan.countDocuments({ userId: req.session.userId });

        res.render('auth/profile', {
            title: 'My Profile - EHIC Verifier',
            user,
            scanCount,
            error: req.query.error,
            success: req.query.success
        });

    } catch (error) {
        console.error('Profile page error:', error);
        res.redirect('/?error=' + encodeURIComponent('Failed to load profile'));
    }
});

// Update profile
router.post('/profile', isAuthenticated, async (req, res) => {
    try {
        const { firstName, lastName, organization } = req.body;

        await User.findByIdAndUpdate(req.session.userId, {
            firstName,
            lastName,
            organization
        });

        req.session.userName = `${firstName} ${lastName}`;

        res.redirect('/auth/profile?success=' + encodeURIComponent('Profile updated successfully'));

    } catch (error) {
        console.error('Update profile error:', error);
        res.redirect('/auth/profile?error=' + encodeURIComponent('Failed to update profile'));
    }
});

// Change password
router.post('/change-password', isAuthenticated, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmNewPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmNewPassword) {
            return res.redirect('/auth/profile?error=' + encodeURIComponent('All fields are required'));
        }

        if (newPassword !== confirmNewPassword) {
            return res.redirect('/auth/profile?error=' + encodeURIComponent('New passwords do not match'));
        }

        if (newPassword.length < 6) {
            return res.redirect('/auth/profile?error=' + encodeURIComponent('Password must be at least 6 characters'));
        }

        const user = await User.findById(req.session.userId);

        if (!(await user.comparePassword(currentPassword))) {
            return res.redirect('/auth/profile?error=' + encodeURIComponent('Current password is incorrect'));
        }

        user.password = newPassword;
        await user.save();

        res.redirect('/auth/profile?success=' + encodeURIComponent('Password changed successfully'));

    } catch (error) {
        console.error('Change password error:', error);
        res.redirect('/auth/profile?error=' + encodeURIComponent('Failed to change password'));
    }
});

// Delete account
router.post('/delete-account', isAuthenticated, async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.redirect('/auth/profile?error=' + encodeURIComponent('Password is required to delete account'));
        }

        const user = await User.findById(req.session.userId);

        if (!(await user.comparePassword(password))) {
            return res.redirect('/auth/profile?error=' + encodeURIComponent('Incorrect password'));
        }

        // Delete all user's scans
        await Scan.deleteMany({ userId: req.session.userId });

        // Delete user account
        await User.findByIdAndDelete(req.session.userId);

        // Destroy session
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err);
            }
            res.redirect('/auth/register?success=' + encodeURIComponent('Your account has been deleted successfully'));
        });

    } catch (error) {
        console.error('Delete account error:', error);
        res.redirect('/auth/profile?error=' + encodeURIComponent('Failed to delete account'));
    }
});

module.exports = router;