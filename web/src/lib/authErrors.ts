// Traduz mensagens de erro padrão do Supabase Auth (em inglês) para PT-BR.
const MENSAGENS: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha inválidos.',
  'Email not confirmed': 'E-mail ainda não confirmado. Verifique sua caixa de entrada.',
  'User already registered': 'Este e-mail já está cadastrado.',
  'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres.',
  'Unable to validate email address: invalid format': 'Formato de e-mail inválido.',
  'For security purposes, you can only request this after':
    'Por segurança, aguarde um pouco antes de tentar novamente.',
  'New password should be different from the old password':
    'A nova senha deve ser diferente da senha anterior.',
  'Email rate limit exceeded': 'Limite de envio de e-mails excedido. Tente novamente em instantes.',
  'Token has expired or is invalid': 'Link expirado ou inválido. Solicite um novo.',
}

export function translateAuthError(message: string | undefined | null): string {
  if (!message) return 'Ocorreu um erro. Tente novamente.'
  const direto = MENSAGENS[message]
  if (direto) return direto
  const parcial = Object.entries(MENSAGENS).find(([chave]) => message.includes(chave))
  return parcial ? parcial[1] : message
}
