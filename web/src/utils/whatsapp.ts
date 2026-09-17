// Link direto pro WhatsApp a partir de um telefone salvo em qualquer formato (com máscara, DDD,
// com ou sem DDI) — mesma regra já usada em PlanilhaAlunosModal.tsx, centralizada aqui pra
// reaproveitar em Contatos, Turmas e Pipeline sem duplicar a lógica de DDI.
import { normalizarTelefone } from '@/utils/planilhaAlunos'

export function linkWhatsApp(telefone?: string | null): string | null {
  const digitos = normalizarTelefone(telefone)
  if (!digitos) return null
  const comDDI = digitos.length <= 11 ? `55${digitos}` : digitos
  return `https://wa.me/${comDDI}`
}
