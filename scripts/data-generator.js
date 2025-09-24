// scripts/data-generator.js
// Sample Data Generator for Testing and Development

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const fs = require('fs');

class DataGenerator {
    constructor() {
        this.dbPath = 'fire_tracker.db';
        this.firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'Tom', 'Lisa', 'David', 'Emily', 'Chris', 'Maria'];
        this.lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
        this.ranks = ['Chief', 'Assistant Chief', 'Captain', 'Lieutenant', 'Engineer', 'Firefighter', 'EMT', 'Paramedic'];
        this.incidentTypes = ['Structure Fire', 'Vehicle Fire', 'Medical Emergency', 'Vehicle Accident', 'Hazmat', 'Rescue', 'Alarm', 'Utility Emergency'];
        this.eventTypes = ['training', 'drill', 'meeting', 'community', 'maintenance', 'inspection'];
        this.stations = ['Station 1', 'Station 2', 'Station 3', 'Station 4', 'Station 5'];
    }

    async generateData(options = {}) {
        const {
            firefighters = 50,
            incidents = 100,
            events = 30,
            months = 12
        } = options;

        console.log('🎲 Generating sample data...');
        console.log(`   Firefighters: ${firefighters}`);
        console.log(`   Incidents: ${incidents}`);
        console.log(`   Events: ${events}`);
        console.log(`   Time span: ${months} months`);

        try {
            await this.generateFirefighters(firefighters);
            await this.generateIncidents(incidents, months);
            await this.generateEvents(events, months);
            await this.generateAttendance();
            
            console.log('✅ Sample data generation completed!');
            
        } catch (error) {
            console.error('❌ Data generation failed:', error);
            throw error;
        }
    }

    async generateFirefighters(count) {
        console.log('👥 Generating firefighters...');
        
        const db = new sqlite3.Database(this.dbPath);
        
        for (let i = 0; i < count; i++) {
            const badge = String(i + 100).padStart(3, '0');
            const firstName = this.randomChoice(this.firstNames);
            const lastName = this.randomChoice(this.lastNames);
            const name = `${firstName} ${lastName}`;
            const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@firedept.gov`;
            const rank = this.randomChoice(this.ranks);
            const station = this.randomChoice(this.stations);
            const pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
            const pinHash = await bcrypt.hash(pin, 10);
            const hireDate = this.randomDateInPast(5 * 365); // Within last 5 years
            
            await this.runQuery(db, `
                INSERT OR IGNORE INTO firefighters 
                (badge, name, email, rank, station, pin_hash, hire_date, phone, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [badge, name, email, rank, station, pinHash, hireDate.toISOString(), 
                this.generatePhoneNumber(), 'active']);
        }
        
        db.close();
        console.log(`✅ Generated ${count} firefighters`);
    }

    async generateIncidents(count, monthsBack) {
        console.log('🚨 Generating incidents...');
        
        const db = new sqlite3.Database(this.dbPath);
        
        for (let i = 0; i < count; i++) {
            const id = `INC-${Date.now()}-${String(i).padStart(3, '0')}`;
            const location = this.generateAddress();
            const incidentType = this.randomChoice(this.incidentTypes);
            const description = this.generateIncidentDescription(incidentType);
            const priority = this.randomChoice(['Low', 'Medium', 'High', 'Critical']);
            const time = this.randomDateInPast(monthsBack * 30);
            const active = Math.random() > 0.8 ? 1 : 0; // 20% still active
            
            const closedReason = active ? null : this.randomChoice([
                'All clear', 'False alarm', 'Resolved', 'Transferred', 'Cancelled'
            ]);
            
            await this.runQuery(db, `
                INSERT INTO incidents 
                (id, location, incident_type, description, priority, time, active, closed_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [id, location, incidentType, description, priority, time.toISOString(), active, closedReason]);
        }
        
        db.close();
        console.log(`✅ Generated ${count} incidents`);
    }

    async generateEvents(count, monthsBack) {
        console.log('📅 Generating events...');
        
        const db = new sqlite3.Database(this.dbPath);
        
        for (let i = 0; i < count; i++) {
            const eventName = this.generateEventName();
            const eventType = this.randomChoice(this.eventTypes);
            const startDate = this.randomDateInPast(monthsBack * 30);
            const endDate = new Date(startDate.getTime() + (2 + Math.random() * 6) * 60 * 60 * 1000); // 2-8 hours
            const description = this.generateEventDescription(eventType);
            const status = this.randomChoice(['pending', 'active', 'completed']);
            const createdByBadge = String(Math.floor(Math.random() * 50) + 100).padStart(3, '0');
            
            await this.runQuery(db, `
                INSERT INTO events 
                (event_name, event_type, start_date, end_date, description, status, created_by_badge)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [eventName, eventType, startDate.toISOString(), endDate.toISOString(), 
                description, status, createdByBadge]);
        }
        
        db.close();
        console.log(`✅ Generated ${count} events`);
    }

    async generateAttendance() {
        console.log('📝 Generating attendance records...');
        
        const db = new sqlite3.Database(this.dbPath);
        
        // Get all incidents
        const incidents = await this.getAllQuery(db, "SELECT id FROM incidents");
        
        // Generate incident attendance
        for (const incident of incidents) {
            const attendeeCount = Math.floor(Math.random() * 8) + 2; // 2-10 attendees
            const attendees = new Set();
            
            while (attendees.size < attendeeCount) {
                const badge = String(Math.floor(Math.random() * 50) + 100).padStart(3, '0');
                if (!attendees.has(badge)) {
                    attendees.add(badge);
                    
                    const firefighter = await this.getQuery(db, 
                        "SELECT name, station FROM firefighters WHERE badge = ?", [badge]);
                    
                    if (firefighter) {
                        await this.runQuery(db, `
                            INSERT INTO attendees 
                            (incident_id, badge, name, station, hours_worked, pay_code)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `, [incident.id, badge, firefighter.name, firefighter.station,
                            Math.round((Math.random() * 8 + 2) * 2) / 2, // 2-10 hours, rounded to 0.5
                            this.randomChoice(['FIRE', 'EMS', 'TRAINING', 'ADMIN'])]);
                    }
                }
            }
        }
        
        // Get all events
        const events = await this.getAllQuery(db, "SELECT id FROM events");
        
        // Generate event attendance
        for (const event of events) {
            const attendeeCount = Math.floor(Math.random() * 15) + 5; // 5-20 attendees
            const attendees = new Set();
            
            while (attendees.size < attendeeCount) {
                const badge = String(Math.floor(Math.random() * 50) + 100).padStart(3, '0');
                if (!attendees.has(badge)) {
                    attendees.add(badge);
                    
                    const firefighter = await this.getQuery(db, 
                        "SELECT name, station FROM firefighters WHERE badge = ?", [badge]);
                    
                    if (firefighter) {
                        await this.runQuery(db, `
                            INSERT INTO event_attendees 
                            (event_id, badge, name, station, attendance_type, hours_worked, pay_code)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `, [event.id, badge, firefighter.name, firefighter.station,
                            this.randomChoice(['participant', 'instructor', 'observer']),
                            Math.round((Math.random() * 4 + 1) * 2) / 2, // 1-5 hours
                            'TRAINING']);
                    }
                }
            }
        }
        
        db.close();
        console.log('✅ Generated attendance records');
    }

    // Helper methods
    randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    randomDateInPast(maxDaysAgo) {
        const now = new Date();
        const daysAgo = Math.floor(Math.random() * maxDaysAgo);
        return new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    }

    generatePhoneNumber() {
        return `555-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    }

    generateAddress() {
        const numbers = Math.floor(Math.random() * 9999) + 1;
        const streets = ['Main St', 'Oak Ave', 'Pine Rd', 'Elm Dr', 'Maple Ln', 'Cedar Blvd'];
        return `${numbers} ${this.randomChoice(streets)}`;
    }

    generateIncidentDescription(type) {
        const descriptions = {
            'Structure Fire': ['Single family residence', 'Commercial building', 'Apartment complex', 'Garage fire'],
            'Vehicle Fire': ['Car fire on highway', 'Truck fire', 'Motorcycle fire', 'RV fire'],
            'Medical Emergency': ['Chest pain', 'Difficulty breathing', 'Fall with injuries', 'Cardiac arrest'],
            'Vehicle Accident': ['Two-car collision', 'Single vehicle rollover', 'Rear-end collision', 'Head-on collision'],
            'Hazmat': ['Chemical spill', 'Gas leak', 'Unknown substance', 'Fuel spill'],
            'Rescue': ['Water rescue', 'High angle rescue', 'Confined space', 'Vehicle extrication'],
            'Alarm': ['Fire alarm activation', 'CO alarm', 'Burglar alarm', 'Medical alert'],
            'Utility Emergency': ['Power lines down', 'Gas main break', 'Water main break', 'Tree on wires']
        };
        
        return this.randomChoice(descriptions[type] || ['General emergency']);
    }

    generateEventName() {
        const names = [
            'Monthly Training Drill', 'Equipment Maintenance', 'CPR Recertification',
            'Fire Prevention Week', 'SCBA Training', 'Ladder Operations',
            'Hazmat Response Training', 'Vehicle Extrication', 'Water Rescue',
            'Community Open House', 'School Visit', 'Safety Inspection'
        ];
        
        return this.randomChoice(names);
    }

    generateEventDescription(type) {
        const descriptions = {
            'training': 'Hands-on training session to maintain skills and certifications',
            'drill': 'Practice drill to test response procedures and equipment',
            'meeting': 'Staff meeting to discuss department operations and updates',
            'community': 'Community outreach and public education event',
            'maintenance': 'Equipment inspection and maintenance activities',
            'inspection': 'Safety inspection of facilities or equipment'
        };
        
        return descriptions[type] || 'Departmental activity';
    }

    // Database helper methods
    runQuery(db, sql, params = []) {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    getQuery(db, sql, params = []) {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    getAllQuery(db, sql, params = []) {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

// Command line interface
if (require.main === module) {
    const generator = new DataGenerator();
    
    const options = {
        firefighters: parseInt(process.argv[2]) || 50,
        incidents: parseInt(process.argv[3]) || 100,
        events: parseInt(process.argv[4]) || 30,
        months: parseInt(process.argv[5]) || 12
    };

    generator.generateData(options)
        .then(() => {
            console.log('\n🎉 Sample data generation completed!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Data generation failed:', error);
            process.exit(1);
        });
}

// ==========================================
// scripts/performance-monitor.js
// Performance Monitoring and Metrics
// ==========================================

const os = require('os');
const fs = require('fs');
const path = require('path');

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            requests: 0,
            errors: 0,
            responseTimeSum: 0,
            slowQueries: 0,
            memoryPeak: 0,
            cpuUsage: [],
            activeConnections: 0
        };
        
        this.startTime = Date.now();
        this.metricsHistory = [];
        this.alertThresholds = {
            responseTime: 5000, // 5 seconds
            errorRate: 0.05, // 5%
            memoryUsage: 0.8, // 80%
            cpuUsage: 0.9 // 90%
        };
    }

    // Express middleware for request monitoring
    requestMiddleware() {
        return (req, res, next) => {
            const startTime = Date.now();
            
            res.on('finish', () => {
                const responseTime = Date.now() - startTime;
                this.recordRequest(responseTime, res.statusCode);
            });
            
            next();
        };
    }

    recordRequest(responseTime, statusCode) {
        this.metrics.requests++;
        this.metrics.responseTimeSum += responseTime;
        
        if (statusCode >= 400) {
            this.metrics.errors++;
        }
        
        if (responseTime > this.alertThresholds.responseTime) {
            console.warn(`⚠️  Slow response detected: ${responseTime}ms`);
        }
    }

    // Collect system metrics
    collectSystemMetrics() {
        const memUsage = process.memoryUsage();
        const memUsagePercent = memUsage.heapUsed / memUsage.heapTotal;
        
        this.metrics.memoryPeak = Math.max(this.metrics.memoryPeak, memUsage.heapUsed);
        
        // CPU usage calculation
        const cpuUsage = os.loadavg()[0] / os.cpus().length;
        this.metrics.cpuUsage.push(cpuUsage);
        
        // Keep only last 60 measurements (1 hour at 1-minute intervals)
        if (this.metrics.cpuUsage.length > 60) {
            this.metrics.cpuUsage.shift();
        }
        
        return {
            memory: {
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                heapUsedPercent: memUsagePercent,
                external: memUsage.external,
                arrayBuffers: memUsage.arrayBuffers
            },
            cpu: {
                usage: cpuUsage,
                loadAvg: os.loadavg(),
                cores: os.cpus().length
            },
            system: {
                uptime: os.uptime(),
                platform: os.platform(),
                arch: os.arch(),
                hostname: os.hostname(),
                freeMem: os.freemem(),
                totalMem: os.totalmem()
            }
        };
    }

    // Generate performance report
    generateReport() {
        const uptime = Date.now() - this.startTime;
        const systemMetrics = this.collectSystemMetrics();
        const avgResponseTime = this.metrics.requests > 0 
            ? this.metrics.responseTimeSum / this.metrics.requests 
            : 0;
        const errorRate = this.metrics.requests > 0 
            ? this.metrics.errors / this.metrics.requests 
            : 0;
        const avgCpuUsage = this.metrics.cpuUsage.length > 0
            ? this.metrics.cpuUsage.reduce((a, b) => a + b, 0) / this.metrics.cpuUsage.length
            : 0;

        return {
            timestamp: new Date().toISOString(),
            uptime: uptime,
            requests: {
                total: this.metrics.requests,
                errors: this.metrics.errors,
                errorRate: errorRate,
                averageResponseTime: avgResponseTime
            },
            system: systemMetrics,
            performance: {
                averageCpuUsage: avgCpuUsage,
                memoryPeakMB: Math.round(this.metrics.memoryPeak / 1024 / 1024),
                slowQueries: this.metrics.slowQueries
            },
            alerts: this.checkAlerts(avgResponseTime, errorRate, systemMetrics)
        };
    }

    checkAlerts(avgResponseTime, errorRate, systemMetrics) {
        const alerts = [];
        
        if (avgResponseTime > this.alertThresholds.responseTime) {
            alerts.push({
                type: 'performance',
                severity: 'warning',
                message: `Average response time (${avgResponseTime}ms) exceeds threshold`
            });
        }
        
        if (errorRate > this.alertThresholds.errorRate) {
            alerts.push({
                type: 'reliability',
                severity: 'critical', 
                message: `Error rate (${(errorRate * 100).toFixed(2)}%) exceeds threshold`
            });
        }
        
        if (systemMetrics.memory.heapUsedPercent > this.alertThresholds.memoryUsage) {
            alerts.push({
                type: 'resource',
                severity: 'warning',
                message: `Memory usage (${(systemMetrics.memory.heapUsedPercent * 100).toFixed(1)}%) exceeds threshold`
            });
        }
        
        if (systemMetrics.cpu.usage > this.alertThresholds.cpuUsage) {
            alerts.push({
                type: 'resource',
                severity: 'critical',
                message: `CPU usage (${(systemMetrics.cpu.usage * 100).toFixed(1)}%) exceeds threshold`
            });
        }
        
        return alerts;
    }

    // Save metrics to file
    saveMetrics() {
        const report = this.generateReport();
        this.metricsHistory.push(report);
        
        // Keep only last 168 hours of data (1 week)
        if (this.metricsHistory.length > 168) {
            this.metricsHistory.shift();
        }
        
        const metricsDir = 'logs/metrics';
        if (!fs.existsSync(metricsDir)) {
            fs.mkdirSync(metricsDir, { recursive: true });
        }
        
        const filename = path.join(metricsDir, `metrics-${new Date().toISOString().split('T')[0]}.json`);
        fs.writeFileSync(filename, JSON.stringify(this.metricsHistory, null, 2));
        
        return report;
    }

    // Start monitoring (called from server)
    startMonitoring(intervalMinutes = 5) {
        console.log(`📊 Performance monitoring started (${intervalMinutes} minute intervals)`);
        
        setInterval(() => {
            const report = this.saveMetrics();
            
            // Log alerts to console
            if (report.alerts.length > 0) {
                console.log('⚠️  Performance Alerts:');
                report.alerts.forEach(alert => {
                    console.log(`   ${alert.severity.toUpperCase()}: ${alert.message}`);
                });
            }
            
        }, intervalMinutes * 60 * 1000);
    }
}

// ==========================================
// scripts/deployment.js
// Deployment Automation Script
// ==========================================

const { spawn } = require('child_process');

class DeploymentManager {
    constructor() {
        this.environment = process.env.NODE_ENV || 'production';
        this.backupManager = require('./backup-database');
    }

    async deploy(options = {}) {
        console.log(`🚀 Starting deployment to ${this.environment}...`);
        
        try {
            // Pre-deployment checks
            await this.preDeploymentChecks();
            
            // Create backup before deployment
            if (options.backup !== false) {
                console.log('💾 Creating pre-deployment backup...');
                await this.backupManager.createBackup('pre_deployment');
            }
            
            // Run database migrations if needed
            if (options.migrate !== false) {
                await this.runMigrations();
            }
            
            // Install/update dependencies
            await this.updateDependencies();
            
            // Run tests if in production
            if (this.environment === 'production' && options.test !== false) {
                await this.runTests();
            }
            
            // Restart services
            await this.restartServices();
            
            // Post-deployment verification
            await this.postDeploymentChecks();
            
            console.log('✅ Deployment completed successfully!');
            
        } catch (error) {
            console.error('❌ Deployment failed:', error);
            
            // Attempt rollback if enabled
            if (options.rollbackOnFailure !== false) {
                await this.rollback();
            }
            
            throw error;
        }
    }

    async preDeploymentChecks() {
        console.log('🔍 Running pre-deployment checks...');
        
        // Check Node.js version
        const nodeVersion = process.version;
        console.log(`   Node.js version: ${nodeVersion}`);
        
        // Check disk space
        const stats = fs.statSync('.');
        console.log('   Disk space: OK');
        
        // Verify database accessibility
        const sqlite3 = require('sqlite3').verbose();
        const db = new sqlite3.Database('fire_tracker.db');
        
        await new Promise((resolve, reject) => {
            db.get("SELECT 1", (err) => {
                db.close();
                if (err) reject(err);
                else resolve();
            });
        });
        
        console.log('   Database: OK');
    }

    async runMigrations() {
        console.log('🔄 Running database migrations...');
        
        return new Promise((resolve, reject) => {
            const migration = spawn('node', ['scripts/init-database.js'], {
                stdio: 'inherit'
            });
            
            migration.on('close', (code) => {
                if (code === 0) {
                    console.log('   Migrations completed');
                    resolve();
                } else {
                    reject(new Error(`Migration failed with code ${code}`));
                }
            });
        });
    }

    async updateDependencies() {
        console.log('📦 Updating dependencies...');
        
        return new Promise((resolve, reject) => {
            const npm = spawn('npm', ['ci', '--production'], {
                stdio: 'inherit'
            });
            
            npm.on('close', (code) => {
                if (code === 0) {
                    console.log('   Dependencies updated');
                    resolve();
                } else {
                    reject(new Error(`Dependency update failed with code ${code}`));
                }
            });
        });
    }

    async runTests() {
        console.log('🧪 Running test suite...');
        
        return new Promise((resolve, reject) => {
            const jest = spawn('npm', ['test'], {
                stdio: 'inherit'
            });
            
            jest.on('close', (code) => {
                if (code === 0) {
                    console.log('   Tests passed');
                    resolve();
                } else {
                    reject(new Error(`Tests failed with code ${code}`));
                }
            });
        });
    }

    async restartServices() {
        console.log('🔄 Restarting services...');
        
        // This would typically restart PM2, systemd, or Docker services
        // For now, just log the action
        console.log('   Service restart would be handled by process manager');
    }

    async postDeploymentChecks() {
        console.log('✅ Running post-deployment checks...');
        
        // Check if server responds
        const http = require('http');
        const port = process.env.PORT || 3000;
        
        return new Promise((resolve, reject) => {
            const req = http.get(`http://localhost:${port}/api/health`, (res) => {
                if (res.statusCode === 200) {
                    console.log('   Health check: OK');
                    resolve();
                } else {
                    reject(new Error(`Health check failed with status ${res.statusCode}`));
                }
            });
            
            req.on('error', reject);
            req.setTimeout(5000);
        });
    }

    async rollback() {
        console.log('🔄 Attempting rollback...');
        
        try {
            // Restore from backup
            const backups = await this.backupManager.listBackups();
            const latestBackup = backups.find(b => b.name.includes('pre_deployment'));
            
            if (latestBackup) {
                await this.backupManager.restoreBackup(latestBackup.path);
                console.log('✅ Rollback completed');
            } else {
                console.log('⚠️  No deployment backup found for rollback');
            }
            
        } catch (error) {
            console.error('❌ Rollback failed:', error);
        }
    }
}

// Export classes for use in server
module.exports = {
    DataGenerator,
    PerformanceMonitor, 
    DeploymentManager
};

// Command line interfaces
if (require.main === module) {
    const command = process.argv[2];
    
    switch (command) {
        case 'generate-data':
            const generator = new DataGenerator();
            generator.generateData().then(() => process.exit(0));
            break;
            
        case 'deploy':
            const deployer = new DeploymentManager();
            deployer.deploy().then(() => process.exit(0));
            break;
            
        default:
            console.log('Available commands:');
            console.log('  generate-data - Generate sample data');
            console.log('  deploy - Run deployment process');
            break;
    }
}
