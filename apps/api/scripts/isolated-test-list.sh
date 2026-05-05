#!/usr/bin/env bash
# Shared list of test files that must run in their own Bun process.
#
# Bun's mock.module() is process-wide: once a module is replaced, every
# subsequent import in the same process sees the mock. Files listed here
# mock shared modules (session.service, billing.service, subscription-grants,
# billing.service stubs for background-check, identity.service, etc.) whose
# stubs would contaminate unrelated test files that import the real implementations.
#
# Sourced by both run-tests.sh and run-tests-with-coverage.sh so the two
# scripts never drift out of sync.
#
# When adding a new test file that uses mock.module() on a path also
# imported by other test files, add its basename here.

is_isolated_test() {
  local name
  name="$(basename "$1")"
  [[ "$name" == 'verification.controller.test.ts' ||
     "$name" == 'block.service.test.ts' ||
     "$name" == 'identity-keys-access.service.test.ts' ||
     "$name" == 'geo.service.test.ts' ||
     "$name" == 'identity-session.test.ts' ||
     "$name" == 'identity.service.test.ts' ||
     "$name" == 'stripe.test.ts' ||
     "$name" == 'reconciliation.test.ts' ||
     "$name" == 'alias-gate.test.ts' ||
     "$name" == 'jurisdiction-policy.test.ts' ||
     "$name" == 'verifymy.provider.test.ts' ||
     "$name" == 'age-verification.service.test.ts' ||
     "$name" == 'billing.service.test.ts' ||
     "$name" == 'background-check.service.test.ts' ]]
}
