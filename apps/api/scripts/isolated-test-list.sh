#!/usr/bin/env bash
# Deprecated: API tests use `bun test --isolate` (Bun >= 1.3.13) in run-tests.sh so
# mock.module() does not leak between files. This file is kept for any external
# scripts that still source it; is_isolated_test always returns false.

is_isolated_test() {
  return 1
}
