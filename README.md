# 🔥 Fire Department Tracker - Enterprise Edition

[![Node.js](https://img.shields.io/badge/Node.js-v16+-green.svg)](https://nodejs.org)
[![SQLite](https://img.shields.io/badge/SQLite-3.x-blue.svg)](https://sqlite.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive enterprise-level fire department management system for tracking incidents, events, training, personnel, and equipment with robust authentication and reporting capabilities.

## 🚀 Features

### Core Functionality
- **Incident Management** - Complete incident tracking with personnel sign-in/out
- **Event & Training Management** - Comprehensive event scheduling and attendance tracking  
- **Personnel Management** - Full firefighter roster with badge/PIN authentication
- **Equipment & Apparatus Tracking** - Maintenance logs and status tracking
- **Enterprise Reporting** - Detailed analytics and export capabilities

### Security & Enterprise Features
- **Badge/PIN Authentication** - Secure two-factor authentication system
- **Account Security** - Automatic lockout after failed attempts
- **Audit Logging** - Complete audit trail for compliance
- **Rate Limiting** - Protection against brute force attacks
- **Data Encryption** - Secure password hashing with bcrypt
- **Database Backups** - Automated backup and restore system

### Multi-Station Support
- **Station-Based Access** - Separate authentication per station
- **Cross-Station Visibility** - Department-wide incident and event visibility
- **Distributed Operations** - Support for multiple fire stations

## 📋 Prerequisites

Before installation, ensure you have:

- **Node.js** v16.0.0 or higher
- **npm** v8.0.0 or higher  
- **Git** for version control
- **SQLite3** (automatically installed with dependencies)

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone https://github.com/fire-dept/tracker.git
cd tracker
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Initialize the Database

```bash
npm run init-db
```

This will:
- Create the SQLite database with all required tables
- Insert default stations and personnel
- Set up authentication system
- Create sample data for testing

### 4. Start the Server

**Development Mode:**
```bash
npm run dev
```

**Production Mode:**
```bash
npm start
```

The application will be available at: `http://localhost:3000`

## 🔐 Default Credentials

### Admin Access
- **Password:** `admin123`

### Station Accounts
- **Station 1:** `station1pass`
- **Station 2:** `station2pass` 
- **Station 3:** `station3pass`
- **Station 4:** `station4pass`
- **Station 5:** `station5pass`

### Personnel Badge/PIN Authentication
| Badge | PIN  | Name          | Rank        | Station   |
|-------|------|---------------|-------------|-----------|
| 001   | 1234 | John Smith    | Captain     | Station 1 |
| 002   | 2345 | Jane Doe      | Lieutenant  | Station 1 |
| 003   | 3456 | Mike Johnson  | Firefighter | Station 2 |
| 004   | 4567 | Sarah Williams| Engineer    | Station 2 |
| 005   | 5678 | Tom Brown     | Firefighter | Station 3 |

## 📁 Project Structure

```
fire-department-tracker/
├── server.js                 # Main Express server
├── index.html               # Main application interface
├── package.json             # Node.js dependencies
├── fire_tracker.db          # SQLite database (created on first run)
├── scripts/
│   ├── init-database.js     # Database initialization
│   └── backup-database.js   # Backup/restore utilities
├── logs/                    # Application logs
├── backups/                 # Database backups
└── exports/                 # Data exports
```

## 🎯 Usage Guide

### 1. Station Setup
1. Select your station from the dropdown in the navigation
2. Login using the station credentials
3. The system will remember your station selection

### 2. Creating Incidents
1. Navigate to the **Incidents** tab
2. Click **New Incident**
3. Authenticate with badge/PIN
4. Enter incident details (location, type, description)
5. Personnel can sign in using their badge/PIN

### 3. Managing Events & Training
1. Go to **Events & Training** tab
2. Use **Quick Event** form or click **New Event**
3. Authenticate with badge/PIN
4. Fill in event details:
   - Event name and type
   - Start date/time and duration
   - Location and description
5. Personnel sign in during the event

### 4. Personnel Management
1. Access **Personnel** tab
2. View complete firefighter roster
3. Search by name, badge, or station
4. Reset PINs or manage personnel status

### 5. Enterprise Reporting
1. Navigate to **Reports** tab
2. Generate activity summaries
3. View personnel statistics
4. Export data in JSON or CSV formats

## 🔧 Database Management

### Backup Operations

**Create Manual Backup:**
```bash
npm run backup-db
# or
node scripts/backup-database.js create
```

**List Available Backups:**
```bash
node scripts/backup-database.js list
```

**Restore from Backup:**
```bash
node scripts/backup-database.js restore backups/backup-file.zip
```

**Export Data:**
```bash
# Export as JSON
node scripts/backup-database.js export json

# Export as CSV  
node scripts/backup-database.js export csv
```

### Database Schema

The system includes comprehensive database tables:

- **firefighters** - Personnel information and authentication
- **incidents** - Emergency response tracking
- **attendees** - Incident personnel assignments
- **events** - Training and activity management
- **event_attendees** - Event participation tracking
- **stations** - Fire station information
- **apparatus** - Equipment and vehicle tracking
- **maintenance_logs** - Equipment maintenance history
- **auth_logs** - Security audit trail
- **audit_log** - Complete system audit log

## 🛡️ Security Features

### Authentication System
- **Two-Factor Auth** - Badge number + PIN
- **Account Lockout** - Automatic lockout after 5 failed attempts
- **Session Management** - Secure session handling
- **Password Security** - bcrypt hashing for PINs

### Security Headers
- **Helmet.js** - Security headers middleware
- **CORS Protection** - Cross-origin request security
- **Rate Limiting** - API endpoint protection
- **Input Validation** - Request data validation

### Audit & Compliance
- **Complete Audit Trail** - All actions logged
- **Authentication Logs** - Failed/successful login attempts
- **Data Integrity** - Foreign key constraints
- **Backup System** - Automated data protection

## 📊 API Endpoints

### Authentication
- `POST /api/firefighters/authenticate` - Badge/PIN authentication
- `POST /api/station/login` - Station authentication

### Personnel Management
- `GET /api/firefighters` - Get personnel list
- `POST /api/firefighters` - Add new personnel
- `PUT /api/firefighters/:badge/pin` - Reset PIN

### Incident Management
- `GET /api/incidents` - Get incidents
- `POST /api/incidents` - Create new incident
- `POST /api/incidents/:id/attendees` - Sign personnel into incident

### Event Management
- `GET /api/events` - Get events
- `POST /api/events` - Create new event
- `POST /api/events/:id/attendees` - Sign personnel into event

### Reporting
- `GET /api/reports/activity-summary` - Activity statistics
- `GET /api/reports/personnel-stats` - Personnel analytics

## 🔄 Integration with Payroll Systems

The system supports integration with existing payroll systems:

### Payroll Data Export
- **CSV Export** - Compatible with most payroll systems
- **Time Tracking** - Automatic hours calculation
- **Pay Codes** - Configurable pay code assignments
- **Overtime Calculation** - Built-in overtime logic

### Integration Files
- Use `payroll_processor_gui.py` for advanced payroll processing
- Export attendance data via API or CSV
- Automated time calculations for incidents and events

## 🐳 Docker Deployment (Optional)

Create a `Dockerfile`:

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run init-db
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t fire-tracker .
docker run -p 3000:3000 -v $(pwd)/fire_tracker.db:/app/fire_tracker.db fire-tracker
```

## 📝 Configuration

### Environment Variables

Create a `.env` file:

```env
PORT=3000
NODE_ENV=production
DATABASE_PATH=fire_tracker.db
MAX_FAILED_ATTEMPTS=5
SESSION_TIMEOUT=480
BACKUP_RETENTION_DAYS=90
```

### System Settings

Modify settings via the database:

```sql
UPDATE settings SET value = 'New Department Name' WHERE key = 'department_name';
UPDATE settings SET value = '10' WHERE key = 'max_failed_login_attempts';
```

## 🔍 Troubleshooting

### Common Issues

**Database Permission Errors:**
```bash
chmod 664 fire_tracker.db
chown www-data:www-data fire_tracker.db
```

**Port Already in Use:**
```bash
export PORT=3001
npm start
```

**Reset Admin Password:**
```sql
UPDATE settings SET value = 'newpassword' WHERE key = 'admin_password';
```

**Clear Failed Login Attempts:**
```sql
UPDATE firefighters SET failed_attempts = 0, account_locked = 0;
```

### Log Files

Check application logs:
```bash
tail -f logs/combined.log    # All logs
tail -f logs/error.log       # Error logs only
```

## 🤝 Support & Contributing

### Getting Help
- Check the troubleshooting section above
- Review log files for error messages
- Contact your system administrator

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable  
5. Submit a pull request

### Reporting Issues
Please include:
- Operating system and Node.js version
- Error messages and log excerpts
- Steps to reproduce the issue
- Screenshots if applicable

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🏆 Acknowledgments

- Built for fire departments and emergency services
- Designed with input from fire service professionals
- Committed to public safety and service excellence

---

**🔥 Stay Safe, Stay Ready** 

For technical support or questions about deployment, please contact your system administrator or IT department.
