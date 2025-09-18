const mongoose = require('mongoose');

const ebsiCacheSchema = new mongoose.Schema({
    // The certificate thumbprint (SHA256)
    thumbprint: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // Whether the certificate was found in EBSI bridge
    found: {
        type: Boolean,
        required: true,
        default: false
    },

    // The complete EBSI response data (if found)
    ebsiResponse: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },

    // Public key data (if available)
    publicKey: {
        type: String,
        default: null
    },

    // Issuer information from EBSI
    issuerInfo: {
        officialId: String,
        countryCode: String,
        name: String
    },

    // Cache metadata
    lastChecked: {
        type: Date,
        default: Date.now,
        index: true
    },

    // Number of times this thumbprint has been queried
    hitCount: {
        type: Number,
        default: 1
    },

    // Whether this entry needs to be refreshed
    needsRefresh: {
        type: Boolean,
        default: false
    },

    // Source of the cache entry (upload, verification, refresh)
    source: {
        type: String,
        enum: ['upload', 'verification', 'refresh', 'startup'],
        default: 'upload'
    },

    // HTTP status from last EBSI query
    lastStatus: {
        type: Number,
        default: null
    },

    // Error message if query failed
    lastError: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Index for efficient queries
ebsiCacheSchema.index({ lastChecked: -1 });
ebsiCacheSchema.index({ found: 1 });
ebsiCacheSchema.index({ needsRefresh: 1 });

// Static method to find or create cache entry
ebsiCacheSchema.statics.findOrCreate = async function(thumbprint) {
    let entry = await this.findOne({ thumbprint });
    if (!entry) {
        entry = new this({
            thumbprint,
            found: false,
            source: 'verification'
        });
    }
    return entry;
};

// Method to mark entry as needing refresh
ebsiCacheSchema.methods.markForRefresh = function() {
    this.needsRefresh = true;
    return this.save();
};

// Method to update cache entry with EBSI response
ebsiCacheSchema.methods.updateWithEbsiResponse = function(response, status, error = null) {
    this.found = response && Array.isArray(response) && response.length > 0;
    this.ebsiResponse = response;
    this.lastChecked = new Date();
    this.lastStatus = status;
    this.lastError = error;
    this.needsRefresh = false;
    this.hitCount += 1;

    // Extract public key and issuer info if found
    if (this.found && response && response[0]) {
        const issuer = response[0];
        this.publicKey = issuer.publicKey || null;
        this.issuerInfo = {
            officialId: issuer.officialId,
            countryCode: issuer.countryCode,
            name: issuer.name
        };
    } else {
        this.publicKey = null;
        this.issuerInfo = {};
    }

    return this.save();
};

// Static method to get cache statistics
ebsiCacheSchema.statics.getStats = async function() {
    const total = await this.countDocuments();
    const found = await this.countDocuments({ found: true });
    const missing = await this.countDocuments({ found: false });
    const needsRefresh = await this.countDocuments({ needsRefresh: true });
    const lastRefresh = await this.findOne().sort({ lastChecked: -1 }).select('lastChecked');

    return {
        total,
        found,
        missing,
        needsRefresh,
        hitRate: total > 0 ? Math.round((found / total) * 100) : 0,
        lastRefresh: lastRefresh ? lastRefresh.lastChecked : null
    };
};

// Static method to mark all entries for refresh
ebsiCacheSchema.statics.markAllForRefresh = async function() {
    return this.updateMany({}, { needsRefresh: true });
};

// Static method to get entries that need refresh
ebsiCacheSchema.statics.getEntriesNeedingRefresh = async function(limit = 100) {
    return this.find({ needsRefresh: true }).limit(limit);
};

module.exports = mongoose.model('EbsiCache', ebsiCacheSchema);