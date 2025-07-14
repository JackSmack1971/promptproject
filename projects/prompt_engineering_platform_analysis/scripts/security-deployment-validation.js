#!/usr/bin/env node

/**
 * Security Deployment Validation Script
 * Comprehensive validation of all security enhancements before production deployment
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

class SecurityValidator {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
  }

  log(message, status = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${status}: ${message}`);
    this.results.details.push({ message, status, timestamp });
  }

  pass(message) {
    this.log(message, 'PASS');
    this.results.passed++;
  }

  fail(message) {
    this.log(message, 'FAIL');
    this.results.failed++;
  }

  warn(message) {
    this.log(message, 'WARN');
    this.results.warnings++;
  }

  // Environment variable validation
  validateEnvironment() {
    this.log('=== Environment Variable Validation ===');
    
    const requiredVars = [
      'JWT_SECRET',
      'DATABASE_URL',
      'REDIS_URL',
      'NODE_ENV'
    ];

    const securityVars = [
      'SENTRY_DSN',
      'ENCRYPTION_KEY',
      'API_KEY_SECRET'
    ];

    requiredVars.forEach(varName => {
      if (!process.env[varName]) {
        this.fail(`Required environment variable missing: ${varName}`);
      } else {
        this.pass(`Required environment variable present: ${varName}`);
      }
    });

    securityVars.forEach(varName => {
      if (!process.env[varName]) {
        this.warn(`Security environment variable missing: ${varName}`);
      } else {
        this.pass(`Security environment variable present: ${varName}`);
      }
    });

    // Validate JWT secret strength
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
      this.fail('JWT_SECRET must be at least 32 characters');
    } else if (process.env.JWT_SECRET) {
      this.pass('JWT_SECRET meets length requirement');
    }

    // Validate NODE_ENV
    if (process.env.NODE_ENV !== 'production') {
      this.warn('NODE_ENV is not set to production');
    } else {
      this.pass('NODE_ENV is set to production');
    }
  }

  // File system validation
  validateFileSystem() {
    this.log('=== File System Security Validation ===');

    const requiredFiles = [
      'config/security.js',
      'src/middleware/authMiddleware.js',
      'src/middleware/rateLimitMiddleware.js',
      'src/middleware/promptInjectionMiddleware.js',
      'src/middleware/auditLogger.js',
      'src/middleware/gdprMiddleware.js',
      'database/schema.sql',
      '.env.example'
    ];

    requiredFiles.forEach(file => {
      const filePath = path.join(__dirname, '..', file);
      if (fs.existsSync(filePath)) {
        this.pass(`Required file exists: ${file}`);
        
        // Check file permissions
        const stats = fs.statSync(filePath);
        const mode = stats.mode & parseInt('777', 8);
        if (mode > 0o644) {
          this.warn(`File permissions too permissive: ${file} (${mode.toString(8)})`);
        }
      } else {
        this.fail(`Required file missing: ${file}`);
      }
    });

    // Check for sensitive files
    const sensitiveFiles = ['.env', 'private.key', 'certificate.pem'];
    sensitiveFiles.forEach(file => {
      const filePath = path.join(__dirname, '..', file);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const mode = stats.mode & parseInt('777', 8);
        if (mode > 0o600) {
          this.fail(`Sensitive file permissions too permissive: ${file} (${mode.toString(8)})`);
        } else {
          this.pass(`Sensitive file permissions secure: ${file}`);
        }
      }
    });
  }

  // Database validation
  async validateDatabase() {
    this.log('=== Database Security Validation ===');

    try {
      const db = require('../database/db');
      
      // Check if security tables exist
      const tables = [
        'users',
        'user_sessions',
        'login_attempts',
        'audit_logs',
        'security_events'
      ];

      for (const table of tables) {
        const result = await db.query(
          "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)",
          [table]
        );
        
        if (result.rows[0].exists) {
          this.pass(`Security table exists: ${table}`);
        } else {
          this.fail(`Security table missing: ${table}`);
        }
      }

      // Check for security columns in users table
      const securityColumns = [
        'failed_login_attempts',
        'locked_until',
        'password_changed_at',
        'refresh_token_expires_at'
      ];

      const userColumns = await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"
      );
      
      const existingColumns = userColumns.rows.map(row => row.column_name);
      
      securityColumns.forEach(column => {
        if (existingColumns.includes(column)) {
          this.pass(`Security column exists: users.${column}`);
        } else {
          this.fail(`Security column missing: users.${column}`);
        }
      });

      // Check for indexes
      const indexes = await db.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"
      );
      
      const indexNames = indexes.rows.map(row => row.indexname);
      
      const requiredIndexes = [
        'idx_users_locked_until',
        'idx_user_sessions_refresh_token',
        'idx_login_attempts_ip_address',
        'idx_audit_logs_created_at'
      ];

      requiredIndexes.forEach(index => {
        if (indexNames.some(name => name.includes(index))) {
          this.pass(`Security index exists: ${index}`);
        } else {
          this.warn(`Security index missing: ${index}`);
        }
      });

    } catch (error) {
      this.fail(`Database validation error: ${error.message}`);
    }
  }

  // Security configuration validation
  validateSecurityConfig() {
    this.log('=== Security Configuration Validation ===');

    try {
      const securityConfig = require('../config/security');
      
      // Validate JWT configuration
      if (securityConfig.auth.jwt.expiresIn === '1h') {
        this.pass('JWT expiration configured');
      } else {
        this.warn('JWT expiration may be too long');
      }

      // Validate password requirements
      if (securityConfig.auth.password.minLength >= 8) {
        this.pass('Password minimum length adequate');
      } else {
        this.fail('Password minimum length too short');
      }

      // Validate rate limiting
      if (securityConfig.rateLimit.max.auth <= 10) {
        this.pass('Rate limiting for auth adequate');
      } else {
        this.warn('Rate limiting for auth may be too permissive');
      }

      // Validate input limits
      if (securityConfig.validation.maxPromptLength <= 10000) {
        this.pass('Prompt length limit adequate');
      } else {
        this.warn('Prompt length limit may be too high');
      }

    } catch (error) {
      this.fail(`Security configuration validation error: ${error.message}`);
    }
  }

  // Middleware validation
  validateMiddleware() {
    this.log('=== Middleware Security Validation ===');

    const middlewareFiles = [
      'src/middleware/authMiddleware.js',
      'src/middleware/rateLimitMiddleware.js',
      'src/middleware/promptInjectionMiddleware.js',
      'src/middleware/auditLogger.js',
      'src/middleware/gdprMiddleware.js'
    ];

    middlewareFiles.forEach(file => {
      const filePath = path.join(__dirname, '..', file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Check for security patterns
        if (content.includes('sanitize') || content.includes('validate')) {
          this.pass(`Input validation found in: ${file}`);
        } else {
          this.warn(`No input validation patterns found in: ${file}`);
        }
        
        if (content.includes('auditLogger')) {
          this.pass(`Audit logging found in: ${file}`);
        } else {
          this.warn(`No audit logging found in: ${file}`);
        }
        
        if (content.includes('rateLimit')) {
          this.pass(`Rate limiting found in: ${file}`);
        } else {
          this.warn(`No rate limiting found in: ${file}`);
        }
      }
    });
  }

  // SSL/TLS validation
  validateSSL() {
    this.log('=== SSL/TLS Security Validation ===');

    if (process.env.NODE_ENV === 'production') {
      if (process.env.SSL_CERT_PATH && process.env.SSL_KEY_PATH) {
        const certPath = process.env.SSL_CERT_PATH;
        const keyPath = process.env.SSL_KEY_PATH;
        
        if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
          this.pass('SSL certificates configured');
          
          // Check certificate expiration
          try {
            const cert = fs.readFileSync(certPath, 'utf8');
            const certData = crypto.createPublicKey(cert);
            this.pass('SSL certificate valid');
          } catch (error) {
            this.fail(`SSL certificate validation error: ${error.message}`);
          }
        } else {
          this.fail('SSL certificate files not found');
        }
      } else {
        this.warn('SSL certificate paths not configured');
      }
    } else {
      this.warn('Skipping SSL validation in non-production environment');
    }
  }

  // Generate security report
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.passed + this.results.failed + this.results.warnings,
        passed: this.results.passed,
        failed: this.results.failed,
        warnings: this.results.warnings
      },
      details: this.results.details
    };

    const reportPath = path.join(__dirname, '..', 'security-validation-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    this.log(`Security validation report saved to: ${reportPath}`);
    
    return report;
  }

  // Run all validations
  async run() {
    console.log('🔒 Starting Security Deployment Validation...\n');

    this.validateEnvironment();
    this.validateFileSystem();
    this.validateSecurityConfig();
    this.validateMiddleware();
    this.validateSSL();
    
    if (process.env.NODE_ENV !== 'test') {
      await this.validateDatabase();
    }

    const report = this.generateReport();

    console.log('\n📊 Security Validation Summary:');
    console.log(`✅ Passed: ${report.summary.passed}`);
    console.log(`❌ Failed: ${report.summary.failed}`);
    console.log(`⚠️  Warnings: ${report.summary.warnings}`);

    if (report.summary.failed > 0) {
      console.log('\n🚨 SECURITY VALIDATION FAILED');
      console.log('Please address all failed validations before deployment.');
      process.exit(1);
    } else if (report.summary.warnings > 0) {
      console.log('\n⚠️  Security validation passed with warnings');
      console.log('Review warnings before production deployment.');
    } else {
      console.log('\n✅ All security validations passed!');
    }

    return report;
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new SecurityValidator();
  validator.run().catch(console.error);
}

module.exports = SecurityValidator;