'use strict';

/**
 * electron-builder does `const validateSchema = require("@develar/schema-utils")` and
 * expects a callable default export. The npm `@develar/schema-utils@2.6.5` package does
 * `module.exports = validate.default` (Ajv 6). Webpack `schema-utils@4` instead exports
 * `{ validate, ValidationError, ... }`. This shim restores the legacy shape while using
 * schema-utils 4 (Ajv 8 + ajv-keywords 5).
 */
const { validate, ValidationError } = require('schema-utils');

validate.ValidationError = ValidationError;
validate.ValidateError = ValidationError;

module.exports = validate;
