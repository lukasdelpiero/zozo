# ZoZo — Security Engineering Standard for Claude Code

> **Status:** Mandatory engineering guidance
> **Audience:** Claude Code and any developer modifying the ZoZo codebase
> **Application:** ZoZo web application, APIs, database, storage, authentication, deployment, WebView2 client and future AI features
> **Research basis:** IBM Think cybersecurity articles supplied for ZoZo, ANPD guidance/regulation, and current OWASP application-security guidance
> **Research date:** 2026-10-07

---

## 0. Mission

ZoZo is a personal-finance application. It must be designed as a security-sensitive web application, not as a static website with a login bolted on later.

Claude Code MUST treat security as a cross-cutting requirement covering:

- confidentiality of user and financial data;
- integrity of transactions, balances, budgets and account information;
- availability and recovery of the service;
- authentication, authorization and session security;
- secure handling of browsers, WebView2, APIs, databases and cloud services;
- protection against common web attacks and abuse;
- privacy and LGPD obligations;
- detection, logging, incident response and recovery;
- secure software supply chain and dependency management;
- security of any AI assistant integrated into ZoZo.

The security objective is **defense in depth**: no single control must be assumed sufficient. IBM describes cybersecurity as prevention and mitigation across systems, applications, devices, data and people, and explicitly emphasizes layered defenses capable of preventing, detecting and responding to attacks. [IBM — Guia da Cibersegurança](https://www.ibm.com/br-pt/think/cybersecurity)

---

# 1. Non-negotiable rules

These rules override convenience.

## 1.1 Never trust the client

The browser, WebView2 client, JavaScript state, hidden fields, disabled buttons, localStorage, URL parameters and request payloads are **untrusted input**.

Security decisions MUST be enforced server-side.

Examples:

- A user interface hiding an "edit" button does not authorize anything.
- A request containing `userId=123` does not prove the requester owns user 123.
- A client-provided `accountId`, `transactionId`, `profileId` or `permission` MUST be authorized on the server.
- A client-provided total, balance or installment amount MUST NOT become authoritative without server-side validation/recalculation.

This is aligned with IBM's IAM model: authentication establishes identity, while authorization determines what the identity is allowed to do. IBM also emphasizes least privilege. [IBM — IAM](https://www.ibm.com/br-pt/think/topics/identity-access-management)

## 1.2 Default deny

Every new protected resource, route, API endpoint, database operation and administrative action starts as **denied** until explicitly authorized.

Do not implement authorization using a positive list of exceptions scattered throughout the code. Centralize policies where possible.

## 1.3 Least privilege

Users, service accounts, database users, API keys and cloud workloads MUST have only the permissions required for the task.

Permissions SHOULD be reviewed periodically and revoked when no longer required. IBM explicitly identifies least privilege as a core IAM principle. [IBM — IAM](https://www.ibm.com/br-pt/think/topics/identity-access-management)

## 1.4 No secrets in source code

Never commit:

- API keys;
- database passwords;
- Cloudflare tokens;
- OAuth client secrets;
- private keys;
- encryption keys;
- JWT signing secrets;
- webhook secrets;
- service-account credentials;
- production connection strings containing credentials.

Use environment/secret-management facilities appropriate to the deployment platform.

## 1.5 Never put credentials in browser storage

Do NOT store authentication tokens, session IDs, refresh tokens or credentials in `localStorage` or `sessionStorage`.

For a cookie-based web session, prefer a server-generated session identifier in a cookie such as:

```http
Set-Cookie: __Host-ZoZoSession=<opaque-random-value>; Secure; HttpOnly; SameSite=Strict; Path=/
```

Use `SameSite=Lax` when a documented product flow requires it. Never use `SameSite=None` without `Secure`.

OWASP specifically warns against browser storage for authentication tokens and recommends secure, HttpOnly cookie-based sessions or an appropriate BFF architecture. [OWASP — Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

## 1.6 Do not trust obscurity

Do not treat the following as security controls:

- secret URLs;
- hidden API routes;
- obscured IDs alone;
- minified JavaScript;
- disabled UI controls;
- client-side encryption using a hardcoded key;
- Cloudflare Access protecting the public product by accident rather than intentionally.

---

# 2. ZoZo threat model

Claude Code SHOULD use this threat model whenever it proposes architecture or modifies security-sensitive functionality.

## 2.1 Valuable assets

Treat the following as protected assets:

| Asset | Classification | Security requirement |
|---|---|---|
| User identity/profile | Personal data | Access controlled, minimized, audited |
| Email / username | Personal data | Never exposed unnecessarily |
| Password verifier | Authentication secret material | Strong password hashing; never plaintext |
| Active sessions | Authentication material | Secure cookie; revocation; expiry |
| Financial transactions | Financial/personal data | Strong authorization and integrity checks |
| Accounts/cards/wallets | Financial/personal data | Strong authorization |
| Budgets/goals/categories | Personal/financial data | Owner-scoped access |
| Bills/invoices/receivables | Financial/personal data | Owner-scoped access |
| AI prompts/context | Potentially sensitive personal/financial data | Data minimization and strict isolation |
| AI outputs/actions | Potentially high-impact application output | Treat as untrusted and non-authoritative |
| Audit/security logs | Potentially personal/security-sensitive | Redaction, access control, retention |
| Backups | High-value copy of user data | Encryption, restricted access, tested recovery |
| Cloud credentials/secrets | Critical secrets | Secret manager; never client-side |

**Important legal classification:** financial information is highly security-relevant and is explicitly considered by ANPD incident-risk guidance, but it is not automatically a "sensitive personal data" category under LGPD merely because it is financial. Do not use the legal term "sensitive data" casually.

ANPD states that incident assessment considers, among other factors, financial data and authentication data because of the potential risk to data subjects. [ANPD — Comunicação de Incidente de Segurança](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aprova-o-regulamento-de-comunicacao-de-incidente-de-seguranca)

## 2.2 Threat actors

Plan for at least these actors:

1. Anonymous internet attacker.
2. Credential-stuffing attacker using leaked passwords.
3. Phishing/social-engineering attacker.
4. Attacker exploiting XSS/CSRF/IDOR/injection/misconfiguration.
5. Malicious or compromised browser extension.
6. Malware on a user's endpoint.
7. Compromised user account.
8. Malicious or compromised third-party dependency/service.
9. Abusive authenticated user attempting to access another user's data.
10. Compromised administrator or over-privileged service account.
11. Attacker abusing AI features or attempting prompt injection/data exfiltration.
12. Insider with legitimate access exceeding their intended purpose.

IBM notes that modern attacks exploit both technology and people, including malware, social engineering, unpatched applications, and misconfigured cloud services. [IBM — Ataque cibernético](https://www.ibm.com/br-pt/think/topics/cyber-attack)

## 2.3 Primary ZoZo attack scenarios

At minimum, design and test against:

- account takeover;
- credential stuffing and brute-force login abuse;
- password-reset abuse;
- session theft/fixation;
- XSS (stored, reflected and DOM-based);
- CSRF;
- broken object-level authorization (IDOR/BOLA);
- broken function-level authorization;
- SQL/NoSQL injection or equivalent query injection;
- command injection;
- SSRF where server-side URL fetching exists;
- malicious file upload;
- insecure direct download/export;
- path traversal;
- open redirects;
- CORS misconfiguration;
- clickjacking;
- cache leakage;
- sensitive data exposure in logs;
- secret leakage in client bundles/source maps;
- insecure webhooks;
- dependency/package compromise;
- supply-chain attacks;
- DDoS/resource exhaustion;
- data corruption or unauthorized transaction modification;
- backup compromise;
- AI prompt injection and unauthorized AI actions.

IBM's cybersecurity taxonomy explicitly covers attack vectors such as phishing, malware, DDoS, brute force, MITM, zero-day vulnerabilities, insider threats and lateral movement. [IBM — Cybersecurity](https://www.ibm.com/br-pt/think/cybersecurity)

---

# 3. Security architecture for ZoZo

Use a layered architecture. Exact cloud products may change, but the security boundaries must remain.

```text
Internet / Browser / WebView2
        |
        v
DNS + TLS + CDN/WAF/Rate Limiting (e.g. Cloudflare)
        |
        v
Web application / frontend
        |
        v
Server-side API / BFF
        |
        +---- Authentication + Session layer
        |
        +---- Authorization / policy layer
        |
        +---- Business rules / validation
        |
        v
Database / durable storage
        |
        +---- encrypted backups
        |
        +---- audit/security event store
        |
        +---- object/file storage if required

Secrets/configuration --> secret-management service
Monitoring/logging ----> protected observability platform
CI/CD -----------------> security gates + signed/reproducible artifacts where practical
```

### Architecture rules

- The frontend MUST NOT have direct unrestricted access to the production database.
- Database credentials MUST never reach the browser.
- Sensitive business logic MUST reside server-side.
- Authorization MUST happen before returning or mutating a protected resource.
- Database queries MUST be parameterized or use a safe ORM/query builder.
- Production and development environments MUST be isolated.
- Administrative tools MUST have separate access controls from normal end-user access.
- Backups MUST have credentials and access controls separate from application runtime credentials.

IBM describes cloud security as the combination of procedures and technologies needed to address external and internal threats in cloud environments. [IBM — Cloud Security](https://www.ibm.com/br-pt/think/topics/cloud-security)

---

# 4. Public ZoZo vs. Cloudflare Access

ZoZo is intended to be an end-user product. Do not accidentally require a Cloudflare Access/Zero Trust identity login in front of the entire public application unless that is an explicit product decision.

## 4.1 Production end-user access

For the public ZoZo product:

- end users should authenticate through ZoZo's application authentication/identity layer;
- authorization belongs to the application/API;
- Cloudflare should be used as an infrastructure security layer where appropriate: TLS, WAF, rate limiting, bot protection, DDoS protection, DNS, caching and edge controls.

## 4.2 Cloudflare Access is appropriate for

Cloudflare Access can be appropriate for:

- internal admin panels;
- private staging environments;
- operational dashboards;
- developer tools;
- deployment controls;
- non-public infrastructure consoles.

Do not use an infrastructure/admin identity gate as a substitute for product authentication.

---

# 5. Authentication and IAM

IBM's IAM model centers on administration, authentication, authorization and auditing. It also notes that passwords are a weak basic factor and that MFA is widely used to strengthen authentication. [IBM — IAM](https://www.ibm.com/br-pt/think/topics/identity-access-management)

## 5.1 Passwords

If ZoZo supports passwords:

- never store plaintext passwords;
- never store password encryption that is reversible by the application as the normal credential verifier;
- use a modern adaptive password hashing function;
- prefer Argon2id;
- use a unique salt per password;
- tune parameters on the actual production hardware/runtime;
- add breach/password-strength defenses without forcing arbitrary rotation policies that harm usability;
- use secure password reset flows.

OWASP currently recommends Argon2id as the preferred password hashing algorithm and explicitly states that plaintext and fast hashes such as SHA-256 are inappropriate for password storage. [OWASP — Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

## 5.2 MFA

Support MFA for accounts and require/strongly encourage it for high-risk operations and administrative accounts.

Potential future options:

- passkeys/WebAuthn/FIDO2;
- authenticator-app TOTP;
- recovery codes.

Avoid using email-only recovery as the sole protection for highly sensitive account changes.

## 5.3 Login defenses

Implement:

- rate limiting per IP and account identifier;
- protection against credential stuffing;
- progressive delay or risk controls rather than permanent lockout that enables denial of service;
- generic authentication failure messages to reduce account enumeration;
- audit events for suspicious login behavior;
- notification/visibility for security-sensitive account events;
- reauthentication for sensitive actions where appropriate.

## 5.4 Password reset

Reset tokens MUST be:

- cryptographically random;
- single-use;
- short-lived;
- stored safely (prefer hashed in persistent storage when feasible);
- invalidated after use;
- invalidated after password change where appropriate.

Never put reusable reset credentials into logs or analytics.

## 5.5 Session management

Use opaque, random server-side session identifiers.

Session cookies SHOULD be:

- `Secure`;
- `HttpOnly`;
- `SameSite=Strict` where compatible, otherwise `Lax`;
- scoped to the narrowest path/domain;
- preferably prefixed with `__Host-` when deployment permits.

Regenerate the session after authentication and after privilege changes.

Terminate sessions on logout and provide server-side revocation.

Do not encode PII, roles, balances or other sensitive data directly into the session identifier.

OWASP recommends strong unpredictable session IDs, HTTPS for the full session, `Secure`, `HttpOnly`, `SameSite`, server-side session meaning, and explicit session lifecycle controls. [OWASP — Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

---

# 6. Authorization: the most important ZoZo rule

A finance application must assume attackers will manipulate IDs and requests.

## 6.1 Ownership model

Every user-owned resource MUST have an explicit ownership boundary, e.g.:

```text
user
  -> accounts
  -> cards
  -> transactions
  -> installments
  -> recurring entries
  -> bills
  -> goals
  -> profiles/tags
  -> reports
```

Every API operation must establish:

```text
authenticated user
        |
        v
resource exists?
        |
        v
resource belongs to this user / authorized tenant?
        |
        v
operation allowed for this role/state?
        |
        v
perform operation
```

## 6.2 Never trust object identifiers

This is forbidden:

```js
// INSECURE
const transaction = await db.transactions.findById(req.body.transactionId);
return transaction;
```

The query must include authorization context, conceptually:

```js
// SECURE CONCEPT
const transaction = await db.transactions.findOne({
  id: transactionId,
  ownerId: authenticatedUser.id
});
```

Apply the same principle to update, delete, export, download and report endpoints.

## 6.3 Authorization must be server-side

OWASP's secure code review guidance recommends server-side enforcement, fail-safe defaults and explicit prevention of IDOR/resource-access flaws. [OWASP — Secure Code Review](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html)

---

# 7. ZoZo financial-data integrity

ZoZo is not only protecting confidentiality. It must protect the correctness of financial information.

## 7.1 Never trust client-calculated financial results

The server should be authoritative for:

- transaction totals;
- installment values;
- recurring schedules;
- account balances;
- bill totals;
- report aggregation;
- transfer consistency;
- currency normalization rules;
- dates and accounting periods where business rules matter.

The client may calculate for display, but server-side calculations and validation determine authoritative state.

## 7.2 Atomic operations

Operations that affect multiple records MUST be atomic where the datastore supports transactions.

Examples:

- internal transfer between two accounts;
- payment that updates invoice and balance;
- creating an installment plan plus generated installments;
- reversing/deleting a transaction that has dependent records.

Avoid states where only half of a financial operation is committed.

## 7.3 Idempotency

For operations that may be retried, implement idempotency where appropriate.

Examples:

- imports;
- webhook processing;
- payment-like actions;
- sync jobs;
- bulk transaction creation.

A retry MUST NOT silently duplicate a financial transaction.

## 7.4 Concurrency

Protect against race conditions such as two browser tabs modifying the same record simultaneously.

Use appropriate transaction isolation, optimistic concurrency/versioning, or another explicit strategy.

---

# 8. Data security

IBM states that effective data security combines access and identity management, patching, backups/recovery, awareness, endpoint/network security and other layers. It also emphasizes protecting data against unauthorized access, corruption and theft. [IBM — Data Security](https://www.ibm.com/br-pt/think/topics/data-security)

## 8.1 Data minimization

Only collect data ZoZo needs.

For every new field ask:

1. Why is this data necessary?
2. What feature requires it?
3. What is the retention period?
4. Who can access it?
5. Is it exposed to analytics/AI/third parties?
6. Can it be derived instead of stored?
7. Can it be deleted or anonymized later?

## 8.2 Encryption in transit

Production traffic MUST use HTTPS/TLS.

Do not send authenticated or personal information over plain HTTP.

Use HSTS after validating deployment and subdomain requirements.

OWASP recommends HTTPS for the entire authenticated session rather than only the login request. [OWASP — Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

## 8.3 Encryption at rest

Use provider/database encryption at rest for production data and backups.

Highly sensitive secrets should use a dedicated secret/key-management mechanism where available.

Do not store an application-wide decryption key in the same database row/table as the ciphertext in a way that defeats the security boundary.

## 8.4 Tokenization and masking

Where a full value is unnecessary, store/use a token or masked representation.

Examples:

- do not log full authentication tokens;
- do not log password-reset tokens;
- do not log full session cookies;
- do not display unnecessary personal data in admin interfaces.

## 8.5 Database access

Database users should have narrowly scoped permissions.

Production applications should not use a superuser account.

Separate read and write capabilities where practical.

---

# 9. Web application security

Use OWASP Top 10:2025 as an additional web-security baseline. The current list includes broken access control, security misconfiguration, software supply-chain failures, cryptographic failures, injection, insecure design, authentication failures, software/data integrity failures, logging/alerting failures and mishandling exceptional conditions. [OWASP Top 10:2025](https://top10.owasp.org/2025/pt-BR/)

## 9.1 XSS

Prefer safe DOM APIs and framework escaping.

Avoid:

- unsanitized `innerHTML` with user data;
- unsafe template interpolation;
- executing user-controlled JavaScript;
- `eval` / `Function` for dynamic data;
- inline script when avoidable.

Content Security Policy SHOULD be deployed, starting with report-only mode if needed and moving toward enforcement.

A strict nonce- or hash-based CSP is preferred over a broad allowlist where practical. [OWASP — Content Security Policy](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)

## 9.2 CSRF

If authentication uses cookies, state-changing operations need CSRF protection appropriate to the architecture.

`SameSite` is defense in depth, not a reason to discard CSRF controls for cookie-authenticated state-changing requests.

## 9.3 Input validation

Validate at the server boundary.

Use:

- type validation;
- length limits;
- range limits;
- enum/allowlist validation;
- canonicalization where applicable;
- business-rule validation.

Validate both syntax and meaning.

Example: `amount = 1000000000` can be syntactically numeric but business-invalid.

## 9.4 Output encoding

Encode data for its output context:

- HTML;
- HTML attribute;
- URL;
- JavaScript string/context;
- CSS context.

Do not assume one sanitizer is suitable for every context.

## 9.5 SQL / query injection

Use parameterized queries or safe ORM/query builder APIs.

Never concatenate untrusted values into SQL.

The same principle applies to NoSQL, shell commands, LDAP, template engines and other interpreters.

## 9.6 File uploads

ZoZo should avoid file uploads unless a concrete feature requires them.

If files become necessary:

- validate size;
- validate actual content type/signature, not only extension;
- reject dangerous executable formats;
- rename files server-side;
- store outside executable web roots;
- isolate file processing;
- scan files where appropriate;
- restrict downloads with authorization checks;
- prevent path traversal;
- use signed/short-lived download URLs when appropriate.

---

# 10. Security headers

For production, review and configure at minimum:

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: <strict policy appropriate to ZoZo>
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: <minimal required capabilities>
```

Also prevent framing unless a legitimate business case exists, e.g. through CSP `frame-ancestors`.

Do not blindly copy a header policy from a tutorial. Verify every directive against the actual application and third-party resources.

---

# 11. CORS

Do not use:

```http
Access-Control-Allow-Origin: *
```

for authenticated private APIs.

Explicitly allow only the required origins.

Do not dynamically reflect arbitrary `Origin` values.

Treat CORS as a browser-enforcement mechanism, not authorization.

The server still must authorize every request.

---

# 12. Rate limiting and abuse prevention

Rate-limit at multiple layers where appropriate:

- login;
- registration;
- password reset/request reset;
- MFA verification;
- transaction creation;
- bulk import;
- exports;
- expensive reports;
- AI requests;
- file processing;
- public endpoints.

Prefer rate limits based on a combination of signals rather than IP-only controls when account-level abuse matters.

Cloudflare/WAF rate limiting can be a useful outer layer, but application-level controls are still required.

---

# 13. Malware and endpoint security

IBM defines malware as intentionally malicious software such as ransomware, trojans and spyware, and describes endpoints as critical attack-entry points. [IBM — Malware](https://www.ibm.com/br-pt/think/topics/malware) [IBM — Endpoint Security](https://www.ibm.com/br-pt/think/topics/endpoint-security)

## 13.1 ZoZo must assume compromised clients

A user's computer or phone can be compromised.

Therefore:

- do not attempt to keep irreversible secrets in frontend JavaScript;
- do not put database credentials in WebView2;
- do not trust local files as authoritative server state;
- do not trust client-side encryption whose key is shipped with the application;
- provide secure logout/session invalidation;
- minimize the amount of sensitive data kept in browser memory and persistent storage.

## 13.2 WebView2

Treat WebView2 as another untrusted client.

Do not expose privileged native functions to JavaScript without an explicit allowlist.

Any WebView2 bridge MUST:

- expose only necessary commands;
- validate every argument;
- authenticate/authorize operations where applicable;
- avoid arbitrary shell/process execution from web content;
- avoid arbitrary file-system access from web content;
- restrict allowed navigation/origins;
- prevent untrusted remote web pages from obtaining native capabilities.

---

# 14. Cloud security

Cloud security must cover identity, network exposure, configuration, storage, logs, secrets and recovery.

## 14.1 Production isolation

Separate:

- local development;
- testing/CI;
- staging;
- production.

Never point a local build at the production database by default.

## 14.2 Secrets

Use platform secrets/secret stores.

Rotate secrets when exposure is suspected.

Do not print secrets during deployment diagnostics.

## 14.3 Database/network exposure

If possible:

- database is not directly exposed to the public internet;
- application connects through authenticated/private channels;
- administrative interfaces are separately protected;
- firewall/network policy defaults to deny.

## 14.4 Cloudflare

Use Cloudflare as one security layer, not the entire security architecture.

Recommended outer controls may include:

- TLS;
- WAF rules;
- rate limits;
- DDoS protection;
- bot controls where justified;
- security headers at the edge when appropriate;
- DNS protection;
- logs/analytics with privacy review.

---

# 15. Vulnerability management

IBM describes vulnerability management as continuous discovery, prioritization and resolution, with a lifecycle including discovery, categorization/prioritization, remediation, reassessment and reporting. [IBM — Vulnerability Management](https://www.ibm.com/br-pt/think/topics/vulnerability-management)

Claude Code MUST NOT treat security review as a one-time activity.

## 15.1 Dependency management

Maintain visibility of:

- direct dependencies;
- transitive dependencies;
- runtimes;
- build tools;
- GitHub/CI actions;
- third-party scripts;
- CDN dependencies.

Run dependency/security audits regularly and on pull requests where practical.

## 15.2 Patch policy

Prioritize vulnerabilities based on:

- exploitability;
- exposure;
- whether the affected component is production-reachable;
- whether sensitive data is involved;
- privilege required;
- availability/integrity impact.

Do not wait for every dependency to become "critical" before updating routinely.

## 15.3 Source and build security

Protect CI/CD against:

- secret leakage;
- dependency confusion;
- malicious package updates;
- poisoned build artifacts;
- untrusted pull-request execution;
- unsafe deployment credentials.

---

# 16. Offensive security and security testing

IBM describes offensive security as proactive testing using attacker techniques to expose weaknesses before they are abused, including penetration testing and vulnerability assessment. [IBM — Offensive Security](https://www.ibm.com/br-pt/think/topics/offensive-security)

ZoZo SHOULD maintain a repeatable application security test suite.

## 16.1 Minimum automated security tests

Test at least:

- unauthenticated request to protected endpoint -> rejected;
- authenticated user A reading user B's transaction -> rejected;
- authenticated user A modifying user B's transaction -> rejected;
- authenticated user A deleting user B's resource -> rejected;
- invalid/malformed IDs -> safe rejection;
- expired session -> rejected;
- revoked session -> rejected;
- CSRF attempt -> rejected where applicable;
- reflected/stored XSS payload -> inert/escaped;
- SQL/query injection payload -> rejected/safely parameterized;
- rate-limit threshold -> enforced;
- password reset token reuse -> rejected;
- password reset token expiration -> rejected;
- logout -> invalidates session;
- privilege escalation attempt -> rejected;
- unauthorized export -> rejected;
- unauthorized download -> rejected;
- invalid webhook signature -> rejected;
- duplicate idempotent request -> no duplicate financial operation.

## 16.2 DAST / penetration testing

Before a significant public launch and after major architecture changes, run authenticated and unauthenticated security testing.

Use tooling appropriate to the scope; examples from IBM's security content include Burp Suite and Kali in the context of offensive security. [IBM — Offensive Security](https://www.ibm.com/br-pt/think/topics/offensive-security)

Only test systems owned/authorized by ZoZo.

---

# 17. Threat detection, logging and response

IBM defines threat management as preventing attacks, detecting cyber threats and responding to incidents. Recovery should include resilience and continuity planning. [IBM — Threat Management](https://www.ibm.com/br-pt/think/topics/threat-management)

## 17.1 Security events to log

Log security-relevant events such as:

- login success/failure;
- logout;
- password change;
- password reset request and completion;
- MFA enrollment/change;
- suspicious login/credential-stuffing signals;
- authorization failures;
- administrative actions;
- changes to security settings;
- data export requests;
- account deletion requests;
- webhook verification failures;
- rate-limit violations;
- suspicious API patterns;
- application errors that may indicate attacks.

## 17.2 Never log secrets

Do NOT log:

- passwords;
- session cookies;
- refresh tokens;
- reset tokens;
- API keys;
- private keys;
- authorization headers in full;
- raw sensitive financial payloads unless strictly required for incident handling.

Prefer event metadata:

```json
{
  "event": "authorization_denied",
  "userId": "internal-id",
  "resource": "transaction",
  "action": "update",
  "resourceId": "internal-id",
  "requestId": "request-id",
  "timestamp": "2026-10-07T12:00:00Z"
}
```

## 17.3 Correlation IDs

Every request should have a request/correlation ID suitable for tracing without exposing secrets.

## 17.4 Alerting

Do not create alerts for every routine event.

Prioritize signals such as:

- many failed logins;
- impossible/highly abnormal access patterns;
- repeated authorization failures;
- unusual export volume;
- suspicious administrative actions;
- repeated webhook failures;
- spike in 5xx/security errors;
- unusual database access;
- dependency/security alerts affecting production.

---

# 18. Incident response and LGPD

## 18.1 Important correction to the original project note

The original security note supplied for ZoZo stated that ANPD notification should happen "within 72 hours".

**Do not implement a hard-coded 72-hour rule.**

Under the ANPD's Regulation on Security Incident Communication (Resolution CD/ANPD nº 15/2024), incidents that may cause relevant risk or damage to data subjects are subject to communication requirements, and the ANPD guidance refers to a **3-business-day** timeframe counted from awareness of the incident. The assessment is risk-based and includes situations involving financial data and authentication data among relevant factors. [ANPD — RCIS](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aprova-o-regulamento-de-comunicacao-de-incidente-de-seguranca)

ZoZo MUST therefore implement an incident-response process that starts **immediately**, rather than waiting for the deadline.

## 18.2 Minimum response workflow

```text
Detection
   -> Triage
   -> Containment
   -> Evidence preservation
   -> Scope / affected data assessment
   -> Risk assessment
   -> Eradication / remediation
   -> Recovery
   -> Notification decision
   -> Communication
   -> Post-incident review
```

## 18.3 Incident register

Maintain an incident register containing at least:

- incident ID;
- date/time detected;
- date/time awareness was established;
- systems affected;
- data categories involved;
- estimated number of affected users;
- containment actions;
- remediation actions;
- communication decision and rationale;
- responsible person/team;
- follow-up actions.

The ANPD states that incidents involving personal data must be registered and indicates a minimum record-retention requirement under the incident regulation. [ANPD — Comunicação de Incidente de Segurança](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aprova-o-regulamento-de-comunicacao-de-incidente-de-seguranca)

## 18.4 Do not destroy evidence

When an incident is detected:

- preserve relevant logs;
- preserve security telemetry;
- record timestamps;
- avoid uncontrolled cleanup that destroys evidence;
- rotate compromised secrets in a controlled manner while preserving evidence where legally/operationally appropriate.

---

# 19. LGPD implementation guidance for ZoZo

LGPD requires technical and administrative measures appropriate to protect personal data from unauthorized access and accidental/unlawful destruction, loss, alteration, communication or inadequate processing. ANPD also publishes specific security guidance for small processing agents. [ANPD — Guia de Segurança da Informação para Agentes de Tratamento de Pequeno Porte](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte)

For ZoZo, operationalize LGPD security through:

- data inventory;
- data minimization;
- purpose limitation;
- access control;
- encryption in transit and at rest;
- secure authentication;
- logging and auditing;
- backup and recovery;
- incident response;
- secure deletion/retention;
- vendor/subprocessor review;
- privacy documentation;
- data-subject request workflows.

**Do not claim "LGPD compliant" merely because HTTPS exists.** Compliance is broader than transport encryption.

---

# 20. Data retention and deletion

Define retention periods for:

- active account data;
- deleted-account data;
- security logs;
- backups;
- audit logs;
- reset-token records;
- incident records;
- support data;
- analytics data.

Deletion must be designed carefully so that:

- deleted users do not retain accessible active sessions;
- derived data is handled appropriately;
- caches are invalidated where necessary;
- backups follow a documented retention cycle;
- legal/security retention requirements are distinguished from normal product retention.

Do not promise immediate physical erasure from every backup copy unless the architecture actually supports it.

---

# 21. Backup, recovery and resilience

A secure application must survive compromise, not merely prevent compromise.

## 21.1 Backups

Backups should be:

- automated;
- encrypted;
- access controlled;
- isolated from normal application credentials;
- periodically tested.

## 21.2 Recovery testing

A backup that has never been restored is not proven reliable.

Test:

- point-in-time recovery where available;
- restore to isolated environment;
- integrity validation;
- application compatibility after restore.

## 21.3 Ransomware/data corruption mindset

Because ZoZo stores financial records, recovery design must consider malicious deletion or corruption in addition to ordinary hardware/software failure.

IBM describes resilience/recovery as part of the response lifecycle for cybersecurity incidents. [IBM — Threat Management](https://www.ibm.com/br-pt/think/topics/threat-management)

---

# 22. AI security for the ZoZo assistant

IBM's AI-security guidance highlights risks involving manipulated inputs, data integrity/confidentiality, model manipulation, adversarial attacks and software supply-chain issues. [IBM — AI Security](https://www.ibm.com/br-pt/think/topics/ai-security)

Treat ZoZo AI as an **untrusted reasoning component**, not as an authority.

## 22.1 Never give an AI model unrestricted authority

The model MUST NOT directly:

- execute arbitrary SQL;
- execute shell commands;
- access arbitrary filesystem paths;
- access another user's data;
- send arbitrary external requests;
- change account ownership;
- bypass authorization;
- delete financial data without an explicit product flow;
- alter authoritative financial state without validated application code.

## 22.2 Tool-based architecture

Prefer:

```text
User request
   -> AI interprets intent
   -> server validates tool request
   -> authorization check
   -> deterministic business operation
   -> result returned to AI/user
```

The AI should request narrow tools such as:

```text
getTransactions(dateRange)
createDraftTransaction(input)
searchCategories(query)
calculateBudgetSummary(period)
```

The server should enforce:

- user identity;
- ownership;
- field validation;
- rate limits;
- transaction rules;
- maximum scope;
- audit logging.

## 22.3 Prompt injection

User-controlled content must be considered hostile input.

Examples:

- transaction description containing instructions;
- imported bank memo containing instructions;
- uploaded document containing malicious prompt text;
- external webpage content fed to the AI.

Never treat retrieved content as a trusted system instruction.

## 22.4 Data minimization for AI

Send the smallest useful dataset to the model.

Prefer aggregated/structured context over dumping the complete user database into an AI prompt.

---

# 23. Social engineering and phishing defenses

IBM describes social engineering as manipulating people into revealing information, installing software, visiting malicious sites, sending money or making other security-compromising mistakes. It also highlights impersonation, urgency, fear and curiosity as common manipulation techniques. [IBM — Social Engineering](https://www.ibm.com/br-pt/think/topics/social-engineering)

ZoZo should minimize opportunities for social engineering by:

- making security emails visually and textually consistent;
- avoiding frightening, artificial urgency in routine account messages;
- never asking for passwords by email;
- never asking users to disclose MFA codes to support staff;
- using known in-app security notifications;
- showing the official ZoZo domain clearly in security-sensitive flows;
- making support procedures explicit;
- providing anti-phishing guidance for password-reset messages.

---

# 24. Malware-specific defenses

Assume user-generated content and third-party content can be malicious.

Do not execute or dynamically load untrusted code.

Avoid:

- arbitrary JavaScript loaded from user data;
- dynamic script URLs based on user input;
- direct execution of uploaded files;
- shell execution from web input;
- unsafe archive extraction;
- unsafe deserialization.

Where ZoZo processes uploads or imports, isolate parsers and enforce resource limits.

---

# 25. Software supply-chain security

OWASP's 2025 Top 10 includes software supply-chain failures as one of the critical application risks. [OWASP Top 10:2025](https://top10.owasp.org/2025/pt-BR/)

Claude Code must treat dependency additions as security decisions.

Before adding a package:

1. Determine whether it is actually necessary.
2. Check whether a platform/native API can replace it.
3. Review package activity/maintenance and provenance.
4. Review dependency tree and transitive packages.
5. Avoid unnecessary post-install scripts or packages with excessive privileges.
6. Lock versions where the ecosystem supports it.
7. Run vulnerability scanning.
8. Remove unused dependencies.

Do not copy large third-party snippets blindly into production security-sensitive code.

---

# 26. Development workflow for Claude Code

Whenever Claude Code modifies ZoZo, follow this process for security-sensitive changes.

## Step A — Identify trust boundaries

Before editing code, identify:

- browser/WebView2 -> server boundary;
- public internet -> edge boundary;
- API -> authorization boundary;
- API -> database boundary;
- application -> third-party service boundary;
- application -> AI model boundary.

## Step B — Identify assets and threats

Ask:

- What data is affected?
- Can this operation cross users/tenants?
- Can an attacker control any input?
- Can this change create a new privilege?
- Can the change expose a secret?
- Can retry duplicate data?
- Can an attacker force high resource consumption?

## Step C — Implement server-side controls first

Do not start with frontend validation if the same rule is required for security.

## Step D — Add tests

Every security-sensitive rule needs a negative test where practical.

Examples:

- "user cannot read another user's resource";
- "user cannot bypass the permission by changing the ID";
- "expired session is rejected".

## Step E — Review logs

Verify the implementation does not accidentally log credentials or financial payloads.

## Step F — Review deployment impact

Check:

- environment variables;
- secrets;
- CORS;
- CSP;
- Cloudflare configuration;
- migrations;
- caches;
- cookies;
- redirects;
- production/staging separation.

## Step G — Report unresolved security debt

If the requested feature cannot be made fully secure within the current architecture, document the risk explicitly instead of silently accepting it.

---

# 27. Claude Code prohibitions

Claude Code MUST NOT:

- disable authentication just to make a feature work;
- bypass authorization because the frontend already checked permission;
- put credentials in frontend code;
- put API secrets in `.env` files that are shipped to the browser;
- store access/refresh tokens in localStorage/sessionStorage;
- use `Access-Control-Allow-Origin: *` for a private authenticated API;
- concatenate user input into SQL or shell commands;
- create "temporary" hardcoded admin accounts in production;
- disable TLS verification in production;
- silence certificate errors as a fix;
- log passwords/tokens;
- expose database credentials to WebView2;
- create an unrestricted native WebView bridge;
- use Cloudflare Access as a hidden workaround for public end-user authentication;
- claim LGPD compliance without a documented basis;
- claim a system is secure merely because it uses HTTPS;
- add an AI feature with unrestricted database/tool access;
- remove a security control because it causes a UX inconvenience without documenting the tradeoff.

---

# 28. Security headers / cookie baseline

Start from this conceptual baseline and adapt after testing:

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: <strict CSP tailored to ZoZo>
```

Session cookie:

```http
Set-Cookie: __Host-ZoZoSession=<opaque-random-session-id>; Path=/; Secure; HttpOnly; SameSite=Strict
```

Do not copy this mechanically if a documented product flow requires another policy. Verify all production headers with automated checks.

---

# 29. Security checklist before public release

## Authentication

- [ ] Passwords are not stored in plaintext.
- [ ] Password hashing uses Argon2id or an approved equivalent.
- [ ] Login is rate-limited.
- [ ] Password reset is single-use and short-lived.
- [ ] Sessions are server-controlled and revocable.
- [ ] Session cookie is Secure + HttpOnly + SameSite.
- [ ] Session ID is regenerated after authentication.
- [ ] MFA is available/planned for high-risk accounts.

## Authorization

- [ ] Every protected API endpoint checks authentication.
- [ ] Every protected resource checks ownership/permission server-side.
- [ ] ID tampering tests exist.
- [ ] Administrative routes are separately protected.
- [ ] Default access is deny.

## Data

- [ ] HTTPS/TLS is mandatory in production.
- [ ] Database/storage is encrypted at rest where supported.
- [ ] Secrets are in a secret-management mechanism.
- [ ] Sensitive data is not unnecessarily logged.
- [ ] Backups are encrypted and access-controlled.
- [ ] Restore has been tested.

## Web

- [ ] XSS protections are in place.
- [ ] CSP is configured.
- [ ] CSRF is addressed for cookie-authenticated state changes.
- [ ] Input validation exists at the server boundary.
- [ ] Queries are parameterized.
- [ ] CORS is restricted.
- [ ] Security headers are configured.
- [ ] Sensitive responses use appropriate cache controls.

## Infrastructure

- [ ] Production/staging/dev are isolated.
- [ ] Database is not unnecessarily public.
- [ ] Cloudflare/WAF/rate limiting is configured where appropriate.
- [ ] Admin tooling is not publicly exposed without separate authentication.

## Dependencies

- [ ] Dependencies are locked where appropriate.
- [ ] Vulnerability scans run regularly.
- [ ] Unused dependencies were removed.
- [ ] CI/CD secrets are protected.

## Monitoring

- [ ] Security events are logged.
- [ ] Secrets are not logged.
- [ ] Request IDs/correlation IDs are available.
- [ ] High-risk events have alerts or review mechanisms.

## Incident response

- [ ] Incident response procedure exists.
- [ ] Incident register exists.
- [ ] Relevant logs can be preserved.
- [ ] ANPD communication decision process is documented.
- [ ] The team knows the applicable 3-business-day communication requirement for qualifying incidents.

## AI

- [ ] AI receives minimum necessary data.
- [ ] AI does not bypass authorization.
- [ ] AI tools are allowlisted.
- [ ] AI-generated actions are validated server-side.
- [ ] Prompt injection is treated as hostile input.

---

# 30. Priority roadmap for ZoZo

## P0 — Must exist before a serious public deployment

1. HTTPS/TLS everywhere.
2. Secure authentication and session handling.
3. Server-side authorization for every user-owned resource.
4. No secrets in frontend/client bundles.
5. Parameterized database queries.
6. XSS/CSRF defenses appropriate to architecture.
7. CORS restriction.
8. Secure headers/CSP.
9. Login/password-reset rate limiting.
10. Audit/security-event logging without secret leakage.
11. Production/staging separation.
12. Encrypted backups with tested restore.
13. Dependency/security scanning.
14. Incident-response procedure.
15. LGPD/privacy documentation appropriate to the real processing activities.

## P1 — Strongly recommended

1. MFA/passkeys.
2. Security anomaly detection.
3. Automated DAST/security regression checks.
4. Regular authenticated penetration testing.
5. Stronger Cloudflare WAF/rate-limit policies.
6. Data-retention/deletion automation.
7. Security dashboard/operational metrics.
8. Formal threat modeling for major features.
9. Key/secret rotation procedures.
10. AI security controls before AI can access user data.

## P2 — Maturity improvements

1. Fine-grained risk scoring.
2. More advanced behavioral anomaly detection.
3. Formal security metrics (MTTD/MTTR).
4. Advanced secrets/KMS architecture.
5. Regular independent security assessment.
6. More advanced supply-chain integrity controls.

---

# 31. Definition of Done for secure ZoZo features

A security-sensitive feature is not "done" when the UI works.

It is done when:

- the intended user can use it;
- unauthorized users cannot use it;
- ownership boundaries are enforced server-side;
- malicious input is safely handled;
- secrets remain secret;
- sensitive data is appropriately protected;
- security-relevant actions are observable;
- abuse is rate-limited where necessary;
- failure states are safe;
- automated tests cover important negative cases;
- deployment/configuration is secure;
- documentation and retention/privacy implications are understood.

---

# 32. Reference hierarchy

When resolving security questions for ZoZo, prefer this order:

1. Applicable Brazilian law and ANPD regulations/guidance.
2. Security requirements explicitly adopted by ZoZo.
3. OWASP current application-security standards/guidance.
4. IBM cybersecurity guidance supplied as the conceptual/security baseline.
5. Provider-specific security documentation (Cloudflare, database provider, hosting provider, etc.).
6. General tutorials/blogs only as supplementary material.

Do not override a higher-level requirement with a lower-level convenience.

---

# 33. IBM source material supplied for this standard

The following IBM pages were reviewed and operationalized for ZoZo:

1. IBM — Guia da Cibersegurança de 2026
   https://www.ibm.com/br-pt/think/cybersecurity
2. IBM — Ataque cibernético
   https://www.ibm.com/br-pt/think/topics/cyber-attack
3. IBM — Engenharia social
   https://www.ibm.com/br-pt/think/topics/social-engineering
4. IBM — Malware
   https://www.ibm.com/br-pt/think/topics/malware
5. IBM — Tipos de ameaças cibernéticas
   https://www.ibm.com/br-pt/think/topics/cyberthreats-types
6. IBM — Segurança de dados
   https://www.ibm.com/br-pt/think/topics/data-security
7. IBM — Gerenciamento de acesso e identidade (IAM)
   https://www.ibm.com/br-pt/think/topics/identity-access-management
8. IBM — Segurança na nuvem
   https://www.ibm.com/br-pt/think/topics/cloud-security
9. IBM — Segurança de endpoint
   https://www.ibm.com/br-pt/think/topics/endpoint-security
10. IBM — Gerenciamento de vulnerabilidades
    https://www.ibm.com/br-pt/think/topics/vulnerability-management
11. IBM — Segurança ofensiva
    https://www.ibm.com/br-pt/think/topics/offensive-security
12. IBM — Segurança de IA
    https://www.ibm.com/br-pt/think/topics/ai-security
13. IBM — Gerenciamento de ameaças
    https://www.ibm.com/br-pt/think/topics/threat-management

The AI security URL was supplied twice in the original request; it is intentionally listed once here.

---

# 34. Additional authoritative references used to operationalize the IBM guidance

- ANPD — Guia orientativo sobre segurança da informação para agentes de tratamento de pequeno porte:
  https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte
- ANPD — Comunicação de Incidente de Segurança / Resolução CD/ANPD nº 15/2024:
  https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aprova-o-regulamento-de-comunicacao-de-incidente-de-seguranca
- OWASP Top 10:2025 (Português):
  https://top10.owasp.org/2025/pt-BR/
- OWASP Application Security Verification Standard (ASVS):
  https://owasp.org/projects/asvs
- OWASP Session Management Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP Password Storage Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Content Security Policy Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- OWASP Secure Code Review Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html

---

# 35. Final instruction to Claude Code

When working on ZoZo, **assume that every new endpoint, data flow, third-party integration, storage mechanism, authentication change, WebView2 bridge, AI tool and cloud configuration can create a security boundary**.

Before shipping a change:

1. identify what can be trusted and what cannot;
2. protect the server-side boundary;
3. enforce authorization server-side;
4. minimize sensitive data;
5. prevent common web attacks;
6. protect secrets and sessions;
7. log security events without leaking secrets;
8. test malicious/unauthorized paths;
9. consider recovery and incident response;
10. document security debt instead of hiding it.

**Security is a feature of ZoZo's architecture, not a final checklist added after development.**
