import { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Plus, Search, Filter, Trash2, Edit2, Bell, CheckCircle,
  ChevronLeft, ChevronRight, Receipt, Lock, TrendingDown, CloudOff
} from 'lucide-react';
import {
  fetchExpenses, deleteExpense, markMemberPaid,
  notifyMembers, setFilters
} from '../store/slices/expensesSlice';
import { fetchGroups } from '../store/slices/groupsSlice';
import { PageHeader, EmptyState, Spinner } from '../components/ui/index';
import Modal from '../components/ui/Modal';
import ExpenseForm from '../components/expenses/ExpenseForm';
import ExpenseDetail from '../components/expenses/ExpenseDetail';
import { format } from 'date-fns';

const CATEGORY_EMOJI = {
  food: '🍕', travel: '✈️', rent: '🏠', utilities: '⚡',
  entertainment: '🎮', health: '💊', shopping: '🛍️', other: '📦'
};
const CATEGORIES = ['food', 'travel', 'rent', 'utilities', 'entertainment', 'health', 'shopping', 'other'];
const TYPES = [
  { value: 'individual', label: 'Personal' },
  { value: 'equal_group', label: 'Equal Split' },
  { value: 'custom_group', label: 'Custom Split' },
];

/**
 * Returns how much of this expense the logged-in user is responsible for.
 *
 * - Owner, no members  → full amount (personal expense)
 * - Owner, has members → net out-of-pocket = totalAmount − recoveredAmount
 *   (they paid upfront but recover from others)
 * - Member (not owner) → only their member.amount
 */
function getUserShare(expense, userId) {
  const isOwner =
    expense.ownerId === userId ||
    (typeof expense.ownerId === 'object' && expense.ownerId?._id === userId) ||
    expense.ownerId?.toString() === userId;

  if (isOwner) {
    if (!expense.members?.length) return expense.amount || 0;
    const recovered = expense.recoveredAmount || 0;
    return Math.max(0, (expense.totalAmount || expense.amount || 0) - recovered);
  }

  const myEntry = expense.members?.find(m => {
    const mid = m.userId?._id || m.userId;
    return mid === userId || mid?.toString() === userId;
  });
  return myEntry?.amount || 0;
}

export default function ExpensesPage() {
  const dispatch = useDispatch();
  const { items, pagination, loading, filters } = useSelector(s => s.expenses);
  const { user } = useSelector(s => s.auth);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchExpenses(filters));
    dispatch(fetchGroups());
  }, [dispatch, filters]);

  // ── Total: sum of user's share only ──────────────────────────────────────
  const { pageTotal, hasShared } = useMemo(() => {
    let total = 0;
    let shared = false;
    items.forEach(e => {
      const share = getUserShare(e, user?._id);
      total += share;
      if (e.members?.length > 0) shared = true;
    });
    return { pageTotal: total, hasShared: shared };
  }, [items, user?._id]);

  const isFiltered = !!(filters.category || filters.type || filters.month || filters.search);

  const periodLabel = useMemo(() => {
    if (filters.year && filters.month) {
      return format(new Date(filters.year, filters.month - 1), 'MMMM yyyy');
    }
    return 'current view';
  }, [filters.year, filters.month]);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    if (e.target.value.length === 0 || e.target.value.length >= 2) {
      dispatch(setFilters({ search: e.target.value || undefined }));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return;
    dispatch(deleteExpense(id));
  };

  const handlePage = (page) => dispatch(setFilters({ page }));

  const handleMarkPaid = (expId, membId) => {
    dispatch(markMemberPaid({ expenseId: expId, memberId: membId }));
    setDetailTarget(null);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Expenses"
        subtitle={`${pagination?.total || 0} total expenses`}
        action={
          <button onClick={() => { setEditTarget(null); setShowForm(true); }}
            className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New Expense
          </button>
        }
      />

      {/* ── My share summary bar ──────────────────────────────────────────── */}
      <div className="card flex items-center justify-between gap-4 py-3.5"
        style={{ background: 'linear-gradient(to right, rgba(20,184,166,0.08), transparent)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-500/15 flex items-center justify-center flex-shrink-0">
            <TrendingDown size={16} className="text-teal-400" />
          </div>
          <div>
            <p className="text-xs text-muted-custom font-medium uppercase tracking-wider">
              My total — {isFiltered ? periodLabel : 'this page'}&nbsp;
              {hasShared && <span className="text-teal-400 normal-case">(your share only)</span>}
            </p>
            <p className="font-display font-bold text-2xl text-primary-custom">
              ${pageTotal.toFixed(2)}
            </p>
          </div>
        </div>
        {pagination?.total && pagination.total > items.length && (
          <p className="text-xs text-muted-custom hidden sm:block text-right">
            Showing {items.length} of {pagination.total}<br />
            <span className="text-teal-400">Filter by month for full totals</span>
          </p>
        )}
      </div>

      {/* ── Search + filter row ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-custom" />
          <input type="text" placeholder="Search expenses…" value={search}
            onChange={handleSearch} className="input-field pl-10" />
        </div>
        <button onClick={() => setFilterOpen(f => !f)}
          className={`btn-secondary flex items-center gap-2 ${filterOpen ? 'border-teal-500/40 text-teal-400' : ''}`}>
          <Filter size={15} /> Filters
          {isFiltered && <span className="w-1.5 h-1.5 bg-teal-500 rounded-full" />}
        </button>
      </div>

      {filterOpen && (
        <div className="card animate-slide-down grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="label text-xs">Category</label>
            <select className="input-field text-sm" value={filters.category || ''}
              onChange={e => dispatch(setFilters({ category: e.target.value || undefined }))}>
              <option value="">All</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">Type</label>
            <select className="input-field text-sm" value={filters.type || ''}
              onChange={e => dispatch(setFilters({ type: e.target.value || undefined }))}>
              <option value="">All</option>
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">Month</label>
            <input type="month" className="input-field text-sm" onChange={e => {
              const [y, m] = e.target.value.split('-');
              dispatch(setFilters({ year: y, month: m }));
            }} />
          </div>
          <div className="flex items-end">
            <button className="btn-ghost text-sm w-full" onClick={() => {
              dispatch(setFilters({ category: undefined, type: undefined, month: undefined, year: undefined, search: undefined }));
              setSearch('');
            }}>Clear filters</button>
          </div>
        </div>
      )}

      {/* ── List ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No expenses found"
          description="Add your first expense to get started tracking"
          action={
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Add Expense
            </button>
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map(exp => {
            const isOwner =
              exp.ownerId === user?._id ||
              (typeof exp.ownerId === 'object' && exp.ownerId?._id === user?._id) ||
              exp.ownerId?.toString() === user?._id;

            const myMemberEntry = !isOwner
              ? exp.members?.find(m => {
                const mid = m.userId?._id || m.userId;
                return mid === user?._id || mid?.toString() === user?._id;
              })
              : null;

            const myShare = getUserShare(exp, user?._id);
            const isGroupExpense = exp.members?.length > 0;
            const sharesDiffer = isGroupExpense && Math.abs(myShare - exp.amount) > 0.001;

            return (
              <div
                key={exp._id}
                className={`card hover:border-teal-500/20 transition-all group cursor-pointer ${!isOwner ? 'border-teal-500/10' : ''} ${exp._isOffline ? 'border-yellow-500/30' : ''}`}
                onClick={() => setDetailTarget(exp)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: 'var(--bg-input)' }}>
                    {CATEGORY_EMOJI[exp.category] || '📦'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-primary-custom font-medium truncate">{exp.description}</p>
                          {!isOwner && <span className="badge badge-yellow text-xs flex-shrink-0">shared</span>}
                          {exp._isOffline && (
                            <span className="badge text-xs flex-shrink-0 bg-yellow-500/10 text-yellow-500 border-yellow-500/20 flex items-center gap-1">
                              <CloudOff size={10} /> offline
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-muted-custom text-xs">{format(new Date(exp.expenseDate), 'MMM d, yyyy')}</span>
                          <span className={`badge text-xs ${
                            exp.type === 'individual' ? 'badge-blue' :
                            exp.type === 'equal_group' ? 'badge-brand' : 'badge-yellow'
                          }`}>{exp.type.replace('_', ' ')}</span>
                          {exp.groupId && <span className="badge badge-green text-xs">group</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {/* Total amount */}
                        <p className="font-mono font-bold text-primary-custom">
                          {exp.currency} {exp.amount?.toFixed(2)}
                        </p>
                        {/* My share if different from total */}
                        {sharesDiffer && (
                          <p className="text-xs font-mono text-teal-400 mt-0.5">
                            my share: {exp.currency} {myShare.toFixed(2)}
                          </p>
                        )}
                        {myMemberEntry && (
                          <p className="text-xs mt-0.5">
                            <span className={myMemberEntry.status === 'paid' ? 'text-green-400' : 'text-yellow-500'}>
                              you owe: {exp.currency} {myMemberEntry.amount?.toFixed(2)}
                              {myMemberEntry.status === 'paid' ? ' ✓' : ''}
                            </span>
                          </p>
                        )}
                        {isOwner && exp.members?.length > 0 && (
                          <p className="text-xs text-muted-custom mt-0.5">
                            {(exp.recoveredAmount || 0).toFixed(2)} / {(exp.totalAmount || 0).toFixed(2)} recovered
                          </p>
                        )}
                      </div>
                    </div>

                    {exp.members?.length > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex -space-x-1.5">
                          {exp.members.slice(0, 4).map((m, i) => (
                            <div key={i}
                              className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-[9px] font-bold text-white"
                              style={{
                                backgroundColor: m.avatarColor || m.userId?.avatarColor || '#64748b',
                                borderColor: 'var(--bg-card)'
                              }}>
                              {(m.displayName || m.userId?.displayName || '?').slice(0, 1)}
                            </div>
                          ))}
                        </div>
                        <span className="text-muted-custom text-xs">{exp.members.length} member{exp.members.length !== 1 ? 's' : ''}</span>
                        <span className={`text-xs ${exp.isFullySettled ? 'text-green-400' : 'text-yellow-500'}`}>
                          {exp.isFullySettled ? '✓ Settled' : `${exp.members.filter(m => m.status !== 'paid').length} pending`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div
                  className="mt-3 pt-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ borderTop: '1px solid var(--border-subtle)' }}
                  onClick={e => e.stopPropagation()}
                >
                  {isOwner ? (
                    <>
                      <button onClick={() => { setEditTarget(exp); setShowForm(true); }}
                        className="btn-ghost text-xs flex items-center gap-1.5 py-1.5">
                        <Edit2 size={13} /> Edit
                      </button>
                      {exp.members?.some(m => m.status !== 'paid') && !exp._isOffline && (
                        <button onClick={() => dispatch(notifyMembers(exp._id))}
                          className="btn-ghost text-xs flex items-center gap-1.5 py-1.5 text-teal-400 hover:text-teal-300">
                          <Bell size={13} /> Notify
                        </button>
                      )}
                      <button onClick={() => handleDelete(exp._id)}
                        className="btn-danger text-xs flex items-center gap-1.5 py-1.5 ml-auto">
                        <Trash2 size={13} /> Delete
                      </button>
                    </>
                  ) : (
                    <>
                      {myMemberEntry && myMemberEntry.status !== 'paid' && (
                        <button onClick={() => handleMarkPaid(exp._id, myMemberEntry._id)}
                          className="btn-ghost text-xs flex items-center gap-1.5 py-1.5 text-green-400 hover:text-green-300">
                          <CheckCircle size={13} /> Mark as Paid
                        </button>
                      )}
                      {myMemberEntry?.status === 'paid' && (
                        <span className="text-xs text-green-400 flex items-center gap-1.5 py-1.5 px-2">
                          <CheckCircle size={13} /> Paid
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1 text-xs text-muted-custom">
                        <Lock size={11} /> View only
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button disabled={filters.page <= 1} onClick={() => handlePage(filters.page - 1)}
            className="btn-secondary p-2 disabled:opacity-40">
            <ChevronLeft size={16} />
          </button>
          <span className="text-muted-custom text-sm px-3">Page {filters.page} of {pagination.totalPages}</span>
          <button disabled={!pagination.hasMore} onClick={() => handlePage(filters.page + 1)}
            className="btn-secondary p-2 disabled:opacity-40">
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Modals */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditTarget(null); }}
        title={editTarget ? 'Edit Expense' : 'New Expense'} size="lg">
        <ExpenseForm
          expense={editTarget}
          onSuccess={() => {
            setShowForm(false);
            setEditTarget(null);
            dispatch(fetchExpenses(filters));
          }}
        />
      </Modal>

      <Modal open={!!detailTarget} onClose={() => setDetailTarget(null)} title="Expense Details" size="lg">
        {detailTarget && (
          <ExpenseDetail expense={detailTarget} currentUserId={user?._id} onMarkPaid={handleMarkPaid} />
        )}
      </Modal>
    </div>
  );
}
