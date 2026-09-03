'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  COCOON_NUMBERS,
  type CocoonNumber,
  isCocoonNumber,
  toCocoonNumber,
} from './cocoonSceneModel';

export type CocoonSelectableRoom = {
  roomId: number;
  roomNumber: number;
};

const CocoonSceneCanvas = dynamic(
  () => import('./CocoonSceneCanvas').then((module) => module.CocoonSceneCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[220px] place-items-center bg-[#ece7df] text-sm font-bold text-zinc-500 sm:h-[clamp(280px,30vw,360px)]">
        조감도를 준비하고 있습니다…
      </div>
    ),
  },
);

type Props = {
  currentRoomNumber: CocoonNumber | null;
  rooms: CocoonSelectableRoom[];
  selectedRoom: CocoonSelectableRoom | null;
  disabled?: boolean;
  onSelect: (room: CocoonSelectableRoom) => void;
};

export function CocoonSelector({
  currentRoomNumber,
  rooms,
  selectedRoom,
  disabled = false,
  onSelect,
}: Props) {
  const [hoveredRoomNumber, setHoveredRoomNumber] = useState<CocoonNumber | null>(null);
  const [focusedRoomNumber, setFocusedRoomNumber] = useState<CocoonNumber | null>(null);
  const previewRoomNumber = hoveredRoomNumber ?? focusedRoomNumber;
  const show3d = process.env.NEXT_PUBLIC_COCOON_3D_BOOKING_ENABLED !== 'false';

  const roomsByNumber = useMemo(() => {
    const result = new Map<CocoonNumber, CocoonSelectableRoom>();
    rooms.forEach((room) => {
      const roomNumber = toCocoonNumber(room.roomNumber);
      if (roomNumber !== null && roomNumber !== 1) result.set(roomNumber, room);
    });
    return result;
  }, [rooms]);

  const availableRoomNumbers = useMemo(
    () => new Set<CocoonNumber>(roomsByNumber.keys()),
    [roomsByNumber],
  );

  const selectedRoomNumber = selectedRoom && isCocoonNumber(selectedRoom.roomNumber)
    ? selectedRoom.roomNumber
    : null;

  const selectRoomNumber = (roomNumber: CocoonNumber) => {
    if (disabled) return;
    const room = roomsByNumber.get(roomNumber);
    if (room) onSelect(room);
  };

  return (
    <section aria-label="예약 가능한 코쿤" className="relative overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-white shadow-sm">
      {currentRoomNumber !== null && isCocoonNumber(currentRoomNumber) ? (
        <span className="absolute right-3 top-3 z-10 rounded-full bg-white/90 px-3 py-1.5 text-sm font-black text-cyan-700 shadow-sm backdrop-blur">
          현재 위치 · 코쿤 {currentRoomNumber}
        </span>
      ) : null}

      {show3d ? <CocoonSceneCanvas
        currentRoomNumber={currentRoomNumber}
        availableRoomNumbers={availableRoomNumbers}
        previewRoomNumber={previewRoomNumber}
        selectedRoomNumber={selectedRoomNumber}
        disabled={disabled}
        onPreviewChange={setHoveredRoomNumber}
        onSelect={selectRoomNumber}
      /> : <div className="grid min-h-28 place-items-center bg-[#ece7df] px-6 text-center font-bold text-zinc-600">아래 버튼에서 이용할 코쿤을 선택하세요.</div>}

      <div className="grid grid-cols-2 gap-2 border-t border-zinc-200 bg-[#fbf8f4] p-3 sm:grid-cols-4" aria-label="코쿤 선택">
        {COCOON_NUMBERS.map((roomNumber) => {
          const available = roomsByNumber.has(roomNumber);
          const selected = selectedRoomNumber === roomNumber;
          const previewed = previewRoomNumber === roomNumber;
          const current = currentRoomNumber === roomNumber;
          const consultationBooth = roomNumber === 1;
          return (
            <motion.button
              key={roomNumber}
              type="button"
              disabled={consultationBooth || !available || disabled}
              aria-pressed={selected}
              aria-describedby={current ? `cocoon-current-${roomNumber}` : undefined}
              onMouseEnter={() => setHoveredRoomNumber(roomNumber)}
              onMouseLeave={() => setHoveredRoomNumber(null)}
              onFocus={() => setFocusedRoomNumber(roomNumber)}
              onBlur={() => setFocusedRoomNumber(null)}
              onClick={() => selectRoomNumber(roomNumber)}
              className={`flex min-h-14 items-center gap-2 rounded-xl px-3 py-2 text-left font-bold transition disabled:cursor-not-allowed ${consultationBooth ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-300' :
                selected
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-700/20'
                  : previewed
                    ? 'bg-blue-50 text-blue-800 ring-2 ring-blue-400'
                    : current
                      ? 'bg-cyan-50 text-cyan-900 ring-2 ring-cyan-400'
                      : !available
                        ? 'bg-white text-zinc-400 opacity-45 ring-1 ring-zinc-200'
                    : 'bg-white text-zinc-800 ring-1 ring-zinc-200 hover:bg-blue-50'
              }`}
              layoutId={selected ? 'selected-cocoon' : undefined}
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${selected ? 'bg-white text-blue-700' : 'bg-zinc-900 text-white'}`}>
                {roomNumber}
              </span>
              <span className="min-w-0">
                <span className="block">코쿤 {roomNumber}</span>
                <span className={`block text-xs ${selected ? 'text-blue-100' : available ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {consultationBooth ? '상시 오픈 · AI 상담 부스' : selected ? '선택됨' : current ? '현재 위치' : available ? '예약 가능' : '예약 마감'}
                </span>
              </span>
              {current ? <span id={`cocoon-current-${roomNumber}`} className="sr-only">현재 이용 중인 코쿤</span> : null}
            </motion.button>
          );
        })}
      </div>

      <p className="px-4 py-3 text-center text-sm font-bold text-zinc-500" aria-live="polite">
        {selectedRoomNumber === null
          ? currentRoomNumber !== null && isCocoonNumber(currentRoomNumber)
            ? `현재 위치는 코쿤 ${currentRoomNumber}입니다. 다음 코쿤을 선택해 주세요.`
            : '다음 일정에 이용할 코쿤을 선택해 주세요.'
          : `다음 일정의 위치로 코쿤 ${selectedRoomNumber}을 선택했습니다.`}
      </p>
    </section>
  );
}
