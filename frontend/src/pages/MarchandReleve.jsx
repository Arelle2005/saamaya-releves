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

// Format exact demandé : 1er chiffre + "XX XX X" + 3ème depuis la fin + " " + 2 derniers chiffres
function masquerTelephone(tel) {
  if (!tel || tel.length < 9) return tel;
  return tel[0] + "XX XX X" + tel.slice(-3, -2) + " " + tel.slice(-2);
}

function francs(valeur) {
  return valeur == null ? "—" : new Intl.NumberFormat("fr-FR").format(valeur) + " FCFA";
}

function dateCourte(valeur) {
  return new Date(valeur).toLocaleString("fr-FR", {
    timeZone: "Africa/Douala", dateStyle: "short", timeStyle: "short",
  });
}

function isoIlYA(jours) {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  return d.toISOString().slice(0, 10);
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
      lien.click();
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

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between rounded-xl bg-slate-900 px-6 py-5 text-white shadow-md">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Mes paiements</h1>
            <p className="text-sm text-slate-400 mt-1">
              {utilisateur.identifiant} — {utilisateur.code_marchand}
            </p>
          </div>
          <Link to="/" className="rounded-lg border border-white/30 px-4 py-2 text-sm font-medium transition-all duration-300 hover:bg-white/10">
            Accueil
          </Link>
        </header>

        <form
          onSubmit={(e) => { e.preventDefault(); charger(1); }}
          className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-4"
        >
          <div>
            <label htmlFor="du" className="mb-1 block text-xs font-semibold text-slate-700">Du</label>
            <input id="du" type="date" value={du} onChange={(e) => setDu(e.target.value)} required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm transition-all duration-300 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20" />
          </div>
          <div>
            <label htmlFor="au" className="mb-1 block text-xs font-semibold text-slate-700">Au</label>
            <input id="au" type="date" value={au} onChange={(e) => setAu(e.target.value)} required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm transition-all duration-300 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20" />
          </div>
          <div>
            <label htmlFor="statut" className="mb-1 block text-xs font-semibold text-slate-700">Statut</label>
            <select id="statut" value={statut} onChange={(e) => setStatut(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm transition-all duration-300 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 bg-white">
              <option value="">Tous les statuts</option>
              {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={chargement}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-blue-700 disabled:opacity-60 shadow-sm">
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
            <p className="mb-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
              Totaux des {totaux.nb_confirmes} paiement(s) confirmé(s) sur la période
            </p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {cartes.map(([libelle, valeur]) => (
                <div key={libelle} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-md">
                  <p className="text-xs font-semibold text-slate-500 uppercase">{libelle}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{francs(valeur)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-900">
              Détail des transactions {donnees ? `(${donnees.total})` : ""}
            </h2>
            <button onClick={exporter} disabled={exportEnCours || !donnees}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-slate-800 disabled:opacity-60 shadow-sm">
              {exportEnCours ? "Export en cours…" : "Exporter mon relevé (CSV)"}
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-xs">
                <tr>
                  {["Date", "Référence", "Téléphone", "Montant", "Frais", "Commission", "Net", "Statut"].map((colonne) => (
                    <th key={colonne} className="whitespace-nowrap px-6 py-3 text-left">{colonne}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!donnees || donnees.paiements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      {chargement ? "Chargement des données…" : "Aucun paiement trouvé sur cette période."}
                    </td>
                  </tr>
                ) : (
                  donnees.paiements.map((p) => (
                    <tr key={p.reference} className="transition-all duration-200 hover:bg-slate-50">
                      <td className="whitespace-nowrap px-6 py-4 text-slate-700">{dateCourte(p.date_heure)}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">{p.reference}</td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-slate-600">{masquerTelephone(p.telephone_payeur)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-900">{francs(p.montant)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-600">{francs(p.frais_reseau)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-600">{francs(p.commission)}</td>
                      <td className="whitespace-nowrap px-6 py-4 font-bold text-slate-900">{francs(p.net)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGES[p.statut]}`}>
                          {p.statut}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {donnees && donnees.pages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50">
              <button onClick={() => charger(page - 1)} disabled={page <= 1 || chargement}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
                Précédent
              </button>
              <span className="text-sm text-slate-600 font-medium">Page {donnees.page} sur {donnees.pages}</span>
              <button onClick={() => charger(page + 1)} disabled={page >= donnees.pages || chargement}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
                Suivant
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}