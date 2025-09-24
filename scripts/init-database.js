// scripts/init-database.js
// Database Initialization and Setup Script for Fire Department Tracker

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

class DatabaseInitializer {
    constructor() {
        this.dbPath = 'fire_tracker.db';
        this.db = null;
    }

    async initialize() {
        console.log('🔥 Fire Department Tracker - Database Initialization');
        console.log('====================================================');

        try {
            // Create logs directory if it doesn't exist
            if (!fs.existsSync('logs')) {
                fs.mkdirSync('logs');
                console.log('📁 Created logs directory');
            }

            // Initialize database connection
            this.db = new sqlite3.Database(this.dbPath);
            console.log('📊 Connected to SQLite database');

            // Run all initialization steps
            await this.createTables();
            await this.insertDefaultData();
            await this.createIndexes();
            await this.insertSampleData();
            
            console.log('✅ Database initialization completed successfully!');
            console.log('\n🔐 Default Credentials:');
            console.log('   Admin: admin123');
            console.log('   Station 1: station1pass');
            console.log('   Badge 001: PIN 1234 (John Smith)');
            console.log('   Badge 002: PIN 2345 (Jane Doe)');
            
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
            throw error;
        } finally {
            if (this.db) {
                this.db.close();
                console.log('🔒 Database connection closed');
            }
        }
    }

    createTables() {
        return new Promise((resolve, reject) => {
            console.log('📝 Creating database tables...');
            
            this.db.serialize(() => {
                // Database version table
                this.db.run(`CREATE TABLE IF NOT EXISTS db_version (
                    version INTEGER PRIMARY KEY
                )`);

                // Firefighters table with full enterprise features
                this.db.run(`CREATE TABLE IF NOT EXISTS firefighters (
                    badge TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT UNIQUE,
                    rank TEXT DEFAULT 'Firefighter',
                    station TEXT,
                    phone TEXT,
                    hire_date TEXT,
                    status TEXT DEFAULT 'active',
                    certifications TEXT, -- JSON array
                    vacation_days_total INTEGER DEFAULT 11,
                    vacation_days_used INTEGER DEFAULT 0,
                    pin_hash TEXT,
                    pin_reset_at TEXT,
                    pin_reset_by TEXT,
                    account_locked INTEGER DEFAULT 0,
                    failed_attempts INTEGER DEFAULT 0,
                    last_failed_attempt TEXT,
                    emergency_contact_name TEXT,
                    emergency_contact_phone TEXT,
                    medical_notes TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )`);

                // Incidents table
                this.db.run(`CREATE TABLE IF NOT EXISTS incidents (
                    id TEXT PRIMARY KEY,
                    location TEXT NOT NULL,
                    incident_type TEXT NOT NULL,
                    description TEXT,
                    priority TEXT DEFAULT 'Medium',
                    dispatch_time TEXT,
                    arrival_time TEXT,
                    time TEXT DEFAULT CURRENT_TIMESTAMP,
                    active INTEGER DEFAULT 1,
                    closed_reason TEXT,
                    closed_by_badge TEXT,
                    closed_by_station TEXT,
                    station_closures TEXT, -- JSON object for tracking station-by-station closures
                    weather_conditions TEXT,
                    temperature TEXT,
                    wind_conditions TEXT,
                    apparatus_dispatched TEXT, -- JSON array
                    mutual_aid_requested INTEGER DEFAULT 0,
                    mutual_aid_agencies TEXT, -- JSON array
                    property_damage_estimate REAL,
                    injuries INTEGER DEFAULT 0,
                    fatalities INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )`);

                // Attendees table for incident tracking
                this.db.run(`CREATE TABLE IF NOT EXISTS attendees (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    incident_id TEXT,
                    badge TEXT,
                    name TEXT,
                    station TEXT,
                    apparatus TEXT,
                    role TEXT, -- IC, Safety, etc.
                    check_in_time TEXT DEFAULT CURRENT_TIMESTAMP,
                    check_out_time TEXT,
                    flagged INTEGER DEFAULT 0,
                    flag_reason TEXT,
                    pay_code TEXT,
                    hours_worked REAL,
                    overtime_eligible INTEGER DEFAULT 0,
                    FOREIGN KEY (incident_id) REFERENCES incidents (id),
                    FOREIGN KEY (badge) REFERENCES firefighters (badge)
                )`);

                // Events table for training and activities
                this.db.run(`CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_name TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    activity_category TEXT,
                    location TEXT,
                    start_date TEXT NOT NULL,
                    end_date TEXT,
                    description TEXT,
                    instructor TEXT,
                    max_attendees INTEGER,
                    status TEXT DEFAULT 'pending',
                    created_by TEXT,
                    created_by_badge TEXT,
                    active INTEGER DEFAULT 1,
                    required_certifications TEXT, -- JSON array
                    cost_per_person REAL DEFAULT 0,
                    total_cost REAL DEFAULT 0,
                    approval_required INTEGER DEFAULT 0,
                    approved_by TEXT,
                    approved_at TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )`);

                // Event attendees table
                this.db.run(`CREATE TABLE IF NOT EXISTS event_attendees (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id INTEGER,
                    badge TEXT,
                    name TEXT,
                    station TEXT,
                    attendance_type TEXT, -- participant, instructor, observer
                    check_in_time TEXT DEFAULT CURRENT_TIMESTAMP,
                    check_out_time TEXT,
                    actual_start_time TEXT,
                    actual_end_time TEXT,
                    hours_worked REAL,
                    approved_hours REAL,
                    notes TEXT,
                    pay_code TEXT,
                    certification_earned TEXT,
                    performance_rating INTEGER, -- 1-5 scale
                    FOREIGN KEY (event_id) REFERENCES events (id),
                    FOREIGN KEY (badge) REFERENCES firefighters (badge)
                )`);

                // Stations table
                this.db.run(`CREATE TABLE IF NOT EXISTS stations (
                    name TEXT PRIMARY KEY,
                    address TEXT,
                    phone TEXT,
                    fax TEXT,
                    email TEXT,
                    chief_badge TEXT,
                    apparatus_count INTEGER DEFAULT 0,
                    active_personnel INTEGER DEFAULT 0,
                    coordinates_lat REAL,
                    coordinates_lng REAL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (chief_badge) REFERENCES firefighters (badge)
                )`);

                // Station accounts for authentication
                this.db.run(`CREATE TABLE IF NOT EXISTS station_accounts (
                    station_name TEXT PRIMARY KEY,
                    password TEXT NOT NULL,
                    last_login TEXT,
                    login_attempts INTEGER DEFAULT 0,
                    locked_until TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )`);

                // Equipment and apparatus tracking
                this.db.run(`CREATE TABLE IF NOT EXISTS apparatus (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    apparatus_name TEXT NOT NULL,
                    apparatus_type TEXT NOT NULL, -- Engine, Ladder, Rescue, etc.
                    station TEXT,
                    status TEXT DEFAULT 'in_service', -- in_service, out_of_service, maintenance
                    year INTEGER,
                    make TEXT,
                    model TEXT,
                    vin TEXT,
                    license_plate TEXT,
                    mileage INTEGER,
                    fuel_type TEXT,
                    pump_capacity INTEGER, -- GPM for engines
                    tank_capacity INTEGER, -- gallons
                    ladder_length INTEGER, -- feet for ladders
                    last_inspection TEXT,
                    next_inspection_due TEXT,
                    maintenance_notes TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (station) REFERENCES stations (name)
                )`);

                // Equipment maintenance logs
                this.db.run(`CREATE TABLE IF NOT EXISTS maintenance_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    apparatus_id INTEGER,
                    badge TEXT,
                    maintenance_type TEXT, -- daily_check, weekly_check, repair, etc.
                    description TEXT,
                    parts_used TEXT, -- JSON array
                    labor_hours REAL,
                    cost REAL,
                    completed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    next_due_date TEXT,
                    FOREIGN KEY (apparatus_id) REFERENCES apparatus (id),
                    FOREIGN KEY (badge) REFERENCES firefighters (badge)
                )`);

                // Activity categories
                this.db.run(`CREATE TABLE IF NOT EXISTS activity_categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category_name TEXT UNIQUE,
                    description TEXT,
                    requires_approval INTEGER DEFAULT 1,
                    default_hours REAL,
                    pay_multiplier REAL DEFAULT 1.0,
                    certification_type TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )`);

                // Authentication logs
                this.db.run(`CREATE TABLE IF NOT EXISTS auth_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    badge TEXT,
                    attempt_time TEXT DEFAULT CURRENT_TIMESTAMP,
                    success INTEGER,
                    ip_address TEXT,
                    user_agent TEXT,
                    failure_reason TEXT,
                    session_id TEXT
                )`);

                // PIN reset logs
                this.db.run(`CREATE TABLE IF NOT EXISTS pin_reset_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    badge TEXT,
                    reset_by TEXT,
                    reset_reason TEXT,
                    reset_time TEXT DEFAULT CURRENT_TIMESTAMP,
                    reset_type TEXT -- admin, self_service, expired
                )`);

                // System settings
                this.db.run(`CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    description TEXT,
                    category TEXT,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_by TEXT
                )`);

                // Audit log for enterprise compliance
                this.db.run(`CREATE TABLE IF NOT EXISTS audit_log (
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

                // Vacation/time off requests
                this.db.run(`CREATE TABLE IF NOT EXISTS vacation_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    badge TEXT,
                    start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL,
                    days_requested INTEGER NOT NULL,
                    hours_requested REAL,
                    vacation_type TEXT DEFAULT 'vacation', -- vacation, sick, personal, etc.
                    reason TEXT,
                    status TEXT DEFAULT 'pending', -- pending, approved, denied
                    submitted_date TEXT DEFAULT CURRENT_TIMESTAMP,
                    reviewed_date TEXT,
                    reviewed_by TEXT,
                    admin_notes TEXT,
                    FOREIGN KEY (badge) REFERENCES firefighters (badge)
                )`);

                // Payroll integration table
                this.db.run(`CREATE TABLE IF NOT EXISTS payroll_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    badge TEXT,
                    pay_period_start TEXT,
                    pay_period_end TEXT,
                    regular_hours REAL DEFAULT 0,
                    overtime_hours REAL DEFAULT 0,
                    holiday_hours REAL DEFAULT 0,
                    training_hours REAL DEFAULT 0,
                    incident_hours REAL DEFAULT 0,
                    total_hours REAL DEFAULT 0,
                    pay_codes TEXT, -- JSON object
                    processed INTEGER DEFAULT 0,
                    processed_at TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (badge) REFERENCES firefighters (badge)
                )`, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('✅ Database tables created successfully');
                        resolve();
                    }
                });
            });
        });
    }

    async insertDefaultData() {
        console.log('📝 Inserting default data...');

        // Set database version
        await this.runQuery("DELETE FROM db_version");
        await this.runQuery("INSERT INTO db_version (version) VALUES (?)", [3]);

        // Insert default stations
        const stations = [
            {
                name: 'Station 1',
                address: '123 Fire Station Rd, Downtown',
                phone: '555-0001',
                email: 'station1@firedept.gov'
            },
            {
                name: 'Station 2',
                address: '456 Emergency Ave, Westside',
                phone: '555-0002',
                email: 'station2@firedept.gov'
            },
            {
                name: 'Station 3',
                address: '789 Rescue Blvd, Eastside',
                phone: '555-0003',
                email: 'station3@firedept.gov'
            },
            {
                name: 'Station 4',
                address: '321 Safety St, Northside',
                phone: '555-0004',
                email: 'station4@firedept.gov'
            },
            {
                name: 'Station 5',
                address: '654 Hero Ln, Southside',
                phone: '555-0005',
                email: 'station5@firedept.gov'
            }
        ];

        for (const station of stations) {
            await this.runQuery(
                "INSERT OR IGNORE INTO stations (name, address, phone, email) VALUES (?, ?, ?, ?)",
                [station.name, station.address, station.phone, station.email]
            );
        }

        // Insert station accounts
        const stationAccounts = [
            { station: 'Station 1', password: 'station1pass' },
            { station: 'Station 2', password: 'station2pass' },
            { station: 'Station 3', password: 'station3pass' },
            { station: 'Station 4', password: 'station4pass' },
            { station: 'Station 5', password: 'station5pass' }
        ];

        for (const account of stationAccounts) {
            await this.runQuery(
                "INSERT OR IGNORE INTO station_accounts (station_name, password) VALUES (?, ?)",
                [account.station, account.password]
            );
        }

        // Insert default personnel
        const personnel = [
            {
                badge: '001',
                name: 'John Smith',
                email: 'john.smith@firedept.gov',
                rank: 'Captain',
                station: 'Station 1',
                phone: '555-1001',
                pin: '1234'
            },
            {
                badge: '002',
                name: 'Jane Doe',
                email: 'jane.doe@firedept.gov',
                rank: 'Lieutenant',
                station: 'Station 1',
                phone: '555-1002',
                pin: '2345'
            },
            {
                badge: '003',
                name: 'Mike Johnson',
                email: 'mike.johnson@firedept.gov',
                rank: 'Firefighter',
                station: 'Station 2',
                phone: '555-1003',
                pin: '3456'
            },
            {
                badge: '004',
                name: 'Sarah Williams',
                email: 'sarah.williams@firedept.gov',
                rank: 'Engineer',
                station: 'Station 2',
                phone: '555-1004',
                pin: '4567'
            },
            {
                badge: '005',
                name: 'Tom Brown',
                email: 'tom.brown@firedept.gov',
                rank: 'Firefighter',
                station: 'Station 3',
                phone: '555-1005',
                pin: '5678'
            }
        ];

        for (const person of personnel) {
            const pinHash = await bcrypt.hash(person.pin, 10);
            const certifications = JSON.stringify(['Basic Firefighter', 'CPR', 'First Aid']);
            
            await this.runQuery(`
                INSERT OR IGNORE INTO firefighters 
                (badge, name, email, rank, station, phone, pin_hash, certifications, hire_date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                person.badge, person.name, person.email, person.rank,
                person.station, person.phone, pinHash, certifications,
                new Date().toISOString()
            ]);
        }

        // Insert activity categories
        const categories = [
            {
                name: 'Fire Training',
                description: 'Fire suppression, ventilation, and rescue training',
                hours: 4.0,
                requires_approval: 1
            },
            {
                name: 'EMS Training',
                description: 'Emergency medical services and patient care training',
                hours: 4.0,
                requires_approval: 1
            },
            {
                name: 'Equipment Maintenance',
                description: 'Daily, weekly, and monthly equipment checks',
                hours: 2.0,
                requires_approval: 0
            },
            {
                name: 'Community Event',
                description: 'Public education, school visits, and community outreach',
                hours: 3.0,
                requires_approval: 0
            },
            {
                name: 'Physical Training',
                description: 'Physical fitness and conditioning activities',
                hours: 1.0,
                requires_approval: 0
            },
            {
                name: 'Administrative',
                description: 'Meetings, planning, and administrative duties',
                hours: 2.0,
                requires_approval: 0
            }
        ];

        for (const category of categories) {
            await this.runQuery(`
                INSERT OR IGNORE INTO activity_categories 
                (category_name, description, default_hours, requires_approval) 
                VALUES (?, ?, ?, ?)
            `, [category.name, category.description, category.hours, category.requires_approval]);
        }

        // Insert default apparatus
        const apparatus = [
            {
                name: 'Engine 1',
                type: 'Engine',
                station: 'Station 1',
                year: 2020,
                make: 'Pierce',
                pump_capacity: 1500,
                tank_capacity: 750
            },
            {
                name: 'Engine 2',
                type: 'Engine',
                station: 'Station 2',
                year: 2018,
                make: 'Seagrave',
                pump_capacity: 1500,
                tank_capacity: 750
            },
            {
                name: 'Ladder 1',
                type: 'Ladder',
                station: 'Station 1',
                year: 2019,
                make: 'Pierce',
                ladder_length: 100
            },
            {
                name: 'Rescue 1',
                type: 'Rescue',
                station: 'Station 3',
                year: 2021,
                make: 'Spartan',
                pump_capacity: 1000,
                tank_capacity: 300
            },
            {
                name: 'Medic 1',
                type: 'Ambulance',
                station: 'Station 2',
                year: 2022,
                make: 'Ford',
                model: 'Transit'
            }
        ];

        for (const unit of apparatus) {
            await this.runQuery(`
                INSERT OR IGNORE INTO apparatus 
                (apparatus_name, apparatus_type, station, year, make, model, pump_capacity, tank_capacity, ladder_length) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                unit.name, unit.type, unit.station, unit.year, unit.make,
                unit.model || null, unit.pump_capacity || null, unit.tank_capacity || null, unit.ladder_length || null
            ]);
        }

        // Insert system settings
        const settings = [
            {
                key: 'department_name',
                value: 'Elk River Fire Department',
                description: 'Official department name',
                category: 'general'
            },
            {
                key: 'max_failed_login_attempts',
                value: '5',
                description: 'Maximum failed login attempts before account lockout',
                category: 'security'
            },
            {
                key: 'account_lockout_duration',
                value: '30',
                description: 'Account lockout duration in minutes',
                category: 'security'
            },
            {
                key: 'session_timeout',
                value: '480',
                description: 'User session timeout in minutes',
                category: 'security'
            },
            {
                key: 'backup_retention_days',
                value: '90',
                description: 'Number of days to retain database backups',
                category: 'system'
            }
        ];

        for (const setting of settings) {
            await this.runQuery(`
                INSERT OR IGNORE INTO settings 
                (key, value, description, category) 
                VALUES (?, ?, ?, ?)
            `, [setting.key, setting.value, setting.description, setting.category]);
        }

        console.log('✅ Default data inserted successfully');
    }

    async createIndexes() {
        console.log('📝 Creating database indexes for performance...');

        const indexes = [
            "CREATE INDEX IF NOT EXISTS idx_incidents_active ON incidents(active)",
            "CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at)",
            "CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents(incident_type)",
            "CREATE INDEX IF NOT EXISTS idx_attendees_incident_id ON attendees(incident_id)",
            "CREATE INDEX IF NOT EXISTS idx_attendees_badge ON attendees(badge)",
            "CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)",
            "CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date)",
            "CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)",
            "CREATE INDEX IF NOT EXISTS idx_event_attendees_event_id ON event_attendees(event_id)",
            "CREATE INDEX IF NOT EXISTS idx_event_attendees_badge ON event_attendees(badge)",
            "CREATE INDEX IF NOT EXISTS idx_firefighters_station ON firefighters(station)",
            "CREATE INDEX IF NOT EXISTS idx_firefighters_status ON firefighters(status)",
            "CREATE INDEX IF NOT EXISTS idx_auth_logs_badge ON auth_logs(badge)",
            "CREATE INDEX IF NOT EXISTS idx_auth_logs_attempt_time ON auth_logs(attempt_time)",
            "CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)",
            "CREATE INDEX IF NOT EXISTS idx_audit_log_user_badge ON audit_log(user_badge)"
        ];

        for (const indexSQL of indexes) {
            await this.runQuery(indexSQL);
        }

        console.log('✅ Database indexes created successfully');
    }

    async insertSampleData() {
        console.log('📝 Inserting sample incidents and events for testing...');

        // Sample incidents
        const sampleIncidents = [
            {
                id: 'INC-' + Date.now() + '-001',
                location: '123 Main Street',
                type: 'Structure Fire',
                description: 'Residential house fire, single family dwelling',
                priority: 'High'
            },
            {
                id: 'INC-' + Date.now() + '-002',
                location: '456 Oak Avenue',
                type: 'Medical Emergency',
                description: 'Chest pain, 65 year old male',
                priority: 'High'
            },
            {
                id: 'INC-' + Date.now() + '-003',
                location: 'Highway 10 & Elm Street',
                type: 'Vehicle Accident',
                description: 'Two vehicle collision, minor injuries',
                priority: 'Medium'
            }
        ];

        for (const incident of sampleIncidents) {
            await this.runQuery(`
                INSERT OR IGNORE INTO incidents 
                (id, location, incident_type, description, priority, active) 
                VALUES (?, ?, ?, ?, ?, ?)
            `, [incident.id, incident.location, incident.type, incident.description, incident.priority, 0]);
        }

        // Sample events
        const sampleEvents = [
            {
                name: 'Monthly Fire Training',
                type: 'training',
                category: 'Fire Training',
                start_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Next week
                description: 'Monthly fire suppression and ventilation training',
                instructor: 'Captain John Smith',
                max_attendees: 20
            },
            {
                name: 'CPR Recertification',
                type: 'training',
                category: 'EMS Training',
                start_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // Two weeks
                description: 'Annual CPR and AED recertification',
                instructor: 'Lieutenant Jane Doe',
                max_attendees: 15
            },
            {
                name: 'Equipment Check',
                type: 'maintenance',
                category: 'Equipment Maintenance',
                start_date: new Date().toISOString(), // Today
                description: 'Weekly apparatus and equipment inspection',
                max_attendees: 5
            }
        ];

        for (const event of sampleEvents) {
            await this.runQuery(`
                INSERT OR IGNORE INTO events 
                (event_name, event_type, activity_category, start_date, description, instructor, max_attendees, created_by_badge) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                event.name, event.type, event.category, event.start_date,
                event.description, event.instructor, event.max_attendees, '001'
            ]);
        }

        console.log('✅ Sample data inserted successfully');
    }

    runQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this);
                }
            });
        });
    }
}

// Run initialization if called directly
if (require.main === module) {
    const initializer = new DatabaseInitializer();
    initializer.initialize()
        .then(() => {
            console.log('\n🎉 Database initialization completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Initialization failed:', error);
            process.exit(1);
        });
}

module.exports = DatabaseInitializer;
