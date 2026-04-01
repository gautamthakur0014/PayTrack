import { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm, useFieldArray } from 'react-hook-form';
import { Plus, Minus, UserPlus, ChevronDown } from 'lucide-react';
import { createExpense, updateExpense } from '../../store/slices/expensesSlice';
import { v4 as uuidv4 } from 'uuid';

const CATEGORIES = ['food', 'travel', 'rent', 'utilities', 'entertainment', 'health', 'shopping', 'other'];
const TYPES = [
  { value: 'individual', label: 'Personal', desc: 'Just for you' },
  { value: 'equal_group', label: 'Equal Split', desc: 'Divide equally' },
  { value: 'custom_group', label: 'Custom Split', desc: 'Set amounts' },
];

function generateId() {
  try { return uuidv4(); } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
}

export default function ExpenseForm({ expense, onSuccess }) {
  const dispatch = useDispatch();
  const { items: connections } = useSelector(s => s.connections);
  const { items: groups } = useSelector(s => s.groups);
  const isEdit = !!expense;
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, control, setValue, formState: { errors } } = useForm({
    defaultValues: {
      description: expense?.description || '',
      amount: expense?.amount || '',
      currency: expense?.currency || 'INR',
      category: expense?.category || 'other',
      type: expense?.type || 'individual',
      groupId: expense?.groupId?._id || expense?.groupId || '',
      expenseDate: expense?.expenseDate
        ? new Date(expense.expenseDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      notes: expense?.notes || '',
      members: expense?.members?.map(m => ({
        userId: m.userId?._id || m.userId || '',
        amount: m.amount || 0,
        status: m.status || 'added',
      })) || [],
    },
  });

  const { fields: memberFields, append, remove } = useFieldArray({ control, name: 'members' });
  const expType = watch('type');
  const amount = parseFloat(watch('amount')) || 0;
  const watchedMembers = watch('members');
  const memberCount = memberFields.length + 1; // +1 for the owner
  const equalShare = memberCount > 1 ? (amount / memberCount).toFixed(2) : amount.toFixed(2);

  // Track which connection IDs are already added (prevent duplicates)
  const addedUserIds = useMemo(
    () => new Set(watchedMembers.map(m => m.userId).filter(Boolean)),
    [watchedMembers]
  );

  // Connections not yet added
  const availableConnections = useMemo(
    () => connections.filter(c => {
      const id = c._id || c.connectionId;
      return id && !addedUserIds.has(id);
    }),
    [connections, addedUserIds]
  );

  // When switching to individual, clear members
  useEffect(() => {
    if (expType === 'individual') {
      setValue('members', []);
    }
  }, [expType, setValue]);

  const addMember = () => {
    if (availableConnections.length === 0) return;
    // Pre-select first available connection
    append({
      userId: availableConnections[0]?._id || availableConnections[0]?.connectionId || '',
      amount: parseFloat(equalShare),
      status: 'added',
    });
  };

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      // De-duplicate members by userId (safety net)
      const seen = new Set();
      const deduped = (data.members || []).filter(m => {
        if (!m.userId || seen.has(m.userId)) return false;
        seen.add(m.userId);
        return true;
      });

      const payload = {
        ...data,
        amount: parseFloat(data.amount),
        groupId: data.groupId || null,
        localId: isEdit ? expense.localId : generateId(),
        members: data.type === 'individual' ? [] : deduped.map(m => ({
          ...m,
          amount: data.type === 'equal_group'
            ? parseFloat((parseFloat(data.amount) / (deduped.length + 1)).toFixed(2))
            : parseFloat(m.amount) || 0,
        })),
      };

      if (isEdit) {
        await dispatch(updateExpense({ id: expense._id, data: payload }));
      } else {
        await dispatch(createExpense(payload));
      }
      onSuccess?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Type selector */}
      <div>
        <label className="label">Expense Type</label>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map(t => (
            <label key={t.value} className={`cursor-pointer p-3 rounded-xl border text-center transition-all ${
              watch('type') === t.value
                ? 'border-brand-500/50 bg-brand-500/10 text-brand-300'
                : 'border-white/10 text-surface-400 hover:border-white/20'
            }`}>
              <input type="radio" value={t.value} {...register('type')} className="sr-only" />
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-xs opacity-70 mt-0.5">{t.desc}</p>
            </label>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="label">Description *</label>
        <input
          type="text"
          placeholder="e.g. Dinner at restaurant"
          className={`input-field ${errors.description ? 'border-red-500/50' : ''}`}
          {...register('description', {
            required: 'Description is required',
            maxLength: { value: 200, message: 'Too long' },
          })}
        />
        {errors.description && <p className="text-red-400 text-xs mt-1">{errors.description.message}</p>}
      </div>

      {/* Amount + Currency */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="label">Amount *</label>
          <input
            type="number" step="0.01" min="0.01" placeholder="0.00"
            className={`input-field font-mono ${errors.amount ? 'border-red-500/50' : ''}`}
            {...register('amount', {
              required: 'Amount required',
              min: { value: 0.01, message: 'Must be positive' },
            })}
          />
          {errors.amount && <p className="text-red-400 text-xs mt-1">{errors.amount.message}</p>}
        </div>
        <div>
          <label className="label">Currency</label>
          <select className="input-field" {...register('currency')}>
            {['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Category + Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Category</label>
          <select className="input-field" {...register('category')}>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" className="input-field" {...register('expenseDate')} />
        </div>
      </div>

      {/* Group (for group types) */}
      {expType !== 'individual' && groups.length > 0 && (
        <div>
          <label className="label">Group (optional)</label>
          <select className="input-field" {...register('groupId')}>
            <option value="">No group</option>
            {groups.map(g => (
              <option key={g._id} value={g._id}>{g.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Members (for group types) */}
      {expType !== 'individual' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">
              Members
              {memberFields.length > 0 && (
                <span className="ml-2 text-surface-500 font-normal text-xs">
                  ({memberFields.length} added)
                </span>
              )}
            </label>
            {expType === 'equal_group' && amount > 0 && (
              <span className="text-xs text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full">
                ${equalShare} each ({memberCount} people)
              </span>
            )}
          </div>

          <div className="space-y-2">
            {memberFields.map((field, idx) => {
              // For this row's dropdown, show: currently selected + available (not picked by other rows)
              const currentVal = watchedMembers[idx]?.userId;
              const rowOptions = connections.filter(c => {
                const id = c._id || c.connectionId;
                return id === currentVal || !addedUserIds.has(id);
              });

              return (
                <div key={field.id} className="flex items-center gap-2 p-3 bg-surface-800/50 rounded-xl border border-white/8">
                  <div className="flex-1">
                    <select
                      className="input-field text-sm bg-surface-800"
                      {...register(`members.${idx}.userId`, { required: 'Select a member' })}
                    >
                      <option value="">Select connection</option>
                      {rowOptions.map(c => (
                        <option key={c._id || c.connectionId} value={c._id || c.connectionId}>
                          {c.displayName || c.username}
                        </option>
                      ))}
                    </select>
                    {errors.members?.[idx]?.userId && (
                      <p className="text-red-400 text-xs mt-1">{errors.members[idx].userId.message}</p>
                    )}
                  </div>
                  {expType === 'custom_group' && (
                    <input
                      type="number" step="0.01" min="0" placeholder="Amount"
                      className="input-field w-28 text-sm font-mono"
                      {...register(`members.${idx}.amount`, { min: 0 })}
                    />
                  )}
                  {expType === 'equal_group' && (
                    <span className="text-sm font-mono text-surface-400 w-20 text-right">${equalShare}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="text-surface-500 hover:text-red-400 transition-colors p-1.5 hover:bg-red-500/10 rounded-lg flex-shrink-0"
                  >
                    <Minus size={15} />
                  </button>
                </div>
              );
            })}
          </div>

          {availableConnections.length > 0 ? (
            <button
              type="button"
              onClick={addMember}
              className="mt-2 btn-ghost text-sm flex items-center gap-2 w-full justify-center border border-dashed border-white/15 hover:border-brand-500/30"
            >
              <UserPlus size={15} />
              Add member
              <span className="text-surface-500 text-xs">({availableConnections.length} available)</span>
            </button>
          ) : connections.length === 0 ? (
            <p className="mt-2 text-center text-surface-500 text-sm py-3 border border-dashed border-white/10 rounded-xl">
              Add connections first to split expenses
            </p>
          ) : (
            <p className="mt-2 text-center text-surface-500 text-sm py-3 border border-dashed border-white/10 rounded-xl">
              All connections already added
            </p>
          )}
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="label">Notes (optional)</label>
        <textarea
          rows={2}
          placeholder="Any additional notes…"
          className="input-field resize-none"
          {...register('notes', { maxLength: { value: 500, message: 'Max 500 chars' } })}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
          {loading
            ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : (isEdit ? 'Update Expense' : 'Add Expense')}
        </button>
      </div>
    </form>
  );
}
