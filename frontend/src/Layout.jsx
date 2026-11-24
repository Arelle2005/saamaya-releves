import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "./auth";

export default function Layout({ children }) {
  const { utilisateur, deconnexion } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!utilisateur) return null;

  const isAdmin = utilisateur.role === "ADMIN";
  
  const navItems = isAdmin
    ? [
        { path: "/", label: "Tableau de bord", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
        { path: "/admin/import", label: "Import des paiements", icon: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" },
        { path: "/admin/historique", label: "Historique des imports", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
      ]
    : [
        { path: "/", label: "Tableau de bord", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
        { path: "/marchand/releve", label: "Mes paiements", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
      ];

  const isActive = (path) => location.pathname === path;

  async function handleDeconnexion() {
    await deconnexion();
    // SOLUTION SENIOR : window.location.replace force un rechargement complet.
    // Cela vide la mémoire React, annule tout intercepteur 401 en cours,
    // et garantit une URL propre "/login" sans paramètre "?session_expired=true".
    window.location.replace("/login");
  }

  // Générer des initiales pour l'avatar
  const initiales = utilisateur.identifiant 
    ? utilisateur.identifiant.substring(0, 2).toUpperCase() 
    : "U";

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Overlay mobile */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Premium */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0A1628] text-white transition-transform duration-300 md:static md:translate-x-0 ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center border-b border-white/10 px-6">
          <img src="/images/logo-saamaya.png" alt="Saamaya" className="h-8 w-auto mr-3" />
          <span className="text-sm font-bold tracking-widest uppercase text-white">Saamaya</span>
        </div>
        
        <nav className="mt-6 space-y-1 px-3">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200 ${
                  active
                    ? "bg-[#F5A623]/10 text-[#F5A623] border-l-4 border-[#F5A623]"
                    : "text-slate-400 hover:bg-white/5 hover:text-white border-l-4 border-transparent"
                }`}
              >
                <svg className={`h-5 w-5 transition-colors ${active ? "text-[#F5A623]" : "text-slate-400 group-hover:text-white"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer de sidebar */}
        <div className="absolute bottom-0 w-full border-t border-white/10 p-4">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F5A623]/20 text-xs font-bold text-[#F5A623]">
              {initiales}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-white">{utilisateur.identifiant}</p>
              <p className="truncate text-xs text-slate-400 uppercase">{utilisateur.role}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Contenu principal */}
      <div className="flex flex-1 flex-col">
        {/* Barre supérieure */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm md:px-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
              aria-label="Ouvrir le menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-slate-900">
              {navItems.find(n => n.path === location.pathname)?.label || "Tableau de bord"}
            </h1>
          </div>

          <button
            onClick={handleDeconnexion}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/20"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </header>

        {/* Zone de contenu */}
        <main className="flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}