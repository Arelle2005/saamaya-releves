import { Navigate, Route, Routes, Link } from "react-router-dom";
import { useAuth } from "./auth";
import Layout from "./Layout";
import Login from "./pages/Login";
import Accueil from "./pages/Accueil";
import AdminImport from "./pages/AdminImport";
import MarchandReleve from "./pages/MarchandReleve";

function AccesRefuse() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 rounded-full bg-red-100 p-4">
        <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h2 className="mb-2 text-xl font-bold text-slate-900">Accès refusé</h2>
      <p className="mb-6 text-slate-500">Vous ne disposez pas des autorisations nécessaires pour accéder à cette page.</p>
      <Link to="/" className="rounded-lg bg-[#0F2A4A] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0a1f38]">
        Retour au tableau de bord
      </Link>
    </div>
  );
}

function Protege({ children, role }) {
  const { utilisateur, chargement, sessionExpiree } = useAuth();

  if (chargement) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#1D4ED8]" />
      </div>
    );
  }

  if (!utilisateur) {
    // Le message « session expirée » n'apparaît que si une session ouverte vient vraiment
    // d'expirer. Première visite ou déconnexion volontaire : connexion sans message.
    return <Navigate to={sessionExpiree ? "/login?session_expired=true" : "/login"} replace />;
  }

  if (role && utilisateur.role !== role) {
    return <AccesRefuse />;
  }

  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route
        path="/"
        element={
          <Protege>
            <Accueil />
          </Protege>
        }
      />
      
      <Route
        path="/admin/import"
        element={
          <Protege role="ADMIN">
            <AdminImport />
          </Protege>
        }
      />

      <Route
        path="/admin/historique"
        element={
          <Protege role="ADMIN">
            {/* Même composant que /admin/import : il lit l'adresse (/historique) pour
                afficher la vue « Historique des imports » au lieu de la vue d'import. */}
            <AdminImport />
          </Protege>
        }
      />
      
      <Route
        path="/marchand/releve"
        element={
          <Protege role="MARCHAND">
            <MarchandReleve />
          </Protege>
        }
      />
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}