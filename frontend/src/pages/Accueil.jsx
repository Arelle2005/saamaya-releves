import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Accueil() {
  const { utilisateur, deconnexion } = useAuth();
  const naviguer = useNavigate();

  async function quitter() {
    await deconnexion();
    naviguer("/login", { replace: true });
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between rounded-xl bg-slate-900 px-6 py-5 text-white shadow-md">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Saamaya Finance</h1>
            <p className="text-sm text-slate-400 mt-1">
              {utilisateur.identifiant} — {utilisateur.role}
              {utilisateur.code_marchand && ` (${utilisateur.code_marchand})`}
            </p>
          </div>
          <button
            onClick={quitter}
            className="rounded-lg border border-white/30 px-4 py-2 text-sm font-medium transition-all duration-300 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            Se déconnecter
          </button>
        </header>

        {utilisateur.role === "ADMIN" ? (
          <Link
            to="/admin/import"
            className="block rounded-xl bg-white px-6 py-6 text-sm font-semibold text-slate-900 shadow-sm transition-all duration-300 hover:shadow-md border border-slate-200"
          >
            Importer les paiements (CSV)
          </Link>
        ) : (
          <Link
            to="/marchand/releve"
            className="block rounded-xl bg-white px-6 py-6 text-sm font-semibold text-slate-900 shadow-sm transition-all duration-300 hover:shadow-md border border-slate-200"
          >
            Consulter mes relevés de paiements
          </Link>
        )}
      </div>
    </main>
  );
}