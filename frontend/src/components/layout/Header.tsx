import { useEffect, useMemo, useRef, useState } from "react";
import {
  Menu,
  Bell,
  MapPin,
  LogOut,
  Sun,
  Moon,
  Accessibility,
  Contrast,
  Type,
  User,
  ChevronDown,
  Shield,
  Waves,
  AlertTriangle,
  Car,
} from "lucide-react";

import { urbanEvents } from "../../features/overview/data/urbanEvents";
import type { UrbanEventCategory } from "../../features/overview/data/urbanEvents";
import type { AppPage } from "../../App";
import type { AuthUser } from "../../features/auth/LoginScreen";

interface HeaderProps {
  onMenuClick: () => void;
  activePage: AppPage;
  user: AuthUser;
  onLogout: () => void;
  savedNeighborhoods?: string[];
}

type FontFamilyMode = "default" | "lexend" | "dyslexic";

const pageTitles: Record<AppPage, string> = {
  overview: "Visão geral",
  "smart-map": "Mapa inteligente",
  occurrences: "Ocorrências",
  "risk-analysis": "Análise de riscos",
  mobility: "Mobilidade urbana",
};

const pageSections: Record<AppPage, string> = {
  overview: "Monitoramento",
  "smart-map": "Monitoramento",
  occurrences: "Monitoramento",
  mobility: "Monitoramento",
  "risk-analysis": "Inteligência",
};

const categoryLabels: Record<UrbanEventCategory, string> = {
  traffic: "Trânsito",
  flood: "Alagamentos",
  incident: "Ocorrências",
};

export function Header({
  onMenuClick,
  activePage,
  user,
  onLogout,
  savedNeighborhoods = [],
}: HeaderProps) {
  const [openDropdown, setOpenDropdown] = useState<
    "notifications" | "a11y" | "profile" | null
  >(null);

  const [darkMode, setDarkMode] = useState<boolean>(
    () => localStorage.getItem("cerebro_theme") === "dark",
  );
  const [highContrast, setHighContrast] = useState<boolean>(
    () => localStorage.getItem("cerebro_contrast") === "high",
  );
  const [fontScale, setFontScale] = useState<number>(() => {
    const saved = Number(localStorage.getItem("cerebro_font_scale"));
    return saved && saved >= 90 && saved <= 120 ? saved : 100;
  });
  const [fontMode, setFontMode] = useState<FontFamilyMode>(() => {
    const saved = localStorage.getItem("cerebro_font_mode");
    return saved === "lexend" || saved === "dyslexic" ? saved : "default";
  });

  const headerActionsRef = useRef<HTMLDivElement | null>(null);
  const isCitizen = user.accountType === "citizen";

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("dark-mode", darkMode);
    html.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("cerebro_theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("high-contrast", highContrast);
    html.setAttribute("data-contrast", highContrast ? "high" : "normal");
    localStorage.setItem("cerebro_contrast", highContrast ? "high" : "normal");
  }, [highContrast]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale}%`;
    localStorage.setItem("cerebro_font_scale", String(fontScale));
  }, [fontScale]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("font-lexend", "font-dyslexic");
    if (fontMode === "lexend") html.classList.add("font-lexend");
    if (fontMode === "dyslexic") html.classList.add("font-dyslexic");
    localStorage.setItem("cerebro_font_mode", fontMode);
  }, [fontMode]);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (
        headerActionsRef.current &&
        !headerActionsRef.current.contains(event.target as Node)
      ) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const visibleEvents = useMemo(() => {
    if (!isCitizen) return urbanEvents;
    return urbanEvents.filter((ev) =>
      savedNeighborhoods.some(
        (saved) =>
          ev.neighborhood.toLowerCase().includes(saved.toLowerCase()) ||
          saved.toLowerCase().includes(ev.neighborhood.toLowerCase()),
      ),
    );
  }, [isCitizen, savedNeighborhoods]);

  const userInitials = useMemo(() => {
    const parts = user.name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }, [user.name]);

  return (
    <header className="app-header header">
      <div className="header-container">
        <div className="header-left">
          {!isCitizen && (
            <button
              type="button"
              className="icon-btnHeader menu-button"
              onClick={onMenuClick}
              aria-label="Abrir menu"
            >
              <Menu size={20} />
            </button>
          )}

          {isCitizen ? (
            <div className="citizen-brand-header">
              <span className="citizen-brand-mark">CC</span>
              <div>
                <strong>Cérebro da Cidade</strong>
                <small>Portal do Cidadão · Curitiba/PR</small>
              </div>
            </div>
          ) : (
            <nav className="breadcrumb" aria-label="Navegação estrutural">
              <span className="breadcrumb-muted">
                {pageSections[activePage]}
              </span>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-current">
                {pageTitles[activePage]}
              </span>
            </nav>
          )}
        </div>

        <div className="header-spacer" />

        <div className="header-actions" ref={headerActionsRef}>
          <div className="header-location-pill" title="Município monitorado">
            <MapPin size={13} />
            <span>Curitiba · PR</span>
          </div>

          {/* 1. DROPDOWN DE ACESSIBILIDADE */}
          <div className="dropdown">
            <button
              type="button"
              className="icon-btnHeader"
              onClick={() =>
                setOpenDropdown((prev) => (prev === "a11y" ? null : "a11y"))
              }
              title="Recursos de acessibilidade"
              aria-label="Recursos de acessibilidade"
            >
              <Accessibility size={19} />
            </button>

            <div
              className={`drop-menu a11y-dropdown-menu ${openDropdown === "a11y" ? "open" : ""}`}
            >
              <div className="dropdown-section-title">Tamanho do texto</div>
              <div className="a11y-font-size-row">
                <button
                  type="button"
                  onClick={() => setFontScale((s) => Math.max(90, s - 5))}
                >
                  A-
                </button>
                <span>{fontScale}%</span>
                <button
                  type="button"
                  onClick={() => setFontScale((s) => Math.min(120, s + 5))}
                >
                  A+
                </button>
              </div>

              <div className="dropdown-section-title">Contraste & Leitura</div>
              <button
                type="button"
                className={`menu-item ${highContrast ? "is-selected" : ""}`}
                onClick={() => setHighContrast((prev) => !prev)}
              >
                <Contrast size={15} />
                <span>
                  Alto Contraste: {highContrast ? "Ativo" : "Desativado"}
                </span>
              </button>

              <button
                type="button"
                className={`menu-item ${fontMode === "default" ? "is-selected" : ""}`}
                onClick={() => setFontMode("default")}
              >
                <Type size={15} />
                <span>Fonte Padrão</span>
              </button>

              <button
                type="button"
                className={`menu-item ${fontMode === "lexend" ? "is-selected" : ""}`}
                onClick={() => setFontMode("lexend")}
              >
                <Type size={15} />
                <span>Fonte Lexend (Leitura)</span>
              </button>

              <button
                type="button"
                className={`menu-item ${fontMode === "dyslexic" ? "is-selected" : ""}`}
                onClick={() => setFontMode("dyslexic")}
              >
                <Type size={15} />
                <span>Fonte OpenDyslexic</span>
              </button>
            </div>
          </div>

          {/* 2. ALTERNADOR MODO ESCURO / CLARO */}
          <button
            type="button"
            className="icon-btnHeader"
            onClick={() => setDarkMode((prev) => !prev)}
            title={
              darkMode ? "Mudar para modo claro" : "Mudar para modo escuro"
            }
            aria-label={
              darkMode ? "Mudar para modo claro" : "Mudar para modo escuro"
            }
          >
            {darkMode ? <Sun size={19} /> : <Moon size={19} />}
          </button>

          {/* 3. NOTIFICAÇÕES COM BADGE NUMÉRICO */}
          <div className="notification-dropdown">
            <button
              type="button"
              className="icon-btnHeader notification-button"
              onClick={() =>
                setOpenDropdown((prev) =>
                  prev === "notifications" ? null : "notifications",
                )
              }
              aria-label="Notificações"
            >
              <Bell size={19} />
              {visibleEvents.length > 0 && (
                <span className="notification-badge">
                  {visibleEvents.length}
                </span>
              )}
            </button>

            <div
              className={`notification-menu ${openDropdown === "notifications" ? "open" : ""}`}
            >
              <div className="notification-header">
                <strong>
                  {isCitizen
                    ? "Alertas dos seus bairros"
                    : "Notificações operacionais"}
                </strong>
                <span className="mark-all-read">
                  {visibleEvents.length} ativo(s)
                </span>
              </div>

              <div className="notification-list">
                {visibleEvents.length === 0 ? (
                  <div className="notification-item">
                    <div className="notification-content">
                      <strong>Nenhum alerta ativo</strong>
                      <span>
                        Salve bairros no painel para receber notificações.
                      </span>
                    </div>
                  </div>
                ) : (
                  visibleEvents.slice(0, 5).map((ev) => (
                    <div className="notification-item" key={ev.id}>
                      <div className="notification-icon">
                        {ev.category === "flood" ? (
                          <Waves size={15} />
                        ) : ev.category === "traffic" ? (
                          <Car size={15} />
                        ) : (
                          <AlertTriangle size={15} />
                        )}
                      </div>
                      <div className="notification-content">
                        <div className="notification-title">
                          <strong>{ev.neighborhood}</strong>
                          <small>{ev.time}</small>
                        </div>
                        <span>
                          {categoryLabels[ev.category]} · {ev.title}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="notification-footer">
                {isCitizen
                  ? `Monitorando ${savedNeighborhoods.length} bairro(s) salvo(s)`
                  : `CCO Curitiba · ${urbanEvents.length} eventos no sistema`}
              </div>
            </div>
          </div>

          {/* 4. USER-BOX (NOME + CARGO + AVATAR + MENU DE PERFIL) */}
          <div className="dropdown">
            <div
              className="user-box"
              role="button"
              tabIndex={0}
              onClick={() =>
                setOpenDropdown((prev) =>
                  prev === "profile" ? null : "profile",
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setOpenDropdown((prev) =>
                    prev === "profile" ? null : "profile",
                  );
                }
              }}
            >
              <div className="user-info">
                <div className="username">{user.name}</div>
                <div className="user-role">
                  {isCitizen ? "Cidadão · Curitiba" : user.role}
                </div>
              </div>
              <div className="avatar">{userInitials}</div>
              <ChevronDown size={14} className="user-box-caret" />
            </div>

            <div
              className={`drop-menu profile-drop-menu ${openDropdown === "profile" ? "open" : ""}`}
            >
              <div className="profile-drop-header">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>

              <div className="menu-item">
                <User size={15} />
                <span>Meu Perfil</span>
              </div>

              <div className="menu-item">
                <Shield size={15} />
                <span>
                  Acesso:{" "}
                  <strong>{isCitizen ? "Cidadão" : "Administrador"}</strong>
                </span>
              </div>

              <button
                type="button"
                className="menu-item menu-item-danger"
                onClick={onLogout}
              >
                <LogOut size={15} />
                <span>Sair do sistema</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
