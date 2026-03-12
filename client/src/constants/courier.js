/**
 * Opsi shift kurir (jam mengikuti default backend: SHIFT_1 06–14, SHIFT_2 14–22).
 * Ubah di sini jika backend pakai env SHIFT_*_START/END berbeda.
 */
export const SHIFT_OPTIONS = [
  { value: 1, label: "Shift 1 (Pagi)", timeRange: "06:00–14:00" },
  { value: 2, label: "Shift 2 (Sore)", timeRange: "14:00–22:00" },
];

export function getShiftLabel(shiftCode) {
  const opt = SHIFT_OPTIONS.find((o) => o.value === shiftCode);
  return opt ? `${opt.label} — ${opt.timeRange}` : `Shift ${shiftCode}`;
}
