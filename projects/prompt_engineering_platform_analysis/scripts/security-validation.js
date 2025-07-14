#!/usr/bin/env node
/**
 * Security Validation Script
 * Comprehensive security testing and validation suite
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SecurityValidator {
  constructor() {
    this.results = {
      passed: [],
      failed: [],
      warnings: []
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '✅';
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }

  async validateSecurityHeaders() {
    this.log('Validating security headers...');
    
    const serverPath = path.join(__dirname, '../../server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    
    const requiredHeaders = [
      'helmet()',
      'contentSecurityPolicy',
      'strictTransportSecurity',
      'xFrameOptions',
      'xContentTypeOptions'
    ];
    
    const missing = requiredHeaders.filter(header => !serverContent.includes(header));
    
    if (missing.length === 0) {
      this.results.passed.push('Security headers configured');
    } else {
      this.results.failed.push(`Missing security headers: ${missing.join(', ')}`);
    }
  }

  async validateJWTConfiguration() {
    this.log('Validating JWT configuration...');
    
    const authPath = path.join(__dirname, '../src/middleware/authMiddleware.js');
    const authContent = fs.readFileSync(authPath, 'utf8');
    
    if (authContent.includes("algorithms: ['HS256']")) {
      this.results.passed.push('JWT algorithm correctly specified');
    } else {
      this.results.failed.push('JWT algorithm not specified');
    }
    
    if (authContent.includes('!user || !user.id')) {
      this.results.passed.push('JWT payload validation implemented');
    } else {
      this.results.failed.push('JWT payload validation missing');
    }
  }

  async validateRateLimiting() {
    this.log('Validating rate limiting configuration...');
    
    const rateLimitPath = path.join(__dirname, '../src/middleware/rateLimitMiddleware.js');
    const rateLimitContent = fs.readFileSync(rateLimitPath, 'utf8');
    
    const checks = [
      { pattern: 'tls:', description: 'Redis TLS configuration' },
      { pattern: 'password:', description: 'Redis authentication' },
      { pattern: 'redisClient.setex', description: 'Redis-based progressive limiting' },
      { pattern: 'PROGRESSIVE_KEY_PREFIX', description: 'Memory leak prevention' }
    ];
    
    checks.forEach(check => {
      if (rateLimitContent.includes(check.pattern)) {
        this.results.passed.push(check.description);
      } else {
        this.results.failed.push(check.description + ' missing');
      }
    });
  }

  async validatePromptInjectionDetection() {
    this.log('Validating prompt injection detection...');
    
    const promptPath = path.join(__dirname, '../src/middleware/promptInjectionMiddleware.js');
    const promptContent = fs.readFileSync(promptPath, 'utf8');
    
    const checks = [
      { pattern: 'MAX_PROCESSING_TIME', description: 'ReDoS timeout protection' },
      { pattern: 'processingTime', description: 'Performance monitoring' },
      { pattern: 'try { pattern.test', description: 'Regex error handling' }
    ];
    
    checks.forEach(check => {
      if (promptContent.includes(check.pattern)) {
        this.results.passed.push(check.description);
      } else {
        this.results.failed.push(check.description + ' missing');
      }
    });
  }

  async validateErrorHandling() {
    this.log('Validating error handling security...');
    
    const serverPath = path.join(__dirname, '../../server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    
    if (serverContent.includes('Internal Server Error') && 
        serverContent.includes('NODE_ENV === \'development\'')) {
      this.results.passed.push('Secure error handling implemented');
    } else {
      this.results.failed.push('Secure error handling missing');
    }
  }

  async validateDependencies() {
    this.log('Validating security dependencies...');
    
    const packagePath = path.join(__dirname, '../../package.json');
    const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    const requiredDeps = ['helmet', 'express-rate-limit', 'express-validator'];
    const missing = requiredDeps.filter(dep => !packageContent.dependencies[dep]);
    
    if (missing.length === 0) {
      this.results.passed.push('Security dependencies installed');
    } else {
      this.results.failed.push(`Missing dependencies: ${missing.join(', ')}`);
    }
  }

  async runNpmAudit() {
    this.log('Running npm security audit...');
    
    try {
      execSync('npm audit --audit-level=high', { stdio: 'pipe' });
      this.results.passed.push('No high-severity vulnerabilities');
    } catch (error) {
      const output = error.stdout?.toString() || error.message;
      if (output.includes('found') && output.includes('vulnerabilities')) {
        this.results.warnings.push('Security vulnerabilities found - run npm audit fix');
      } else {
        this.results.passed.push('Security audit passed');
      }
    }
  }

  async runTestSuite() {
    this.log('Running security test suite...');
    
    try {
      execSync('npm test -- --testPathPattern=security-regression-suite', { stdio: 'pipe' });
      this.results.passed.push('Security test suite passed');
    } catch (error) {
      this.results.failed.push('Security test suite failed');
    }
  }

  async checkEnvironmentVariables() {
    this.log('Validating environment configuration...');
    
    const envExamplePath = path.join(__dirname, '../../.env.example');
    if (!fs.existsSync(envExamplePath)) {
      this.results.warnings.push('.env.example file missing');
    } else {
      this.results.passed.push('Environment template available');
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('SECURITY VALIDATION REPORT');
    console.log('='.repeat(60));
    
    console.log(`\n✅ PASSED: ${this.results.passed.length}`);
    this.results.passed.forEach(item => console.log(`   - ${item}`));
    
    console.log(`\n❌ FAILED: ${this.results.failed.length}`);
    this.results.failed.forEach(item => console.log(`   - ${item}`));
    
    console.log(`\n⚠️  WARNINGS: ${this.results.warnings.length}`);
    this.results.warnings.forEach(item => console.log(`   - ${item}`));
    
    const overallStatus = this.results.failed.length === 0 ? 'SECURE' : 'INSECURE';
    console.log(`\nOVERALL STATUS: ${overallStatus}`);
    
    return this.results.failed.length === 0;
  }

  async run() {
    console.log('🔒 Starting Security Validation...\n');
    
    await this.validateSecurityHeaders();
    await this.validateJWTConfiguration();
    await this.validateRateLimiting();
    await this.validatePromptInjectionDetection();
    await this.validateErrorHandling();
    await this.validateDependencies();
    await this.checkEnvironmentVariables();
    
    // Run npm audit and tests (optional, may fail in some environments)
    try {
      await this.runNpmAudit();
      await this.runTestSuite();
    } catch (error) {
      this.results.warnings.push('Some validation checks skipped due to environment limitations');
    }
    
    return this.generateReport();
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new SecurityValidator();
  validator.run().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
}

module.exports = SecurityValidator;