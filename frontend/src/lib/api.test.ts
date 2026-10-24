import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('ApiClient', () => {
  it('collects all pages into the returned list', async () => {
    vi.stubGlobal('fetch', async (input: string) => {
      const offset = Number(new URL(input, 'http://local').searchParams.get('offset'));
      const component = { id: String(offset), name: 'Pipe', line_no: 'L1', kind: 'Pipe', properties: {}, geometry_ids: ['G1'], bounds: null, weld_no: '', material_code: '', material_1: '', material_2: '' };
      return Response.json({ items: [component], total: 2, offset, limit: 1 });
    });
    expect((await new ApiClient('/node-api').components()).map(item => item.id)).toEqual(['0', '1']);
  });

  it.each([{ error: '数据库不可用' }, { detail: '数据库不可用' }])('shows backend error to the caller: %j', async payload => {
    vi.stubGlobal('fetch', async () => Response.json(payload, { status: 503 }));
    await expect(new ApiClient('/node-api').progress()).rejects.toThrow('数据库不可用');
  });

  it('extracts FastAPI validation details', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ detail: [{ loc: ['body', 'welded_on'], msg: '无效日期' }] }, { status: 422 }));
    await expect(new ApiClient('/python-api').progress()).rejects.toThrow('welded_on：无效日期');
  });

  it('sends a null date and returns the persisted record', async () => {
    vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
      const payload: unknown = JSON.parse(String(init.body));
      if (input !== '/node-api/api/welds/L%2F1/W%232' || JSON.stringify(payload) !== '{"welded_on":null}') return Response.json({ error: '请求内容错误' }, { status: 400 });
      return Response.json({ line_no: 'L/1', weld_no: 'W#2', material_1: '', material_2: '', welded_on: null, updated_at: '2026-10-22T00:00:00Z', is_model: true });
    });
    expect((await new ApiClient('/node-api').saveWeld('L/1', 'W#2', null)).welded_on).toBeNull();
  });

  it('rejects malformed successful data', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ percentage: '33' }));
    await expect(new ApiClient('/node-api').progress()).rejects.toThrow('数据格式');
  });
});
