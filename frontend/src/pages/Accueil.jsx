import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

// Accueil provisoire : les écrans Import et Mes paiements arrivent aux prochaines étapes
export default function Accueil() {
  const { utilisateur, deconnexion } = useAuth();
  const naviguer = useNavigate();

  async function quitter() {
    await deconnexion();
    naviguer("/login", { replace: true });
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-center justify-between rounded-lg bg-navy px-6 py-4 text-white">
          <div>
            <h1 className="text-lg font-semibold">Saamaya</h1>
            <p className="text-sm text-slate-300">
              {utilisateur.identifiant} — {utilisateur.role}
            </p>
          </div>
          <button
            onClick={quitter}
            className="rounded border border-white/40 px-3 py-1.5 text-sm transition duration-300 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            Se déconnecter
          </button>
        </header>
        <p className="rounded-lg bg-white px-6 py-8 text-center text-sm text-slate-500 shadow-sm">
          Les écrans Import et Mes paiements arrivent aux prochaines étapes.
        </p>
      </div>
    </main>
  );
}