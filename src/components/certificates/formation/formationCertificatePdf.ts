import { jsPDF } from 'jspdf';
import type {
  FormationCertificateEvent,
  FormationParticipant,
  FormationTopic,
} from '@/types/formation-certificates';

function fillTokens(text: string, event: FormationCertificateEvent) {
  return text
    .replaceAll('{publico}', event.audience || '')
    .replaceAll('{formador}', event.trainer || '')
    .replaceAll('{ano}', event.year || '');
}

function drawFront(
  doc: jsPDF,
  event: FormationCertificateEvent,
  participant: FormationParticipant,
  width: number,
  height: number
) {
  doc.setFillColor(6, 54, 109);
  doc.rect(0, 0, width, height, 'F');
  doc.setFillColor(220, 174, 76);
  doc.rect(0, 0, width, 10, 'F');
  doc.rect(0, height - 10, width, 10, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(event.title || 'Certificado de Formação Continuada', width / 2, 28, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Secretaria Municipal de Educação', width / 2, 38, { align: 'center' });

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 174, 76);
  doc.text('CERTIFICADO', width / 2, 58, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(participant.name, width / 2, 78, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const body = fillTokens(event.certificateText || '', event);
  const lines = doc.splitTextToSize(body, width - 40);
  doc.text(lines, width / 2, 92, { align: 'center' });

  const hours = (event.topics || []).reduce((sum, topic) => sum + Number(topic.hours || 0), 0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Carga horária total: ${hours} horas`, width / 2, 120, { align: 'center' });

  if (event.issuedText) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(event.issuedText, width / 2, 132, { align: 'center' });
  }

  doc.setDrawColor(220, 174, 76);
  doc.line(width / 2 - 40, height - 35, width / 2 + 40, height - 35);
  doc.setFontSize(10);
  doc.text(event.signerRole || 'Secretário Municipal de Educação', width / 2, height - 28, {
    align: 'center',
  });

  doc.setFontSize(8);
  doc.text(`Código: ${participant.certificateCode}`, width / 2, height - 16, { align: 'center' });
}

function drawBack(
  doc: jsPDF,
  event: FormationCertificateEvent,
  participant: FormationParticipant,
  width: number,
  height: number
) {
  doc.setFillColor(245, 248, 252);
  doc.rect(0, 0, width, height, 'F');
  doc.setFillColor(6, 54, 109);
  doc.rect(0, 0, width, 18, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Temáticas e cargas horárias', width / 2, 12, { align: 'center' });

  doc.setTextColor(18, 40, 73);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const subtitle = event.subtitle || `PARA ${event.audience || 'PARTICIPANTES'}`;
  doc.text(doc.splitTextToSize(subtitle, width - 30), width / 2, 28, { align: 'center' });

  let y = 42;
  doc.setFont('helvetica', 'bold');
  doc.text('Encontro', 20, y);
  doc.text('Carga horária', width - 45, y);
  y += 4;
  doc.setDrawColor(200, 210, 225);
  doc.line(18, y, width - 18, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  (event.topics || []).forEach((topic: FormationTopic, index: number) => {
    if (y > height - 30) return;
    const textLines = doc.splitTextToSize(`${index + 1}. ${topic.text}`, width - 70);
    doc.text(textLines, 20, y);
    doc.text(`${Number(topic.hours || 0)} h`, width - 30, y, { align: 'right' });
    y += Math.max(8, textLines.length * 5 + 2);
  });

  const hours = (event.topics || []).reduce((sum, topic) => sum + Number(topic.hours || 0), 0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total: ${hours} horas`, width - 20, height - 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`${participant.name} · ${participant.certificateCode}`, 20, height - 20);
}

export async function downloadFormationCertificatePdf(
  event: FormationCertificateEvent,
  participant: FormationParticipant
) {
  const width = 297;
  const height = 210;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  drawFront(doc, event, participant, width, height);
  doc.addPage();
  drawBack(doc, event, participant, width, height);
  const safeName = participant.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'participante';
  doc.save(`certificado_formacao_${safeName}.pdf`);
}

export async function downloadFormationCertificatesBatch(
  event: FormationCertificateEvent,
  participants: FormationParticipant[]
) {
  for (const participant of participants) {
    await downloadFormationCertificatePdf(event, participant);
  }
}
