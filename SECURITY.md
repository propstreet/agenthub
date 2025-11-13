# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Vulnerability

We take the security of AgentHub seriously. If you discover a security vulnerability, please follow these guidelines:

### How to Report

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please report security issues by:

1. **Email**: Send details to [feedback@propstreet.com](mailto:feedback@propstreet.com)
2. **GitHub Security Advisories**: Use the "Security" tab on our GitHub repository to report privately

### What to Include

Please include as much of the following information as possible:

- **Type of vulnerability** (e.g., code execution, privilege escalation, data exposure)
- **Affected components** (e.g., HTTP transport, persistence, expert bridge)
- **Reproduction steps** - Clear, step-by-step instructions to reproduce the issue
- **Impact assessment** - How the vulnerability could be exploited
- **Suggested fix** - If you have one
- **Your contact information** - For follow-up questions

### Response Timeline

- **Acknowledgment**: Within 48 hours of report
- **Initial assessment**: Within 7 days
- **Status updates**: Every 7 days until resolved
- **Fix timeline**: Security patches prioritized based on severity

### Severity Levels

We use the following severity classifications:

**Critical** - Immediate action required
- Remote code execution
- Authentication bypass
- Data exposure of sensitive information

**High** - Fix within 7 days
- Privilege escalation
- Denial of service
- Information disclosure

**Medium** - Fix within 30 days
- Cross-site scripting (if applicable)
- Logic errors with security impact

**Low** - Fix in next release
- Minor information leaks
- Non-security-impacting bugs

## Security Best Practices

### Deployment

1. **Local-Only by Default**
   - AgentHub is designed to run on `localhost` only
   - Never expose the HTTP endpoint to public networks
   - Use firewalls to restrict access if needed

2. **Environment Variables**
   - Never commit `.env` files to version control
   - Rotate Azure OpenAI API keys regularly
   - Use environment-specific credentials

3. **Network Security**
   - CORS is restricted to `localhost` origins only
   - No authentication required for local-only usage
   - If exposing to network, add authentication layer

### Configuration

1. **Azure OpenAI Integration**
   - Store API keys in environment variables, not in code
   - Use Azure Key Vault for production deployments
   - Enable API key rotation
   - Monitor usage for anomalies

2. **Filesystem Watcher**
   - Only watch directories you control
   - Be cautious with `WATCH_ROOT` in shared environments
   - Review ignore patterns for sensitive files

3. **Persistence**
   - `.agenthub/` directory contains state snapshots
   - Ensure proper file permissions (user-only read/write)
   - Consider encrypting snapshots if storing sensitive data
   - Regularly clean up old snapshots

### Operational Security

1. **Message Content**
   - Don't send sensitive credentials via agent messages
   - Review message history before sharing logs
   - Message bus is in-memory only (not persisted by default)

2. **Expert Escalation**
   - Code sent to Azure OpenAI may be stored by Microsoft
   - Don't escalate files containing secrets
   - Review Azure OpenAI data retention policies

3. **Logs**
   - `LOG_LEVEL=debug` may expose sensitive information
   - Sanitize logs before sharing
   - Rotate logs in production environments

## Known Security Considerations

### By Design

1. **No Authentication** - AgentHub assumes trusted local environment
2. **In-Memory State** - No built-in encryption (use OS-level encryption)
3. **HTTP Transport** - No TLS required for localhost (use reverse proxy if needed)

### Mitigations

- **Local-Only**: Default configuration prevents external access
- **CORS Restrictions**: Only `localhost` origins allowed
- **Input Validation**: All operations validated with Zod schemas
- **Resource Limits**: Configurable limits prevent resource exhaustion

## Vulnerability Disclosure Policy

### Coordinated Disclosure

We follow a coordinated disclosure process:

1. **Private reporting** to security team
2. **Acknowledgment and investigation** (48 hours)
3. **Fix development** (timeline based on severity)
4. **Security advisory** published after fix is available
5. **Public disclosure** after users have time to update (typically 7-14 days)

### Credit

We will credit security researchers in:
- Security advisories
- Release notes
- CHANGELOG.md

Please let us know how you'd like to be credited (name, handle, company, or anonymous).

## Security Updates

Subscribe to security updates:

- **GitHub Watch**: Enable "Security alerts" on the repository
- **Release Notes**: Check CHANGELOG.md for security patches
- **GitHub Security Advisories**: Follow our security advisories

## Scope

### In Scope

- AgentHub server codebase (`src/server/`)
- Dashboard codebase (`src/dashboard/`)
- HTTP transport layer
- MCP protocol implementation
- Configuration and environment handling

### Out of Scope

- Third-party dependencies (report to upstream projects)
- Azure OpenAI service (report to Microsoft)
- MCP client implementations (report to client maintainers)
- Local development environment issues

## Contact

For security concerns, contact:
- **Email**: feedback@propstreet.com
- **GitHub**: Use Security tab for private vulnerability reports

For general inquiries:
- **Issues**: https://github.com/propstreet/agenthub/issues
- **Discussions**: https://github.com/propstreet/agenthub/discussions

---

**Last Updated**: November 13, 2025

Thank you for helping keep AgentHub secure!
