import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, detailErreur } from "../api";

const COMPTEURS = [
  ["lignes_lues", "Lignes lues"],
  ["lignes_importees", "Lignes importées"],
  ["lignes_deja_presentes", "Déjà présentes"],
  ["lignes_rejetees", "Lignes rejetées"],
];

function formaterDate(valeur) {
  return new Date(valeur).toLocaleString("fr-FR", {
    timeZone: "Africa/Douala",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function AdminImport() {
  const [fichier, setFichier] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [resume, setResume] = useState(null);
  const [historique, setHistorique] = useState([]);
  const inputRef = useRef(null);

  async function chargerHistorique() {
    const reponse = await api("/imports");
    if (reponse.ok) setHistorique(await reponse.json());
  }

  useEffect(() => {
    chargerHistorique().catch(() => {});
  }, []);

  async function importer(evenement) {
    evenement.preventDefault();
    if (!fichier) return;
    setErreur("");
    setResume(null);
    setEnvoi(true);
    try {
      const corps = new FormData();
      corps.append("fichier", fichier);
      const reponse = await api("/imports", { method: "POST", body: corps });
      if (!reponse.ok) {
        setErreur(await detailErreur(reponse));
        return;
      }
      setResume(await reponse.json());
      setFichier(null);
      if (inputRef.current) inputRef.current.value = "";
      await chargerHistorique();
    } catch {
      setErreur("Serveur injoignable. Vérifiez que le backend est démarré.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-center justify-between rounded-lg bg-navy px-6 py-4 text-white">
          <div>
            <h1 className="text-lg font-semibold">Import des paiements</h1>
            <p className="text-sm text-slate-300">Administrateur</p>
          </div>
          <Link
            to="/"
            className="rounded border border-white/40 px-3 py-1.5 text-sm transition duration-300 hover:bg-white/10"
          >
            Accueil
          </Link>
        </header>

        <form onSubmit={importer} className="space-y-3 rounded-lg bg-white p-6 shadow-sm">
          <label htmlFor="csv" className="block text-sm font-medium text-slate-700">
            Fichier CSV (2 Mo maximum)
          </label>
          <input
            ref={inputRef}
            id="csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFichier(e.target.files[0] || null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-navy file:px-4 file:py-2 file:text-sm file:font-medium file:text-white file:transition file:duration-300 hover:file:bg-navy/90"
          />
          {erreur && (
            <p
              role="alert"
              className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {erreur}
            </p>
          )}
          <button
            type="submit"
            disabled={!fichier || envoi}
            className="flex items-center gap-2 rounded bg-navy px-4 py-2 text-sm font-medium text-white transition duration-300 hover:bg-navy/90 focus:outline-none focus:ring-2 focus:ring-navy/40 disabled:opacity-60"
          >
            {envoi && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {envoi ? "Import en cours…" : "Importer"}
          </button>
        </form>

        {resume && (
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {COMPTEURS.map(([cle, libelle]) => (
                <div key={cle} className="rounded-lg bg-white p-4 shadow-sm">
                  <p className="text-xs text-slate-500">{libelle}</p>
                  <p className="text-2xl font-semibold text-navy">{resume[cle]}</p>
                </div>
              ))}
            </div>
            {resume.lignes_rejetees > 0 && (
              <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="px-4 py-3">Ligne</th>
                      <th className="px-4 py-3">Référence</th>
                      <th className="px-4 py-3">Motif du rejet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resume.rejets.map((rejet) => (
                      <tr key={rejet.numero_ligne} className="border-b border-slate-100">
                        <td className="px-4 py-2">{rejet.numero_ligne}</td>
                        <td className="px-4 py-2">{rejet.reference || "—"}</td>
                        <td className="px-4 py-2 text-red-700">{rejet.motif_rejet}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <section className="rounded-lg bg-white shadow-sm">
          <h2 className="px-6 pt-5 text-sm font-semibold text-slate-700">
            Historique des imports
          </h2>
          <div className="overflow-x-auto p-2">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Auteur</th>
                  <th className="px-4 py-3">Lues</th>
                  <th className="px-4 py-3">Importées</th>
                  <th className="px-4 py-3">Déjà présentes</th>
                  <th className="px-4 py-3">Rejetées</th>
                </tr>
              </thead>
              <tbody>
                {historique.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      Aucun import pour le moment.
                    </td>
                  </tr>
                ) : (
                  historique.map((import_) => (
                    <tr key={import_.id} className="border-b border-slate-100">
                      <td className="whitespace-nowrap px-4 py-2">{formaterDate(import_.date)}</td>
                      <td className="px-4 py-2">{import_.auteur}</td>
                      <td className="px-4 py-2">{import_.lignes_lues}</td>
                      <td className="px-4 py-2">{import_.lignes_importees}</td>
                      <td className="px-4 py-2">{import_.lignes_deja_presentes}</td>
                      <td className="px-4 py-2">{import_.lignes_rejetees}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}