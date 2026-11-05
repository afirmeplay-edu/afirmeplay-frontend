import type { FormationCertificateEvent, FormationParticipant } from '@/types/formation-certificates';

function fillTokens(text: string, event: FormationCertificateEvent) {
  return text
    .replaceAll('{publico}', event.audience || '')
    .replaceAll('{formador}', event.trainer || '')
    .replaceAll('{ano}', event.year || '');
}

interface Props {
  event: FormationCertificateEvent;
  participant?: FormationParticipant | null;
}

export function FormationCertificatePreview({ event, participant }: Props) {
  const hours = (event.topics || []).reduce((sum, topic) => sum + Number(topic.hours || 0), 0);
  const name = participant?.name || 'Nome do participante';
  const code = participant?.certificateCode || 'código-pendente';

  return (
    <div className="space-y-4">
      <div
        className="overflow-hidden rounded-lg border shadow-sm"
        style={{ background: 'linear-gradient(160deg, #06366d 0%, #0a4d8f 100%)', color: '#fff' }}
      >
        <div className="h-2 bg-[#dcae4c]" />
        <div className="space-y-3 p-6 text-center">
          <p className="text-sm uppercase tracking-wide text-white/80">{event.title}</p>
          <h3 className="text-2xl font-bold text-[#dcae4c]">CERTIFICADO</h3>
          <p className="text-xl font-semibold">{name}</p>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-white/90">
            {fillTokens(event.certificateText || '', event)}
          </p>
          <p className="text-sm font-semibold">Carga horária total: {hours} horas</p>
          {event.issuedText ? <p className="text-xs text-white/80">{event.issuedText}</p> : null}
          <div className="mx-auto mt-4 w-48 border-t border-[#dcae4c] pt-2 text-xs">
            {event.signerRole || 'Secretário Municipal de Educação'}
          </div>
          <p className="text-[10px] text-white/70">Código: {code}</p>
        </div>
        <div className="h-2 bg-[#dcae4c]" />
      </div>

      <div className="rounded-lg border bg-[#f5f8fc] p-4 shadow-sm">
        <div className="-mx-4 -mt-4 mb-3 bg-[#06366d] px-4 py-2 text-center text-sm font-semibold text-white">
          Temáticas e cargas horárias
        </div>
        <p className="mb-3 text-center text-xs font-medium text-slate-700">
          {event.subtitle || `PARA ${event.audience || 'PARTICIPANTES'}`}
        </p>
        <ul className="space-y-2 text-sm">
          {(event.topics || []).map((topic, index) => (
            <li key={`${topic.text}-${index}`} className="flex items-start justify-between gap-3 border-b border-slate-200 pb-2">
              <span>
                {index + 1}. {topic.text}
              </span>
              <span className="shrink-0 font-medium">{Number(topic.hours || 0)} h</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-right text-sm font-semibold">Total: {hours} horas</p>
      </div>
    </div>
  );
}
