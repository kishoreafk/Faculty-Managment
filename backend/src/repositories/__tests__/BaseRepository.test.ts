import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPool } = vi.hoisted(() => ({
  mockPool: { execute: vi.fn(), query: vi.fn() },
}));

vi.mock('../../config/database.js', () => ({ pool: mockPool }));

import { BaseRepository } from '../BaseRepository.js';

class TestRepository extends BaseRepository<any> {
  constructor() { super('test_table'); }
}

const repo = new TestRepository();

beforeEach(() => { vi.clearAllMocks(); });

describe('BaseRepository', () => {
  it('findById', async () => {
    mockPool.query.mockResolvedValue([[{ id: 1, name: 'test' }]]);
    const result = await repo.findById(1);
    expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM `test_table` WHERE id = ? LIMIT 1', [1]);
    expect(result).toEqual({ id: 1, name: 'test' });
  });

  it('findById returns null when not found', async () => {
    mockPool.query.mockResolvedValue([[]]);
    const result = await repo.findById(999);
    expect(result).toBeNull();
  });

  it('findAll without options', async () => {
    mockPool.query.mockResolvedValue([[{ id: 1 }, { id: 2 }]]);
    const result = await repo.findAll();
    expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM `test_table`', []);
    expect(result).toHaveLength(2);
  });

  it('findAll with where, orderBy, limit, offset', async () => {
    mockPool.query.mockResolvedValue([[{ id: 1 }]]);
    await repo.findAll({ where: 'active = ?', params: [1], orderBy: 'name ASC', limit: 10, offset: 5 });
    expect(mockPool.query).toHaveBeenCalledWith(
      'SELECT * FROM `test_table` WHERE active = ? ORDER BY name ASC LIMIT ? OFFSET ?',
      [1, 10, 5]
    );
  });

  it('count', async () => {
    mockPool.query.mockResolvedValue([[{ total: 5 }]]);
    const total = await repo.count();
    expect(total).toBe(5);
  });

  it('count with where', async () => {
    mockPool.query.mockResolvedValue([[{ total: 3 }]]);
    const total = await repo.count({ where: 'deleted = ?', params: [false] });
    expect(total).toBe(3);
  });

  it('create', async () => {
    mockPool.query.mockResolvedValue([{ insertId: 42 }]);
    const id = await repo.create({ name: 'new', email: 'a@b.com' });
    expect(id).toBe(42);
  });

  it('update', async () => {
    mockPool.query.mockResolvedValue([{ affectedRows: 1 }]);
    const ok = await repo.update(1, { name: 'updated' });
    expect(ok).toBe(true);
  });

  it('delete', async () => {
    mockPool.query.mockResolvedValue([{ affectedRows: 1 }]);
    const ok = await repo.delete(5);
    expect(ok).toBe(true);
  });

  it('softDelete', async () => {
    mockPool.query.mockResolvedValue([{ affectedRows: 1 }]);
    const ok = await repo.softDelete(3);
    expect(ok).toBe(true);
  });

  it('exists returns true when row found', async () => {
    mockPool.query.mockResolvedValue([[{ 1: 1 }]]);
    const exists = await repo.exists(1);
    expect(exists).toBe(true);
  });

  it('exists returns false when not found', async () => {
    mockPool.query.mockResolvedValue([[]]);
    const exists = await repo.exists(999);
    expect(exists).toBe(false);
  });
});
