// Mapeamento de roles para exibição no sistema
export const ROLE_DISPLAY_MAPPING: { [key: string]: string } = {
  "admin": "Administrador",
  "professor": "Professor",
  "diretor": "Diretor",
  "coordenador": "Coordenador",
  "tecadm": "Técnico Administrador",
  "aplicador": "Aplicador",
  "aluno": "Aluno"
};

// Array de roles para uso em selects e filtros
export const ROLES = [
  'Administrador',
  'Professor', 
  'Coordenador',
  'Diretor',
  'Técnico Administrador',
  'Aluno'
];

// Hierarquia de funções para ordenação por nível
export const ROLE_HIERARCHY: { [key: string]: number } = {
  "Administrador": 1,
  "Diretor": 2,
  "Coordenador": 3,
  "Professor": 4,
  "Técnico Administrador": 5,
  "Aluno": 6
};

// Função utilitária para obter o nome de exibição de uma role
export const getRoleDisplayName = (role: string): string => {
  return ROLE_DISPLAY_MAPPING[role] || role;
};
