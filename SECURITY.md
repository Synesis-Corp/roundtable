# Security Policy

We take the security of Roundtable seriously. Thank you for helping keep the
project and its users safe.

## Reporting a vulnerability

**Please do NOT open a public issue, pull request, or discussion for security
vulnerabilities.** Public disclosure before a fix is available puts users at
risk.

Instead, report privately using **GitHub Private Vulnerability Reporting**: open
the repository's **Security** tab and click **"Report a vulnerability"**. This
opens a private advisory that only the maintainers can see.

Please include:

- A clear description of the vulnerability and its impact.
- Steps to reproduce (proof of concept if possible).
- Affected version, commit, or deployment configuration.
- Any suggested remediation, if you have one.

## What to expect

- **Acknowledgement** within **3 business days**.
- An initial **assessment and severity triage** within **7 business days**.
- Coordinated disclosure: we will work with you on a timeline and credit you in
  the advisory (unless you prefer to remain anonymous).

## Scope

In scope: the source code in this repository (apps, packages, Docker assets,
scripts). Out of scope: third-party dependencies (report those upstream),
issues that require a compromised host or physical access, and the operators'
own production deployments.

## Supported versions

Roundtable is pre-1.0 and moves fast. Security fixes are applied to the
**latest `main`**. There are no long-term support branches yet.
