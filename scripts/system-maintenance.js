// scripts/system-maintenance.js
// Automated System Maintenance and Scheduled Tasks

const cron = require('cron');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const DatabaseBackupManager = require('./backup-database');

class SystemMaintenance {
    constructor() {
        this.dbPath = 'fire_tracker.db';
        this.backupManager = new DatabaseBackupManager();
        this.maintenanceJobs = [];
    }

    init() {
        console.log('🔧 Initializing system maintenance tasks...');
        
        // Schedule daily backup at 2:00 AM
        const dailyBackup = new cron.CronJob('0 2 * * *', () => {
            this.performDailyBackup();
        }, null, true, 'America/Chicago');

        // Schedule weekly cleanup at 3:00 AM on Sundays
        const weeklyCleanup = new cron.CronJob('0 3 * * 0', () => {
            this.performWeeklyCleanup();
        }, null, true, 'America/Chicago');

        // Schedule monthly reports at 1:00 AM on the 1st
        const monthlyReports = new cron.CronJob('0 1 1 * *', () => {
            this.generateMonthlyReports();
        }, null, true, 'America/Chicago');

        // Schedule session cleanup every 4 hours
        const sessionCleanup = new cron.CronJob('0 */4 * * *', () => {
            this.cleanupExpiredSessions();
        }, null, true, 'America/Chicago');

        // Schedule log rotation daily at midnight
        const logRotation = new cron.CronJob('0 0 * * *', () => {
            this.rotateLogFiles();
        }, null, true, 'America/Chicago');

        this.maintenanceJobs = [
            { name: 'Daily Backup', job: dailyBackup },
            { name: 'Weekly Cleanup', job: weeklyCleanup },
            { name: 'Monthly Reports', job: monthlyReports },
            { name: 'Session Cleanup', job: sessionCleanup },
            { name: 'Log Rotation', job: logRotation }
        ];

        console.log(`✅ ${this.maintenanceJobs.length} maintenance tasks scheduled`);
    }

    async performDailyBackup() {
        console.log('🔄 Starting daily automated backup...');
        
        try {
            await this.backupManager.createBackup('daily_auto');
            console.log('✅ Daily backup completed successfully');
            
            // Log backup status
            await this.logMaintenanceAction('backup', 'success', 'Daily automated backup completed');
            
        } catch (error) {
            console.error('❌ Daily backup failed:', error);
            await this.logMaintenanceAction('backup', 'failure', error.message);
        }
    }

    async performWeeklyCleanup() {
        console.log('🧹 Starting weekly cleanup...');
        
        try {
            let cleanupActions = [];
            
            // Clean up old auth logs (older than 90 days)
            const authLogsCleanup = await this.cleanupOldAuthLogs();
            cleanupActions.push(`Auth logs: ${authLogsCleanup} records removed`);
            
            // Clean up old audit logs (older than 1 year)
            const auditLogsCleanup = await this.cleanupOldAuditLogs();
            cleanupActions.push(`Audit logs: ${auditLogsCleanup} records removed`);
            
            // Vacuum database to reclaim space
            await this.vacuumDatabase();
            cleanupActions.push('Database vacuum completed');
            
            // Clean up temporary files
            const tempFilesCleanup = this.cleanupTempFiles();
            cleanupActions.push(`Temp files: ${tempFilesCleanup} files removed`);
            
            console.log('✅ Weekly cleanup completed');
            await this.logMaintenanceAction('cleanup', 'success', cleanupActions.join('; '));
            
        } catch (error) {
            console.error('❌ Weekly cleanup failed:', error);
            await this.logMaintenanceAction('cleanup', 'failure', error.message);
        }
    }

    async generateMonthlyReports() {
        console.log('📊 Generating monthly reports...');
        
        try {
            const reportDate = new Date();
            const monthName = reportDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            
            // Generate incident summary
            const incidentSummary = await this.generateIncidentSummary();
            
            // Generate training summary
            const trainingSummary = await this.generateTrainingSummary();
            
            // Generate personnel statistics
            const personnelStats = await this.generatePersonnelStats();
            
            // Compile report
            const report = {
                report_date: reportDate.toISOString(),
                month: monthName,
                incidents: incidentSummary,
                training: trainingSummary,
                personnel: personnelStats,
                generated_at: new Date().toISOString()
            };
            
            // Save report
            const reportsDir = path.join('reports', reportDate.getFullYear().toString());
            if (!fs.existsSync(reportsDir)) {
                fs.mkdirSync(reportsDir, { recursive: true });
            }
            
            const reportFile = path.join(reportsDir, `monthly_report_${reportDate.getFullYear()}_${reportDate.getMonth() + 1}.json`);
            fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
            
            console.log(`✅ Monthly report generated: ${reportFile}`);
            await this.logMaintenanceAction('reports', 'success', `Monthly report for ${monthName} generated`);
            
        } catch (error) {
            console.error('❌ Monthly report generation failed:', error);
            await this.logMaintenanceAction('reports', 'failure', error.message);
        }
    }

    async cleanupExpiredSessions() {
        console.log('🔄 Cleaning up expired sessions...');
        
        try {
            // This would typically clean up session tokens/data
            // For now, just clean up old failed login attempts
            const db = new sqlite3.Database(this.dbPath);
            
            const cutoffDate = new Date();
            cutoffDate.setHours(cutoffDate.getHours() - 24); // Clean up attempts older than 24 hours
            
            const result = await this.runQuery(db, 
                "DELETE FROM auth_logs WHERE success = 0 AND attempt_time < ?", 
                [cutoffDate.toISOString()]
            );
            
            db.close();
            
            console.log(`✅ Cleaned up ${result.changes} expired session records`);
            
        } catch (error) {
            console.error('❌ Session cleanup failed:', error);
        }
    }

    rotateLogFiles() {
        console.log('🔄 Rotating log files...');
        
        try {
            const logsDir = 'logs';
            if (!fs.existsSync(logsDir)) return;
            
            const logFiles = ['combined.log', 'error.log'];
            const date = new Date().toISOString().split('T')[0];
            
            logFiles.forEach(logFile => {
                const logPath = path.join(logsDir, logFile);
                if (fs.existsSync(logPath)) {
                    const archivePath = path.join(logsDir, `${logFile}.${date}`);
                    fs.renameSync(logPath, archivePath);
                }
            });
            
            console.log('✅ Log files rotated');
            
        } catch (error) {
            console.error('❌ Log rotation failed:', error);
        }
    }

    async cleanupOldAuthLogs() {
        const db = new sqlite3.Database(this.dbPath);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 90);
        
        const result = await this.runQuery(db, 
            "DELETE FROM auth_logs WHERE attempt_time < ?", 
            [cutoffDate.toISOString()]
        );
        
        db.close();
        return result.changes;
    }

    async cleanupOldAuditLogs() {
        const db = new sqlite3.Database(this.dbPath);
        const cutoffDate = new Date();
        cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
        
        const result = await this.runQuery(db, 
            "DELETE FROM audit_log WHERE timestamp < ?", 
            [cutoffDate.toISOString()]
        );
        
        db.close();
        return result.changes;
    }

    async vacuumDatabase() {
        const db = new sqlite3.Database(this.dbPath);
        await this.runQuery(db, "VACUUM");
        db.close();
    }

    cleanupTempFiles() {
        let filesRemoved = 0;
        const tempDirs = ['exports', 'restore_temp'];
        
        tempDirs.forEach(dir => {
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                files.forEach(file => {
                    const filePath = path.join(dir, file);
                    const stats = fs.statSync(filePath);
                    
                    // Remove files older than 7 days
                    if (Date.now() - stats.mtime.getTime() > 7 * 24 * 60 * 60 * 1000) {
                        if (stats.isDirectory()) {
                            fs.rmSync(filePath, { recursive: true });
                        } else {
                            fs.unlinkSync(filePath);
                        }
                        filesRemoved++;
                    }
                });
            }
        });
        
        return filesRemoved;
    }

    async generateIncidentSummary() {
        const db = new sqlite3.Database(this.dbPath);
        
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setDate(1);
        
        const endDate = new Date();
        endDate.setDate(0);
        
        const incidents = await this.runQuery(db, `
            SELECT 
                COUNT(*) as total_incidents,
                COUNT(CASE WHEN active = 0 THEN 1 END) as closed_incidents,
                COUNT(CASE WHEN active = 1 THEN 1 END) as active_incidents,
                incident_type,
                COUNT(*) as count_by_type
            FROM incidents 
            WHERE created_at BETWEEN ? AND ?
            GROUP BY incident_type
        `, [startDate.toISOString(), endDate.toISOString()]);
        
        db.close();
        return incidents;
    }

    async generateTrainingSummary() {
        const db = new sqlite3.Database(this.dbPath);
        
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setDate(1);
        
        const endDate = new Date();
        endDate.setDate(0);
        
        const training = await this.runQuery(db, `
            SELECT 
                COUNT(*) as total_events,
                SUM(CASE WHEN ea.event_id IS NOT NULL THEN 1 ELSE 0 END) as total_attendance,
                event_type,
                COUNT(*) as count_by_type
            FROM events e
            LEFT JOIN event_attendees ea ON e.id = ea.event_id
            WHERE e.created_at BETWEEN ? AND ?
            GROUP BY event_type
        `, [startDate.toISOString(), endDate.toISOString()]);
        
        db.close();
        return training;
    }

    async generatePersonnelStats() {
        const db = new sqlite3.Database(this.dbPath);
        
        const stats = await this.runQuery(db, `
            SELECT 
                station,
                COUNT(*) as total_personnel,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_personnel,
                AVG(vacation_days_used) as avg_vacation_used
            FROM firefighters
            GROUP BY station
        `);
        
        db.close();
        return stats;
    }

    async logMaintenanceAction(action, status, details) {
        const db = new sqlite3.Database(this.dbPath);
        
        await this.runQuery(db, `
            INSERT INTO audit_log 
            (user_badge, action, table_name, record_id, new_values, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            'SYSTEM',
            `maintenance_${action}`,
            'system',
            'maintenance',
            JSON.stringify({ status, details, timestamp: new Date().toISOString() }),
            new Date().toISOString()
        ]);
        
        db.close();
    }

    runQuery(db, sql, params = []) {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this);
                }
            });
        });
    }

    getAllQuery(db, sql, params = []) {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    getStatus() {
        return {
            maintenance_jobs: this.maintenanceJobs.length,
            jobs: this.maintenanceJobs.map(job => ({
                name: job.name,
                running: job.job.running,
                last_run: job.job.lastDate?.toISOString() || 'Never',
                next_run: job.job.nextDate?.toISOString() || 'Not scheduled'
            }))
        };
    }

    stop() {
        console.log('🛑 Stopping maintenance tasks...');
        this.maintenanceJobs.forEach(job => {
            job.job.stop();
        });
        console.log('✅ All maintenance tasks stopped');
    }
}

// Initialize if run directly
if (require.main === module) {
    const maintenance = new SystemMaintenance();
    maintenance.init();
    
    console.log('🎯 System maintenance tasks initialized');
    console.log('📅 Scheduled tasks:');
    console.log('  - Daily backup: 2:00 AM');
    console.log('  - Weekly cleanup: 3:00 AM Sunday');
    console.log('  - Monthly reports: 1:00 AM 1st of month');
    console.log('  - Session cleanup: Every 4 hours');
    console.log('  - Log rotation: Daily at midnight');
    
    // Keep process running
    process.on('SIGINT', () => {
        console.log('\n🛑 Received SIGINT, stopping maintenance tasks...');
        maintenance.stop();
        process.exit(0);
    });
}

module.exports = SystemMaintenance;
