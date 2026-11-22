export const reportTargetTypeColumn = {
  name: 'target_type',
  type: 'enum' as const,
  enum: ['book', 'chapter', 'user', 'message'],
  enumName: 'report_target_type',
};
