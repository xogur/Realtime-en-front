export interface Avatar {
  id: string;
  name: string;
  gender: 'female' | 'male';
  description: string;
  modelPath: string;
  thumbnailPath: string;
}

export const AVATARS: Avatar[] = [
  {
    id: 'Sohee',
    name: 'Sohee (소희)',
    gender: 'female',
    description: '따뜻하고 풍부한 감정을 가진 한국어 음성',
    modelPath: '/avatar-sohee.glb',
    thumbnailPath: '/thumbnails/sohee_v2.png',
  },
  {
    id: 'Vivian',
    name: 'Vivian (비비안)',
    gender: 'female',
    description: '밝고 약간 날카로운 느낌의 세련된 음성',
    modelPath: '/avatar-vivian.glb',
    thumbnailPath: '/thumbnails/vivian.png',
  },
  {
    id: 'Ryan',
    name: 'Ryan (라이언)',
    gender: 'male',
    description: '역동적이고 리듬감이 강한 목소리',
    modelPath: '/avatar-Rian.glb',
    thumbnailPath: '/thumbnails/ryan.png',
  },
  {
    id: 'Aiden',
    name: 'Aiden (에이든)',
    gender: 'male',
    description: '맑은 중음역대의 쾌활한 미국식 음성',
    modelPath: '/avatar-aden.glb',
    thumbnailPath: '/thumbnails/aiden.png',
  },
  {
    id: 'Serena',
    name: 'Serena (세레나)',
    gender: 'female',
    description: '따뜻하고 부드러운 느낌의 차분한 목소리',
    modelPath: '/avatar-serena.glb',
    thumbnailPath: '/thumbnails/serena.png',
  },
  {
    id: 'Uncle_Fu',
    name: 'Uncle_Fu (푸 아저씨)',
    gender: 'male',
    description: '낮고 중후한 멋이 있는 노련한 중년 음성',
    modelPath: '/avatar-Uncle_Fu.glb',
    thumbnailPath: '/thumbnails/uncle_fu.png',
  },
  {
    id: 'Dylan',
    name: 'Dylan (딜런)',
    gender: 'male',
    description: '재치있는 특유의 자연스러운 톤을 가진 청년',
    modelPath: '/avatar-dylan.glb',
    thumbnailPath: '/thumbnails/dylan.png',
  },
  {
    id: 'Eric',
    name: 'Eric (에릭) ',
    gender: 'male',
    description: '약간 허스키하면서도 활기찬 청년 음성',
    modelPath: '/avatar-eric.glb',
    thumbnailPath: '/thumbnails/eric.png',
  },
  {
    id: 'Ono_Anna',
    name: 'Ono_Anna (안나)',
    gender: 'female',
    description: '장난기 있고 가벼우며 경쾌한 여성 음성',
    modelPath: '/avatar-onoana.glb',
    thumbnailPath: '/thumbnails/ono_anna.png',
  },
];
