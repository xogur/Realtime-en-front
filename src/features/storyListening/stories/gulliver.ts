import type { FeelingChoice, Story } from '../types';

/*
 * Jonathan Swift, "Gulliver's Travels" (1726), Part I "A Voyage to Lilliput",
 * retold in easy English for children and their parents. The original events
 * are kept (the storm, the ropes, the pocket search, the egg war, the stolen
 * fleet, the palace fire, the escape and the tiny cattle); the fire is put out
 * with a hat of lake water instead of the original. Eight short chapters.
 */

const SURPRISED: FeelingChoice = { en: 'Surprised', ko: '깜짝 놀랐어요', face: '😲' };
const SLEEPY: FeelingChoice = { en: 'Sleepy', ko: '졸려요', face: '😴' };
const ANGRY: FeelingChoice = { en: 'Angry', ko: '화나요', face: '😠' };
const AMUSED: FeelingChoice = { en: 'Amused', ko: '웃겨요', face: '😆' };
const SCARED: FeelingChoice = { en: 'Scared', ko: '무서워요', face: '😨' };

export const GULLIVER: Story = {
  id: 'gulliver',
  title: 'Gulliver in Lilliput',
  titleKo: '걸리버 여행기: 소인국',
  summaryKo: '폭풍을 만나 낯선 바닷가에 쓰러진 걸리버. 눈을 떠 보니 손가락만 한 사람들이 온몸을 꽁꽁 묶어 놓았어요! 거인이 된 걸리버의 신기하고 웃긴 소인국 모험을 들어 봐요.',
  levelKo: '초급',
  ageKo: '어린이부터 어른까지',
  sourceKo: '조너선 스위프트 『걸리버 여행기』(1726) 1부 「소인국 여행」을 쉬운 영어로 다시 쓴 이야기',
  handsOnKo: '거인에게 밥을 주고, 적의 배를 끌어 오고, 불난 궁전에 물도 부어 봐요!',
  cover: { chapterId: 'tied', beats: [0, 1, 2, 3, 4] },
  narration: 'recorded',
  chapters: [
    {
      id: 'storm',
      title: 'The Storm',
      titleKo: '폭풍',
      sentences: [
        { beat: 0, en: 'Long ago, a ship doctor named Gulliver loved to sail to faraway lands.', ko: '옛날 옛적, 걸리버라는 배의 의사가 먼 나라로 항해하는 것을 무척 좋아했어요.' },
        { beat: 1, en: 'One night, a terrible storm hit his ship.', ko: '어느 날 밤, 무시무시한 폭풍이 그의 배를 덮쳤어요.' },
        { beat: 2, en: 'Big waves broke the ship, and Gulliver fell into the cold sea.', ko: '커다란 파도가 배를 부쉈고, 걸리버는 차가운 바다에 빠지고 말았어요.' },
        {
          beat: 3, en: 'He swam and swam until his feet touched the sand.', ko: '그는 발이 모래에 닿을 때까지 헤엄치고 또 헤엄쳤어요.',
          action: { kind: 'hold', target: 'gulliver', promptEn: 'Keep Gulliver swimming! Press and hold.', promptKo: '걸리버를 꾹 눌러 계속 헤엄치게 해 줘요!' },
        },
        { beat: 4, en: 'He was so tired that he lay down on the soft grass.', ko: '그는 너무 지쳐서 부드러운 풀밭 위에 누웠어요.' },
        { beat: 4, en: 'Soon, he fell fast asleep under the stars.', ko: '곧 그는 별빛 아래에서 깊이 잠들었어요.' },
      ],
      words: [
        { word: 'ship', ko: '배', hotspot: 'ship', beat: 0 },
        { word: 'storm', ko: '폭풍', hotspot: 'storm', beat: 1 },
        { word: 'wave', ko: '파도', hotspot: 'waves', beat: 2 },
        { word: 'grass', ko: '풀밭', hotspot: 'grass', beat: 4 },
      ],
      quiz: {
        question: 'Why did Gulliver fall into the sea?',
        questionKo: '걸리버는 왜 바다에 빠졌나요?',
        options: ['A storm broke his ship.', 'He wanted to swim.', 'A whale pushed him.'],
        optionsKo: ['폭풍이 배를 부숴서', '수영하고 싶어서', '고래가 밀어서'],
        answer: 0,
        evidence: 2,
        explainKo: '무시무시한 폭풍(storm)과 커다란 파도가 배를 부숴서 걸리버가 바다에 빠졌어요.',
      },
    },
    {
      id: 'tied',
      title: 'Tied Down',
      titleKo: '꽁꽁 묶인 거인',
      sentences: [
        { beat: 0, en: 'When Gulliver woke up, the sun was shining, but he could not move!', ko: '걸리버가 눈을 떴을 때 햇살이 비치고 있었지만, 그는 꼼짝도 할 수 없었어요!' },
        { beat: 1, en: 'His arms, his legs and even his long hair were tied down with tiny ropes.', ko: '팔과 다리, 심지어 긴 머리카락까지 아주 작은 밧줄로 땅에 묶여 있었어요.' },
        { beat: 2, en: 'Then something walked up his leg and stood on his chest.', ko: '그때 무언가가 그의 다리를 타고 올라와 가슴 위에 섰어요.' },
        {
          beat: 3, en: 'It was a little man, no bigger than Gulliver\'s finger!', ko: '그건 걸리버의 손가락보다 크지 않은 아주 작은 사람이었어요!',
          action: { kind: 'tap', target: 'tinyman', promptEn: 'Tap the little man to look closer.', promptKo: '작은 사람을 눌러 자세히 봐요.' },
        },
        { beat: 4, en: 'Hundreds more stood around him with tiny bows and arrows.', ko: '수백 명이 더 작은 활과 화살을 들고 그를 둘러싸고 있었어요.' },
        { beat: 4, en: 'The arrows felt like needles. "Ouch!" cried Gulliver.', ko: '화살은 바늘처럼 따끔했어요. "아야!" 걸리버가 소리쳤어요.', bubble: { speaker: 'Gulliver', text: 'Ouch!' } },
        {
          beat: 5, en: 'He rubbed his face and decided to be gentle with the tiny people.', ko: '그는 얼굴을 문지르고, 작은 사람들에게 다정하게 대하기로 마음먹었어요.',
          action: { kind: 'rub', target: 'face', promptEn: 'Rub Gulliver\'s face to stop the sting.', promptKo: '걸리버 얼굴을 문질러 따끔한 걸 달래 줘요.' },
        },
      ],
      words: [
        { word: 'rope', ko: '밧줄', hotspot: 'ropes', beat: 1 },
        { word: 'chest', ko: '가슴', hotspot: 'chest', beat: 2 },
        { word: 'finger', ko: '손가락', hotspot: 'tinyman', beat: 3 },
        { word: 'arrow', ko: '화살', hotspot: 'archers', beat: 4 },
      ],
      quiz: {
        question: 'How big was the little man?',
        questionKo: '걸리버 가슴 위의 사람은 얼마나 작았나요?',
        options: ['As big as a horse', 'No bigger than a finger', 'As tall as a tree'],
        optionsKo: ['말만큼 컸어요', '손가락보다 크지 않았어요', '나무만큼 키가 컸어요'],
        answer: 1,
        evidence: 3,
        explainKo: '작은 사람은 걸리버의 손가락(finger)보다 크지 않았어요. 정말 작은 사람들의 나라였죠!',
      },
    },
    {
      id: 'food',
      title: 'A Giant Breakfast',
      titleKo: '거인의 아침밥',
      sentences: [
        { beat: 0, en: 'Gulliver pointed to his mouth. He was very, very hungry.', ko: '걸리버는 자기 입을 가리켰어요. 그는 정말, 정말 배가 고팠어요.', bubble: { speaker: 'Gulliver', text: "I'm so hungry!" } },
        { beat: 1, en: 'The little people climbed up ladders with baskets of food.', ko: '작은 사람들이 음식 바구니를 들고 사다리를 타고 올라왔어요.' },
        {
          beat: 2, en: 'Each loaf of bread was as small as a cookie, so he ate three at a time.', ko: '빵 한 덩이가 쿠키만큼 작아서, 그는 한 번에 세 개씩 먹었어요.',
          action: { kind: 'tap', target: 'basket', count: 3, promptEn: 'Feed Gulliver! Tap the basket three times.', promptKo: '바구니를 세 번 눌러 걸리버에게 밥을 줘요!' },
        },
        { beat: 3, en: 'He drank a whole barrel of milk in just one sip.', ko: '그는 우유 한 통을 딱 한 모금에 다 마셨어요.' },
        { beat: 3, en: 'The tiny people cheered and danced on his hand.', ko: '작은 사람들은 환호하며 그의 손 위에서 춤을 췄어요.' },
        { beat: 4, en: 'Then nine hundred workers lifted him onto a giant wagon.', ko: '그다음 일꾼 구백 명이 그를 커다란 수레 위로 들어 올렸어요.' },
        { beat: 5, en: 'Fifteen hundred little horses pulled him all the way to their city.', ko: '작은 말 천오백 마리가 그를 그들의 도시까지 끌고 갔어요.' },
      ],
      words: [
        { word: 'basket', ko: '바구니', hotspot: 'basket', beat: 1 },
        { word: 'barrel', ko: '통', hotspot: 'barrel', beat: 3 },
        { word: 'wagon', ko: '수레', hotspot: 'wagon', beat: 4 },
        { word: 'horse', ko: '말', hotspot: 'horses', beat: 5 },
      ],
      quiz: {
        question: 'How did Gulliver get to the city?',
        questionKo: '걸리버는 어떻게 도시까지 갔나요?',
        options: ['He walked there by himself.', 'Little horses pulled him on a wagon.', 'He flew on a bird.'],
        optionsKo: ['혼자 걸어갔어요', '작은 말들이 수레에 태워 끌고 갔어요', '새를 타고 날아갔어요'],
        answer: 1,
        evidence: 6,
        explainKo: '일꾼들이 걸리버를 커다란 수레(wagon)에 올리고, 작은 말(horse) 천오백 마리가 끌고 갔어요.',
      },
    },
    {
      id: 'pockets',
      title: 'The Emperor and the Pockets',
      titleKo: '황제와 걸리버의 주머니',
      sentences: [
        { beat: 0, en: 'The country was called Lilliput, and it had a tiny emperor.', ko: '그 나라의 이름은 릴리퍼트였고, 아주 작은 황제가 있었어요.' },
        { beat: 1, en: 'The emperor rode up on his little horse and looked up bravely.', ko: '황제는 작은 말을 타고 다가와 씩씩하게 걸리버를 올려다보았어요.' },
        { beat: 1, en: '"Promise to be our friend, and we will set you free," he said.', ko: '"우리 친구가 되겠다고 약속하면 풀어 주겠노라." 황제가 말했어요.', bubble: { speaker: 'Emperor', text: 'Be our friend!' } },
        { beat: 2, en: 'Gulliver promised, and two officers climbed into his pockets to search them.', ko: '걸리버가 약속하자, 관리 두 명이 그의 주머니 안으로 들어가 살펴보았어요.' },
        {
          beat: 3, en: 'They found a huge silver box full of brown dust that made them sneeze.', ko: '그들은 재채기가 나는 갈색 가루가 가득한 커다란 은색 상자를 찾았어요.',
          action: { kind: 'tap', target: 'pocket', promptEn: 'Tap the pocket to look inside.', promptKo: '주머니를 눌러 안을 들여다봐요.' },
        },
        { beat: 4, en: 'Then they found a strange machine that went tick, tick, tick.', ko: '그다음엔 째깍, 째깍, 째깍 소리를 내는 이상한 기계를 찾았어요.' },
        {
          beat: 5, en: '"It must be his god," they whispered, "because he looks at it all the time!"', ko: '"이건 분명 저 거인의 신일 거야." 그들이 속삭였어요. "저걸 늘 들여다보거든!"',
          bubble: { speaker: 'Officer', text: 'Is it his god?' },
          action: {
            kind: 'feel', target: 'officers', promptEn: 'How did the officers feel about the ticking machine?', promptKo: '째깍거리는 기계를 본 관리들은 어떤 기분이었을까요?',
            choices: [SURPRISED, SLEEPY, ANGRY], answer: 0,
          },
        },
      ],
      words: [
        { word: 'emperor', ko: '황제', hotspot: 'emperor', beat: 1 },
        { word: 'pocket', ko: '주머니', hotspot: 'pocket', beat: 2 },
        { word: 'box', ko: '상자', hotspot: 'box', beat: 3 },
        { word: 'machine', ko: '기계', hotspot: 'watch', beat: 4 },
      ],
      quiz: {
        question: 'What did the officers think the ticking machine was?',
        questionKo: '관리들은 째깍거리는 기계를 무엇이라고 생각했나요?',
        options: ['A toy', "Gulliver's god", 'A tiny house'],
        optionsKo: ['장난감', '걸리버의 신', '작은 집'],
        answer: 1,
        evidence: 6,
        explainKo: '걸리버가 늘 들여다보는 시계를 보고, 관리들은 그것이 걸리버의 신(god)이라고 생각했어요.',
      },
    },
    {
      id: 'eggs',
      title: 'The Egg War',
      titleKo: '달걀 전쟁',
      sentences: [
        { beat: 0, en: 'Soon, Gulliver became good friends with the little people.', ko: '곧 걸리버는 작은 사람들과 좋은 친구가 되었어요.' },
        { beat: 1, en: 'One day, a wise old minister told him a secret.', ko: '어느 날, 지혜로운 늙은 대신이 그에게 비밀 하나를 알려 주었어요.' },
        { beat: 2, en: 'Lilliput was at war with Blefuscu, an island across the sea.', ko: '릴리퍼트는 바다 건너 섬나라 블레퓨스쿠와 전쟁 중이었어요.' },
        { beat: 3, en: 'And do you know why? It was all about eggs!', ko: '그런데 왜인지 아나요? 모두 달걀 때문이었어요!' },
        {
          beat: 4, en: 'In Lilliput, people had to break their eggs on the small end.', ko: '릴리퍼트에서는 달걀을 꼭 뾰족한 작은 쪽으로 깨야 했어요.',
          action: { kind: 'tap', target: 'egg', promptEn: 'Crack the egg on the small end!', promptKo: '달걀의 작은 쪽을 눌러 톡 깨 봐요!' },
        },
        { beat: 5, en: 'But in Blefuscu, people broke their eggs on the big end.', ko: '하지만 블레퓨스쿠에서는 달걀을 둥근 큰 쪽으로 깼어요.' },
        {
          beat: 6, en: 'Gulliver tried hard not to laugh. "A war about eggs?" he thought.', ko: '걸리버는 웃음을 꾹 참았어요. "달걀 때문에 전쟁을?" 그는 생각했어요.',
          bubble: { speaker: 'Gulliver', text: 'A war about eggs?' },
          action: {
            kind: 'feel', target: 'gulliver', promptEn: 'How did Gulliver feel about the egg war?', promptKo: '달걀 전쟁 이야기를 들은 걸리버는 어떤 기분이었을까요?',
            choices: [SCARED, AMUSED, SLEEPY], answer: 1,
          },
        },
      ],
      words: [
        { word: 'minister', ko: '대신', hotspot: 'minister', beat: 1 },
        { word: 'island', ko: '섬', hotspot: 'island', beat: 2 },
        { word: 'egg', ko: '달걀', hotspot: 'egg', beat: 3 },
        { word: 'laugh', ko: '웃다', hotspot: 'gulliver', beat: 6 },
      ],
      quiz: {
        question: 'Why were Lilliput and Blefuscu at war?',
        questionKo: '릴리퍼트와 블레퓨스쿠는 왜 전쟁을 했나요?',
        options: ['Because of gold', 'Because of the way to break eggs', 'Because of a giant'],
        optionsKo: ['금 때문에', '달걀을 깨는 방법 때문에', '거인 때문에'],
        answer: 1,
        evidence: 3,
        explainKo: '한 나라는 달걀(egg)을 작은 쪽으로, 다른 나라는 큰 쪽으로 깼어요. 그 차이 때문에 전쟁을 했대요!',
      },
    },
    {
      id: 'fleet',
      title: 'Fifty Ships',
      titleKo: '쉰 척의 배',
      sentences: [
        { beat: 0, en: 'Soon, fifty warships from Blefuscu were ready to attack Lilliput.', ko: '곧 블레퓨스쿠의 군함 쉰 척이 릴리퍼트를 공격할 준비를 마쳤어요.' },
        { beat: 1, en: 'Gulliver had a clever plan. He made fifty strong hooks.', ko: '걸리버에게 영리한 계획이 있었어요. 그는 튼튼한 갈고리 쉰 개를 만들었어요.' },
        { beat: 2, en: 'He walked into the sea. The deep water came only up to his chest.', ko: '그는 바다로 걸어 들어갔어요. 깊은 물이 그의 가슴까지밖에 오지 않았어요.' },
        { beat: 3, en: 'Enemy soldiers shot arrows, so he put on his glasses to save his eyes.', ko: '적 병사들이 화살을 쏘자, 그는 눈을 지키려고 안경을 썼어요.' },
        {
          beat: 4, en: 'He hooked every ship and pulled them all back to Lilliput!', ko: '그는 모든 배에 갈고리를 걸어 릴리퍼트로 몽땅 끌고 왔어요!',
          action: { kind: 'hold', target: 'ropes', promptEn: 'Pull the ships! Press and hold the ropes.', promptKo: '밧줄을 꾹 눌러 배들을 끌어 와요!' },
        },
        { beat: 5, en: '"Long live the great Gulliver!" shouted the little people.', ko: '"위대한 걸리버 만세!" 작은 사람들이 외쳤어요.', bubble: { speaker: 'People', text: 'Hooray for Gulliver!' } },
      ],
      words: [
        { word: 'hook', ko: '갈고리', hotspot: 'hooks', beat: 1 },
        { word: 'sea', ko: '바다', hotspot: 'sea', beat: 2 },
        { word: 'glasses', ko: '안경', hotspot: 'glasses', beat: 3 },
        { word: 'ship', ko: '배', hotspot: 'fleet', beat: 4 },
      ],
      quiz: {
        question: 'Why did Gulliver put on his glasses?',
        questionKo: '걸리버는 왜 안경을 썼나요?',
        options: ['To read a book', 'To save his eyes from the arrows', 'To look cool'],
        optionsKo: ['책을 읽으려고', '화살로부터 눈을 지키려고', '멋있어 보이려고'],
        answer: 1,
        evidence: 3,
        explainKo: '적 병사들이 화살(arrow)을 쏘아서, 걸리버는 눈을 지키려고 안경(glasses)을 썼어요.',
      },
    },
    {
      id: 'fire',
      title: 'Fire in the Palace',
      titleKo: '궁전에 불이 났어요',
      sentences: [
        { beat: 0, en: 'One night, Gulliver heard tiny bells ringing everywhere.', ko: '어느 날 밤, 걸리버는 사방에서 울리는 작은 종소리를 들었어요.', bubble: { speaker: 'People', text: 'Fire! Fire!' } },
        { beat: 1, en: 'The royal palace was on fire!', ko: '왕궁에 불이 났어요!' },
        { beat: 2, en: 'The little people threw water with buckets as small as teacups.', ko: '작은 사람들은 찻잔만 한 양동이로 물을 끼얹었어요.' },
        { beat: 3, en: 'But it was not enough. The fire grew bigger and bigger.', ko: '하지만 어림도 없었어요. 불길은 점점 더 커졌어요.' },
        {
          beat: 4, en: 'Gulliver filled his hat with water from the lake and poured it on the palace.', ko: '걸리버는 모자에 호수 물을 가득 담아 궁전 위에 부었어요.',
          action: { kind: 'tap', target: 'hat', promptEn: 'Pour the water! Tap the hat.', promptKo: '모자를 눌러 물을 부어요!' },
        },
        { beat: 5, en: 'Splash! The fire went out, and the palace was safe.', ko: '철썩! 불이 꺼졌고, 궁전은 무사했어요.' },
        { beat: 6, en: 'But some ministers frowned. "He is too big and too dangerous," they said.', ko: '하지만 몇몇 대신들은 얼굴을 찌푸렸어요. "저 거인은 너무 크고 위험해." 그들이 말했어요.', bubble: { speaker: 'Minister', text: 'He is dangerous!' } },
      ],
      words: [
        { word: 'bell', ko: '종', hotspot: 'bells', beat: 0 },
        { word: 'palace', ko: '궁전', hotspot: 'palace', beat: 1 },
        { word: 'bucket', ko: '양동이', hotspot: 'buckets', beat: 2 },
        { word: 'hat', ko: '모자', hotspot: 'hat', beat: 4 },
      ],
      quiz: {
        question: 'How did Gulliver put out the fire?',
        questionKo: '걸리버는 어떻게 불을 껐나요?',
        options: ['He blew on it.', 'He poured lake water from his hat.', 'He waited for rain.'],
        optionsKo: ['입으로 후 불었어요', '모자에 담은 호수 물을 부었어요', '비가 오기를 기다렸어요'],
        answer: 1,
        evidence: 4,
        explainKo: '걸리버는 모자(hat)에 호수 물을 가득 담아 궁전(palace) 위에 부어서 불을 껐어요.',
      },
    },
    {
      id: 'home',
      title: 'Going Home',
      titleKo: '집으로',
      sentences: [
        { beat: 0, en: 'Late one night, the wise minister came to see Gulliver in secret.', ko: '어느 늦은 밤, 지혜로운 대신이 몰래 걸리버를 찾아왔어요.' },
        { beat: 0, en: '"Some people want to hurt you. You must leave now!" he whispered.', ko: '"당신을 해치려는 사람들이 있어요. 지금 당장 떠나야 해요!" 그가 속삭였어요.', bubble: { speaker: 'Minister', text: 'You must leave now!' } },
        { beat: 1, en: 'So Gulliver walked across the sea to Blefuscu.', ko: '그래서 걸리버는 바다를 걸어서 건너 블레퓨스쿠로 갔어요.' },
        { beat: 2, en: 'There, on the beach, he found a real boat, just his size!', ko: '그곳 바닷가에서 그는 자기 몸에 꼭 맞는 진짜 배를 발견했어요!' },
        {
          beat: 3, en: 'He cleaned and fixed the old boat, and the people gave him food for the trip.', ko: '그는 낡은 배를 닦고 고쳤고, 사람들은 여행길에 먹을 음식을 주었어요.',
          action: { kind: 'rub', target: 'boat', promptEn: 'Clean the old boat! Rub it.', promptKo: '낡은 배를 문질러 깨끗이 닦아요!' },
        },
        { beat: 4, en: 'He put some tiny cows and sheep in his pocket and sailed away.', ko: '그는 작은 소와 양 몇 마리를 주머니에 넣고 바다로 떠났어요.' },
        { beat: 5, en: 'At last, a big English ship found him and took him home.', ko: '마침내 커다란 영국 배가 그를 발견해 집으로 데려다주었어요.' },
        {
          beat: 6, en: 'Nobody believed his story, until he showed them the tiny sheep!', ko: '아무도 그의 이야기를 믿지 않았어요. 그가 작은 양을 보여 주기 전까지는요!',
          action: { kind: 'tap', target: 'pocket', promptEn: 'Show the tiny sheep! Tap the pocket.', promptKo: '주머니를 눌러 작은 양을 보여 줘요!' },
        },
      ],
      words: [
        { word: 'beach', ko: '바닷가', hotspot: 'beach', beat: 2 },
        { word: 'boat', ko: '작은 배', hotspot: 'boat', beat: 2 },
        { word: 'cow', ko: '소', hotspot: 'cows', beat: 4 },
        { word: 'sheep', ko: '양', hotspot: 'sheep', beat: 6 },
      ],
      quiz: {
        question: 'How did people finally believe Gulliver\'s story?',
        questionKo: '사람들은 어떻게 걸리버의 이야기를 믿게 되었나요?',
        options: ['He showed them the tiny sheep.', 'He drew a picture.', 'The emperor wrote a letter.'],
        optionsKo: ['작은 양을 보여 줬어요', '그림을 그려 줬어요', '황제가 편지를 써 줬어요'],
        answer: 0,
        evidence: 7,
        explainKo: '걸리버가 주머니에 넣어 온 작은 양(sheep)을 보여 주자, 그제야 사람들이 믿었어요.',
      },
    },
  ],
};
