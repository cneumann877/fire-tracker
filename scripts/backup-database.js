// scripts/backup-database.js
// Enterprise Database Backup and Restore Utility

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const archiver = require('archiver');
const extract = require('extract-zip');

class DatabaseBackupManager {
    constructor() {
        this.dbPath = 'fire_tracker.db';
        this.backupDir = 'backups';
        this.maxBackups = 30; // Keep 30 days of backups
        
        // Ensure backup directory exists
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    async createBackup(type = 'auto') {
        console.log('🔄 Starting database backup...');
        
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `fire_tracker_backup_${timestamp}`;
            const backupPath = path.join(this.backupDir, `${backupName}.zip`);
            
            // Create backup metadata
            const metadata = {
                backup_name: backupName,
                backup_type: type, // auto, manual, pre_migration
                created_at: new Date().toISOString(),
                database_size: this.getFileSize(this.dbPath),
                version: await this.getDatabaseVersion(),
                tables: await this.getTableList()
            };

            // Create zip archive
            const output = fs.createWriteStream(backupPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            return new Promise((resolve, reject) => {
                output.on('close', () => {
                    console.log(`✅ Backup created: ${backupPath}`);
                    console.log(`📦 Archive size: ${this.formatBytes(archive.pointer())}`);
                    
                    // Clean up old backups
                    this.cleanupOldBackups();
                    
                    resolve(backupPath);
                });

                archive.on('error', (err) => {
                    reject(err);
                });

                archive.pipe(output);

                // Add database file
                if (fs.existsSync(this.dbPath)) {
                    archive.file(this.dbPath, { name: 'fire_tracker.db' });
                }

                // Add metadata
                archive.append(JSON.stringify(metadata, null, 2), { name: 'backup_metadata.json' });

                // Add logs if they exist
                if (fs.existsSync('logs') && fs.statSync('logs').isDirectory()) {
                    archive.directory('logs/', 'logs/');
                }

                // Add configuration files
                const configFiles = ['package.json', 'README.md'];
                configFiles.forEach(file => {
                    if (fs.existsSync(file)) {
                        archive.file(file, { name: file });
                    }
                });

                archive.finalize();
            });

        } catch (error) {
            console.error('❌ Backup failed:', error);
            throw error;
        }
    }

    async restoreBackup(backupPath) {
        console.log(`🔄 Starting database restore from: ${backupPath}`);
        
        try {
            if (!fs.existsSync(backupPath)) {
                throw new Error('Backup file not found');
            }

            // Create restore directory
            const restoreDir = path.join(__dirname, 'restore_temp');
            if (fs.existsSync(restoreDir)) {
                fs.rmSync(restoreDir, { recursive: true });
            }
            fs.mkdirSync(restoreDir);

            // Extract backup
            console.log('📦 Extracting backup archive...');
            await extract(backupPath, { dir: path.resolve(restoreDir) });

            // Read metadata
            const metadataPath = path.join(restoreDir, 'backup_metadata.json');
            if (fs.existsSync(metadataPath)) {
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                console.log('📋 Backup Metadata:');
                console.log(`   Created: ${metadata.created_at}`);
                console.log(`   Type: ${metadata.backup_type}`);
                console.log(`   Version: ${metadata.version}`);
                console.log(`   Tables: ${metadata.tables.length}`);
            }

            // Backup current database
            const currentBackupPath = await this.createBackup('pre_restore');
            console.log(`💾 Current database backed up to: ${currentBackupPath}`);

            // Restore database file
            const restoredDbPath = path.join(restoreDir, 'fire_tracker.db');
            if (fs.existsSync(restoredDbPath)) {
                if (fs.existsSync(this.dbPath)) {
                    fs.unlinkSync(this.dbPath);
                }
                fs.copyFileSync(restoredDbPath, this.dbPath);
                console.log('✅ Database restored successfully');
            } else {
                throw new Error('Database file not found in backup');
            }

            // Restore logs if they exist
            const logsPath = path.join(restoreDir, 'logs');
            if (fs.existsSync(logsPath) && fs.statSync(logsPath).isDirectory()) {
                if (fs.existsSync('logs')) {
                    fs.rmSync('logs', { recursive: true });
                }
                fs.cpSync(logsPath, 'logs', { recursive: true });
                console.log('📝 Logs restored');
            }

            // Verify restored database
            const isValid = await this.verifyDatabase();
            if (!isValid) {
                throw new Error('Restored database failed verification');
            }

            // Cleanup
            fs.rmSync(restoreDir, { recursive: true });

            console.log('✅ Database restore completed successfully');
            return true;

        } catch (error) {
            console.error('❌ Restore failed:', error);
            throw error;
        }
    }

    async listBackups() {
        console.log('📋 Available Backups:');
        console.log('==========================================');

        try {
            const files = fs.readdirSync(this.backupDir)
                .filter(file => file.endsWith('.zip'))
                .map(file => {
                    const filePath = path.join(this.backupDir, file);
                    const stats = fs.statSync(filePath);
                    return {
                        name: file,
                        path: filePath,
                        size: stats.size,
                        created: stats.mtime
                    };
                })
                .sort((a, b) => b.created - a.created);

            if (files.length === 0) {
                console.log('No backups found');
                return [];
            }

            files.forEach((backup, index) => {
                console.log(`${index + 1}. ${backup.name}`);
                console.log(`   Created: ${backup.created.toLocaleString()}`);
                console.log(`   Size: ${this.formatBytes(backup.size)}`);
                console.log('');
            });

            return files;

        } catch (error) {
            console.error('Error listing backups:', error);
            return [];
        }
    }

    async getDatabaseVersion() {
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY, (err) => {
                if (err) {
                    resolve('unknown');
                    return;
                }

                db.get("SELECT version FROM db_version LIMIT 1", (err, row) => {
                    db.close();
                    resolve(row ? row.version : 'unknown');
                });
            });
        });
    }

    async getTableList() {
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY, (err) => {
                if (err) {
                    resolve([]);
                    return;
                }

                db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
                    db.close();
                    resolve(rows ? rows.map(row => row.name) : []);
                });
            });
        });
    }

    async verifyDatabase() {
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY, (err) => {
                if (err) {
                    resolve(false);
                    return;
                }

                // Check if essential tables exist
                db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='firefighters'", (err, row) => {
                    if (err || !row) {
                        db.close();
                        resolve(false);
                        return;
                    }

                    // Check if database is accessible
                    db.get("SELECT COUNT(*) as count FROM firefighters", (err, result) => {
                        db.close();
                        resolve(!err && result);
                    });
                });
            });
        });
    }

    cleanupOldBackups() {
        try {
            const files = fs.readdirSync(this.backupDir)
                .filter(file => file.endsWith('.zip'))
                .map(file => {
                    const filePath = path.join(this.backupDir, file);
                    return {
                        name: file,
                        path: filePath,
                        created: fs.statSync(filePath).mtime
                    };
                })
                .sort((a, b) => b.created - a.created);

            // Keep only the most recent backups
            if (files.length > this.maxBackups) {
                const filesToDelete = files.slice(this.maxBackups);
                filesToDelete.forEach(file => {
                    fs.unlinkSync(file.path);
                    console.log(`🗑️  Deleted old backup: ${file.name}`);
                });
            }

        } catch (error) {
            console.error('Error cleaning up old backups:', error);
        }
    }

    getFileSize(filePath) {
        try {
            return fs.statSync(filePath).size;
        } catch (error) {
            return 0;
        }
    }

    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    async exportData(format = 'json') {
        console.log(`📤 Exporting data in ${format} format...`);

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const exportDir = path.join('exports', timestamp);
            
            if (!fs.existsSync('exports')) {
                fs.mkdirSync('exports');
            }
            fs.mkdirSync(exportDir, { recursive: true });

            const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY);

            const tables = ['firefighters', 'incidents', 'attendees', 'events', 'event_attendees', 
                          'stations', 'apparatus', 'maintenance_logs', 'auth_logs'];

            for (const tableName of tables) {
                const data = await this.exportTable(db, tableName);
                
                if (format === 'json') {
                    fs.writeFileSync(
                        path.join(exportDir, `${tableName}.json`),
                        JSON.stringify(data, null, 2)
                    );
                } else if (format === 'csv') {
                    const csv = this.convertToCSV(data);
                    fs.writeFileSync(
                        path.join(exportDir, `${tableName}.csv`),
                        csv
                    );
                }
            }

            db.close();

            // Create summary
            const summary = {
                export_date: new Date().toISOString(),
                format: format,
                tables_exported: tables.length,
                export_path: exportDir
            };

            fs.writeFileSync(
                path.join(exportDir, 'export_summary.json'),
                JSON.stringify(summary, null, 2)
            );

            console.log(`✅ Data exported to: ${exportDir}`);
            return exportDir;

        } catch (error) {
            console.error('❌ Export failed:', error);
            throw error;
        }
    }

    exportTable(db, tableName) {
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    convertToCSV(data) {
        if (data.length === 0) return '';

        const headers = Object.keys(data[0]);
        const csv = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    const value = row[header];
                    return typeof value === 'string' && value.includes(',') 
                        ? `"${value}"` 
                        : value;
                }).join(',')
            )
        ].join('\n');

        return csv;
    }
}

// Command line interface
if (require.main === module) {
    const manager = new DatabaseBackupManager();
    const command = process.argv[2];

    switch (command) {
        case 'create':
        case 'backup':
            manager.createBackup('manual')
                .then(backupPath => {
                    console.log(`\n🎉 Backup completed: ${backupPath}`);
                    process.exit(0);
                })
                .catch(error => {
                    console.error('\n💥 Backup failed:', error);
                    process.exit(1);
                });
            break;

        case 'list':
            manager.listBackups()
                .then(() => process.exit(0))
                .catch(error => {
                    console.error('Error:', error);
                    process.exit(1);
                });
            break;

        case 'restore':
            const backupPath = process.argv[3];
            if (!backupPath) {
                console.error('Usage: node backup-database.js restore <backup-path>');
                process.exit(1);
            }
            
            manager.restoreBackup(backupPath)
                .then(() => {
                    console.log('\n🎉 Restore completed successfully');
                    process.exit(0);
                })
                .catch(error => {
                    console.error('\n💥 Restore failed:', error);
                    process.exit(1);
                });
            break;

        case 'export':
            const format = process.argv[3] || 'json';
            manager.exportData(format)
                .then(() => {
                    console.log('\n🎉 Export completed successfully');
                    process.exit(0);
                })
                .catch(error => {
                    console.error('\n💥 Export failed:', error);
                    process.exit(1);
                });
            break;

        default:
            console.log('🔥 Fire Department Tracker - Database Management');
            console.log('Usage: node backup-database.js <command> [options]');
            console.log('');
            console.log('Commands:');
            console.log('  create, backup          Create a new backup');
            console.log('  list                    List available backups');
            console.log('  restore <backup-path>   Restore from backup');
            console.log('  export [json|csv]       Export data to files');
            console.log('');
            console.log('Examples:');
            console.log('  node backup-database.js create');
            console.log('  node backup-database.js list');
            console.log('  node backup-database.js restore backups/backup.zip');
            console.log('  node backup-database.js export csv');
            break;
    }
}

module.exports = DatabaseBackupManager;
