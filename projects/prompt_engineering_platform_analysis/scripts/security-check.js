#!/usr/bin/env node
/**
 * Security Validation Script
 * Validates critical security fixes for audit findings SEC-2025-001, SEC-2025-002, SEC-2025-003
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('🔐 Security Validation - Critical Audit Response');
console.log('===============================================\n');

let passed = 0;
let failed = 0;
let warnings = 0;

const check = (condition, message, details = '') => {
    if (condition) {
        console.log(`✅ ${message}`);
        passed++;
    } else {
        console.error(`❌ ${message}`);
        if (details) console.error(`   ${details}`);
        failed++;
    }
};

const warn = (condition, message, details = '') => {
    if (!condition) {
        console.warn(`⚠️  ${message}`);
        if (details) console.warn(`   ${details}`);
        warnings++;
    }
};

// Test 1: JWT Secret Security
console.log('1. JWT Secret Security Check');
console.log('---------------------------');

const jwtSecret = process.env.JWT_SECRET;
check(
    jwtSecret && jwtSecret !== 'your_jwt_secret',
    'JWT_SECRET is not hardcoded',
    `Current: ${jwtSecret ? 'Environment variable' : 'Not set - using fallback'}`
);

if (jwtSecret) {
    check(
        jwtSecret.length >= 32,
        `JWT_SECRET meets minimum length (32 chars)`,
        `Length: ${jwtSecret.length}`
    );
} else {
    warn(
        false,
        'JWT_SECRET not set in environment',
        'Set JWT_SECRET environment variable for production'
    );
}

// Test 2: Environment Configuration
console.log('\n2. Environment Configuration Check');
console.log('---------------------------------');

const envExamplePath = path.join(__dirname, '../.env.example');
check(
    fs.existsSync(envExamplePath),
    '.env.example file exists',
    'Required for security configuration'
);

if (fs.existsSync(envExamplePath)) {
    const envContent = fs.readFileSync(envExamplePath, 'utf8');
    const requiredVars = ['JWT_SECRET', 'DATABASE_URL', 'OPENAI_API_KEY'];
    
    requiredVars.forEach(varName => {
        check(
            envContent.includes(varName),
            `.env.example contains ${varName}`,
            'Required for security configuration'
        );
    });
}

// Test 3: Security Middleware Files
console.log('\n3. Security Middleware Check');
console.log('---------------------------');

const middlewareFiles = [
    'src/middleware/authMiddleware.js',
    'src/middleware/promptInjectionMiddleware.js',
    'src/middleware/rateLimitMiddleware.js'
];

middlewareFiles.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    check(
        fs.existsSync(filePath),
        `${file} exists`,
        'Required for security implementation'
    );
});

// Test 4: Package Dependencies
console.log('\n4. Security Dependencies Check');
console.log('-----------------------------');

const packagePath = path.join(__dirname, '../package.json');
check(
    fs.existsSync(packagePath),
    'package.json exists'
);

if (fs.existsSync(packagePath)) {
    const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    const securityDeps = [
        'express-rate-limit',
        'helmet',
        'winston',
        'ioredis'
    ];
    
    securityDeps.forEach(dep => {
        check(
            packageContent.dependencies[dep],
            `Security dependency ${dep} is included`,
            'Required for security features'
        );
    });
}

// Test 5: Prompt Injection Patterns
console.log('\n5. Prompt Injection Protection Check');
console.log('-----------------------------------');

const promptInjectionPath = path.join(__dirname, '../src/middleware/promptInjectionMiddleware.js');
if (fs.existsSync(promptInjectionPath)) {
    const content = fs.readFileSync(promptInjectionPath, 'utf8');
    
    const patterns = [
        'system\\s*:',
        'ignore\\s+previous\\s+instructions',
        'javascript\\s*:',
        'drop\\s+table',
        'admin\\s+password'
    ];
    
    patterns.forEach(pattern => {
        check(
            content.includes(pattern) || content.toLowerCase().includes(pattern.toLowerCase()),
            `Prompt injection pattern "${pattern}" is detected`,
            'Required for injection protection'
        );
    });
}

// Test 6: File Content Checks
console.log('\n6. Content Security Checks');
console.log('-------------------------');

const authFilePath = path.join(__dirname, '../src/auth/auth.js');
if (fs.existsSync(authFilePath)) {
    const authContent = fs.readFileSync(authFilePath, 'utf8');
    
    check(
        !authContent.includes("'your_jwt_secret'"),
        'Hardcoded JWT secret removed from auth.js',
        'Critical security fix'
    );
    
    check(
        authContent.includes('process.env.JWT_SECRET'),
        'JWT_SECRET uses environment variable',
        'Environment-based configuration'
    );
}

// Summary
console.log('\n===============================================');
console.log('Security Validation Summary');
console.log('===============================================');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`⚠️  Warnings: ${warnings}`);
console.log('');

if (failed > 0) {
    console.error('🔥 CRITICAL: Security issues detected!');
    console.error('Please address all failed checks before deployment.');
    process.exit(1);
} else if (warnings > 0) {
    console.warn('⚠️  WARNING: Security warnings detected.');
    console.warn('Review warnings and consider addressing before production.');
} else {
    console.log('🎉 All security checks passed!');
    console.log('System is ready for production deployment.');
}

// Security recommendations
console.log('\n📋 Next Steps:');
console.log('1. Set JWT_SECRET environment variable: export JWT_SECRET=$(openssl rand -base64 32)');
console.log('2. Copy .env.example to .env and configure all values');
console.log('3. Install new dependencies: npm install');
console.log('4. Run security tests: npm run security-check');
console.log('5. Review SECURITY_UPDATE.md for complete security guide');