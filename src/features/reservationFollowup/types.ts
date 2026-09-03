export type UsageSessionStatus = 'active' | 'ended' | 'dismissed' | 'booked';

export type UsageSession = {
  reservationId: number;
  kioskId: string;
  currentRoomNumber?: CocoonNumber;
  status: UsageSessionStatus;
  serverNow: string;
  endAt: string;
  endedAt: string | null;
  endReason: 'NATURAL' | 'MANUAL' | null;
  canResume: boolean;
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

export type CocoonNumber = 1 | 2 | 3 | 4;
export type DurationMinutes = 30 | 60;
export type AvailableRoom = { roomId: number; roomNumber: number };
export type AvailabilitySlot = {
  startTime: string;
  nominalEndTime: string;
  status?: 'available' | 'full' | 'blocked';
  unavailableReason?: string | null;
  availableRooms: AvailableRoom[];
};
export type Availability = {
  date: string;
  durationMinutes: number;
  closed: boolean;
  message: string | null;
  slots: AvailabilitySlot[];
};

export type AvailabilityDay = {
  date: string;
  status: 'available' | 'limited' | 'full' | 'closed';
  availableSlotCount: number;
  message: string | null;
};

export type AvailabilityCalendar = {
  from: string;
  to: string;
  durationMinutes: DurationMinutes;
  days: AvailabilityDay[];
};
