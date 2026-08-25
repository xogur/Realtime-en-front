export type ReservationIntroStatus = 'waiting_for_presence' | 'ready' | 'completed';
export type ReservationIntroRole = 'avatar' | 'guide';
export type ReservationIntroPhase = 'brand' | 'guide';
export type ReservationIntroCompletionReason =
  | 'ended'
  | 'skipped'
  | 'media_error'
  | 'timeout';
export type ParticipantNameStatus = 'required' | 'confirmed' | 'skipped';
export type ParticipantNameSource = 'reservation' | 'captured' | null;
export type ParticipantSkipReason =
  | 'user_skipped'
  | 'microphone_denied'
  | 'speech_unsupported'
  | 'retry_exhausted'
  | 'timeout';

export type ReservationIntroEvent = {
  eventId: string;
  reservationId: number;
  kioskId: string;
  status: ReservationIntroStatus;
  presenceRequired: boolean;
  presenceDetectedAt: string | null;
  eligibleAt: string;
  startedAt: string;
  serverNow: string;
  endAt: string;
  assetVersion: string;
  brandDurationMs: number;
  guideDurationMs: number;
  maxDurationMs: number;
  activePollMs: number;
  completedAt?: string;
  completionReason?: ReservationIntroCompletionReason;
  participant: {
    captureRequired: boolean;
    status: ParticipantNameStatus;
    source: ParticipantNameSource;
  };
};

export type ActiveReservationIntro = {
  event: ReservationIntroEvent;
  phase: ReservationIntroPhase;
  elapsedMs: number;
};
