import { describe, expect, it } from 'vitest';
import { packMeasuredCorrections } from './reportPagination';

describe('packMeasuredCorrections', () => {
  it('uses the remaining space on the first page', () => {
    expect(packMeasuredCorrections([
      { id: '1', height: 120 },
      { id: '2', height: 120 },
      { id: '3', height: 120 },
    ], 250, 400, 10)).toEqual([['1', '2'], ['3']]);
  });

  it('moves the first correction to the next page when the summary leaves no room', () => {
    expect(packMeasuredCorrections([
      { id: '1', height: 180 },
      { id: '2', height: 180 },
    ], 100, 400, 10)).toEqual([['1', '2']]);
  });

  it('never drops an oversized correction', () => {
    expect(packMeasuredCorrections([{ id: 'long', height: 900 }], 50, 700)).toEqual([['long']]);
  });

  it('keeps an empty report to one page', () => {
    expect(packMeasuredCorrections([], 200, 700)).toEqual([[]]);
  });

  it('avoids leaving a single correction alone on the last page', () => {
    expect(packMeasuredCorrections([
      { id: '1', height: 100 }, { id: '2', height: 100 },
      { id: '3', height: 100 }, { id: '4', height: 100 },
    ], 320, 320, 10)).toEqual([['1', '2'], ['3', '4']]);
  });
});
