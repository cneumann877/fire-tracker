// tests/setup.js
// Test Setup and Configuration

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Global test setup
beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_PATH = 'fire_tracker_test.db';
    
    // Clean up any existing test database
    const testDbPath = 'fire_tracker_test.db';
    if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
    }
    
    // Initialize test database
    const DatabaseInitializer = require('../scripts/init-database');
    const initializer = new DatabaseInitializer();
    initializer.dbPath = testDbPath;
    await initializer.initialize();
});

afterAll(async () => {
    // Clean up test database
    const testDbPath = 'fire_tracker_test.db';
    if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
    }
});

// Helper functions for tests
global.testHelpers = {
    createTestFirefighter: (overrides = {}) => ({
        badge: '999',
        name: 'Test Firefighter',
        email: 'test@firedept.gov',
        rank: 'Firefighter',
        station: 'Station 1',
        pin: '9999',
        ...overrides
    }),

    createTestIncident: (overrides = {}) => ({
        id: 'TEST-' + Date.now(),
        location: '123 Test Street',
        incident_type: 'Test Fire',
        description: 'Test incident for automated testing',
        priority: 'Medium',
        ...overrides
    }),

    createTestEvent: (overrides = {}) => ({
        event_name: 'Test Training Event',
        event_type: 'training',
        start_date: new Date().toISOString(),
        description: 'Test event for automated testing',
        created_by_badge: '001',
        ...overrides
    })
};

// ==========================================
// tests/api.test.js
// API Integration Tests
// ==========================================

const request = require('supertest');
const app = require('../server');

describe('API Authentication', () => {
    test('POST /api/firefighters/authenticate - valid credentials', async () => {
        const response = await request(app)
            .post('/api/firefighters/authenticate')
            .send({
                badge: '001',
                pin: '1234'
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.firefighter).toBeDefined();
        expect(response.body.firefighter.name).toBe('John Smith');
    });

    test('POST /api/firefighters/authenticate - invalid PIN', async () => {
        const response = await request(app)
            .post('/api/firefighters/authenticate')
            .send({
                badge: '001',
                pin: 'wrong'
            });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Invalid PIN');
    });

    test('POST /api/firefighters/authenticate - non-existent badge', async () => {
        const response = await request(app)
            .post('/api/firefighters/authenticate')
            .send({
                badge: '999',
                pin: '1234'
            });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Invalid badge number');
    });

    test('POST /api/firefighters/authenticate - rate limiting', async () => {
        const promises = [];
        
        // Make 6 rapid requests (rate limit is 5)
        for (let i = 0; i < 6; i++) {
            promises.push(
                request(app)
                    .post('/api/firefighters/authenticate')
                    .send({ badge: '001', pin: 'wrong' })
            );
        }

        const responses = await Promise.all(promises);
        const rateLimited = responses.some(r => r.status === 429);
        expect(rateLimited).toBe(true);
    });
});

describe('Firefighter Management', () => {
    test('GET /api/firefighters - list all firefighters', async () => {
        const response = await request(app).get('/api/firefighters');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);
        expect(response.body[0]).toHaveProperty('badge');
        expect(response.body[0]).toHaveProperty('name');
    });

    test('POST /api/firefighters - create new firefighter', async () => {
        const firefighter = testHelpers.createTestFirefighter();

        const response = await request(app)
            .post('/api/firefighters')
            .send(firefighter);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.badge).toBe(firefighter.badge);
    });

    test('POST /api/firefighters - duplicate badge error', async () => {
        const firefighter = testHelpers.createTestFirefighter({ badge: '001' });

        const response = await request(app)
            .post('/api/firefighters')
            .send(firefighter);

        expect(response.status).toBe(409);
        expect(response.body.error).toBe('Badge number already exists');
    });
});

describe('Incident Management', () => {
    test('GET /api/incidents - list incidents', async () => {
        const response = await request(app).get('/api/incidents');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });

    test('POST /api/incidents - create incident', async () => {
        const incident = testHelpers.createTestIncident();

        const response = await request(app)
            .post('/api/incidents')
            .send(incident);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
    });

    test('POST /api/incidents/:id/attendees - add attendee', async () => {
        const incident = testHelpers.createTestIncident();
        
        // Create incident first
        await request(app).post('/api/incidents').send(incident);

        const response = await request(app)
            .post(`/api/incidents/${incident.id}/attendees`)
            .send({
                badge: '001',
                station: 'Station 1'
            });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
    });
});

describe('Event Management', () => {
    test('GET /api/events - list events', async () => {
        const response = await request(app).get('/api/events');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });

    test('POST /api/events - create event', async () => {
        const event = testHelpers.createTestEvent();

        const response = await request(app)
            .post('/api/events')
            .send(event);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
    });
});

describe('Health and System', () => {
    test('GET /api/health - health check', async () => {
        const response = await request(app).get('/api/health');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('healthy');
        expect(response.body.database).toBe('connected');
    });

    test('GET /api/system/info - system information', async () => {
        const response = await request(app).get('/api/system/info');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('version');
        expect(response.body).toHaveProperty('features');
        expect(Array.isArray(response.body.features)).toBe(true);
    });
});

// ==========================================
// tests/database.test.js
// Database Integration Tests
// ==========================================

const sqlite3 = require('sqlite3').verbose();

describe('Database Operations', () => {
    let db;

    beforeEach(() => {
        db = new sqlite3.Database('fire_tracker_test.db');
    });

    afterEach(() => {
        if (db) {
            db.close();
        }
    });

    test('Database connection', (done) => {
        db.get("SELECT 1 as result", (err, row) => {
            expect(err).toBeNull();
            expect(row.result).toBe(1);
            done();
        });
    });

    test('Firefighters table exists', (done) => {
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='firefighters'", (err, row) => {
            expect(err).toBeNull();
            expect(row).toBeDefined();
            expect(row.name).toBe('firefighters');
            done();
        });
    });

    test('Insert and retrieve firefighter', (done) => {
        const firefighter = testHelpers.createTestFirefighter();

        db.run(`INSERT INTO firefighters (badge, name, email, rank, station) 
                VALUES (?, ?, ?, ?, ?)`,
               [firefighter.badge, firefighter.name, firefighter.email, 
                firefighter.rank, firefighter.station], 
               function(err) {
            expect(err).toBeNull();

            db.get("SELECT * FROM firefighters WHERE badge = ?", 
                   [firefighter.badge], 
                   (err, row) => {
                expect(err).toBeNull();
                expect(row).toBeDefined();
                expect(row.name).toBe(firefighter.name);
                done();
            });
        });
    });

    test('Foreign key constraints work', (done) => {
        const incident = testHelpers.createTestIncident();

        // First create incident
        db.run(`INSERT INTO incidents (id, location, incident_type) 
                VALUES (?, ?, ?)`,
               [incident.id, incident.location, incident.incident_type], 
               function(err) {
            expect(err).toBeNull();

            // Then try to add attendee with non-existent badge
            db.run(`INSERT INTO attendees (incident_id, badge, name) 
                    VALUES (?, ?, ?)`,
                   [incident.id, 'NONEXISTENT', 'Test Name'], 
                   function(err) {
                // This should fail due to foreign key constraint
                expect(err).not.toBeNull();
                done();
            });
        });
    });
});

// ==========================================
// tests/authentication.test.js
// Authentication System Tests
// ==========================================

const bcrypt = require('bcrypt');

describe('Authentication System', () => {
    test('PIN hashing and verification', async () => {
        const pin = '1234';
        const hash = await bcrypt.hash(pin, 10);
        
        expect(hash).toBeDefined();
        expect(hash).not.toBe(pin);
        
        const isValid = await bcrypt.compare(pin, hash);
        expect(isValid).toBe(true);
        
        const isInvalid = await bcrypt.compare('wrong', hash);
        expect(isInvalid).toBe(false);
    });

    test('Account lockout after failed attempts', async () => {
        const badge = 'TEST999';
        
        // Create test firefighter
        const db = new sqlite3.Database('fire_tracker_test.db');
        const hashedPin = await bcrypt.hash('1234', 10);
        
        await new Promise((resolve) => {
            db.run(`INSERT INTO firefighters (badge, name, pin_hash, failed_attempts) 
                    VALUES (?, ?, ?, ?)`,
                   [badge, 'Test User', hashedPin, 4], // 4 failed attempts already
                   () => resolve());
        });

        // One more failed attempt should lock the account
        const response = await request(app)
            .post('/api/firefighters/authenticate')
            .send({
                badge: badge,
                pin: 'wrong'
            });

        expect(response.status).toBe(423);
        expect(response.body.error).toContain('locked');

        db.close();
    });
});

// ==========================================
// tests/performance.test.js
// Performance Tests
// ==========================================

describe('Performance Tests', () => {
    test('API response times', async () => {
        const start = Date.now();
        
        const response = await request(app).get('/api/firefighters');
        
        const responseTime = Date.now() - start;
        
        expect(response.status).toBe(200);
        expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });

    test('Concurrent authentication requests', async () => {
        const concurrentRequests = 10;
        const promises = [];

        for (let i = 0; i < concurrentRequests; i++) {
            promises.push(
                request(app)
                    .post('/api/firefighters/authenticate')
                    .send({
                        badge: '001',
                        pin: '1234'
                    })
            );
        }

        const start = Date.now();
        const responses = await Promise.all(promises);
        const totalTime = Date.now() - start;

        // All should succeed
        responses.forEach(response => {
            expect(response.status).toBe(200);
        });

        // Average response time should be reasonable
        const averageTime = totalTime / concurrentRequests;
        expect(averageTime).toBeLessThan(500);
    });
});

// ==========================================
// tests/integration.test.js
// End-to-End Integration Tests
// ==========================================

describe('End-to-End Workflows', () => {
    test('Complete incident workflow', async () => {
        // 1. Create incident
        const incident = testHelpers.createTestIncident();
        let response = await request(app)
            .post('/api/incidents')
            .send(incident);
        
        expect(response.status).toBe(201);

        // 2. Sign firefighter into incident
        response = await request(app)
            .post(`/api/incidents/${incident.id}/attendees`)
            .send({
                badge: '001',
                station: 'Station 1'
            });
        
        expect(response.status).toBe(201);

        // 3. Verify incident has attendee
        response = await request(app)
            .get('/api/incidents');
        
        const createdIncident = response.body.find(i => i.id === incident.id);
        expect(createdIncident).toBeDefined();
        expect(createdIncident.attendee_count).toBe(1);
    });

    test('Complete event workflow', async () => {
        // 1. Create event
        const event = testHelpers.createTestEvent();
        let response = await request(app)
            .post('/api/events')
            .send(event);
        
        expect(response.status).toBe(201);
        const eventId = response.body.id;

        // 2. Sign firefighter into event
        response = await request(app)
            .post(`/api/events/${eventId}/attendees`)
            .send({
                badge: '001',
                station: 'Station 1',
                attendance_type: 'participant'
            });
        
        expect(response.status).toBe(201);

        // 3. Verify event has attendee
        response = await request(app)
            .get('/api/events');
        
        const createdEvent = response.body.find(e => e.id === eventId);
        expect(createdEvent).toBeDefined();
        expect(createdEvent.attendee_count).toBe(1);
    });
});

// ==========================================
// Jest Configuration
// ==========================================

// jest.config.js
module.exports = {
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    collectCoverageFrom: [
        'server.js',
        'scripts/**/*.js',
        '!scripts/init-database.js', // Exclude initialization scripts
        '!scripts/system-maintenance.js'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: [
        'text',
        'lcov',
        'html'
    ],
    testTimeout: 30000,
    verbose: true,
    testMatch: [
        '<rootDir>/tests/**/*.test.js'
    ]
};

// ==========================================
// Test Runner Script
// ==========================================

// scripts/run-tests.js
const { spawn } = require('child_process');
const path = require('path');

class TestRunner {
    constructor() {
        this.testTypes = {
            unit: 'tests/unit',
            integration: 'tests/integration', 
            api: 'tests/api.test.js',
            database: 'tests/database.test.js',
            performance: 'tests/performance.test.js',
            all: 'tests'
        };
    }

    async runTests(type = 'all', options = {}) {
        const testPath = this.testTypes[type] || this.testTypes.all;
        
        const args = [
            'test',
            testPath,
            '--verbose'
        ];

        if (options.coverage) {
            args.push('--coverage');
        }

        if (options.watch) {
            args.push('--watch');
        }

        if (options.bail) {
            args.push('--bail');
        }

        return new Promise((resolve, reject) => {
            const jest = spawn('npx', ['jest', ...args], {
                stdio: 'inherit',
                cwd: process.cwd()
            });

            jest.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Tests failed with exit code ${code}`));
                }
            });
        });
    }
}

if (require.main === module) {
    const runner = new TestRunner();
    const type = process.argv[2] || 'all';
    const options = {
        coverage: process.argv.includes('--coverage'),
        watch: process.argv.includes('--watch'),
        bail: process.argv.includes('--bail')
    };

    console.log(`🧪 Running ${type} tests...`);
    
    runner.runTests(type, options)
        .then(() => {
            console.log('✅ All tests passed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Tests failed:', error.message);
            process.exit(1);
        });
}

module.exports = TestRunner;
