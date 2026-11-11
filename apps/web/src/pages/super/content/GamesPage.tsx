import { useEffect, useState, type FormEvent } from 'react';
import { SUBJECTS } from '@mango/shared';
import { ApiError, api, errorMessage } from '../../../api/client';
import { useGet, useInvalidate, useMutate } from '../../../api/hooks';
import type { Game } from '../../../api/types';
import { PageHeader } from '../../../components/Cards';
import { DataTable } from '../../../components/DataTable';
import { ClassLevelPicker, FormField, Toggle } from '../../../components/Form';
import { InlineAlert } from '../../../components/Feedback';
import { Modal } from '../../../components/Modal';
import { Badge } from '../../../components/Badge';
import { useToast } from '../../../components/Toast';
import { classLevels } from '../../../lib/format';

export default function GamesPage() {
  const q = useGet<Game[]>('/games');
  const [editing, setEditing] = useState<Game | null>(null);
  const toggle = useMutate((g: Game) => api.patch(`/games/${g._id}`, { enabled: !g.enabled }), { invalidate: ['/games'], success: 'Game availability updated' });
  return (
    <>
      <PageHeader title="Games" subtitle="Control which games are available, for which classes, and how many attempts each student gets per day." />
      <DataTable
        caption="Games"
        rows={q.data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        rowKey={(g) => g._id}
        rowClassName={(g) => (g.enabled ? undefined : 'row--muted')}
        emptyTitle="No games configured"
        columns={[
          { key: 'name', header: 'Game', render: (g) => (<div><strong>{g.name}</strong>{g.description && <div className="muted small">{g.description}</div>}</div>) },
          { key: 'subject', header: 'Subject', render: (g) => <Badge tone="outline">{SUBJECTS.find((s) => s.code === g.subjectCode)?.name ?? g.subjectCode ?? '—'}</Badge> },
          { key: 'classes', header: 'Eligible classes', render: (g) => classLevels(g.classLevels) },
          { key: 'limit', header: 'Daily limit', align: 'right', render: (g) => `${g.dailyLimit} / day` },
          { key: 'enabled', header: 'Available', render: (g) => <Toggle checked={g.enabled} disabled={toggle.isPending} onChange={() => toggle.mutate(g)} label={g.enabled ? 'On' : 'Off'} /> },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (g) => (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(g)}>
                Configure
              </button>
            ),
          },
        ]}
      />
      <GameModal game={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function GameModal({ game, onClose }: { game: Game | null; onClose: () => void }) {
  const [f, setF] = useState({ name: '', description: '', classLevels: [] as number[], dailyLimit: 2, enabled: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  const toast = useToast();
  useEffect(() => {
    if (game) setF({ name: game.name, description: game.description ?? '', classLevels: game.classLevels, dailyLimit: game.dailyLimit, enabled: game.enabled });
    setErrors({});
    setFormError(null);
  }, [game]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (f.name.trim().length < 2) v.name = 'Name is required';
    if (!f.classLevels.length) v.classLevels = 'Select at least one class';
    if (!Number.isInteger(f.dailyLimit) || f.dailyLimit < 1 || f.dailyLimit > 20) v.dailyLimit = 'Whole number between 1 and 20';
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length || !game) return;
    setBusy(true);
    try {
      await api.patch(`/games/${game._id}`, { ...f, name: f.name.trim() });
      await invalidate('/games');
      toast.success('Game configuration saved');
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={Boolean(game)}
      title={`Configure ${game?.name ?? ''}`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="game-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="game-form" onSubmit={submit} noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <FormField label="Display name" error={errors.name} required>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} />
        </FormField>
        <FormField label="Description" error={errors.description}>
          <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={500} />
        </FormField>
        <ClassLevelPicker label="Eligible classes" value={f.classLevels} onChange={(v) => setF({ ...f, classLevels: v })} error={errors.classLevels} />
        <FormField label="Daily attempts per student" error={errors.dailyLimit} hint="Resets at local midnight in each school's timezone." required>
          <input type="number" min={1} max={20} value={f.dailyLimit} onChange={(e) => setF({ ...f, dailyLimit: Number(e.target.value) })} />
        </FormField>
        <Toggle checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label="Available to students" />
      </form>
    </Modal>
  );
}
