import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'

export default function Layout() {
  const { user, logout, can } = useAuth()
  const navigate = useNavigate()

  const onLogout = async () => {
    await logout()
    navigate('/login')
  }

  const link = ({ isActive }) => 'nav__link' + (isActive ? ' is-active' : '')

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__shield" /> Honor Your Commitment
          <span className="brand__admin">Admin</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end className={link}>
            Dashboard
          </NavLink>
          <NavLink to="/people" className={link}>
            People
          </NavLink>
          <NavLink to="/tags" className={link}>
            Tags
          </NavLink>
          <NavLink to="/groups" className={link}>
            Groups
          </NavLink>
          {can('broadcast') && (
            <NavLink to="/broadcasts" className={link}>
              Broadcasts
            </NavLink>
          )}
          {can('manage_users') && (
            <NavLink to="/users" className={link}>
              Users
            </NavLink>
          )}
        </nav>
        <div className="topbar__user">
          <span className="who">
            {user?.name || user?.email}
            <span className="role">{user?.role}</span>
          </span>
          <button className="btn btn--ghost" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
