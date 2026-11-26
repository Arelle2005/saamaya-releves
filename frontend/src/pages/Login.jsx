import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";

const MESSAGE_INJOIGNABLE =
  "Serveur injoignable. Vérifiez votre connexion internet puis réessayez.";
const MESSAGE_INDISPONIBLE = "Le service est momentanément indisponible. Réessayez dans un instant.";
const MESSAGE_GENERIQUE = "Connexion impossible. Veuillez réessayer.";

// Choisit le message à afficher selon la vraie cause de l'échec.
// - TypeError : le navigateur n'a pas pu joindre le serveur (serveur éteint, réseau coupé)
// - status >= 500 : le serveur a répondu mais il est en panne
// - sinon : message français renvoyé par l'API (« Identifiant ou mot de passe incorrect. »,
//   « Compte bloqué ... Réessayez dans 15 minute(s). », erreur de validation...)
function messageErreurConnexion(err) {
  if (err instanceof TypeError) return MESSAGE_INJOIGNABLE;
  if (typeof err?.status === "number" && err.status >= 500) return MESSAGE_INDISPONIBLE;
  return err?.message || MESSAGE_GENERIQUE;
}

export default function Login() {
  const { connexion } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionExpired = searchParams.get("session_expired") === "true";

  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [afficherMotDePasse, setAfficherMotDePasse] = useState(false);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErreur("");
    setChargement(true);
    try {
      // trim : un espace copié avec l'identifiant ne doit pas faire échouer la connexion
      await connexion(identifiant.trim(), motDePasse);
      navigate("/", { replace: true });
    } catch (err) {
      setErreur(messageErreurConnexion(err));
    } finally {
      setChargement(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Colonne gauche : image de fond + contenu de marque */}
      <div className="relative hidden w-1/2 overflow-hidden lg:flex">
        <img
          src="/images/login-bg.webp"
          alt="Paiement mobile par un marchand"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Overlay marine dégradé, l'image reste visible en filigrane */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A1628]/90 via-[#0F2A4A]/90 to-[#0A1628]/95" />

        <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-16">
          {/* En-tête : logo en carte blanche + nom */}
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-white p-2">
              <img src="/images/logo-saamaya.png" alt="Saamaya Finance" className="h-10 w-auto" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">Saamaya Finance</p>
              <p className="text-sm text-slate-300">Portail de réconciliation marchand</p>
            </div>
          </div>

          {/* Corps : titre d'impact (Anton, taille maîtrisée) + accroche + stats */}
          <div className="max-w-xl">
            <h1 className="font-['Anton'] text-4xl uppercase leading-[1.05] tracking-tight xl:text-5xl">
              <span className="block text-white">Digitaliser les</span>
              <span className="block text-[#F5A623]">marchands,</span>
              <span className="block text-white">accélérer</span>
              <span className="block text-[#7BA4D4]">l'inclusion.</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-slate-300">
              Une plateforme certifiée GIMAC pour connecter marchands, banques et institutions financières dans la zone CEMAC.
            </p>
            <div className="mt-10 flex gap-12">
              <div>
                <p className="font-['Anton'] text-3xl text-[#F5A623]">6+</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Pays CEMAC</p>
              </div>
              <div>
                <p className="font-['Anton'] text-3xl text-[#F5A623]">9</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Modes de paiement</p>
              </div>
              <div>
                <p className="font-['Anton'] text-3xl text-[#F5A623]">0</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Investissement</p>
              </div>
            </div>
          </div>

          {/* Pied : badge de certification discret + copyright */}
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-slate-300">
              <span className="h-2 w-2 rounded-full bg-[#F5A623]" />
              Certifié GIMAC · ANTIC · PCI DSS
            </p>
            <p className="text-xs text-slate-500">© 2026 Saamaya Finance SARL. Tous droits réservés.</p>
          </div>
        </div>
      </div>

      {/* Colonne droite : formulaire, refait en carte premium */}
      <div className="flex w-full items-center justify-center bg-slate-50 p-6 sm:p-12 lg:w-1/2">
        <div className="w-full max-w-md">
          {/* Logo visible uniquement sur mobile */}
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <img src="/images/logo-saamaya.png" alt="Saamaya Finance" className="h-10 w-auto" />
            <p className="text-lg font-bold text-[#0F2A4A]">Saamaya Finance</p>
          </div>

          <div className="rounded-3xl border border-slate-100 bg-white p-8 shadow-xl sm:p-10">
            {/* Badge de sécurité */}
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-1.5 text-xs font-semibold text-[#9a6a0f]">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                Connexion sécurisée
              </span>
            </div>

            <h2 className="mt-5 text-center text-3xl font-bold tracking-tight text-slate-900">
              Connexion à votre compte
            </h2>
            <p className="mx-auto mt-3 max-w-xs text-center text-sm leading-relaxed text-slate-500">
              Accédez à votre espace de gestion des paiements
            </p>

            {sessionExpired && (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Votre session a expiré. Veuillez vous reconnecter.
              </div>
            )}

            {erreur && (
              <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {erreur}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="identifiant" className="mb-2 block text-sm font-semibold text-slate-700">
                  Identifiant
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  </span>
                  <input
                    id="identifiant"
                    type="text"
                    value={identifiant}
                    onChange={(e) => setIdentifiant(e.target.value)}
                    required
                    autoComplete="username"
                    placeholder="admin ou code marchand"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-sm text-slate-900 placeholder-slate-400 transition-colors duration-200 focus:border-[#F5A623] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A623]/25"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="motDePasse" className="mb-2 block text-sm font-semibold text-slate-700">
                  Mot de passe
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </span>
                  <input
                    id="motDePasse"
                    type={afficherMotDePasse ? "text" : "password"}
                    value={motDePasse}
                    onChange={(e) => setMotDePasse(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-11 text-sm text-slate-900 placeholder-slate-400 transition-colors duration-200 focus:border-[#F5A623] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A623]/25"
                  />
                  {/* Icône toujours sombre : lisible sur fond clair, jamais blanche */}
                  <button
                    type="button"
                    onClick={() => setAfficherMotDePasse((v) => !v)}
                    aria-label={afficherMotDePasse ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-600 transition-colors duration-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F5A623]/40"
                  >
                    {afficherMotDePasse ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c1.236 0 2.42.215 3.526.609M16.16 16.16A9.965 9.965 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.956 9.956 0 014.58-5.068M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={chargement}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F5A623] px-4 py-3.5 text-sm font-bold text-[#0A1628] transition-all duration-200 hover:bg-[#e0951a] focus:outline-none focus:ring-2 focus:ring-[#F5A623] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {chargement ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Connexion en cours…
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                    </svg>
                    Se connecter
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            En vous connectant, vous acceptez les conditions d'utilisation de Saamaya Finance.
          </p>
        </div>
      </div>
    </div>
  );
}