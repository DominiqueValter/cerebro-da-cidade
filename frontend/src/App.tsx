import { useState } from "react";

import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { Overview } from "./features/overview/Overview";
import { SmartMap } from "./features/smart-map/SmartMap";
import { Occurrences } from "./features/occurrences/Occurrences";
import { RiskAnalysis } from "./features/risk-analysis/RiskAnalysis";
import { UrbanMobility } from "./features/mobility/UrbanMobility";
import { CitizenPortal } from "./features/citizen/CitizenPortal";
import { LoginScreen, type AuthUser } from "./features/auth/LoginScreen";
import type { UrbanEvent } from "./features/overview/data/urbanEvents";

export type AppPage =
  | "overview"
  | "smart-map"
  | "occurrences"
  | "risk-analysis"
  | "mobility";

const AUTH_STORAGE_KEY = "cerebro_auth_user_v1";
const SAVED_NEIGHBORHOODS_KEY = "cerebro_citizen_saved_neighborhoods_v1";

function loadSavedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function loadSavedNeighborhoods(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_NEIGHBORHOODS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : ["Portão", "Centro"];
  } catch {
    return ["Portão", "Centro"];
  }
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(loadSavedUser);
  const [savedNeighborhoods, setSavedNeighborhoods] = useState<string[]>(
    loadSavedNeighborhoods,
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState<AppPage>("overview");
  const [focusedEvent, setFocusedEvent] = useState<UrbanEvent | null>(null);

  function handleAuthenticated(authenticatedUser: AuthUser, token: string) {
    setUser(authenticatedUser);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authenticatedUser));
    localStorage.setItem("cerebro_auth_token_v1", token);
  }

  function handleLogout() {
    setUser(null);
    setFocusedEvent(null);
    setActivePage("overview");
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem("cerebro_auth_token_v1");
  }

  function handleToggleSaveNeighborhood(neighborhood: string) {
    setSavedNeighborhoods((prev) => {
      const next = prev.includes(neighborhood)
        ? prev.filter((item) => item !== neighborhood)
        : [...prev, neighborhood];
      localStorage.setItem(SAVED_NEIGHBORHOODS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function handleNavigate(page: AppPage) {
    if (page !== "smart-map") {
      setFocusedEvent(null);
    }
    setActivePage(page);
    setSidebarOpen(false);
  }

  function handleOpenEventInMap(event: UrbanEvent) {
    setFocusedEvent(event);
    setActivePage("smart-map");
  }

  if (!user) {
    return <LoginScreen onAuthenticated={handleAuthenticated} />;
  }

  if (user.accountType === "citizen") {
    return (
      <div id="contentWrapper" className="citizen-layout">
        <Header
          onMenuClick={() => {}}
          activePage="overview"
          user={user}
          onLogout={handleLogout}
          savedNeighborhoods={savedNeighborhoods}
        />

        <main role="main" className="citizen-main-wrapper">
          <div className="main-content-wrapper">
            <CitizenPortal
              user={user}
              savedNeighborhoods={savedNeighborhoods}
              onToggleSaveNeighborhood={handleToggleSaveNeighborhood}
            />
          </div>
          <Footer />
        </main>
      </div>
    );
  }

  return (
    <div id="contentWrapper" className="app-shell">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activePage={activePage}
        onNavigate={handleNavigate}
      />

      <div className="app-main">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          activePage={activePage}
          user={user}
          onLogout={handleLogout}
        />

        <main role="main" className="main-content" key={activePage}>
          <div className="main-content-wrapper">
            {activePage === "overview" && (
              <Overview
                onExploreMap={() => handleNavigate("smart-map")}
                onViewOccurrences={() => handleNavigate("occurrences")}
              />
            )}

            {activePage === "smart-map" && (
              <SmartMap initialEvent={focusedEvent} />
            )}

            {activePage === "occurrences" && (
              <Occurrences onOpenInMap={handleOpenEventInMap} />
            )}

            {activePage === "risk-analysis" && (
              <RiskAnalysis onOpenInMap={handleOpenEventInMap} />
            )}

            {activePage === "mobility" && (
              <UrbanMobility onOpenInMap={handleOpenEventInMap} />
            )}
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
}

export default App;
