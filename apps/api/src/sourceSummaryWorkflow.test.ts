import { describe, expect, it } from 'vitest';
import {
  SourceSummaryConflictError,
  SourceSummaryValidationError,
} from './sourceSummaryWorkflow.js';

describe('source summary workflow errors', () => {
  it('uses distinct conflict and validation errors for HTTP mapping', () => {
    expect(new SourceSummaryConflictError('conflict')).toBeInstanceOf(Error);
    expect(new SourceSummaryValidationError('invalid')).toBeInstanceOf(Error);
  });
});
