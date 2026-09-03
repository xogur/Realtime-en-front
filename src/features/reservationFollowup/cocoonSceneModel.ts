export const COCOON_NUMBERS = [1, 2, 3, 4] as const;

export type CocoonNumber = (typeof COCOON_NUMBERS)[number];

const KIOSK_DISPLAY_COCOON: Readonly<Record<string, CocoonNumber>> = {
  A02: 2,
  A03: 3,
  A04: 4,
};

export type CocoonSceneState = {
  currentRoomNumber: CocoonNumber | null;
  availableRoomNumbers: ReadonlySet<CocoonNumber>;
  previewRoomNumber: CocoonNumber | null;
  selectedRoomNumber: CocoonNumber | null;
  disabled: boolean;
};

export function isCocoonNumber(value: number): value is CocoonNumber {
  return COCOON_NUMBERS.includes(value as CocoonNumber);
}

export function toCocoonNumber(value: number): CocoonNumber | null {
  return isCocoonNumber(value) ? value : null;
}

export function getKioskDisplayCocoon(kioskId: string, reportedRoomNumber?: number): CocoonNumber | null {
  return KIOSK_DISPLAY_COCOON[kioskId.toUpperCase()]
    ?? (reportedRoomNumber !== undefined ? toCocoonNumber(reportedRoomNumber) : null)
    ?? null;
}
