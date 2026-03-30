# Security Policy

## Scope

This repository is a documentation and reference implementation project. It does not operate any live services, handle user data, or expose APIs. The primary security surface is the reference code under `patterns/*/code/`.

## Reporting a Vulnerability

If you find a security issue in the reference implementations (e.g. unsafe use of `eval`, command injection, hardcoded credentials, or insecure defaults that readers might copy into production), please report it responsibly rather than opening a public issue.

**How to report:**
1. Open a [GitHub Security Advisory](https://github.com/jagguvarma15/agent-blueprints/security/advisories/new) (preferred — keeps details private until resolved)
2. Or email the maintainer directly via the contact on their GitHub profile

**Please include:**
- The affected file path and line number
- A description of the vulnerability and its potential impact
- A suggested fix if you have one

## Response

We aim to acknowledge reports within 3 business days and publish a fix or advisory within 14 days of confirmation.

## Out of Scope

- Vulnerabilities in third-party dependencies used only in the documentation website build (Astro, Tailwind, etc.) — report these upstream
- Issues that only apply if readers copy code without adapting it to their own security requirements
