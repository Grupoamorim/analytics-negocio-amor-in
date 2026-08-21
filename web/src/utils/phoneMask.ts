// Máscara de telefone brasileiro: (XX) XXXXX-XXXX
export function formatPhoneBR(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0) return ''
  let out = '(' + digits.slice(0, 2)
  if (digits.length <= 2) return out
  out += ') '
  if (digits.length <= 7) {
    out += digits.slice(2)
    return out
  }
  // 8 dígitos fixo (XXXX-XXXX) ou 9 dígitos celular (XXXXX-XXXX)
  if (digits.length <= 10) {
    out += digits.slice(2, 6) + '-' + digits.slice(6)
    return out
  }
  out += digits.slice(2, 7) + '-' + digits.slice(7)
  return out
}
