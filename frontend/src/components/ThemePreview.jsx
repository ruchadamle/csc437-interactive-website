import React from "react";
import { createPreviewVariants, hexToRgba } from "../data/themeUtils.js";

const KPI_CARDS = [
  { label: "Panel 1", value: "+23%", trend: "This is important!" },
  { label: "Panel 2", value: "Value", trend: "Look at this information carefully..." },
  { label: "Panel 3", value: "14.5", trend: "Read me please." },
];

const CHART_BARS = [
  24, 28, 31, 34, 37, 33, 45, 42, 47, 50, 54, 57,
  53, 59, 61, 64, 67, 52, 69, 72, 84, 77, 87, 82,
];

export default function ThemePreview({ palette }) {
  function handlePreviewLinkClick(event) {
    event.preventDefault();
  }

  const variants = createPreviewVariants(palette);

  const roleRows = [
    { label: "Background", color: variants.bg },
    { label: "Primary", color: variants.primary },
    { label: "Accent", color: variants.accent },
    { label: "Text", color: variants.text },
  ];

  const styleVars = {
    "--theme-bg": variants.bg,
    "--theme-primary": variants.primary,
    "--theme-accent": variants.accent,
    "--theme-text": variants.text,
    "--theme-primary-ink": variants.text,
    "--theme-accent-ink": variants.bg,
    "--theme-primary-soft": hexToRgba(variants.primarySoft, 0.34),
    "--theme-accent-soft": hexToRgba(variants.accentSoft, 0.34),
    "--theme-outline": hexToRgba(variants.outline, 0.72),
    "--theme-grid-line": hexToRgba(variants.gridLine, 0.5),
    "--theme-card-bg": hexToRgba(variants.surface1, 0.92),
    "--theme-card-bg-alt": hexToRgba(variants.surface2, 0.9),
    "--theme-link": variants.link,
    "--theme-link-hover": variants.linkHover,
    "--theme-kpi-trend": variants.kpiTrend,
    "--theme-cta-bg": variants.ctaBg,
    "--theme-cta-hover": variants.ctaHover,
    "--theme-primary-strong": variants.primaryStrong,
    "--theme-accent-strong": variants.accentStrong,
    "--theme-tag-bg": hexToRgba(variants.tagBg, 0.85),
  };

  return (
    <section className="preview">
      <h2>Preview</h2>
      <div className="preview-mock">
        <div
          className="preview-site"
          style={styleVars}
          aria-label="Theme preview"
        >
          <header className="preview-site-header">
            <span className="preview-brand">Palette Visualizer</span>
            <nav className="preview-links" aria-label="Preview navigation">
              <a href="#" onClick={handlePreviewLinkClick}>Notifications</a>
              <a href="#" onClick={handlePreviewLinkClick}>Dashboard</a>
              <a href="#" onClick={handlePreviewLinkClick}>Log In</a>
            </nav>
          </header>

          <main className="preview-site-main">
            <section className="preview-dashboard-head">
              {KPI_CARDS.map((card) => (
                <article key={card.label} className="preview-kpi-card">
                  <p className="preview-kpi-label">{card.label}</p>
                  <p className="preview-kpi-value">{card.value}</p>
                  <p className="preview-kpi-trend">{card.trend}</p>
                </article>
              ))}
            </section>

            <section className="preview-visualizer-row">
              <article className="preview-palette-panel" aria-label="Palette roles">
                <h5>Palette Colors</h5>
                <div className="preview-palette-list">
                  {roleRows.map((row) => (
                    <div key={row.label} className="preview-palette-row">
                      <span className="preview-palette-dot" style={{ background: row.color }} />
                      <span>{row.label}</span>
                      <code>{row.color}</code>
                    </div>
                  ))}
                </div>
              </article>

              <article className="preview-chart-panel" aria-label="Color usage chart">
                <div className="preview-chart-toolbar">
                  <span>Bar Chart</span>
                  <a href="#" className="preview-inline-link" onClick={handlePreviewLinkClick}>View details</a>
                </div>
                <div className="preview-chart-area" aria-hidden="true">
                  <div className="preview-chart-bars">
                    {CHART_BARS.map((height, index) => (
                      <span
                        key={`${height}-${index}`}
                        className={`preview-bar ${index % 6 === 0 ? "is-accent" : ""}`}
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>
              </article>
            </section>

            <section className="preview-module-grid">
              <article className="preview-card">
                <h5>Important Panel</h5>
                <p>This panel could have important information. Pay attention to it!</p>
                <button className="preview-cta" type="button">Click me!</button>
              </article>
              <article className="preview-card preview-card-accent">
                <h5>Also Important</h5>
                <p>You can use accent colors for tags to make them stand out.</p>
                <div className="preview-tags" aria-hidden="true">
                  <span>To do</span>
                  <span>In progress</span>
                  <span>Completed</span>
                </div>
              </article>
            </section>
          </main>
        </div>
      </div>
    </section>
  );
}
