# Security

Ascertain is read-only: it reads public chain state, never holds funds or keys, and never signs transactions for users. No audit has been performed and none is claimed.

## Reporting a vulnerability

Please report privately through GitHub Security Advisories on this repository rather than a public issue. Include reproduction steps and the affected version. Reports are acknowledged within a few days.

## Scope notes

- x402 demo mode verifies signatures locally and settles nothing. Do not point a production payment address at a demo-mode deployment.
- Secrets (`X402_PAY_TO`, `ANTHROPIC_API_KEY`, RPC URLs) belong in environment variables, never in the repository.
- Findings describe observable on-chain patterns, not intent. If a finding about your project is wrong, open an issue with the transaction hashes and it will be re-checked.
