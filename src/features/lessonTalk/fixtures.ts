/** A beginner role-play turn as the server sends it (lesson_talk_turn). */
export const TURN = {
  talkId: 'talk-test01', seq: 3, stage: 'turn',
  lines: [
    { lang: 'ko', text: '이제 내가 상대 역할을 할게.', role: 'coach' },
    { lang: 'en', text: 'Hi! What would you like?', role: 'role', subtitleKo: '안녕하세요! 무엇을 드릴까요?' },
  ],
  expect: { kind: 'speech', listenLang: 'en' },
  progress: { lessonId: 'request_beginner', titleKo: '원하는 것 부탁하기', topicId: 'daily', level: 'beginner',
    turnIndex: 0, turnTotal: 5, expressionEn: 'Can I have ___, please?' },
  display: { en: 'Hi! What would you like?', ko: '안녕하세요! 무엇을 드릴까요?' },
};
