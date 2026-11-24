import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";

const MS_JOUR = 24 * 60 * 60 * 1000;
const MAX_JOURS_PERIODE = 90;

/* ---------- Utilitaires de format et de dates ---------- */

function formaterMontant(valeur) {
  if (valeur == null) return "—";
  return new Intl.NumberFormat("fr-FR").format(valeur) + " FCFA";
}

// Date locale au format AAAA-MM-JJ (évite le décalage d'un jour de toISOString)
function versISO(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${j}`;
}

function debutJournee(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isoVersDate(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(a, m - 1, j);
}

function nbJoursInclus(du, au) {
  return Math.round((isoVersDate(au) - isoVersDate(du)) / MS_JOUR) + 1;
}

function formaterDateCourte(iso) {
  return isoVersDate(iso).toLocaleDateString("fr-FR");
}

function dateRelative(valeur) {
  const d = new Date(valeur);
  const diffJours = Math.round((debutJournee(new Date()) - debutJournee(d)) / MS_JOUR);
  if (diffJours <= 0) return "Aujourd'hui";
  if (diffJours === 1) return "Hier";
  if (diffJours < 7) return `Il y a ${diffJours} jours`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function salutation() {
  return new Date().getHours() < 18 ? "Bonjour" : "Bonsoir";
}

/* ---------- Périodes d'export ---------- */

const PERIODES = [
  { cle: "aujourdhui", libelle: "Aujourd'hui" },
  { cle: "hier", libelle: "Hier" },
  { cle: "semaine", libelle: "7 derniers jours" },
  { cle: "mois", libelle: "Ce mois-ci" },
  { cle: "mois_dernier", libelle: "Mois dernier" },
  { cle: "perso", libelle: "Personnalisée" },
];

function calculerPeriode(cle) {
  const auj = debutJournee(new Date());
  if (cle === "aujourdhui") return { du: versISO(auj), au: versISO(auj) };
  if (cle === "hier") {
    const h = new Date(auj);
    h.setDate(h.getDate() - 1);
    return { du: versISO(h), au: versISO(h) };
  }
  if (cle === "semaine") {
    const d = new Date(auj);
    d.setDate(d.getDate() - 6);
    return { du: versISO(d), au: versISO(auj) };
  }
  if (cle === "mois") {
    return { du: versISO(new Date(auj.getFullYear(), auj.getMonth(), 1)), au: versISO(auj) };
  }
  if (cle === "mois_dernier") {
    return {
      du: versISO(new Date(auj.getFullYear(), auj.getMonth() - 1, 1)),
      au: versISO(new Date(auj.getFullYear(), auj.getMonth(), 0)),
    };
  }
  return null;
}

function validerPeriode(du, au) {
  if (!du || !au) return "Choisissez une date de début et une date de fin.";
  if (du > au) return "La date de début doit précéder la date de fin.";
  if (nbJoursInclus(du, au) > MAX_JOURS_PERIODE) {
    return `La période ne peut pas dépasser ${MAX_JOURS_PERIODE} jours.`;
  }
  return "";
}

/* ---------- Chargement des données ---------- */

async function lireJson(reponse) {
  if (!reponse.ok) throw new Error("Erreur de chargement");
  return reponse.json();
}

// Récupère toutes les pages (20 par page) pour que le graphique soit exact
async function toutesLesPages(chemin, pageMax = 10) {
  let page = 1;
  let liste = [];
  let total = 0;
  while (page <= pageMax) {
    const donnees = await lireJson(await api(`${chemin}&page=${page}`));
    const lot = donnees.paiements || [];
    total = donnees.total || 0;
    liste = liste.concat(lot);
    if (liste.length >= total || lot.length === 0) break;
    page += 1;
  }
  return { paiements: liste, total };
}

/* ---------- Petits composants ---------- */

const BADGES = {
  CONFIRME: "bg-emerald-100 text-emerald-700 border-emerald-200",
  EN_ATTENTE: "bg-amber-100 text-amber-700 border-amber-200",
  REFUSE: "bg-red-100 text-red-700 border-red-200",
};

const LIBELLES_STATUT = {
  CONFIRME: "Confirmé",
  EN_ATTENTE: "En attente",
  REFUSE: "Refusé",
};

const ICONES = {
  argent:
    "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  graphique:
    "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  tendance: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  fleche: "M9 5l7 7-7 7",
  telecharger: "M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4",
  horloge: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  alerte:
    "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  document:
    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  envoi:
    "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
  calendrier:
    "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  valide: "M5 13l4 4L19 7",
  info: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

function Icone({ nom, className = "h-4 w-4", epaisseur = 2 }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={epaisseur}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={ICONES[nom]} />
    </svg>
  );
}

function Skeleton({ className }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}

function Pastille({ statut }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        BADGES[statut] || "bg-slate-100 text-slate-700 border-slate-200"
      }`}
    >
      {LIBELLES_STATUT[statut] || statut}
    </span>
  );
}

const TEINTES = {
  vert: { fond: "bg-emerald-100", texte: "text-emerald-600" },
  bleu: { fond: "bg-blue-100", texte: "text-blue-600" },
  ambre: { fond: "bg-[#F5A623]/10", texte: "text-[#F5A623]" },
};

function CarteKpi({ titre, valeur, detail, icone, teinte, miseEnAvant = false }) {
  const t = TEINTES[teinte];
  return (
    <div
      className={`rounded-2xl border bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${
        miseEnAvant ? "border-[#F5A623]/40 ring-1 ring-[#F5A623]/20" : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{titre}</p>
        <div className={`rounded-full p-2 ${t.fond}`}>
          <Icone nom={icone} className={`h-4 w-4 ${t.texte}`} />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">{valeur}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function EtatVide({ titre, texte }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <Icone nom="document" className="mb-3 h-10 w-10 text-slate-300" epaisseur={1.5} />
      <p className="text-sm font-medium text-slate-600">{titre}</p>
      <p className="mt-1 max-w-sm text-xs text-slate-400">{texte}</p>
    </div>
  );
}

/* ---------- Export du relevé par période (marchand) ---------- */

class ErreurExport extends Error {}

function ExportReleve() {
  const aujourdhui = versISO(new Date());
  const [cle, setCle] = useState("mois");
  const [duPerso, setDuPerso] = useState(aujourdhui);
  const [auPerso, setAuPerso] = useState(aujourdhui);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null);

  const periode = useMemo(
    () => (cle === "perso" ? { du: duPerso, au: auPerso } : calculerPeriode(cle)),
    [cle, duPerso, auPerso]
  );
  const erreurPeriode = validerPeriode(periode.du, periode.au);

  async function exporter() {
    if (erreurPeriode) {
      setMessage({ type: "erreur", texte: erreurPeriode });
      return;
    }
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await api(`/releve/export?du=${periode.du}&au=${periode.au}`);
      if (!reponse.ok) {
        let detail = "Impossible d'exporter le relevé.";
        try {
          const corps = await reponse.json();
          if (typeof corps.detail === "string") detail = corps.detail;
        } catch {
          /* corps non JSON : on garde le message par défaut */
        }
        throw new ErreurExport(detail);
      }
      const blob = await reponse.blob();
      const url = URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = `releve_${periode.du}_${periode.au}.csv`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
      setMessage({ type: "succes", texte: "Votre relevé a été téléchargé." });
    } catch (e) {
      setMessage({
        type: "erreur",
        texte:
          e instanceof ErreurExport
            ? e.message
            : "Impossible d'exporter le relevé. Vérifiez votre connexion et réessayez.",
      });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-[#F5A623]/10 p-2.5">
          <Icone nom="telecharger" className="h-5 w-5 text-[#F5A623]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Exporter mon relevé</h3>
          <p className="mt-0.5 text-sm text-slate-500">Choisissez la période du fichier CSV.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Période du relevé">
        {PERIODES.map((p) => (
          <button
            key={p.cle}
            type="button"
            aria-pressed={cle === p.cle}
            onClick={() => {
              setCle(p.cle);
              setMessage(null);
            }}
            className={`min-h-[40px] rounded-full border px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] ${
              cle === p.cle
                ? "border-[#0F2A4A] bg-[#0F2A4A] text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {p.libelle}
          </button>
        ))}
      </div>

      {cle === "perso" && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Du
            <input
              type="date"
              value={duPerso}
              max={aujourdhui}
              onChange={(e) => {
                setDuPerso(e.target.value);
                setMessage(null);
              }}
              className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-[#F5A623] focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Au
            <input
              type="date"
              value={auPerso}
              max={aujourdhui}
              onChange={(e) => {
                setAuPerso(e.target.value);
                setMessage(null);
              }}
              className="mt-1 block min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-[#F5A623] focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30"
            />
          </label>
        </div>
      )}

      <div
        className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${
          erreurPeriode ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"
        }`}
      >
        <Icone nom={erreurPeriode ? "alerte" : "calendrier"} className="h-4 w-4 shrink-0" />
        {erreurPeriode ? (
          <span>{erreurPeriode}</span>
        ) : (
          <span>
            Du <strong>{formaterDateCourte(periode.du)}</strong> au{" "}
            <strong>{formaterDateCourte(periode.au)}</strong> ·{" "}
            {nbJoursInclus(periode.du, periode.au)} jour(s)
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={exporter}
        disabled={enCours || Boolean(erreurPeriode)}
        aria-busy={enCours}
        className="mt-5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#F5A623] px-4 text-sm font-semibold text-[#0A1628] transition-colors hover:bg-[#e0951a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F2A4A] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {enCours ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0A1628]/30 border-t-[#0A1628]" />
            Export en cours…
          </>
        ) : (
          <>
            <Icone nom="telecharger" className="h-4 w-4" />
            Exporter mon relevé (CSV)
          </>
        )}
      </button>

      {message && (
        <div
          role={message.type === "erreur" ? "alert" : "status"}
          className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
            message.type === "erreur"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          <Icone nom={message.type === "erreur" ? "alerte" : "valide"} className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message.texte}</span>
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs text-slate-400">
        <Icone nom="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Un relevé couvre au plus {MAX_JOURS_PERIODE} jours. Les numéros des payeurs sont masqués dans le fichier.
        </span>
      </p>
    </div>
  );
}

/* ---------- Page ---------- */

export default function Accueil() {
  const { utilisateur } = useAuth();
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [donnees, setDonnees] = useState(null);

  async function charger() {
    setChargement(true);
    setErreur("");
    try {
      const auj = debutJournee(new Date());
      const debutMois = new Date(auj.getFullYear(), auj.getMonth(), 1);
      const debutSemaine = new Date(auj);
      debutSemaine.setDate(auj.getDate() - 6);

      if (utilisateur.role === "MARCHAND") {
        const [totauxData, moisData, semaineData] = await Promise.all([
          api(`/releve?du=${versISO(debutMois)}&au=${versISO(auj)}`).then(lireJson),
          api(`/paiements?du=${versISO(debutMois)}&au=${versISO(auj)}&page=1`).then(lireJson),
          toutesLesPages(`/paiements?du=${versISO(debutSemaine)}&au=${versISO(auj)}`),
        ]);

        // Montants nets confirmés par jour sur les 7 derniers jours
        const jours = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(auj);
          d.setDate(auj.getDate() - i);
          jours.push({
            date: versISO(d),
            label: d.toLocaleDateString("fr-FR", { weekday: "short" }),
            estAujourdhui: i === 0,
            montant: 0,
            count: 0,
          });
        }
        semaineData.paiements.forEach((p) => {
          const jour = jours.find((j) => j.date === p.date_heure.slice(0, 10));
          if (jour && p.statut === "CONFIRME") {
            jour.montant += p.net || 0;
            jour.count += 1;
          }
        });
        const maxMontant = Math.max(...jours.map((j) => j.montant), 1);

        setDonnees({
          type: "MARCHAND",
          netMois: totauxData.net || 0,
          nbConfirmes: totauxData.nb_confirmes || 0,
          brutMois: totauxData.brut || 0,
          totalPaiements: moisData.total || 0,
          dernierPaiements: (moisData.paiements || []).slice(0, 5),
          totalSemaine: jours.reduce((s, j) => s + j.montant, 0),
          graphique: jours.map((j) => ({ ...j, hauteur: (j.montant / maxMontant) * 100 })),
        });
      } else {
        const importsData = await api("/imports").then(lireJson);
        let paiementsData = { total: 0, paiements: [] };
        try {
          paiementsData = await api("/paiements?page=1").then(lireJson);
        } catch {
          /* la liste des paiements est facultative sur le tableau de bord admin */
        }
        setDonnees({
          type: "ADMIN",
          dernierImport: importsData[0] || null,
          totalImports: importsData.length,
          totalPaiements: paiementsData.total || 0,
          dernierPaiements: (paiementsData.paiements || []).slice(0, 5),
        });
      }
    } catch {
      setErreur("Impossible de charger le tableau de bord.");
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, [utilisateur.role]);

  if (chargement) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Chargement du tableau de bord">
        <Skeleton className="h-32" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (erreur) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-12 text-center"
      >
        <Icone nom="alerte" className="mb-4 h-12 w-12 text-red-500" epaisseur={1.5} />
        <h3 className="text-lg font-semibold text-slate-900">Erreur de chargement</h3>
        <p className="mt-2 text-sm text-slate-600">{erreur}</p>
        <button
          onClick={charger}
          className="mt-4 min-h-[44px] rounded-lg bg-[#F5A623] px-5 text-sm font-semibold text-[#0A1628] transition-colors hover:bg-[#e0951a]"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête de bienvenue */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A1628] to-[#0F2A4A] p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-[#F5A623]/10" />
        <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium capitalize text-slate-300">
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
              {salutation()}, {utilisateur.identifiant}
              {utilisateur.role === "MARCHAND" && utilisateur.code_marchand && (
                <span className="ml-2 text-base font-normal text-slate-300">
                  ({utilisateur.code_marchand})
                </span>
              )}
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              {utilisateur.role === "MARCHAND"
                ? "Voici un aperçu de votre activité ce mois-ci."
                : "Gérez les imports et consultez l'activité de la plateforme."}
            </p>
          </div>
          {utilisateur.role === "MARCHAND" ? (
            <Link
              to="/marchand/releve"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-lg bg-[#F5A623] px-4 text-sm font-semibold text-[#0A1628] transition-colors hover:bg-[#e0951a] sm:self-auto"
            >
              Voir mes paiements
              <Icone nom="fleche" className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              to="/admin/import"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-lg bg-[#F5A623] px-4 text-sm font-semibold text-[#0A1628] transition-colors hover:bg-[#e0951a] sm:self-auto"
            >
              Importer un fichier
              <Icone nom="fleche" className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      {donnees.type === "MARCHAND" && (
        <>
          {/* Cartes KPI */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <CarteKpi
              titre="Net du mois"
              valeur={formaterMontant(donnees.netMois)}
              detail={`${donnees.nbConfirmes} paiement(s) confirmé(s)`}
              icone="argent"
              teinte="vert"
              miseEnAvant
            />
            <CarteKpi
              titre="Brut du mois"
              valeur={formaterMontant(donnees.brutMois)}
              detail="Montant total encaissé"
              icone="graphique"
              teinte="bleu"
            />
            <CarteKpi
              titre="Taux de succès"
              valeur={`${
                donnees.totalPaiements > 0
                  ? Math.round((donnees.nbConfirmes / donnees.totalPaiements) * 100)
                  : 0
              } %`}
              detail={`${donnees.nbConfirmes} confirmé(s) sur ${donnees.totalPaiements} paiement(s)`}
              icone="tendance"
              teinte="ambre"
            />
          </div>

          {/* Graphique + export */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:col-span-2">
              <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Activité des 7 derniers jours</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Net confirmé : <strong className="text-slate-700">{formaterMontant(donnees.totalSemaine)}</strong>
                  </p>
                </div>
                <Link
                  to="/marchand/releve"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Voir tout →
                </Link>
              </div>

              {donnees.graphique.every((j) => j.montant === 0) ? (
                <div className="flex h-48 flex-col items-center justify-center text-center">
                  <Icone nom="document" className="mb-3 h-10 w-10 text-slate-300" epaisseur={1.5} />
                  <p className="text-sm font-medium text-slate-600">Aucun paiement confirmé cette semaine</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Les paiements importés par l'administrateur apparaîtront ici.
                  </p>
                </div>
              ) : (
                <div
                  className="flex items-end justify-between gap-2 border-b border-slate-200 sm:gap-3"
                  style={{ height: "200px" }}
                >
                  {donnees.graphique.map((jour) => (
                    <div
                      key={jour.date}
                      tabIndex={0}
                      aria-label={`${jour.label} : ${formaterMontant(jour.montant)}, ${jour.count} paiement(s)`}
                      className="group relative flex h-full flex-1 flex-col items-center justify-end focus:outline-none"
                    >
                      <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                        <p className="font-semibold">{formaterMontant(jour.montant)}</p>
                        <p className="text-slate-300">{jour.count} paiement(s)</p>
                      </div>
                      <div
                        className={`w-full max-w-[40px] rounded-t-lg bg-gradient-to-t transition-all duration-500 ${
                          jour.estAujourdhui
                            ? "from-[#F5A623] to-[#F5A623]/80"
                            : "from-[#F5A623]/80 to-[#F5A623]/50 group-hover:from-[#e0951a] group-hover:to-[#e0951a]/80"
                        }`}
                        style={{ height: `${Math.max(Math.round(jour.hauteur * 1.5), 4)}px` }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {!donnees.graphique.every((j) => j.montant === 0) && (
                <div className="mt-2 flex items-start justify-between gap-2 sm:gap-3">
                  {donnees.graphique.map((jour) => (
                    <p
                      key={jour.date}
                      className={`flex-1 text-center text-xs capitalize ${
                        jour.estAujourdhui ? "font-bold text-slate-900" : "font-medium text-slate-500"
                      }`}
                    >
                      {jour.label}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <ExportReleve />
          </div>

          {/* Dernières transactions */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 sm:px-8">
              <h3 className="text-lg font-semibold text-slate-900">Dernières transactions</h3>
              <Link
                to="/marchand/releve"
                className="text-sm font-semibold text-[#F5A623] transition-colors hover:text-[#e0951a]"
              >
                Voir tout →
              </Link>
            </div>

            {donnees.dernierPaiements.length === 0 ? (
              <EtatVide
                titre="Aucun paiement importé pour le moment"
                texte="L'administrateur doit importer un fichier CSV pour alimenter votre espace."
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {donnees.dernierPaiements.map((p) => (
                  <div
                    key={p.reference}
                    className="flex items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-slate-50 sm:px-8"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{p.reference}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Pastille statut={p.statut} />
                        <span className="text-xs text-slate-500">{dateRelative(p.date_heure)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums text-slate-900">{formaterMontant(p.net)}</p>
                      <p className="mt-0.5 text-xs tabular-nums text-slate-400">
                        Payé : {formaterMontant(p.montant)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {donnees.type === "ADMIN" && (
        <>
          {/* Cartes KPI Admin */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dernier import</p>
              {donnees.dernierImport ? (
                <>
                  <p className="mt-3 text-2xl font-bold text-slate-900">
                    {dateRelative(donnees.dernierImport.date_creation)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {donnees.dernierImport.lignes_importees} importées · {donnees.dernierImport.lignes_rejetees} rejetées
                  </p>
                </>
              ) : (
                <p className="mt-3 text-lg text-slate-400">Aucun import</p>
              )}
            </div>
            <CarteKpi
              titre="Total des imports"
              valeur={donnees.totalImports}
              detail="Fichiers CSV traités"
              icone="envoi"
              teinte="ambre"
            />
            <CarteKpi
              titre="Paiements en base"
              valeur={donnees.totalPaiements}
              detail="Transactions enregistrées"
              icone="graphique"
              teinte="bleu"
            />
          </div>

          {/* Accès rapides Admin */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Link
              to="/admin/import"
              className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#F5A623]/30 hover:shadow-md"
            >
              <div className="rounded-xl bg-[#F5A623]/10 p-3 transition-colors group-hover:bg-[#F5A623]/20">
                <Icone nom="envoi" className="h-5 w-5 text-[#F5A623]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">Importer un CSV</p>
                <p className="mt-0.5 text-xs text-slate-500">Ajouter des paiements</p>
              </div>
              <Icone
                nom="fleche"
                className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-[#F5A623]"
              />
            </Link>

            <Link
              to="/admin/historique"
              className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#F5A623]/30 hover:shadow-md"
            >
              <div className="rounded-xl bg-blue-100 p-3 transition-colors group-hover:bg-blue-200">
                <Icone nom="horloge" className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">Historique des imports</p>
                <p className="mt-0.5 text-xs text-slate-500">Consulter les traitements</p>
              </div>
              <Icone
                nom="fleche"
                className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-blue-600"
              />
            </Link>
          </div>

          {/* Dernières transactions globales */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4 sm:px-8">
              <h3 className="text-lg font-semibold text-slate-900">Dernières transactions</h3>
            </div>
            {donnees.dernierPaiements.length === 0 ? (
              <EtatVide
                titre="Aucune transaction en base"
                texte="Importez un fichier CSV pour commencer à alimenter la plateforme."
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {donnees.dernierPaiements.map((p) => (
                  <div
                    key={p.reference}
                    className="flex items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-slate-50 sm:px-8"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{p.reference}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Pastille statut={p.statut} />
                        <span className="text-xs text-slate-500">
                          Marchand {p.code_marchand} · {dateRelative(p.date_heure)}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-slate-900">{formaterMontant(p.montant)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}