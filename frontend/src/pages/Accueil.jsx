import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, detailErreur } from "../api";
import { useAuth } from "../auth";
import { dateCourte, dateLongue, francs, nombre, periodeDepuis, salutation } from "../format";
import StatutBadge from "../StatutBadge";

const PERIODES = [7, 30, 90]; // en jours, aujourd'hui compris (90 = maximum accepté par l'API)
const NB_ELEMENTS = 5; // derniers paiements / derniers imports affichés

/* ---------- Chargement des données ---------- */

// Lit une route de l'API ; une réponse en erreur devient une exception portant le message français.
async function lire(chemin) {
  const reponse = await api(chemin);
  if (!reponse.ok) throw new Error(await detailErreur(reponse));
  return reponse.json();
}

function messageErreur(err) {
  if (err instanceof TypeError) {
    return "Serveur injoignable. Vérifiez votre connexion internet puis réessayez.";
  }
  return err?.message || "Impossible de charger le tableau de bord.";
}

// Charge des données à l'affichage et à chaque changement de `dependances`.
// `annule` ignore la réponse d'une requête devenue inutile : si l'utilisateur change de période
// pendant un chargement, la réponse tardive de l'ancienne période n'écrase pas la nouvelle.
function useChargement(charger, dependances) {
  const [etat, setEtat] = useState({ donnees: null, erreur: "", chargement: true });
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    let annule = false;
    setEtat((precedent) => ({ ...precedent, chargement: true, erreur: "" }));
    charger().then(
      (donnees) => {
        if (!annule) setEtat({ donnees, erreur: "", chargement: false });
      },
      (err) => {
        if (!annule) setEtat({ donnees: null, erreur: messageErreur(err), chargement: false });
      }
    );
    return () => {
      annule = true;
    };
  }, [...dependances, tentative]);

  return { ...etat, recharger: () => setTentative((n) => n + 1) };
}

/* ---------- Petits composants d'affichage ---------- */

function Entete({ utilisateur, texte, lien, libelleLien }) {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-[#0A1628] to-[#0F2A4A] p-6 text-white shadow-lg sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium capitalize text-slate-300">{dateLongue()}</p>
          <h2 className="mt-2 break-words text-2xl font-bold sm:text-3xl">
            {salutation()}, {utilisateur.identifiant}
          </h2>
          <p className="mt-2 text-sm text-slate-300">{texte}</p>
        </div>
        <Link
          to={lien}
          className="inline-flex min-h-[44px] items-center justify-center self-start rounded-lg bg-[#F5A623] px-4 text-sm font-semibold text-[#0A1628] transition-colors hover:bg-[#e0951a]"
        >
          {libelleLien}
        </Link>
      </div>
    </div>
  );
}

function Carte({ titre, valeur, detail, miseEnAvant = false }) {
  const style = miseEnAvant ? "border-[#F5A623]/40 bg-[#F5A623]/10" : "border-slate-200 bg-white";
  return (
    <div data-testid="carte" className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${style}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titre}</p>
      <p className="mt-2 break-words text-xl font-bold leading-tight text-slate-900 sm:text-2xl">
        {valeur}
      </p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function Chargement() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement du tableau de bord">
      <div className="h-32 animate-pulse rounded-2xl bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-2xl bg-slate-200" />
    </div>
  );
}

function Erreur({ message, onReessayer }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
      <h3 className="text-lg font-semibold text-slate-900">Erreur de chargement</h3>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <button
        onClick={onReessayer}
        className="mt-4 min-h-[44px] rounded-lg bg-[#F5A623] px-5 text-sm font-semibold text-[#0A1628] hover:bg-[#e0951a]"
      >
        Réessayer
      </button>
    </div>
  );
}

function Panneau({ titre, lien, libelleLien, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-4 sm:px-6">
        <h3 className="text-base font-bold text-slate-900">{titre}</h3>
        <Link to={lien} className="flex min-h-[44px] items-center text-sm font-semibold text-[#0F2A4A] hover:underline">
          {libelleLien}
        </Link>
      </div>
      {children}
    </section>
  );
}

/* ---------- Tableau de bord du marchand ---------- */

function VueMarchand({ utilisateur }) {
  const [jours, setJours] = useState(30);
  const { donnees, erreur, chargement, recharger } = useChargement(async () => {
    const { du, au } = periodeDepuis(jours);
    // Totaux : toujours ceux de l'API (/releve), jamais recalculés dans le navigateur
    const [releve, page] = await Promise.all([
      lire(`/releve?du=${du}&au=${au}`),
      lire(`/paiements?du=${du}&au=${au}&page=1`),
    ]);
    return { releve, page };
  }, [jours]);

  return (
    <div className="space-y-6">
      <Entete
        utilisateur={utilisateur}
        texte={`Aperçu de votre activité sur les ${jours} derniers jours.`}
        lien="/marchand/releve"
        libelleLien="Voir mes paiements"
      />

      <div role="group" aria-label="Période" className="flex flex-wrap gap-2">
        {PERIODES.map((n) => (
          <button
            key={n}
            onClick={() => setJours(n)}
            aria-pressed={jours === n}
            className={`min-h-[44px] rounded-lg border px-4 text-sm font-semibold transition-colors ${
              jours === n
                ? "border-[#0F2A4A] bg-[#0F2A4A] text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {n} jours
          </button>
        ))}
      </div>

      {erreur && <Erreur message={erreur} onReessayer={recharger} />}
      {!erreur && !donnees && <Chargement />}

      {donnees && (
        <div className={`space-y-6 transition-opacity ${chargement ? "opacity-60" : ""}`}>
          <section>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              Totaux des paiements confirmés
            </p>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <Carte
                titre="Net à recevoir"
                valeur={francs(donnees.releve.net)}
                detail={`${nombre(donnees.releve.nb_confirmes)} paiement(s) confirmé(s)`}
                miseEnAvant
              />
              <Carte titre="Brut encaissé" valeur={francs(donnees.releve.brut)} />
              <Carte titre="Frais réseau" valeur={francs(donnees.releve.frais)} />
              <Carte titre="Commission" valeur={francs(donnees.releve.commission)} />
            </div>
          </section>

          <Panneau titre={`Derniers paiements (${nombre(donnees.page.total)})`} lien="/marchand/releve" libelleLien="Tout voir">
            {donnees.page.paiements.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500">
                Aucun paiement sur cette période.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {donnees.page.paiements.slice(0, NB_ELEMENTS).map((p) => (
                  <li key={p.reference} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{p.reference}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{dateCourte(p.date_heure)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-slate-900">{francs(p.montant)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">Net : {francs(p.net)}</p>
                    </div>
                    <StatutBadge statut={p.statut} />
                  </li>
                ))}
              </ul>
            )}
          </Panneau>
        </div>
      )}
    </div>
  );
}

/* ---------- Tableau de bord de l'administrateur ---------- */

function VueAdmin({ utilisateur }) {
  // Une seule source : l'historique des imports. Il n'existe pas de route « liste des paiements »
  // pour l'administrateur (/paiements est réservée aux marchands et répondrait 403).
  const { donnees: imports, erreur, chargement, recharger } = useChargement(() => lire("/imports"), []);

  const somme = (champ) => imports.reduce((total, i) => total + i[champ], 0);
  const dernier = imports?.[0]; // l'API renvoie le plus récent d'abord

  return (
    <div className="space-y-6">
      <Entete
        utilisateur={utilisateur}
        texte="Importez le fichier des paiements et suivez les imports."
        lien="/admin/import"
        libelleLien="Importer un fichier"
      />

      {erreur && <Erreur message={erreur} onReessayer={recharger} />}
      {!erreur && !imports && <Chargement />}

      {imports && (
        <div className={`space-y-6 transition-opacity ${chargement ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Carte titre="Imports effectués" valeur={nombre(imports.length)} />
            <Carte
              titre="Paiements enregistrés"
              valeur={nombre(somme("lignes_importees"))}
              detail="cumul des lignes importées"
              miseEnAvant
            />
            <Carte titre="Lignes rejetées" valeur={nombre(somme("lignes_rejetees"))} detail="tous imports confondus" />
            <Carte
              titre="Dernier import"
              valeur={dernier ? dateCourte(dernier.date) : "—"}
              detail={dernier ? `par ${dernier.auteur}` : "aucun import"}
            />
          </div>

          <Panneau titre="Derniers imports" lien="/admin/historique" libelleLien="Historique complet">
            {imports.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500">
                Aucun import pour l'instant. Importez le fichier des paiements pour commencer.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {imports.slice(0, NB_ELEMENTS).map((i) => (
                  <li key={i.id} className="px-4 py-3 sm:px-6">
                    <p className="font-semibold text-slate-900">
                      {dateCourte(i.date)} <span className="font-normal text-slate-500">par {i.auteur}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {nombre(i.lignes_lues)} lue(s) · {nombre(i.lignes_importees)} importée(s) ·{" "}
                      {nombre(i.lignes_deja_presentes)} déjà présente(s) · {nombre(i.lignes_rejetees)} rejetée(s)
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panneau>
        </div>
      )}
    </div>
  );
}

export default function Accueil() {
  const { utilisateur } = useAuth();
  return utilisateur.role === "MARCHAND" ? (
    <VueMarchand utilisateur={utilisateur} />
  ) : (
    <VueAdmin utilisateur={utilisateur} />
  );
}