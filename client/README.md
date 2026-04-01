# PayTrack Frontend

> React 18 + Redux Toolkit + IndexedDB + Tailwind CSS frontend for the PayTrack expense splitting API.

## ✨ Features

- **Authentication** — Register, login, JWT refresh, OTP-based password reset
- **Expenses** — Personal, equal-split & custom-split expenses with full CRUD
- **Groups** — Create & manage shared groups with member management
- **Connections** — Send/accept/reject friend connections
- **Notifications** — Real-time notifications with mark-read & bulk actions
- **Analytics** — Spending trends, category breakdowns, balance summaries (Recharts)
- **Offline-first** — IndexedDB caching for all core data
- **Auto token refresh** — Axios interceptor silently refreshes expired tokens
- **Responsive** — Mobile-first layout with collapsible sidebar

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Backend running on `http://localhost:5000`

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

Create `.env` at project root:

```env
VITE_API_URL=http://localhost:5000/api/v1
```

---

## 📁 Project Structure

```
src/
├── db/
│   └── idb.js              # IndexedDB service (expenses, groups, connections, notifications)
├── services/
│   └── api.js              # Axios client + all API modules (authAPI, expenseAPI, etc.)
├── store/
│   ├── index.js            # Redux store
│   └── slices/
│       ├── authSlice.js
│       ├── expensesSlice.js
│       ├── groupsSlice.js
│       ├── connectionsSlice.js
│       └── notificationsSlice.js
├── components/
│   ├── layout/
│   │   ├── AppLayout.jsx   # Sidebar + main layout
│   │   └── AuthLayout.jsx  # Auth pages wrapper
│   ├── expenses/
│   │   ├── ExpenseForm.jsx # Create/edit expense with member splitting
│   │   └── ExpenseDetail.jsx
│   └── ui/
│       ├── Avatar.jsx
│       ├── Modal.jsx
│       ├── LoadingScreen.jsx
│       └── index.jsx       # Spinner, EmptyState, StatCard, PageHeader
├── pages/
│   ├── LoginPage.jsx
│   ├── RegisterPage.jsx
│   ├── ForgotPasswordPage.jsx  # Full OTP flow (email → OTP → reset)
│   ├── DashboardPage.jsx
│   ├── ExpensesPage.jsx    # Filterable expense list with pagination
│   ├── GroupsPage.jsx
│   ├── ConnectionsPage.jsx # Tabs: Connections / Requests / Sent
│   ├── NotificationsPage.jsx
│   ├── AnalyticsPage.jsx   # Charts: trend, pie, bar
│   └── ProfilePage.jsx     # Profile + security settings
├── App.jsx                 # Router with protected/guest routes
└── main.jsx
```

---

## 🗄️ IndexedDB Stores

| Store | Purpose |
|---|---|
| `expenses` | Cached expense list, indexed by date & category |
| `groups` | Cached group list |
| `connections` | Cached connections |
| `notifications` | Cached notifications, indexed by read status |
| `sync_queue` | Offline mutations queued for sync |
| `cache` | Generic TTL cache for API responses |

### Offline Behaviour

- On load: fetches from API → writes to IndexedDB
- On network failure: falls back to IndexedDB data
- Creating expenses offline: added to `sync_queue`, shows offline toast

---

## 🔌 API Modules (`src/services/api.js`)

| Export | Endpoints |
|---|---|
| `authAPI` | register, login, logout, refresh, me, forgotPassword, verifyOtp, resetPassword |
| `userAPI` | getProfile, updateProfile, changePassword, searchUsers, deleteAccount |
| `connectionAPI` | send, accept, reject, remove, list, sentRequests, receivedRequests, getProfile |
| `expenseAPI` | list, create, update, delete, notifyMembers, markPaid, balanceSummary, monthlyTotal, changeType |
| `groupAPI` | list, create, get, update, delete, addMember, removeMember, leave |
| `notificationAPI` | list, markRead, markAllRead, delete, subscribe |
| `analyticsAPI` | overview, categoryBreakdown, monthlyTrend, memberDebts |
| `syncAPI` | push, pull |

---

## 📬 Postman Testing

Two files are included:

1. **`PayTrack_API.postman_collection.json`** — Full collection (8 folders, 40+ requests)
2. **`PayTrack_Local.postman_environment.json`** — Local environment variables

### Import Steps

1. Open Postman → **Import** → drag both JSON files
2. Select **PayTrack - Local** environment
3. Run **Register** or **Login** → `accessToken` auto-saves
4. All subsequent requests use `Bearer {{accessToken}}` automatically

### Test Scripts

- **Register/Login** → auto-sets `accessToken` + `userId`
- **List Expenses** → auto-sets `expenseId` + `memberId`
- **Create Group** → auto-sets `groupId`
- **List Notifications** → auto-sets `notificationId`
- All folders have `pm.test()` assertions for status codes & response shape

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 18 |
| State | Redux Toolkit |
| Routing | React Router v6 |
| HTTP | Axios (with interceptor auto-refresh) |
| Local DB | IndexedDB (vanilla implementation) |
| Styling | Tailwind CSS v3 |
| Forms | React Hook Form |
| Charts | Recharts |
| Icons | Lucide React |
| Toasts | React Hot Toast |
| Date utils | date-fns |

---

## 🔐 Auth Flow

```
User → Login → accessToken (localStorage) + refreshToken (httpOnly cookie)
             ↓
       Axios interceptor reads localStorage token
             ↓
       On 401 → POST /auth/refresh → new accessToken
             ↓
       On refresh fail → clear token → redirect /login
```
