const persianNumber = new Intl.NumberFormat("fa-IR", { useGrouping: false });

/** Format a number using Persian digits (۱، ۲، ۱۰، …). */
export function faNum(value: number): string {
  return persianNumber.format(value);
}
