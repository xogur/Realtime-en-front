/**
 * Likely spellings of a Korean name the kiosk STT heard. Measured on synthetic replies
 * (2026-10-14), errors were sound-alike: a dropped ㅎ (하은→아은, 도현→도연), liaison
 * (윤아→유나), ㅗ/ㅜ and ㅓ/ㅗ (시우→시오, 서연→소연), ㅐ/ㅔ and ㅇ/ㅁ endings (새봄→세봉),
 * a surname that does not exist (권→관, 박→닥, 홍→콩) and nasalisation (남궁→남국).
 * The heard spelling stays first. A candidate needs a real surname and a given name
 * that is common, a native Korean name or made of name syllables, so no chip offers a
 * made-up name ("정아흔", "콴도현"); variants are ranked by edit count and plausibility.
 */

const BASE = 0xac00;
const INITIALS = 19;
const MEDIALS = 21;
const FINALS = 28;

const enum Initial { G = 0, N = 2, D = 3, R = 5, M = 6, B = 7, O = 11, H = 18 }
const enum Final { None = 0, G = 1, N = 4, R = 8, M = 16, B = 17, NG = 21 }

type Syllable = { initial: number; medial: number; final: number };

// Most common first: a corrected surname prefers the more frequent one.
const SURNAME_LIST = [
  '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '유',
  '전', '홍', '고', '문', '양', '손', '배', '백', '허', '남', '심', '노', '하', '곽', '성', '차', '주', '우', '구', '민',
  '진', '나', '지', '엄', '채', '원', '천', '방', '공', '현', '함', '변', '염', '여', '추', '도', '소', '석', '선', '설',
  '마', '길', '연', '위', '표', '명', '기', '반', '왕', '금', '옥', '육', '인', '맹', '제', '모', '탁', '국', '어', '은',
  '편', '용', '예', '경', '봉', '사', '부', '가', '복', '태', '목', '형', '피', '두', '감', '음', '빈', '동', '온', '호',
  '범', '좌', '팽', '승', '간', '상', '시', '갈', '단', '견', '당', '화', '창', '옹', '순', '빙', '종',
];
const COMMON_SURNAMES = new Set(SURNAME_LIST);
const COMPOUND_SURNAMES = ['남궁', '황보', '제갈', '선우', '독고', '사공', '서문'];

// Popular given names of children born 2008-2020 (public birth-registration rankings).
const COMMON_GIVEN_NAMES = new Set([
  '서준', '하준', '도윤', '시우', '은우', '지호', '예준', '유준', '주원', '민준', '지후', '준우', '준서', '도현', '건우',
  '현우', '우진', '지훈', '선우', '서진', '연우', '유찬', '이준', '정우', '승우', '시윤', '민재', '현준', '은찬', '윤우',
  '수호', '지우', '지환', '승현', '준혁', '시후', '진우', '승민', '지성', '태윤', '민성', '재윤', '한결', '지한', '윤호',
  '민우', '태민', '재민', '준호', '민찬', '동현', '성민', '지원', '재원', '하람', '로운', '이안', '도하', '은호', '태오',
  '서연', '서윤', '지우', '서현', '하은', '하윤', '민서', '지유', '윤서', '채원', '수아', '지아', '지민', '서아', '다은',
  '예은', '수빈', '소율', '예린', '하린', '지윤', '은서', '지안', '서영', '예원', '유나', '채윤', '시은', '다인', '아린',
  '윤아', '소윤', '유진', '하율', '가은', '민지', '수민', '예서', '나윤', '서은', '주아', '연우', '혜원', '은지', '지현',
  '수연', '예진', '유주', '아윤', '소연', '나은', '하연', '나래', '다연', '서하', '이서', '수현', '채은', '은채', '규리',
  '시아', '혜인', '지수', '예나', '세아', '하엘', '도연', '아인', '지율', '건희', '민지', '태희', '윤희', '혜진', '은비',
]);

// Native Korean given names (순우리말 이름), which the birth rankings above rarely list.
const NATIVE_GIVEN_NAMES = new Set([
  '하늘', '바다', '새봄', '여름', '가을', '겨울', '누리', '다솜', '가람', '해솔', '은솔', '한솔', '예솔', '슬기',
  '아름', '한별', '은별', '샛별', '별하', '소망', '로아', '이슬', '단비', '초롱', '보람', '다온', '가온', '라온',
  '마루', '미르', '새롬', '아라', '나리', '하랑', '온유', '이음', '해온', '단아', '소리', '고운', '다래', '바름',
  '슬비', '빛나', '한빛', '노을', '하나', '두리', '버들', '나래', '하람', '한결', '다은', '보미', '아리', '그루',
]);

// Syllables that occur in given names: a rarer name made of them is still offered.
const NAME_SYLLABLES = new Set([...COMMON_GIVEN_NAMES, ...NATIVE_GIVEN_NAMES].flatMap((name) => [...name]));

function split(text: string): Syllable[] | null {
  const out: Syllable[] = [];
  for (const char of text) {
    const code = char.charCodeAt(0) - BASE;
    if (code < 0 || code >= INITIALS * MEDIALS * FINALS) return null;
    out.push({ initial: Math.floor(code / (MEDIALS * FINALS)), medial: Math.floor((code % (MEDIALS * FINALS)) / FINALS), final: code % FINALS });
  }
  return out;
}

function join(syllables: Syllable[]): string {
  return syllables.map(({ initial, medial, final }) => String.fromCharCode(BASE + (initial * MEDIALS + medial) * FINALS + final)).join('');
}

// Medial pairs Whisper confuses in short names (ㅗ/ㅜ, ㅓ/ㅗ, ㅔ/ㅐ, ㅕ/ㅖ, ㅖ/ㅐ, ㅓ/ㅏ, ㅔ/ㅖ).
const MEDIAL_SWAPS: [number, number][] = [[8, 13], [4, 8], [5, 1], [6, 7], [7, 1], [4, 0], [5, 7]];
// Endings it confuses: 솜→송, 봄→봉, 망→만.
const FINAL_SWAPS: [number, number][] = [[Final.NG, Final.M], [Final.N, Final.NG], [Final.N, Final.M]];
const I_MEDIAL = 20;

// Edit cost: how often each sound-alike error appeared (a dropped ㅎ most, a surname slip least).
type Variant = { syllables: Syllable[]; cost: number };

function jamoDistance(a: Syllable, b: Syllable): number {
  return Number(a.initial !== b.initial) + Number(a.medial !== b.medial) + Number(a.final !== b.final);
}

const SURNAME_SYLLABLES = SURNAME_LIST.map((surname) => split(surname)![0]);
// Surnames beyond this rank are rare: a rare one heard may be a common one (창→장, 인→임).
const FREQUENT_SURNAMES = 40;
const INITIAL_OF_FINAL: Partial<Record<number, number>> = {
  [Final.G]: Initial.G, [Final.N]: Initial.N, [Final.R]: Initial.R, [Final.M]: Initial.M, [Final.B]: Initial.B,
};
const FINAL_OF_INITIAL: Partial<Record<number, number>> = Object.fromEntries(
  Object.entries(INITIAL_OF_FINAL).map(([final, initial]) => [initial, Number(final)]),
);

function oneEditVariants(syllables: Syllable[], surnameLength: number): Variant[] {
  const variants: Variant[] = [];
  const copy = () => syllables.map((s) => ({ ...s }));
  const push = (v: Syllable[], cost: number) => variants.push({ syllables: v, cost });
  const surname = join(syllables.slice(0, surnameLength));
  // A surname that does not exist was misheard: offer real ones one or two sounds away
  // (관→권, 닥→박, 풍→홍). A real surname is never replaced (순/선 are both surnames).
  const rank = SURNAME_LIST.indexOf(surname);
  if (surnameLength === 1 && (rank < 0 || rank >= FREQUENT_SURNAMES)) {
    SURNAME_SYLLABLES.forEach((real, realRank) => {
      const distance = jamoDistance(syllables[0], real);
      // An unknown surname may be any real one; a rare real one only a frequent one.
      if (distance === 0 || distance > (rank < 0 ? 2 : 1) || (rank >= 0 && realRank >= FREQUENT_SURNAMES)) return;
      const v = copy();
      v[0] = { ...real };
      push(v, distance + 1);
    });
  }
  // The surname's final consonant carried into the given name: 탁예린 → 타게린, 염하은 → 여마은.
  const carried = FINAL_OF_INITIAL[syllables[1]?.initial ?? -1];
  if (surnameLength === 1 && syllables.length >= 3 && syllables[0].final === Final.None && carried !== undefined) {
    const v = copy();
    v[0].final = carried;
    v[1].initial = Initial.O;
    push(v, 1);
  }
  if (surnameLength === 1 && syllables.length >= 3) {
    // 남국민 for 남궁민: the first two syllables are a compound surname one sound off.
    for (const compound of COMPOUND_SURNAMES) {
      const parts = split(compound)!;
      const distance = jamoDistance(syllables[0], parts[0]) + jamoDistance(syllables[1], parts[1]);
      // 최갈/채갈 for 제갈: up to two sounds off when the second syllable is exact.
      if (distance === 0 || distance > (jamoDistance(syllables[1], parts[1]) === 0 ? 2 : 1)) continue;
      const v = copy();
      v[0] = { ...parts[0] };
      v[1] = { ...parts[1] };
      push(v, distance);
    }
  }
  syllables.forEach((syllable, index) => {
    if (index < surnameLength) return;
    // ㅎ dropped or added between vowels/sonorants: 하은↔아은, 도현↔도연.
    if (syllable.initial === Initial.O) { const v = copy(); v[index].initial = Initial.H; push(v, 1); }
    if (syllable.initial === Initial.H) { const v = copy(); v[index].initial = Initial.O; push(v, 2); }
    for (const [a, b] of MEDIAL_SWAPS) {
      if (syllable.medial === a || syllable.medial === b) {
        const v = copy(); v[index].medial = syllable.medial === a ? b : a; push(v, 2);
      }
    }
    for (const [a, b] of FINAL_SWAPS) {
      if (syllable.final === a || syllable.final === b) {
        const v = copy(); v[index].final = syllable.final === a ? b : a; push(v, 2);
      }
    }
    // A final consonant moved to a following "이" (신누리예요 → 신놀이에요 → "신놀").
    const moved = INITIAL_OF_FINAL[syllable.final];
    if (syllables.length === surnameLength + 1 && moved !== undefined) {
      const v = copy();
      v[index].final = Final.None;
      v.push({ initial: moved, medial: I_MEDIAL, final: Final.None });
      push(v, 1);
    }
    const next = syllables[index + 1];
    if (!next) return;
    // Liaison undone: 유나→윤아, 소나린→손아린.
    if (syllable.final === Final.None && [Initial.N, Initial.M, Initial.R].includes(next.initial)) {
      const v = copy();
      v[index].final = next.initial === Initial.N ? Final.N : next.initial === Initial.M ? Final.M : Final.R;
      v[index + 1].initial = Initial.O;
      push(v, 1);
    }
    // Liaison added back: 윤아 heard for 유나 (rare, kept for symmetry).
    if ([Final.N, Final.M].includes(syllable.final) && next.initial === Initial.O) {
      const v = copy();
      v[index + 1].initial = syllable.final === Final.N ? Initial.N : Initial.M;
      v[index].final = Final.None;
      push(v, 2);
    }
  });
  // "임찬이에요" may be "임찬희예요": the heard one-syllable given name plus "이".
  if (surnameLength === 1 && syllables.length === 2) {
    push([...copy(), { initial: Initial.O, medial: I_MEDIAL, final: Final.None }], 1);
  }
  // Nasalisation undone: 남국민 for 남궁민 (ㅇ↔ㄱ before ㄴ/ㅁ).
  syllables.forEach((syllable, index) => {
    const next = syllables[index + 1];
    if (next && [Initial.N, Initial.M].includes(next.initial) && (syllable.final === Final.G || syllable.final === Final.NG)) {
      const v = copy(); v[index].final = syllable.final === Final.G ? Final.NG : Final.G; push(v, 1);
    }
  });
  return variants;
}

function surnameLength(name: string): number {
  return COMPOUND_SURNAMES.some((surname) => name.startsWith(surname)) && name.length >= 3 ? 2 : 1;
}

function givenNameScore(given: string, compound: boolean): number {
  if (COMMON_GIVEN_NAMES.has(given) || NATIVE_GIVEN_NAMES.has(given)) return 3;
  const syllables = [...given];
  // A rarer name made only of name syllables (태경, 혜림); one syllable only after 남궁/선우.
  const lengthOk = syllables.length === 2 || (syllables.length === 1 && compound);
  return lengthOk && syllables.every((syllable) => NAME_SYLLABLES.has(syllable)) ? 1 : 0;
}

function plausibility(name: string): number {
  const length = surnameLength(name);
  const surname = name.slice(0, length);
  const score = length === 2 || COMMON_SURNAMES.has(surname) ? 2 : 0;
  return score + givenNameScore(name.slice(length), length === 2);
}

function surnameRank(name: string): number {
  const index = SURNAME_LIST.indexOf(name.slice(0, surnameLength(name)));
  return index < 0 ? SURNAME_LIST.length : index;
}

/**
 * Up to `limit` distinct spellings, the heard one first. Each candidate is at most two
 * sound-alike edits away, has a real surname and a name-like given name, and looks at
 * least as name-like as what was heard.
 */
export function spokenNameCandidates(heard: string, limit = 4): string[] {
  const name = heard.trim();
  const syllables = split(name);
  if (!syllables || syllables.length < 2 || syllables.length > 5) return name ? [name] : [];
  const base = plausibility(name);
  const scored = new Map<string, number>();
  const add = (candidate: string, cost: number) => {
    if (candidate === name) return;
    const length = surnameLength(candidate);
    if (length === 1 && !COMMON_SURNAMES.has(candidate.slice(0, 1))) return;
    const given = givenNameScore(candidate.slice(length), length === 2);
    if (given === 0) return;
    const gain = plausibility(candidate) - base;
    // A name known only by its syllables must beat what was heard ("정아은" never offers "정아음").
    if (gain < 0 || (given < 3 && gain === 0)) return;
    const score = gain * 2 - cost * 3;
    if ((scored.get(candidate) ?? -Infinity) < score) scored.set(candidate, score);
  };
  const first = oneEditVariants(syllables, surnameLength(name));
  for (const variant of first) add(join(variant.syllables), variant.cost);
  for (const variant of first) {
    const variantName = join(variant.syllables);
    for (const second of oneEditVariants(variant.syllables, surnameLength(variantName))) {
      add(join(second.syllables), variant.cost + second.cost);
    }
  }
  const ranked = [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || surnameRank(a[0]) - surnameRank(b[0]))
    .map(([candidate]) => candidate);
  return [name, ...ranked].slice(0, limit);
}

/**
 * The spelling to ask about first: the heard one, unless it cannot be a name (no such
 * surname: "관도현", or a given name with non-name syllables: "권세봉") and a candidate can.
 * A rare but real name ("김민수" outside the birth rankings) is never replaced.
 */
export function preferredSpokenName(heard: string): string {
  const [first, second] = spokenNameCandidates(heard, 2);
  if (!second) return first ?? heard.trim();
  const length = surnameLength(first);
  const realSurname = length === 2 || COMMON_SURNAMES.has(first.slice(0, 1));
  const nameLike = givenNameScore(first.slice(length), length === 2) > 0;
  return realSurname && nameLike ? first : second;
}
