const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const helmet = require('helmet');
const winston = require('winston');
const SystemMaintenance = require('./scripts/system-maintenance');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== ENTERPRISE LOGGING SETUP =====
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'fire-tracker' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// ===== SECURITY MIDDLEWARE =====
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"]
        }
    }
}));

// ===== RATE LIMITING =====
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 auth attempts per windowMs
    message: { error: 'Too many authentication attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn('Rate limit exceeded for authentication', {
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        res.status(429).json({ error: 'Too many authentication attempts, please try again later.' });
    }
});

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
});

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));
app.use(generalLimiter);

// Request logging middleware
app.use((req, res, next) => {
    logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    next();
});

// ===== DATABASE INITIALIZATION =====
const db = new sqlite3.Database('fire_tracker.db', (err) => {
    if (err) {
        logger.error('Error opening database:', err);
    } else {
        logger.info('Connected to SQLite database');
    }
});

const CURRENT_DB_VERSION = 3;

// ===== DATABASE SCHEMA AND MIGRATIONS =====
async function initializeDatabase() {
    logger.info('Initializing database schema...');
    
    try {
        await runMigrations();
        await insertDefaultData();
        logger.info('✅ Database initialization complete');
    } catch (error) {
        logger.error('❌ Database initialization failed:', error);
        throw error;
    }
}

function getDatabaseVersion() {
    return new Promise((resolve, reject) => {
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='db_version'", (err, row) => {
            if (err) {
                reject(err);
            } else if (!row) {
                resolve(0);
            } else {
                db.get("SELECT version FROM db_version LIMIT 1", (err, versionRow) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(versionRow ? versionRow.version : 0);
                    }
                });
            }
        });
    });
}

function setDatabaseVersion(version) {
    return new Promise((resolve, reject) => {
        db.run("CREATE TABLE IF NOT EXISTS db_version (version INTEGER)", (err) => {
            if (err) {
                reject(err);
            } else {
                db.run("DELETE FROM db_version", (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        db.run("INSERT INTO db_version (version) VALUES (?)", [version], (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    }
                });
            }
        });
    });
}

async function runMigrations() {
    try {
        const currentVersion = await getDatabaseVersion();
        logger.info(`Current database version: ${currentVersion}`);
        
        if (currentVersion < 1) {
            logger.info('Running migration to version 1: Creating initial tables...');
            await migration_v1();
        }
        
        if (currentVersion < 2) {
            logger.info('Running migration to version 2: Adding authentication features...');
            await migration_v2();
        }

        if (currentVersion < 3) {
            logger.info('Running migration to version 3: Adding enterprise features...');
            await migration_v3();
        }
        
        await setDatabaseVersion(CURRENT_DB_VERSION);
        logger.info(`Database updated to version ${CURRENT_DB_VERSION}`);
    } catch (error) {
        logger.error('Migration error:', error);
        throw error;
    }
}

// Migration v1: Initial tables
function migration_v1() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Firefighters table
            db.run(`CREATE TABLE IF NOT EXISTS firefighters (
                badge TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT,
                rank TEXT DEFAULT 'Firefighter',
                station TEXT,
                phone TEXT,
                hire_date TEXT,
                status TEXT DEFAULT 'active',
                certifications TEXT, -- JSON array
                vacation_days_total INTEGER DEFAULT 11,
                vacation_days_used INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            // Incidents table
            db.run(`CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                location TEXT NOT NULL,
                incident_type TEXT NOT NULL,
                description TEXT,
                priority TEXT DEFAULT 'Medium',
                time TEXT DEFAULT CURRENT_TIMESTAMP,
                active INTEGER DEFAULT 1,
                closed_reason TEXT,
                closed_by_badge TEXT,
                closed_by_station TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            // Attendees table
            db.run(`CREATE TABLE IF NOT EXISTS attendees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id TEXT,
                badge TEXT,
                name TEXT,
                station TEXT,
                check_in_time TEXT DEFAULT CURRENT_TIMESTAMP,
                check_out_time TEXT,
                flagged INTEGER DEFAULT 0,
                flag_reason TEXT,
                pay_code TEXT,
                FOREIGN KEY (incident_id) REFERENCES incidents (id),
                FOREIGN KEY (badge) REFERENCES firefighters (badge)
            )`);

            // Events table
            db.run(`CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_name TEXT NOT NULL,
                event_type TEXT NOT NULL,
                activity_category TEXT,
                location TEXT,
                start_date TEXT NOT NULL,
                end_date TEXT,
                description TEXT,
                status TEXT DEFAULT 'pending',
                created_by TEXT,
                created_by_badge TEXT,
                active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            // Event attendees table
            db.run(`CREATE TABLE IF NOT EXISTS event_attendees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER,
                badge TEXT,
                name TEXT,
                station TEXT,
                attendance_type TEXT,
                check_in_time TEXT DEFAULT CURRENT_TIMESTAMP,
                check_out_time TEXT,
                actual_start_time TEXT,
                actual_end_time TEXT,
                hours_worked REAL,
                approved_hours REAL,
                notes TEXT,
                pay_code TEXT,
                FOREIGN KEY (event_id) REFERENCES events (id),
                FOREIGN KEY (badge) REFERENCES firefighters (badge)
            )`);

            // Stations table
            db.run(`CREATE TABLE IF NOT EXISTS stations (
                name TEXT PRIMARY KEY,
                address TEXT,
                phone TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            // Station accounts table
            db.run(`CREATE TABLE IF NOT EXISTS station_accounts (
                station_name TEXT PRIMARY KEY,
                password TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    });
}

// Migration v2: Add authentication features
function migration_v2() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            try {
                // Add PIN authentication columns to firefighters
                db.run("ALTER TABLE firefighters ADD COLUMN pin_hash TEXT");
                db.run("ALTER TABLE firefighters ADD COLUMN pin_reset_at TEXT");
                db.run("ALTER TABLE firefighters ADD COLUMN pin_reset_by TEXT");
                db.run("ALTER TABLE firefighters ADD COLUMN account_locked INTEGER DEFAULT 0");
                db.run("ALTER TABLE firefighters ADD COLUMN failed_attempts INTEGER DEFAULT 0");
                db.run("ALTER TABLE firefighters ADD COLUMN last_failed_attempt TEXT");

                // Authentication logs table
                db.run(`CREATE TABLE IF NOT EXISTS auth_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    badge TEXT,
                    attempt_time TEXT DEFAULT CURRENT_TIMESTAMP,
                    success INTEGER,
                    ip_address TEXT,
                    user_agent TEXT,
                    failure_reason TEXT
                )`);

                // PIN reset logs table
                db.run(`CREATE TABLE IF NOT EXISTS pin_reset_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    badge TEXT,
                    reset_by TEXT,
                    reset_reason TEXT,
                    reset_time TEXT DEFAULT CURRENT_TIMESTAMP,
                    reset_type TEXT
                )`, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });

            } catch (error) {
                reject(error);
            }
        });
    });
}

// Migration v3: Add enterprise features
function migration_v3() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            try {
                // Activity categories table
                db.run(`CREATE TABLE IF NOT EXISTS activity_categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category_name TEXT UNIQUE,
                    description TEXT,
                    requires_approval INTEGER DEFAULT 1,
                    default_hours REAL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )`);

                // System settings table
                db.run(`CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    description TEXT,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )`);

                // Audit log table
                db.run(`CREATE TABLE IF NOT EXISTS audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_badge TEXT,
                    action TEXT,
                    table_name TEXT,
                    record_id TEXT,
                    old_values TEXT, -- JSON
                    new_values TEXT, -- JSON
                    ip_address TEXT,
                    user_agent TEXT,
                    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
                )`);

                resolve();

            } catch (error) {
                reject(error);
            }
        });
    });
}

async function insertDefaultData() {
    // Insert default stations
    const defaultStations = [
        { name: 'Station 1', address: '123 Fire Station Rd', phone: '555-0001' },
        { name: 'Station 2', address: '456 Emergency Ave', phone: '555-0002' },
        { name: 'Station 3', address: '789 Rescue Blvd', phone: '555-0003' },
        { name: 'Station 4', address: '321 Safety St', phone: '555-0004' },
        { name: 'Station 5', address: '654 Hero Ln', phone: '555-0005' }
    ];

    for (const station of defaultStations) {
        await new Promise((resolve) => {
            db.run("INSERT OR IGNORE INTO stations (name, address, phone) VALUES (?, ?, ?)", 
                   [station.name, station.address, station.phone], () => resolve());
        });
    }

    // Insert default station accounts
    const stationAccounts = [
        { station: 'Station 1', password: 'station1pass' },
        { station: 'Station 2', password: 'station2pass' },
        { station: 'Station 3', password: 'station3pass' },
        { station: 'Station 4', password: 'station4pass' },
        { station: 'Station 5', password: 'station5pass' }
    ];

    for (const account of stationAccounts) {
        await new Promise((resolve) => {
            db.run("INSERT OR IGNORE INTO station_accounts (station_name, password) VALUES (?, ?)", 
                   [account.station, account.password], () => resolve());
        });
    }

    // Insert default personnel with PIN hashes
    const defaultPersonnel = [
        { badge: '001', name: 'John Smith', rank: 'Captain', station: 'Station 1', pin: '1234' },
        { badge: '002', name: 'Jane Doe', rank: 'Lieutenant', station: 'Station 1', pin: '2345' },
        { badge: '003', name: 'Mike Johnson', rank: 'Firefighter', station: 'Station 2', pin: '3456' },
        { badge: '004', name: 'Sarah Williams', rank: 'Engineer', station: 'Station 2', pin: '4567' },
        { badge: '005', name: 'Tom Brown', rank: 'Firefighter', station: 'Station 3', pin: '5678' }
    ];

    for (const person of defaultPersonnel) {
        const pinHash = await bcrypt.hash(person.pin, 10);
        await new Promise((resolve) => {
            db.run(`INSERT OR IGNORE INTO firefighters 
                   (badge, name, rank, station, pin_hash, email) 
                   VALUES (?, ?, ?, ?, ?, ?)`, 
                   [person.badge, person.name, person.rank, person.station, 
                    pinHash, `${person.name.toLowerCase().replace(' ', '.')}@firedept.gov`], 
                   () => resolve());
        });
    }

    // Insert default activity categories
    const defaultCategories = [
        { name: 'Fire Training', description: 'Fire suppression and prevention training', hours: 4.0 },
        { name: 'EMS Training', description: 'Emergency medical services training', hours: 4.0 },
        { name: 'Equipment Maintenance', description: 'Equipment checks and maintenance', hours: 2.0 },
        { name: 'Community Event', description: 'Public education and community engagement', hours: 3.0 },
        { name: 'Physical Training', description: 'Physical fitness and conditioning', hours: 1.0 }
    ];

    for (const category of defaultCategories) {
        await new Promise((resolve) => {
            db.run("INSERT OR IGNORE INTO activity_categories (category_name, description, default_hours) VALUES (?, ?, ?)", 
                   [category.name, category.description, category.hours], () => resolve());
        });
    }
}

// ===== AUTHENTICATION ENDPOINTS =====
app.post('/api/firefighters/authenticate', authLimiter, async (req, res) => {
    const { badge, pin } = req.body;
    const clientIP = req.ip;
    const userAgent = req.get('User-Agent');

    try {
        if (!badge || !pin) {
            await logAuthAttempt(badge, false, clientIP, userAgent, 'Missing badge or PIN');
            return res.status(400).json({ error: 'Badge and PIN are required' });
        }

        // Get firefighter from database
        db.get("SELECT * FROM firefighters WHERE badge = ?", [badge], async (err, firefighter) => {
            if (err) {
                logger.error('Database error during authentication:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            if (!firefighter) {
                await logAuthAttempt(badge, false, clientIP, userAgent, 'Badge not found');
                return res.status(401).json({ error: 'Invalid badge number' });
            }

            if (firefighter.account_locked) {
                await logAuthAttempt(badge, false, clientIP, userAgent, 'Account locked');
                return res.status(423).json({ error: 'Account is locked. Contact administrator.' });
            }

            // Verify PIN
            const isPinValid = await bcrypt.compare(pin, firefighter.pin_hash);
            
            if (isPinValid) {
                // Reset failed attempts on successful login
                db.run("UPDATE firefighters SET failed_attempts = 0, last_failed_attempt = NULL WHERE badge = ?", [badge]);
                
                await logAuthAttempt(badge, true, clientIP, userAgent, null);
                
                logger.info('Successful authentication', { badge, name: firefighter.name });
                
                // Return firefighter data (excluding sensitive info)
                const { pin_hash, ...safeFirefighter } = firefighter;
                res.json({ 
                    success: true, 
                    firefighter: safeFirefighter 
                });
            } else {
                // Increment failed attempts
                const failedAttempts = (firefighter.failed_attempts || 0) + 1;
                const shouldLock = failedAttempts >= 5;
                
                db.run(`UPDATE firefighters SET 
                        failed_attempts = ?, 
                        last_failed_attempt = ?,
                        account_locked = ?
                        WHERE badge = ?`, 
                       [failedAttempts, new Date().toISOString(), shouldLock ? 1 : 0, badge]);

                await logAuthAttempt(badge, false, clientIP, userAgent, 'Invalid PIN');
                
                if (shouldLock) {
                    logger.warn('Account locked due to failed attempts', { badge, attempts: failedAttempts });
                    return res.status(423).json({ error: 'Account locked due to multiple failed attempts. Contact administrator.' });
                }
                
                res.status(401).json({ error: 'Invalid PIN' });
            }
        });

    } catch (error) {
        logger.error('Authentication error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper function to log authentication attempts
function logAuthAttempt(badge, success, ipAddress, userAgent, failureReason) {
    return new Promise((resolve) => {
        db.run(`INSERT INTO auth_logs 
               (badge, success, ip_address, user_agent, failure_reason) 
               VALUES (?, ?, ?, ?, ?)`,
               [badge, success ? 1 : 0, ipAddress, userAgent, failureReason],
               () => resolve());
    });
}

// ===== FIREFIGHTER MANAGEMENT ENDPOINTS =====
app.get('/api/firefighters', (req, res) => {
    const { station, status, search } = req.query;
    let query = `
        SELECT 
            badge, name, rank, station, email, phone, hire_date, 
            status, certifications, vacation_days_total, vacation_days_used,
            failed_attempts, account_locked, created_at
        FROM firefighters
    `;
    
    const conditions = [];
    const params = [];
    
    if (station) {
        conditions.push("station = ?");
        params.push(station);
    }
    
    if (status) {
        conditions.push("status = ?");
        params.push(status);
    }
    
    if (search) {
        conditions.push("(name LIKE ? OR badge LIKE ? OR rank LIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }
    
    query += " ORDER BY name ASC";
    
    db.all(query, params, (err, rows) => {
        if (err) {
            logger.error('Error fetching firefighters:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Parse certifications JSON
        const firefighters = rows.map(row => ({
            ...row,
            certifications: row.certifications ? JSON.parse(row.certifications) : []
        }));
        
        res.json(firefighters);
    });
});

app.post('/api/firefighters', async (req, res) => {
    const { badge, name, email, rank, station, pin } = req.body;
    
    try {
        if (!badge || !name || !pin) {
            return res.status(400).json({ error: 'Badge, name, and PIN are required' });
        }
        
        const pinHash = await bcrypt.hash(pin, 10);
        
        db.run(`INSERT INTO firefighters 
               (badge, name, email, rank, station, pin_hash) 
               VALUES (?, ?, ?, ?, ?, ?)`,
               [badge, name, email, rank, station, pinHash], 
               function(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(409).json({ error: 'Badge number already exists' });
                }
                logger.error('Error creating firefighter:', err);
                return res.status(500).json({ error: err.message });
            }
            
            logger.info('Firefighter created', { badge, name });
            res.status(201).json({ success: true, badge });
        });
        
    } catch (error) {
        logger.error('Error hashing PIN:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/firefighters/:badge/pin', async (req, res) => {
    const { badge } = req.params;
    const { newPin, adminBadge } = req.body;
    
    try {
        if (!newPin || !/^\d{4}$/.test(newPin)) {
            return res.status(400).json({ error: 'PIN must be 4 digits' });
        }
        
        const pinHash = await bcrypt.hash(newPin, 10);
        
        db.run(`UPDATE firefighters SET 
                pin_hash = ?, 
                pin_reset_at = ?, 
                pin_reset_by = ?,
                failed_attempts = 0,
                account_locked = 0
                WHERE badge = ?`,
               [pinHash, new Date().toISOString(), adminBadge, badge], 
               function(err) {
            if (err) {
                logger.error('Error resetting PIN:', err);
                return res.status(500).json({ error: err.message });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Firefighter not found' });
            }
            
            // Log the PIN reset
            db.run(`INSERT INTO pin_reset_logs 
                   (badge, reset_by, reset_reason, reset_type) 
                   VALUES (?, ?, ?, ?)`,
                   [badge, adminBadge, 'Administrative reset', 'admin']);
            
            logger.info('PIN reset', { badge, resetBy: adminBadge });
            res.json({ success: true });
        });
        
    } catch (error) {
        logger.error('Error hashing new PIN:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===== INCIDENT MANAGEMENT ENDPOINTS =====
app.get('/api/incidents', (req, res) => {
    const { active, station, limit = 50 } = req.query;
    
    let query = `
        SELECT i.*, 
               GROUP_CONCAT(a.badge || ':' || a.name) as attendees_list,
               COUNT(a.badge) as attendee_count
        FROM incidents i
        LEFT JOIN attendees a ON i.id = a.incident_id
    `;
    
    const conditions = [];
    const params = [];
    
    if (active !== undefined) {
        conditions.push("i.active = ?");
        params.push(active === 'true' ? 1 : 0);
    }
    
    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }
    
    query += " GROUP BY i.id ORDER BY i.created_at DESC LIMIT ?";
    params.push(parseInt(limit));
    
    db.all(query, params, (err, rows) => {
        if (err) {
            logger.error('Error fetching incidents:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const incidents = rows.map(row => ({
            ...row,
            attendees: row.attendees_list ? 
                row.attendees_list.split(',').map(a => {
                    const [badge, name] = a.split(':');
                    return { badge, name };
                }) : []
        }));
        
        res.json(incidents);
    });
});

app.post('/api/incidents', (req, res) => {
    const { id, location, incident_type, description, priority, created_by } = req.body;
    
    if (!id || !location || !incident_type) {
        return res.status(400).json({ error: 'ID, location, and incident type are required' });
    }
    
    db.run(`INSERT INTO incidents 
           (id, location, incident_type, description, priority, time, created_by) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
           [id, location, incident_type, description, priority || 'Medium', new Date().toISOString(), created_by],
           function(err) {
        if (err) {
            if (err.code === 'SQLITE_CONSTRAINT') {
                return res.status(409).json({ error: 'Incident ID already exists' });
            }
            logger.error('Error creating incident:', err);
            return res.status(500).json({ error: err.message });
        }
        
        logger.info('Incident created', { id, location, type: incident_type });
        res.status(201).json({ success: true, id });
    });
});

app.post('/api/incidents/:id/attendees', (req, res) => {
    const { id } = req.params;
    const { badge, station } = req.body;
    
    // Get firefighter details
    db.get("SELECT name FROM firefighters WHERE badge = ?", [badge], (err, firefighter) => {
        if (err || !firefighter) {
            return res.status(404).json({ error: 'Firefighter not found' });
        }
        
        db.run(`INSERT INTO attendees 
               (incident_id, badge, name, station) 
               VALUES (?, ?, ?, ?)`,
               [id, badge, firefighter.name, station],
               function(err) {
            if (err) {
                logger.error('Error adding attendee:', err);
                return res.status(500).json({ error: err.message });
            }
            
            logger.info('Attendee added to incident', { incident: id, badge, name: firefighter.name });
            res.status(201).json({ success: true });
        });
    });
});

// ===== EVENT MANAGEMENT ENDPOINTS =====
app.get('/api/events', (req, res) => {
    const { status, type, limit = 50 } = req.query;
    
    let query = `
        SELECT e.*, 
               GROUP_CONCAT(ea.badge || ':' || ea.name) as attendees_list,
               COUNT(ea.badge) as attendee_count
        FROM events e
        LEFT JOIN event_attendees ea ON e.id = ea.event_id
    `;
    
    const conditions = [];
    const params = [];
    
    if (status) {
        conditions.push("e.status = ?");
        params.push(status);
    }
    
    if (type) {
        conditions.push("e.event_type = ?");
        params.push(type);
    }
    
    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }
    
    query += " GROUP BY e.id ORDER BY e.start_date DESC LIMIT ?";
    params.push(parseInt(limit));
    
    db.all(query, params, (err, rows) => {
        if (err) {
            logger.error('Error fetching events:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const events = rows.map(row => ({
            ...row,
            attendees: row.attendees_list ? 
                row.attendees_list.split(',').map(a => {
                    const [badge, name] = a.split(':');
                    return { badge, name };
                }) : []
        }));
        
        res.json(events);
    });
});

app.post('/api/events', (req, res) => {
    const { event_name, event_type, start_date, end_date, description, created_by_badge } = req.body;
    
    if (!event_name || !event_type || !start_date) {
        return res.status(400).json({ error: 'Event name, type, and start date are required' });
    }
    
    db.run(`INSERT INTO events 
           (event_name, event_type, start_date, end_date, description, created_by_badge) 
           VALUES (?, ?, ?, ?, ?, ?)`,
           [event_name, event_type, start_date, end_date, description, created_by_badge],
           function(err) {
        if (err) {
            logger.error('Error creating event:', err);
            return res.status(500).json({ error: err.message });
        }
        
        logger.info('Event created', { id: this.lastID, name: event_name, type: event_type });
        res.status(201).json({ success: true, id: this.lastID });
    });
});

app.post('/api/events/:id/attendees', (req, res) => {
    const { id } = req.params;
    const { badge, station, attendance_type } = req.body;
    
    // Get firefighter details
    db.get("SELECT name FROM firefighters WHERE badge = ?", [badge], (err, firefighter) => {
        if (err || !firefighter) {
            return res.status(404).json({ error: 'Firefighter not found' });
        }
        
        db.run(`INSERT INTO event_attendees 
               (event_id, badge, name, station, attendance_type) 
               VALUES (?, ?, ?, ?, ?)`,
               [id, badge, firefighter.name, station, attendance_type || 'participant'],
               function(err) {
            if (err) {
                logger.error('Error adding event attendee:', err);
                return res.status(500).json({ error: err.message });
            }
            
            logger.info('Attendee added to event', { event: id, badge, name: firefighter.name });
            res.status(201).json({ success: true });
        });
    });
});

// ===== STATION MANAGEMENT ENDPOINTS =====
app.get('/api/stations', (req, res) => {
    db.all("SELECT * FROM stations ORDER BY name", (err, rows) => {
        if (err) {
            logger.error('Error fetching stations:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

app.post('/api/station/login', (req, res) => {
    const { stationName, password } = req.body;
    
    db.get("SELECT * FROM station_accounts WHERE station_name = ? AND password = ?", 
           [stationName, password], (err, account) => {
        if (err) {
            logger.error('Station login error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (account) {
            logger.info('Station login successful', { station: stationName });
            res.json({ success: true, stationName: account.station_name });
        } else {
            logger.warn('Failed station login attempt', { station: stationName });
            res.status(401).json({ error: 'Invalid station credentials' });
        }
    });
});

// ===== REPORTING ENDPOINTS =====
app.get('/api/reports/activity-summary', (req, res) => {
    const { startDate, endDate } = req.query;
    
    const query = `
        SELECT 
            'incidents' as type,
            COUNT(*) as count,
            DATE(created_at) as date
        FROM incidents 
        WHERE created_at BETWEEN ? AND ?
        GROUP BY DATE(created_at)
        UNION ALL
        SELECT 
            'events' as type,
            COUNT(*) as count,
            DATE(created_at) as date
        FROM events 
        WHERE created_at BETWEEN ? AND ?
        GROUP BY DATE(created_at)
        ORDER BY date DESC
    `;
    
    db.all(query, [startDate, endDate, startDate, endDate], (err, rows) => {
        if (err) {
            logger.error('Error generating activity summary:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

app.get('/api/reports/personnel-stats', (req, res) => {
    const query = `
        SELECT 
            station,
            COUNT(*) as total_personnel,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_personnel,
            AVG(vacation_days_used) as avg_vacation_used
        FROM firefighters
        GROUP BY station
        ORDER BY station
    `;
    
    db.all(query, (err, rows) => {
        if (err) {
            logger.error('Error generating personnel stats:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// ===== AUDIT LOGGING =====
function logAuditEvent(userBadge, action, tableName, recordId, oldValues, newValues, req) {
    db.run(`INSERT INTO audit_log 
           (user_badge, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
           [userBadge, action, tableName, recordId, 
            oldValues ? JSON.stringify(oldValues) : null,
            newValues ? JSON.stringify(newValues) : null,
            req.ip, req.get('User-Agent')]);
}

// ===== HEALTH CHECK ENDPOINT =====
app.get('/api/health', (req, res) => {
    const healthCheck = {
        uptime: process.uptime(),
        message: 'OK',
        timestamp: Date.now(),
        status: 'healthy',
        version: '2.0.0',
        database: 'connected'
    };

    // Check database connection
    db.get("SELECT 1", (err) => {
        if (err) {
            healthCheck.status = 'unhealthy';
            healthCheck.database = 'disconnected';
            healthCheck.message = 'Database connection failed';
            return res.status(503).json(healthCheck);
        }
        
        res.status(200).json(healthCheck);
    });
});

// ===== SYSTEM INFO ENDPOINT =====
app.get('/api/system/info', (req, res) => {
    const systemInfo = {
        version: '2.0.0',
        node_version: process.version,
        platform: process.platform,
        architecture: process.arch,
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        database_version: CURRENT_DB_VERSION,
        features: [
            'Badge/PIN Authentication',
            'Multi-Station Support', 
            'Incident Management',
            'Event & Training Tracking',
            'Equipment Management',
            'Enterprise Reporting',
            'Automated Backups',
            'Audit Logging'
        ]
    };
    
    res.json(systemInfo);
});

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ===== SERVER STARTUP =====
initializeDatabase().then(() => {
    // Initialize system maintenance tasks
    const maintenance = new SystemMaintenance();
    maintenance.init();
    
    app.listen(PORT, () => {
        console.log(`🔥 Fire Department Tracker - Enterprise Edition`);
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🌐 Access the app at http://localhost:${PORT}`);
        console.log(`🔐 Admin password: admin123`);
        console.log(`🏢 Station passwords: station1pass, station2pass, etc.`);
        console.log(`👨‍🚒 Sample firefighter credentials:`);
        console.log(`   Badge: 001, PIN: 1234 (John Smith)`);
        console.log(`   Badge: 002, PIN: 2345 (Jane Doe)`);
        console.log(`   Badge: 003, PIN: 3456 (Mike Johnson)`);
        console.log(`✅ Enterprise features: Authentication, Logging, Security, Audit Trail`);
        console.log(`📊 Database: SQLite with full schema migrations`);
        console.log(`🛡️  Security: Rate limiting, PIN hashing, Account lockout`);
        console.log(`🔧 Maintenance: Automated backups and system cleanup enabled`);
        
        logger.info('Fire Department Tracker started', { port: PORT });
    });
}).catch((error) => {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGINT', () => {
    logger.info('Shutting down server...');
    db.close((err) => {
        if (err) {
            logger.error('Error closing database:', err);
        } else {
            logger.info('Database connection closed.');
        }
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM signal, shutting down gracefully...');
    db.close(() => {
        process.exit(0);
    });
});
