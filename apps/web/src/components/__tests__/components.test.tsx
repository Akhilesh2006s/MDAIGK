import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from '../DataTable';
import { ClassLevelPicker } from '../Form';
import { ConfirmDialog } from '../Modal';
import { ApiError } from '../../api/client';
import { validateQuestions } from '../../pages/super/content/QuizzesPage';
import { validateSchool } from '../../pages/super/SchoolForm';
import { classLevels, pct } from '../../lib/format';

type Row = { id: string; name: string };
const cols = [{ key: 'name', header: 'Name' }];

describe('DataTable', () => {
  it('renders the empty state when there are no rows', () => {
    render(<DataTable<Row> columns={cols} rows={[]} rowKey={(r) => r.id} emptyTitle="No schools yet" emptyMessage="Add one." />);
    expect(screen.getByText('No schools yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders loading and error states', async () => {
    const { rerender } = render(<DataTable<Row> columns={cols} rows={undefined} loading rowKey={(r) => r.id} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    const retry = vi.fn();
    rerender(<DataTable<Row> columns={cols} rows={undefined} error={new ApiError(500, 'INTERNAL_ERROR', 'Boom')} onRetry={retry} rowKey={(r) => r.id} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('renders rows and paginates', async () => {
    const onPage = vi.fn();
    render(
      <DataTable<Row>
        columns={cols}
        rows={[{ id: '1', name: 'Green Valley' }]}
        rowKey={(r) => r.id}
        pagination={{ page: 1, totalPages: 3, total: 41, pageSize: 20, onPage }}
      />,
    );
    expect(screen.getByRole('cell', { name: 'Green Valley' })).toBeInTheDocument();
    expect(screen.getByText('1–20 of 41')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });
});

describe('ClassLevelPicker', () => {
  it('toggles levels and keeps locked levels disabled', async () => {
    const onChange = vi.fn();
    render(<ClassLevelPicker value={[1]} onChange={onChange} locked={[9, 10]} />);
    expect(screen.getByLabelText('Class 10')).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Class 3'));
    expect(onChange).toHaveBeenLastCalledWith([1, 3]);
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(onChange).toHaveBeenLastCalledWith([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('ConfirmDialog', () => {
  it('confirms, cancels with Escape and is labelled', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Deactivate school?" message="Sure?" confirmLabel="Deactivate" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole('dialog', { name: 'Deactivate school?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(onConfirm).toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('form validators', () => {
  it('validates quiz questions (2–6 options, correct option, prompt)', () => {
    expect(validateQuestions([{ prompt: 'Q', options: ['a', 'b'], correctIndex: 1, marks: 1 }])).toEqual({});
    const e = validateQuestions([{ prompt: '', options: ['a', ''], correctIndex: 3, marks: 1 }]);
    expect(e['questions.0.prompt']).toBeDefined();
    expect(e['questions.0.options']).toBe('Options cannot be empty');
    expect(e['questions.0.correctIndex']).toBeDefined();
    expect(validateQuestions([]).questions).toBeDefined();
    expect(validateQuestions([{ prompt: 'Q', options: ['1', '2', '3', '4', '5', '6', '7'], correctIndex: 0, marks: 1 }])['questions.0.options']).toBe('Between 2 and 6 options');
  });

  it('validates the school form', () => {
    const base = {
      schoolCode: 'GVS001',
      name: 'Green Valley',
      address: '',
      city: '',
      region: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      timezone: 'Asia/Kolkata',
      currentAcademicYear: '2026-27',
      status: 'active' as const,
      classLevels: [],
    };
    expect(validateSchool(base, true)).toEqual({});
    const e = validateSchool({ ...base, schoolCode: 'bad code!', name: '', contactEmail: 'x', currentAcademicYear: '2026' }, true);
    expect(Object.keys(e).sort()).toEqual(['contactPerson.email', 'currentAcademicYear', 'name', 'schoolCode']);
  });
});

describe('format helpers', () => {
  it('never fabricates numbers', () => {
    expect(pct(null)).toBe('—');
    expect(pct(69.54)).toBe('69.5%');
    expect(classLevels([1, 2, 3, 5, 7, 8])).toBe('1–3, 5, 7–8');
    expect(classLevels([])).toBe('—');
  });
});
