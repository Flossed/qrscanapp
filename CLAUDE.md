# QR Scanner Application - Development Notes

## Process Management

### Killing Node.js Processes on Windows
When the server becomes unresponsive or needs to be forcefully stopped:

1. Find the process ID:
   ```cmd
   netstat -ano | findstr :3000
   ```

2. Kill the process using PowerShell:
   ```powershell
   Stop-Process -Id <PID> -Force
   ```
   Example: `Stop-Process -Id 14572 -Force`

3. Alternative using Command Prompt:
   ```cmd
   taskkill /F /PID <PID>
   ```
### Release Process
**For official releases only** (regular commits follow normal workflow):

1. **Update documentation with release information:**
   - Update README.md with current version and timestamp from package.json
   - Update CHANGELOG.md with current version, timestamp, and all changes since most recent tag
   - Document all commits and changes from the previous tagged release

2. **Stage and commit release changes:**
   ```bash
   git add .
   git commit -m "Release v[VERSION]: [DESCRIPTION OF CHANGES]"
   ```

3. **Tag the release commit:**
   ```bash
   git tag v[VERSION]  # Use exact version from package.json
   ```

4. **Push to origin:**
   ```bash
   git push origin main
   git push origin --tags
   ```

5. **Prepare for next development cycle:**
   - Increment version in package.json for next development iteration

**Note:** This process is only for official releases. Regular development commits follow standard workflow without version updates or tagging.
## Development Commands

### Start Server
```bash
npm start
```

### Test Commands
```bash
npm test
npm run lint
npm run typecheck
```