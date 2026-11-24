import { jlptLearningRecordBulkSchema, jlptLearningRecordPatchSchema } from '../jlpt.schema';

describe('JLPT learning record validation', () => {
  it.each([
    { field: 'preparation_rating', value: 'A' },
    { field: 'attitude_rating', value: null },
    { field: 'homework_completed', value: false },
    { field: 'test_correct_answers', value: 0 },
  ])('accepts one exact field/value pair: $field', (body) => {
    expect(jlptLearningRecordPatchSchema.parse({ body }).body).toEqual(body);
  });

  it.each([
    { field: 'preparation_rating', value: true },
    { field: 'homework_completed', value: 'Có' },
    { field: 'test_correct_answers', value: -1 },
    { field: 'test_correct_answers', value: 1.5 },
    { field: 'attitude_rating', value: 'A', another: 'B' },
  ])('rejects mismatched or additional values %#', (body) => {
    expect(() => jlptLearningRecordPatchSchema.parse({ body })).toThrow();
  });

  it('accepts unique non-empty bulk selection', () => {
    const body = {
      field: 'homework_completed',
      value: true,
      enrollment_class_ids: [10, 11],
    } as const;
    expect(jlptLearningRecordBulkSchema.parse({ body }).body).toEqual(body);
  });

  it.each([
    { enrollment_class_ids: [] as number[] },
    { enrollment_class_ids: [10, 10] },
    { enrollment_class_ids: [0] },
  ])('rejects invalid bulk enrollment selection %#', ({ enrollment_class_ids }) => {
    expect(() => jlptLearningRecordBulkSchema.parse({
      body: { field: 'preparation_rating', value: 'A', enrollment_class_ids },
    })).toThrow();
  });
});
