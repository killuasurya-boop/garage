// Garage Theme Engine — type-safe theme presets + persistence helpers.
// Theme dipersist di localStorage (key: GARAGE_THEME_STORAGE_KEY).
// Provider akan inject CSS variables ke <html> sehingga Tailwind v4 token
// (`bg-primary`, `text-foreground`, dll) ikut berubah seketika.

export type ThemeColorTokens = {
  bg0: string;
  bg1: string;
  bg2: string;
  bg3: string;
  line: string;
  fg: string;
  dim: string;
  mute: string;
  primary: string;
  primaryBright: string;
  primaryDeep: string;
  accent: string;
  silver: string;
};

export type ThemeUITokens = {
  // 0.25 – 1.5 rem
  radius: number;
  // 0.85 – 1.25 (multiplier)
  fontScale: number;
  // 220 – 320 px
  sidebarWidth: number;
  // 0 – 1 (0 = no motion, 1 = full)
  animationSpeed: number;
  // 0 – 1 (blur multiplier for glass effect)
  glassBlur: number;
  // boolean
  compactMode: boolean;
};

export type ThemeSemanticTokens = {
  surface: string;
  surfaceRaised: string;
  surfaceSoft: string;
  button: string;
  buttonHover: string;
  buttonText: string;
  focus: string;
  success: string;
  warning: string;
  danger: string;
};

export type ThemeTypographyTokens = {
  displayFont: string;
  bodyFont: string;
  monoFont: string;
  headingWeight: number;
  bodyWeight: number;
  letterSpacing: string;
  displayTransform: "uppercase" | "none";
};

export type ThemeEffectTokens = {
  shellGlow: string;
  panelShadow: string;
  raisedShadow: string;
  buttonShadow: string;
  insetHighlight: string;
  chromeIntensity: number;
  glassOpacity: number;
};

export type ThemeComponentTokens = {
  panelBg: string;
  cardBg: string;
  inputBg: string;
  badgeBg: string;
  activeBg: string;
  hoverBg: string;
};

export type ThemeBalancedTokens = {
  canvas: string;
  sidebar: string;
  sidebarActive: string;
  topbar: string;
  card: string;
  panel: string;
  chartPrimary: string;
  chartSecondary: string;
  accentSoft: string;
  shadowColor: string;
  textOnCanvas: string;
  textOnSidebar: string;
  borderSoft: string;
};

export type ThemePreset = {
  id: string;
  label: string;
  description: string;
  vibe: "industrial" | "luxury" | "minimal" | "futuristic" | "cyber" | "neo";
  colors: ThemeColorTokens;
  ui: ThemeUITokens;
  semantic?: Partial<ThemeSemanticTokens>;
  typography?: Partial<ThemeTypographyTokens>;
  effects?: Partial<ThemeEffectTokens>;
  components?: Partial<ThemeComponentTokens>;
};

type ThemeCleanProfile = {
  semantic?: Partial<ThemeSemanticTokens>;
  typography?: Partial<ThemeTypographyTokens>;
  effects?: Partial<ThemeEffectTokens>;
  components?: Partial<ThemeComponentTokens>;
  balanced?: Partial<ThemeBalancedTokens>;
};

export type GarageTheme = {
  presetId: string;
  colors: ThemeColorTokens;
  ui: ThemeUITokens;
  semantic: ThemeSemanticTokens;
  typography: ThemeTypographyTokens;
  effects: ThemeEffectTokens;
  components: ThemeComponentTokens;
  balanced?: ThemeBalancedTokens;
};

export const GARAGE_THEME_STORAGE_KEY = "garage:theme:v1";

/** Preset yang memang dirancang sebagai OS terang (SaaS clean). Semua lainnya: asphalt gelap. */
export const GARAGE_LIGHT_OS_PRESETS = new Set(["neutral-pro", "minimal-clean"]);

/** Kurasi MVP untuk picker di Garage OS — 4 tema operasional, bukan 15+. */
export const GARAGE_MVP_OS_PRESET_IDS = [
  "industrial-garage",
  "mokoto-crimson-tech",
  "luxury-black-gold",
  "neutral-pro",
] as const;

export type GarageMvpOsPresetId = (typeof GARAGE_MVP_OS_PRESET_IDS)[number];

const GARAGE_MVP_OS_PRESET_HINTS: Record<GarageMvpOsPresetId, string> = {
  "industrial-garage": "Rekomendasi · operasional harian",
  "mokoto-crimson-tech": "Premium · automotive dashboard",
  "luxury-black-gold": "Executive · gelap emas",
  "neutral-pro": "Terang · back-office",
};

export function isMvpGarageOsPreset(presetId: string): presetId is GarageMvpOsPresetId {
  return (GARAGE_MVP_OS_PRESET_IDS as readonly string[]).includes(presetId);
}

export function isLightGarageOsPreset(presetId: string) {
  return GARAGE_LIGHT_OS_PRESETS.has(presetId);
}

const baseUI: ThemeUITokens = {
  radius: 0.35,
  fontScale: 1,
  sidebarWidth: 256,
  animationSpeed: 1,
  glassBlur: 0.5,
  compactMode: false,
};

const baseTypography: ThemeTypographyTokens = {
  displayFont: 'var(--font-anton), Impact, "Arial Narrow", sans-serif',
  bodyFont: 'var(--font-space-grotesk), "Space Grotesk", ui-sans-serif, system-ui, sans-serif',
  monoFont: 'var(--font-jetbrains-mono), "JetBrains Mono", ui-monospace, monospace',
  headingWeight: 900,
  bodyWeight: 600,
  letterSpacing: "0",
  displayTransform: "uppercase",
};

function themeTypographyFor(preset: ThemePreset): ThemeTypographyTokens {
  const monoDisplay = 'var(--font-jetbrains-mono), "JetBrains Mono", ui-monospace, monospace';
  const cleanDisplay = 'var(--font-space-grotesk), "Space Grotesk", ui-sans-serif, system-ui, sans-serif';
  const byVibe: Partial<Record<ThemePreset["vibe"], Partial<ThemeTypographyTokens>>> = {
    industrial: { displayFont: cleanDisplay, headingWeight: 780, bodyWeight: 560, displayTransform: "none" },
    luxury: { displayFont: cleanDisplay, headingWeight: 760, bodyWeight: 550, displayTransform: "none" },
    futuristic: { displayFont: monoDisplay, headingWeight: 760, bodyWeight: 560, displayTransform: "uppercase" },
    cyber: { displayFont: monoDisplay, headingWeight: 780, bodyWeight: 580, displayTransform: "uppercase" },
    minimal: { displayFont: cleanDisplay, headingWeight: 800, bodyWeight: 550, displayTransform: "none" },
    neo: { displayFont: cleanDisplay, headingWeight: 760, bodyWeight: 560, displayTransform: "none" },
  };
  return { ...baseTypography, ...byVibe[preset.vibe], ...preset.typography };
}

function themeSemanticFor(preset: ThemePreset): ThemeSemanticTokens {
  const { colors } = preset;
  return {
    surface: colors.bg1,
    surfaceRaised: colors.bg2,
    surfaceSoft: colors.bg3,
    button: colors.primary,
    buttonHover: colors.primaryBright,
    buttonText: colors.fg,
    focus: colors.accent,
    success: "#22c55e",
    warning: colors.accent,
    danger: colors.primaryBright,
    ...preset.semantic,
  };
}

function themeEffectsFor(preset: ThemePreset): ThemeEffectTokens {
  const { colors, ui } = preset;
  const glowStrength = preset.vibe === "minimal" ? 0.08 : preset.vibe === "luxury" ? 0.12 : 0.14;
  return {
    shellGlow: [
      `radial-gradient(circle at 78% 8%, color-mix(in srgb, ${colors.primary} ${Math.round(glowStrength * 100 + 24)}%, transparent), transparent 32rem)`,
      `radial-gradient(circle at 15% 95%, color-mix(in srgb, ${colors.primaryDeep} 28%, transparent), transparent 30rem)`,
      `radial-gradient(circle at 12% 100%, color-mix(in srgb, ${colors.accent} 20%, transparent), transparent 28rem)`,
      `linear-gradient(150deg, ${colors.bg0}, ${colors.bg1} 40%, color-mix(in srgb, ${colors.primaryDeep} 42%, ${colors.bg0}) 80%, ${colors.bg0})`,
    ].join(", "),
    panelShadow: [
      "inset 0 1px 0 rgba(255,255,255,0.035)",
      `0 10px 28px color-mix(in srgb, ${colors.bg0} 34%, transparent)`,
      `0 0 0 1px color-mix(in srgb, ${colors.line} 72%, transparent)`,
    ].join(", "),
    raisedShadow: [
      "inset 0 1px 0 rgba(255,255,255,0.04)",
      `0 8px 20px color-mix(in srgb, ${colors.bg0} 28%, transparent)`,
    ].join(", "),
    buttonShadow: [
      `0 0 0 1px color-mix(in srgb, ${colors.primaryBright} 16%, transparent)`,
      `0 6px 14px color-mix(in srgb, ${colors.primary} 14%, transparent)`,
    ].join(", "),
    insetHighlight: `linear-gradient(180deg, rgba(255,255,255,${(0.035 + ui.glassBlur * 0.02).toFixed(3)}), rgba(255,255,255,0.012))`,
    chromeIntensity: preset.vibe === "minimal" ? 0.18 : preset.vibe === "luxury" ? 0.28 : 0.24,
    glassOpacity: 0.7 + ui.glassBlur * 0.08,
    ...preset.effects,
  };
}

function themeComponentsFor(preset: ThemePreset): ThemeComponentTokens {
  const { colors } = preset;
  return {
    panelBg: `linear-gradient(180deg, rgba(255,255,255,0.036), rgba(255,255,255,0.012)), color-mix(in srgb, ${colors.bg2} 88%, ${colors.bg1})`,
    cardBg: `linear-gradient(180deg, rgba(255,255,255,0.032), rgba(255,255,255,0.01)), color-mix(in srgb, ${colors.bg2} 78%, ${colors.bg1})`,
    inputBg: `color-mix(in srgb, ${colors.bg0} 38%, ${colors.bg3})`,
    badgeBg: `color-mix(in srgb, ${colors.accent} 10%, ${colors.bg2})`,
    activeBg: `color-mix(in srgb, ${colors.primary} 15%, ${colors.bg2})`,
    hoverBg: `color-mix(in srgb, ${colors.bg3} 58%, ${colors.primary} 5%)`,
    ...preset.components,
  };
}

const baseBalanced: ThemeBalancedTokens = {
  canvas: "#eef3f6",
  sidebar: "#103c3b",
  sidebarActive: "#0f5d5a",
  topbar: "rgba(255,255,255,0.92)",
  card: "#ffffff",
  panel: "#f8fafc",
  chartPrimary: "#0f8b86",
  chartSecondary: "#f3b11f",
  accentSoft: "#e4f4f2",
  shadowColor: "rgba(15, 23, 42, 0.12)",
  textOnCanvas: "#1f2937",
  textOnSidebar: "#eefdfa",
  borderSoft: "#d8e2e8",
};

function darkOperationalProfile(preset: ThemePreset): ThemeCleanProfile {
  const { colors } = preset;
  const sidebar = `color-mix(in srgb, ${colors.primaryDeep} 76%, ${colors.bg1})`;
  const sidebarActive = `color-mix(in srgb, ${colors.primary} 58%, ${colors.primaryDeep})`;
  const action = `color-mix(in srgb, ${colors.primary} 88%, #111827)`;
  const actionHover = `color-mix(in srgb, ${colors.primaryBright} 84%, #111827)`;
  const focus = `color-mix(in srgb, ${colors.primary} 64%, ${colors.accent})`;

  return {
    semantic: {
      surface: colors.bg1,
      surfaceRaised: colors.bg2,
      surfaceSoft: colors.bg3,
      button: action,
      buttonHover: actionHover,
      buttonText: "#ffffff",
      focus,
      success: "#22c55e",
      warning: colors.accent,
      danger: colors.primaryBright,
    },
    effects: {
      shellGlow: [
        `radial-gradient(circle at 78% 8%, color-mix(in srgb, ${colors.primary} 38%, transparent), transparent 32rem)`,
        `radial-gradient(circle at 15% 95%, color-mix(in srgb, ${colors.primaryDeep} 28%, transparent), transparent 30rem)`,
        `radial-gradient(circle at 12% 100%, color-mix(in srgb, ${colors.accent} 20%, transparent), transparent 28rem)`,
        `linear-gradient(150deg, ${colors.bg0}, ${colors.bg1} 40%, color-mix(in srgb, ${colors.primaryDeep} 42%, ${colors.bg0}) 80%, ${colors.bg0})`,
      ].join(", "),
      panelShadow: [
        "inset 0 1px 0 rgba(255,255,255,0.065)",
        "0 18px 52px rgba(0, 0, 0, 0.24)",
      ].join(", "),
      raisedShadow: [
        "inset 0 1px 0 rgba(255,255,255,0.075)",
        "0 16px 44px rgba(0, 0, 0, 0.28)",
      ].join(", "),
      buttonShadow: [
        `0 0 0 1px color-mix(in srgb, ${colors.primaryBright} 18%, transparent)`,
        `0 14px 32px color-mix(in srgb, ${colors.primary} 22%, transparent)`,
      ].join(", "),
      insetHighlight:
        "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.026))",
      chromeIntensity: 0.24,
      glassOpacity: 0.84,
    },
    components: {
      panelBg: `linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.026)), color-mix(in srgb, ${colors.bg2} 92%, transparent)`,
      cardBg: `linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)), ${colors.bg2}`,
      inputBg: `color-mix(in srgb, ${colors.bg3} 70%, transparent)`,
      badgeBg: `color-mix(in srgb, ${colors.accent} 16%, ${colors.bg2})`,
      activeBg: `color-mix(in srgb, ${colors.primary} 24%, ${colors.bg3})`,
      hoverBg: `color-mix(in srgb, ${colors.bg3} 84%, ${colors.primary} 8%)`,
    },
    balanced: {
      canvas: colors.bg0,
      sidebar,
      sidebarActive,
      topbar: `color-mix(in srgb, ${colors.bg1} 92%, transparent)`,
      card: colors.bg2,
      panel: colors.bg1,
      chartPrimary: colors.primary,
      chartSecondary: colors.accent,
      accentSoft: `color-mix(in srgb, ${colors.primary} 16%, ${colors.bg2})`,
      shadowColor: "rgba(0, 0, 0, 0.28)",
      textOnCanvas: colors.fg,
      textOnSidebar: colors.fg,
      borderSoft: colors.line,
    },
  };
}

function themeCleanProfileFor(preset: ThemePreset): ThemeCleanProfile {
  const { colors } = preset;
  const sidebar = `color-mix(in srgb, ${colors.primaryDeep} 76%, ${colors.bg1})`;
  const sidebarActive = `color-mix(in srgb, ${colors.primary} 58%, ${colors.primaryDeep})`;
  const action = `color-mix(in srgb, ${colors.primary} 88%, #111827)`;
  const actionHover = `color-mix(in srgb, ${colors.primaryBright} 84%, #111827)`;
  const focus = `color-mix(in srgb, ${colors.primary} 64%, ${colors.accent})`;
  const canvas = `color-mix(in srgb, #edf2f6 90%, ${colors.accent})`;
  const panel = `color-mix(in srgb, #f8fafc 94%, ${colors.accent})`;
  const accentSoft = `color-mix(in srgb, ${colors.primary} 10%, #ffffff)`;
  const lightBase: ThemeCleanProfile = {
    semantic: {
      surface: panel,
      surfaceRaised: "#ffffff",
      surfaceSoft: "#f3f6f9",
      button: action,
      buttonHover: actionHover,
      buttonText: "#ffffff",
      focus,
      success: "#3fbf7f",
      warning: "#d69022",
      danger: "#d94b4b",
    },
    effects: {
      shellGlow: `linear-gradient(135deg, ${canvas}, #f7fafc 52%, #e8eef3)`,
      panelShadow: [
        "0 1px 0 rgba(255,255,255,0.9) inset",
        "0 8px 22px rgba(15,23,42,0.08)",
        "0 0 0 1px rgba(148,163,184,0.16)",
      ].join(", "),
      raisedShadow: [
        "0 1px 0 rgba(255,255,255,0.85) inset",
        "0 6px 16px rgba(15,23,42,0.08)",
      ].join(", "),
      buttonShadow: [
        "0 1px 0 rgba(255,255,255,0.18) inset",
        `0 6px 14px color-mix(in srgb, ${colors.primary} 18%, transparent)`,
      ].join(", "),
      insetHighlight: "linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.24))",
      chromeIntensity: 0.08,
      glassOpacity: 0.94,
    },
    components: {
      panelBg: `linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,255,255,0.52)), ${panel}`,
      cardBg: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,255,255,0.86)), #ffffff",
      inputBg: "#ffffff",
      badgeBg: accentSoft,
      activeBg: `color-mix(in srgb, ${colors.primary} 14%, #ffffff)`,
      hoverBg: `color-mix(in srgb, ${colors.primary} 7%, #ffffff)`,
    },
    balanced: {
      ...baseBalanced,
      canvas,
      sidebar,
      sidebarActive,
      topbar: "rgba(255,255,255,0.9)",
      card: "#ffffff",
      panel,
      chartPrimary: colors.primary,
      chartSecondary: colors.accent,
      accentSoft,
      shadowColor: "rgba(15, 23, 42, 0.11)",
      textOnCanvas: "#1f2937",
      textOnSidebar: "#f8fafc",
      borderSoft: "#d9e3ea",
    },
  };

  const byVibe: Partial<Record<ThemePreset["vibe"], ThemeCleanProfile>> = {
    minimal: {
      semantic: {
        surface: `color-mix(in srgb, ${colors.bg1} 92%, ${colors.fg})`,
        surfaceRaised: `color-mix(in srgb, ${colors.bg2} 88%, ${colors.fg})`,
        buttonText: colors.bg0,
      },
      typography: { headingWeight: 760, bodyWeight: 520, displayTransform: "none" },
      effects: {
        chromeIntensity: 0.1,
        glassOpacity: 0.92,
        shellGlow: `linear-gradient(135deg, ${colors.bg0}, ${colors.bg1} 56%, ${colors.bg2})`,
      },
    },
    luxury: {
      typography: { headingWeight: 740, bodyWeight: 540, displayTransform: "none" },
      effects: { chromeIntensity: 0.18, glassOpacity: 0.86 },
    },
    futuristic: {
      typography: { headingWeight: 740, bodyWeight: 540 },
      effects: { chromeIntensity: 0.17, glassOpacity: 0.85 },
    },
    cyber: {
      typography: { headingWeight: 760, bodyWeight: 560 },
      effects: { chromeIntensity: 0.18, glassOpacity: 0.84 },
    },
  };

  const byPreset: Record<string, ThemeCleanProfile> = {
    "neutral-pro": {
      semantic: {
        surface: "#ffffff",
        surfaceRaised: "#ffffff",
        surfaceSoft: "#f1f5f9",
        button: "#6366f1",
        buttonHover: "#4f46e5",
        buttonText: "#ffffff",
        focus: "#818cf8",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
      },
      typography: {
        headingWeight: 760,
        bodyWeight: 520,
        displayTransform: "none",
        displayFont: 'var(--font-space-grotesk), "Space Grotesk", ui-sans-serif, system-ui, sans-serif',
      },
      effects: {
        shellGlow: "linear-gradient(135deg, #f8fafc, #f1f5f9 52%, #e2e8f0)",
        panelShadow:
          "0 1px 0 rgba(255,255,255,0.9) inset, 0 8px 22px rgba(15,23,42,0.07), 0 0 0 1px rgba(148,163,184,0.14)",
        raisedShadow:
          "0 1px 0 rgba(255,255,255,0.85) inset, 0 6px 16px rgba(15,23,42,0.07)",
        buttonShadow:
          "0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 14px color-mix(in srgb, #6366f1 20%, transparent)",
        insetHighlight:
          "linear-gradient(180deg, rgba(255,255,255,0.88), rgba(255,255,255,0.32))",
        chromeIntensity: 0.08,
        glassOpacity: 0.94,
      },
      components: {
        panelBg: "linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.6)), #ffffff",
        cardBg: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.9)), #ffffff",
        inputBg: "#ffffff",
        badgeBg: "#eef2ff",
        activeBg: "#eef2ff",
        hoverBg: "#f8faff",
      },
      balanced: {
        canvas: "#f8fafc",
        sidebar: "#0f172a",
        sidebarActive: "#1e293b",
        topbar: "rgba(255,255,255,0.95)",
        card: "#ffffff",
        panel: "#ffffff",
        chartPrimary: "#6366f1",
        chartSecondary: "#f59e0b",
        accentSoft: "#eef2ff",
        shadowColor: "rgba(15,23,42,0.09)",
        textOnCanvas: "#1e293b",
        textOnSidebar: "#f8fafc",
        borderSoft: "#cbd5e1",
      },
    },
    "mokoto-crimson-tech": {
      semantic: {
        surface: "#f5f7fa",
        surfaceRaised: "#ffffff",
        surfaceSoft: "#eef2f6",
        button: "#df2531",
        buttonHover: "#f03a45",
        buttonText: "#ffffff",
        focus: "#e0525c",
        warning: "#d99b4a",
        danger: "#ef4444",
      },
      typography: { headingWeight: 760, bodyWeight: 540, displayTransform: "none" },
      effects: {
        shellGlow: "linear-gradient(135deg, #edf1f5, #f8fafc 56%, #e8edf2)",
        panelShadow: "0 1px 0 rgba(255,255,255,0.9) inset, 0 8px 22px rgba(15,23,42,0.09), 0 0 0 1px rgba(148,163,184,0.16)",
        raisedShadow: "0 1px 0 rgba(255,255,255,0.9) inset, 0 6px 16px rgba(15,23,42,0.08)",
        buttonShadow: "0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 14px rgba(223,37,49,0.22)",
        chromeIntensity: 0.14,
      },
      components: {
        inputBg: "#ffffff",
        badgeBg: "#fde9ec",
        activeBg: "#fde7ea",
        hoverBg: "#fff1f2",
      },
      balanced: {
        canvas: "#edf1f5",
        sidebar: "#050809",
        sidebarActive: "#7b0f18",
        topbar: "rgba(255,255,255,0.92)",
        card: "#ffffff",
        panel: "#f7f9fb",
        chartPrimary: "#df2531",
        chartSecondary: "#f5a742",
        accentSoft: "#fde9ec",
        shadowColor: "rgba(15,23,42,0.12)",
        textOnCanvas: "#20242a",
        textOnSidebar: "#ffffff",
        borderSoft: "#dce3ea",
      },
    },
    "altitude-electric-blue": {
      semantic: {
        surface: "#f3f6fb",
        surfaceRaised: "#ffffff",
        surfaceSoft: "#e8eef8",
        button: "#2563eb",
        buttonHover: "#3b82f6",
        buttonText: "#f8fbff",
        focus: "#60a5fa",
        warning: "#d9a441",
        danger: "#f87171",
      },
      effects: {
        shellGlow: "linear-gradient(135deg, #e9eef8, #f8fbff 54%, #e4ebf8)",
        buttonShadow: "0 0 0 1px rgba(147,197,253,0.16), 0 6px 14px rgba(37,99,235,0.18)",
      },
      components: {
        inputBg: "#ffffff",
        badgeBg: "#e6f0ff",
        activeBg: "#dbeafe",
        hoverBg: "#eff6ff",
      },
      balanced: {
        canvas: "#e9eef8",
        sidebar: "#0f2346",
        sidebarActive: "#1d4ed8",
        topbar: "rgba(255,255,255,0.9)",
        card: "#ffffff",
        panel: "#f7faff",
        chartPrimary: "#2563eb",
        chartSecondary: "#f5b82e",
        accentSoft: "#e6f0ff",
        shadowColor: "rgba(30,64,175,0.13)",
        textOnCanvas: "#1f2a3d",
        textOnSidebar: "#f8fbff",
        borderSoft: "#d7e2f2",
      },
    },
    "violet-layer-system": {
      semantic: {
        surface: "#f5f1fb",
        surfaceRaised: "#ffffff",
        surfaceSoft: "#eee7fa",
        button: "#7c3aed",
        buttonHover: "#8b5cf6",
        buttonText: "#fbf7ff",
        focus: "#a78bfa",
        warning: "#d8a24d",
        danger: "#fb7185",
      },
      effects: {
        shellGlow: "linear-gradient(135deg, #eee8f8, #fbf9ff 54%, #ebe2f8)",
        buttonShadow: "0 0 0 1px rgba(196,181,253,0.14), 0 6px 14px rgba(124,58,237,0.16)",
      },
      components: {
        inputBg: "#ffffff",
        badgeBg: "#f0e9ff",
        activeBg: "#ede4ff",
        hoverBg: "#f5f0ff",
      },
      balanced: {
        canvas: "#eee8f8",
        sidebar: "#2f1762",
        sidebarActive: "#6631db",
        topbar: "rgba(255,255,255,0.9)",
        card: "#ffffff",
        panel: "#fbf9ff",
        chartPrimary: "#7c3aed",
        chartSecondary: "#f4b740",
        accentSoft: "#f0e9ff",
        shadowColor: "rgba(76,29,149,0.12)",
        textOnCanvas: "#2b2733",
        textOnSidebar: "#fbf7ff",
        borderSoft: "#dfd4f2",
      },
    },
    "burgundy-cream-gradient": {
      semantic: {
        surface: "#fbf4ef",
        surfaceRaised: "#ffffff",
        surfaceSoft: "#f4e8df",
        button: "#7f1d1d",
        buttonHover: "#9f2a2a",
        buttonText: "#fff4eb",
        focus: "#fed7b8",
        warning: "#d59c6f",
        danger: "#f87171",
      },
      balanced: {
        canvas: "#f1e5dd",
        sidebar: "#3a1114",
        sidebarActive: "#7f1d1d",
        topbar: "rgba(255,251,247,0.9)",
        card: "#fffaf6",
        panel: "#fbf4ef",
        chartPrimary: "#7f1d1d",
        chartSecondary: "#d99b6f",
        accentSoft: "#fff0e4",
        shadowColor: "rgba(90,38,26,0.12)",
        textOnCanvas: "#2d2420",
        textOnSidebar: "#fff4eb",
        borderSoft: "#e8d4c7",
      },
    },
    "royal-olive-gold": {
      semantic: {
        surface: "#f4f4e8",
        surfaceRaised: "#fffef4",
        surfaceSoft: "#ececcf",
        button: "#b8922b",
        buttonHover: "#d1ab3d",
        buttonText: "#111307",
        focus: "#ffe270",
        warning: "#d6b03f",
        danger: "#fb7185",
      },
      effects: {
        shellGlow: "linear-gradient(135deg, #ecefdc, #fffef4 54%, #e3e7cd)",
        buttonShadow: "0 0 0 1px rgba(255,226,112,0.14), 0 6px 14px rgba(184,146,43,0.16)",
      },
      components: {
        inputBg: "#fffef8",
        badgeBg: "#fff5bc",
        activeBg: "#f7e7a2",
        hoverBg: "#fbf3cf",
      },
      balanced: {
        canvas: "#ecefdc",
        sidebar: "#363820",
        sidebarActive: "#858839",
        topbar: "rgba(255,254,244,0.9)",
        card: "#fffef8",
        panel: "#f7f7ea",
        chartPrimary: "#b8922b",
        chartSecondary: "#6b7b2f",
        accentSoft: "#fff5bc",
        shadowColor: "rgba(76,76,53,0.13)",
        textOnCanvas: "#28291d",
        textOnSidebar: "#fff5b8",
        borderSoft: "#dadcba",
      },
    },
    "jellyfish-slate": {
      semantic: {
        surface: "#f1f4f7",
        surfaceRaised: "#ffffff",
        surfaceSoft: "#e7edf2",
        button: "#5f7388",
        buttonHover: "#75899d",
        buttonText: "#f5f7fa",
        focus: "#9ea7b3",
        success: "#59b98b",
        warning: "#c6a15b",
        danger: "#d87a7a",
      },
      typography: { headingWeight: 740, bodyWeight: 520, displayTransform: "none" },
      effects: {
        shellGlow: "linear-gradient(135deg, #e7edf2, #f8fafc 54%, #dfe7ee)",
        buttonShadow: "0 0 0 1px rgba(194,199,207,0.12), 0 6px 14px rgba(20,24,30,0.18)",
        chromeIntensity: 0.1,
      },
      components: {
        inputBg: "#ffffff",
        badgeBg: "#e9eef3",
        activeBg: "#dfe7ee",
        hoverBg: "#f1f5f9",
      },
      balanced: {
        canvas: "#e7edf2",
        sidebar: "#26313d",
        sidebarActive: "#516477",
        topbar: "rgba(255,255,255,0.9)",
        card: "#ffffff",
        panel: "#f8fafc",
        chartPrimary: "#5f7388",
        chartSecondary: "#9ea7b3",
        accentSoft: "#e9eef3",
        shadowColor: "rgba(30,41,59,0.11)",
        textOnCanvas: "#26313d",
        textOnSidebar: "#f5f7fa",
        borderSoft: "#d7e0e8",
      },
    },
    "deep-crimson-coral": {
      semantic: {
        surface: "#f8f1ee",
        surfaceRaised: "#ffffff",
        surfaceSoft: "#f1e3de",
        button: "#b91c1c",
        buttonHover: "#fd522d",
        buttonText: "#fff7f4",
        focus: "#fb7d60",
        warning: "#d79a48",
        danger: "#fd522d",
      },
      effects: {
        shellGlow: "linear-gradient(135deg, #eee7e4, #fffafa 54%, #eadbd5)",
        buttonShadow: "0 0 0 1px rgba(253,82,45,0.14), 0 6px 14px rgba(185,28,28,0.16)",
      },
      balanced: {
        canvas: "#eee7e4",
        sidebar: "#160707",
        sidebarActive: "#911307",
        topbar: "rgba(255,250,248,0.9)",
        card: "#ffffff",
        panel: "#fbf6f4",
        chartPrimary: "#b91c1c",
        chartSecondary: "#fd522d",
        accentSoft: "#ffe9e3",
        shadowColor: "rgba(127,29,29,0.12)",
        textOnCanvas: "#2f2422",
        textOnSidebar: "#fff7f4",
        borderSoft: "#ead1ca",
      },
    },
    "cyberpunk-neon": {
      semantic: {
        surface: "#0b1020",
        surfaceRaised: "#10162a",
        surfaceSoft: "#171f36",
        button: "#4f46e5",
        buttonHover: "#6366f1",
        focus: "#22d3ee",
        warning: "#eab308",
        danger: "#fb7185",
      },
      effects: {
        shellGlow: "linear-gradient(135deg, #050816, #0b1020 54%, #10162a)",
      },
    },
    "minimal-clean": {
      semantic: {
        surface: "#eef2f6",
        surfaceRaised: "#ffffff",
        surfaceSoft: "#e6ebf1",
        button: "#334155",
        buttonHover: "#1f2937",
        buttonText: "#ffffff",
        focus: "#2563eb",
        success: "#168553",
        warning: "#a16207",
        danger: "#dc2626",
      },
      effects: {
        shellGlow: "linear-gradient(135deg, #f8fafc, #eef2f6 56%, #e6ebf1)",
        panelShadow: "inset 0 1px 0 rgba(255,255,255,0.8), 0 8px 20px rgba(15,23,42,0.08), 0 0 0 1px rgba(15,23,42,0.08)",
        raisedShadow: "0 5px 14px rgba(15,23,42,0.07)",
        buttonShadow: "0 0 0 1px rgba(15,23,42,0.08), 0 5px 12px rgba(15,23,42,0.12)",
      },
      components: {
        inputBg: "#ffffff",
        badgeBg: "#e8eef6",
        activeBg: "#dfe7f2",
        hoverBg: "#edf2f7",
      },
    },
  };

  const mergeProfile = (...profiles: Array<ThemeCleanProfile | undefined>): ThemeCleanProfile =>
    profiles.reduce<ThemeCleanProfile>(
      (merged, profile) => ({
        semantic: { ...merged.semantic, ...profile?.semantic },
        typography: { ...merged.typography, ...profile?.typography },
        effects: { ...merged.effects, ...profile?.effects },
        components: { ...merged.components, ...profile?.components },
        balanced: { ...merged.balanced, ...profile?.balanced },
      }),
      {},
    );

  if (isLightGarageOsPreset(preset.id)) {
    return mergeProfile(lightBase, byVibe[preset.vibe], byPreset[preset.id]);
  }

  const presetTypography = byPreset[preset.id]?.typography;
  return mergeProfile(
    darkOperationalProfile(preset),
    presetTypography ? { typography: presetTypography } : undefined,
  );
}

function visualContractFor(preset: ThemePreset) {
  const clean = themeCleanProfileFor(preset);
  return {
    semantic: { ...themeSemanticFor(preset), ...clean.semantic, ...preset.semantic },
    typography: { ...themeTypographyFor(preset), ...clean.typography, ...preset.typography },
    effects: { ...clean.effects, ...themeEffectsFor(preset), ...preset.effects },
    components: { ...themeComponentsFor(preset), ...clean.components, ...preset.components },
    balanced: { ...baseBalanced, ...clean.balanced },
  };
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "mokoto-crimson-tech",
    label: "Mokoto Crimson Tech",
    description: "Black glass, crimson accent, premium automotive dashboard.",
    vibe: "industrial",
    colors: {
      bg0: "#000000",
      bg1: "#080102",
      bg2: "#120306",
      bg3: "#21080c",
      line: "#2a2a32",
      fg: "#ffffff",
      dim: "#d9d9dc",
      mute: "#8f8f8f",
      primary: "#df2531",
      primaryBright: "#ff3a47",
      primaryDeep: "#7b0f18",
      accent: "#f5a742",
      silver: "#f2f2f2",
    },
    ui: { ...baseUI, radius: 0.55, glassBlur: 0.75 },
  },
  {
    id: "mindful-warm-crimson",
    label: "Mindful Warm Crimson",
    description: "Warm premium crimson with orange energy and editorial gradients.",
    vibe: "luxury",
    colors: {
      bg0: "#100c08",
      bg1: "#1a0908",
      bg2: "#250b0b",
      bg3: "#3b1011",
      line: "#613014",
      fg: "#f3f4f5",
      dim: "#dbe0e1",
      mute: "#a99b98",
      primary: "#95122c",
      primaryBright: "#ca3f16",
      primaryDeep: "#100c08",
      accent: "#ff9408",
      silver: "#dbe0e1",
    },
    ui: { ...baseUI, radius: 0.55, glassBlur: 0.7 },
  },
  {
    id: "altitude-electric-blue",
    label: "Altitude Electric Blue",
    description: "Futuristic electric blue and violet for data-heavy SaaS views.",
    vibe: "futuristic",
    colors: {
      bg0: "#00033d",
      bg1: "#020866",
      bg2: "#0600ab",
      bg3: "#1118c8",
      line: "#3f4bd8",
      fg: "#f2e6ee",
      dim: "#cfc8ff",
      mute: "#977dff",
      primary: "#0033ff",
      primaryBright: "#4b6fff",
      primaryDeep: "#00033d",
      accent: "#ffcff2",
      silver: "#f2e6ee",
    },
    ui: { ...baseUI, radius: 0.6, glassBlur: 0.8 },
  },
  {
    id: "violet-layer-system",
    label: "Violet Layer System",
    description: "Layered purple surfaces for clean creative product interfaces.",
    vibe: "neo",
    colors: {
      bg0: "#34117e",
      bg1: "#491ab1",
      bg2: "#6631db",
      bg3: "#7b45f0",
      line: "#8b61f4",
      fg: "#f6efff",
      dim: "#d0bcfc",
      mute: "#b796ee",
      primary: "#a981ff",
      primaryBright: "#c9a8ff",
      primaryDeep: "#491ab1",
      accent: "#d0bcfc",
      silver: "#d0bcfc",
    },
    ui: { ...baseUI, radius: 0.8, glassBlur: 0.85 },
  },
  {
    id: "burgundy-cream-gradient",
    label: "Burgundy Cream Gradient",
    description: "Elegant burgundy and cream for warm premium brand interfaces.",
    vibe: "luxury",
    colors: {
      bg0: "#2a0b0d",
      bg1: "#3d1013",
      bg2: "#59171b",
      bg3: "#73443c",
      line: "#8a4d43",
      fg: "#fff3e8",
      dim: "#fed7b8",
      mute: "#d8a98d",
      primary: "#59171b",
      primaryBright: "#9a3b3d",
      primaryDeep: "#2a0b0d",
      accent: "#fed7b8",
      silver: "#fff3e8",
    },
    ui: { ...baseUI, radius: 0.7, glassBlur: 0.65 },
  },
  {
    id: "royal-olive-gold",
    label: "Royal Olive Gold",
    description: "Royal gold, olive, and lime for bold organic luxury dashboards.",
    vibe: "luxury",
    colors: {
      bg0: "#252719",
      bg1: "#4c4c35",
      bg2: "#858839",
      bg3: "#a19d2e",
      line: "#a69735",
      fg: "#fff5b8",
      dim: "#ffe270",
      mute: "#c9c066",
      primary: "#dfb836",
      primaryBright: "#ffe270",
      primaryDeep: "#858839",
      accent: "#dcff3e",
      silver: "#fff5b8",
    },
    ui: { ...baseUI, radius: 0.65, glassBlur: 0.7 },
  },
  {
    id: "jellyfish-slate",
    label: "Jellyfish Slate",
    description: "Calm dark slate and glass for enterprise monitoring panels.",
    vibe: "minimal",
    colors: {
      bg0: "#141214",
      bg1: "#242327",
      bg2: "#302f33",
      bg3: "#464c55",
      line: "#464c55",
      fg: "#c2c7cf",
      dim: "#9ea7b3",
      mute: "#7f8995",
      primary: "#7f8995",
      primaryBright: "#c2c7cf",
      primaryDeep: "#302f33",
      accent: "#9ea7b3",
      silver: "#c2c7cf",
    },
    ui: { ...baseUI, radius: 0.6, glassBlur: 0.8 },
  },
  {
    id: "deep-crimson-coral",
    label: "Deep Crimson Coral",
    description: "High-impact black, deep crimson, and coral for urgent workflows.",
    vibe: "cyber",
    colors: {
      bg0: "#000000",
      bg1: "#140606",
      bg2: "#180202",
      bg3: "#2a0705",
      line: "#5a160d",
      fg: "#ffffff",
      dim: "#ffc4b8",
      mute: "#a36b61",
      primary: "#911307",
      primaryBright: "#fd522d",
      primaryDeep: "#140606",
      accent: "#fd522d",
      silver: "#ffffff",
    },
    ui: { ...baseUI, radius: 0.5, glassBlur: 0.7 },
  },
  {
    id: "industrial-garage",
    label: "Industrial Garage",
    description: "Asphalt gelap dengan gradasi merah hangat. Default house style Garage.",
    vibe: "industrial",
    colors: {
      bg0: "#100808",
      bg1: "#1a1111",
      bg2: "#221818",
      bg3: "#2e2020",
      line: "#443434",
      fg: "#f4f4f5",
      dim: "#d0d0d6",
      mute: "#9696a1",
      primary: "#c41a1a",
      primaryBright: "#e83030",
      primaryDeep: "#7a0f0f",
      accent: "#e8883a",
      silver: "#d4d4d8",
    },
    ui: baseUI,
  },
  {
    id: "luxury-black-gold",
    label: "Luxury Black Gold",
    description: "Black-tie executive. Emas hangat di atas onyx dengan typography tegas.",
    vibe: "luxury",
    colors: {
      bg0: "#050505",
      bg1: "#0d0c08",
      bg2: "#171410",
      bg3: "#241e15",
      line: "#3a2f1d",
      fg: "#fbf3df",
      dim: "#e7d8b4",
      mute: "#a89776",
      primary: "#d4af37",
      primaryBright: "#f5cc55",
      primaryDeep: "#8a6e1d",
      accent: "#f5e0a8",
      silver: "#cbb681",
    },
    ui: { ...baseUI, radius: 0.5 },
  },
  {
    id: "cyberpunk-neon",
    label: "Cyberpunk Neon",
    description: "Magenta + cyan glow, dark matrix vibes untuk vibe night-shift.",
    vibe: "cyber",
    colors: {
      bg0: "#070014",
      bg1: "#0e0420",
      bg2: "#150a2c",
      bg3: "#1f1140",
      line: "#3a1f6b",
      fg: "#f0e8ff",
      dim: "#c9b9ff",
      mute: "#8a7ac0",
      primary: "#ff2dd4",
      primaryBright: "#ff66e8",
      primaryDeep: "#a01080",
      accent: "#39e6ff",
      silver: "#a8c0ff",
    },
    ui: { ...baseUI, radius: 0.75, glassBlur: 0.8 },
  },
  {
    id: "neutral-pro",
    label: "Neutral Pro",
    description:
      "Clean slate, indigo CTA. AI-tool feel seperti Linear/Claude. Stabil, profesional, readable di semua光线.",
    vibe: "minimal",
    colors: {
      bg0: "#f8fafc",
      bg1: "#ffffff",
      bg2: "#f1f5f9",
      bg3: "#e2e8f0",
      line: "#cbd5e1",
      fg: "#0f172a",
      dim: "#475569",
      mute: "#64748b",
      primary: "#6366f1",
      primaryBright: "#818cf8",
      primaryDeep: "#4f46e5",
      accent: "#f59e0b",
      silver: "#94a3b8",
    },
    ui: { ...baseUI, radius: 0.5, glassBlur: 0.3 },
  },
  {
    id: "minimal-clean",
    label: "Minimal Clean",
    description: "Light slate, subtle accents, Notion-feel. Untuk owner yang prefer terang.",
    vibe: "minimal",
    colors: {
      bg0: "#fafafa",
      bg1: "#ffffff",
      bg2: "#f4f4f5",
      bg3: "#e4e4e7",
      line: "#d4d4d8",
      fg: "#18181b",
      dim: "#3f3f46",
      mute: "#71717a",
      primary: "#dc2626",
      primaryBright: "#ef4444",
      primaryDeep: "#991b1b",
      accent: "#f59e0b",
      silver: "#a1a1aa",
    },
    ui: { ...baseUI, radius: 0.5 },
  },
  {
    id: "ai-futuristic",
    label: "AI Futuristic",
    description: "Deep navy + electric blue. Untuk dashboard AI dan data-heavy view.",
    vibe: "futuristic",
    colors: {
      bg0: "#03060e",
      bg1: "#070d1c",
      bg2: "#0c1530",
      bg3: "#142046",
      line: "#1f2f63",
      fg: "#e6f0ff",
      dim: "#a8c0e8",
      mute: "#6985b3",
      primary: "#3b82f6",
      primaryBright: "#60a5fa",
      primaryDeep: "#1e40af",
      accent: "#22d3ee",
      silver: "#94a3b8",
    },
    ui: { ...baseUI, radius: 0.6, glassBlur: 0.7 },
  },
  {
    id: "neo-modern",
    label: "Neo Modern",
    description: "Soft graphite + warm amber. Linear/Framer-inspired clean dark.",
    vibe: "neo",
    colors: {
      bg0: "#0c0c0e",
      bg1: "#141418",
      bg2: "#1c1c22",
      bg3: "#26262e",
      line: "#3a3a44",
      fg: "#f0f0f3",
      dim: "#c8c8d0",
      mute: "#8a8a96",
      primary: "#fb923c",
      primaryBright: "#fdba74",
      primaryDeep: "#c2410c",
      accent: "#facc15",
      silver: "#d4d4d8",
    },
    ui: { ...baseUI, radius: 0.6 },
  },
];

export type GarageOsThemePresetOption = {
  value: string;
  label: string;
  description: string;
  hint: string;
  tier: "mvp" | "legacy";
};

function buildOsThemePresetOption(
  presetId: string,
  tier: "mvp" | "legacy",
): GarageOsThemePresetOption {
  const preset = getPreset(presetId);
  return {
    value: preset.id,
    label: tier === "legacy" ? `${preset.label} (arsip)` : preset.label,
    description: preset.description,
    hint: isMvpGarageOsPreset(preset.id)
      ? GARAGE_MVP_OS_PRESET_HINTS[preset.id]
      : "Preset arsip — pilih tema MVP untuk konsistensi outlet.",
    tier,
  };
}

/** Opsi tema yang ditampilkan di Settings OS (MVP saja — tidak bisa pilih arsip). */
export const GARAGE_OS_THEME_PRESET_OPTIONS: GarageOsThemePresetOption[] =
  GARAGE_MVP_OS_PRESET_IDS.map((presetId) => buildOsThemePresetOption(presetId, "mvp"));

/** Picker Settings OS — selalu 4 tema MVP. */
export function garageOsThemePresetOptionsFor(
  _activePresetId?: string,
): GarageOsThemePresetOption[] {
  return GARAGE_OS_THEME_PRESET_OPTIONS;
}

export function getArchiveGarageOsThemePresets(): ThemePreset[] {
  return THEME_PRESETS.filter((preset) => !isMvpGarageOsPreset(preset.id));
}

export function isThemePresetId(value: string): value is ThemePreset["id"] {
  return THEME_PRESETS.some((preset) => preset.id === value);
}

export const GARAGE_OS_THEME_MVP_SAVE_MESSAGE =
  "Hanya tema operasional MVP yang boleh disimpan: Industrial Garage, Mokoto Crimson Tech, Luxury Black Gold, atau Neutral Pro.";

/** Hanya preset MVP yang boleh disimpan ke app_settings / outlet. */
export function isSavableGarageOsThemePreset(presetId: string): boolean {
  return isThemePresetId(presetId) && isMvpGarageOsPreset(presetId);
}

export function isLegacyGarageOsThemePreset(presetId: string): boolean {
  return isThemePresetId(presetId) && !isMvpGarageOsPreset(presetId);
}

export class GarageOsThemeSaveError extends Error {
  constructor(message = GARAGE_OS_THEME_MVP_SAVE_MESSAGE) {
    super(message);
    this.name = "GarageOsThemeSaveError";
  }
}

export function getPreset(presetId: string): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === presetId) ?? THEME_PRESETS[0];
}

export function completeGarageTheme(theme: Partial<GarageTheme> & { presetId?: string }): GarageTheme {
  const preset = getPreset(theme.presetId ?? THEME_PRESETS[0].id);
  const colors = { ...preset.colors, ...theme.colors };
  const ui = { ...preset.ui, ...theme.ui };
  const visualPreset: ThemePreset = {
    ...preset,
    colors,
    ui,
    semantic: { ...preset.semantic, ...theme.semantic },
    typography: { ...preset.typography, ...theme.typography },
    effects: { ...preset.effects, ...theme.effects },
    components: { ...preset.components, ...theme.components },
  };

  return {
    presetId: preset.id,
    colors,
    ui,
    ...visualContractFor(visualPreset),
  };
}

export function defaultTheme(): GarageTheme {
  return completeGarageTheme({ presetId: "industrial-garage" });
}

export function themeFromPreset(presetId: string): GarageTheme {
  return completeGarageTheme({ presetId });
}

// Konversi GarageTheme jadi key→value CSS variables yang langsung
// match definisi di globals.css (--garage-*, --primary, --background, dll).
export function themeToGarageCssVars(theme: GarageTheme): Record<string, string> {
  const { colors, ui, semantic, typography, effects, components } = theme;
  const balanced = { ...baseBalanced, ...theme.balanced };
  return {
    "--garage-bg-0": colors.bg0,
    "--garage-bg-1": colors.bg1,
    "--garage-bg-2": colors.bg2,
    "--garage-bg-3": colors.bg3,
    "--garage-line": colors.line,
    "--garage-line-2": `color-mix(in srgb, ${colors.line} 74%, ${colors.fg})`,
    "--garage-fg": colors.fg,
    "--garage-dim": colors.dim,
    "--garage-mute": colors.mute,
    "--garage-silver": colors.silver,
    "--garage-red": colors.primary,
    "--garage-red-bright": colors.primaryBright,
    "--garage-red-deep": colors.primaryDeep,
    "--garage-amber": colors.accent,
    "--garage-panel": colors.bg2,
    "--garage-panel-soft": colors.bg3,
    "--garage-surface": semantic.surface,
    "--garage-surface-raised": semantic.surfaceRaised,
    "--garage-surface-soft": semantic.surfaceSoft,
    "--garage-button-bg": semantic.button,
    "--garage-button-hover": semantic.buttonHover,
    "--garage-button-text": semantic.buttonText,
    "--garage-focus-ring": semantic.focus,
    "--garage-success": semantic.success,
    "--garage-warning": semantic.warning,
    "--garage-danger": semantic.danger,
    "--garage-shell-bg": effects.shellGlow,
    "--garage-panel-bg": components.panelBg,
    "--garage-card-bg": components.cardBg,
    "--garage-input-bg": components.inputBg,
    "--garage-badge-bg": components.badgeBg,
    "--garage-active-bg": components.activeBg,
    "--garage-hover-bg": components.hoverBg,
    "--garage-shadow-panel": effects.panelShadow,
    "--garage-shadow-raised": effects.raisedShadow,
    "--garage-shadow-button": effects.buttonShadow,
    "--garage-inset-highlight": effects.insetHighlight,
    "--garage-chrome-shadow": `0 0 ${Math.round(18 + effects.chromeIntensity * 18)}px color-mix(in srgb, ${colors.silver} ${Math.round(12 + effects.chromeIntensity * 10)}%, transparent)`,
    "--garage-glow-primary": `0 0 32px color-mix(in srgb, ${colors.primary} 28%, transparent)`,
    "--garage-glow-accent": `0 0 28px color-mix(in srgb, ${colors.accent} 22%, transparent)`,
    "--garage-font-display": typography.displayFont,
    "--garage-font-body": typography.bodyFont,
    "--garage-font-mono": typography.monoFont,
    "--garage-heading-weight": `${typography.headingWeight}`,
    "--garage-body-weight": `${typography.bodyWeight}`,
    "--garage-letter-spacing": typography.letterSpacing,
    "--garage-display-transform": typography.displayTransform,
    "--garage-glass-opacity": `${Math.round(effects.glassOpacity * 100)}%`,
    "--garage-canvas-bg": balanced.canvas,
    "--garage-canvas-fg": balanced.textOnCanvas,
    "--garage-sidebar-bg": balanced.sidebar,
    "--garage-sidebar-active-bg": balanced.sidebarActive,
    "--garage-sidebar-fg": balanced.textOnSidebar,
    "--garage-topbar-bg": balanced.topbar,
    "--garage-balanced-card": balanced.card,
    "--garage-balanced-panel": balanced.panel,
    "--garage-chart-primary": balanced.chartPrimary,
    "--garage-chart-secondary": balanced.chartSecondary,
    "--garage-accent-soft": balanced.accentSoft,
    "--garage-shadow-color": balanced.shadowColor,
    "--garage-border-soft": balanced.borderSoft,

    "--background": colors.bg0,
    "--foreground": colors.fg,
    "--card": colors.bg2,
    "--card-foreground": colors.fg,
    "--popover": colors.bg1,
    "--popover-foreground": colors.fg,
    "--primary": colors.primary,
    "--primary-foreground": "#ffffff",
    "--secondary": colors.bg3,
    "--secondary-foreground": colors.fg,
    "--muted": colors.bg3,
    "--muted-foreground": colors.dim,
    "--accent": colors.accent,
    "--accent-foreground": colors.bg0,
    "--destructive": colors.primaryBright,
    "--border": colors.line,
    "--input": colors.line,
    "--ring": colors.primary,
    "--sidebar": colors.bg1,
    "--sidebar-foreground": colors.fg,
    "--sidebar-primary": colors.primary,
    "--sidebar-primary-foreground": "#ffffff",
    "--sidebar-accent": colors.bg3,
    "--sidebar-accent-foreground": colors.fg,
    "--sidebar-border": colors.line,

    "--radius": `${ui.radius}rem`,
    "--garage-font-scale": `${ui.fontScale}`,
    "--garage-sidebar-width": `${ui.sidebarWidth}px`,
    "--garage-anim-speed": `${ui.animationSpeed}`,
    "--garage-glass-blur": `${(ui.glassBlur * 24).toFixed(0)}px`,
  };
}

export function themeToCssVars(theme: GarageTheme): Record<string, string> {
  return themeToGarageCssVars(theme);
}

export function loadStoredTheme(): GarageTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GARAGE_THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GarageTheme>;
    if (!parsed.presetId || !parsed.colors || !parsed.ui) return null;
    return completeGarageTheme(parsed);
  } catch {
    return null;
  }
}

export function persistTheme(theme: GarageTheme) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GARAGE_THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // storage quota / privacy mode — silent fail OK
  }
}

export function clearStoredTheme() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GARAGE_THEME_STORAGE_KEY);
  } catch {
    // ignore
  }
}
