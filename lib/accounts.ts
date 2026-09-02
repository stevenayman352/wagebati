export function generateAccountCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function accountEmailForCode(code: string): string {
  return `${code}@wajebaty.local`;
}