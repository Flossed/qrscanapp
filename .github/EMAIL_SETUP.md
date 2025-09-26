# Email Notification Setup for Trivy Security Scans

## Overview
This guide explains how to configure email notifications for Trivy security scan reports. The workflow supports multiple email providers.

## Choose Your Email Provider

### Option 1: SMTP (Gmail, Outlook, Custom)
Most common and flexible option.

#### Gmail Setup:
1. Go to GitHub repository → Settings → Secrets and variables → Actions
2. Add these secrets:
   - `SMTP_SERVER`: smtp.gmail.com
   - `SMTP_PORT`: 587
   - `SMTP_USERNAME`: your-email@gmail.com
   - `SMTP_PASSWORD`: Your app-specific password (see below)
   - `SMTP_FROM_EMAIL`: your-email@gmail.com
   - `SECURITY_EMAIL`: recipient@example.com

**Gmail App Password:**
1. Enable 2-factor authentication on your Google account
2. Go to https://myaccount.google.com/apppasswords
3. Generate an app-specific password
4. Use this password for `SMTP_PASSWORD`

#### Outlook/Office365 Setup:
1. Add these secrets:
   - `SMTP_SERVER`: smtp.office365.com
   - `SMTP_PORT`: 587
   - `SMTP_USERNAME`: your-email@outlook.com
   - `SMTP_PASSWORD`: Your password
   - `SMTP_FROM_EMAIL`: your-email@outlook.com
   - `SECURITY_EMAIL`: recipient@example.com

#### Custom SMTP Server:
1. Add these secrets:
   - `SMTP_SERVER`: your.smtp.server
   - `SMTP_PORT`: 587 (or your port)
   - `SMTP_USERNAME`: username
   - `SMTP_PASSWORD`: password
   - `SMTP_FROM_EMAIL`: sender@yourdomain.com
   - `SECURITY_EMAIL`: recipient@example.com

### Option 2: SendGrid
Professional email service with better deliverability.

1. Create SendGrid account: https://sendgrid.com
2. Generate API key: Settings → API Keys
3. Add these secrets:
   - `SENDGRID_API_KEY`: Your API key
   - `SENDGRID_FROM_EMAIL`: verified-sender@yourdomain.com
   - `SECURITY_EMAIL`: recipient@example.com

### Option 3: AWS SES (Simple Email Service)
Best for AWS users.

1. Set up AWS SES in your AWS account
2. Verify sender email address
3. Add these secrets:
   - `AWS_ACCESS_KEY_ID`: Your AWS access key
   - `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
   - `AWS_REGION`: us-east-1 (or your region)
   - `SES_FROM_EMAIL`: verified-sender@yourdomain.com
   - `SECURITY_EMAIL`: recipient@example.com

## Adding Secrets to GitHub

1. Navigate to your repository on GitHub
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret with its name and value

## Testing the Email Workflow

### Manual Test:
1. Go to **Actions** tab in your repository
2. Select **"Trivy Security Scan with Email Report"**
3. Click **"Run workflow"**
4. Options:
   - Send email report: Choose 'true'
   - Email recipient: Leave empty for default or enter test email
5. Click **"Run workflow"**

### Automatic Triggers:
- **Daily**: Runs at 2 AM UTC and sends email
- **On Push**: Runs on push to master (email optional)
- **On PR**: Runs on pull requests (no email by default)

## Email Report Contents

Each email includes:
- **HTML Email Body**: Formatted summary with statistics
- **Attachments**:
  - `trivy-report.html`: Interactive HTML report
  - `trivy-report.txt`: Plain text detailed findings
  - `summary.txt`: Quick statistics overview

## Customizing Email Behavior

### Change Email Recipients:
Edit the workflow file and modify:
```yaml
env:
  DEFAULT_EMAIL: ${{ secrets.SECURITY_EMAIL }}
```

Or add multiple recipients:
```yaml
to: 'email1@example.com,email2@example.com'
```

### Change Email Schedule:
Edit the cron schedule in the workflow:
```yaml
schedule:
  - cron: '0 2 * * *'  # Daily at 2 AM UTC
```

Common schedules:
- Daily at 9 AM: `'0 9 * * *'`
- Weekly on Monday: `'0 9 * * 1'`
- Monthly on 1st: `'0 9 1 * *'`

### Conditional Emails:
Only send email if critical vulnerabilities found:
```yaml
if: ${{ steps.scan_stats.outputs.critical_count != '0' }}
```

## Troubleshooting

### Email not sending:
1. Check Actions logs for errors
2. Verify all required secrets are set
3. Check spam folder
4. Verify sender email is authorized

### Gmail specific issues:
- Use app-specific password, not regular password
- Enable "Less secure app access" if needed
- Check for 2FA requirements

### SendGrid issues:
- Verify sender domain/email
- Check API key permissions
- Review SendGrid activity feed

### AWS SES issues:
- Verify sender email in SES
- Check if in sandbox mode (limited recipients)
- Review IAM permissions

## Security Best Practices

1. **Never commit credentials** - Always use GitHub Secrets
2. **Use dedicated email accounts** for automated reports
3. **Rotate credentials regularly**
4. **Limit recipient list** to necessary personnel
5. **Review email logs** for delivery issues

## Support

For issues with:
- **Workflow**: Check GitHub Actions logs
- **Email provider**: Consult provider documentation
- **Trivy scans**: See Trivy documentation

## Example Secret Configuration

Here's a complete example for Gmail:

```bash
# Required secrets for Gmail SMTP
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=security-reports@yourcompany.com
SMTP_PASSWORD=abcd-efgh-ijkl-mnop  # App-specific password
SMTP_FROM_EMAIL=security-reports@yourcompany.com
SECURITY_EMAIL=security-team@yourcompany.com
```

Once configured, you'll receive professional security reports automatically!