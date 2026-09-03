export const bookingMotion = {
  instant: 0.09,
  response: 0.14,
  shared: 0.3,
  panel: 0.36,
  spatialIntro: 0.62,
  success: 0.68,
  stagger: 0.038,
  easeOut: [0.16, 1, 0.3, 1] as const,
  easeInOut: [0.65, 0, 0.35, 1] as const,
  springSoft: { type: 'spring' as const, stiffness: 360, damping: 34, mass: 0.8 },
} as const;

export type BookingVisualSnapshot = {
  dateLabel: string;
  startTime: string;
  endTime: string;
  roomNumber: number;
};
