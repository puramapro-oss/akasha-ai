// JYOTI is the source of this local calculation on a validated civil birth date.
// https://github.com/puramapro-oss/jyoti/blob/bd121be781503429d2d459dcc4d36c8141b9bc0d/src/lib/astral.ts
// Git blob: c5740704ed772d744e0f6b91f7f4927f388081a2. Copy this export verbatim when updating the pinned source.
export function getNumerologyNumber(day: number, month: number, year: number): number {
  const digits = String(day + month + year).split('').map(Number)
  let sum = digits.reduce((a, b) => a + b, 0)
  while (sum > 9 && sum !== 11 && sum !== 22 && sum !== 33) {
    sum = String(sum).split('').map(Number).reduce((a, b) => a + b, 0)
  }
  return sum
}
