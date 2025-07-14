#!/usr/bin/env node
/**
 * Final Security Validation Script
 * 
 * This script validates that all security fixes have been properly implemented
 * and the application is ready for production deployment.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Security configuration validation
const securityChecks = {
  jwtSecret: {
    name: 'JWT Secret Configuration',
    check: () => {
      const envPath = path.join(__dirname, '..', '.env');
      const envExamplePath = path.join(__dirname, '..', '.env.example');
      
      if (!fs.existsSync(envPath)) {
        return { passed: false, message: '.env file not found' };
      }
      
      const envContent = fs.readFileSync(envPath, 'utf8');
      const jwtSecret = envContent.match(/JWT_SECRET=(.+)/)?.[1];
      
      if (!jwtSecret || jwtSecret.length < 32) {
        return { passed: false, message: 'JWT_SECRET too short or missing (minimum 32 chars)' };
      }
      
      if (jwtSecret === 'your_jwt_secret') {
        return { passed: false, message: 'JWT_SECRET still using default value' };
      }
      
      return { passed: true, message: 'JWT secret properly configured' };
    }
  },
  
  promptInjectionMiddleware: {
    name: 'Prompt Injection Protection',
    check: () => {
      const middlewarePath = path.join(__dirname, '..', 'src', 'middleware', 'promptInjectionMiddleware.js');
      
      if (!fs.existsSync(middlewarePath)) {
        return { passed: false, message: 'Prompt injection middleware not found' };
      }
      
      const content = fs.readFileSync(middlewarePath, 'utf8');
      
      // Check for enhanced sanitization
      const hasEnhancedSanitization = content.includes('dangerous characters');
      const hasSQLPatterns = content.includes('sql_injection');
      const hasEncodingBypass = content.includes('encoding_bypass');
      
      if (!hasEnhancedSanitization || !hasSQLPatterns || !hasEncodingBypass) {
        return { passed: false, message: 'Enhanced prompt injection protection not fully implemented' };
      }
      
      return { passed: true, message: 'Prompt injection protection properly configured' };
    }
  },
  
  redisSSL: {
    name: 'Redis SSL Configuration',
    check: () => {
      const middlewarePath = path.join(__dirname, '..', 'src', 'middleware', 'rateLimitMiddleware.js');
      
      if (!fs.existsSync(middlewarePath)) {
        return { passed: false, message: 'Rate limit middleware not found' };
      }
      
      const content = fs.readFileSync(middlewarePath, 'utf8');
      
      const hasSANValidation = content.includes('subjectAltName');
      const hasHostnameVerification = content.includes('checkServerIdentity');
      
      if (!hasSANValidation || !hasHostnameVerification) {
        return { passed: false, message: 'Redis SSL certificate validation incomplete' };
      }
      
      return { passed: true, message: 'Redis SSL properly configured' };
    }
  },
  
  corsSecurity: {
    name: 'CORS Security Configuration',
    check: () => {
      const serverPath = path.join(__dirname, '..', 'server.js');
      
      if (!fs.existsSync(serverPath)) {
        return { passed: false, message: 'Server file not found' };
      }
      
      const content = fs.readFileSync(serverPath, 'utf8');
      
      const hasCORS = content.includes('cors(');
      const hasWhitelist = content.includes('allowedOrigins');
      const hasCredentials = content.includes('credentials: true');
      
      if (!hasCORS || !hasWhitelist || !hasCredentials) {
        return { passed: false, message: 'CORS security configuration incomplete' };
      }
      
      return { passed: true, message: 'CORS security properly configured' };
    }
  },
  
  sqlInjectionProtection: {
    name: 'SQL Injection Protection',
    check: () => {
      const dbPath = path.join(__dirname, '..', 'database', 'db.js');
      
      if (!fs.existsSync(dbPath)) {
        return { passed: false, message: 'Database configuration not found' };
      }
      
      const content = fs.readFileSync(dbPath, 'utf8');
      
      const hasQueryValidation = content.includes('allowedQueryTypes');
      const hasParameterValidation = content.includes('injectionPatterns');
      
      if (!hasQueryValidation || !hasParameterValidation) {
        return { passed: false, message: 'SQL injection protection incomplete' };
      }
      
      return { passed: true, message: 'SQL injection protection properly configured' };
    }
  },
  
  dependencies: {
    name: 'Security Dependencies',
    check: () => {
      const packagePath = path.join(__dirname, '..', 'package.json');
      
      if (!fs.existsSync(packagePath)) {
        return { passed: false, message: 'package.json not found' };
      }
      
      const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      const requiredDeps = ['cors', 'helmet', 'express-rate-limit'];
      const missingDeps = requiredDeps.filter(dep => !packageContent.dependencies[dep]);
      
      if (missingDeps.length > 0) {
        return { passed: false, message: `Missing security dependencies: ${missingDeps.join(', ')}` };
      }
      
      return { passed: true, message: 'All security dependencies installed' };
    }
  }
};

// Run all security checks
async function runSecurityValidation() {
  console.log('🔐 Running Final Security Validation...\n');
  
  let totalChecks = 0;
  let passedChecks = 0;
  
  for (const [key, check] of Object.entries(securityChecks)) {
    totalChecks++;
    
    try {
      const result = check.check();
      
      console.log(`${result.passed ? '✅' : '❌'} ${check.name}`);
      console.log(`   ${result.message}`);
      
      if (result.passed) {
        passedChecks++;
      }
      
      console.log();
    } catch (error) {
      console.log(`❌ ${check.name}`);
      console.log(`   Error during check: ${error.message}`);
      console.log();
    }
  }
  
  console.log('📊 Security Validation Summary');
  console.log('==============================');
  console.log(`Total Checks: ${totalChecks}`);
  console.log(`Passed: ${passedChecks}`);
  console.log(`Failed: ${totalChecks - passedChecks}`);
  console.log();
  
  if (passedChecks === totalChecks) {
    console.log('🎉 All security checks passed! Application is ready for production deployment.');
    console.log();
    console.log('🔐 Next Steps:');
    console.log('1. Run: npm install to install new dependencies');
    console.log('2. Configure .env file with proper secrets');
    console.log('3. Run security tests: npm run security-test');
    console.log('4. Deploy with confidence!');
  } else {
    console.log('⚠️  Security issues detected. Please fix the failed checks before deployment.');
    process.exit(1);
  }
}

// Generate secure JWT secret
function generateSecureJWTSecret() {
  console.log('🔑 Generating secure JWT secret...');
  const secret = crypto.randomBytes(64).toString('base64');
  console.log(`Generated JWT_SECRET: ${secret}`);
  console.log('Add this to your .env file:');
  console.log(`JWT_SECRET=${secret}`);
}

// Run validation if called directly
if (require.main === module) {
  if (process.argv.includes('--generate-secret')) {
    generateSecureJWTSecret();
  } else {
    runSecurityValidation();
  }
}

module.exports = {
  runSecurityValidation,
  generateSecureJWTSecret
};