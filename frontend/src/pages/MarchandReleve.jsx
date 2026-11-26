import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, detailErreur } from "../api";
import { useAuth } from "../auth";

const STATUTS = ["CONFIRME", "EN_ATTENTE", "REFUSE"];
const BADGES = {
  CONFIRME: "bg-emerald-100 text-emerald-800",
  EN_ATTENTE: "bg-amber-100 text-amber-800",
  REFUSE: "bg-red-100 text-red-800",
};

// Le numéro de téléphone arrive DÉJÀ masqué par le serveur (6XX XX X0 01).
// L'écran l'affiche tel quel : le masquage a un seul endroit, le backend.

// 1 234 567 : séparateur de milliers français. null (paiement non confirmé) -> « — ».
function nombre(valeur) {
  return valeur == null ? "—" : new Intl.NumberFormat("fr-FR").format(valeur);
}

function francs(valeur) {
  return valeur == null ? "—" : nombre(valeur) + " FCFA";
}

function dateCourte(valeur) {
  return new Date(valeur).toLocaleString("fr-FR", {
    timeZone: "Africa/Douala", dateStyle: "short", timeStyle: "short",
  });
}

// Date AAAA-MM-JJ d'il y a N jours, calculée en heure du Cameroun (et non en UTC :
// toISOString() donnerait la veille entre minuit et 1 h du matin).
function isoIlYA(jours) {
  const d = new Date(Date.now() - jours * 86_400_000);
  return d.toLocaleDateString("sv-SE", { timeZone: "Africa/Douala" });
}

function Badge({ statut }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGES[statut]}`}>
      {statut}
    </span>
  );
}

// Un paiement sous forme de carte : affichage téléphone (moins de 768 px de large)
function CartePaiement({ p }) {
  return (
    <li data-testid="carte-paiement" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{p.reference}</p>
          <p className="mt-0.5 text-xs text-slate-500">{dateCourte(p.date_heure)}</p>
        </div>
        <Badge statut={p.statut} />
      </div>
      <p className="mt-3 text-xl font-bold text-slate-900">{francs(p.montant)}</p>
      <p className="mt-1 font-mono text-xs text-slate-500">{p.telephone_payeur}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
        <div>
          <dt className="text-slate-500">Frais</dt>
          <dd className="mt-0.5 font-semibold text-slate-700">{nombre(p.frais_reseau)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Commission</dt>
          <dd className="mt-0.5 font-semibold text-slate-700">{nombre(p.commission)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Net</dt>
          <dd className="mt-0.5 font-bold text-slate-900">{nombre(p.net)}</dd>
        </div>
      </dl>
    </li>
  );
}

export default function MarchandReleve() {
  const { utilisateur } = useAuth();
  const [du, setDu] = useState(isoIlYA(29));
  const [au, setAu] = useState(isoIlYA(0));
  const [statut, setStatut] = useState("");
  const [page, setPage] = useState(1);
  const [donnees, setDonnees] = useState(null);
  const [totaux, setTotaux] = useState(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);
  const [exportEnCours, setExportEnCours] = useState(false);

  const charger = useCallback(async (numeroPage) => {
    setChargement(true);
    setErreur("");
    try {
      const params = `du=${du}&au=${au}&page=${numeroPage}` + (statut ? `&statut=${statut}` : "");
      const [liste, sommes] = await Promise.all([
        api(`/paiements?${params}`),
        api(`/releve?du=${du}&au=${au}`),
      ]);
      if (!liste.ok) { setErreur(await detailErreur(liste)); return; }
      if (!sommes.ok) { setErreur(await detailErreur(sommes)); return; }
      setDonnees(await liste.json());
      setTotaux(await sommes.json());
      setPage(numeroPage);
    } catch {
      setErreur("Serveur injoignable. Vérifiez que le backend est démarré.");
    } finally {
      setChargement(false);
    }
  }, [du, au, statut]);

  useEffect(() => { charger(1); }, [charger]);

  async function exporter() {
    setExportEnCours(true);
    setErreur("");
    try {
      const reponse = await api(`/releve/export?du=${du}&au=${au}`);
      if (!reponse.ok) { setErreur(await detailErreur(reponse)); return; }
      const url = URL.createObjectURL(await reponse.blob());
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = `releve_${utilisateur.code_marchand}_${du}_${au}.csv`;
      // Le lien doit être dans la page pour que Firefox déclenche le téléchargement
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErreur("Serveur injoignable. Vérifiez que le backend est démarré.");
    } finally {
      setExportEnCours(false);
    }
  }

  const cartes = totaux
    ? [["Brut", totaux.brut], ["Frais réseau", totaux.frais], ["Commission", totaux.commission], ["Net", totaux.net]]
    : [];

  const champ =
    "min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm transition-all duration-300 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20";
  const boutonPagination =
    "min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <main className="min-h-screen bg-slate-50 p-3 sm:p-4">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-4 text-white shadow-md sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Mes paiements</h1>
            <p className="mt-1 truncate text-sm text-slate-400">
              {utilisateur.identifiant} — {utilisateur.code_marchand}
            </p>
          </div>
          <Link to="/" className="flex min-h-[44px] items-center rounded-lg border border-white/30 px-4 text-sm font-medium transition-all duration-300 hover:bg-white/10">
            Accueil
          </Link>
        </header>

        <form
          onSubmit={(e) => { e.preventDefault(); charger(1); }}
          className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4 sm:p-6"
        >
          <div>
            <label htmlFor="du" className="mb-1 block text-xs font-semibold text-slate-700">Du</label>
            <input id="du" type="date" value={du} onChange={(e) => setDu(e.target.value)} required className={champ} />
          </div>
          <div>
            <label htmlFor="au" className="mb-1 block text-xs font-semibold text-slate-700">Au</label>
            <input id="au" type="date" value={au} onChange={(e) => setAu(e.target.value)} required className={champ} />
          </div>
          <div>
            <label htmlFor="statut" className="mb-1 block text-xs font-semibold text-slate-700">Statut</label>
            <select id="statut" value={statut} onChange={(e) => setStatut(e.target.value)} className={`${champ} bg-white`}>
              <option value="">Tous les statuts</option>
              {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={chargement}
              className="min-h-[44px] w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:bg-blue-700 disabled:opacity-60">
              {chargement ? "Chargement…" : "Actualiser"}
            </button>
          </div>
        </form>

        {erreur && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
            {erreur}
          </p>
        )}

        {totaux && (
          <section>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              Totaux des {totaux.nb_confirmes} paiement(s) confirmé(s) sur la période
            </p>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {cartes.map(([libelle, valeur]) => (
                <div key={libelle} data-testid="total" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md sm:p-5">
                  <p className="text-xs font-semibold uppercase text-slate-500">{libelle}</p>
                  <p className="mt-2 break-words text-lg font-bold leading-tight text-slate-900 sm:text-2xl">{francs(valeur)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 pb-4 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pt-6">
            <h2 className="text-base font-bold text-slate-900">
              Détail des transactions {donnees ? `(${donnees.total})` : ""}
            </h2>
            <button onClick={exporter} disabled={exportEnCours || !donnees}
              className="min-h-[44px] w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:bg-slate-800 disabled:opacity-60 sm:w-auto">
              {exportEnCours ? "Export en cours…" : "Exporter mon relevé (CSV)"}
            </button>
          </div>

          {!donnees || donnees.paiements.length === 0 ? (
            <p className="px-6 py-12 text-center text-slate-500">
              {chargement ? "Chargement des données…" : "Aucun paiement trouvé sur cette période."}
            </p>
          ) : (
            <>
              {/* Ordinateur et tablette (768 px et plus) : tableau */}
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <tr>
                      {["Date", "Référence", "Téléphone", "Montant", "Frais", "Commission", "Net", "Statut"].map((colonne) => (
                        <th key={colonne} className="whitespace-nowrap px-6 py-3 text-left">{colonne}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {donnees.paiements.map((p) => (
                      <tr key={p.reference} className="transition-all duration-200 hover:bg-slate-50">
                        <td className="whitespace-nowrap px-6 py-4 text-slate-700">{dateCourte(p.date_heure)}</td>
                        <td className="px-6 py-4 font-medium text-slate-900">{p.reference}</td>
                        <td className="whitespace-nowrap px-6 py-4 font-mono text-slate-600">{p.telephone_payeur}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-900">{francs(p.montant)}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-600">{francs(p.frais_reseau)}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-600">{francs(p.commission)}</td>
                        <td className="whitespace-nowrap px-6 py-4 font-bold text-slate-900">{francs(p.net)}</td>
                        <td className="px-6 py-4"><Badge statut={p.statut} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Téléphone (moins de 768 px) : une carte par paiement, sans défilement horizontal */}
              <div className="md:hidden">
                <p className="px-4 pt-3 text-xs text-slate-500">Montants en FCFA</p>
                <ul className="space-y-3 p-4">
                  {donnees.paiements.map((p) => <CartePaiement key={p.reference} p={p} />)}
                </ul>
              </div>
            </>
          )}

          {donnees && donnees.pages > 1 && (
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-6">
              <button onClick={() => charger(page - 1)} disabled={page <= 1 || chargement} className={boutonPagination}>
                Précédent
              </button>
              <span className="text-center text-sm font-medium text-slate-600">Page {donnees.page} sur {donnees.pages}</span>
              <button onClick={() => charger(page + 1)} disabled={page >= donnees.pages || chargement} className={boutonPagination}>
                Suivant
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}