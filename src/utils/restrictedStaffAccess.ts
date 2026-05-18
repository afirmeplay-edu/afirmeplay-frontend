/** E-mail corretor(n)@… — perfil restrito legado (cartão resposta, agenda, etc.). */
export function isCorretorEmail(email?: string | null): boolean {
  return Boolean(email?.toLowerCase().includes('corretor'));
}

export function isAplicadorRole(role?: string | null): boolean {
  return String(role ?? '').toLowerCase() === 'aplicador';
}

/** Conta com navegação web restrita (corretor por e-mail ou role aplicador). */
export function hasRestrictedStaffAccess(user?: { email?: string; role?: string } | null): boolean {
  if (!user) return false;
  return isCorretorEmail(user.email) || isAplicadorRole(user.role);
}

/** Mesmas limitações de abas em avaliações / prova física que o corretor. */
export function hasCorretorStyleEvalAccess(user?: { email?: string; role?: string } | null): boolean {
  return hasRestrictedStaffAccess(user);
}
