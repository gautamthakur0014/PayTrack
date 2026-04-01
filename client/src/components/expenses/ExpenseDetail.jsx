import { format } from 'date-fns';
import { CheckCircle, Bell, Clock } from 'lucide-react';

const CATEGORY_EMOJI = { food: '🍕', travel: '✈️', rent: '🏠', utilities: '⚡', entertainment: '🎮', health: '💊', shopping: '🛍️', other: '📦' };
const STATUS_STYLES = { paid: 'badge-green', notified: 'badge-yellow', added: 'badge-blue' };

export default function ExpenseDetail({ expense, currentUserId, onMarkPaid }) {
  if (!expense) return null;

  const isOwner = (() => {
    const ownerId = expense.ownerId?._id || expense.ownerId;
    return ownerId === currentUserId || ownerId?.toString() === currentUserId;
  })();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-surface-800 flex items-center justify-center text-3xl flex-shrink-0">
          {CATEGORY_EMOJI[expense.category] || '📦'}
        </div>
        <div className="flex-1">
          <h3 className="font-display text-xl font-semibold text-surface-50">{expense.description}</h3>
          <p className="text-surface-400 text-sm mt-0.5">{format(new Date(expense.expenseDate), 'EEEE, MMMM d, yyyy')}</p>
          {!isOwner && (
            <span className="inline-block mt-1 badge badge-yellow text-xs">You are a member of this expense</span>
          )}
        </div>
        <div className="text-right">
          <p className="font-mono font-bold text-2xl text-surface-50">{expense.currency} {expense.amount?.toFixed(2)}</p>
          <span className={`badge ${expense.type === 'individual' ? 'badge-blue' : expense.type === 'equal_group' ? 'badge-brand' : 'badge-yellow'}`}>
            {expense.type.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Recovery progress (owner view) */}
      {expense.members?.length > 0 && isOwner && (
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-surface-400">Recovery progress</span>
            <span className="text-surface-300 font-mono">{expense.currency} {expense.recoveredAmount?.toFixed(2)} / {expense.totalAmount?.toFixed(2)}</span>
          </div>
          <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, ((expense.recoveredAmount || 0) / (expense.totalAmount || 1)) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-surface-500 mt-1">
            {expense.isFullySettled ? '✅ Fully settled' : `${expense.currency} ${((expense.totalAmount || 0) - (expense.recoveredAmount || 0)).toFixed(2)} pending`}
          </p>
        </div>
      )}

      {/* Members list */}
      {expense.members?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-surface-300 mb-3">
            Members ({expense.members.length})
            {!isOwner && <span className="ml-2 text-surface-500 font-normal text-xs">• You can mark your own payment</span>}
          </h4>
          <div className="space-y-2">
            {expense.members.map((member, idx) => {
              const memberId = member.userId?._id || member.userId;
              const isMe = memberId === currentUserId || memberId?.toString() === currentUserId;
              const canMarkPaid = (isOwner || isMe) && member.status !== 'paid' && onMarkPaid;

              return (
                <div
                  key={member._id || idx}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    isMe ? 'bg-brand-500/5 border-brand-500/20' : 'bg-surface-800/50 border-white/6'
                  }`}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: member.avatarColor || member.userId?.avatarColor || '#64748b' }}
                  >
                    {(member.displayName || member.userId?.displayName || member.username || '?').slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-surface-200 text-sm font-medium truncate">
                        {member.displayName || member.userId?.displayName || member.username}
                      </p>
                      {isMe && <span className="text-xs text-brand-400">(you)</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`badge text-xs ${STATUS_STYLES[member.status] || 'badge-blue'}`}>
                        {member.status}
                      </span>
                      {member.paidAt && (
                        <span className="text-surface-500 text-xs">{format(new Date(member.paidAt), 'MMM d')}</span>
                      )}
                      {member.notifiedAt && member.status !== 'paid' && (
                        <span className="text-surface-500 text-xs flex items-center gap-1">
                          <Bell size={10} /> Notified
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono font-semibold text-surface-100 text-sm">
                      {expense.currency} {member.amount?.toFixed(2)}
                    </p>
                    {canMarkPaid && (
                      <button
                        onClick={() => onMarkPaid(expense._id, member._id)}
                        className="mt-1 text-xs text-green-400 hover:text-green-300 flex items-center gap-1 ml-auto transition-colors"
                      >
                        <CheckCircle size={12} /> Mark paid
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes */}
      {expense.notes && (
        <div className="bg-surface-800/30 border border-white/6 rounded-xl p-4">
          <p className="text-xs text-surface-500 mb-1 font-medium uppercase tracking-wider">Notes</p>
          <p className="text-surface-300 text-sm">{expense.notes}</p>
        </div>
      )}

      {/* Meta */}
      <div className="grid grid-cols-2 gap-3 text-xs text-surface-500">
        <div>
          <span className="text-surface-600">Created</span>
          <br />
          <span className="text-surface-400">{format(new Date(expense.createdAt || Date.now()), 'PPp')}</span>
        </div>
        {expense.localId && (
          <div>
            <span className="text-surface-600">Sync ID</span>
            <br />
            <span className="font-mono text-surface-600 truncate">{expense.localId.slice(0, 12)}…</span>
          </div>
        )}
      </div>
    </div>
  );
}
