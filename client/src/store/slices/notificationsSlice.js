import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { notificationAPI } from '../../services/api';
import { idb } from '../../db/idb';

export const fetchNotifications = createAsyncThunk('notifications/fetch', async (params, { rejectWithValue }) => {
  try {
    const { data } = await notificationAPI.list(params);
    const notifs = data.data.notifications || [];
    await idb.notifications.putMany(notifs);
    return { notifications: notifs, unreadCount: data.data.unreadCount || 0 };
  } catch (err) {
    const cached = await idb.notifications.getAll();
    return { notifications: cached, unreadCount: cached.filter(n => !n.read).length };
  }
});

export const markNotificationRead = createAsyncThunk('notifications/markRead', async (id, { rejectWithValue }) => {
  try {
    await notificationAPI.markRead(id);
    return id;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const markAllRead = createAsyncThunk('notifications/markAllRead', async (_, { rejectWithValue }) => {
  try {
    await notificationAPI.markAllRead();
    return true;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const deleteNotification = createAsyncThunk('notifications/delete', async (id, { rejectWithValue }) => {
  try {
    await notificationAPI.delete(id);
    await idb.notifications.delete(id);
    return id;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState: { items: [], unreadCount: 0, loading: false },
  reducers: {
    addNotification: (state, action) => {
      state.items.unshift(action.payload);
      if (!action.payload.read) state.unreadCount += 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (s) => { s.loading = true; })
      .addCase(fetchNotifications.fulfilled, (s, a) => {
        s.loading = false;
        s.items = a.payload.notifications;
        s.unreadCount = a.payload.unreadCount;
      })
      .addCase(markNotificationRead.fulfilled, (s, a) => {
        const n = s.items.find(x => x._id === a.payload);
        if (n && !n.read) { n.read = true; s.unreadCount = Math.max(0, s.unreadCount - 1); }
      })
      .addCase(markAllRead.fulfilled, (s) => {
        s.items.forEach(n => { n.read = true; });
        s.unreadCount = 0;
      })
      .addCase(deleteNotification.fulfilled, (s, a) => {
        const n = s.items.find(x => x._id === a.payload);
        if (n && !n.read) s.unreadCount = Math.max(0, s.unreadCount - 1);
        s.items = s.items.filter(x => x._id !== a.payload);
      });
  },
});

export const { addNotification } = notificationsSlice.actions;
export default notificationsSlice.reducer;
