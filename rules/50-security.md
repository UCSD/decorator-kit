---
title: Security
trigger: always_on
order: 50
---

Bound by UC San Diego information security policy, UC Systemwide Policy IS-3,
and the Minimum Network Security Standards (PPM 135-3).

## Data protection

- **Classification:** treat unknown data as sensitive. Handle PII, FERPA-protected
  student data, and health data at the highest applicable precaution.
- **Encryption in transit:** HTTPS/TLS everywhere. Never transmit credentials or
  sensitive data in plaintext. Decorator assets are loaded over `https://` — do
  not downgrade a URL to `http://`, including ones copied from older templates.
- **Secrets:** never hardcode API keys, passwords, database credentials, or
  tokens in source. Use environment variables or a secrets manager.

## Vulnerability prevention

- **Injection:** parameterized queries or an ORM. Never string-concatenate SQL.
- **XSS:** sanitize and context-encode all user input before rendering. This
  applies to markup injected into the canvas at runtime.
- **CSRF:** anti-CSRF tokens on every state-changing request.
- **Dependencies:** reputable libraries at current patched versions.

## Identity and access

- Prefer campus Single Sign-On (Active Directory) over custom credential stores.
- Principle of least privilege for processes, databases, and service accounts.
- Validate authorization on every request; assume the network is hostile.

## Logging

- Emit audit records for authentication attempts, authorization failures, and
  administrative actions.
- Never log passwords, session identifiers, tokens, or financial data.

## Third-party embeds

Campus widgets load from `cdn.ucsd.edu`. Do not proxy, self-host, or rehost them
— that moves a campus-controlled dependency under project control and breaks the
security review it was granted under.
