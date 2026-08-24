const INTRODUCTION_PREFIX = /^(?:(?:음|어|저기|안녕하세요)[,\s]*)*(?:(?:제|내|저의)\s*이름(?:은|이|을)?|이름(?:은|이)?|닉네임(?:은|이)?|별명(?:은|이)?|저는|나는|난|전|저를|나를)\s*/;
const WRAPPING_QUOTES = /^["'“”‘’]+|["'“”‘’]+$/g;

export type SpokenNameExtraction = {
  name: string;
  confidence: 'high' | 'medium';
};

const LEADING_FILLERS = /^(?:(?:음|어|저기|안녕하세요|그냥)[,\s]*)+/;
const RESIDUAL_SPEECH = /(?:이름|닉네임|별명|말이야|이?\s*라고|불러|부르면|말해|말할|들었|해\s*줘|해주세요|할게요|좋아요|입니다|이에요|예요)/;

const SPOKEN_NAME_PATTERNS: RegExp[] = [
  // "내 이름은 권태혁이라고 하고, 아마 그렇게 불러주면 될 거 같아"
  /^(?:(?:제|내|저의)\s*)?(?:이름|닉네임|별명)(?:은|이|을)?(?:\s*말이야)?[,\s]+(.+?)\s*(?:이라고|라고)\s*하고[,\s]*(?:(?:아마|그냥)\s*)?(?:(?:그냥|그렇게)\s*)*불러\s*(?:주면|주시면)\s*(?:될\s*(?:거|것)\s*같(?:아|아요)|돼(?:요)?|됩니다)$/,
  // "나는 태혁이라고 하고 그냥 그렇게 불러주면 돼"
  /^(?:저는|나는|난|전)\s+(.+?)\s*(?:이라고|라고)\s*하고[,\s]*(?:(?:아마|그냥)\s*)?(?:(?:그냥|그렇게)\s*)*불러\s*(?:주면|주시면)\s*(?:될\s*(?:거|것)\s*같(?:아|아요)|돼(?:요)?|됩니다)$/,
  // "권태혁이라고 하고 그렇게 불러주면 될 거 같아"
  /^(.+?)\s*(?:이라고|라고)\s*하고[,\s]*(?:(?:아마|그냥)\s*)?(?:(?:그냥|그렇게)\s*)*불러\s*(?:주면|주시면)\s*(?:될\s*(?:거|것)\s*같(?:아|아요)|돼(?:요)?|됩니다)$/,
  // "내 이름 말이야, 권태혁이야", "닉네임은 Sunny라고 해요"
  /^(?:(?:제|내|저의)\s*)?(?:이름|닉네임|별명)(?:은|이|을)?(?:\s*말이야)?[,\s]+(.+?)(?:\s*(?:이라고|라고)\s*(?:해|해요|합니다|말해요)?)?(?:입니다|이에요|예요|이야|야)?$/,
  // "나는 권태혁이야"
  /^(?:저는|나는|난|전)\s+(.+?)(?:입니다|이에요|예요|이야|야)$/,
  // "저를 태혁이라고 불러 주세요", "태혁이라고 부르면 돼"
  /^(?:(?:저|나)를\s+)?(.+?)(?:이라고|라고|으로)\s*(?:불러(?:\s*(?:줘요?|주세요|요))?|부르면\s*(?:돼|돼요|됩니다))$/,
  // "권태혁이라고", "권태혁이라고 해"
  /^(.+?)(?:이라고|라고)(?:\s*(?:해|해요|해줘요?|합니다|말해요))?$/,
  // "권태혁입니다", "지수예요", "권태혁이요"
  /^(.+?)(?:입니다|이에요|예요|이요)$/,
];

function normalizeSpeechText(transcript: string) {
  return transcript
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING_FILLERS, '')
    .replace(/^[,\s]+|[,\s.!?]+$/g, '')
    .trim();
}

function cleanNameCandidate(candidate: string) {
  return candidate
    .replace(WRAPPING_QUOTES, '')
    .replace(/^[,\s]+|[,\s.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSafeExtractedCandidate(candidate: string) {
  return isPlausibleSpokenName(candidate) && !RESIDUAL_SPEECH.test(candidate);
}

export function extractSpokenName(transcript: string): SpokenNameExtraction | null {
  const normalized = normalizeSpeechText(transcript);
  if (!normalized) return null;

  for (const pattern of SPOKEN_NAME_PATTERNS) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const name = cleanNameCandidate(match[1]);
    if (isSafeExtractedCandidate(name)) return { name, confidence: 'high' };
    return null;
  }

  const bareName = cleanNameCandidate(normalized);
  if (!isSafeExtractedCandidate(bareName)) return null;

  const containsHangul = /[\p{Script=Hangul}]/u.test(bareName);
  // A Korean name or nickname is normally one STT token. Requiring that for
  // bare input prevents ordinary Korean sentences from becoming a name.
  if (containsHangul && (bareName.includes(' ') || [...bareName].length > 10)) return null;
  const wordCount = bareName.split(' ').length;
  if (!containsHangul && wordCount > 3) return null;

  return { name: bareName, confidence: 'medium' };
}

export function normalizeSpokenName(transcript: string): string {
  return extractSpokenName(transcript)?.name ?? '';
}

export function isPlausibleSpokenName(name: string): boolean {
  if (name.length < 1 || name.length > 30) return false;
  return /^[\p{L}][\p{L}\s\-'’·]*$/u.test(name);
}

export const CORRECTION_KEYWORDS = [
  '아니', '아니요', '아뇨', '아닙니다', '아니야', '아니에요', '아녀요', '아냐', '아녀',
  '아닌데', '아닌데요', '아니라고', '아니고', '아니다', '아니잖아', '안해', '안할래',
  '노', '노노', '놉', 'no', '에이', '수정', '수정해', '수정해줘', '고쳐', '고쳐줘',
  '다시', '다시해', '다시해줘', '다시말할게', '다시말해', '다시할래', '처음부터',
  '바꿔', '바꿔줘', '변경', '변경해', '취소', '취소해', '그만', '멈춰', '잘못',
  '잘못됐어', '틀렸어', '틀림', '그거말고', '그거아니야',
] as const;

export const CONFIRMATION_KEYWORDS = [
  '네', '예', '어', '맞습니다', '맞아요', '맞아', '마자', '맞다', '맞어', '맞음', '맞구먼',
  '그렇습니다', '그렇지', '그치', '그래', '그레', '구래', '좋아요', '좋아', '조아', '좋지',
  '좋다', '내', '녜', '응', '웅', '엉', 'ㅇㅇ', '오케이', '오케', '오키', '콜', '콜이요',
  '고', '렛츠고', '당근', '가즈아', '고고', '만들어', '만들어줘', '해줘', '해 줘',
  '진행', '진행해', '진행시켜', '시작', '시작해', '부탁해', '알았어', '알겠어',
  '알겠습니다', '가자',
  'yes',
] as const;

function normalizeIntentText(text: string) {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function includesIntentKeyword(normalized: string, keyword: string) {
  const normalizedKeyword = normalizeIntentText(keyword);
  if (!normalizedKeyword) return false;
  const words = normalized.split(' ').filter(Boolean);
  const compactText = words.join('');
  const compactKeyword = normalizedKeyword.replace(/\s/g, '');

  // Single-syllable acknowledgements such as "어" and "내" must be a full
  // token. Substring matching them would turn unrelated words into consent.
  if ([...compactKeyword].length === 1 || /^[a-z]+$/.test(compactKeyword)) {
    return words.includes(compactKeyword);
  }
  return compactText.includes(compactKeyword);
}

export function classifyConfirmation(transcript: string): 'yes' | 'no' | 'unknown' {
  // Restating a name during confirmation means the current candidate should
  // not be accepted, even when STT transcribes "네" as the keyword "내".
  if (INTRODUCTION_PREFIX.test(transcript.normalize('NFKC').trim())) return 'no';
  const normalized = normalizeIntentText(transcript);
  if (!normalized) return 'unknown';
  // A correction wins when a sentence contains both intents, for example
  // "아니고 권태혁이 맞아". Retrying is safer than confirming a wrong name.
  if (CORRECTION_KEYWORDS.some((keyword) => includesIntentKeyword(normalized, keyword))) return 'no';
  if (CONFIRMATION_KEYWORDS.some((keyword) => includesIntentKeyword(normalized, keyword))) return 'yes';
  return 'unknown';
}
