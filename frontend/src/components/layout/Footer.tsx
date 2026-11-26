export function Footer() {
  return (
    <footer className="custom-footer-layout footer-fade-in">
      <div className="footer-card">
        <div className="footer-top-row">
          <span className="footer-text">
            <strong>Cérebro da Cidade · Curitiba/PR</strong> — Plataforma
            Integrada de Monitoramento Urbano, Hidrologia e Mobilidade
          </span>

          <div className="footer-links">
            <a href="#alagamentos" className="footer-link">
              Bacias Hidrográficas
            </a>
            <a href="#rotas" className="footer-link">
              Linhas URBS / GTFS
            </a>
            <a href="#emergencia" className="footer-link">
              Defesa Civil 199
            </a>
          </div>
        </div>

        <hr className="footer-divider" />

        <div className="footer-credits">
          Dados meteorológicos Open-Meteo · Malha territorial IBGE · Feed
          comunitário GTFS Curitiba · 2026
        </div>
      </div>
    </footer>
  );
}
