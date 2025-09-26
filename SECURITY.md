# Security Policy

## Supported Versions

Currently supported versions for security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |
| 0.3.x   | :white_check_mark: |
| < 0.3   | :x:                |

## Automated Security Scanning

This repository uses automated security scanning with Trivy:

- **On every push to master**: Full vulnerability, secret, and misconfiguration scan
- **On every pull request**: Security scan with results posted as PR comment
- **Daily scheduled scan**: Automatic security check at 2 AM UTC
- **Weekly comprehensive report**: Detailed report every Monday with issue creation for critical findings

### Scan Coverage

Our Trivy scans check for:
- 🔍 **Vulnerabilities** in dependencies (npm packages)
- 🔑 **Secrets** accidentally committed to the repository
- ⚙️ **Misconfigurations** in code and configuration files
- 📜 **License** compliance (weekly scans)

## Reporting a Vulnerability

### For Security Vulnerabilities

Please **DO NOT** report security vulnerabilities through public GitHub issues.

Instead, please report them by:
1. Email to: [your-security-email@example.com]
2. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if available)

### Response Time

- **Critical vulnerabilities**: Response within 24 hours
- **High vulnerabilities**: Response within 72 hours
- **Medium/Low vulnerabilities**: Response within 1 week

## Security Best Practices

When contributing to this project:

1. **Never commit secrets** (API keys, passwords, tokens)
2. **Keep dependencies updated** - Run `npm audit` regularly
3. **Review Trivy scan results** in Pull Requests
4. **Follow secure coding practices** for EHIC data handling
5. **Use environment variables** for sensitive configuration

## Viewing Security Reports

### GitHub Security Tab
- Navigate to the Security tab to view all Trivy findings
- SARIF format results are automatically uploaded

### Workflow Artifacts
- Download detailed reports from Actions → Workflow runs → Artifacts
- Reports are retained for 30 days (90 days for weekly reports)

### Pull Request Comments
- Security summary automatically posted on PRs
- Shows count of CRITICAL and HIGH vulnerabilities

## Vulnerability Management

### Trivy Ignore File
The `.trivyignore` file is used to:
- Exclude false positives
- Temporarily accept known risks with expiry dates
- Skip scanning of test files and documentation

### Remediation Priority
1. **CRITICAL**: Fix immediately
2. **HIGH**: Fix within current sprint
3. **MEDIUM**: Fix within current release
4. **LOW**: Fix as time permits

## Contact

For security concerns, contact:
- Security Team: [security-email]
- Project Maintainer: [maintainer-email]

## Additional Resources

- [Trivy Documentation](https://aquasecurity.github.io/trivy/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [npm Security Best Practices](https://docs.npmjs.com/packages-and-modules/securing-your-code)