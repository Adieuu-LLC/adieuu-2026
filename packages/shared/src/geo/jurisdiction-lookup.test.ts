import { describe, expect, test } from 'bun:test';
import { expandedJurisdictionCodesForRequirements } from './jurisdiction-lookup';

describe('expandedJurisdictionCodesForRequirements', () => {
  test('adds EU for France', () => {
    const codes = expandedJurisdictionCodesForRequirements({
      jurisdiction: 'FR',
      countryCode: 'FR',
    });
    expect(codes.sort()).toEqual(['EU', 'FR']);
  });

  test('does not add EU for United Kingdom', () => {
    const codes = expandedJurisdictionCodesForRequirements({
      jurisdiction: 'GB',
      countryCode: 'GB',
    });
    expect(codes).toEqual(['GB']);
  });

  test('adds EU for Germany', () => {
    const codes = expandedJurisdictionCodesForRequirements({
      jurisdiction: 'DE',
      countryCode: 'DE',
    });
    expect(codes.sort()).toEqual(['DE', 'EU']);
  });

  test('adds CA-PROPOSED for Canada', () => {
    const codes = expandedJurisdictionCodesForRequirements({
      jurisdiction: 'CA-ON',
      countryCode: 'CA',
    });
    expect(codes.sort()).toEqual(['CA-ON', 'CA-PROPOSED']);
  });
});
