import { VISIBILITIES, WRITING_STATUSES } from '../../shared';

export const writingStatusColumn = {
  type: 'enum' as const,
  enum: WRITING_STATUSES,
  enumName: 'writing_status',
  default: 'draft',
};

export const visibilityColumn = {
  type: 'enum' as const,
  enum: VISIBILITIES,
  enumName: 'visibility',
  default: 'private',
};
