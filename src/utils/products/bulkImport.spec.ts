import { describe, it, expect } from 'vitest';
import { autoMap, buildBulkItem, unmappedRequiredFields, validateAll } from './bulkImport';

describe('bulkImport (EVO-1734) — autoMap', () => {
  it('matches common synonyms case/spacing-insensitively', () => {
    const m = autoMap(['Nome', 'SKU', 'Default Price', 'Currency', 'Foo']);
    expect(m).toEqual({
      Nome: 'name',
      SKU: 'sku',
      'Default Price': 'default_price',
      Currency: 'currency',
      Foo: '',
    });
  });
});

describe('bulkImport (EVO-1734) — buildBulkItem', () => {
  it('requires name', () => {
    const { item, errors } = buildBulkItem(['', 'physical'], ['name', 'kind'], { name: 'name', kind: 'kind' });
    expect(item.name).toBe('');
    expect(errors).toEqual([{ field: 'name', message: 'required' }]);
  });

  it('rejects unknown kind/status/currency', () => {
    const { errors } = buildBulkItem(
      ['x', 'service', 'BTC', 'archived'],
      ['name', 'kind', 'currency', 'status'],
      { name: 'name', kind: 'kind', currency: 'currency', status: 'status' },
    );
    const fields = errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['kind', 'currency', 'status']));
  });

  it('parses BR-style decimals (1,50 → 1.5)', () => {
    const { item, errors } = buildBulkItem(['x', '1,50'], ['name', 'price'], {
      name: 'name',
      price: 'default_price',
    });
    expect(errors).toEqual([]);
    expect(item.default_price).toBe(1.5);
  });

  it('rejects non-integer stock', () => {
    const { errors } = buildBulkItem(['x', '1.5'], ['name', 'stock'], {
      name: 'name',
      stock: 'stock_quantity',
    });
    expect(errors).toContainEqual({ field: 'stock_quantity', message: 'must_be_integer' });
  });

  it('splits labels on , ; |', () => {
    const { item } = buildBulkItem(['x', 'a, b; c|d'], ['name', 'tags'], {
      name: 'name',
      tags: 'labels',
    });
    expect(item.labels).toEqual(['a', 'b', 'c', 'd']);
  });

  it('rejects non-http purchase_url', () => {
    const { errors } = buildBulkItem(['x', 'ftp://bad'], ['name', 'link'], {
      name: 'name',
      link: 'purchase_url',
    });
    expect(errors).toContainEqual({ field: 'purchase_url', message: 'invalid_url' });
  });
});

describe('bulkImport (EVO-1734) — validateAll', () => {
  it('flags duplicated SKU within the batch on the 2nd occurrence', () => {
    const headers = ['name', 'sku'];
    const mapping = { name: 'name', sku: 'sku' } as const;
    const result = validateAll(
      [
        ['A', 'DUP'],
        ['B', 'DUP'],
      ],
      headers,
      [2, 3],
      mapping,
    );
    expect(result[0].errors).toEqual([]);
    expect(result[1].errors).toContainEqual({ field: 'sku', message: 'duplicated_within_batch' });
  });

  it('carries server-style 0-based index and original csvLine', () => {
    const result = validateAll([['A']], ['name'], [5], { name: 'name' });
    expect(result[0].index).toBe(0);
    expect(result[0].csvLine).toBe(5);
  });
});

describe('bulkImport (EVO-1734) — unmappedRequiredFields', () => {
  it('returns name when no header maps to it', () => {
    expect(unmappedRequiredFields({ foo: 'sku', bar: '' })).toEqual(['name']);
  });
  it('returns empty when name is mapped', () => {
    expect(unmappedRequiredFields({ Nome: 'name' })).toEqual([]);
  });
});
