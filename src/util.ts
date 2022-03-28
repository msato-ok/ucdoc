export function zeropad(num: number, digit: number): string {
  let s = '0'.repeat(digit);
  s = `${s}${num}`;
  return s.substring(s.length - digit);
}
