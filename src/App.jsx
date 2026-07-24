import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { EventProvider } from "./context/EventContext";
import { LeagueProvider, useLeague } from "./context/LeagueContext";
import { ScoreProvider } from "./context/ScoreContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ToastProvider } from "./context/ToastContext";
import { useNotifications } from "./hooks/useNotifications";
import Navbar from "./components/Navbar";
import EmailVerificationGate from "./components/EmailVerificationGate";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Landing from "./pages/Landing";
import EventsHome from "./pages/EventsHome";
import Dashboard from "./pages/Dashboard";
import FantasyTeam from "./pages/FantasyTeam";
import Matches from "./pages/Matches";
import Rankings from "./pages/Rankings";
import Rules from "./pages/Rules";
import Admin from "./pages/Admin";
import UserProfile from "./pages/UserProfile";
import Community from "./pages/Community";
import PlayerStats from "./pages/PlayerStats";
import JoinLeague from "./pages/JoinLeague";
import Leagues from "./pages/Leagues";
import MyStats from "./pages/MyStats";
import Discover from "./pages/Discover";

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Carregando…</div>;
  return user ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <div className="loading">Carregando…</div>;
  if (!user) return <Navigate to="/login" />;
  return isAdmin ? children : <Navigate to="/dashboard" replace />;
}

// Raiz "/": visitante deslogado vê a Landing; logado segue o fluxo do app.
function RootRoute() {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <div className="loading">Carregando…</div>;
  if (!user) return <Landing />;
  return isAdmin ? <EventsHome /> : <Navigate to="/dashboard" replace />;
}

function AppShell() {
  const { user, needsEmailVerification } = useAuth();
  const { loadingLeague } = useLeague();
  const location = useLocation();
  useNotifications(user?.uid);

  // Bloqueia o app até o usuário (email/senha) confirmar o email.
  if (needsEmailVerification) {
    return (
      <main className="container">
        <EmailVerificationGate />
      </main>
    );
  }

  // Aguarda a resolução da liga atual antes de renderizar (evita flicker/redirect)
  if (user && loadingLeague) {
    return (
      <main className="container">
        <div className="loading">Carregando…</div>
      </main>
    );
  }

  return (
    <>
      {user && <Navbar />}
      <main className="container">
        <ErrorBoundary key={location.pathname}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/" element={<RootRoute />} />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/team"
              element={
                <PrivateRoute>
                  <FantasyTeam />
                </PrivateRoute>
              }
            />
            <Route
              path="/matches"
              element={
                <PrivateRoute>
                  <Matches />
                </PrivateRoute>
              }
            />
            <Route
              path="/rankings"
              element={
                <PrivateRoute>
                  <Rankings />
                </PrivateRoute>
              }
            />
            <Route
              path="/rules"
              element={
                <PrivateRoute>
                  <Rules />
                </PrivateRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />
            <Route
              path="/perfil/:uid"
              element={
                <PrivateRoute>
                  <UserProfile />
                </PrivateRoute>
              }
            />
            <Route
              path="/comunidade"
              element={
                <PrivateRoute>
                  <Community />
                </PrivateRoute>
              }
            />
            <Route
              path="/ligas"
              element={
                <PrivateRoute>
                  <Leagues />
                </PrivateRoute>
              }
            />
            <Route
              path="/jogadores"
              element={
                <PrivateRoute>
                  <PlayerStats />
                </PrivateRoute>
              }
            />
            <Route
              path="/jogador/:playerId"
              element={
                <PrivateRoute>
                  <PlayerStats />
                </PrivateRoute>
              }
            />
            <Route
              path="/liga/:code"
              element={
                <PrivateRoute>
                  <JoinLeague />
                </PrivateRoute>
              }
            />
            <Route
              path="/minhapontuacao"
              element={
                <PrivateRoute>
                  <MyStats />
                </PrivateRoute>
              }
            />
            <Route
              path="/descobrir"
              element={
                <PrivateRoute>
                  <Discover />
                </PrivateRoute>
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <EventProvider>
        <LeagueProvider>
          <ScoreProvider>
            <NotificationProvider>
              <ToastProvider>
                <BrowserRouter>
                  <AppShell />
                </BrowserRouter>
              </ToastProvider>
            </NotificationProvider>
          </ScoreProvider>
        </LeagueProvider>
      </EventProvider>
    </AuthProvider>
  );
}
