import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function UnsupportedRolePage() {
  const { user, logout } = useAuth();
  return (
    <div className="center-page">
      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card__body stack">
          <h1>This account can't sign in here</h1>
          <p className="muted">
            {user
              ? user.role === 'SCHOOL_ADMIN'
                ? 'Your School Admin account is not linked to an active school. Ask the platform owner to assign you to a school.'
                : user.role === 'TEACHER'
                  ? 'Your teacher account is not linked to an active school. Ask your School Admin to add you.'
                  : `The role "${user.role}" is not supported on the website.`
              : 'Please sign in to continue.'}
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            {user ? (
              <button type="button" className="btn btn--primary" onClick={() => void logout()}>
                Sign out
              </button>
            ) : (
              <Link to="/login" className="btn btn--primary">
                Go to sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="stack" style={{ alignItems: 'flex-start' }}>
      <h1>Page not found</h1>
      <p className="muted">The page you were looking for doesn't exist or you don't have access to it.</p>
      <Link to="/" className="btn btn--primary">
        Back to dashboard
      </Link>
    </div>
  );
}
