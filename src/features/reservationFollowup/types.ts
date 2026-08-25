export type UsageSessionStatus = 'active' | 'ended' | 'dismissed' | 'booked';

export type UsageSession = {
  reservationId: number;
  kioskId: string;
  status: UsageSessionStatus;
  serverNow: string;
  endAt: string;
  endedAt: string | null;
  endReason: 'NATURAL' | 'MANUAL' | null;
  isGuest: boolean;
  canSignup: boolean;
  participantNameReady: boolean;
  signupUrl: string | null;
  followup: null | {
    reservationId: number;
    roomNumber: number;
    startAt: string;
    endAt: string;
  };
};

export type AvailableRoom = { roomId: number; roomNumber: number };
export type AvailabilitySlot = {
  startTime: string;
  nominalEndTime: string;
  availableRooms: AvailableRoom[];
};
export type Availability = {
  date: string;
  durationMinutes: number;
  closed: boolean;
  message: string | null;
  slots: AvailabilitySlot[];
};
