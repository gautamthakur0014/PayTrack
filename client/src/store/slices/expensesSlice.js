import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { expenseAPI, syncAPI } from '../../services/api';
import { idb } from '../../db/idb';
import toast from 'react-hot-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeTempId() {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Thunks ───────────────────────────────────────────────────────────────────

export const fetchExpenses = createAsyncThunk('expenses/fetch', async (params, { rejectWithValue }) => {
  try {
    const { data } = await expenseAPI.list(params);
    await idb.expenses.putMany(data.data.expenses);
    return data.data;
  } catch {
    const cached = await idb.expenses.getAll();
    if (cached.length > 0) return { expenses: cached, pagination: { total: cached.length }, fromCache: true };
    return rejectWithValue('Failed to fetch expenses');
  }
});

export const createExpense = createAsyncThunk('expenses/create', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await expenseAPI.create(payload);
    await idb.expenses.put(data.data.expense);
    toast.success('Expense added!');
    return { expense: data.data.expense, tempId: null };
  } catch (err) {
    if (!navigator.onLine) {
      // Create a temp expense with a local ID so it shows up immediately in the UI
      const localId = makeTempId();
      const tempExpense = {
        _id: localId,
        localId,
        ...payload,
        ownerId: null, // will be filled after sync
        expenseDate: payload.expenseDate || new Date().toISOString(),
        currency: payload.currency || 'USD',
        totalAmount: payload.amount,
        recoveredAmount: 0,
        members: [],
        isDeleted: false,
        _isOffline: true, // flag for UI badge
        createdAt: new Date().toISOString(),
      };
      // Persist to IDB so it survives a reload
      await idb.expenses.put(tempExpense);
      // Queue for sync
      await idb.syncQueue.add({
        op: 'create',
        localId,
        payload: { ...payload, localId },
      });
      toast('Saved offline — will sync when back online', { icon: '📶' });
      return { expense: tempExpense, tempId: localId };
    }
    return rejectWithValue(err.response?.data?.message || 'Failed to create expense');
  }
});

export const updateExpense = createAsyncThunk('expenses/update', async ({ id, data: payload }, { rejectWithValue }) => {
  try {
    const { data } = await expenseAPI.update(id, payload);
    await idb.expenses.put(data.data.expense);
    toast.success('Expense updated!');
    return data.data.expense;
  } catch (err) {
    if (!navigator.onLine) {
      // Queue update and optimistically update IDB
      const localId = makeTempId();
      await idb.syncQueue.add({ op: 'update', localId, payload: { _id: id, ...payload } });
      const current = await idb.expenses.get(id).catch(() => null);
      if (current) {
        const updated = { ...current, ...payload, _isOffline: true };
        await idb.expenses.put(updated);
        toast('Update saved offline — will sync when back online', { icon: '📶' });
        return updated;
      }
    }
    return rejectWithValue(err.response?.data?.message || 'Failed to update expense');
  }
});

export const deleteExpense = createAsyncThunk('expenses/delete', async (id, { rejectWithValue }) => {
  try {
    await expenseAPI.delete(id);
    await idb.expenses.delete(id);
    toast.success('Expense deleted');
    return id;
  } catch (err) {
    if (!navigator.onLine) {
      const localId = makeTempId();
      await idb.syncQueue.add({ op: 'delete', localId, payload: { _id: id } });
      await idb.expenses.delete(id);
      toast('Deletion queued — will sync when back online', { icon: '📶' });
      return id;
    }
    return rejectWithValue(err.response?.data?.message || 'Failed to delete expense');
  }
});

export const fetchBalanceSummary = createAsyncThunk('expenses/balance', async (_, { rejectWithValue }) => {
  try {
    const { data } = await expenseAPI.balanceSummary();
    return data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const markMemberPaid = createAsyncThunk('expenses/markPaid', async ({ expenseId, memberId }, { rejectWithValue }) => {
  try {
    const { data } = await expenseAPI.markPaid(expenseId, memberId);
    await idb.expenses.put(data.data.expense);
    toast.success('Marked as paid!');
    return data.data.expense;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const notifyMembers = createAsyncThunk('expenses/notify', async (id, { rejectWithValue }) => {
  try {
    const { data } = await expenseAPI.notifyMembers(id);
    toast.success(data.message);
    return id;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

/**
 * syncOfflineQueue — drains IndexedDB sync_queue to the server.
 * Called by AppLayout when the browser comes back online.
 * After sync, replaces temp IDB entries with the real server entries.
 */
export const syncOfflineQueue = createAsyncThunk('expenses/syncQueue', async (_, { dispatch, rejectWithValue }) => {
  try {
    const queue = await idb.syncQueue.getAll();
    if (!queue.length) return { synced: 0 };

    // Map queue items to the format the backend expects
    const operations = queue.map(item => ({
      op: item.op,
      data: item.payload,
    }));

    const { data } = await syncAPI.push({ operations });
    const results = data.data?.results || [];

    // Remove successfully synced items from the queue and update IDB
    for (const item of queue) {
      const result = results.find(r => r.localId === item.payload?.localId);
      if (result && result.op !== 'not_found') {
        await idb.syncQueue.delete(item.id);

        // If it was a create, replace the temp IDB entry with the real server _id
        if (item.op === 'create' && result.serverId && item.payload?.localId) {
          await idb.expenses.delete(item.payload.localId);
          // The real expense will be fetched on the next fetchExpenses call
        }
      }
    }

    const syncedCount = results.filter(r => r.op !== 'not_found' && r.op !== 'error').length;
    if (syncedCount > 0) {
      toast.success(`Synced ${syncedCount} offline change${syncedCount > 1 ? 's' : ''}! ✅`);
    }

    // Re-fetch from server to get clean state
    dispatch(fetchExpenses({ page: 1, limit: 15 }));
    dispatch(fetchBalanceSummary());

    return { synced: syncedCount };
  } catch (err) {
    console.error('[Sync] Failed:', err);
    return rejectWithValue(err.message);
  }
});

// ─── Slice ────────────────────────────────────────────────────────────────────
const expensesSlice = createSlice({
  name: 'expenses',
  initialState: {
    items: [],
    pagination: null,
    balance: null,
    loading: false,
    error: null,
    filters: { page: 1, limit: 15 },
    syncPending: 0, // count of items in the offline queue
  },
  reducers: {
    setFilters: (state, action) => { state.filters = { ...state.filters, ...action.payload, page: 1 }; },
    clearFilters: (state) => { state.filters = { page: 1, limit: 15 }; },
    setSyncPending: (state, action) => { state.syncPending = action.payload; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchExpenses.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchExpenses.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.expenses;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchExpenses.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

      // createExpense: add optimistic temp item to UI immediately
      .addCase(createExpense.fulfilled, (state, action) => {
        const { expense, tempId } = action.payload;
        if (expense) {
          // Remove any existing temp entry first to avoid duplicates
          if (tempId) state.items = state.items.filter(e => e._id !== tempId);
          state.items.unshift(expense);
          if (tempId) state.syncPending += 1;
        }
      })
      // createExpense offline was rejected (no-op: we returned a value via return not rejectWithValue for the offline case)
      .addCase(createExpense.rejected, (state) => { /* online failure — already handled */ })

      .addCase(updateExpense.fulfilled, (state, action) => {
        const idx = state.items.findIndex(e => e._id === action.payload._id);
        if (idx !== -1) state.items[idx] = action.payload;
        else state.items.unshift(action.payload);
      })
      .addCase(deleteExpense.fulfilled, (state, action) => {
        state.items = state.items.filter(e => e._id !== action.payload);
      })
      .addCase(fetchBalanceSummary.fulfilled, (state, action) => { state.balance = action.payload; })
      .addCase(markMemberPaid.fulfilled, (state, action) => {
        const idx = state.items.findIndex(e => e._id === action.payload._id);
        if (idx !== -1) state.items[idx] = action.payload;
      })
      .addCase(syncOfflineQueue.fulfilled, (state, action) => {
        state.syncPending = Math.max(0, state.syncPending - (action.payload?.synced || 0));
      });
  },
});

export const { setFilters, clearFilters, setSyncPending } = expensesSlice.actions;
export default expensesSlice.reducer;
