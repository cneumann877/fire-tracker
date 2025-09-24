// config/environment.js
// Environment Configuration Manager

const path = require('path');
const fs = require('fs');

class EnvironmentConfig {
    constructor() {
        this.env = process.env.NODE_ENV || 'development';
        this.config = this.loadConfig();
    }

    loadConfig() {
        const defaultConfig = {
            // Server Configuration
            server: {
                port: parseInt(process.env.PORT) || 3000,
                host: process.env.HOST || '0.0.0.0',
                environment: this.env,
                timezone: process.env.TIMEZONE || 'America/Chicago'
            },

            // Database Configuration
            database: {
                path: process.env.DATABASE_PATH || 'fire_tracker.db',
                connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
                timeout: parseInt(process.env.DB_TIMEOUT) || 30000,
                autoBackup: process.env.AUTO_BACKUP_ENABLED === 'true',
                backupInterval: process.env.BACKUP_INTERVAL || 'daily',
                retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 90
            },

            // Security Configuration
            security: {
                maxFailedAttempts: parseInt(process.env.MAX_FAILED_ATTEMPTS) || 5,
                lockoutDuration: parseInt(process.env.ACCOUNT_LOCKOUT_DURATION) || 30,
                sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 480,
                pinMinLength: parseInt(process.env.PIN_MIN_LENGTH) || 4,
                pinMaxLength: parseInt(process.env.PIN_MAX_LENGTH) || 6,
                saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12,
                rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 15,
                rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX) || 100,
                authRateLimitMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5
            },

            // Logging Configuration
            logging: {
                level: process.env.LOG_LEVEL || 'info',
                retentionDays: parseInt(process.env.LOG_RETENTION_DAYS) || 30,
                maxFileSize: process.env.LOG_MAX_FILE_SIZE || '10MB',
                enableConsole: process.env.LOG_ENABLE_CONSOLE !== 'false',
                enableFile: process.env.LOG_ENABLE_FILE !== 'false',
                enableAudit: process.env.LOG_ENABLE_AUDIT !== 'false'
            },

            // Department Configuration
            department: {
                name: process.env.DEPARTMENT_NAME || 'Fire Department',
                logo: process.env.DEPARTMENT_LOGO || '/assets/logo.png',
                address: process.env.DEPARTMENT_ADDRESS || '',
                phone: process.env.DEPARTMENT_PHONE || '',
                email: process.env.DEPARTMENT_EMAIL || '',
                website: process.env.DEPARTMENT_WEBSITE || ''
            },

            // Email Configuration (for notifications)
            email: {
                enabled: process.env.EMAIL_ENABLED === 'true',
                smtp: {
                    host: process.env.SMTP_HOST || '',
                    port: parseInt(process.env.SMTP_PORT) || 587,
                    secure: process.env.SMTP_SECURE === 'true',
                    user: process.env.SMTP_USER || '',
                    password: process.env.SMTP_PASSWORD || ''
                },
                from: process.env.EMAIL_FROM || 'noreply@firedept.gov',
                templates: {
                    accountLocked: process.env.EMAIL_TEMPLATE_LOCKED || 'account-locked',
                    pinReset: process.env.EMAIL_TEMPLATE_PIN_RESET || 'pin-reset',
                    systemAlert: process.env.EMAIL_TEMPLATE_ALERT || 'system-alert'
                }
            },

            // External Integration
            integration: {
                payrollExport: {
                    enabled: process.env.PAYROLL_EXPORT_ENABLED === 'true',
                    format: process.env.PAYROLL_EXPORT_FORMAT || 'csv',
                    schedule: process.env.PAYROLL_EXPORT_SCHEDULE || 'weekly',
                    outputPath: process.env.PAYROLL_EXPORT_PATH || './exports/payroll'
                },
                apiKeys: {
                    weather: process.env.WEATHER_API_KEY || '',
                    mapping: process.env.MAPPING_API_KEY || ''
                }
            },

            // Performance Configuration
            performance: {
                enableCompression: process.env.ENABLE_COMPRESSION !== 'false',
                staticCacheAge: parseInt(process.env.STATIC_CACHE_AGE) || 86400,
                enableEtag: process.env.ENABLE_ETAG !== 'false',
                maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb'
            },

            // Monitoring Configuration
            monitoring: {
                healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
                metricsRetention: parseInt(process.env.METRICS_RETENTION_HOURS) || 168,
                alertThresholds: {
                    responseTime: parseInt(process.env.ALERT_RESPONSE_TIME) || 5000,
                    errorRate: parseFloat(process.env.ALERT_ERROR_RATE) || 0.05,
                    memoryUsage: parseFloat(process.env.ALERT_MEMORY_USAGE) || 0.8
                }
            }
        };

        // Override with environment-specific settings
        return this.mergeEnvironmentConfig(defaultConfig);
    }

    mergeEnvironmentConfig(defaultConfig) {
        const envConfigPath = path.join(__dirname, `${this.env}.json`);
        
        if (fs.existsSync(envConfigPath)) {
            try {
                const envConfig = JSON.parse(fs.readFileSync(envConfigPath, 'utf8'));
                return this.deepMerge(defaultConfig, envConfig);
            } catch (error) {
                console.warn(`Failed to load environment config for ${this.env}:`, error.message);
            }
        }

        return defaultConfig;
    }

    deepMerge(target, source) {
        const output = Object.assign({}, target);
        
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this.deepMerge(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        
        return output;
    }

    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    get(path) {
        return path.split('.').reduce((obj, key) => obj && obj[key], this.config);
    }

    isDevelopment() {
        return this.env === 'development';
    }

    isProduction() {
        return this.env === 'production';
    }

    isTest() {
        return this.env === 'test';
    }

    validateConfig() {
        const errors = [];

        // Validate required configurations
        if (!this.config.server.port) {
            errors.push('Server port is required');
        }

        if (!this.config.database.path) {
            errors.push('Database path is required');
        }

        if (this.config.email.enabled) {
            if (!this.config.email.smtp.host) {
                errors.push('SMTP host is required when email is enabled');
            }
            if (!this.config.email.smtp.user || !this.config.email.smtp.password) {
                errors.push('SMTP credentials are required when email is enabled');
            }
        }

        // Validate security settings
        if (this.config.security.maxFailedAttempts < 1) {
            errors.push('Max failed attempts must be at least 1');
        }

        if (this.config.security.pinMinLength < 4) {
            errors.push('PIN minimum length must be at least 4');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    getSecurityHeaders() {
        return {
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: [
                        "'self'", 
                        "'unsafe-inline'", 
                        "https://cdn.jsdelivr.net", 
                        "https://cdnjs.cloudflare.com"
                    ],
                    scriptSrc: [
                        "'self'", 
                        "'unsafe-inline'", 
                        "https://cdn.jsdelivr.net", 
                        "https://cdnjs.cloudflare.com"
                    ],
                    imgSrc: ["'self'", "data:", "https:"],
                    fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
                    connectSrc: ["'self'"],
                    mediaSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    childSrc: ["'self'"],
                    frameAncestors: ["'none'"],
                    formAction: ["'self'"],
                    baseUri: ["'self'"]
                }
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            },
            noSniff: true,
            xssFilter: true,
            referrerPolicy: 'same-origin',
            permittedCrossDomainPolicies: false
        };
    }
}

// Environment-specific configuration files

// config/development.json
const developmentConfig = {
    server: {
        port: 3000
    },
    security: {
        saltRounds: 10,
        maxFailedAttempts: 10
    },
    logging: {
        level: 'debug',
        enableConsole: true
    },
    database: {
        autoBackup: false
    }
};

// config/production.json
const productionConfig = {
    server: {
        port: 3000
    },
    security: {
        saltRounds: 12,
        maxFailedAttempts: 3
    },
    logging: {
        level: 'warn',
        enableConsole: false
    },
    database: {
        autoBackup: true,
        backupInterval: 'daily'
    },
    performance: {
        enableCompression: true,
        staticCacheAge: 604800
    }
};

// config/test.json
const testConfig = {
    server: {
        port: 3001
    },
    database: {
        path: 'fire_tracker_test.db',
        autoBackup: false
    },
    logging: {
        level: 'error',
        enableConsole: false,
        enableFile: false
    },
    security: {
        saltRounds: 4
    }
};

// Create environment-specific config files if they don't exist
function createEnvironmentConfigs() {
    const configDir = path.join(__dirname);
    
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    const configs = {
        'development.json': developmentConfig,
        'production.json': productionConfig,
        'test.json': testConfig
    };

    Object.entries(configs).forEach(([filename, config]) => {
        const filePath = path.join(configDir, filename);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
        }
    });
}

// Initialize config files
if (require.main === module) {
    createEnvironmentConfigs();
    console.log('✅ Environment configuration files created');
}

module.exports = EnvironmentConfig;
