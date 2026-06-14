import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import Dashboard from './pages/Dashboard.jsx'
import People from './pages/People.jsx'
import Tags from './pages/Tags.jsx'
import Groups from './pages/Groups.jsx'
import Broadcasts from './pages/Broadcasts.jsx'
import Users from './pages/Users.jsx'

function Protected({ children, cap }) {
  const { user, loading, can } = useAuth()
  if (loading) return <div className="center muted">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (cap && !can(cap)) return <div className="card">You don’t have access to this page.</div>
  return children
}

export default function App() {
  const { user, loading } = useAuth()
  return (
    <Routes>
      <Route
        path="/login"
        element={user && !loading ? <Navigate to="/" replace /> : <Login />}
      />
      <Route path="/reset" element={<ResetPassword />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/people" element={<People />} />
        <Route path="/tags" element={<Tags />} />
        <Route path="/groups" element={<Groups />} />
        <Route
          path="/broadcasts"
          element={
            <Protected cap="broadcast">
              <Broadcasts />
            </Protected>
          }
        />
        <Route
          path="/users"
          element={
            <Protected cap="manage_users">
              <Users />
            </Protected>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
