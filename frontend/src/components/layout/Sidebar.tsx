import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bus,
  ChevronLeft,
  LayoutDashboard,
  MapPin,
  ShieldAlert,
  X,
} from "lucide-react";

export type NavSection =
  | "overview"
  | "smart-map"
  | "occurrences"
  | "risk-analysis"
  | "mobility";

interface SidebarProps {
  open?: boolean;
  isOpen?: boolean;
  mobileOpen?: boolean;
  activeTab?: string;
  currentView?: string;
  activePage?: string;
  activeSection?: string;
  selectedTab?: string;
  currentTab?: string;
  page?: string;
  section?: string;
  onSelectTab?: (tab: NavSection) => void;
  onNavigate?: (tab: NavSection) => void;
  onChangeTab?: (tab: NavSection) => void;
  onSelect?: (tab: NavSection) => void;
  onClose?: () => void;
  userName?: string;
  userRole?: string;
}

interface TooltipState {
  visible: boolean;
  text: string;
  top: number;
  left: number;
}

const STORAGE_KEY = "cerebro_sidebar_recolhida";

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{
    id: NavSection;
    label: string;
    icon: typeof LayoutDashboard;
  }>;
}> = [
  {
    label: "Monitoramento",
    items: [
      { id: "overview", label: "Visão Geral", icon: LayoutDashboard },
      { id: "smart-map", label: "Mapa Inteligente", icon: MapPin },
    ],
  },
  {
    label: "Operação & Inteligência",
    items: [
      { id: "occurrences", label: "Ocorrências", icon: AlertTriangle },
      { id: "risk-analysis", label: "Análise de Riscos", icon: ShieldAlert },
      { id: "mobility", label: "Mobilidade Urbana", icon: Bus },
    ],
  },
];

export function Sidebar(props: SidebarProps) {
  const {
    activeTab,
    currentView,
    activePage,
    activeSection,
    selectedTab,
    currentTab,
    page,
    section,
    onSelectTab,
    onNavigate,
    onChangeTab,
    onSelect,
    open,
    isOpen,
    mobileOpen,
    onClose,
    userName = "Operador CCO",
    userRole = "Centro de Controle · Curitiba",
  } = props;

  const externalActive =
    activeTab ??
    currentView ??
    activePage ??
    activeSection ??
    selectedTab ??
    currentTab ??
    page ??
    section;

  const [internalActive, setInternalActive] = useState<string>("overview");
  const current = externalActive ?? internalActive;
  const drawerOpen = Boolean(open ?? isOpen ?? mobileOpen);

  useEffect(() => {
    if (externalActive) {
      setInternalActive(externalActive);
    }
  }, [externalActive]);

  const [retracted, setRetracted] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) return saved === "true";
    } catch {
      // ignora restrição de storage
    }
    return false;
  });

  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    text: "",
    top: 0,
    left: 0,
  });

  useEffect(() => {
    const width = retracted ? "72px" : "248px";
    document.documentElement.style.setProperty("--sidebar-tmanho", width);

    try {
      localStorage.setItem(STORAGE_KEY, String(retracted));
    } catch {
      // ignora restrição de storage
    }

    if (!retracted) {
      setTooltip((prev) => ({ ...prev, visible: false }));
    }
  }, [retracted]);

  function handleSelect(id: NavSection) {
    setInternalActive(id);
    const handler = onSelectTab ?? onNavigate ?? onChangeTab ?? onSelect;
    handler?.(id);
    onClose?.();
  }

  function handleMouseEnterItem(
    e: React.MouseEvent<HTMLButtonElement>,
    label: string,
  ) {
    if (!retracted) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      visible: true,
      text: label,
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  }

  function handleMouseLeaveItem() {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }

  return (
    <>
      {drawerOpen && (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Fechar menu lateral"
          onClick={onClose}
        />
      )}

      <aside
        id="sidebar"
        className={`sidebar ${retracted ? "retracted" : ""} ${
          drawerOpen ? "sidebar-open" : ""
        }`}
      >
        {/* LOGO / MARCA */}
        <div className="sidebar-brand">
          <div className="brand-icon" title="Cérebro da Cidade · Curitiba">
            <Activity size={19} />
          </div>

          <div className="brand-text">
            <span className="brand-name">CÉREBRO</span>
            <span className="brand-caption">INTELIGÊNCIA URBANA</span>
          </div>

          {onClose && (
            <button
              type="button"
              className="sidebar-close"
              onClick={onClose}
              aria-label="Fechar menu"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* STATUS DA CIDADE */}
        <div
          className="sidebar-city"
          title="Curitiba · PR — Monitoramento Online"
        >
          <span className="city-indicator" />
          <div className="city-information">
            <span className="city-name">Curitiba · PR</span>
            <span className="city-region">Núcleo Metropolitano</span>
          </div>
          <span className="city-status-tag">ONLINE</span>
        </div>

        {/* NAVEGAÇÃO COM SCROLL SUAVE */}
        <div className="sidebar-nav-wrapper">
          <nav className="sidebar-navigation" aria-label="Menu principal">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="navigation-section">
                <span className="navigation-label">{group.label}</span>

                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = current === item.id;

                  return (
                    <div
                      key={item.id}
                      className={`sidebar-item-row ${isActive ? "is-active" : ""}`}
                    >
                      <button
                        type="button"
                        className={`navigation-item ${
                          isActive ? "navigation-item-active" : ""
                        }`}
                        onClick={() => handleSelect(item.id)}
                        onMouseEnter={(e) =>
                          handleMouseEnterItem(e, item.label)
                        }
                        onMouseLeave={handleMouseLeaveItem}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <span className="nav-icon">
                          <Icon size={18} />
                        </span>
                        <span className="sidebar-text">{item.label}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* RODAPÉ DO OPERADOR */}
        <div className="sidebar-bottom">
          <div className="sidebar-footer" title={`${userName} — ${userRole}`}>
            <div className="sidebar-footer-top">
              <span className="sidebar-footer-dot" />
              <span className="footer-user-name">{userName}</span>
            </div>
            <span className="footer-user-role">{userRole}</span>
          </div>
        </div>
      </aside>

      {/* ABA REDONDA DE RECOLHER / EXPANDIR */}
      <button
        type="button"
        className={`sidebar-toggle ${retracted ? "is-retracted" : ""}`}
        aria-controls="sidebar"
        aria-expanded={!retracted}
        aria-label={retracted ? "Expandir menu" : "Recolher menu"}
        title={retracted ? "Expandir menu" : "Recolher menu"}
        onClick={() => setRetracted((prev) => !prev)}
      >
        <ChevronLeft size={15} />
      </button>

      {/* TOOLTIP FLUTUANTE QUANDO RECOLHIDA */}
      <div
        role="tooltip"
        className={`sidebar-tooltip ${tooltip.visible ? "show" : ""}`}
        style={{ top: `${tooltip.top}px`, left: `${tooltip.left}px` }}
      >
        {tooltip.text}
      </div>
    </>
  );
}
