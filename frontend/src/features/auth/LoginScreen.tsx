import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  Building2,
  Lock,
  Mail,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";

export type AccountType = "admin" | "citizen";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  accountType: AccountType;
}

interface LoginScreenProps {
  onLogin?: (user: AuthUser, token: string) => void;
  onSuccess?: (user: AuthUser, token: string) => void;
  onAuthenticated?: (user: AuthUser, token: string) => void;
}

type AuthStep = "select-profile" | "credentials";

const API_BASE = "http://localhost:3000";

const CURITIBA_BG_URL =
  "https://images.unsplash.com/photo-1589394815804-964ed0be2eb5?auto=format&fit=crop&w=1920&q=80";

export function LoginScreen({
  onLogin,
  onSuccess,
  onAuthenticated,
}: LoginScreenProps) {
  const [step, setStep] = useState<AuthStep>("select-profile");
  const [accountType, setAccountType] = useState<AccountType>("admin");
  const [isRegister, setIsRegister] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function completeAuth(user: AuthUser, token: string) {
    localStorage.setItem("cerebro_token", token);
    localStorage.setItem("cerebro_user", JSON.stringify(user));

    const callback = onLogin ?? onSuccess ?? onAuthenticated;
    if (typeof callback === "function") {
      callback(user, token);
    } else {
      window.location.reload();
    }
  }

  function handleSelectProfile(selectedType: AccountType) {
    setAccountType(selectedType);
    setError("");
    setIsRegister(false);

    // Preenche com os usuários padrão configurados no backend para facilitar o teste
    if (selectedType === "admin") {
      setEmail("admin@cerebro.curitiba.pr.gov.br");
      setPassword("curitiba2026");
    } else {
      setEmail("cidadao@email.com");
      setPassword("123456");
    }

    setStep("credentials");
  }

  async function authenticateRequest(
    endpoint: "/api/auth/login" | "/api/auth/register",
    payload: Record<string, string>,
  ) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        token?: string;
        user?: AuthUser;
        message?: string;
      };

      if (!response.ok || !data.user || !data.token) {
        setError(data.message ?? "Não foi possível autenticar.");
        return;
      }

      completeAuth(data.user, data.token);
    } catch {
      setError(
        "Falha ao conectar com o servidor (verifique se a API está rodando na porta 3000).",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isRegister) {
      await authenticateRequest("/api/auth/register", {
        name: name.trim(),
        email: email.trim(),
        password,
        accountType,
      });
    } else {
      await authenticateRequest("/api/auth/login", {
        email: email.trim(),
        password,
      });
    }
  }

  async function handleQuickDemo() {
    await authenticateRequest("/api/auth/login", {
      email: "admin@cerebro.curitiba.pr.gov.br",
      password: "curitiba2026",
    });
  }

  return (
    <div
      className="login-screen-bg"
      style={{ backgroundImage: `url("${CURITIBA_BG_URL}")` }}
    >
      <div className="login-screen-overlay" />

      <div className="login-screen-container">
        {/* COLUNA ESQUERDA — TÍTULO INSTITUCIONAL */}
        <div className="login-hero-left">
          <div className="login-hero-badge">
            <Activity size={15} />
            <span>PLATAFORMA DE INTELIGÊNCIA URBANA · CURITIBA</span>
          </div>

          <h1 className="login-hero-title">
            Cérebro da
            <br />
            Cidade
          </h1>

          <p className="login-hero-subtitle">
            Monitoramento integrado de clima, drenagem urbana, mobilidade GTFS e
            análise preditiva de riscos em tempo real.
          </p>
        </div>

        {/* COLUNA DIREITA — CARD BRANCO ARREDONDADO */}
        <div className="login-card-wrapper">
          <div className="login-white-card">
            <div className="login-card-top">
              {step === "select-profile" ? (
                <>
                  <br />
                  <div className="login-welcome-header">
                    <h2>Bem-vindo!</h2>
                    <p>Selecione o perfil de acesso para entrar no sistema</p>
                  </div>
                  <br />
                  <div className="login-role-buttons">
                    <button
                      type="button"
                      className="login-role-outline-btn is-blue"
                      onClick={() => handleSelectProfile("admin")}
                    >
                      <span className="login-role-icon blue">
                        <Building2 size={20} />
                      </span>
                      <span className="login-role-label">
                        ACESSAR COMO GESTOR PÚBLICO
                      </span>
                    </button>

                    <div className="login-divider-or">
                      <span>ou</span>
                    </div>

                    <button
                      type="button"
                      className="login-role-outline-btn is-green"
                      onClick={() => handleSelectProfile("citizen")}
                    >
                      <span className="login-role-icon green">
                        <Users size={20} />
                      </span>
                      <span className="login-role-label">
                        ACESSAR COMO CIDADÃO
                      </span>
                    </button>
                  </div>

                  {error && (
                    <div className="login-error" style={{ marginTop: 14 }}>
                      {error}
                    </div>
                  )}

                  <button
                    type="button"
                    className="login-quick-demo-link"
                    disabled={loading}
                    onClick={handleQuickDemo}
                  >
                    {loading
                      ? "Conectando ao CCO..."
                      : "Acesso rápido de demonstração (CCO Curitiba)"}
                  </button>
                </>
              ) : (
                <>
                  <div className="login-form-header">
                    <button
                      type="button"
                      className="login-back-btn"
                      onClick={() => {
                        setStep("select-profile");
                        setError("");
                      }}
                    >
                      <ArrowLeft size={15} />
                      <span>Trocar perfil</span>
                    </button>

                    <span
                      className={`login-role-pill ${
                        accountType === "admin" ? "blue" : "green"
                      }`}
                    >
                      {accountType === "admin"
                        ? "Gestor Público"
                        : "Portal Cidadão"}
                    </span>
                  </div>

                  <div className="login-welcome-header compact">
                    <h2>{isRegister ? "Criar conta" : "Identifique-se"}</h2>
                    <p>
                      {accountType === "admin"
                        ? "Acesso ao painel operacional e análise de riscos"
                        : "Consulte alagamentos, rotas e alertas do seu bairro"}
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="login-form">
                    {isRegister && (
                      <label className="login-field">
                        <span>Nome completo</span>
                        <div className="login-input-wrap">
                          <User size={16} />
                          <input
                            type="text"
                            placeholder="Ex.: Dominique Valter"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                          />
                        </div>
                      </label>
                    )}

                    <label className="login-field">
                      <span>E-mail</span>
                      <div className="login-input-wrap">
                        <Mail size={16} />
                        <input
                          type="email"
                          placeholder={
                            accountType === "admin"
                              ? "admin@cerebro.curitiba.pr.gov.br"
                              : "cidadao@email.com"
                          }
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                    </label>

                    <label className="login-field">
                      <span>Senha</span>
                      <div className="login-input-wrap">
                        <Lock size={16} />
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>
                    </label>

                    {error && <div className="login-error">{error}</div>}

                    <button
                      type="submit"
                      className="login-submit-btn"
                      disabled={loading}
                    >
                      {loading
                        ? "Autenticando..."
                        : isRegister
                          ? "Cadastrar e entrar"
                          : "Entrar no sistema"}
                    </button>
                  </form>

                  <button
                    type="button"
                    className="login-switch-btn"
                    onClick={() => {
                      setIsRegister((prev) => !prev);
                      setError("");
                      if (!isRegister) {
                        setEmail("");
                        setPassword("");
                      }
                    }}
                  >
                    {isRegister
                      ? "Já possui cadastro? Fazer login"
                      : "Primeiro acesso? Criar conta"}
                  </button>
                </>
              )}
            </div>

            {/* RODAPÉ INSTITUCIONAL DO CARD */}
            <div className="login-card-bottom">
              <div className="login-brand-footer">
                <div className="login-brand-emblem">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <strong>Prefeitura · Núcleo Urbano</strong>
                  <span>Curitiba · Paraná</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
