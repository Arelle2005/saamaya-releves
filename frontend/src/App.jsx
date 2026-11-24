import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import Login from "./pages/Login";
import Accueil from "./pages/Accueil";
import AdminImport from "./pages/AdminImport";
import MarchandReleve from "./pages/MarchandReleve";

function Protege({ children, role }) {
  const { utilisateur, chargement } = useAuth();
  if (chargement) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Chargement…
      </div>
    );
  }
  if (!utilisateur) return <Navigate to="/login" replace />;
  if (role && utilisateur.role !== role) return <Navigate to="/" replace />;
  return children;
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