import { describe, expect, it } from 'vitest';
import { preferredSpokenName, spokenNameCandidates } from './nameCandidates';

describe('spoken name candidates', () => {
  it.each([
    ['정아은', '정하은'], ['권도연', '권도현'], ['손아린', '손하린'], ['허유나', '허윤아'],
    ['콩채원', '홍채원'], ['윤시오', '윤시우'], ['이소연', '이서연'],
  ])('keeps "%s" first and offers "%s" among the next two', (heard, intended) => {
    const candidates = spokenNameCandidates(heard, 3);
    expect(candidates[0]).toBe(heard);
    expect(candidates.slice(1)).toContain(intended);
  });

  it('never reorders the heard spelling and leaves non-Hangul names alone', () => {
    expect(spokenNameCandidates('김민수')[0]).toBe('김민수');
    expect(spokenNameCandidates('Sunny')).toEqual(['Sunny']);
    expect(spokenNameCandidates('')).toEqual([]);
  });

  it('does not invent surnames for a common one', () => {
    expect(spokenNameCandidates('손아린', 4).some((name) => name.startsWith('순'))).toBe(false);
  });

  // Crisper misses measured on 2026-10-14 (surnames, endings, native names, liaison).
  it.each([
    ['관도현', '권도현'], ['닥선영', '박선영'], ['권세봉', '권새봄'], ['정다송', '정다솜'],
    ['서혜솔', '서해솔'], ['신놀', '신누리'], ['타게린', '탁예린'], ['여마은', '염하은'], ['최갈민', '제갈민'],
    ['남국민', '남궁민'],
  ])('offers "%s" heard as "%s"', (heard, intended) => {
    expect(spokenNameCandidates(heard, 4)).toContain(intended);
  });

  it('only offers real surnames and name-like given names', () => {
    expect(spokenNameCandidates('관도현', 4)).not.toContain('콴도현');
    expect(spokenNameCandidates('정아은', 4)).toEqual(['정아은', '정하은']);
    expect(spokenNameCandidates('남국민', 4)).not.toContain('남궁민이');
  });

  it('asks about the likely name first only when the heard one cannot be a name', () => {
    expect(preferredSpokenName('관도현')).toBe('권도현');
    expect(preferredSpokenName('권세봉')).not.toBe('권세봉');
    for (const real of ['김민수', '정아은', '이소연', 'Sunny']) expect(preferredSpokenName(real)).toBe(real);
  });
});
