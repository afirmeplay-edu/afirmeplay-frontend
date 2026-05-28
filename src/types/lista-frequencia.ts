/**
 * Tipos para o endpoint GET /lista-frequencia/
 */

export type Legenda = Record<string, string>;

export interface Cabecalho {
  nome_prova_ano: string;
  lista_presenca_curso: string;
  municipio_uf: string;
  rede: string | null;
  nome_escola: string;
  /** Série: Grade.name da turma (ex.: "6º ano") */
  serie?: string;
  /** Turma: atributo turma da Class ou última parte do nome (ex.: "A" em "6° ANO A") */
  turma?: string;
  /** Nome completo da turma (ex.: "6° ANO A"); mantido para compatibilidade */
  serie_turma?: string;
  turno: string | null;
  disciplina: string;
  legenda: Legenda;
  instrucoes_aplicador: string;
}

export interface Estudante {
  numero: number;
  nome_estudante: string;
  status: string | null;
}

export interface ListaFrequenciaResponse {
  class_id?: string;
  cabecalho: Cabecalho;
  estudantes: Estudante[];
}

/** Resposta do GET /lista-frequencia/ com várias turmas (legenda pode vir no topo em lote). */
export interface ListaFrequenciaTurmasResponse {
  legenda?: Legenda;
  instrucoes_aplicador?: string;
  turmas: Array<{
    class_id: string;
    cabecalho: Partial<Cabecalho> & Omit<Cabecalho, 'legenda' | 'instrucoes_aplicador'> & {
      legenda?: Legenda;
      instrucoes_aplicador?: string;
    };
    estudantes: Estudante[];
  }>;
}

export type TipoListaFrequencia = 'avaliacao' | 'prova_fisica' | 'frequencia_diaria';
