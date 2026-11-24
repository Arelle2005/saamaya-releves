import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Login() {
  const { utilisateur, connexion } = useAuth();
  const naviguer = useNavigate();
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  if (utilisateur) return <Navigate to="/" replace />;

  async function soumettre(evenement) {
    evenement.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      await connexion(identifiant, motDePasse);
      naviguer("/", { replace: true });
    } catch (err) {
      setErreur(
        err instanceof TypeError
          ? "Serveur injoignable. Vérifiez que le backend est démarré."
          : err.message
      );
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white shadow-sm">
        <div className="rounded-t-lg bg-navy px-6 py-5">
          <h1 className="text-lg font-semibold text-white">Saamaya</h1>
          <p className="text-sm text-slate-300">Espace relevés marchand</p>
        </div>
        <form onSubmit={soumettre} className="space-y-4 px-6 py-6">
          {erreur && (
            <p
              role="alert"
              className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {erreur}
            </p>
          )}
          <div>
            <label htmlFor="identifiant" className="mb-1 block text-sm font-medium text-slate-700">
              Identifiant
            </label>
            <input
              id="identifiant"
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              required
              autoComplete="username"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm transition duration-300 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/30"
            />
          </div>
          <div>
            <label htmlFor="motdepasse" className="mb-1 block text-sm font-medium text-slate-700">
              Mot de passe
            </label>
            <input
              id="motdepasse"
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm transition duration-300 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/30"
            />
          </div>
          <button
            type="submit"
            disabled={envoi}
            className="w-full rounded bg-navy px-4 py-2 text-sm font-medium text-white transition duration-300 hover:bg-navy/90 focus:outline-none focus:ring-2 focus:ring-navy/40 disabled:opacity-60"
          >
            {envoi ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </main>
  );
}