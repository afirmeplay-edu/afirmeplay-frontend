export interface FormationTopic {
  text: string;
  hours: number;
}

export interface FormationParticipant {
  id: string;
  eventId: string;
  name: string;
  externalRef?: string | null;
  userId?: string | null;
  certificateCode: string;
  issuedAt?: string | null;
  createdAt?: string | null;
}

export interface FormationCertificateEvent {
  id: string;
  title: string;
  trainer: string;
  audience: string;
  subtitle?: string | null;
  certificateText: string;
  year: string;
  issuedText?: string | null;
  signerRole?: string | null;
  signatureUrl?: string | null;
  verifyUrl?: string | null;
  topics: FormationTopic[];
  municipalityId?: string | null;
  status: 'draft' | 'issued' | string;
  createdBy?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  participantsCount?: number;
  totalHours?: number;
  participants?: FormationParticipant[];
}

export interface FormationEventPayload {
  title?: string;
  trainer?: string;
  audience?: string;
  subtitle?: string | null;
  certificateText?: string;
  year?: string;
  issuedText?: string | null;
  signerRole?: string | null;
  signatureUrl?: string | null;
  verifyUrl?: string | null;
  topics?: FormationTopic[];
}

export const DEFAULT_FORMATION_TEXT =
  'participou das Formações Continuadas para {publico} da Secretaria Municipal de Educação (SEMED), ministradas por {formador}, realizadas no ano de {ano},';

export const DEFAULT_FORMATION_TOPICS: FormationTopic[] = [
  { text: 'Gestão pedagógica e monitoramento da aprendizagem', hours: 4 },
  { text: 'Avaliação formativa e práticas de sala de aula', hours: 4 },
];
