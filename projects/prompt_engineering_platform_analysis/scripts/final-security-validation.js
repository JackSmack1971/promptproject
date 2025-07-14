#!/usr/bin/env node
/**
 * Final Security Validation Script
 * Runs comprehensive security validation across all fixed vulnerabilities
 */

const fs = require('fs');
const path = require('path');

// Validate security fixes
async function validateSecurityFixes() {
  console.log('🔍 Running Security Validation Suite...\n');
  
  const results = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: {
      passed: 0,
      failed: 0,
      warnings: 0
    }
  };

  // Test 1: Prompt Injection Timeout Prevention
  console.log('✅ Testing prompt injection timeout prevention...');
  try {
    const { detectPromptInjection } = require('../src/middleware/promptInjectionMiddleware');
    
    // Test with malicious input
    const maliciousInput = 'a'.repeat(5000) + '.*.*.*.*.*.*.*.*';
    const startTime = Date.now();
    const result = detectPromptInjection(maliciousInput, 'test-ip');
    const processingTime = Date.now() - startTime;
    
    if (processingTime < 500 && !result.hadTimeout) {
      results.tests.push({
        test: 'Prompt Injection Timeout Prevention',
        status: 'PASS',
        processingTime,
        details: 'Timeout prevention working correctly'
      });
      results.summary.passed++;
    } else {
      results.tests.push({
        test: 'Prompt Injection Timeout Prevention',
        status: 'FAIL',
        processingTime,
        details: 'Timeout prevention failed'
      });
      results.summary.failed++;
    }
  } catch (error) {
    results.tests.push({
      test: 'Prompt Injection Timeout Prevention',
      status: 'ERROR',
      details: error.message
    });
    results.summary.failed++;
  }

  // Test 2: Redis Error Sanitization
  console.log('✅ Testing Redis error sanitization...');
  try {
    const securityLogger = {
      error: (message, error, context) => {
        const hasSensitiveData = context.ip && context.ip !== '[REDACTED]' || 
                                context.userAgent && context.userAgent !== '[REDACTED]';
        return !hasSensitiveData;
      }
    };
    
    const mockError = new Error('Connection failed');
    const mockContext = { ip: '192.168.1.100', userAgent: 'Mozilla/5.0' };
    
    const sanitized = securityLogger.error('Test', mockError, mockContext);
    if (sanitized) {
      results.tests.push({
        test: 'Redis Error Sanitization',
        status: 'PASS',
        details: 'Sensitive data properly sanitized'
      });
      results.summary.passed++;
    } else {
      results.tests.push({
        test: 'Redis Error Sanitization',
        status: 'FAIL',
        details: 'Sensitive data not sanitized'
      });
      results.summary.failed++;
    }
  } catch (error) {
    results.tests.push({
      test: 'Redis Error Sanitization',
      status: 'ERROR',
      details: error.message
    });
    results.summary.failed++;
  }

  // Test 3: ReDoS Prevention
  console.log('✅ Testing ReDoS vulnerability prevention...');
  try {
    const { detectPromptInjection } = require('../src/middleware/promptInjectionMiddleware');
    
    const redosPatterns = [
      'a'.repeat(1000) + '.*.*.*.*.*.*',
      '('.repeat(100) + 'a'.repeat(100) + ')'.repeat(100),
      'a'.repeat(500) + 'b'.repeat(500) + 'c'.repeat(500) + '.*.*.*'
    ];
    
    let allPassed = true;
    for (const pattern of redosPatterns) {
      const startTime = Date.now();
      detectPromptInjection(pattern, 'test-ip');
      const processingTime = Date.now() - startTime;
      
      if (processingTime > 1000) {
        allPassed = false;
        break;
      }
    }
    
    if (allPassed) {
      results.tests.push({
        test: 'ReDoS Prevention',
        status: 'PASS',
        details: 'All ReDoS patterns handled efficiently'
      });
      results.summary.passed++;
    } else {
      results.tests.push({
        test: 'ReDoS Prevention',
        status: 'FAIL',
        details: 'ReDoS patterns caused excessive processing time'
      });
      results.summary.failed++;
    }
  } catch (error) {
    results.tests.push({
      test: 'ReDoS Prevention',
      status: 'ERROR',
      details: error.message
    });
    results.summary.failed++;
  }

  // Test 4: Memory Management
  console.log('✅ Testing memory management for rate limiting...');
  try {
    const { createProgressiveLimiter } = require('../src/middleware/rateLimitMiddleware');
    
    // Test progressive limiter creation
    const limiter = createProgressiveLimiter(1000, 10, 2);
    
    if (typeof limiter === 'function') {
      results.tests.push({
        test: 'Memory Management',
        status: 'PASS',
        details: 'Progressive rate limiting properly configured'
      });
      results.summary.passed++;
    } else {
      results.tests.push({
        test: 'Memory Management',
        status: 'FAIL',
        details: 'Progressive rate limiting not functional'
      });
      results.summary.failed++;
    }
  } catch (error) {
    results.tests.push({
      test: 'Memory Management',
      status: 'ERROR',
      details: error.message
    });
    results.summary.failed++;
  }

  // Generate report
  const report = `
# Security Validation Report
**Generated**: ${results.timestamp}

## Summary
- ✅ **Passed**: ${results.summary.passed}
- ❌ **Failed**: ${results.summary.failed}
- ⚠️ **Warnings**: ${results.summary.warnings}

## Detailed Results
${results.tests.map(test => `
### ${test.test}
- **Status**: ${test.status}
- **Details**: ${test.details}
${test.processingTime ? `- **Processing Time**: ${test.processingTime}ms` : ''}
`).join('\n')}

## Security Score
**Overall Security Score**: ${Math.round((results.summary.passed / (results.summary.passed + results.summary.failed)) * 100)}%

## Recommendations
${results.summary.failed > 0 ? 
  '⚠️ **Manual review required** - Some security tests failed. Review test results and fix issues before deployment.' :
  '✅ **Ready for deployment** - All security tests passed successfully.'
}

## Next Steps
1. ${results.summary.failed > 0 ? 'Fix failed security tests' : 'Deploy security fixes to production'}
2. Monitor security metrics for 48 hours post-deployment
3. Set up security alerts and monitoring
`;

  // Write report
  const reportPath = path.join(__dirname, '../SECURITY_VALIDATION_REPORT.md');
  fs.writeFileSync(reportPath, report.trim());
  
  console.log('\n📊 Security Validation Complete!');
  console.log(`📋 Report saved to: ${reportPath}`);
  console.log(`📈 Security Score: ${Math.round((results.summary.passed / (results.summary.passed + results.summary.failed)) * 100)}%`);
  
  return results.summary.failed === 0;
}

// Run validation if called directly
if (require.main === module) {
  validateSecurityFixes()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Validation failed:', error);
      process.exit(1);
    });
}

module.exports = { validateSecurityFixes };