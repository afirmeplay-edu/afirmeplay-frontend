import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { FormationCertificatesApiService } from '@/services/formationCertificatesApi';
import {
  DEFAULT_FORMATION_TEXT,
  DEFAULT_FORMATION_TOPICS,
  type FormationCertificateEvent,
  type FormationParticipant,
  type FormationTopic,
} from '@/types/formation-certificates';
import { Download, Loader2, Plus, Trash2, Upload, Users } from 'lucide-react';
import { FormationCertificatePreview } from './FormationCertificatePreview';
import {
  downloadFormationCertificatePdf,
  downloadFormationCertificatesBatch,
} from './formationCertificatePdf';

interface SystemUserOption {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

export function FormationGenerateForm() {
  const { toast } = useToast();
  const [eventId, setEventId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState('Certificação de Formação Continuada');
  const [trainer, setTrainer] = useState('');
  const [audience, setAudience] = useState('Professores e formadores');
  const [subtitle, setSubtitle] = useState('');
  const [certificateText, setCertificateText] = useState(DEFAULT_FORMATION_TEXT);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [issuedText, setIssuedText] = useState('');
  const [signerRole, setSignerRole] = useState('Secretário Municipal de Educação');
  const [verifyUrl, setVerifyUrl] = useState('');
  const [topics, setTopics] = useState<FormationTopic[]>(DEFAULT_FORMATION_TOPICS);
  const [participants, setParticipants] = useState<FormationParticipant[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualRef, setManualRef] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userOptions, setUserOptions] = useState<SystemUserOption[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [previewParticipantId, setPreviewParticipantId] = useState('');

  const draftEvent: FormationCertificateEvent = useMemo(
    () => ({
      id: eventId || 'draft',
      title,
      trainer,
      audience,
      subtitle,
      certificateText,
      year,
      issuedText,
      signerRole,
      verifyUrl: verifyUrl || null,
      topics,
      status: 'draft',
      participants,
      totalHours: topics.reduce((sum, topic) => sum + Number(topic.hours || 0), 0),
    }),
    [
      audience,
      certificateText,
      eventId,
      issuedText,
      participants,
      signerRole,
      subtitle,
      title,
      topics,
      trainer,
      verifyUrl,
      year,
    ]
  );

  const previewParticipant =
    participants.find((item) => item.id === previewParticipantId) ||
    participants[0] ||
    ({
      id: 'preview',
      eventId: eventId || 'draft',
      name: 'Nome do participante',
      certificateCode: 'prévia',
    } as FormationParticipant);

  useEffect(() => {
    if (!participants.length) {
      setPreviewParticipantId('');
      return;
    }
    if (!participants.some((item) => item.id === previewParticipantId)) {
      setPreviewParticipantId(participants[0].id);
    }
  }, [participants, previewParticipantId]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void FormationCertificatesApiService.searchSystemUsers(userSearch, 'professor')
        .then((users) => {
          if (!cancelled) setUserOptions(users);
        })
        .catch(() => {
          if (!cancelled) setUserOptions([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userSearch]);

  const payload = () => ({
    title,
    trainer,
    audience,
    subtitle,
    certificateText,
    year,
    issuedText,
    signerRole,
    verifyUrl: verifyUrl || null,
    topics,
  });

  const ensureEvent = async () => {
    if (eventId) {
      const updated = await FormationCertificatesApiService.updateEvent(eventId, payload());
      return updated;
    }
    const created = await FormationCertificatesApiService.createEvent(payload());
    setEventId(created.id);
    return created;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const event = await ensureEvent();
      setEventId(event.id);
      if (event.participants) setParticipants(event.participants);
      toast({ title: 'Evento salvo', description: 'Dados da formação gravados com sucesso.' });
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error?.response?.data?.erro || 'Não foi possível salvar o evento.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const refreshParticipants = async (id: string) => {
    const event = await FormationCertificatesApiService.getEvent(id);
    setParticipants(event.participants || []);
  };

  const handleAddManual = async () => {
    if (!manualName.trim()) {
      toast({ title: 'Informe o nome', variant: 'destructive' });
      return;
    }
    setBusy('manual');
    try {
      const event = await ensureEvent();
      await FormationCertificatesApiService.addParticipants(event.id, [
        { name: manualName.trim(), externalRef: manualRef.trim() || undefined },
      ]);
      await refreshParticipants(event.id);
      setManualName('');
      setManualRef('');
      toast({ title: 'Participante adicionado' });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error?.response?.data?.erro || 'Não foi possível adicionar.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleCsv = async (file?: File) => {
    if (!file) return;
    setBusy('csv');
    try {
      const event = await ensureEvent();
      await FormationCertificatesApiService.addParticipantsFromCsv(event.id, file);
      await refreshParticipants(event.id);
      toast({ title: 'CSV importado' });
    } catch (error: any) {
      toast({
        title: 'Erro no CSV',
        description: error?.response?.data?.erro || 'Falha ao importar CSV.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleAddUsers = async () => {
    if (!selectedUserIds.length) {
      toast({ title: 'Selecione usuários', variant: 'destructive' });
      return;
    }
    setBusy('users');
    try {
      const event = await ensureEvent();
      await FormationCertificatesApiService.addParticipantsFromUsers(event.id, selectedUserIds);
      await refreshParticipants(event.id);
      setSelectedUserIds([]);
      toast({ title: 'Usuários vinculados' });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error?.response?.data?.erro || 'Não foi possível vincular usuários.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async (participantId: string) => {
    if (!eventId) return;
    try {
      await FormationCertificatesApiService.removeParticipant(eventId, participantId);
      await refreshParticipants(eventId);
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error?.response?.data?.erro || 'Não foi possível remover.',
        variant: 'destructive',
      });
    }
  };

  const handleIssueAndDownload = async (mode: 'one' | 'all') => {
    if (!participants.length) {
      toast({ title: 'Sem participantes', variant: 'destructive' });
      return;
    }
    setBusy(mode === 'one' ? 'pdf-one' : 'pdf-all');
    try {
      const event = await ensureEvent();
      const issued = await FormationCertificatesApiService.issue(event.id);
      const nextParticipants = issued.participants;
      setParticipants(nextParticipants);
      const full = await FormationCertificatesApiService.getEvent(event.id);
      if (mode === 'one') {
        const target =
          nextParticipants.find((item) => item.id === previewParticipantId) || nextParticipants[0];
        await downloadFormationCertificatePdf(full, target);
      } else {
        await downloadFormationCertificatesBatch(full, nextParticipants);
      }
      toast({
        title: 'Certificados emitidos',
        description: `${issued.issued} certificado(s) processado(s).`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro na emissão',
        description: error?.response?.data?.erro || 'Não foi possível emitir/baixar.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Dados da formação</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-2">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Formador(a)</Label>
              <Input value={trainer} onChange={(e) => setTrainer(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Público-alvo</Label>
              <Input value={audience} onChange={(e) => setAudience(e.target.value)} />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Subtítulo do verso</Label>
              <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Texto da frente (use {'{publico}'}, {'{formador}'}, {'{ano}'})</Label>
              <Textarea
                rows={3}
                value={certificateText}
                onChange={(e) => setCertificateText(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Ano</Label>
              <Input value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data de emissão (texto)</Label>
              <Input value={issuedText} onChange={(e) => setIssuedText(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Cargo da assinatura</Label>
              <Input value={signerRole} onChange={(e) => setSignerRole(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>URL de validação (QR)</Label>
              <Input
                value={verifyUrl}
                onChange={(e) => setVerifyUrl(e.target.value)}
                placeholder="https://.../certificates/formation/validate/"
              />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar dados
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Temáticas e cargas horárias</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topics.map((topic, index) => (
              <div key={index} className="grid grid-cols-[1fr_90px_40px] items-center gap-2">
                <Input
                  value={topic.text}
                  onChange={(e) => {
                    const next = [...topics];
                    next[index] = { ...next[index], text: e.target.value };
                    setTopics(next);
                  }}
                />
                <Input
                  type="number"
                  min={0}
                  value={topic.hours}
                  onChange={(e) => {
                    const next = [...topics];
                    next[index] = { ...next[index], hours: Number(e.target.value || 0) };
                    setTopics(next);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setTopics(topics.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => setTopics([...topics, { text: '', hours: 2 }])}
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar encontro
            </Button>
            <p className="text-sm font-medium">
              Carga horária total:{' '}
              {topics.reduce((sum, topic) => sum + Number(topic.hours || 0), 0)} horas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              3. Participantes (híbrido)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Nome do certificando"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
              <Input
                placeholder="Matrícula (opcional)"
                value={manualRef}
                onChange={(e) => setManualRef(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleAddManual()} disabled={busy === 'manual'}>
                Adicionar participante
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Upload className="h-4 w-4" />
                Importar CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    void handleCsv(e.target.files?.[0]);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <Label>Usuários do sistema (professores)</Label>
              <Input
                placeholder="Buscar por nome ou e-mail"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
              <div className="max-h-40 space-y-1 overflow-auto text-sm">
                {userOptions.map((user) => {
                  const checked = selectedUserIds.includes(user.id);
                  return (
                    <label key={user.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedUserIds((current) =>
                            checked
                              ? current.filter((id) => id !== user.id)
                              : [...current, user.id]
                          )
                        }
                      />
                      <span>
                        {user.name}
                        {user.email ? ` · ${user.email}` : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
              <Button variant="outline" onClick={() => void handleAddUsers()} disabled={busy === 'users'}>
                Vincular selecionados
              </Button>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Participante</th>
                    <th>Identificador</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {participants.map((participant) => (
                    <tr key={participant.id} className="border-b">
                      <td className="py-2">{participant.name}</td>
                      <td>{participant.externalRef || participant.userId || '—'}</td>
                      <td className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleRemove(participant.id)}
                          disabled={!!participant.issuedAt}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>4. Pré-visualização e emissão</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void handleIssueAndDownload('one')}
                disabled={!!busy || !participants.length}
              >
                {busy === 'pdf-one' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                PDF individual
              </Button>
              <Button
                onClick={() => void handleIssueAndDownload('all')}
                disabled={!!busy || !participants.length}
              >
                {busy === 'pdf-all' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Emitir e baixar lote
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {participants.length > 0 ? (
              <div className="space-y-2">
                <Label>Participante na prévia</Label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={previewParticipantId}
                  onChange={(e) => setPreviewParticipantId(e.target.value)}
                >
                  {participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <FormationCertificatePreview event={draftEvent} participant={previewParticipant} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
