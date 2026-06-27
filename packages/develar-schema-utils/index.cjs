'use strict';

/**
 * electron-builder does `const validateSchema = require("@develar/schema-utils")` and
 * expects a callable default export. The npm `@develar/schema-utils@2.6.5` package does
 * `module.exports = validate.default` (Ajv 6). Webpack `schema-utils@4` instead exports
 * `{ validate, ValidationError, ... }`. This shim restores the legacy shape while using
 * schema-utils 4 (Ajv 8 + ajv-keywords 5).
 *
 * Ajv 8 renamed `error.dataPath` to `error.instancePath` and switched the separator
 * from "." to "/". electron-builder's postFormatter still reads `dataPath`, so we
 * normalise on the fly to prevent a crash in the validation error reporter.
 */
const { validate: originalValidate, ValidationError } = require('schema-utils');

function validate(schema, data, options) {
  if (options && typeof options.postFormatter === 'function') {
    const originalPostFormatter = options.postFormatter;
    options = {
      ...options,
      postFormatter: (formattedError, error) => {
        if (error.dataPath === undefined && error.instancePath !== undefined) {
          error.dataPath = error.instancePath.replace(/\//g, '.');
        }
        return originalPostFormatter(formattedError, error);
      },
    };
  }
  return originalValidate(schema, data, options);
}

validate.ValidationError = ValidationError;
validate.ValidateError = ValidationError;

module.exports = validate;
