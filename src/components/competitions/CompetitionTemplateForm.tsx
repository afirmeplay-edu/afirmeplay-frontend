import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type {
  CompetitionLevel,
} from '@/types/competition-types';
import type {
  CompetitionTemplate,
  CompetitionTemplateRecurrence,
  CreateCompetitionTemplatePayload,
} from '@/services/competition/competitionTemplatesApi';
import { api } from '@/lib/api';

interface SubjectOption {
  id: string;
  name: string;
}

export interface CompetitionTemplateFormValues {
  name: string;
  subject_id: string;
  level: CompetitionLevel;
  recurrence: CompetitionTemplateRecurrence;
  scope: 'global';
  question_mode: string;
  reward_config_json?: string;
  active: boolean;
}

interface CompetitionTemplateFormProps {
  initialData?: Partial<CompetitionTemplate>;
  readOnly?: boolean;
  submitting?: boolean;
  onSubmit?: (payload: CreateCompetitionTemplatePayload) => Promise<void> | void;
}

export function CompetitionTemplateForm({
  initialData,
  readOnly,
  submitting,
  onSubmit,
}: CompetitionTemplateFormProps) {
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [values, setValues] = useState<CompetitionTemplateFormValues>(() => ({
    name: initialData?.name ?? '',
    subject_id: initialData?.subject_id ?? '',
    level: (initialData?.level as CompetitionLevel) ?? 1,
    recurrence: (initialData?.recurrence as CompetitionTemplateRecurrence) ?? 'weekly',
    scope: 'global',
    question_mode: initialData?.question_mode ?? 'auto_random',
    reward_config_json: initialData?.reward_config
      ? JSON.stringify(initialData.reward_config, null, 2)
      : '',
    active: initialData?.active ?? true,
  }));

  useEffect(() => {
    let cancelled = false;
    api
      .get<SubjectOption[]>('/subjects')
      .then((res) => {
        if (!cancelled && Array.isArray(res.data)) {
          setSubjects(res.data);
        }
      })
      .catch(() => {
        if (!cancelled) setSubjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setValues((prev) => ({
      ...prev,
      name: initialData?.name ?? '',
      subject_id: initialData?.subject_id ?? '',
      level: (initialData?.level as CompetitionLevel) ?? 1,
      recurrence: (initialData?.recurrence as CompetitionTemplateRecurrence) ?? 'weekly',
      question_mode: initialData?.question_mode ?? 'auto_random',
      reward_config_json: initialData?.reward_config
        ? JSON.stringify(initialData.reward_config, null, 2)
        : '',
      active: initialData?.active ?? prev.active,
    }));
  }, [initialData]);

  const handleChange = <K extends keyof CompetitionTemplateFormValues>(
    field: K,
    value: CompetitionTemplateFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit || readOnly) return;

    let reward_config: CreateCompetitionTemplatePayload['reward_config'] = undefined;
    if (values.reward_config_json && values.reward_config_json.trim()) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        reward_config = JSON.parse(values.reward_config_json);
      } catch {
        // Deixar validação a cargo da tela que usa o form (via toast)
        throw new Error('JSON inválido em Configuração de Recompensas');
      }
    }

    const payload: CreateCompetitionTemplatePayload = {
      name: values.name.trim(),
      subject_id: values.subject_id,
      level: values.level,
      recurrence: values.recurrence,
      scope: values.scope,
      question_mode: values.question_mode,
      reward_config: reward_config ?? null,
      active: values.active,
    };

    void onSubmit(payload);
  };

  const selectedSubjectName =
    subjects.find((s) => s.id === values.subject_id)?.name ?? initialData?.subject_name;

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="template-name">Nome do template</Label>
              <Input
                id="template-name"
                value={values.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Ex.: Competição semanal de Matemática"
                disabled={readOnly}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Disciplina</Label>
              <Select
                value={values.subject_id}
                onValueChange={(v) => handleChange('subject_id', v)}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={selectedSubjectName ?? 'Selecione a disciplina'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Nível</Label>
              <Select
                value={String(values.level)}
                onValueChange={(v) => handleChange('level', Number(v) as CompetitionLevel)}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o nível" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Nível 1</SelectItem>
                  <SelectItem value="2">Nível 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Recorrência</Label>
              <Select
                value={values.recurrence}
                onValueChange={(v) =>
                  handleChange('recurrence', v as CompetitionTemplateRecurrence)
                }
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a recorrência" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="biweekly">Quinzenal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Escopo</Label>
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                <span className="text-sm font-medium">Global</span>
                <Badge variant="outline" className="text-xs">
                  Fixo
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Modo de questões</Label>
              <Input
                value={
                  !values.question_mode || values.question_mode === 'auto_random'
                    ? 'Sorteio automático'
                    : values.question_mode === 'manual'
                      ? 'Manual'
                      : values.question_mode
                }
                disabled
                className="bg-muted/40"
              />
              <p className="text-xs text-muted-foreground">
                Sorteio automático configurado pelo sistema.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Status do template</Label>
              <Select
                value={values.active ? 'active' : 'inactive'}
                onValueChange={(v) => handleChange('active', v === 'active')}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reward-config">Configuração de recompensas (opcional)</Label>
            <Textarea
              id="reward-config"
              value={values.reward_config_json}
              onChange={(e) => handleChange('reward_config_json', e.target.value)}
              rows={4}
              placeholder="Ex.: configuração de moedas de participação e ranking"
              disabled={readOnly}
            />
            <p className="text-xs text-muted-foreground">
              Se vazio, o sistema usa a configuração padrão.
            </p>
          </div>

          {!readOnly && onSubmit && (
            <div className="flex justify-end gap-2 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar template'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </form>
  );
}

