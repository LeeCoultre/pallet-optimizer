import { useState, useMemo, useRef, useCallback, useEffect, Fragment } from 'react';
import mammoth from 'mammoth';
import {
  detectCodeType,
  normalizeHeight,
  parseTitleMeta,
  classifyItem,
  categoryRank,
  parseLagerauftragText,
  validateParsing,
  setHeightsConfig,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
} from '../utils/parseLagerauftrag';

/* ─────────────────────────────────────────────────────────────────────────
   Module-scope: inject fonts + global styles ONCE
   ───────────────────────────────────────────────────────────────────────── */
if (typeof document !== 'undefined' && !document.getElementById('lp-fonts')) {
  const link = document.createElement('link');
  link.id = 'lp-fonts';
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap';
  document.head.appendChild(link);
}

if (typeof document !== 'undefined' && !document.getElementById('lp-styles')) {
  const style = document.createElement('style');
  style.id = 'lp-styles';
  style.textContent = `
    .lp-root {
      font-family: 'Montserrat', system-ui, -apple-system, sans-serif;
      /* Subtle radial glow at top-center — gives depth without distraction */
      background:
        radial-gradient(ellipse 1400px 700px at 50% -200px, rgba(91,98,216,0.04), transparent 60%),
        #FAFAFB;
      color: #111827;
    }
    .lp-mono { font-family: 'DM Mono', ui-monospace, Menlo, monospace; }
    .lp-root *::-webkit-scrollbar { width: 10px; height: 10px; }
    .lp-root *::-webkit-scrollbar-track { background: transparent; }
    .lp-root *::-webkit-scrollbar-thumb {
      background: #D4D4D8;
      border-radius: 6px;
      border: 2px solid #FAFAFB;
    }
    .lp-root *::-webkit-scrollbar-thumb:hover { background: #A1A1AA; }
    .lp-btn-hover:hover { background: #4F56C7 !important; }
    .lp-btn2-hover:hover { background: #F4F4F5 !important; border-color: #D4D4D8 !important; }
    .lp-row-hover { transition: background-color 0.12s ease; }
    .lp-row-hover:hover { background: #F4F4F5; }
    .lp-row-active { background: rgba(91,98,216,0.08) !important; box-shadow: inset 2px 0 0 #5B62D8; }
    .lp-card-fade { opacity: 0; transform: translateY(8px); animation: lpFadeUp 0.3s ease forwards; }
    @keyframes lpFadeUp {
      to { opacity: 1; transform: translateY(0); }
    }
    /* Admin-Panel: preserves the horizontal centering translateX(-50%) */
    @keyframes lpPanelIn {
      from { opacity: 0; transform: translateX(-50%) translateY(10px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    /* Admin-Panel on mobile (transform is overridden to none via media query) */
    @keyframes lpPanelInMobile {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: none; }
    }
    @keyframes lpSlideUp {
      from { opacity: 0; transform: translate(-50%, 16px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
    .lp-detail-slide { animation: lpSlideUp 0.25s ease forwards; }
    @keyframes lpDashBounce {
      0%,100% { transform: translateY(0); }
      50% { transform: translateY(-3px); }
    }
    .lp-drop-bounce { animation: lpDashBounce 1.6s ease-in-out infinite; }
    @keyframes lpPulse {
      0%,100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.55; transform: scale(0.92); }
    }
    @keyframes lpSlideRight {
      from { opacity: 0; transform: translateX(40px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes lpShimmer {
      0% { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }
    .lp-shimmer {
      background: linear-gradient(90deg, #F4F4F5 0%, #FAFAFB 50%, #F4F4F5 100%);
      background-size: 800px 100%;
      animation: lpShimmer 1.4s linear infinite;
    }
    @keyframes lpFadeBg {
      from { background-color: rgba(217,119,6,0.18); }
      to { background-color: transparent; }
    }
    .lp-flash { animation: lpFadeBg 1.2s ease forwards; }
    @keyframes lpRingExpand {
      0% { box-shadow: 0 0 0 0 rgba(91,98,216,0.5); }
      100% { box-shadow: 0 0 0 14px rgba(91,98,216,0); }
    }
    @keyframes lpHeroGlow {
      0%, 100% { opacity: 0.5; transform: scale(1); }
      50%      { opacity: 0.85; transform: scale(1.05); }
    }
    @keyframes lpHeroFloat {
      0%, 100% { transform: translateY(0); }
      50%      { transform: translateY(-6px); }
    }
    .lp-dropzone-hero {
      position: relative;
      overflow: hidden;
      background:
        radial-gradient(circle at 50% 30%, rgba(91,98,216,0.05), transparent 70%),
        #FFFFFF;
    }
    .lp-dropzone-hero::before {
      content: '';
      position: absolute; inset: 0;
      background-image: radial-gradient(rgba(91,98,216,0.20) 1px, transparent 1px);
      background-size: 24px 24px;
      mask-image: radial-gradient(circle at 50% 50%, black 30%, transparent 75%);
      -webkit-mask-image: radial-gradient(circle at 50% 50%, black 30%, transparent 75%);
      opacity: 0.45;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }
    .lp-dropzone-hero.is-over::before { opacity: 1; }
    .lp-dropzone-hero.is-over {
      border-color: #5B62D8 !important;
      background:
        radial-gradient(circle at 50% 30%, rgba(91,98,216,0.12), transparent 70%),
        #FFFFFF !important;
      box-shadow: 0 0 0 1px #5B62D8, 0 0 40px rgba(91,98,216,0.20);
    }
    .lp-hero-icon { animation: lpHeroFloat 3s ease-in-out infinite; }
    .lp-hero-glow-ring { animation: lpHeroGlow 2.4s ease-in-out infinite; }

    /* ╔════════════════════════════════════════════════════════════════════╗
       ║  APP SHELL — Sidebar + TopBar + Content (Workspace + Workflow)    ║
       ╚════════════════════════════════════════════════════════════════════╝ */
    .lp-shell { display: flex; min-height: 100vh; }

    /* ── Sidebar — permanently fixed on desktop, hidden on mobile ───── */
    .lp-sidebar {
      width: 240px; flex-shrink: 0;
      background: #FFFFFF;
      border-right: 1px solid #EBEBEF;
      display: flex; flex-direction: column;
      padding: 18px 12px 14px; gap: 4px;
      position: fixed;
      top: 0; left: 0; bottom: 0;
      height: 100vh; overflow-y: auto;
      z-index: 40;
    }
    /* Push main content over to make room for the fixed sidebar */
    .lp-shell > .lp-main { margin-left: 240px; }
    @media (max-width: 768px) {
      .lp-shell > .lp-main { margin-left: 0; }
    }
    .lp-sidebar-brand {
      display: flex; align-items: center; gap: 10px;
      padding: 6px 10px 14px;
      border-bottom: 1px solid #EBEBEF;
      margin-bottom: 6px;
    }
    .lp-sidebar-brand-logo {
      width: 32px; height: 32px; flex-shrink: 0;
      border-radius: 8px;
      background: #FFFFFF;
      border: 1px solid #EBEBEF;
      display: inline-flex; align-items: center; justify-content: center;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(17,24,39,0.04);
    }
    .lp-sidebar-brand-logo img {
      width: 100%; height: 100%; display: block;
      object-fit: contain;
    }
    .lp-sidebar-section-label {
      font-size: 9.5px; font-weight: 700;
      letter-spacing: 1.4px; text-transform: uppercase;
      color: #A1A1AA;
      padding: 12px 12px 6px;
    }
    .lp-sidebar-item {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px; border-radius: 8px;
      font-size: 13px; font-weight: 500;
      color: #52525B;
      cursor: pointer; border: 1px solid transparent;
      background: transparent;
      width: 100%; text-align: left;
      transition: background 0.12s ease, color 0.12s ease;
      font-family: inherit;
    }
    .lp-sidebar-item:hover:not(:disabled) {
      background: #F4F4F5; color: #111827;
    }
    .lp-sidebar-item.is-active {
      background: rgba(91,98,216,0.08);
      color: #111827;
      box-shadow: inset 0 0 0 1px rgba(91,98,216,0.18);
    }
    .lp-sidebar-item:disabled { opacity: 0.4; cursor: not-allowed; }
    .lp-sidebar-icon {
      width: 18px; height: 18px; flex-shrink: 0;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 14px;
    }
    .lp-sidebar-badge {
      margin-left: auto;
      font-size: 10px; padding: 1px 6px;
      border-radius: 999px;
      background: rgba(91,98,216,0.10);
      color: #5B62D8;
      font-family: 'DM Mono', monospace;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.3px;
      font-weight: 600;
    }
    .lp-sidebar-spacer { flex: 1; }
    .lp-sidebar-meta {
      padding: 10px 12px;
      font-size: 10px; color: #A1A1AA;
      letter-spacing: 0.4px;
      border-top: 1px solid #EBEBEF;
      margin-top: 8px;
    }

    /* ── Palette mini-list inside sidebar (Workspace mode) ─────────── */
    .lp-pal-list {
      display: flex; flex-direction: column; gap: 2px;
      padding: 2px 0 4px;
    }
    .lp-pal-item {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 10px;
      border-radius: 7px;
      cursor: pointer;
      background: transparent;
      border: 1px solid transparent;
      width: 100%;
      font-family: inherit;
      transition: background 0.12s ease;
      text-align: left;
    }
    .lp-pal-item:hover { background: #F4F4F5; }
    .lp-pal-item.is-active {
      background: rgba(91,98,216,0.08);
      box-shadow: inset 0 0 0 1px rgba(91,98,216,0.18);
    }
    .lp-pal-id {
      font-size: 11.5px; font-weight: 600;
      font-family: 'DM Mono', monospace;
      color: #111827;
      letter-spacing: -0.2px;
      min-width: 38px;
    }
    .lp-pal-mini-bar {
      flex: 1; height: 4px;
      background: #F4F4F5;
      border-radius: 2px;
      overflow: hidden;
      position: relative;
    }
    .lp-pal-mini-bar > span {
      position: absolute; top: 0; left: 0; height: 100%;
      border-radius: 2px;
      transition: width 0.4s ease;
    }
    .lp-pal-pct {
      font-size: 10px;
      font-family: 'DM Mono', monospace;
      font-variant-numeric: tabular-nums;
      color: #71717A;
      min-width: 28px;
      text-align: right;
    }

    /* ── Layout-Mode Toggle ─────────────────────────────────────────── */
    .lp-mode-toggle {
      display: flex; gap: 0;
      padding: 3px;
      background: #F4F4F5;
      border-radius: 8px;
      margin: 0 4px 4px;
    }
    .lp-mode-toggle-btn {
      flex: 1;
      padding: 6px 10px;
      border: none;
      background: transparent;
      border-radius: 6px;
      font-family: inherit;
      font-size: 11px; font-weight: 600;
      color: #71717A;
      cursor: pointer;
      letter-spacing: 0.3px;
      transition: all 0.15s ease;
      display: inline-flex; align-items: center; justify-content: center; gap: 5px;
    }
    .lp-mode-toggle-btn.is-active {
      background: #FFFFFF;
      color: #111827;
      box-shadow: 0 1px 2px rgba(17,24,39,0.06), 0 0 0 1px rgba(17,24,39,0.04);
    }

    /* ── Main area ──────────────────────────────────────────────────── */
    .lp-main {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column;
      background:
        radial-gradient(ellipse 1400px 700px at 50% -200px, rgba(91,98,216,0.04), transparent 60%),
        #FAFAFB;
    }
    .lp-topbar {
      position: sticky; top: 0; z-index: 35;
      display: flex; align-items: center; gap: 14px;
      padding: 14px 28px;
      border-bottom: 1px solid #EBEBEF;
      background: rgba(255,255,255,0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      flex-wrap: wrap;
    }
    .lp-topbar-title {
      font-size: 15px; font-weight: 600;
      color: #111827; letter-spacing: -0.2px;
    }
    .lp-topbar-context {
      display: flex; align-items: center; gap: 6px;
      font-size: 11.5px; color: #71717A;
      font-family: 'DM Mono', monospace;
      letter-spacing: 0.3px;
    }
    .lp-topbar-context .sep { color: #D4D4D8; }
    .lp-content {
      flex: 1;
      padding: 32px 28px 120px;
      max-width: 1240px; width: 100%;
      margin: 0 auto;
      box-sizing: border-box;
    }
    .lp-content.is-empty {
      display: flex; align-items: center; justify-content: center;
      min-height: calc(100vh - 60px);
    }

    /* ── Workflow Stepper ───────────────────────────────────────────── */
    .lp-stepper {
      display: flex; align-items: center; gap: 0;
      padding: 18px 28px 14px;
      background: #FFFFFF;
      border-bottom: 1px solid #EBEBEF;
      flex-wrap: nowrap;
      overflow-x: auto;
    }
    .lp-step {
      flex: 1; min-width: 120px;
      display: flex; flex-direction: column;
      align-items: center; gap: 6px;
      cursor: pointer;
      background: transparent; border: none;
      font-family: inherit;
      padding: 4px 8px;
      position: relative;
    }
    .lp-step::after {
      content: '';
      position: absolute;
      top: 14px; left: calc(50% + 14px); right: calc(-50% + 14px);
      height: 2px;
      background: #EBEBEF;
      z-index: 0;
    }
    .lp-step:last-child::after { display: none; }
    .lp-step.is-done::after { background: #5B62D8; }
    .lp-step-circle {
      width: 28px; height: 28px;
      border-radius: 50%;
      background: #FFFFFF;
      border: 2px solid #EBEBEF;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700;
      color: #A1A1AA;
      font-family: 'DM Mono', monospace;
      position: relative; z-index: 1;
      transition: all 0.2s ease;
    }
    .lp-step.is-current .lp-step-circle {
      background: #5B62D8;
      border-color: #5B62D8;
      color: #fff;
      box-shadow: 0 0 0 4px rgba(91,98,216,0.15);
    }
    .lp-step.is-done .lp-step-circle {
      background: #5B62D8;
      border-color: #5B62D8;
      color: #fff;
    }
    .lp-step-label {
      font-size: 11px; font-weight: 600;
      color: #71717A;
      letter-spacing: 0.2px;
      text-align: center;
    }
    .lp-step.is-current .lp-step-label,
    .lp-step.is-done .lp-step-label { color: #111827; }

    /* ── Mode tabs (inside Paletten view) ──────────────────────────── */
    .lp-tabs {
      display: inline-flex; gap: 0;
      padding: 3px;
      background: #F4F4F5;
      border-radius: 9px;
    }
    .lp-tab {
      padding: 7px 14px;
      border: none; background: transparent;
      border-radius: 7px;
      font-family: inherit;
      font-size: 12.5px; font-weight: 600;
      color: #52525B;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex; align-items: center; gap: 6px;
    }
    .lp-tab.is-active {
      background: #FFFFFF;
      color: #111827;
      box-shadow: 0 1px 2px rgba(17,24,39,0.06), 0 0 0 1px rgba(17,24,39,0.04);
    }
    .lp-tab:hover:not(.is-active) { color: #111827; }

    /* ── Mobile menu + bottom-tabs ─────────────────────────────────── */
    .lp-mobile-menu-btn {
      display: none;
      width: 36px; height: 36px;
      align-items: center; justify-content: center;
      border-radius: 8px;
      background: transparent;
      border: 1px solid #D4D4D8;
      color: #52525B;
      cursor: pointer;
      font-size: 16px;
    }
    .lp-mobile-tabs {
      display: none;
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 50;
      background: rgba(255,255,255,0.95);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-top: 1px solid #EBEBEF;
      padding: 6px 10px calc(env(safe-area-inset-bottom, 0px) + 6px);
    }
    .lp-mobile-tabs-inner {
      display: flex; gap: 4px;
      max-width: 480px; margin: 0 auto;
    }
    .lp-mobile-tab {
      flex: 1;
      display: inline-flex; flex-direction: column; align-items: center;
      gap: 2px;
      padding: 7px 4px 5px;
      border-radius: 8px;
      background: transparent; border: none;
      color: #71717A;
      font-family: inherit;
      font-size: 9.5px; font-weight: 600;
      letter-spacing: 0.3px;
      cursor: pointer;
      transition: color 0.12s ease, background 0.12s ease;
    }
    .lp-mobile-tab .lp-mobile-tab-icon { font-size: 17px; line-height: 1; }
    .lp-mobile-tab.is-active {
      color: #5B62D8;
      background: rgba(91,98,216,0.08);
    }
    .lp-mobile-tab:disabled { opacity: 0.4; cursor: not-allowed; }

    /* ── Responsive ─────────────────────────────────────────────────── */
    @media (max-width: 768px) {
      .lp-sidebar { display: none; }
      .lp-mobile-menu-btn { display: inline-flex; }
      .lp-mobile-tabs { display: block; }
      .lp-content { padding: 20px 16px 96px; }
      .lp-topbar { padding: 12px 16px; }
      .lp-stepper { padding: 14px 16px 10px; }
      .lp-step { min-width: 80px; }
      .lp-step-label { font-size: 9.5px; }
    }
    /* Liquid-Wave: bewegende Sinus-Kurve oben auf der Füllung */
    @keyframes lpWaveFlow {
      0%   { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    /* Scan-Linie: leuchtende Linie wandert nach oben */
    @keyframes lpScan {
      0%   { transform: translateY(100%); opacity: 0; }
      10%  { opacity: 0.8; }
      90%  { opacity: 0.8; }
      100% { transform: translateY(-100%); opacity: 0; }
    }
    /* Hologramm-Glow: dezent pulsierender Schein an der aktiven Palette */
    @keyframes lpHoloGlow {
      0%,100% { filter: drop-shadow(0 0 0 currentColor); }
      50%     { filter: drop-shadow(0 0 6px currentColor); }
    }
    @media print {
      .lp-no-print { display: none !important; }
      .lp-print-page { box-shadow: none !important; }
      body { background: white !important; }
    }

    /* ── Admin Panel — responsive ──────────────────────────────────── */
    /* Tab-bar: hide scrollbar but allow horizontal scroll */
    .ap-tabs { overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
    .ap-tabs::-webkit-scrollbar { display: none; }
    /* Table scroll wrappers (catalog, heights) */
    .ap-tbl-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    /* Sticky save badge animations */
    .ap-flash {
      animation: lpFadeUp 0.18s ease forwards;
    }
    /* Tablet (≤900px): hide kbd hint */
    @media (max-width: 900px) {
      .ap-kbd { display: none !important; }
    }
    /* On narrow screens: full-viewport modal */
    @media (max-width: 680px) {
      .ap-modal {
        top: 0 !important; left: 0 !important;
        right: 0 !important; bottom: 0 !important;
        transform: none !important;
        width: 100% !important; max-height: 100dvh !important;
        border-radius: 0 !important;
        /* Use mobile animation that doesn't rely on translateX(-50%) */
        animation: lpPanelInMobile 0.22s ease forwards !important;
      }
      .ap-header {
        flex-wrap: wrap !important;
        padding: 10px 14px !important;
        row-gap: 8px;
        gap: 8px !important;
      }
      /* Hide auto-save badge — redundant on mobile */
      .ap-save-badge { display: none !important; }
      /* Hide Import/Export labels — keep arrows only */
      .ap-io-label { display: none !important; }
      /* Content padding tighter */
      .ap-content { padding: 14px !important; }
      /* Tab buttons: compact */
      .ap-tab-btn { padding: 10px 10px !important; }
      /* Hide tab text labels — keep icon only */
      .ap-tab-label { display: none !important; }
      /* Section header: stack title + reset vertically */
      .ap-section-hdr {
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 10px !important;
      }
    }
    @media (max-width: 480px) {
      /* Hide IO group entirely on phones — accessible via Defaults context */
      .ap-io-group { display: none !important; }
    }
    @media (max-width: 400px) {
      .ap-tab-btn { padding: 8px 8px !important; }
    }
  `;
  document.head.appendChild(style);
}

/* ─────────────────────────────────────────────────────────────────────────
   Design Tokens — Light theme inspired by Linear.app (light mode) + Stripe
   ───────────────────────────────────────────────────────────────────────── */
const T = {
  /* Surfaces */
  bg: '#FAFAFB',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',

  /* Borders */
  border: '#EBEBEF',
  borderStrong: '#D4D4D8',

  /* Text — three levels of hierarchy */
  text: '#111827',
  textSub: '#52525B',
  textMuted: '#A1A1AA',

  /* Accent — Linear's signature indigo */
  accent: '#5B62D8',
  accentHover: '#4F56C7',
  accentBg: 'rgba(91,98,216,0.08)',

  /* Status colors */
  blue: '#2563EB',
  blueBg: 'rgba(37,99,235,0.08)',
  green: '#16A34A',
  greenBg: 'rgba(22,163,74,0.08)',
  amber: '#D97706',
  amberBg: 'rgba(217,119,6,0.10)',
  red: '#DC2626',
  redBg: 'rgba(220,38,38,0.08)',
  purple: '#7C3AED',
  purpleBg: 'rgba(124,58,237,0.08)',

  /* Shadows — layered for depth on white */
  shadowSm: '0 1px 2px rgba(17,24,39,0.04), 0 1px 3px rgba(17,24,39,0.06)',
  shadowMd: '0 4px 12px rgba(17,24,39,0.06), 0 2px 4px rgba(17,24,39,0.04)',
  shadowLg: '0 24px 48px rgba(17,24,39,0.10), 0 8px 16px rgba(17,24,39,0.06)',
};

/* PARSING — moved to ../utils/parseLagerauftrag.js (testable module) */

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN CONFIG — alle redaktionellen Tabellen werden in sessionStorage
   abgelegt und können über die Admin-Panel bearbeitet werden.
   Versionierung: bei Schema-Änderungen ADMIN_CONFIG_VERSION erhöhen.
   ───────────────────────────────────────────────────────────────────────── */
const ADMIN_CONFIG_KEY = 'lagerauftrag.admin.config.v2';
const ADMIN_CONFIG_VERSION = 3;     // v3: Excel-genaue Maße + maxPerPallet

/* ── Box-Katalog v2: erweitertes Schema mit EAN, Artikel, Kategorie, Gewicht ──
   id        : eindeutige interne ID
   sig       : Kurz-Signatur (für Match-Caching)
   category  : Gruppe (Blank 14M / Blank 18M / ... / 80×80 / Tacho / SWIPARO)
   artikel   : Voller Artikel-Name (so wie auf dem Etikett)
   ean       : EAN-Code (optional; bei "wird produziert"-Varianten oft leer)
   match     : { rollen, w, h } — wie Parser sucht
   dims      : [L, B, H] in cm — Karton-Dimensionen
   weightKg  : Gewicht eines Kartons (kg)
   hinweis   : Freitext-Notiz ("wird produziert", Bemerkung etc.)
   active    : kann aus dem Match-Pool ausgenommen werden (für Doubletten)
   ──────────────────────────────────────────────────────────────────── */
const DEFAULT_BOX_CATALOG = [
  /* Daten-Quelle: "Dimensional list (3).xlsx" — Sheet "Main".
     dims = [Länge × Breite × Höhe] in cm (alle Maße auf 0.1 cm präzise).
     maxPerPallet = "Pallet load" aus Excel (wenn dort definiert).            */

  /* ▸ Blank 14M (57×35) ─────────────────────────────────────────── */
  { id: 'b001', sig: '50r-57x35-blank', category: 'Blank 14M', artikel: '57mm*35mm (50) blank 14M', ean: '9120107187396',
    match: { rollen: 50, w: 57, h: 35 }, dims: [18.5, 18.5, 12.6], weightKg: 1.84, maxPerPallet: 350, hinweis: '', active: true },
  { id: 'b002', sig: '20r-57x35-blank', category: 'Blank 14M', artikel: '57mm*35mm (20) blank 14M', ean: '9120107187389',
    match: { rollen: 20, w: 57, h: 35 }, dims: [18.5, 7.9, 12.5], weightKg: 0.72, maxPerPallet: 560, hinweis: '', active: true },
  { id: 'b003', sig: '5r-57x35-blank', category: 'Blank 14M', artikel: '57mm*35mm (5) blank 14M', ean: '',
    match: { rollen: 5, w: 57, h: 35 }, dims: [17.0, 3.0, 6.0], weightKg: 0.18, hinweis: 'wird produziert (von 9120107187396)', active: false },

  /* ▸ Blank 18M (57×40) ─────────────────────────────────────────── */
  { id: 'b004', sig: '50r-57x40-blank', category: 'Blank 18M', artikel: '57mm*40mm (50) blank 18M', ean: '9120107187433',
    match: { rollen: 50, w: 57, h: 40 }, dims: [20.6, 20.5, 12.5], weightKg: 2.26, maxPerPallet: 250, hinweis: '', active: true },
  { id: 'b005', sig: '20r-57x40-blank', category: 'Blank 18M', artikel: '57mm*40mm (20) blank 18M', ean: '9120107187426',
    match: { rollen: 20, w: 57, h: 40 }, dims: [20.5, 8.8, 12.5], weightKg: 0.90, maxPerPallet: 560, hinweis: '', active: true },
  { id: 'b006', sig: '5r-57x40-blank', category: 'Blank 18M', artikel: '57mm*40mm (5) blank 18M', ean: '',
    match: { rollen: 5, w: 57, h: 40 }, dims: [19.6, 3.8, 5.6], weightKg: 0.22, hinweis: 'wird produziert (von 9120107187433)', active: false },

  /* ▸ Blank 9M (57×30) ──────────────────────────────────────────── */
  { id: 'b007', sig: '50r-57x30-blank', category: 'Blank 9M', artikel: '57mm*30mm (50) blank 9M', ean: '9120107187471',
    match: { rollen: 50, w: 57, h: 30 }, dims: [16.3, 15.9, 12.4], weightKg: 1.36, maxPerPallet: 350, hinweis: '', active: true },
  { id: 'b008', sig: '20r-57x30-blank', category: 'Blank 9M', artikel: '57mm*30mm (20) blank 9M', ean: '9120107187488',
    match: { rollen: 20, w: 57, h: 30 }, dims: [16.1, 6.9, 12.4], weightKg: 0.56, hinweis: '', active: true },
  { id: 'b009', sig: '5r-57x30-blank', category: 'Blank 9M', artikel: '57mm*30mm (5) blank 9M', ean: '',
    match: { rollen: 5, w: 57, h: 30 }, dims: [14.8, 2.9, 5.5], weightKg: 0.12, hinweis: 'wird produziert (von 9120107187471)', active: false },

  /* ▸ Blank 30M / 50M (57×50, 57×63) ────────────────────────────── */
  { id: 'b010', sig: '50r-57x50-blank', category: 'Blank 30M/50M', artikel: '57mm*50mm (50) blank 30M', ean: '9120107187860',
    match: { rollen: 50, w: 57, h: 50 }, dims: [26.0, 26.0, 12.0], weightKg: 4.82, hinweis: 'Maße geschätzt — fehlen in Quelle', active: true },
  { id: 'b011', sig: '50r-57x63-blank', category: 'Blank 30M/50M', artikel: '57mm*63mm (50) blank 50M', ean: '9120107187495',
    match: { rollen: 50, w: 57, h: 63 }, dims: [31.8, 32.0, 12.6], weightKg: 5.80, hinweis: '', active: true },
  { id: 'b012', sig: '5r-57x63-blank', category: 'Blank 30M/50M', artikel: '57mm*63mm (5) blank 50M', ean: '',
    match: { rollen: 5, w: 57, h: 63 }, dims: [31.1, 6.2, 5.6], weightKg: 0.56, hinweis: 'wird produziert (von 9120107187495)', active: false },

  /* ▸ + Debit-Text 14M (57×35) ──────────────────────────────────── */
  { id: 'b013', sig: '50r-57x35-debit', category: 'Debit-Text 14M', artikel: '57mm*35mm (50) + debit text 14M', ean: '9120107187419',
    match: { rollen: 50, w: 57, h: 35 }, dims: [18.8, 18.6, 12.4], weightKg: 1.78, maxPerPallet: 350, hinweis: '', active: false },
  { id: 'b014', sig: '20r-57x35-debit', category: 'Debit-Text 14M', artikel: '57mm*35mm (20) + debit text 14M', ean: '9120107187402',
    match: { rollen: 20, w: 57, h: 35 }, dims: [18.8, 7.6, 12.3], weightKg: 0.70, maxPerPallet: 560, hinweis: '', active: false },
  { id: 'b015', sig: '5r-57x35-debit', category: 'Debit-Text 14M', artikel: '57mm*35mm (5) + debit text 14M', ean: '',
    match: { rollen: 5, w: 57, h: 35 }, dims: [17.4, 3.5, 5.6], weightKg: 0.16, hinweis: 'wird produziert (von 9120107187419)', active: false },

  /* ▸ + Debit-Text 18M (57×40) ──────────────────────────────────── */
  { id: 'b016', sig: '50r-57x40-debit', category: 'Debit-Text 18M', artikel: '57mm*40mm (50) + debit text 18M', ean: '9120107187457',
    match: { rollen: 50, w: 57, h: 40 }, dims: [20.7, 20.5, 12.4], weightKg: 2.20, maxPerPallet: 250, hinweis: '', active: false },
  { id: 'b017', sig: '20r-57x40-debit', category: 'Debit-Text 18M', artikel: '57mm*40mm (20) + debit text 18M', ean: '9120107187440',
    match: { rollen: 20, w: 57, h: 40 }, dims: [20.8, 8.6, 12.4], weightKg: 0.90, maxPerPallet: 560, hinweis: '', active: false },
  { id: 'b018', sig: '5r-57x40-debit', category: 'Debit-Text 18M', artikel: '57mm*40mm (5) + debit text 18M', ean: '',
    match: { rollen: 5, w: 57, h: 40 }, dims: [19.2, 3.7, 5.5], weightKg: 0.20, hinweis: 'wird produziert (von 9120107187457)', active: false },

  /* ▸ + Debit-Text 9M (57×30) ───────────────────────────────────── */
  { id: 'b019', sig: '50r-57x30-debit', category: 'Debit-Text 9M', artikel: '57mm*30mm (50) + debit text 9M', ean: '9120107187464',
    match: { rollen: 50, w: 57, h: 30 }, dims: [16.3, 15.9, 12.4], weightKg: 1.40, maxPerPallet: 350, hinweis: '', active: false },
  { id: 'b020', sig: '5r-57x30-debit', category: 'Debit-Text 9M', artikel: '57mm*30mm (5) + debit text 9M', ean: '',
    match: { rollen: 5, w: 57, h: 30 }, dims: [14.8, 2.9, 5.6], weightKg: 0.14, hinweis: 'wird produziert (von 9120107187464)', active: false },

  /* ▸ ÖKO Thermorollen ───────────────────────────────────────────── */
  { id: 'b021', sig: 'oeko-50r-57x35', category: 'ÖKO', artikel: 'ÖKO 57mm*35mm (50) + debit text 14M', ean: '9120107187532',
    match: { rollen: 50, w: 57, h: 35 }, dims: [18.8, 19.0, 12.8], weightKg: 2.20, hinweis: 'ÖKO-Variante', active: false },
  { id: 'b022', sig: 'oeko-20r-57x35', category: 'ÖKO', artikel: 'ÖKO 57mm*35mm (20) + debit text 14M', ean: '9120107187525',
    match: { rollen: 20, w: 57, h: 35 }, dims: [20.0, 8.0, 12.0], weightKg: 0.86, hinweis: 'ÖKO — Maße geschätzt', active: false },
  { id: 'b023', sig: 'oeko-5r-57x35', category: 'ÖKO', artikel: 'ÖKO 57mm*35mm (5) + debit text 14M', ean: '',
    match: { rollen: 5, w: 57, h: 35 }, dims: [16.7, 3.3, 5.6], weightKg: 0.20, hinweis: 'ÖKO, wird produziert', active: false },
  { id: 'b024', sig: 'oeko-40r-80x80', category: 'ÖKO', artikel: 'ÖKO 80mm*80mm (40) 80M', ean: '9120107187518',
    match: { rollen: 40, w: 80, h: 80 }, dims: [39.3, 32.5, 16.8], weightKg: 12.40, hinweis: 'ÖKO-Variante', active: true },

  /* ▸ 80×80 80M ─────────────────────────────────────────────────── */
  { id: 'b025', sig: '50r-80x80', category: '80×80 80M', artikel: '80mm*80mm (50) 80M', ean: '9120107187327',
    match: { rollen: 50, w: 80, h: 80 }, dims: [40.5, 40.6, 17.1], weightKg: 13.64, maxPerPallet: 48, hinweis: '', active: true },
  { id: 'b026', sig: '40r-80x80', category: '80×80 80M', artikel: '80mm*80mm (40) 80M', ean: '9120107187358',
    match: { rollen: 40, w: 80, h: 80 }, dims: [40.3, 32.6, 17.0], weightKg: 11.24, maxPerPallet: 48, hinweis: '', active: true },
  { id: 'b027', sig: '20r-80x80', category: '80×80 80M', artikel: '80mm*80mm (20) 80M', ean: '9120107187365',
    match: { rollen: 20, w: 80, h: 80 }, dims: [40.3, 16.7, 17.0], weightKg: 5.58, maxPerPallet: 126, hinweis: '', active: true },
  { id: 'b028', sig: '15r-80x80', category: '80×80 80M', artikel: '80mm*80mm (15) 80M', ean: '9120107187549',
    match: { rollen: 15, w: 80, h: 80 }, dims: [40.6, 24.7, 9.2], weightKg: 4.16, hinweis: '', active: true },
  { id: 'b029', sig: '10r-80x80', category: '80×80 80M', artikel: '80mm*80mm (10) 80M', ean: '9120107187372',
    match: { rollen: 10, w: 80, h: 80 }, dims: [40.5, 16.7, 9.0], weightKg: 2.78, hinweis: '', active: true },
  { id: 'b030', sig: '5r-80x80', category: '80×80 80M', artikel: '80mm*80mm (5) 80M', ean: '9120107188195',
    match: { rollen: 5, w: 80, h: 80 }, dims: [40.2, 8.7, 8.9], weightKg: 1.38, hinweis: '', active: true },

  /* ▸ ECO ROOLLS® (eigene EAN-Reihe, sonst Maße = 80×80 50r) ────── */
  { id: 'b042', sig: 'eco-50r-80x80', category: 'ECO ROOLLS', artikel: 'ECO ROOLLS 80mm*80mm (50) 80M', ean: '9120107188218',
    match: { rollen: 50, w: 80, h: 80 }, dims: [40.3, 40.5, 17.0], weightKg: 13.50, hinweis: 'ECO ROOLLS-Variante', active: false },

  /* ▸ 80×andere Formate ─────────────────────────────────────────── */
  { id: 'b031', sig: '50r-80x60', category: '80×andere', artikel: '80mm*60mm (50) 50M', ean: '9120107187877',
    match: { rollen: 50, w: 80, h: 60 }, dims: [30.5, 30.5, 17.0], weightKg: 7.42, maxPerPallet: 79, hinweis: '', active: true },
  { id: 'b032', sig: '50r-80x63', category: '80×andere', artikel: '80mm*63mm (50) 50M', ean: '9120107187341',
    match: { rollen: 50, w: 80, h: 63 }, dims: [31.8, 32.0, 16.9], weightKg: 8.42, maxPerPallet: 79, hinweis: '', active: true },
  { id: 'b033', sig: '5r-80x63', category: '80×andere', artikel: '80mm*63mm (5) 50M', ean: '',
    match: { rollen: 5, w: 80, h: 63 }, dims: [30.0, 6.0, 8.0], weightKg: 0.88, hinweis: 'wird produziert (von 9120107187341)', active: false },
  { id: 'b034', sig: '50r-80x40', category: '80×andere', artikel: '80mm*40mm (50) 18M', ean: '9120107187709',
    match: { rollen: 50, w: 80, h: 40 }, dims: [20.7, 20.5, 17.0], weightKg: 3.02, hinweis: '', active: true },
  { id: 'b035', sig: '50r-80x74', category: '80×andere', artikel: '80mm*74mm 80M - 48 g/m² (50)', ean: '9120107187884',
    match: { rollen: 50, w: 80, h: 74 }, dims: [37.0, 37.0, 17.0], weightKg: 13.14, hinweis: '48 g/m² — Maße geschätzt', active: true },

  /* ▸ SWIPARO Spezial-Rollen ────────────────────────────────────── */
  { id: 'b036', sig: 'swip-apo-50r', category: 'SWIPARO', artikel: 'SWIPARO Apotheken Thermorollen 80×80 (50)', ean: '9120107187747',
    match: { rollen: 50, w: 80, h: 80 }, dims: [39.1, 39.1, 18.0], weightKg: 10.00, hinweis: 'Apotheken-Spezial', active: false },

  /* ▸ Tachorollen (alle EAN 9120107187501) ──────────────────────── */
  { id: 'b037', sig: '60-tacho', category: 'Tacho', artikel: '60 Stk. Tachorollen', ean: '9120107187501',
    match: { rollen: 60, w: 57, h: 14 }, dims: [18.7, 16.4, 13.9], weightKg: 1.88, hinweis: 'Tacho-Sonderformat', active: true },
  { id: 'b038', sig: '3-tacho-swip', category: 'Tacho', artikel: 'Swip 3 Stk. Tachorollen', ean: '9120107187501',
    match: { rollen: 3, w: 57, h: 14 }, dims: [9.0, 3.0, 6.1], weightKg: 0.08, hinweis: 'Tacho-Sonderformat', active: true },
  { id: 'b039', sig: '6-tacho-swip', category: 'Tacho', artikel: 'Swip 6 Stk. Tachorollen', ean: '9120107187501',
    match: { rollen: 6, w: 57, h: 14 }, dims: [9.0, 6.0, 6.1], weightKg: 0.18, hinweis: 'Tacho-Sonderformat', active: true },
  { id: 'b040', sig: '12-tacho-swip', category: 'Tacho', artikel: 'Swip 12 Stk. Tachorollen', ean: '9120107187501',
    match: { rollen: 12, w: 57, h: 14 }, dims: [12.0, 9.0, 6.1], weightKg: 0.26, hinweis: 'Tacho-Sonderformat', active: true },
  { id: 'b041', sig: '15-tacho-swip', category: 'Tacho', artikel: 'Swip 15 Stk. Tachorollen', ean: '9120107187501',
    match: { rollen: 15, w: 57, h: 14 }, dims: [15.0, 9.0, 6.1], weightKg: 0.44, hinweis: 'Tacho-Sonderformat', active: true },
];

/* ── Amazon FBA Produkte (Sheet 2 aus Dimensional list) ────────────────
   Eigene Tabelle, da diese Produkte nicht zum Lagerauftrag-Parser
   gehören, sondern für FBA-Versand dokumentiert werden.
   ──────────────────────────────────────────────────────────────────── */
const DEFAULT_AMAZON_PRODUCTS = [
  /* Quelle: "Dimensional list (3).xlsx" — Sheet "Second".
     Wo Excel keine Maße enthält, behalten wir Heuristik-Werte (verifiziert).
     weightKg=null → in Excel nicht gepflegt; UI darf "?" anzeigen.            */

  /* ▸ Silosäcke */
  { id: 'a001', asin: 'B09DFZ41CS', category: 'Silosäcke',  name: 'Silosäcke ungefüllt (100×25 cm) 5 Stk.',  l: 25.0, w: 20.0, h: 15.0, weightKg: null },
  { id: 'a002', asin: 'B09DG3JH8V', category: 'Silosäcke',  name: 'Silosäcke ungefüllt (100×25 cm) 10 Stk.', l: 34.0, w: 25.0, h: 12.0, weightKg: null },
  { id: 'a003', asin: 'B09DG21CPY', category: 'Silosäcke',  name: 'Silosäcke ungefüllt (100×25 cm) 20 Stk.', l: 30.5, w: 30.5, h: 21.1, weightKg: 5.04 },
  /* ▸ Sandsäcke */
  { id: 'a004', asin: 'B09C5QCLSR', category: 'Sandsäcke',  name: 'Sandsack 40×60 cm — 5 Stk.',  l: 24.3, w: 19.8, h: 14.3, weightKg: null },
  { id: 'a005', asin: 'B09C5QPY2Q', category: 'Sandsäcke',  name: 'Sandsack 40×60 cm — 10 Stk.', l: 24.3, w: 19.8, h: 14.3, weightKg: null },
  { id: 'a006', asin: 'B09GPC4CPM', category: 'Sandsäcke',  name: 'Sandsack 40×60 cm — 20 Stk.', l: 24.3, w: 19.8, h: 14.3, weightKg: null },
  { id: 'a007', asin: 'B09C5RCT19', category: 'Sandsäcke',  name: 'Sandsack 40×60 cm — 50 Stk.', l: 33.0, w: 25.0, h: 17.0, weightKg: null },
  /* ▸ Big Bags */
  { id: 'a008', asin: 'B08H8X5SZ3', category: 'Big Bags',   name: 'Big Bags 1 Stk.',  l: 24.3, w: 19.8, h: 14.3, weightKg: 0.92 },
  { id: 'a009', asin: 'B08H9TJHHX', category: 'Big Bags',   name: 'Big Bags 2 Stk.',  l: 30.5, w: 30.5, h: 21.1, weightKg: 1.88 },
  { id: 'a010', asin: 'B092VRX6R7', category: 'Big Bags',   name: 'Big Bags 4 Stk.',  l: 35.2, w: 24.0, h: 36.0, weightKg: 3.60 },
  /* ▸ Absperrband — Maße fehlen in Excel; Heuristik bleibt */
  { id: 'a011', asin: 'B08THJ3D76', category: 'Absperrband', name: 'Absperrband 100m', l:  8.0, w:  8.0, h:  8.0, weightKg: null },
  { id: 'a012', asin: 'B08THKHY26', category: 'Absperrband', name: 'Absperrband 200m', l: 16.0, w:  8.0, h:  8.0, weightKg: null },
  { id: 'a013', asin: 'B08THLLX1N', category: 'Absperrband', name: 'Absperrband 500m', l: 25.0, w: 20.0, h: 10.0, weightKg: null },
  /* ▸ Klebeband Fragile */
  { id: 'a014', asin: 'B081TKLKF2', category: 'Klebeband Fragile', name: 'Klebeband Fragile x1 (D-10 H-5)', l: 10.0, w: 10.0, h:  4.8, weightKg: 0.14 },
  { id: 'a015', asin: 'B081TGR7LZ', category: 'Klebeband Fragile', name: 'Klebeband Fragile x6',           l: 30.0, w: 20.0, h:  4.8, weightKg: 0.82 },
  { id: 'a016', asin: 'B081THC94P', category: 'Klebeband Fragile', name: 'Klebeband Fragile x12',          l: 30.0, w: 20.0, h:  9.6, weightKg: 1.66 },
  { id: 'a017', asin: 'B081TJ9YQ1', category: 'Klebeband Fragile', name: 'Klebeband Fragile x36',          l: 31.0, w: 21.0, h: 29.9, weightKg: 5.34 },
  /* ▸ Holzwolle */
  { id: 'a018', asin: 'B08Y5KB7QD', category: 'Holzwolle',   name: 'Holzwolle Füllmaterial 500g', l: 24.0, w: 20.0, h: 15.0, weightKg: null },
  { id: 'a019', asin: 'B08Y5CB4XT', category: 'Holzwolle',   name: 'Holzwolle Füllmaterial 1 kg', l: 30.0, w: 25.5, h: 14.0, weightKg: 1.10 },
  { id: 'a020', asin: 'B08Y5STTVQ', category: 'Holzwolle',   name: 'Holzwolle Füllmaterial 2.5 kg', l: 59.0, w: 40.0, h: 27.0, weightKg: null },
  /* ▸ Sonstiges */
  { id: 'a021', asin: 'B08DKNY1X7', category: 'Sonstiges',   name: 'Kürbiskernöl 1 l (6 Dosen)', l: 27.3, w: 18.5, h: 32.5, weightKg: 6.52 },
];

const DEFAULT_HEIGHTS = [
  // Höhen-Äquivalenz: 57×9 == 57×30 (Innen-/Aussen-Durchmesser).
  { from: 9, to: 30 },
  { from: 14, to: 35 },
  { from: 18, to: 40 },
];

const DEFAULT_TIMES = {
  palletBase: 360,        // 6 min — Sockelzeit pro Palette
  between: 540,           // 9 min — Übergang zwischen Paletten
  perArticle: 11,         // 11 s — pro Artikel
  perArticleTacho: 21,    // 21 s — Tacho-Spezialformate (60er, 57×15, 57×6)
  perFormatVariety: 30,   // 30 s — pro extra Format-Gruppe auf einer Palette
};

const DEFAULT_TARIF = {
  kgPerPallet: 700,
  eurPerPallet: 1500,
};

const DEFAULT_WORKDAY = {
  start: '07:15',
  end: '15:15',
  target: '13:25',
  pauseStart: '12:00',
  pauseEnd: '12:30',
};

const ADMIN_DEFAULTS = {
  version: ADMIN_CONFIG_VERSION,
  boxCatalog: DEFAULT_BOX_CATALOG,
  amazonProducts: DEFAULT_AMAZON_PRODUCTS,
  heights: DEFAULT_HEIGHTS,
  times: DEFAULT_TIMES,
  tarif: DEFAULT_TARIF,
  workday: DEFAULT_WORKDAY,
};

let _adminConfig = null;
const _adminListeners = new Set();

function _cloneDefaults() {
  // Deep-clone via JSON, damit nested arrays/objects nicht referenziert werden.
  return JSON.parse(JSON.stringify(ADMIN_DEFAULTS));
}

function _validateAdminConfig(cfg) {
  // Mindest-Sanity-Check: alle Top-Level-Keys vorhanden, sonst Defaults.
  if (!cfg || typeof cfg !== 'object') return null;
  if (cfg.version !== ADMIN_CONFIG_VERSION) return null;
  const out = _cloneDefaults();
  if (Array.isArray(cfg.boxCatalog)) out.boxCatalog = cfg.boxCatalog;
  if (Array.isArray(cfg.amazonProducts)) out.amazonProducts = cfg.amazonProducts;
  if (Array.isArray(cfg.heights)) out.heights = cfg.heights;
  if (cfg.times && typeof cfg.times === 'object')
    out.times = { ...out.times, ...cfg.times };
  if (cfg.tarif && typeof cfg.tarif === 'object')
    out.tarif = { ...out.tarif, ...cfg.tarif };
  if (cfg.workday && typeof cfg.workday === 'object')
    out.workday = { ...out.workday, ...cfg.workday };
  return out;
}

function getAdminConfig() {
  if (_adminConfig) return _adminConfig;
  if (typeof sessionStorage === 'undefined') {
    _adminConfig = _cloneDefaults();
    return _adminConfig;
  }
  try {
    const raw = sessionStorage.getItem(ADMIN_CONFIG_KEY);
    if (!raw) {
      _adminConfig = _cloneDefaults();
      return _adminConfig;
    }
    const validated = _validateAdminConfig(JSON.parse(raw));
    _adminConfig = validated || _cloneDefaults();
  } catch (e) {
    console.warn('Admin-Config konnte nicht geladen werden, verwende Defaults', e);
    _adminConfig = _cloneDefaults();
  }
  return _adminConfig;
}

function saveAdminConfig(cfg) {
  _adminConfig = cfg;
  try {
    sessionStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(cfg));
  } catch (e) {
    console.warn('Admin-Config konnte nicht gespeichert werden', e);
  }
  _adminListeners.forEach((cb) => {
    try { cb(cfg); } catch (e) { console.warn('listener error', e); }
  });
}

function resetAdminConfig() {
  saveAdminConfig(_cloneDefaults());
}

function subscribeAdminConfig(cb) {
  _adminListeners.add(cb);
  return () => _adminListeners.delete(cb);
}

/* ── Import / Export der gesamten Admin-Konfiguration als JSON-Datei ── */
function exportAdminConfig() {
  const cfg = getAdminConfig();
  const blob = new Blob([JSON.stringify(cfg, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  a.download = `admin-config_${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importAdminConfigFromFile(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Datei ist kein gültiges JSON.');
  }
  const validated = _validateAdminConfig(parsed);
  if (!validated) {
    throw new Error(
      `Schema-Version stimmt nicht (erwartet v${ADMIN_CONFIG_VERSION}). ` +
      'Bitte gleiche Version verwenden.'
    );
  }
  saveAdminConfig(validated);
  return validated;
}


/* normalizeHeight, parseTitleMeta, classifyItem, categoryRank, CATEGORY_*, parseLagerauftragText, validateParsing — moved to ../utils/parseLagerauftrag.js */

/* ─────────────────────────────────────────────────────────────────────────
   VOLUME CALCULATION
   Каталог известных коробок (см) → объём в м³. Если не нашли точный
   match — используем эвристику по диаметру ролла + длине бумаги.
   ───────────────────────────────────────────────────────────────────────── */
// EUR-Palette gesamt 120 × 80 × 180 cm = 1,728,000 cm³ = 1.728 m³
// (Sockel inklusive — Stretchwrap & Sockelfläche zählen mit)
const PALLET_VOLUME_CM3 = 120 * 80 * 180;
const PALLET_FLOOR_AREA_CM2 = 120 * 80;

/* findAmazonMatch — direkter ASIN-Match in amazonProducts-Katalog.
   Wird für Produktion-Items (Sandsäcke, Klebeband, Holzwolle…) verwendet,
   da sie nicht in den Thermo-Katalog passen. */
function findAmazonMatch(item) {
  if (!item) return null;
  const products = getAdminConfig().amazonProducts || [];
  // 1. Direkter ASIN-Match (zuverlässig)
  if (item.asin) {
    for (const p of products) {
      if (p.asin && p.asin === item.asin) {
        return {
          sig: p.id,
          artikel: p.name,
          match: { rollen: 1, w: 0, h: 0 },
          dims: [p.l, p.w, p.h],
          weightKg: p.weightKg,
          fromAmazonCatalog: true,
        };
      }
    }
  }
  return null;
}

/* findBoxMatch — gibt Match + Qualitäts-Score zurück.
   Quality:
     'exact'      — rollen + w + h exakt mit Aussen-Höhe (oder ASIN exakt)
     'normalized' — rollen + w + normH (raw 18 → outer 40 via heights map)
     'fuzzy'      — nächster Nachbar in (w,h)-Distanz, gleicher Rollen-Wert
     'heuristic'  — nichts gefunden, Fallback auf estimateBoxDimsHeuristic

   Reihenfolge der Strategien:
     1. Amazon-Katalog per ASIN (für Sandsack, Klebeband, Big Bag etc.)
     2. Box-Katalog exakt nach normalisierter Höhe
     3. Box-Katalog exakt nach Roh-Höhe
     4. Box-Katalog nächster Nachbar (innerhalb Distanz 30)
     5. heuristic fallback
*/
function findBoxMatch(item) {
  // 0. Einzelne SKU verwendet effektive Rollen (X × Y), nicht parsed rollen
  const effectiveRollen = item?.isEinzelneSku
    ? item.einzelneSku?.effectiveRollen
    : item?.rollen;

  // 1. Amazon-Katalog per ASIN
  const am = findAmazonMatch(item);
  if (am) return { match: am, quality: 'exact' };

  if (!item.dim || effectiveRollen == null) return { match: null, quality: 'heuristic' };
  const catalog = (getAdminConfig().boxCatalog || []).filter(
    (c) => c && c.match && c.active !== false
  );
  // RAW Höhe (z.B. 18 für 57×18-Etikett) UND normalisierte Höhe (z.B. 40)
  const rawH = item.dim.h;
  const normH = item.dim.normH ?? rawH;
  const w = item.dim.normW ?? item.dim.w;
  const r = effectiveRollen;

  // 2. Exakter Match auf normalisierte Höhe
  for (const c of catalog) {
    if (c.match.rollen === r && c.match.w === w && c.match.h === normH) {
      return { match: c, quality: rawH === normH ? 'exact' : 'normalized' };
    }
  }
  // 3. Exakter Match auf Roh-Höhe (falls Katalog Innen-Höhe gespeichert hat)
  if (rawH !== normH) {
    for (const c of catalog) {
      if (c.match.rollen === r && c.match.w === w && c.match.h === rawH) {
        return { match: c, quality: 'normalized' };
      }
    }
  }
  // 4. Nächster Nachbar nach (w, h)-Distanz mit gleicher Rollen-Anzahl
  let best = null;
  let bestD = Infinity;
  for (const c of catalog) {
    if (c.match.rollen !== r) continue;
    const d = Math.abs(c.match.w - w) + Math.abs(c.match.h - normH);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (best && bestD < 30) {
    return { match: best, quality: 'fuzzy', distance: bestD };
  }
  return { match: null, quality: 'heuristic' };
}

function estimateBoxDimsHeuristic(item) {
  // если нет данных — берём средний картон 30×20×15 cm
  if (!item.rollen) return [30, 20, 15];
  // ролл диаметром 7-8 cm, картон умещает rollen рулонов (квадрат + высота)
  if (item.rollen <= 5) return [40, 9, 9];
  if (item.rollen <= 10) return [40, 17, 9];
  if (item.rollen <= 20) return [18.5, 8, 12.5];
  return [20, 20, 12]; // 50r дефолт
}

/* Heuristisches Box-Gewicht aus Volumen.
   Empirische Dichte aus Excel-Daten ≈ 0.45 g/cm³ für Thermorollen-Kartons. */
function estimateWeightKgFromVolume(boxCm3) {
  return boxCm3 * 0.00045;
}

/* itemShortFormat — kompakte, eindeutige Bezeichnung für UI/Stack-Bar.
   Nutzt die ROHEN Etiketten-Werte (z.B. "57×18 20r"), nicht die normalisierten. */
function itemShortFormat(item) {
  const w = item?.dim?.w;
  const h = item?.dim?.h;
  const r = item?.rollen;
  if (w != null && h != null && r != null) return `${w}×${h} ${r}r`;
  if (w != null && h != null) return `${w}×${h}`;
  return item?.dimStr || item?.fnsku || 'Artikel';
}

/* Mixed-Size Density Penalty: bei vielen unterschiedlichen Box-Größen sinkt die
   reale Pack-Effizienz. Empirisch: 1 Format = 100%, 2 = 95%, 3 = 90%, 4+ = 85%. */
function mixedSizePenalty(uniqueFormatsCount) {
  if (uniqueFormatsCount <= 1) return 1.0;
  if (uniqueFormatsCount === 2) return 0.95;
  if (uniqueFormatsCount === 3) return 0.90;
  return 0.85;
}

/* ─────────────────────────────────────────────────────────────────────────
   GRID-SIMULATION — exakte Boden-Sieb-Berechnung pro Box-Typ.
   Probiert alle 6 Orientierungen (3 Achsen vertikal × 2 Boden-Rotationen).
   Bricht auf die Konfiguration mit größter Kapazität ein.
   Gibt zurück: capacity, perLayer, layers, gewählte Orientierung.

   Die Formel ist: floor(palletL/a) × floor(palletW/b) × floor(maxH/c)
   für jede Permutation [a,b,c] der Box-Dimensionen. Damit fangen wir
   reale "Verschnitt"-Verluste an Palettenkanten ein, die rein
   volumetrische Rechnung übersieht.
   ───────────────────────────────────────────────────────────────────────── */
function gridCapacity(dims, palletL = 120, palletW = 80, maxH = 165.6) {
  if (!dims || dims.length !== 3) {
    return { capacity: 0, perLayer: 0, layers: 0, kind: 'none', footprint: null, height: 0 };
  }
  const [L, W, H] = dims;
  // 6 Orientierungen — jede Permutation: welche Dim ist a (Länge),
  // welche b (Breite), welche c (Höhe).
  const orientations = [
    [L, W, H, 'flat'],
    [W, L, H, 'flat-rot'],
    [L, H, W, 'kontovka-w'],
    [H, L, W, 'kontovka-w-rot'],
    [W, H, L, 'kontovka-l'],
    [H, W, L, 'kontovka-l-rot'],
  ];
  let best = { capacity: 0, perLayer: 0, layers: 0, kind: 'none', footprint: null, height: 0 };
  for (const [a, b, c, kind] of orientations) {
    if (a > palletL || b > palletW) continue; // Boden zu klein
    if (c > maxH) continue;                   // Höhe zu groß
    const cols = Math.floor(palletL / a);
    const rows = Math.floor(palletW / b);
    const layers = Math.floor(maxH / c);
    const perLayer = cols * rows;
    const cap = perLayer * layers;
    if (cap > best.capacity) {
      best = {
        capacity: cap,
        perLayer,
        layers,
        cols,
        rows,
        kind,
        footprint: [a, b],
        height: c,
      };
    }
  }
  return best;
}

/**
 * Berechnet Volumen + Gewicht + Bodenflächenbedarf eines Artikels.
 * Bei unbekannter Box wird heuristisch geschätzt — Artikel werden NIE übersprungen.
 */
function itemVolumeCm3(item) {
  const { match, quality, distance } = findBoxMatch(item);
  let dims, matched, matchSig;
  let perCartonKg;
  let displayName = '';
  let matchQuality = quality;
  if (match) {
    dims = match.dims;
    matched = true;
    matchSig = match.sig;
    displayName = match.artikel || match.sig || '';
    perCartonKg = match.weightKg != null && match.weightKg > 0
      ? match.weightKg
      : estimateWeightKgFromVolume(dims[0] * dims[1] * dims[2]);
  } else {
    dims = estimateBoxDimsHeuristic(item);
    matched = false;
    matchSig = 'estimated';
    matchQuality = 'heuristic';
    perCartonKg = estimateWeightKgFromVolume(dims[0] * dims[1] * dims[2]);
  }
  const boxVolume = dims[0] * dims[1] * dims[2];
  // Cartons-Berechnung:
  //   Standard FBA: 1 unit = 1 verkäufliche Verpackung = 1 Karton.
  //                 "(10 Rollen)" im Titel beschreibt nur, wieviele Rollen
  //                 IN einem Karton sind — kein Divisor. units = cartons.
  //   Einzelne SKU: ein Sammel-Karton enthält X Mini-Packs (units zählt
  //                 Mini-Packs); cartonsCount = ceil(units / X).
  let cartonsCount;
  if (item.isEinzelneSku && item.einzelneSku) {
    cartonsCount = item.einzelneSku.cartonsCount ?? Math.max(
      1, Math.ceil((item.units || 0) / item.einzelneSku.packsPerCarton)
    );
  } else {
    cartonsCount = Math.max(1, item.units || 0);
  }
  const totalCm3 = boxVolume * cartonsCount;
  const floorAreaPerCarton = dims[0] * dims[1];
  // Grid-Kapazität: wieviel Kartons dieses Typs auf eine Palette passen
  // (würde der Artikel die Palette allein bekommen).
  const grid = gridCapacity(dims);
  // Anteil dieses Artikels an der Paletten-Kapazität.
  const articleFill = grid.capacity > 0 ? cartonsCount / grid.capacity : 0;
  return {
    boxDims: dims,
    cartonsCount,
    perCartonCm3: boxVolume,
    perCartonKg,
    totalKg: perCartonKg * cartonsCount,
    totalCm3,
    floorAreaPerCarton,
    floorAreaTotal: floorAreaPerCarton * cartonsCount,
    grid,
    articleFill,
    matched,
    matchSig,
    matchQuality,                              // 'exact' | 'normalized' | 'fuzzy' | 'heuristic'
    matchDistance: distance ?? null,
    matchedArtikel: match?.artikel || null,    // exakter Katalog-Eintrag (zur Anzeige)
    displayName,
  };
}

function palletVolumeStats(pallet, extraItems = []) {
  const cfg = getAdminConfig();
  const weightCapKg = cfg.tarif?.kgPerPallet || 700;
  const palletVolCm3 = PALLET_VOLUME_CM3;          // 120 × 80 × 180 = 1,728,000 cm³

  let totalCm3 = 0;
  let totalCartons = 0;
  let totalWeightKg = 0;
  let unmatched = 0;
  let matchedItems = 0;

  // Native pallet items + zugewiesene Einzelne-SKU-Artikel
  const allItems = [
    ...pallet.items.map((it) => ({ ...it, _fromExtras: false })),
    ...extraItems.map((it) => ({ ...it, _fromExtras: true })),
  ];
  const rawBreakdown = allItems.map((it) => {
    const v = itemVolumeCm3(it);
    totalCm3 += v.totalCm3;
    totalCartons += v.cartonsCount;
    totalWeightKg += v.totalKg;
    if (v.matched) matchedItems++;
    else unmatched++;
    return { item: it, v };
  });

  // ─────── HEADLINE: einfaches volumetrisches Modell ───────
  // fillPct = Σ(box_volume × cartons) / Paletten-Volumen
  //
  // Beispiel: 200 Kartons à 0.009 m³ → 1.8 m³ / 1.728 m³ = 104%
  const volumePct = totalCm3 / palletVolCm3;
  const weightPct = weightCapKg > 0 ? totalWeightKg / weightCapKg : 0;
  const fillPct = volumePct;
  const limitingFactor = weightPct > volumePct ? 'weight' : 'volume';

  // Per-Artikel-Anteil an der Palette (für Stack-Bar)
  const itemsBreakdown = rawBreakdown.map(({ item, v }) => ({
    item,
    v,
    // Anteil am Gesamt-Volumen-Verbrauch (für Stack-Bar):
    pctOfTotal: totalCm3 > 0 ? v.totalCm3 / totalCm3 : 0,
    // Direkter Anteil an der Paletten-Kapazität:
    pctOfPallet: v.totalCm3 / palletVolCm3,
  }));

  // Status-Farb-Kategorie:
  let status = 'empty';
  if (fillPct >= 1.0) status = 'overflow';
  else if (fillPct >= 0.92) status = 'tight';
  else if (fillPct >= 0.75) status = 'optimal';
  else if (fillPct >= 0.5) status = 'good';
  else if (fillPct > 0) status = 'low';

  return {
    // Volume — Headline
    totalCm3,
    totalM3: totalCm3 / 1_000_000,
    capacityM3: palletVolCm3 / 1_000_000,
    palletVolCm3,
    fillPct,                            // = volumePct (Σ box × count / 1.728 m³)
    fillPctClamped: Math.min(1, fillPct),
    volumePct,                          // alias für fillPct
    // Weight
    totalWeightKg,
    weightCapKg,
    weightPct,
    // Status / Flags
    isOverflow: fillPct > 1,
    isWeightOverflow: weightPct > 1,
    status,
    limitingFactor,
    // Counts
    totalCartons,
    unmatchedCount: unmatched,
    matchedCount: matchedItems,
    hasUnknown: unmatched > 0,
    // Per-Artikel-Breakdown (mit grid-Daten in v.grid für Tooltips)
    itemsBreakdown,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   AUTO-DISTRIBUTION für Einzelne-SKU-Artikel — SMART SCORING

   Reihenfolge der Bewertung (höher = besser):
     1. ✓ Kategorie-Match (thermorollen / produktion / tachographenrollen / ...)
        → niemals Thermorollen auf eine reine Produktion-Palette stellen!
     2. ✓ Format-Match (gleiche dim/rollen — z.B. 57×35 20r passt zu 57×35 20r)
        → spart Platz und vereinfacht Stretchwrap-Layout
     3. ✓ Volumen-Fit (Σ box × count + Einzelne-SKU ≤ 1.728 m³)
     4. ✓ Tightness — bevorzuge Palette, die nach Platzierung näher an ~85% liegt

   Constraints:
     • Palette muss ≥2 unique Artikel haben (sonst ist sie "Single SKU")
     • Volumen darf 100% nicht überschreiten
     • Kein Splitting — ein Einzelne-SKU geht entweder ganz auf eine Palette
       oder bleibt unassigned

   Scoring:
     +10000  exakter Format-Match (gleiche rollen + dim) auf der Palette
     +1000   Kategorie-Match (mind. 1 gleicher Kategorie-Artikel)
     -10000  Kategorie-Konflikt (z.B. Thermo auf reiner Produktions-Palette)
     +100×   Tightness (näher an 85%-Sweet-Spot)
   ───────────────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────────
   EINZELNE-SKU-VERTEILUNG — "intelligente" Variante mit Prioritäts-Kette.

   Hard constraints (Eligibility):
     • Palette darf KEINE Single-SKU-Palette sein (≥2 Artikel-Slots vorhanden,
       und die "4 Seiten Aufkleber"-Markierung hatte bereits den hint, dass
       hier nichts dazu kommen darf — wir behalten die ≥2-Regel).
     • newVolume ≤ PALLET_VOLUME_CM3 (1.728 m³)
     • newWeight ≤ kgPerPallet (admin-config, default 700)

   Scoring-Hierarchie (höher = besser):
     +50000  useItem-Match  — ESKU "wird von 9120107187501 produziert" und
                              eine Palette enthält bereits Artikel mit dieser
                              Katalog-ID (EAN/FNSKU/useItem). Stärkstes Signal:
                              die Items gehören operativ zusammen.
     +10000  Format-Match   — gleiche rollen + (norm.)Dimensionen
     + 3000  Brand-Match    — gleiche Marke (Heipa, Veit, SWIPARO, …)
     + 1000  Category-Match — gleiche Kategorie (thermorollen, produktion, …)
     -10000  Cat-Conflict   — Mono-Kategorie-Palette und ESKU passt NICHT
     +  100×(1-distance)    — Paletten näher am 85%-Sweet-Spot
     +   50×(1-weightFrac)  — leichter beladene Palette bevorzugen (Balance)

   Group-Phase:
     Vor der Einzel-Verteilung gruppieren wir ESKUs nach useItem-Katalog-ID.
     Jede Gruppe versucht zuerst, KOMPLETT auf eine einzige Palette zu kommen
     (nach Gruppen-Score). Klappt das nicht, fallen wir auf Item-für-Item-
     Verteilung zurück (mit Best-Fit-Decreasing).
   ───────────────────────────────────────────────────────────────────────── */

/* Extrahiert die Katalog-ID aus einem useItem-Freitext.
   Beispiele:
     "9120107187501"                       → "9120107187501"
     "wird von 9120107187501 produziert"   → "9120107187501"
     "wird von Artikel X001BVO9LV produziert" → "X001BVO9LV"
     "X0017LU653"                          → "X0017LU653"
     "wird von 41 produziert"              → null  (zu kurze Zahl, mehrdeutig)
*/
function extractUseItemId(s) {
  if (!s) return null;
  const ean = String(s).match(/\b\d{12,14}\b/);
  if (ean) return ean[0];
  const xcode = String(s).match(/\bX[0-9A-Z]{8,10}\b/i);
  if (xcode) return xcode[0].toUpperCase();
  return null;
}

/* Sammelt alle Identitäts-Tokens eines Paletten-Artikels für useItem-Match.
   ESKU.useItem === "9120107187501"  →  matched, wenn diese ID irgendwo
   im palletItem (eigene useItem ID, EAN, FNSKU) auftaucht. */
function palletItemIdTokens(it) {
  const out = new Set();
  const useId = extractUseItemId(it.useItem);
  if (useId) out.add(useId);
  if (it.ean) out.add(String(it.ean));
  if (it.fnsku) out.add(String(it.fnsku).toUpperCase());
  return out;
}

function distributeEinzelneSku(pallets, einzelneSkuItems) {
  const PALLET_VOL = PALLET_VOLUME_CM3;
  const SWEET_SPOT = 0.85;
  const cfg = getAdminConfig();
  const WEIGHT_CAP = cfg.tarif?.kgPerPallet || 700;

  const assignments = {};        // itemKey → palletId
  const unassigned = [];
  const reasons = {};            // itemKey → human-readable reason
  const reasonsBreakdown = {};   // itemKey → { useItemMatch, formatMatch, ... }

  if (!einzelneSkuItems?.length) {
    return { assignments, unassigned, reasons, reasonsBreakdown };
  }

  // 1. Per-Palette state: volume, weight, formats, brands, categories,
  //    useItem-IDs (für matching). Aktualisierbar während Distribution.
  const palletState = pallets.map((p) => {
    let currentVolCm3 = 0;
    let currentWeightKg = 0;
    const formats = new Set();
    const categories = new Set();
    const brands = new Set();
    const useItemIds = new Set();
    for (const it of p.items) {
      const v = itemVolumeCm3(it);
      currentVolCm3 += v.totalCm3;
      currentWeightKg += v.totalKg;
      formats.add(formatSignature(it));
      if (it.category) categories.add(it.category);
      const b = detectBrand(it.title);
      if (b && b !== 'GENERIC') brands.add(b);
      palletItemIdTokens(it).forEach((id) => useItemIds.add(id));
    }
    const uniqueArtikel = new Set(
      p.items.map((it) => it.fnsku || it.sku || it.title).filter(Boolean)
    );
    return {
      pallet: p,
      currentVolCm3,
      currentWeightKg,
      formats,
      brands,
      categories,
      useItemIds,
      uniqueArtikelCount: uniqueArtikel.size,
      eligible: uniqueArtikel.size >= 2,
    };
  });

  // 2. ESKU enrichment: Volumen, Brand, Format, useItemId.
  const enriched = einzelneSkuItems.map((item) => {
    const v = itemVolumeCm3(item);
    return {
      item,
      key: item.fnsku || item.sku || item.title,
      v,
      volNeeded: v.totalCm3,
      weightNeeded: v.totalKg,
      formatSig: formatSignature(item),
      category: item.category,
      brand: detectBrand(item.title),
      useItemId: extractUseItemId(item.useItem),
    };
  });

  // 3. Gruppiere ESKUs mit gleichem useItemId — diese gehören zusammen.
  //    Items ohne useItemId bilden je eine 1-Element-Gruppe.
  const groupMap = new Map();
  let soloIdx = 0;
  for (const e of enriched) {
    const gKey = e.useItemId ? `uid:${e.useItemId}` : `solo:${soloIdx++}`;
    if (!groupMap.has(gKey)) groupMap.set(gKey, []);
    groupMap.get(gKey).push(e);
  }
  // Gruppen nach Gesamt-Volumen sortieren (groß zuerst — Best-Fit-Decreasing).
  const groups = [...groupMap.values()]
    .map((items) => ({
      items,
      totalVol: items.reduce((s, e) => s + e.volNeeded, 0),
      totalWeight: items.reduce((s, e) => s + e.weightNeeded, 0),
      useItemId: items[0].useItemId,
      sharedFormat: items.every((e) => e.formatSig === items[0].formatSig)
        ? items[0].formatSig
        : null,
    }))
    .sort((a, b) => b.totalVol - a.totalVol);

  // 4. Score eine Palette für ein einzelnes Item — gibt Score + Aufschlüsselung.
  const scoreOne = (entry, ps) => {
    const breakdown = {
      useItemMatch: false, formatMatch: false, brandMatch: false,
      categoryMatch: false, categoryConflict: false,
      fillScore: 0, weightScore: 0,
    };
    let score = 0;

    if (entry.useItemId && ps.useItemIds.has(entry.useItemId)) {
      score += 50000;
      breakdown.useItemMatch = true;
    }
    if (ps.formats.has(entry.formatSig)) {
      score += 10000;
      breakdown.formatMatch = true;
    }
    if (entry.brand && entry.brand !== 'GENERIC' && ps.brands.has(entry.brand)) {
      score += 3000;
      breakdown.brandMatch = true;
    }
    if (entry.category && ps.categories.has(entry.category)) {
      score += 1000;
      breakdown.categoryMatch = true;
    } else if (entry.category && ps.categories.size === 1) {
      score -= 10000;
      breakdown.categoryConflict = true;
    } else if (entry.category && ps.categories.size > 1
                && !ps.categories.has(entry.category)) {
      score -= 200;
    }

    const fillPctAfter = (ps.currentVolCm3 + entry.volNeeded) / PALLET_VOL;
    const distance = Math.abs(SWEET_SPOT - fillPctAfter);
    breakdown.fillScore = Math.round((1 - Math.min(1, distance)) * 100);
    score += breakdown.fillScore;

    const weightFracAfter = (ps.currentWeightKg + entry.weightNeeded) / WEIGHT_CAP;
    breakdown.weightScore = Math.round((1 - Math.min(1, weightFracAfter)) * 50);
    score += breakdown.weightScore;

    return { score, breakdown };
  };

  // 5. Hard fit-check: Volumen UND Gewicht müssen reinpassen.
  const canFit = (ps, volNeeded, weightNeeded) => {
    if (!ps.eligible) return false;
    if (ps.currentVolCm3 + volNeeded > PALLET_VOL) return false;
    if (ps.currentWeightKg + weightNeeded > WEIGHT_CAP) return false;
    return true;
  };

  // 6. Commit: schreibe assignment + update palletState.
  const commit = (entry, ps, breakdown, source) => {
    assignments[entry.key] = ps.pallet.id;
    reasonsBreakdown[entry.key] = { ...breakdown, source };
    ps.currentVolCm3 += entry.volNeeded;
    ps.currentWeightKg += entry.weightNeeded;
    ps.formats.add(entry.formatSig);
    if (entry.category) ps.categories.add(entry.category);
    if (entry.brand && entry.brand !== 'GENERIC') ps.brands.add(entry.brand);
    if (entry.useItemId) ps.useItemIds.add(entry.useItemId);
  };

  // 7. Group-pass: jede Gruppe versucht, KOMPLETT auf eine Palette zu kommen.
  //    Score = Summe der Item-Scores (so dass useItem-Matches dominieren).
  for (const g of groups) {
    let best = null;
    let bestScore = -Infinity;
    let bestBreakdowns = null;
    let bestRejectReason = 'Keine eligible Palette';

    for (const ps of palletState) {
      if (!canFit(ps, g.totalVol, g.totalWeight)) {
        if (!ps.eligible) bestRejectReason = 'Keine Palette mit ≥2 Artikeln';
        else bestRejectReason = 'Volumen oder Gewicht überschritten';
        continue;
      }
      // Simuliere: scoring jedes Items einzeln, summieren.
      let totalScore = 0;
      const breakdowns = [];
      // Wichtig: simuliere SEQUENTIELL — nach erstem Item ist seine Format-/
      // Kategorie-Eigenschaft auf der Palette präsent → folgende Gruppen-Items
      // matchen automatisch. Wir nutzen eine Schatten-Kopie des States.
      const shadow = {
        ...ps,
        formats: new Set(ps.formats),
        categories: new Set(ps.categories),
        brands: new Set(ps.brands),
        useItemIds: new Set(ps.useItemIds),
        currentVolCm3: ps.currentVolCm3,
        currentWeightKg: ps.currentWeightKg,
      };
      for (const e of g.items) {
        const { score, breakdown } = scoreOne(e, shadow);
        totalScore += score;
        breakdowns.push({ entry: e, breakdown });
        // Schatten-Update
        shadow.currentVolCm3 += e.volNeeded;
        shadow.currentWeightKg += e.weightNeeded;
        shadow.formats.add(e.formatSig);
        if (e.category) shadow.categories.add(e.category);
        if (e.brand && e.brand !== 'GENERIC') shadow.brands.add(e.brand);
        if (e.useItemId) shadow.useItemIds.add(e.useItemId);
      }
      if (totalScore > bestScore) {
        bestScore = totalScore;
        best = ps;
        bestBreakdowns = breakdowns;
      }
    }

    if (best && bestBreakdowns) {
      // Group passt — alle Items committen.
      for (const b of bestBreakdowns) {
        commit(b.entry, best, b.breakdown, g.useItemId ? 'group-useItem' : 'group-solo');
      }
    } else if (g.items.length === 1) {
      // 1-Element-Gruppe konnte nicht platziert werden → unassigned.
      const e = g.items[0];
      unassigned.push(e.item);
      reasons[e.key] = bestRejectReason;
    } else {
      // Mehrteilige Gruppe lässt sich nicht komplett platzieren → split.
      // Item-für-Item-Verteilung mit Best-Fit-Decreasing.
      const sortedItems = [...g.items].sort((a, b) => b.volNeeded - a.volNeeded);
      for (const e of sortedItems) {
        let bestPS = null;
        let bestS = -Infinity;
        let bestBD = null;
        let lastReject = bestRejectReason;
        for (const ps of palletState) {
          if (!canFit(ps, e.volNeeded, e.weightNeeded)) {
            if (!ps.eligible) lastReject = 'Keine Palette mit ≥2 Artikeln';
            else lastReject = 'Volumen oder Gewicht überschritten';
            continue;
          }
          const { score, breakdown } = scoreOne(e, ps);
          if (score > bestS) {
            bestS = score; bestPS = ps; bestBD = breakdown;
          }
        }
        if (bestPS) {
          commit(e, bestPS, bestBD, 'split-fallback');
        } else {
          unassigned.push(e.item);
          reasons[e.key] = lastReject;
        }
      }
    }
  }

  return { assignments, unassigned, reasons, reasonsBreakdown };
}

/* ─────────────────────────────────────────────────────────────────────────
   CROSS-PALLET HIGHLIGHTS
   1. Reserve-Kandidaten: gleicher Format (rollen+dim) aber andere Marke
      → Markierung "Für nächstes Mal aufbewahren" (z.B. SWIPARO vs ECO ROOLLS)
   2. Wiederholtes "Zu verwendender Artikel" → markieren wenn dasselbe useItem
      auf mehreren Artikeln/Paletten erscheint
   ───────────────────────────────────────────────────────────────────────── */

/** Markenname grob aus Titel raten (für Reserve-Erkennung). */
function detectBrand(title) {
  const t = (title || '').toUpperCase();
  if (/SWIPARO/.test(t)) return 'SWIPARO';
  if (/ECO\s*ROOLLS/.test(t)) return 'ECO_ROOLLS';
  if (/THERMALKING/.test(t)) return 'THERMALKING';
  if (/\bVEIT\b/.test(t)) return 'VEIT';
  if (/\bHEIPA\b/.test(t)) return 'HEIPA';
  // Generisch — kein klarer Markenname
  return 'GENERIC';
}

/**
 * Findet "Reserve-Kandidaten" — Artikel mit identischem Format
 * (rollen+dim), aber unterschiedlicher Marke. Diese sollten für
 * den nächsten Auftrag aufbewahrt werden, statt jetzt geöffnet.
 */
function detectReserveCandidates(flatItems) {
  // Gruppiere nach Signature
  const sigMap = new Map();
  flatItems.forEach((row) => {
    const sig = formatSignature(row.item);
    if (!sigMap.has(sig)) sigMap.set(sig, []);
    sigMap.get(sig).push({ ...row, brand: detectBrand(row.item.title) });
  });
  const reserveFnskus = new Set();
  const reserveSigs = new Set();
  sigMap.forEach((rows, sig) => {
    if (rows.length < 2) return;
    const brands = new Set(rows.map((r) => r.brand));
    if (brands.size < 2) return;
    // Mehrere Marken → alle als Reserve-Kandidat markieren
    reserveSigs.add(sig);
    rows.forEach((r) => reserveFnskus.add(r.item.fnsku));
  });
  return { reserveFnskus, reserveSigs };
}

/**
 * Findet "Wiederholt"-Markierungen anhand des "Zu verwendender Artikel" (useItem).
 *
 * Logik (order-aware):
 *   • Wenn useItem X auf mehreren Items vorkommt, bekommen ALLE BIS AUF DAS LETZTE
 *     vorkommen die Markierung "Wiederholt".
 *   • Das LETZTE Vorkommen bleibt OHNE Badge — wir brauchen den Artikel danach
 *     nicht mehr; der Hinweis "wiederholt" ist nur für vorherige relevant.
 *
 * Rückgabe: Set<FNSKU> — FNSKUs, die als "Wiederholt" markiert werden sollen.
 */
function detectRepeatedUseItems(flatItems) {
  // Wie oft kommt jeder useItem vor?
  const useCount = new Map();
  flatItems.forEach((row) => {
    const u = row.item.useItem;
    if (u) useCount.set(u, (useCount.get(u) || 0) + 1);
  });
  // Letzter Index pro useItem (in flatItems-Render-Reihenfolge)
  const lastIdx = new Map();
  flatItems.forEach((row, idx) => {
    const u = row.item.useItem;
    if (u) lastIdx.set(u, idx);
  });
  // Markiere alle Vorkommen außer dem LETZTEN
  const repeatedFnskus = new Set();
  flatItems.forEach((row, idx) => {
    const u = row.item.useItem;
    if (!u) return;
    if ((useCount.get(u) || 0) < 2) return;     // nur einmal → kein Badge
    if (lastIdx.get(u) === idx) return;         // letztes Vorkommen → kein Badge
    if (row.item.fnsku) repeatedFnskus.add(row.item.fnsku);
  });
  return repeatedFnskus;
}

/**
 * Findet die zwei wichtigsten Artikel für die Bestellbestätigung:
 *   1. Bonrolle (Thermorolle/Kassenrolle) mit den meisten Einheiten
 *   2. Big Bag / Produktion-Artikel mit den meisten Einheiten
 */
function findKeyArticles(flatItems) {
  let topBonrolle = null;
  let topBigBag = null;
  flatItems.forEach((row) => {
    const it = row.item;
    if (it.category === 'thermorollen' || /bon/i.test(it.title || '')) {
      if (!topBonrolle || (it.units || 0) > (topBonrolle.item.units || 0)) {
        topBonrolle = row;
      }
    }
    if (it.isProduktion || /big\s*bag/i.test(it.title || '')) {
      if (!topBigBag || (it.units || 0) > (topBigBag.item.units || 0)) {
        topBigBag = row;
      }
    }
  });
  return { topBonrolle, topBigBag };
}

/* ─────────────────────────────────────────────────────────────────────────
   formatSignature wird auch von detectReserveCandidates gebraucht — hier
   neu definiert (wird später erneut für Group-Building verwendet).
   ───────────────────────────────────────────────────────────────────────── */
function formatSignature(item) {
  const r = item.rollen ?? 'x';
  const w = item.dim?.normW ?? item.dim?.w ?? 'x';
  // Normalisierte Höhe: 9≡30, 14≡35, 18≡40 → 57×14 == 57×35
  const h = item.dim?.normH ?? item.dim?.h ?? 'x';
  return `${r}-${w}x${h}`;
}

/* ─────────────────────────────────────────────────────────────────────────
   ZEIT-SCHÄTZUNG
   Modell:
     • Basis pro Palette: 6 min (alte Palette zurückbringen + neue holen)
     • Pause zwischen Paletten: 9 min
     • Pro Artikel: 11 s
     • Spezial-Tacho-Formate (Tachographenrollen 57×15, 57×6, 60-Rollen-Pack):
       21 s pro Artikel
     • Mehr Format-Vielfalt auf einer Palette = +0.5 min pro zusätzlicher
       Format-Gruppe (kontextueller Zuschlag)
   ───────────────────────────────────────────────────────────────────────── */
/* Zeit-Konstanten kommen aus getAdminConfig().times (sessionStorage). */

/**
 * Erkennt "Tacho-Spezial-Format": Tachographen-Rollen 57×15, 57×6 oder
 * Packs mit genau 60 Rollen. Diese brauchen länger pro Artikel (21s).
 */
function isTachoSpecial(item) {
  const w = item.dim?.normW ?? item.dim?.w;
  const h = item.dim?.h;
  const r = item.rollen;
  // 60er Pack
  if (r === 60) return true;
  // Tachographenrollen mit 15 oder 6 mm Höhe
  if (item.isTacho) {
    if (h === 15 || h === 6) return true;
  }
  // Kombination 57×15 oder 57×6 wirkt fast immer wie Tacho
  if (w === 57 && (h === 15 || h === 6)) return true;
  return false;
}

function articleTimeSeconds(item) {
  const t = getAdminConfig().times;
  return isTachoSpecial(item) ? t.perArticleTacho : t.perArticle;
}

/** Geschätzte Zeit für eine Palette (in Sekunden, ohne Pause-zwischen).
    extras = optionale Einzelne-SKU-Items, die dieser Palette zugewiesen sind. */
function palletEstimateSeconds(pallet, extras = []) {
  const t = getAdminConfig().times;
  const allItems = [...(pallet?.items || []), ...extras];
  if (!allItems.length) return t.palletBase;
  const articleSec = allItems.reduce((s, it) => s + articleTimeSeconds(it), 0);
  const fmtSet = new Set(allItems.map(formatSignature));
  const varietyExtra = Math.max(0, fmtSet.size - 1) * t.perFormatVariety;
  return t.palletBase + articleSec + varietyExtra;
}

/** Gesamtschätzung für den Auftrag.
    eskuByPalletId = optional Map<palletId, einzelneSkuItem[]> für genaue Verteilung. */
function orderEstimateSeconds(pallets, eskuByPalletId = null) {
  const t = getAdminConfig().times;
  if (!pallets?.length) return 0;
  const palletSum = pallets.reduce((s, p) => {
    const extras = eskuByPalletId?.[p.id] || [];
    return s + palletEstimateSeconds(p, extras);
  }, 0);
  const breaks = Math.max(0, pallets.length - 1) * t.between;
  return palletSum + breaks;
}

/** "1 h 24 min" Format für menschliche Anzeige. */
function formatDuration(totalSec) {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return '0 min';
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Kurzes Format: "1:24" oder "24 min". */
function formatDurationShort(totalSec) {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return '–';
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/* ─────────────────────────────────────────────────────────────────────────
   ARBEITSTAG-TIMER (Workday Countdown)
     • Arbeitstag: 07:15 – 15:15
     • Mittagspause: 12:00 – 12:30 (Timer pausiert)
     • Ziel: 13:25
   ───────────────────────────────────────────────────────────────────────── */
/* WORKDAY kommt aus getAdminConfig().workday (sessionStorage). */

function todayAt(h, m, base = new Date()) {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Parst eine Zeit-Zeichenkette "HH:MM" → { h, m }.
 * Bei ungültigem Format → Fallback auf 0:0.
 */
function parseTimeStr(s) {
  if (!s || typeof s !== 'string') return { h: 0, m: 0 };
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { h: 0, m: 0 };
  return { h: Math.min(23, parseInt(m[1], 10)), m: Math.min(59, parseInt(m[2], 10)) };
}

/** Liefert Workday-Zeitpunkte aus aktueller Admin-Config. */
function getWorkdayTimes() {
  const w = getAdminConfig().workday;
  return {
    start: parseTimeStr(w.start),
    end: parseTimeStr(w.end),
    target: parseTimeStr(w.target),
    pauseStart: parseTimeStr(w.pauseStart),
    pauseEnd: parseTimeStr(w.pauseEnd),
  };
}

/**
 * Berechnet, wie viele Sekunden EFFEKTIVE ARBEIT bis zum Ziel (13:25) bleiben,
 * wobei die Mittagspause 12:00–12:30 nicht mitgezählt wird.
 * Negative Werte bedeuten: Ziel überschritten.
 */
function workdayTimeInfo(now = new Date()) {
  const W = getWorkdayTimes();
  const start = todayAt(W.start.h, W.start.m, now);
  const end = todayAt(W.end.h, W.end.m, now);
  const target = todayAt(W.target.h, W.target.m, now);
  const pStart = todayAt(W.pauseStart.h, W.pauseStart.m, now);
  const pEnd = todayAt(W.pauseEnd.h, W.pauseEnd.m, now);

  const inPause = now >= pStart && now < pEnd;
  const beforeStart = now < start;
  const afterEnd = now >= end;

  // Effektive Sekunden zwischen 'now' und 'until', minus Pause-Überlappung
  const effectiveSecondsBetween = (a, b) => {
    if (b <= a) return 0;
    const overlap = Math.max(0, Math.min(b, pEnd) - Math.max(a, pStart));
    return Math.max(0, Math.floor((b - a - overlap) / 1000));
  };

  const remainingToTarget = effectiveSecondsBetween(now, target);
  const remainingToEnd = effectiveSecondsBetween(now, end);
  const overshootSec = now > target ? Math.floor((now - target) / 1000) : 0;

  return {
    now,
    inPause,
    beforeStart,
    afterEnd,
    remainingToTarget,
    remainingToEnd,
    overshootSec,
    target,
    pauseStart: pStart,
    pauseEnd: pEnd,
    pauseRemaining: inPause ? Math.floor((pEnd - now) / 1000) : 0,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   SORTING
   ───────────────────────────────────────────────────────────────────────── */
function sortItems(items) {
  return [...items].sort((a, b) => {
    // Categorie-Reihenfolge: Thermorollen → Heipa → Veit → Tachographenrollen → Produktion
    const ga = categoryRank(a.category);
    const gb = categoryRank(b.category);
    if (ga !== gb) return ga - gb;
    // Volumen = units × (rollen || 1)
    const va = (a.units || 0) * (a.rollen || 1);
    const vb = (b.units || 0) * (b.rollen || 1);
    if (vb !== va) return vb - va;
    // Dim-Fläche
    const aa = a.dim ? a.dim.w * a.dim.h : 0;
    const ab = b.dim ? b.dim.w * b.dim.h : 0;
    return ab - aa;
  });
}

function sortPallets(pallets) {
  return [...pallets]
    .map((p) => ({ ...p, items: sortItems(p.items) }))
    .sort((a, b) => a.items.length - b.items.length);
}

/* ─────────────────────────────────────────────────────────────────────────
   UI components
   ───────────────────────────────────────────────────────────────────────── */
function CodePill({ code, codeType }) {
  const palette = {
    X001: { fg: T.blue, bg: T.blueBg, border: 'rgba(37,99,235,0.22)' },
    X002: { fg: T.purple, bg: T.purpleBg, border: 'rgba(124,58,237,0.22)' },
    X000: { fg: T.green, bg: T.greenBg, border: 'rgba(22,163,74,0.22)' },
    B0: { fg: T.amber, bg: T.amberBg, border: 'rgba(217,119,6,0.22)' },
    OTHER: { fg: T.text, bg: T.bg, border: T.border },
  };
  const c = palette[codeType] || palette.OTHER;
  return (
    <span
      className="lp-mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        borderRadius: 5,
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: 0.3,
        whiteSpace: 'nowrap',
      }}
    >
      {code}
    </span>
  );
}

function StatChip({ label, value, accent }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: '6px 12px',
        background: accent ? T.text : T.surface,
        color: accent ? T.surface : T.text,
        border: `1px solid ${accent ? T.text : T.border}`,
        borderRadius: 8,
        minWidth: 64,
      }}
    >
      <span
        className="lp-mono"
        style={{
          fontSize: 14,
          fontWeight: 500,
          lineHeight: 1.1,
          letterSpacing: -0.2,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: 9,
          opacity: 0.65,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          marginTop: 2,
          fontWeight: 500,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Btn({ variant = 'primary', onClick, children, disabled, title }) {
  const isPrimary = variant === 'primary';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={isPrimary ? 'lp-btn-hover' : 'lp-btn2-hover'}
      style={{
        padding: '9px 18px',
        background: isPrimary ? T.accent : 'transparent',
        color: isPrimary ? '#fff' : T.text,
        border: `1px solid ${isPrimary ? T.accent : T.border}`,
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontFamily: 'inherit',
        transition: 'all 0.12s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function ToggleBtn({ active, onClick, children, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: '9px 16px',
        background: active ? T.accent : 'transparent',
        color: active ? '#fff' : T.textSub,
        border: `1px solid ${active ? T.accent : T.border}`,
        borderRadius: 8,
        fontSize: 12.5,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.12s ease',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {children}
    </button>
  );
}

function DropZone({ onFile, hasFile }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  /* Compact mode — once a file is loaded, this collapses to a thin strip
     so it doesn't dominate the workspace. Hero mode is the first-visit
     experience: large, animated, self-explanatory.                      */
  if (hasFile) {
    return (
      <div
        className={`lp-btn2-hover ${over ? 'is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1px dashed ${over ? T.accent : T.borderStrong}`,
          borderRadius: 10,
          padding: '14px 18px',
          background: over ? T.accentBg : T.surface,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".docx"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
        <span style={{ fontSize: 18, color: over ? T.accent : T.textMuted }}>↑</span>
        <div style={{ fontSize: 13, fontWeight: 500, color: over ? T.accent : T.text }}>
          Anderen Lagerauftrag laden
        </div>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 10,
            color: T.textMuted,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          .docx ablegen
        </span>
      </div>
    );
  }

  /* Hero mode — first visit. Big, animated, self-explanatory. */
  return (
    <div
      className={`lp-dropzone-hero ${over ? 'is-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${over ? T.accent : T.borderStrong}`,
        borderRadius: 16,
        padding: '64px 32px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        marginTop: 32,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />

      {/* Animated icon — floats subtly, glow ring on hover */}
      <div
        style={{
          position: 'relative',
          width: 84,
          height: 84,
          margin: '0 auto 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          className="lp-hero-glow-ring"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${T.accentBg}, transparent 70%)`,
          }}
        />
        <div
          className="lp-hero-icon"
          style={{
            position: 'relative',
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: over ? T.accent : T.surfaceRaised,
            border: `1px solid ${over ? T.accent : T.borderStrong}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            color: over ? '#fff' : T.accent,
            transition: 'all 0.2s ease',
            boxShadow: over
              ? '0 0 30px rgba(123,131,235,0.5)'
              : '0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          ↓
        </div>
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: over ? T.accent : T.text,
          marginBottom: 8,
          letterSpacing: -0.4,
          transition: 'color 0.15s ease',
        }}
      >
        {over ? 'Datei loslassen' : 'Lagerauftrag analysieren'}
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontSize: 14,
          color: T.textSub,
          marginBottom: 20,
          fontWeight: 400,
        }}
      >
        Datei hier ablegen oder klicken zum Auswählen
      </div>

      {/* Format chips — explain what's accepted */}
      <div
        style={{
          display: 'inline-flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 11px',
            background: T.surfaceRaised,
            border: `1px solid ${T.border}`,
            borderRadius: 999,
            fontSize: 11,
            color: T.textSub,
            fontFamily: 'DM Mono, monospace',
            letterSpacing: 0.4,
          }}
        >
          <span style={{ color: T.accent, fontSize: 9 }}>●</span>
          .docx
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 11px',
            background: T.surfaceRaised,
            border: `1px solid ${T.border}`,
            borderRadius: 999,
            fontSize: 11,
            color: T.textSub,
            letterSpacing: 0.3,
          }}
        >
          Standard
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 11px',
            background: T.surfaceRaised,
            border: `1px solid ${T.border}`,
            borderRadius: 999,
            fontSize: 11,
            color: T.textSub,
            letterSpacing: 0.3,
          }}
        >
          Schilder
        </span>
        <span
          style={{
            fontSize: 10.5,
            color: T.textMuted,
            marginLeft: 4,
            letterSpacing: 0.3,
          }}
        >
          automatisch erkannt
        </span>
      </div>
    </div>
  );
}

function WarningBadge({ children }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        background: T.amberBg,
        color: T.amber,
        border: `1px solid rgba(217,119,6,0.28)`,
        borderRadius: 6,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 11 }}>⚠</span>
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Validation badge (header)
   ───────────────────────────────────────────────────────────────────────── */
function ValidationBadge({ report, onClick }) {
  if (!report) return null;
  const ok = report.ok;
  const hasWarn = report.warningCount > 0;
  const fg = ok ? (hasWarn ? T.amber : T.green) : '#dc2626';
  const bg = ok ? (hasWarn ? T.amberBg : T.greenBg) : '#fef2f2';
  const border = ok
    ? hasWarn
      ? 'rgba(217,119,6,0.28)'
      : 'rgba(22,163,74,0.28)'
    : 'rgba(220,38,38,0.28)';
  const label = ok
    ? hasWarn
      ? `OK · ${report.warningCount} Warnungen`
      : 'Alles korrekt'
    : `${report.errorCount} Fehler!`;
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 14px',
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        borderRadius: 8,
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: 0.3,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.15s ease',
      }}
      title="Prüfbericht öffnen"
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: fg,
          boxShadow: ok && !hasWarn ? `0 0 0 4px ${fg}22` : 'none',
          animation: ok && !hasWarn ? 'lpPulse 2s ease-in-out infinite' : 'none',
        }}
      />
      {label}
    </button>
  );
}

function ValidationReport({ report, onClose }) {
  if (!report) return null;
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        background: T.surface,
        borderLeft: `1px solid ${T.border}`,
        boxShadow: T.shadowLg,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        animation: 'lpSlideRight 0.25s ease forwards',
      }}
    >
      <div
        style={{
          padding: '18px 22px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 10,
              color: T.textMuted,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Prüfbericht
          </div>
          <div
            style={{
              fontSize: 16,
              color: T.text,
              fontWeight: 500,
              marginTop: 2,
              letterSpacing: -0.2,
            }}
          >
            {report.ok ? 'Parsing sauber' : `${report.errorCount} Fehler`}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: T.textMuted,
            fontSize: 18,
            cursor: 'pointer',
            padding: 4,
            fontFamily: 'inherit',
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
        {/* Counts grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 10,
            marginBottom: 20,
          }}
        >
          <CountCard
            label="Paletten im Text"
            value={report.counts.palletsInText}
            ok={report.counts.palletsInText === report.counts.palletsParsed}
          />
          <CountCard
            label="Paletten geparst"
            value={report.counts.palletsParsed}
            ok={report.counts.palletsInText === report.counts.palletsParsed}
          />
          <CountCard
            label="SKU aus Kopf"
            value={report.counts.itemsExpectedFromHeader ?? '—'}
            ok={
              report.counts.itemsExpectedFromHeader === undefined ||
              report.counts.itemsExpectedFromHeader === report.counts.itemsParsed
            }
          />
          <CountCard
            label="SKU geparst"
            value={report.counts.itemsParsed}
            ok={
              report.counts.itemsExpectedFromHeader === undefined ||
              report.counts.itemsExpectedFromHeader === report.counts.itemsParsed
            }
          />
          <CountCard
            label="Einheiten erwartet"
            value={report.counts.unitsExpectedFromHeader ?? '—'}
            ok={
              report.counts.unitsExpectedFromHeader === undefined ||
              report.counts.unitsExpectedFromHeader === report.counts.unitsParsed
            }
          />
          <CountCard
            label="Einheiten geparst"
            value={report.counts.unitsParsed}
            ok={
              report.counts.unitsExpectedFromHeader === undefined ||
              report.counts.unitsExpectedFromHeader === report.counts.unitsParsed
            }
            accent
          />
        </div>

        {/* Issues */}
        {report.issues.length === 0 ? (
          <div
            style={{
              padding: '14px 16px',
              background: T.greenBg,
              border: `1px solid rgba(22,163,74,0.22)`,
              borderRadius: 10,
              color: T.green,
              fontSize: 12.5,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 16 }}>✓</span>
            Alle Prüfungen bestanden — kein Artikel ausgelassen
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {report.issues.map((i, idx) => (
              <div
                key={idx}
                style={{
                  padding: '10px 12px',
                  background:
                    i.severity === 'error' ? '#fef2f2' : T.amberBg,
                  border: `1px solid ${
                    i.severity === 'error'
                      ? 'rgba(220,38,38,0.22)'
                      : 'rgba(217,119,6,0.22)'
                  }`,
                  borderRadius: 8,
                  fontSize: 12,
                  color:
                    i.severity === 'error' ? '#dc2626' : T.amber,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  lineHeight: 1.4,
                }}
              >
                <span style={{ fontSize: 14, marginTop: -1 }}>
                  {i.severity === 'error' ? '✕' : '⚠'}
                </span>
                <div style={{ flex: 1, fontWeight: 500 }}>{i.msg}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CountCard({ label, value, ok, accent }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        background: accent ? T.text : T.surface,
        border: `1px solid ${
          ok ? T.border : 'rgba(220,38,38,0.4)'
        }`,
        borderRadius: 8,
        position: 'relative',
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: accent ? 'rgba(255,255,255,0.6)' : T.textMuted,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        className="lp-mono"
        style={{
          fontSize: 18,
          fontWeight: 500,
          color: accent ? '#fff' : T.text,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: -0.4,
        }}
      >
        {value}
      </div>
      {!ok && (
        <span
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            fontSize: 11,
            color: '#dc2626',
          }}
        >
          ✕
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Volume colors — abgestuftes 6-Stufen-System nach Status
   ───────────────────────────────────────────────────────────────────────── */
function statusColors(status) {
  switch (status) {
    case 'overflow': return { fg: '#dc2626', bg: '#fef2f2', label: 'Überfüllt', icon: '⚠' };
    case 'tight':    return { fg: T.amber, bg: T.amberBg, label: 'Voll',       icon: '◉' };
    case 'optimal':  return { fg: T.green, bg: T.greenBg, label: 'Optimal',    icon: '✓' };
    case 'good':     return { fg: T.blue,  bg: T.blueBg,  label: 'Gut',        icon: '◐' };
    case 'low':      return { fg: T.textSub, bg: T.bg,    label: 'Wenig',      icon: '○' };
    case 'empty':
    default:         return { fg: T.textMuted, bg: T.bg,  label: 'Leer',       icon: '·' };
  }
}

/* Stabile Hash-Farbe pro Artikel-Format für Stack-Bar-Segmente */
function articlePalette() {
  return ['#1A1714', '#7C3AED', '#2563EB', '#16A34A', '#D97706', '#DB2777', '#0891B2', '#65A30D', '#A855F7', '#F59E0B'];
}
function colorForKey(key, palette = articlePalette()) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

/* ─────────────────────────────────────────────────────────────────────────
   PalletVolumeCard — DAS große Volumen-Cockpit
   Donut + Per-Artikel-Stack-Bar + Multi-Metrik-Grid + Capacity-Hint
   ───────────────────────────────────────────────────────────────────────── */
function PalletVolumeCard({ stats }) {
  const pct = stats.fillPct * 100;
  const c = statusColors(stats.status);

  // Donut ring math
  const R = 44;
  const stroke = 9;
  const C2 = 2 * Math.PI * R;
  const dash = Math.min(1, stats.fillPct) * C2;

  // Sortiere Artikel nach Volumen-Anteil (größte zuerst)
  const sortedItems = [...stats.itemsBreakdown]
    .filter((b) => b.v.cartonsCount > 0)
    .sort((a, b) => b.v.totalCm3 - a.v.totalCm3);
  const topItems = sortedItems.slice(0, 8);

  // Restkapazität (volumetrisch)
  const remainingPct = Math.max(0, 1 - stats.fillPct);
  const remainingM3 = Math.max(0, stats.capacityM3 - stats.totalM3);
  const remainingKg = Math.max(0, stats.weightCapKg - stats.totalWeightKg);

  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${c.fg}33`,
        borderRadius: 12,
        padding: 0,
        overflow: 'hidden',
        boxShadow: T.shadowSm,
      }}
    >
      {/* ─── Hero: Donut + Layer-Stack + Hauptmetrik ─── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 16px',
          background: `linear-gradient(135deg, ${c.bg} 0%, ${T.surface} 100%)`,
          borderBottom: `1px solid ${T.border}`,
          flexWrap: 'wrap',
        }}
      >
        {/* Donut */}
        <div
          style={{
            position: 'relative',
            width: 100, height: 100, flexShrink: 0,
          }}
        >
          <svg
            width="100" height="100" viewBox="0 0 110 110"
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle cx="55" cy="55" r={R} fill="none" stroke={T.border} strokeWidth={stroke} />
            <circle
              cx="55" cy="55" r={R}
              fill="none" stroke={c.fg} strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${C2}`}
              style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
          </svg>
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span
              className="lp-mono"
              style={{
                fontSize: 20, fontWeight: 700, color: c.fg,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: -0.8, lineHeight: 1,
              }}
            >
              {pct.toFixed(0)}<span style={{ fontSize: 11, opacity: 0.55 }}>%</span>
            </span>
            <span
              style={{
                fontSize: 8, color: T.textMuted,
                fontWeight: 700, letterSpacing: 1.3,
                textTransform: 'uppercase', marginTop: 3,
              }}
            >
              {c.label}
            </span>
          </div>
        </div>

        {/* Title + Metrik-Chips */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div
            style={{
              fontSize: 9.5, color: T.textMuted, letterSpacing: 1.5,
              textTransform: 'uppercase', fontWeight: 700,
              marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span>Paletten-Auslastung</span>
            <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 500, fontStyle: 'italic' }}>
              · plain volumetric @ dichter Stapelung
            </span>
          </div>
          <div
            style={{
              display: 'flex', flexWrap: 'wrap', gap: 6,
              marginBottom: 6,
            }}
          >
            <MetricChip
              label="Volumen"
              value={`${(stats.fillPct * 100).toFixed(0)}%`}
              detail={`${stats.totalM3.toFixed(2)} / ${stats.capacityM3.toFixed(2)} m³`}
              active={stats.limitingFactor === 'volume'}
              tone={stats.isOverflow ? 'red' : 'default'}
            />
            <MetricChip
              label="Gewicht"
              value={`${(stats.weightPct * 100).toFixed(0)}%`}
              detail={`${stats.totalWeightKg.toFixed(1)} / ${stats.weightCapKg} kg`}
              active={stats.limitingFactor === 'weight'}
              tone={stats.isWeightOverflow ? 'red' : 'default'}
            />
            <MetricChip
              label="Kartons"
              value={stats.totalCartons}
              detail={`${stats.itemsBreakdown.length} Artikel`}
            />
            {stats.hasUnknown && (
              <MetricChip
                label="≈ Geschätzt"
                value={`${stats.unmatchedCount}×`}
                detail="ohne Katalog"
                tone="amber"
              />
            )}
          </div>
          {/* Capacity remaining */}
          {!stats.isOverflow && remainingPct > 0.02 && (
            <div
              style={{
                fontSize: 10.5, color: T.textSub,
                lineHeight: 1.4,
              }}
            >
              <span style={{ color: T.textMuted, fontWeight: 600 }}>Frei: </span>
              <span className="lp-mono">{(remainingPct * 100).toFixed(0)}%</span>
              <span style={{ color: T.textMuted }}> · </span>
              <span className="lp-mono">{remainingM3.toFixed(2)} m³</span>
              <span style={{ color: T.textMuted }}> · </span>
              <span className="lp-mono">{remainingKg.toFixed(0)} kg</span>
            </div>
          )}
          {stats.isOverflow && (
            <div
              style={{
                fontSize: 11, color: '#dc2626', fontWeight: 700,
                lineHeight: 1.4,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                padding: '6px 10px',
                borderRadius: 6,
                marginTop: 4,
              }}
            >
              ⚠ ÜBERFÜLLT — {((stats.fillPct - 1) * 100).toFixed(0)}% zu viel
              {stats.limitingFactor === 'weight'
                ? ` (Gewicht: ${(stats.totalWeightKg - stats.weightCapKg).toFixed(0)} kg über Tarif)`
                : ` (Volumen: ${(stats.totalCm3 / 1_000_000 - stats.capacityM3).toFixed(2)} m³ Überschuss)`}
            </div>
          )}
        </div>
      </div>

      {/* ─── Per-Artikel-Breakdown ─── */}
      {topItems.length > 0 && (
        <div style={{ padding: '12px 16px 14px' }}>
          <div
            style={{
              fontSize: 9.5, color: T.textMuted, letterSpacing: 1.4,
              textTransform: 'uppercase', fontWeight: 700,
              marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <span>Aufschlüsselung pro Artikel</span>
            <div style={{ flex: 1, height: 1, background: T.border }} />
            <span style={{ color: T.textMuted, fontWeight: 600 }}>
              {sortedItems.length} {sortedItems.length === 1 ? 'Eintrag' : 'Einträge'}
            </span>
          </div>
          {/* Stacked bar */}
          <div
            style={{
              display: 'flex', height: 8, borderRadius: 4,
              overflow: 'hidden',
              background: T.bg,
              border: `1px solid ${T.border}`,
              marginBottom: 10,
              position: 'relative',
            }}
          >
            {topItems.map((b, i) => {
              // Anteil dieses Artikels an der gesamten Palette (volumetrisch)
              const wPct = (b.v.totalCm3 / stats.palletVolCm3) * 100;
              const key = itemShortFormat(b.item) + (b.item.fnsku || i);
              const segColor = colorForKey(key);
              return (
                <div
                  key={i}
                  title={`${itemShortFormat(b.item)} · ${b.v.cartonsCount} Kartons · ${(b.v.totalCm3 / 1_000_000).toFixed(3)} m³ → ${wPct.toFixed(1)}%`}
                  style={{
                    width: `${wPct}%`,
                    background: segColor,
                    transition: 'width 0.5s ease',
                    borderRight: i < topItems.length - 1 ? `1px solid ${T.surface}` : 'none',
                  }}
                />
              );
            })}
            {/* 100%-Marker */}
            {stats.fillPct < 1 && (
              <div
                style={{
                  position: 'absolute', right: 0, top: -2, bottom: -2,
                  width: 2, background: T.borderStrong, opacity: 0.6,
                }}
              />
            )}
          </div>
          {/* Per-Artikel-Liste */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 4,
            }}
          >
            {topItems.map((b, i) => (
              <ArticleBreakdownRow
                key={i}
                breakdown={b}
                palletVolCm3={stats.palletVolCm3}
              />
            ))}
          </div>
          {sortedItems.length > topItems.length && (
            <div
              style={{
                fontSize: 10.5, color: T.textMuted, marginTop: 8,
                fontStyle: 'italic',
              }}
            >
              + {sortedItems.length - topItems.length} weitere Artikel ausgeblendet
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Layer-Stack-Visualisierung: vertikale Lagen-Anzeige ──────────────── */
function LayerStackViz({ totalLayers, maxLayers, color, items }) {
  // Pro Lage von oben nach unten: full=1, partial=fraction, empty=0
  const layers = [];
  let remaining = totalLayers;
  for (let i = 0; i < maxLayers; i++) {
    if (remaining >= 1) { layers.push(1); remaining -= 1; }
    else if (remaining > 0) { layers.push(remaining); remaining = 0; }
    else layers.push(0);
  }
  // umkehren: Lage 0 unten, last oben (visuell stack)
  layers.reverse();

  return (
    <div
      title={`Geschätzte Lagen-Belegung: ${totalLayers.toFixed(1)} / ${maxLayers}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        width: 30,
        height: 100,
        flexShrink: 0,
        padding: 2,
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 4,
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      {layers.map((fill, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            background: fill > 0 ? color : T.bg,
            opacity: fill > 0 ? 0.3 + fill * 0.7 : 1,
            borderRadius: 1,
            transition: 'background 0.4s, opacity 0.4s',
          }}
        />
      ))}
    </div>
  );
}

/* ── Eine Zeile in der Per-Artikel-Aufschlüsselung ────────────────────── */
function ArticleBreakdownRow({ breakdown, palletVolCm3 }) {
  const b = breakdown;
  const segColor = colorForKey(itemShortFormat(b.item) + (b.item.fnsku || ''));
  const articlePct = palletVolCm3 > 0 ? (b.v.totalCm3 / palletVolCm3) * 100 : 0;
  const g = b.v.grid;
  // Match-Quality-Badge
  const q = b.v.matchQuality;
  const qBadge = (() => {
    switch (q) {
      case 'exact':      return { txt: '✓ exakt',  color: T.green, bg: T.greenBg };
      case 'normalized': return { txt: '↹ Höhe',   color: T.blue,  bg: T.blueBg };
      case 'fuzzy':      return { txt: '~ ähnlich', color: T.amber, bg: T.amberBg };
      case 'heuristic':  return { txt: '? Schätz.', color: T.amber, bg: T.amberBg };
      default:           return null;
    }
  })();
  // Echte Etiketten-Höhe
  const rawDim = `${b.item?.dim?.w ?? '?'}×${b.item?.dim?.h ?? '?'}`;
  const normDim = b.item?.dim?.normH != null && b.item.dim.normH !== b.item.dim.h
    ? `→ ${b.item.dim.w}×${b.item.dim.normH}` : '';

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px',
        fontSize: 11, color: T.textSub, lineHeight: 1.3,
        borderRadius: 5,
        background: T.bg,
        border: `1px solid ${T.border}`,
      }}
    >
      <span
        style={{
          width: 3, alignSelf: 'stretch',
          background: segColor, flexShrink: 0, borderRadius: 2,
          minHeight: 32,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Zeile 1: Artikel-Format (Etikett) + Quality-Badge */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              fontFamily: 'DM Mono, monospace',
              fontSize: 12, color: T.text, fontWeight: 700,
              letterSpacing: -0.2,
            }}
          >
            {itemShortFormat(b.item)}
          </span>
          {normDim && (
            <span
              style={{
                fontSize: 9, color: T.textMuted,
                fontFamily: 'DM Mono, monospace',
              }}
            >
              {normDim}
            </span>
          )}
          {qBadge && (
            <span
              title={
                q === 'exact' ? 'Exakter Katalog-Treffer' :
                q === 'normalized' ? `Höhe ${b.item?.dim?.h} → ${b.item?.dim?.normH} normalisiert` :
                q === 'fuzzy' ? `Nächster Nachbar (Distanz ${b.v.matchDistance})` :
                'Heuristisch geschätzt — keine Katalog-Box gefunden'
              }
              style={{
                fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5,
                padding: '1px 5px', borderRadius: 3,
                background: qBadge.bg, color: qBadge.color,
                border: `1px solid ${qBadge.color}33`,
                whiteSpace: 'nowrap',
              }}
            >
              {qBadge.txt}
            </span>
          )}
        </div>
        {/* Zeile 2: Box-Maße + Grid */}
        <div
          style={{
            fontSize: 9.5, color: T.textMuted,
            fontFamily: 'DM Mono, monospace',
            display: 'flex', gap: 6, flexWrap: 'wrap',
          }}
          title={b.v.matchedArtikel || b.v.displayName || ''}
        >
          <span title="Anzahl Kartons">
            <strong style={{ color: T.textSub }}>{b.v.cartonsCount}×</strong>
          </span>
          <span style={{ color: T.borderStrong }}>·</span>
          <span title="Karton-Maße">
            {b.v.boxDims.map((d) => d.toFixed(d % 1 === 0 ? 0 : 1)).join('×')} cm
          </span>
          <span style={{ color: T.borderStrong }}>·</span>
          <span title={`${g.cols} Spalten × ${g.rows} Reihen × ${g.layers} Lagen`}>
            {g.cols}×{g.rows}×{g.layers}={g.capacity}
          </span>
        </div>
      </div>
      <span
        className="lp-mono"
        style={{
          fontSize: 13, color: T.text, fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 40, textAlign: 'right',
          letterSpacing: -0.3,
        }}
      >
        {articlePct.toFixed(articlePct < 1 ? 1 : 0)}%
      </span>
    </div>
  );
}

function MetricChip({ label, value, detail, active = false, tone = 'default' }) {
  const palette = {
    default: { bg: T.surface, fg: T.text, border: T.border },
    red:     { bg: '#fef2f2', fg: '#dc2626', border: '#fecaca' },
    amber:   { bg: T.amberBg, fg: T.amber, border: '#fed7aa' },
  }[tone] || { bg: T.surface, fg: T.text, border: T.border };
  return (
    <div
      style={{
        display: 'inline-flex', flexDirection: 'column',
        padding: '5px 10px',
        background: active ? palette.fg : palette.bg,
        border: `1px solid ${active ? palette.fg : palette.border}`,
        borderRadius: 6,
        gap: 1,
        minWidth: 64,
        boxShadow: active ? `0 1px 3px ${palette.fg}33` : 'none',
        transition: 'all 0.15s ease',
      }}
    >
      <span
        style={{
          fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: active ? '#fff' : T.textMuted,
        }}
      >
        {label}
      </span>
      <span
        className="lp-mono"
        style={{
          fontSize: 13, fontWeight: 700,
          color: active ? '#fff' : palette.fg,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: -0.3, lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      {detail && (
        <span
          style={{
            fontSize: 9, color: active ? 'rgba(255,255,255,0.7)' : T.textMuted,
            fontFamily: 'DM Mono, monospace',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {detail}
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Timer — elapsed time since file load
   ───────────────────────────────────────────────────────────────────────── */
function ElapsedTimer({ startTs, paused }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startTs || paused) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startTs, paused]);
  if (!startTs) return null;
  const elapsed = Math.floor((now - startTs) / 1000);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const display = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 14px',
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        fontSize: 12.5,
        fontFamily: 'DM Mono, ui-monospace, monospace',
        color: T.text,
        fontWeight: 500,
        letterSpacing: 0.4,
        fontVariantNumeric: 'tabular-nums',
      }}
      title={paused ? 'Bearbeitung abgeschlossen' : 'Zeit seit dem Hochladen'}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: paused ? T.textMuted : T.blue,
          animation: paused ? 'none' : 'lpPulse 1.4s ease-in-out infinite',
        }}
      />
      <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600 }}>
        {paused ? 'Fertig in' : 'Zeit'}
      </span>
      {display}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   WORKDAY TIMER — ultra-modern technologisches Countdown-Display.
   Zielzeit: 13:25.   Pause: 12:00–12:30.   Arbeitstag: 07:15–15:15.
   Während der Pause friert der Countdown ein und zeigt "PAUSE".
   ───────────────────────────────────────────────────────────────────────── */
function WorkdayTimer({ orderEstimateSec, compact = false }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const info = workdayTimeInfo(now);

  // Live-Uhrzeit
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  // Status & Farbe — Labels aus aktueller Admin-Config
  const cfgWorkday = getAdminConfig().workday;
  let status, statusColor, statusBg, mainLabel, mainValue, subLabel;
  if (info.beforeStart) {
    status = 'Vor Arbeitsbeginn';
    statusColor = T.textSub;
    statusBg = T.bg;
    mainLabel = 'Beginn';
    mainValue = cfgWorkday.start;
    subLabel = 'Heute';
  } else if (info.afterEnd) {
    status = 'Feierabend';
    statusColor = T.textMuted;
    statusBg = T.bg;
    mainLabel = 'Ende';
    mainValue = cfgWorkday.end;
    subLabel = 'erreicht';
  } else if (info.inPause) {
    status = 'Mittagspause';
    statusColor = T.amber;
    statusBg = T.amberBg;
    mainLabel = 'Pause endet in';
    const pm = Math.floor(info.pauseRemaining / 60);
    const ps = info.pauseRemaining % 60;
    mainValue = `${String(pm).padStart(2, '0')}:${String(ps).padStart(2, '0')}`;
    subLabel = `${cfgWorkday.pauseStart} – ${cfgWorkday.pauseEnd}`;
  } else if (info.remainingToTarget > 0) {
    status = `Bis Ziel ${cfgWorkday.target}`;
    statusColor = T.blue;
    statusBg = T.blueBg;
    mainLabel = 'Verbleibend';
    const totalMin = Math.floor(info.remainingToTarget / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const sec = info.remainingToTarget % 60;
    mainValue = h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    subLabel = orderEstimateSec
      ? (info.remainingToTarget >= orderEstimateSec ? '✓ schaffbar' : '⚠ knapp')
      : 'effektive Arbeitszeit';
  } else {
    // Über das Ziel hinaus
    status = 'Ziel überschritten';
    statusColor = '#dc2626';
    statusBg = '#fef2f2';
    mainLabel = 'Überzeit';
    const totalMin = Math.floor(info.overshootSec / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    mainValue = h > 0 ? `+${h}h ${m}m` : `+${m}m`;
    subLabel = `bis Ende ${formatDurationShort(info.remainingToEnd)}`;
  }

  // Visueller Tagesfortschritt: Position auf der Linie start → end
  const W = getWorkdayTimes();
  const dayStart = todayAt(W.start.h, W.start.m, now).getTime();
  const dayEnd = todayAt(W.end.h, W.end.m, now).getTime();
  const target = todayAt(W.target.h, W.target.m, now).getTime();
  const pStart = todayAt(W.pauseStart.h, W.pauseStart.m, now).getTime();
  const pEnd = todayAt(W.pauseEnd.h, W.pauseEnd.m, now).getTime();
  const dayLen = dayEnd - dayStart;
  const pctOf = (t) => Math.max(0, Math.min(100, ((t - dayStart) / dayLen) * 100));
  const nowPct = pctOf(now.getTime());
  const targetPct = pctOf(target);
  const pStartPct = pctOf(pStart);
  const pEndPct = pctOf(pEnd);

  if (compact) {
    return (
      <div
        title={status}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 12px',
          background: statusBg,
          border: `1px solid ${statusColor}33`,
          borderRadius: 8,
          fontFamily: 'DM Mono, ui-monospace, monospace',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: statusColor,
            animation: info.inPause ? 'none' : 'lpPulse 1.4s ease-in-out infinite',
          }}
        />
        <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700 }}>
          {info.inPause ? 'Pause' : cfgWorkday.target}
        </span>
        <span style={{ fontSize: 13, color: statusColor, fontWeight: 700, letterSpacing: 0.3 }}>
          {mainValue}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${T.text} 0%, #2a2520 100%)`,
        color: '#fff',
        borderRadius: 14,
        padding: '18px 22px',
        boxShadow: T.shadowMd,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top row: live clock + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: statusColor,
              boxShadow: `0 0 0 4px ${statusColor}33`,
              animation: info.inPause ? 'none' : 'lpPulse 1.4s ease-in-out infinite',
            }}
          />
          <span
            style={{
              fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase',
              fontWeight: 700, color: 'rgba(255,255,255,0.65)',
            }}
          >
            {status}
          </span>
        </div>
        <div
          className="lp-mono"
          style={{
            fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
            fontVariantNumeric: 'tabular-nums', letterSpacing: 0.5,
          }}
        >
          {hh}:{mm}<span style={{ opacity: 0.5 }}>:{ss}</span>
        </div>
      </div>

      {/* Main countdown — huge */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)', fontWeight: 700, marginBottom: 4,
            }}
          >
            {mainLabel}
          </div>
          <div
            className="lp-mono"
            style={{
              fontSize: 38, fontWeight: 700, color: '#fff',
              letterSpacing: -1, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
            }}
          >
            {mainValue}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)', fontWeight: 700, marginBottom: 4,
            }}
          >
            {orderEstimateSec ? 'Auftrag' : 'Status'}
          </div>
          <div
            className="lp-mono"
            style={{
              fontSize: 16, fontWeight: 600,
              color: orderEstimateSec
                ? (info.remainingToTarget >= orderEstimateSec ? '#86efac' : '#fbbf24')
                : 'rgba(255,255,255,0.85)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {orderEstimateSec ? `~${formatDurationShort(orderEstimateSec)}` : subLabel}
          </div>
        </div>
      </div>

      {/* Workday timeline */}
      <div style={{ position: 'relative', height: 28, marginBottom: 4 }}>
        {/* Track */}
        <div
          style={{
            position: 'absolute', top: 12, left: 0, right: 0, height: 4,
            background: 'rgba(255,255,255,0.12)', borderRadius: 2,
          }}
        />
        {/* Pause band (gray) */}
        <div
          style={{
            position: 'absolute', top: 12,
            left: `${pStartPct}%`, width: `${pEndPct - pStartPct}%`,
            height: 4, background: 'rgba(217,119,6,0.5)', borderRadius: 2,
          }}
        />
        {/* Filled progress up to now */}
        <div
          style={{
            position: 'absolute', top: 12, left: 0,
            width: `${nowPct}%`, height: 4,
            background: `linear-gradient(90deg, ${statusColor}aa, ${statusColor})`,
            borderRadius: 2, transition: 'width 1s linear',
          }}
        />
        {/* Target marker (13:25) */}
        <div
          style={{
            position: 'absolute', top: 6, left: `${targetPct}%`,
            width: 2, height: 16, background: '#86efac',
            transform: 'translateX(-50%)',
          }}
          title="Ziel 13:25"
        />
        {/* Now marker */}
        <div
          style={{
            position: 'absolute', top: 4, left: `${nowPct}%`,
            width: 10, height: 10, borderRadius: '50%',
            background: statusColor, border: '2px solid #fff',
            transform: 'translateX(-50%) translateY(0)',
            boxShadow: `0 0 0 4px ${statusColor}33`,
            transition: 'left 1s linear',
          }}
        />
        {/* Labels */}
        <div
          className="lp-mono"
          style={{
            position: 'absolute', bottom: 0, left: 0,
            fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 600,
          }}
        >
          {cfgWorkday.start}
        </div>
        <div
          className="lp-mono"
          style={{
            position: 'absolute', bottom: 0, left: `${targetPct}%`,
            transform: 'translateX(-50%)',
            fontSize: 9, color: '#86efac', fontWeight: 700,
          }}
        >
          {cfgWorkday.target}
        </div>
        <div
          className="lp-mono"
          style={{
            position: 'absolute', bottom: 0, right: 0,
            fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 600,
          }}
        >
          {cfgWorkday.end}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   PALLET VIZ — ULTRA-MINIMALISTISCH
   Eine 3-px schmale vertikale Linie. Mehr nicht.
   Track = Farbe @ 12% Opacity (immer sichtbar)
   Fill  = Farbe @ 100% (von unten, smooth height transition)
   Label "P1" (optional) und "42%" als kleine Mono-Schrift darunter.
   Keine Animation außer height-transition. Keine Dekoration.
   ───────────────────────────────────────────────────────────────────────── */
function PalletBattery({ stats, label, size = 'md', highlight = false }) {
  if (!stats) return null;
  // Effektiver Fill = max(Volumen × Pack-Effizienz, Gewicht). Das ist die echte Auslastung.
  const pct = Math.min(100, Math.max(0, stats.fillPct * 100));
  const overflow = stats.isOverflow;
  // Minimalistisches Farbsystem: nur 3 Farben für Status, sonst neutrales Schwarz.
  const color = overflow
    ? '#dc2626'
    : pct >= 90
      ? T.amber
      : pct > 0
        ? T.text
        : T.textMuted;

  const cfg = size === 'sm'
    ? { W: 2, H: 26, fontLabel: 9, fontPct: 9, gap: 5 }
    : size === 'lg'
      ? { W: 3, H: 56, fontLabel: 11, fontPct: 12, gap: 7 }
      : { W: 2, H: 38, fontLabel: 10, fontPct: 10, gap: 6 };

  return (
    <div
      title={
        `${pct.toFixed(0)}% Auslastung${overflow ? ' · ÜBERLAUF' : ''}\n` +
        `Volumen: ${stats.totalM3.toFixed(2)} / ${stats.capacityM3.toFixed(2)} m³\n` +
        `Gewicht: ${(stats.weightPct * 100).toFixed(0)}% (${stats.totalWeightKg.toFixed(1)} kg)\n` +
        `${stats.totalCartons} Kartons` +
        (stats.hasUnknown ? `\n${stats.unmatchedCount}× geschätzt (nicht im Katalog)` : '')
      }
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: cfg.gap,
      }}
    >
      {/* Track + Fill — Geschwister, damit Fill voll opak bleibt */}
      <div
        style={{
          position: 'relative',
          width: cfg.W,
          height: cfg.H,
        }}
      >
        {/* Track (faint) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: T.borderStrong,
            opacity: 0.5,
            borderRadius: cfg.W,
          }}
        />
        {/* Fill */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: `${pct}%`,
            background: color,
            borderRadius: cfg.W,
            transition: 'height 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>

      {/* Label + % zusammen, ohne Schmuck */}
      {label !== undefined && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            lineHeight: 1,
          }}
        >
          {label !== null && (
            <span
              className="lp-mono"
              style={{
                fontSize: cfg.fontLabel,
                color: T.textSub,
                fontWeight: 500,
                letterSpacing: 0.2,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {label}
            </span>
          )}
          <span
            className="lp-mono"
            style={{
              fontSize: cfg.fontPct,
              color: pct > 0 ? color : T.textMuted,
              fontWeight: 600,
              letterSpacing: 0.1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {pct.toFixed(0)}
            <span style={{ opacity: 0.5, marginLeft: 1 }}>%</span>
          </span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Focus chips — group filtering / focus mode
   ───────────────────────────────────────────────────────────────────────── */
function FocusChips({ focusGroup, onChange, counts }) {
  const groups = [
    { id: null, label: 'Alle', count: counts.total },
    { id: 'thermorollen', label: 'Thermorollen', count: counts.thermorollen, color: CATEGORY_COLORS.thermorollen },
    { id: 'heipa', label: 'Heipa', count: counts.heipa, color: CATEGORY_COLORS.heipa },
    { id: 'veit', label: 'Veit', count: counts.veit, color: CATEGORY_COLORS.veit },
    { id: 'tachographenrollen', label: 'Tachographenrollen', count: counts.tachographenrollen, color: CATEGORY_COLORS.tachographenrollen },
    { id: 'produktion', label: 'Produktion', count: counts.produktion, color: CATEGORY_COLORS.produktion },
    { id: 'sonstige', label: 'Sonstige', count: counts.sonstige, color: T.textSub },
  ].filter((g) => g.id === null || g.count > 0);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {groups.map((g) => {
        const active = focusGroup === g.id;
        return (
          <button
            key={g.id ?? 'all'}
            onClick={() => onChange(g.id)}
            style={{
              padding: '6px 12px',
              background: active ? T.text : T.surface,
              color: active ? '#fff' : T.textSub,
              border: `1px solid ${active ? T.text : T.border}`,
              borderRadius: 7,
              fontSize: 11.5,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.12s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {g.color && (
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: g.color,
                  opacity: active ? 1 : 0.7,
                }}
              />
            )}
            {g.label}
            <span
              className="lp-mono"
              style={{
                fontSize: 10,
                opacity: 0.65,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {g.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Cmd+K spotlight search
   ───────────────────────────────────────────────────────────────────────── */
function SpotlightSearch({ open, items, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items.slice(0, 30);
    const lq = q.toLowerCase();
    return items
      .map((row) => {
        const it = row.item;
        const hay =
          (it.fnsku + ' ' + it.sku + ' ' + it.title + ' ' + (it.dimStr || '') +
            ' ' + (it.ean || '') + ' ' + (it.upc || '') + ' ' + row.palletId).toLowerCase();
        if (!hay.includes(lq)) return null;
        const score =
          (it.fnsku?.toLowerCase().includes(lq) ? 100 : 0) +
          (it.sku?.toLowerCase().includes(lq) ? 50 : 0) +
          (row.palletId?.toLowerCase().includes(lq) ? 30 : 0);
        return { row, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((x) => x.row);
  }, [q, items]);

  useEffect(() => {
    if (idx >= filtered.length) setIdx(0);
  }, [filtered, idx]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,17,14,0.45)',
        backdropFilter: 'blur(4px)',
        zIndex: 80,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(680px, calc(100vw - 32px))',
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 14,
          boxShadow: T.shadowLg,
          overflow: 'hidden',
          animation: 'lpSlideUp 0.18s ease forwards',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 18px',
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <span style={{ fontSize: 18, color: T.textMuted }}>⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIdx((v) => Math.min(filtered.length - 1, v + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIdx((v) => Math.max(0, v - 1));
              }
              if (e.key === 'Enter' && filtered[idx]) {
                onPick(filtered[idx]);
                onClose();
              }
            }}
            placeholder="Suche nach FNSKU, ASIN, SKU, Bezeichnung, Größe…"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: 16,
              fontFamily: 'inherit',
              color: T.text,
              background: 'transparent',
              letterSpacing: 0.1,
            }}
          />
          <kbd
            style={{
              fontSize: 10,
              color: T.textMuted,
              background: T.bg,
              padding: '3px 7px',
              borderRadius: 4,
              border: `1px solid ${T.border}`,
              fontFamily: 'DM Mono, monospace',
              letterSpacing: 0.4,
            }}
          >
            Esc
          </kbd>
        </div>

        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: T.textMuted,
                fontSize: 12.5,
              }}
            >
              Nichts gefunden
            </div>
          ) : (
            filtered.map((row, i) => (
              <button
                key={`${row.item.fnsku}-${i}`}
                onMouseEnter={() => setIdx(i)}
                onClick={() => {
                  onPick(row);
                  onClose();
                }}
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 18px',
                  background: i === idx ? T.bg : 'transparent',
                  border: 'none',
                  borderTop: `1px solid ${T.border}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  transition: 'background 0.08s ease',
                }}
              >
                <CodePill code={row.item.fnsku} codeType={row.item.codeType} />
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      color: T.text,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.item.title}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 10.5,
                      color: T.textSub,
                      marginTop: 2,
                    }}
                  >
                    {row.palletId}
                    {row.item.dimStr ? ` · ${row.item.dimStr}` : ''}
                    {row.item.rollen ? ` · ${row.item.rollen}R` : ''}
                  </span>
                </span>
                <span
                  className="lp-mono"
                  style={{
                    fontSize: 13,
                    color: T.text,
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {row.item.units}
                </span>
                <span style={{ fontSize: 11, color: T.textMuted }}>
                  {i === idx ? '↵' : ''}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  index,
  sequenceIndex,
  isActive,
  onClick,
  dimmed,
  loaded,
  onToggleLoaded,
  isReserveCandidate,
  isRepeatedUseItem,
  isEasy,
  lstStatus,
}) {
  return (
    <div
      onClick={onClick}
      className={`lp-row-hover${isActive ? ' lp-row-active' : ''}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 40px 1fr auto',
        alignItems: 'center',
        gap: 14,
        padding: '12px 16px',
        borderTop: `1px solid ${T.border}`,
        cursor: 'pointer',
        opacity: dimmed ? 0.32 : 1,
        background: loaded ? `${T.greenBg}` : undefined,
        transition: 'opacity 0.18s ease, background 0.18s ease',
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleLoaded?.();
        }}
        title={loaded ? 'Markierung «geladen» entfernen' : 'Als auf Palette geladen markieren'}
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: `1.5px solid ${loaded ? T.green : T.borderStrong}`,
          background: loaded ? T.green : T.surface,
          color: '#fff',
          cursor: 'pointer',
          fontSize: 13,
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          fontFamily: 'inherit',
          transition: 'all 0.15s ease',
        }}
      >
        {loaded ? '✓' : ''}
      </button>
      <div
        className="lp-mono"
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: T.textMuted,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {sequenceIndex != null
          ? String(sequenceIndex).padStart(2, '0')
          : String(index + 1).padStart(2, '0')}
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
            flexWrap: 'wrap',
          }}
        >
          <CodePill code={item.fnsku} codeType={item.codeType} />
          {item.dimStr && (
            <span
              className="lp-mono"
              style={{
                fontSize: 11.5,
                color: T.text,
                fontWeight: 500,
                letterSpacing: 0.2,
              }}
            >
              {item.dimStr}
            </span>
          )}
          {item.rollen != null && (
            <span
              className="lp-mono"
              style={{
                fontSize: 11.5,
                color: T.textSub,
                fontWeight: 500,
              }}
            >
              {item.rollen}&nbsp;Rollen
            </span>
          )}
          {item.category && item.category !== 'sonstige' && (
            <span
              style={{
                fontSize: 9.5,
                color: '#fff',
                background: CATEGORY_COLORS[item.category] || T.textSub,
                padding: '2px 6px',
                borderRadius: 4,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              {CATEGORY_LABELS[item.category]}
            </span>
          )}
          {isReserveCandidate && (
            <span
              title="Gleiches Format, andere Marke — Reserve für nächstes Mal"
              style={{
                fontSize: 9.5,
                color: '#fff',
                background: '#9333EA',
                padding: '2px 6px',
                borderRadius: 4,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              ⏸ Reserve
            </span>
          )}
          {isRepeatedUseItem && (
            <span
              title="Gleicher «Zu verwendender Artikel» kommt später nochmal vor"
              style={{
                fontSize: 9.5,
                color: '#fff',
                background: '#0EA5E9',
                padding: '2px 6px',
                borderRadius: 4,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              ↺ Wiederholt
            </span>
          )}
          {isEasy && (
            <span
              title="Wenig Einheiten, kommt nirgends mehrfach vor — leicht aufzuhebener Artikel"
              style={{
                fontSize: 9.5,
                color: '#fff',
                background: '#10B981',
                padding: '2px 6px',
                borderRadius: 4,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              ⚡ Leicht
            </span>
          )}
          {lstStatus === 'mit' && (
            <span
              title="Mit SEPA-Lastschrift-Aufdruck"
              style={{
                fontSize: 9.5,
                color: '#FBBF24',
                background: '#1F2937',
                padding: '2px 6px',
                borderRadius: 4,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                fontWeight: 800,
                border: '1px solid #FBBF24',
              }}
            >
              ✓ LST
            </span>
          )}
          {lstStatus === 'ohne' && (
            <span
              title="Ohne LST-Aufdruck"
              style={{
                fontSize: 9.5,
                color: '#6B7280',
                background: '#F3F4F6',
                padding: '2px 6px',
                borderRadius: 4,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                fontWeight: 700,
                border: '1px solid #D1D5DB',
              }}
            >
              ohne LST
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 13,
            color: T.text,
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {item.title}
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div
          className="lp-mono"
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: T.text,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: -0.3,
          }}
        >
          {item.units}
        </div>
        <div
          style={{
            fontSize: 9,
            color: T.textMuted,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            marginTop: 1,
            fontWeight: 500,
          }}
        >
          Einh.
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   FBA-COCKPIT — präsentables Header-Block direkt unter dem App-Header.
   Zeigt Shipment-ID, Datum, Ziel, Counts UND einen "Fokus starten"-CTA-Button.
   ───────────────────────────────────────────────────────────────────────── */
function FbaCockpit({ meta, palletCount, flatItems, einzelneSkuCount, onStartFokus, loadingPct }) {
  if (!meta) return null;
  const totalEinheiten = flatItems.reduce((s, r) => s + (r.item.units || 0), 0);
  const sn = meta.sendungsnummer || '—';
  const totalSkus = (meta.totalSkus ?? flatItems.length);

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #1F2937 0%, #111827 100%)',
        color: '#F9FAFB',
        borderRadius: 14,
        padding: '20px 24px',
        marginBottom: 16,
        boxShadow: '0 8px 24px rgba(17,24,39,0.18)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtiles tech-pattern Hintergrund */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.05,
          backgroundImage:
            'repeating-linear-gradient(45deg, transparent 0 12px, #fff 12px 13px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        {/* Shipment ID Block */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 9.5,
              color: '#9CA3AF',
              letterSpacing: 2,
              textTransform: 'uppercase',
              fontWeight: 700,
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                background: '#FBBF24',
                color: '#111827',
                padding: '2px 8px',
                borderRadius: 4,
                letterSpacing: 1.5,
                fontSize: 9.5,
                fontWeight: 800,
              }}
            >
              FBA
            </span>
            <span>Shipment</span>
            {meta.destination && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{meta.destination}</span>
              </>
            )}
            {meta.createdDate && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span className="lp-mono">{meta.createdDate}</span>
              </>
            )}
            {meta.createdTime && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span className="lp-mono">{meta.createdTime}</span>
              </>
            )}
          </div>
          <div
            className="lp-mono"
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: -0.3,
              color: '#F9FAFB',
              lineHeight: 1,
              marginBottom: 8,
            }}
            title="Sendungsnummer (Klicken zum Kopieren)"
            onClick={() => {
              if (navigator.clipboard) navigator.clipboard.writeText(sn);
            }}
          >
            {sn}
          </div>
          {/* Stats inline */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 18,
              fontSize: 11.5,
              color: '#D1D5DB',
              fontWeight: 500,
            }}
          >
            <span>
              <span className="lp-mono" style={{ color: '#F9FAFB', fontWeight: 700, fontSize: 14 }}>{palletCount}</span>{' '}
              <span style={{ opacity: 0.7 }}>{palletCount === 1 ? 'Palette' : 'Paletten'}</span>
            </span>
            <span>
              <span className="lp-mono" style={{ color: '#F9FAFB', fontWeight: 700, fontSize: 14 }}>{totalSkus}</span>{' '}
              <span style={{ opacity: 0.7 }}>SKU</span>
            </span>
            <span>
              <span className="lp-mono" style={{ color: '#F9FAFB', fontWeight: 700, fontSize: 14 }}>{(meta.totalUnits ?? totalEinheiten).toLocaleString('de-DE')}</span>{' '}
              <span style={{ opacity: 0.7 }}>Einheiten</span>
            </span>
            {einzelneSkuCount > 0 && (
              <span
                style={{
                  background: '#7C3AED',
                  padding: '2px 10px',
                  borderRadius: 4,
                  color: '#fff',
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  fontSize: 10.5,
                  textTransform: 'uppercase',
                }}
              >
                ⬢ {einzelneSkuCount} Einzelne SKU
              </span>
            )}
          </div>
        </div>

        {/* Fokus-Start CTA */}
        <button
          onClick={onStartFokus}
          style={{
            background: loadingPct >= 100 ? '#10B981' : '#FBBF24',
            color: '#111827',
            border: 'none',
            borderRadius: 12,
            padding: '14px 22px',
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: 0.6,
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 4px 14px rgba(251,191,36,0.35)',
            transition: 'all 0.2s ease',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(251,191,36,0.45)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(251,191,36,0.35)';
          }}
          title="Vollbildmodus für sequenzielles Be-Etikettieren der Paletten"
        >
          <span style={{ fontSize: 18 }}>▶</span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
            <span style={{ fontSize: 9.5, opacity: 0.8, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
              {loadingPct >= 100 ? 'Erledigt' : 'Schritt für Schritt'}
            </span>
            <span style={{ fontSize: 16, fontWeight: 800 }}>Fokus-Modus starten</span>
          </span>
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   EINZELNE-SKU-SECTION
   Fix unter den regulären Paletten. Immer sichtbar, von Focus-Filter
   ausgenommen. Zeigt für jeden Einzelne-SKU-Artikel sein Ziel-Pallet
   (oder "Nicht verteilt") als Badge.
   ───────────────────────────────────────────────────────────────────────── */
function EinzelneSkuSection({ items, distribution, onPalletClick }) {
  if (!items || items.length === 0) return null;

  // Bündele Items nach Ziel-Palette für schnellen Überblick
  const grouped = {};
  const unassigned = [];
  for (const it of items) {
    const key = it.fnsku || it.sku || it.title;
    const target = distribution.assignments[key];
    if (target) {
      if (!grouped[target]) grouped[target] = [];
      grouped[target].push(it);
    } else {
      unassigned.push(it);
    }
  }

  const ACCENT = '#7C3AED'; // dezentes lila — passt zur "Sonderkategorie"
  const ACCENT_BG = T.purpleBg;

  return (
    <div
      style={{
        background: T.surface,
        borderRadius: 12,
        border: `1.5px solid ${ACCENT}`,
        boxShadow: T.shadowSm,
        overflow: 'hidden',
        position: 'relative',
      }}
      className="lp-card-fade"
    >
      {/* Header */}
      <header
        style={{
          padding: '14px 18px',
          background: `linear-gradient(135deg, ${ACCENT_BG} 0%, ${T.surface} 100%)`,
          borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 9.5, fontWeight: 700, letterSpacing: 1.5,
            textTransform: 'uppercase',
            padding: '3px 8px', borderRadius: 4,
            background: ACCENT, color: '#fff',
          }}
        >
          ⬢ Einzelne SKU
        </span>
        <div>
          <div
            style={{
              fontSize: 9.5, color: T.textMuted,
              letterSpacing: 1.5, textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            Auto-Verteilung
          </div>
          <div
            style={{
              fontSize: 14, fontWeight: 600, color: T.text,
              letterSpacing: -0.2,
            }}
          >
            {items.length} Artikel · {Object.keys(grouped).length} Ziel-Paletten
            {unassigned.length > 0 && (
              <span style={{ color: T.amber, marginLeft: 8 }}>
                · {unassigned.length} nicht verteilt
              </span>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 10.5, color: T.textSub,
            fontStyle: 'italic',
            maxWidth: 360, lineHeight: 1.4,
          }}
        >
          Best-Fit-Verteilung auf Paletten mit ≥2 Artikeln · Höhe ≤ 165.6 cm
        </span>
      </header>

      {/* Items list */}
      <div>
        {items.map((it, idx) => {
          const key = it.fnsku || it.sku || it.title;
          const target = distribution.assignments[key];
          const reason = distribution.reasons[key];
          const breakdown = distribution.reasonsBreakdown?.[key];
          const matchTags = breakdown ? [
            breakdown.useItemMatch && '🔗 useItem',
            breakdown.formatMatch && '⊞ Format',
            breakdown.brandMatch && '★ Marke',
            breakdown.categoryMatch && '◐ Kategorie',
            breakdown.categoryConflict && '⚠ Kategorie-Konflikt',
          ].filter(Boolean) : [];
          const matchTooltip = breakdown ? [
            `Zugeordnet zu ${target}`,
            breakdown.useItemMatch && '✓ useItem-Match (gleicher Katalog-Artikel auf Palette)',
            breakdown.formatMatch && '✓ Format-Match (gleiche Rollen + Maße)',
            breakdown.brandMatch && '✓ Marken-Match',
            breakdown.categoryMatch && '✓ Kategorie-Match',
            breakdown.categoryConflict && '⚠ Kategorie-Konflikt (kein passender Slot)',
            `Sweet-Spot-Score: ${breakdown.fillScore}, Gewichts-Score: ${breakdown.weightScore}`,
            breakdown.source === 'group-useItem' && 'Gruppe gemeinsam mit anderen useItem-Geschwistern platziert',
          ].filter(Boolean).join('\n') : `Klicken: zur ${target} springen`;
          const v = itemVolumeCm3(it);
          const eskMeta = it.einzelneSku || {};
          return (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 1fr auto auto',
                alignItems: 'center',
                gap: 12,
                padding: '12px 18px',
                borderTop: idx > 0 ? `1px solid ${T.border}` : 'none',
              }}
              className="lp-row-hover"
            >
              {/* Index */}
              <span
                className="lp-mono"
                style={{
                  fontSize: 11, color: T.textMuted,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {String(idx + 1).padStart(2, '0')}
              </span>

              {/* Title + Meta */}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5, color: T.text, fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', marginBottom: 3,
                  }}
                  title={it.title}
                >
                  {it.title}
                </div>
                <div
                  style={{
                    display: 'flex', gap: 8, alignItems: 'center',
                    fontSize: 10.5, color: T.textSub, flexWrap: 'wrap',
                    fontFamily: 'DM Mono, monospace',
                  }}
                >
                  {/* FNSKU als hervorgehobenes Code-Pill */}
                  <span
                    title="FNSKU — eindeutiger Artikel-Code"
                    style={{
                      background: '#F5F3FF',
                      color: '#7C3AED',
                      padding: '2px 7px',
                      borderRadius: 4,
                      border: '1px solid #DDD6FE',
                      fontWeight: 700,
                      letterSpacing: 0.4,
                    }}
                  >
                    {it.fnsku}
                  </span>
                  {it.dimStr && <span style={{ color: T.textMuted }}>{it.dimStr}</span>}
                  <span style={{ color: T.textMuted }}>
                    ({eskMeta.packsPerCarton}×{eskMeta.itemsPerPack} {eskMeta.contentLabel})
                  </span>
                  <span style={{ color: T.text, fontWeight: 600 }}>
                    {it.units} Einh = {eskMeta.cartonsCount}× Karton
                  </span>
                  {!v.matched && (
                    <span style={{ color: T.amber }}>≈ geschätzt</span>
                  )}
                </div>
              </div>

              {/* Box-info */}
              <div
                style={{
                  fontSize: 10, color: T.textMuted,
                  fontFamily: 'DM Mono, monospace',
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
                title={`Karton-Maße ${v.boxDims.join('×')} cm · Gewicht ${v.totalKg.toFixed(1)} kg`}
              >
                <div>{v.boxDims.map((d) => d.toFixed(d % 1 === 0 ? 0 : 1)).join('×')} cm</div>
                <div>{v.totalKg.toFixed(1)} kg</div>
              </div>

              {/* Destination Badge */}
              {target ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <button
                    onClick={() => onPalletClick(target)}
                    style={{
                      padding: '6px 12px',
                      background: T.accent,
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'DM Mono, monospace',
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: 0.3,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                    }}
                    className="lp-btn-hover"
                    title={matchTooltip}
                  >
                    → {target}
                  </button>
                  {matchTags.length > 0 && (
                    <div
                      title={matchTooltip}
                      style={{
                        display: 'flex', gap: 4, fontSize: 9,
                        color: T.textMuted, fontWeight: 600,
                        letterSpacing: 0.2, whiteSpace: 'nowrap',
                      }}
                    >
                      {matchTags.map((t, i) => (
                        <span key={i} style={{
                          padding: '1px 5px',
                          background: t.startsWith('⚠') ? T.amberBg : T.bg,
                          color: t.startsWith('⚠') ? T.amber : T.textSub,
                          border: `1px solid ${t.startsWith('⚠') ? T.amber + '44' : T.border}`,
                          borderRadius: 3,
                        }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span
                  title={reason || 'Konnte auf keine Palette platziert werden'}
                  style={{
                    padding: '6px 12px',
                    background: T.amberBg,
                    color: T.amber,
                    border: `1px solid ${T.amber}33`,
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    letterSpacing: 0.3,
                    whiteSpace: 'nowrap',
                  }}
                >
                  ⚠ Nicht verteilt
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {Object.keys(grouped).length > 0 && (
        <div
          style={{
            padding: '10px 18px',
            background: T.bg,
            borderTop: `1px solid ${T.border}`,
            display: 'flex', flexWrap: 'wrap', gap: 12,
            fontSize: 10.5, color: T.textSub,
          }}
        >
          <span style={{ color: T.textMuted, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 9.5 }}>
            Verteilung:
          </span>
          {Object.entries(grouped).map(([palletId, list]) => (
            <button
              key={palletId}
              onClick={() => onPalletClick(palletId)}
              style={{
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 5, padding: '3px 8px',
                cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 10.5, color: T.textSub, fontWeight: 600,
              }}
              className="lp-btn2-hover"
            >
              <span className="lp-mono">{palletId}</span>
              <span style={{ marginLeft: 5, color: T.textMuted }}>{list.length}×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PalletCard({
  pallet,
  palletIdx,
  startSeqIndex,
  sequenceMode,
  activeItemId,
  onItemClick,
  volumeStats,
  focusGroup,
  loadedSet,
  onToggleLoaded,
  highlight,
  reserveFnskus,
  repeatedUseItems,
  eskuExtras = [],
}) {
  const totalUnits = pallet.items.reduce((s, i) => s + (i.units || 0), 0);
  const loadedCount = pallet.items.filter((it) =>
    loadedSet?.has(`${pallet.id}::${it.fnsku}`)
  ).length;
  const palletProgressPct =
    pallet.items.length > 0 ? (loadedCount / pallet.items.length) * 100 : 0;
  const isPalletDone = loadedCount === pallet.items.length && pallet.items.length > 0;

  return (
    <section
      className="lp-card-fade"
      style={{
        background: T.surface,
        border: `1px solid ${highlight ? T.blue : isPalletDone ? T.green : T.border}`,
        borderRadius: 14,
        boxShadow: highlight ? `0 0 0 3px ${T.blueBg}` : T.shadowSm,
        overflow: 'hidden',
        animationDelay: `${palletIdx * 60}ms`,
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      <header
        style={{
          background: isPalletDone
            ? `linear-gradient(180deg, ${T.greenBg}, ${T.bg})`
            : T.bg,
          padding: '14px 18px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div
          className="lp-mono"
          style={{
            fontSize: 11,
            color: T.textMuted,
            letterSpacing: 1.5,
            fontWeight: 500,
          }}
        >
          PALETTE {String(pallet.number).padStart(2, '0')}
        </div>
        <div
          className="lp-mono"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: T.text,
            letterSpacing: -0.2,
          }}
        >
          {pallet.id}
        </div>

        {isPalletDone && (
          <span
            style={{
              padding: '3px 9px',
              background: T.green,
              color: '#fff',
              borderRadius: 5,
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
            }}
          >
            ✓ Geladen
          </span>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {pallet.hasFourSideWarning && (
            <WarningBadge>4 Seiten Aufkleber</WarningBadge>
          )}
          {volumeStats && <PalletBattery stats={volumeStats} size="sm" label={null} highlight={highlight} />}
          <span
            title="Geschätzte Bearbeitungsdauer dieser Palette"
            style={{
              padding: '4px 10px',
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              fontSize: 10.5,
              color: T.textSub,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              fontFamily: 'DM Mono, monospace',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            ⏱ ~{formatDurationShort(palletEstimateSeconds(pallet, eskuExtras))}
          </span>
          <span
            style={{
              padding: '4px 10px',
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              fontSize: 10.5,
              color: T.textSub,
              fontWeight: 500,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {loadedCount}/{pallet.items.length} SKU
          </span>
          <span
            style={{
              padding: '4px 10px',
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              fontSize: 10.5,
              color: T.textSub,
              fontWeight: 500,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {totalUnits} Einh.
          </span>
        </div>
      </header>

      {/* progress bar */}
      <div style={{ height: 3, background: T.bg, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${palletProgressPct}%`,
            background: `linear-gradient(90deg, ${T.green}88, ${T.green})`,
            transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>

      {/* Volume cockpit — Donut + Per-Artikel-Verteilung */}
      {volumeStats && (
        <div style={{ padding: '14px 16px 4px' }} className="lp-no-print">
          <PalletVolumeCard stats={volumeStats} />
        </div>
      )}

      <div>
        {pallet.items.map((item, i) => {
          const isDimmed = focusGroup && item.category !== focusGroup;
          return (
            <ItemRow
              key={item.fnsku + i}
              item={item}
              index={i}
              sequenceIndex={sequenceMode ? startSeqIndex + i : null}
              isActive={activeItemId === item.fnsku}
              onClick={() => onItemClick(item)}
              dimmed={isDimmed}
              loaded={loadedSet?.has(`${pallet.id}::${item.fnsku}`)}
              onToggleLoaded={() => onToggleLoaded?.(`${pallet.id}::${item.fnsku}`)}
              isReserveCandidate={reserveFnskus?.has(item.fnsku)}
              isRepeatedUseItem={repeatedUseItems?.has(item.fnsku)}
              isEasy={isLeichtAbzuholen(item, repeatedUseItems)}
              lstStatus={itemHasLst(item)}
            />
          );
        })}
      </div>
    </section>
  );
}

function SequenceSidebar({
  flatItems,
  sequenceMode,
  activeItemId,
  onItemClick,
  sortedPallets,
  palletVolumes,
  loadedSet,
  onPalletClick,
  orderEstimateSec,
}) {
  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        boxShadow: T.shadowSm,
        position: 'sticky',
        top: 80,
        alignSelf: 'flex-start',
        maxHeight: 'calc(100vh - 100px)',
        overflowY: 'auto',
        padding: '18px 16px',
      }}
    >
      {/* Pallet-Füllung — kompakter Mini-Charts */}
      {sortedPallets && sortedPallets.length > 0 && (
        <>
          <div style={{
            fontSize: 9.5, color: T.textMuted, letterSpacing: 1.4,
            fontWeight: 700, textTransform: 'uppercase',
            marginBottom: 12,
          }}>
            Paletten-Füllung
          </div>
          <div style={{
            display: 'flex', gap: 6, flexWrap: 'wrap',
            marginBottom: 14, paddingBottom: 14,
            borderBottom: `1px solid ${T.border}`,
          }}>
            {sortedPallets.map((p) => {
              const stats = palletVolumes?.[p.id];
              if (!stats) return null;
              const loadedCount = p.items.filter((it) => loadedSet?.has(it.fnsku)).length;
              const isDone = loadedCount === p.items.length && p.items.length > 0;
              return (
                <button
                  key={p.id}
                  onClick={() => onPalletClick && onPalletClick(p.id)}
                  title={`${p.id} · ${(stats.fillPct * 100).toFixed(0)}%${isDone ? ' · fertig' : ''}`}
                  className="lp-row-hover"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '4px 6px',
                    borderRadius: 6,
                    cursor: onPalletClick ? 'pointer' : 'default',
                    fontFamily: 'inherit',
                  }}
                >
                  <PalletBattery
                    stats={stats}
                    size="sm"
                    label={`P${p.number}`}
                    highlight={isDone}
                  />
                </button>
              );
            })}
          </div>
          {orderEstimateSec ? (
            <div style={{
              marginBottom: 14,
              padding: '9px 12px',
              background: T.accentBg,
              border: `1px solid rgba(91,98,216,0.18)`,
              borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 13, color: T.accent }}>⏱</span>
              <span style={{
                fontSize: 9.5, color: T.accent,
                letterSpacing: 1.2, textTransform: 'uppercase',
                fontWeight: 700,
              }}>Auftrag</span>
              <span className="lp-mono" style={{
                marginLeft: 'auto',
                fontSize: 13, fontWeight: 700,
                color: T.accent,
                fontVariantNumeric: 'tabular-nums',
              }}>
                ~{formatDurationShort(orderEstimateSec)}
              </span>
            </div>
          ) : null}
        </>
      )}

      <div style={{
        fontSize: 9.5, color: T.textMuted, letterSpacing: 1.4,
        fontWeight: 700, textTransform: 'uppercase',
        marginBottom: 4,
      }}>
        Reihenfolge
      </div>
      <div style={{
        fontSize: 12.5, color: T.textSub, fontWeight: 500,
        marginBottom: 12,
      }}>
        {sequenceMode ? 'Globale Nummerierung' : 'Nach Paletten'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {flatItems.map((row, idx) => (
          <button
            key={`${row.item.fnsku}-${idx}`}
            onClick={() => onItemClick(row.item)}
            className={activeItemId === row.item.fnsku ? '' : 'lp-row-hover'}
            style={{
              display: 'grid',
              gridTemplateColumns: '22px 1fr auto',
              gap: 10,
              alignItems: 'center',
              padding: '7px 8px',
              border: 'none',
              background:
                activeItemId === row.item.fnsku ? T.accentBg : 'transparent',
              boxShadow: activeItemId === row.item.fnsku
                ? `inset 2px 0 0 ${T.accent}` : 'none',
              borderRadius: 6,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
              transition: 'background 0.12s ease',
            }}
          >
            <span
              className="lp-mono"
              style={{
                fontSize: 11,
                color: T.textMuted,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {String(idx + 1).padStart(2, '0')}
            </span>
            <span style={{ minWidth: 0 }}>
              <span
                className="lp-mono"
                style={{
                  display: 'block',
                  fontSize: 11,
                  color: T.text,
                  fontWeight: 500,
                  letterSpacing: 0.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.item.fnsku}
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: 10,
                  color: T.textSub,
                  marginTop: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.item.dimStr || '—'}
                {row.item.rollen ? ` · ${row.item.rollen}R` : ''}
              </span>
            </span>
            <span
              className="lp-mono"
              style={{
                fontSize: 11,
                color: T.textSub,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {row.item.units}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function DetailPanel({ item, onClose }) {
  if (!item) return null;
  return (
    <div
      className="lp-detail-slide"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(680px, calc(100vw - 48px))',
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        boxShadow: T.shadowLg,
        padding: '20px 24px',
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          marginBottom: 12,
        }}
      >
        <CodePill code={item.fnsku} codeType={item.codeType} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="lp-mono"
            style={{
              fontSize: 11,
              color: T.textMuted,
              marginBottom: 3,
            }}
          >
            {item.sku}
          </div>
          <div
            style={{
              fontSize: 14,
              color: T.text,
              fontWeight: 500,
              lineHeight: 1.4,
            }}
          >
            {item.title}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: T.textMuted,
            fontSize: 18,
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
            fontFamily: 'inherit',
          }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          padding: '12px 0',
          borderTop: `1px solid ${T.border}`,
        }}
      >
        <DetailField label="ASIN" value={item.asin} mono />
        <DetailField
          label={item.ean ? 'EAN' : 'UPC'}
          value={item.ean || item.upc || '—'}
          mono
        />
        <DetailField label="Größe" value={item.dimStr || '—'} mono />
        <DetailField
          label="Rollen"
          value={item.rollen != null ? `${item.rollen}` : '—'}
          mono
        />
        <DetailField label="Einheiten" value={String(item.units)} mono accent />
        <DetailField label="Zustand" value={item.condition || '—'} />
        <DetailField label="Vorbereitung" value={item.prep || '—'} />
        <DetailField label="Etikettierung" value={item.labeler || '—'} />
      </div>

      {item.useItem && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 12px',
            background: T.bg,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            fontSize: 12,
            color: T.textSub,
          }}
        >
          <span style={{ fontWeight: 500, color: T.text, marginRight: 6 }}>
            Zu verwenden:
          </span>
          <span className="lp-mono">{item.useItem}</span>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value, mono, accent }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: T.textMuted,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          marginBottom: 3,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        className={mono ? 'lp-mono' : ''}
        style={{
          fontSize: 12.5,
          color: accent ? T.text : T.text,
          fontWeight: accent ? 600 : 400,
          letterSpacing: mono ? 0.2 : 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Print mode — label sheet + sequence sidebar
   ───────────────────────────────────────────────────────────────────────── */
function PrintLayout({ flatItems, meta, onExitPrint }) {
  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <div
        className="lp-no-print"
        style={{
          padding: '14px 22px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          background: T.surface,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: T.text,
            letterSpacing: 0.2,
          }}
        >
          Print preview
        </div>
        <span
          style={{ fontSize: 12, color: T.textMuted, letterSpacing: 0.4 }}
        >
          {meta?.sendungsnummer || '—'} · {flatItems.length} Etiketten
        </span>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={() => window.print()}>
          ⎙ Drucken
        </Btn>
        <Btn variant="secondary" onClick={onExitPrint}>
          Назад
        </Btn>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 240px',
          gap: 24,
          padding: 24,
          maxWidth: 1100,
          margin: '0 auto',
        }}
      >
        {/* Labels grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 10,
          }}
        >
          {flatItems.map((row, idx) => (
            <div
              key={`${row.item.fnsku}-print-${idx}`}
              className="lp-print-page"
              style={{
                border: `1px solid #E0DEDA`,
                borderRadius: 10,
                padding: '14px 16px',
                background: '#fff',
                pageBreakInside: 'avoid',
                breakInside: 'avoid',
                boxShadow: T.shadowSm,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <span
                  className="lp-mono"
                  style={{
                    fontSize: 9,
                    color: T.textMuted,
                    letterSpacing: 1.4,
                    fontWeight: 600,
                  }}
                >
                  №{String(idx + 1).padStart(3, '0')}
                </span>
                <span
                  className="lp-mono"
                  style={{
                    fontSize: 9,
                    color: T.textMuted,
                    letterSpacing: 0.6,
                  }}
                >
                  {row.palletId}
                </span>
              </div>

              <div
                className="lp-mono"
                style={{
                  fontSize: 22,
                  fontWeight: 500,
                  color: T.text,
                  letterSpacing: -0.5,
                  marginBottom: 10,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {row.item.fnsku}
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  marginBottom: 8,
                  alignItems: 'baseline',
                }}
              >
                {row.item.dimStr && (
                  <span
                    className="lp-mono"
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: T.text,
                    }}
                  >
                    {row.item.dimStr}
                  </span>
                )}
                {row.item.rollen != null && (
                  <span
                    style={{
                      fontSize: 12,
                      color: T.textSub,
                      fontWeight: 500,
                    }}
                  >
                    {row.item.rollen} Rollen
                  </span>
                )}
                <div style={{ flex: 1 }} />
                <span
                  className="lp-mono"
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: T.text,
                  }}
                >
                  {row.item.units} ×
                </span>
              </div>

              <div
                style={{
                  fontSize: 10,
                  color: T.textSub,
                  lineHeight: 1.4,
                  marginBottom: 6,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {row.item.title}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 9,
                  color: T.textMuted,
                  paddingTop: 6,
                  borderTop: `1px solid ${T.border}`,
                  letterSpacing: 0.4,
                }}
              >
                <span className="lp-mono">{row.item.asin}</span>
                <span className="lp-mono">
                  {row.item.ean || row.item.upc || ''}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Sticky sequence sidebar */}
        <div
          style={{
            position: 'sticky',
            top: 16,
            alignSelf: 'flex-start',
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            background: '#fff',
            padding: 16,
            maxHeight: 'calc(100vh - 80px)',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: T.textMuted,
              letterSpacing: 1.6,
              fontWeight: 600,
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            Vollständige Reihenfolge
          </div>
          {flatItems.map((row, idx) => (
            <div
              key={`seq-${row.item.fnsku}-${idx}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px 1fr auto',
                gap: 8,
                padding: '5px 0',
                borderBottom: `1px solid ${T.border}`,
                fontSize: 10,
              }}
            >
              <span
                className="lp-mono"
                style={{ color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}
              >
                {String(idx + 1).padStart(2, '0')}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  className="lp-mono"
                  style={{
                    color: T.text,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.item.fnsku}
                </div>
                <div style={{ color: T.textSub, fontSize: 9 }}>
                  {row.item.dimStr || '—'}
                  {row.item.rollen ? ` · ${row.item.rollen}R` : ''}
                </div>
              </div>
              <span
                className="lp-mono"
                style={{
                  color: T.text,
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 500,
                }}
              >
                {row.item.units}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Format-grouping helpers
   Gruppiert Artikel nach Format = (rollen, dim.w, dim.h). Innerhalb einer
   Gruppe nach Stückzahl (units) absteigend sortiert.
   formatSignature ist oben definiert (für detectReserveCandidates).
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Каждый "экран" Fokus-Modus = одна палета. Внутри палеты артиклы
 * сгруппированы по формату (одинаковый dim+rollen → одна format-группа).
 * Перейти к следующей палете нельзя, пока текущая не закрыта.
 */
function buildPalletScreens(sortedPallets, einzelneSkuItems = [], distribution = null) {
  return sortedPallets.map((pallet, idx) => {
    const fmtMap = new Map();
    pallet.items.forEach((item) => {
      const sig = formatSignature(item);
      if (!fmtMap.has(sig)) {
        fmtMap.set(sig, {
          signature: sig,
          rollen: item.rollen,
          dim: item.dim,
          dimStr: item.dimStr,
          articles: [],
        });
      }
      fmtMap.get(sig).articles.push({
        palletId: pallet.id,
        palletNumber: pallet.number,
        item,
      });
    });

    // ─── Einzelne-SKU-Items für DIESE Palette ───
    // Smart-Grouping: Wenn ein ESKU dasselbe Format hat wie eine bereits
    // existierende Format-Gruppe auf der Palette, mischen wir das ESKU-Item
    // IN diese Gruppe → der Picker sieht 50r-57×35-Karton + ESKU 50r-57×35
    // direkt nebeneinander. Nur ESKUs ohne passende Format-Gruppe landen in
    // einer separaten "Einzelne SKU"-Sektion am Ende.
    const eskuForThisPallet = (einzelneSkuItems || []).filter((esku) => {
      if (!distribution) return false;
      const key = esku.fnsku || esku.sku || esku.title;
      return distribution.assignments[key] === pallet.id;
    });

    const orphanEskus = [];
    eskuForThisPallet.forEach((esku) => {
      const sig = formatSignature(esku);
      if (fmtMap.has(sig)) {
        // Format passt → in existierende Gruppe einsortieren
        fmtMap.get(sig).articles.push({
          palletId: pallet.id,
          palletNumber: pallet.number,
          item: esku,
          mergedEsku: true,    // Render-Hint: separater visueller Marker
        });
      } else {
        orphanEskus.push(esku);
      }
    });

    const formatGroups = Array.from(fmtMap.values());
    formatGroups.forEach((g) => {
      // Innerhalb einer Gruppe: zuerst nach units DESC, ESKU-Items als
      // letzte (so dass der Picker erst Standard-Kartons abarbeitet).
      g.articles.sort((a, b) => {
        const aEsku = a.item?.isEinzelneSku ? 1 : 0;
        const bEsku = b.item?.isEinzelneSku ? 1 : 0;
        if (aEsku !== bEsku) return aEsku - bEsku;
        return (b.item.units || 0) - (a.item.units || 0);
      });
      g.totalUnits = g.articles.reduce((s, r) => s + (r.item.units || 0), 0);
      g.articleCount = g.articles.length;
      g.hasEinzelneSku = g.articles.some((r) => r.item?.isEinzelneSku);
    });
    formatGroups.sort((a, b) => {
      if ((b.rollen || 0) !== (a.rollen || 0))
        return (b.rollen || 0) - (a.rollen || 0);
      return b.totalUnits - a.totalUnits;
    });

    // Verbleibende ESKUs ohne Format-Match → eigene Gruppe am Ende.
    let einzelneSkuGroup = null;
    if (orphanEskus.length > 0) {
      einzelneSkuGroup = {
        signature: 'einzelne-sku',
        isEinzelneSku: true,
        articles: orphanEskus.map((it) => ({
          palletId: pallet.id,
          palletNumber: pallet.number,
          item: it,
        })),
        totalUnits: orphanEskus.reduce((s, it) => s + (it.units || 0), 0),
        articleCount: orphanEskus.length,
        dimStr: 'Einzelne SKU',
        rollen: null,
      };
      formatGroups.push(einzelneSkuGroup);
    }

    // Alle Items inkl. Einzelne-SKU für Counts & "fertig"-Logik
    const allItems = [
      ...pallet.items,
      ...eskuForThisPallet,
    ];

    return {
      pallet,
      palletIdx: idx,
      palletId: pallet.id,
      palletNumber: pallet.number,
      formatGroups,
      itemCount: allItems.length,
      totalUnits: allItems.reduce((s, i) => s + (i.units || 0), 0),
      hasFourSideWarning: pallet.hasFourSideWarning,
      // Wichtig für FokusModus:
      allItems,                                     // pallet.items + zugewiesene Einzelne-SKU
      einzelneSkuItems: eskuForThisPallet,
    };
  });
}

/**
 * Извлекает короткое немецкое название из полного титла — с продвинутыми
 * правилами для специфических групп товаров (по спеку пользователя).
 *
 * Правила:
 *  • Klebeband / Packband / Paketband  → "Klebeband (X)" wo X = количество
 *  • Heipa-Thermorolle                 → "Heipa Thermorolle (X Stück) D×H×B"
 *  • Sandsack / Sandsäcke              → "Sandsäcke L×W (count)"
 *  • Kernöl / Steirisches Gourmet      → "Kernöl (1 l)"
 *  • Tacho LKW                         → "Tachorollen LKW - Xer Pack"
 *  • Big Bag                           → "Big Bag dim"
 *  • Thermo / Veit                     → "Thermorolle/Veit-Rolle dim ± mit LST"
 */
function shortGermanName(item) {
  const t = item.title || '';
  const tl = t.toLowerCase();
  const dim = item.dimStr || '';

  // ── Klebeband / Packband / Paketband ────────────────────────────────
  if (/klebeband|paketband|packband/i.test(tl)) {
    // Letzte Klammer mit Zahl im Titel: "(1)", "(6)", "(12)", "(36)"
    const m = t.match(/\((\d{1,3})\)\s*$/);
    const count = m ? m[1] : null;
    // Marken-Präfix erhalten falls vorhanden ("TK THERMALKING")
    const brand = /tk\s*thermalking/i.test(tl) ? 'TK THERMALKING ' : '';
    return `${brand}Klebeband${count ? ` (${count})` : ''}`;
  }

  // ── Heipa Thermorolle ───────────────────────────────────────────────
  if (item.isHeipa) {
    // Stück-Count: "(5 Stück)", "(50 Stück)" oder analog
    const stk = t.match(/\((\d+)\s*(?:Stück|Stk|Rollen?)\)/i);
    // Maße: "58 x 64 x 12 mm" oder "58x64x12 mm"
    const mass = t.match(/(\d+)\s*[x×х]\s*(\d+)\s*[x×х]\s*(\d+)\s*mm/i);
    const stkPart = stk ? ` (${stk[1]} Stück)` : '';
    const massPart = mass ? ` ${mass[1]}×${mass[2]}×${mass[3]} mm` : '';
    return `Heipa Thermorolle${stkPart}${massPart}`.trim();
  }

  // ── Sandsäcke ───────────────────────────────────────────────────────
  if (/sandsack|sandsäcke/i.test(tl)) {
    // Maße: "(40 x 60 cm)" oder "(90 × 90 cm)"
    const mass = t.match(/\((\d+)\s*[x×х]\s*(\d+)\s*cm\)/i);
    // Anzahl: zweite Klammer "(50)" oder "(20)"
    const cnt = t.match(/\((\d+)\)\s*$/);
    const massPart = mass ? `${mass[1]} × ${mass[2]} cm` : '';
    const cntPart = cnt ? ` (${cnt[1]} Stk)` : '';
    return `Sandsäcke${massPart ? ` ${massPart}` : ''}${cntPart}`.trim();
  }

  // ── Kernöl / Steirisches Gourmet ────────────────────────────────────
  if (/kernöl|kernoel|steirisches\s+gourmet/i.test(tl)) {
    // Volumen: "(1 l)", "(0.5 l)", "(500 ml)"
    const vol = t.match(/\((\d+(?:[\.,]\d+)?)\s*(l|ml)\)/i);
    return vol ? `Kernöl (${vol[1]} ${vol[2]})` : 'Kernöl';
  }

  // ── Tachorollen LKW ─────────────────────────────────────────────────
  if (item.isTacho) {
    // "60er Pack", "15er Pack", "12 Stk"
    const pack = t.match(/(\d+)\s*er\s*Pack/i) || t.match(/\((\d+)\s*Rollen\)/i)
                  || t.match(/(\d+)\s*Stk/i);
    return `Tachorollen LKW${pack ? ` - ${pack[1]}er Pack` : ''}`;
  }

  // ── Big Bag ─────────────────────────────────────────────────────────
  if (/big\s*bag/i.test(tl)) {
    return `Big Bag${dim ? ` ${dim}` : ''}`.trim();
  }

  // ── Thermorolle (default) ───────────────────────────────────────────
  if (item.isThermo) {
    if (/lastschrift|\blst\b|sepa/i.test(tl)) {
      return `Thermorolle ${dim} mit LST`.trim();
    }
    if (/unbedruckt|ohne\s+aufdruck/i.test(tl)) {
      return `Thermorolle ${dim} unbedruckt`.trim();
    }
    return `Thermorolle ${dim}`.trim();
  }

  // ── Veit ────────────────────────────────────────────────────────────
  if (item.isVeit) {
    return `Veit-Rolle ${dim}`.trim();
  }

  // Fallback — первые 4 слова
  const words = t.split(/\s+/).slice(0, 4).join(' ');
  return words || 'Artikel';
}

/* ─────────────────────────────────────────────────────────────────────────
   itemHasLst — Hilfsfunktion: enthält der Artikel "Lastschrift"-Aufdruck?
   Verwendet für mit-LST/Ohne-LST-Badge.
   Nicht anwendbar auf 80×… Formate (das sind Quittungs-Rollen, nicht EC).
   ───────────────────────────────────────────────────────────────────────── */
function itemHasLst(item) {
  if (!item || !item.title) return null;
  // 80×... Formate ausschließen (LST irrelevant)
  const dim = item.dimStr || '';
  if (/^\s*80\s*[×x]/i.test(dim)) return null;
  // Nur Thermo/Heipa/Veit
  if (!item.isThermo && !item.isHeipa && !item.isVeit) return null;
  const t = item.title.toLowerCase();
  if (/lastschrift|\blst\b|sepa[\s-]?lastschrift/i.test(t)) return 'mit';
  // Wenn explizit "ohne LST" oder unbedruckt
  if (/ohne\s+lst|ohne\s+lastschrift|unbedruckt|ohne\s+aufdruck/i.test(t)) return 'ohne';
  // Default Thermo ohne LST-Hinweis: "ohne"
  return 'ohne';
}

/* ─────────────────────────────────────────────────────────────────────────
   isLeichtAbzuholen — Markierung für leicht aufzuhebende Artikel.
   Bedingungen:
     • Artikel kommt nirgends mehrfach vor (nicht "Wiederholt"!)
     • units ≤ 20 (Standard)
     • EXCEPT 80×80 / 80×63 / 80×60 / ÖKO → threshold ≤ 5
     • Klebeband → threshold ≤ 6
   ───────────────────────────────────────────────────────────────────────── */
function isLeichtAbzuholen(item, repeatedFnskus) {
  if (!item || !item.units) return false;
  // Wenn der Artikel "Wiederholt"-markiert ist, ist es NICHT leicht zu nehmen
  // (es taucht woanders auch auf, also Vorsicht)
  if (repeatedFnskus && repeatedFnskus.has(item.fnsku)) return false;

  const t = (item.title || '').toLowerCase();
  const dim = item.dimStr || '';

  // Klebeband: ≤ 6
  if (/klebeband|paketband|packband/i.test(t)) {
    return item.units <= 6;
  }
  // 80×80, 80×63, 80×60: ≤ 5
  if (/^\s*80\s*[×x]\s*(80|63|60)/i.test(dim)) {
    return item.units <= 5;
  }
  // ÖKO: ≤ 5
  if (/öko|oeko/i.test(t)) {
    return item.units <= 5;
  }
  // Default: ≤ 20
  return item.units <= 20;
}

/* ─────────────────────────────────────────────────────────────────────────
   FokusModus — Palette für Palette (Deutsch only)
   Eine Palette pro Bildschirm. Innerhalb einer Palette nach Format
   gruppiert. Nicht möglich zur nächsten Palette zu springen, bevor die
   aktuelle vollständig geladen ist. Kopierte Codes sind dauerhaft
   farblich markiert.
   ───────────────────────────────────────────────────────────────────────── */
function FokusModus({
  screens,
  loadedSet,
  onToggleLoaded,
  onClose,
  onFinish,
  startTs,
  reserveFnskus,
  repeatedUseItems,
  labeledSet,
  onToggleLabeled,
  meta,
  palletVolumes,
  copiedSet: externalCopiedSet,
  setCopiedSet: externalSetCopiedSet,
  orderEstimateSec,
}) {
  const [palletIdx, setPalletIdx] = useState(0);
  // Lifted-Set: kontrolliert von App, falls vorhanden — sonst lokal.
  const [localCopiedSet, setLocalCopiedSet] = useState(() => new Set());
  const copiedSet = externalCopiedSet ?? localCopiedSet;
  const setCopiedSet = externalSetCopiedSet ?? setLocalCopiedSet;
  const [now, setNow] = useState(Date.now());

  const current = screens[palletIdx];

  // Tick clock
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Pallet "done" = ALLE Artikel markiert (inkl. zugewiesener Einzelne-SKU)
  // Composite-Key: palletId::fnsku — derselbe FNSKU auf 2 Paletten ist UNABHÄNGIG.
  const palletDone = useCallback(
    (p) => p && (p.allItems || p.pallet.items).every((it) =>
      loadedSet.has(`${p.palletId}::${it.fnsku}`)
    ),
    [loadedSet]
  );
  const isCurrentDone = current ? palletDone(current) : false;

  // Volumen pro Artikel auf der aktuellen Palette (inkl. Einzelne SKU)
  const articleVolumes = useMemo(() => {
    if (!current) return { perItem: new Map(), maxCm3: 0, total: 0, hasUnknown: false };
    const perItem = new Map();
    let maxCm3 = 0;
    let total = 0;
    let hasUnknown = false;
    (current.allItems || current.pallet.items).forEach((it) => {
      const v = itemVolumeCm3(it);
      perItem.set(it.fnsku, v);
      if (!v.matched) hasUnknown = true;
      if (v.totalCm3 > maxCm3) maxCm3 = v.totalCm3;
      total += v.totalCm3;
    });
    return { perItem, maxCm3, total, hasUnknown };
  }, [current]);

  // Globaler Fortschritt (über alle Paletten, inkl. Einzelne-SKU)
  const totalArticlesDone = useMemo(
    () =>
      screens
        .flatMap((s) => (s.allItems || s.pallet.items).map((it) => ({ s, it })))
        .filter(({ s, it }) => loadedSet.has(`${s.palletId}::${it.fnsku}`)).length,
    [screens, loadedSet]
  );
  const totalArticles = screens.reduce((s, p) => s + p.itemCount, 0);
  const allPalletsDone = screens.every(palletDone);

  // Forward navigation: blocked unless all pallets up to target are done
  const canJumpTo = useCallback(
    (targetIdx) => {
      if (targetIdx <= palletIdx) return true; // zurück immer erlaubt
      for (let k = palletIdx; k < targetIdx; k++) {
        if (!palletDone(screens[k])) return false;
      }
      return true;
    },
    [palletIdx, palletDone, screens]
  );

  // Generischer copy helper (mit fallback)
  const copyTextRaw = useCallback((text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        } catch (e) {
          console.warn('clipboard fallback failed', e);
        }
      });
    } else {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e) {
        console.warn('clipboard fallback failed', e);
      }
    }
  }, []);

  // Per-Palette Marker — gleicher FNSKU auf 2 Paletten ist unabhängig.
  const currentPalletId = current?.palletId || '';
  const copyArticle = useCallback(
    (fnsku) => {
      const key = `${currentPalletId}::${fnsku}`;
      setCopiedSet((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      copyTextRaw(fnsku);
    },
    [copyTextRaw, currentPalletId]
  );

  const copyUseItem = useCallback(
    (useItem) => {
      const key = `useItem:${currentPalletId}::${useItem}`;
      setCopiedSet((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      copyTextRaw(useItem);
    },
    [copyTextRaw, currentPalletId]
  );

  // Enter / "Weiter" — STRENGE Logik (kein Auto-Marking mehr!):
  //   • Wenn aktuelle Palette NICHT fertig → blockiert (nichts passiert).
  //     Der User MUSS jeden Artikel einzeln "Als geladen markieren".
  //   • Wenn fertig und nicht letzte → springt zur nächsten Palette.
  //   • Wenn letzte fertig → onFinish() → AbschlussScreen.
  const advance = useCallback(() => {
    if (!current) return;
    if (!isCurrentDone) return;                              // ← strict block
    const isLast = palletIdx === screens.length - 1;
    if (isLast && allPalletsDone) {
      if (onFinish) onFinish();
      return;
    }
    setPalletIdx((i) => Math.min(screens.length - 1, i + 1));
  }, [current, isCurrentDone, screens.length, palletIdx, allPalletsDone, onFinish]);

  const goPrev = useCallback(() => {
    setPalletIdx((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    if (!isCurrentDone) return; // gesperrt — Palette zuerst abschließen
    setPalletIdx((i) => Math.min(screens.length - 1, i + 1));
  }, [isCurrentDone, screens.length]);

  // Tastatur
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        advance();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, goNext, goPrev, onClose]);

  if (!current) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: T.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
        }}
      >
        <div>Keine Paletten</div>
      </div>
    );
  }

  const elapsed = startTs ? Math.floor((now - startTs) / 1000) : 0;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const elapsedStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  return (
    <div
      className="lp-root"
      style={{
        position: 'fixed',
        inset: 0,
        background: T.bg,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        animation: 'lpFadeUp 0.2s ease forwards',
      }}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          padding: '18px 28px',
          borderBottom: `1px solid ${T.border}`,
          background: T.surface,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 9.5,
            color: T.textMuted,
            letterSpacing: 1.8,
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Fokus-Modus
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: T.text,
            letterSpacing: -0.2,
          }}
        >
          Palette {palletIdx + 1} von {screens.length}
        </div>
        <div
          className="lp-mono"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: T.text,
            background: T.bg,
            padding: '4px 10px',
            borderRadius: 6,
            border: `1px solid ${T.border}`,
            letterSpacing: -0.1,
          }}
        >
          {current.palletId}
        </div>
        {current.hasFourSideWarning && <WarningBadge>4 Seiten Aufkleber</WarningBadge>}

        <div style={{ flex: 1 }} />

        {/* Progress bar */}
        <div
          style={{
            flex: 1,
            maxWidth: 360,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 6,
              background: T.bg,
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(totalArticlesDone / Math.max(1, totalArticles)) * 100}%`,
                height: '100%',
                background: allPalletsDone
                  ? `linear-gradient(90deg, ${T.green}, #22c55e)`
                  : `linear-gradient(90deg, ${T.blue}, #3b82f6)`,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <span
            className="lp-mono"
            style={{
              fontSize: 13,
              color: T.text,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              minWidth: 64,
              textAlign: 'right',
            }}
          >
            {totalArticlesDone}/{totalArticles}
          </span>
        </div>

        {/* Timer */}
        <div
          className="lp-mono"
          style={{
            fontSize: 14,
            color: T.text,
            fontWeight: 500,
            fontVariantNumeric: 'tabular-nums',
            background: T.bg,
            padding: '6px 12px',
            borderRadius: 7,
            border: `1px solid ${T.border}`,
            letterSpacing: 0.4,
          }}
        >
          {elapsedStr}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="lp-btn2-hover"
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            color: T.textSub,
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          Schließen
          <kbd
            style={{
              fontSize: 9.5,
              background: T.bg,
              padding: '2px 5px',
              borderRadius: 3,
              border: `1px solid ${T.border}`,
              fontFamily: 'DM Mono, monospace',
              letterSpacing: 0.4,
            }}
          >
            Esc
          </kbd>
        </button>
      </div>

      {/* ── Pallet Battery Row ── */}
      {palletVolumes && screens.length > 1 && (
        <div
          style={{
            padding: '14px 28px',
            borderBottom: `1px solid ${T.border}`,
            background: T.bg,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 9.5,
              color: T.textMuted,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            Paletten
          </span>
          {screens.map((s, i) => {
            const stats = palletVolumes[s.palletId];
            const isCur = i === palletIdx;
            const done = palletDone(s);
            return (
              <button
                key={s.palletId}
                onClick={() => {
                  if (canJumpTo(i)) setPalletIdx(i);
                }}
                disabled={!canJumpTo(i)}
                title={
                  canJumpTo(i)
                    ? `${s.palletId}${done ? ' · fertig' : ''}`
                    : 'Vorherige Paletten zuerst abschließen'
                }
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${
                    isCur ? T.text : done ? T.green : 'transparent'
                  }`,
                  borderRadius: 0,
                  padding: '6px 10px 4px',
                  cursor: canJumpTo(i) ? 'pointer' : 'not-allowed',
                  opacity: canJumpTo(i) ? 1 : 0.4,
                  fontFamily: 'inherit',
                  flexShrink: 0,
                  transition: 'border-color 0.2s ease',
                }}
              >
                <PalletBattery
                  stats={stats}
                  size="sm"
                  label={`P${s.palletNumber}`}
                  highlight={isCur || done}
                />
              </button>
            );
          })}
          {orderEstimateSec ? (
            <div
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 14 }}>⏱</span>
              <span
                style={{
                  fontSize: 9.5,
                  color: T.textMuted,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                Auftrag
              </span>
              <span
                className="lp-mono"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: T.text,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                ~{formatDurationShort(orderEstimateSec)}
              </span>
            </div>
          ) : null}
        </div>
      )}

      {/* ── Center content ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '40px 28px 80px',
        }}
      >
        <div style={{ width: 'min(960px, 100%)', flex: '0 0 auto' }}>
          {/* Pallet header */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div
              style={{
                fontSize: 11,
                color: T.textMuted,
                letterSpacing: 2,
                textTransform: 'uppercase',
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Aktuelle Palette
            </div>
            <div
              className="lp-mono"
              style={{
                fontSize: 44,
                fontWeight: 700,
                color: isCurrentDone ? T.green : T.text,
                letterSpacing: -1.4,
                lineHeight: 1.0,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {current.palletId}
              {isCurrentDone && (
                <span style={{ marginLeft: 16, fontSize: 22 }}>✓</span>
              )}
            </div>
            <div
              style={{
                fontSize: 14,
                color: T.textSub,
                marginTop: 10,
                letterSpacing: 0.2,
              }}
            >
              {current.itemCount}{' '}
              {current.itemCount === 1 ? 'Artikel' : 'Artikel'}
              <span style={{ color: T.textMuted, margin: '0 10px' }}>·</span>
              <span className="lp-mono" style={{ fontWeight: 500 }}>
                {current.totalUnits}
              </span>{' '}
              Einheiten gesamt
              <span style={{ color: T.textMuted, margin: '0 10px' }}>·</span>
              <span className="lp-mono" style={{ fontWeight: 500 }}>
                {current.formatGroups.length}
              </span>{' '}
              Format-{current.formatGroups.length === 1 ? 'Gruppe' : 'Gruppen'}
              {current.einzelneSkuItems && current.einzelneSkuItems.length > 0 && (
                <>
                  <span style={{ color: T.textMuted, margin: '0 10px' }}>·</span>
                  <span
                    style={{
                      background: '#7C3AED',
                      color: '#fff',
                      padding: '2px 9px',
                      borderRadius: 4,
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: 0.7,
                      textTransform: 'uppercase',
                    }}
                  >
                    ⬢ +{current.einzelneSkuItems.length} Einzelne SKU
                  </span>
                </>
              )}
              {isCurrentDone && (
                <span style={{ color: T.green, marginLeft: 14, fontWeight: 700 }}>
                  · vollständig geladen
                </span>
              )}
            </div>
          </div>

          {/* Format-Gruppen — innerhalb der Palette */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {current.formatGroups.map((fg, fgIdx) => (
              <section
                key={fg.signature}
                style={fg.isEinzelneSku ? {
                  background: 'linear-gradient(135deg, #F5F3FF 0%, #FFFFFF 60%)',
                  border: '2.5px dashed #7C3AED',
                  borderRadius: 18,
                  padding: '20px 24px',
                  position: 'relative',
                  boxShadow: '0 4px 18px rgba(124,58,237,0.10)',
                } : undefined}
              >
                {/* Großer "EINZELNE SKU"-Marker — nicht zu übersehen */}
                {fg.isEinzelneSku && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -14,
                      left: 24,
                      background: '#7C3AED',
                      color: '#fff',
                      padding: '5px 14px',
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                      boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    ⬢ Einzelne SKU · NICHT ÜBERSEHEN
                  </div>
                )}
                {/* Format header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 14,
                    marginBottom: 12,
                    paddingBottom: 8,
                    borderBottom: `1px ${fg.isEinzelneSku ? 'solid #7C3AED44' : 'dashed ' + T.border}`,
                    marginTop: fg.isEinzelneSku ? 8 : 0,
                  }}
                >
                  <span
                    className="lp-mono"
                    style={{
                      fontSize: 11,
                      color: fg.isEinzelneSku ? '#7C3AED' : T.textMuted,
                      letterSpacing: 1.6,
                      textTransform: 'uppercase',
                      fontWeight: 700,
                    }}
                  >
                    {fg.isEinzelneSku ? 'Sondergruppe' : `Format ${fgIdx + 1}`}
                  </span>
                  <span
                    className="lp-mono"
                    style={{
                      fontSize: 22,
                      color: fg.isEinzelneSku ? '#7C3AED' : T.text,
                      fontWeight: 700,
                      letterSpacing: -0.4,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fg.isEinzelneSku ? 'Zusätzlich verteilt' : (fg.dimStr || '—')}
                    {fg.rollen != null && !fg.isEinzelneSku && (
                      <span
                        style={{
                          color: T.textSub,
                          marginLeft: 12,
                          fontWeight: 500,
                          fontSize: 18,
                        }}
                      >
                        · {fg.rollen} Rollen
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: fg.isEinzelneSku ? '#7C3AED' : T.textMuted,
                      letterSpacing: 0.4,
                      fontWeight: fg.isEinzelneSku ? 700 : 400,
                    }}
                  >
                    {fg.articleCount}{' '}
                    {fg.articleCount === 1 ? 'Artikel' : 'Artikel'}
                  </span>
                  {fg.isEinzelneSku && (
                    <span
                      style={{
                        fontSize: 10.5,
                        color: T.textSub,
                        fontStyle: 'italic',
                        marginLeft: 'auto',
                      }}
                    >
                      Auto-verteilt — gehören nicht ursprünglich zu dieser Palette, müssen aber hier mit drauf!
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {fg.articles.map((row) => {
                    const it = row.item;
                    // Per-Palette Schlüssel: derselbe FNSKU auf 2 Paletten = unabhängig
                    const itemKey = `${current.palletId}::${it.fnsku}`;
                    const done = loadedSet.has(itemKey);
                    const labeled = labeledSet?.has(it.fnsku);
                    const isCopied = copiedSet.has(itemKey);
                    const isUseCopied = it.useItem && copiedSet.has(`useItem:${current.palletId}::${it.useItem}`);
                    const isReserve = reserveFnskus?.has(it.fnsku);
                    const isRepeatedUse = repeatedUseItems?.has(it.fnsku);
                    const lstStatus = itemHasLst(it);                       // 'mit' | 'ohne' | null
                    const isEasy = isLeichtAbzuholen(it, repeatedUseItems);
                    const vol = articleVolumes.perItem.get(it.fnsku);
                    const volPct = articleVolumes.maxCm3 > 0 && vol?.matched
                      ? (vol.totalCm3 / articleVolumes.maxCm3) * 100
                      : 0;
                    return (
                      <article
                        key={it.fnsku}
                        style={{
                          background: done
                            ? T.greenBg
                            : it.isEinzelneSku
                              ? '#FAF7FF'
                              : T.surface,
                          border: `${it.isEinzelneSku ? '3px' : '2px'} solid ${
                            done
                              ? T.green
                              : isCopied
                                ? T.green
                                : it.isEinzelneSku
                                  ? '#7C3AED'
                                  : T.border
                          }`,
                          borderRadius: 16,
                          padding: '24px 28px',
                          boxShadow: it.isEinzelneSku
                            ? '0 4px 16px rgba(124,58,237,0.15)'
                            : T.shadowSm,
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          position: 'relative',
                        }}
                      >
                        {/* Top-right badges row */}
                        <div
                          style={{
                            position: 'absolute',
                            top: 14,
                            right: 14,
                            display: 'flex',
                            gap: 6,
                            flexWrap: 'wrap',
                            justifyContent: 'flex-end',
                          }}
                        >
                          {it.isEinzelneSku && (
                            <span
                              title={'Dieser Artikel wurde von der „Einzelne SKU"-Sektion auf diese Palette verteilt — Karton mit (X×Y) Auflabeln dazustellen!'}
                              style={{
                                background: '#7C3AED',
                                color: '#fff',
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: 1,
                                textTransform: 'uppercase',
                                boxShadow: '0 1px 4px rgba(124,58,237,0.3)',
                                animation: 'lpPulse 2s ease-in-out infinite',
                              }}
                            >
                              ⬢ Einzelne SKU
                            </span>
                          )}
                          {isReserve && (
                            <span
                              title="Gleiches Format, andere Marke — für nächstes Mal aufbewahren"
                              style={{
                                background: '#9333EA',
                                color: '#fff',
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: 0.8,
                                textTransform: 'uppercase',
                              }}
                            >
                              ⏸ Reserve
                            </span>
                          )}
                          {isRepeatedUse && (
                            <span
                              title="Gleicher Zu-verwendender-Artikel kommt später nochmal vor"
                              style={{
                                background: '#0EA5E9',
                                color: '#fff',
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: 0.8,
                                textTransform: 'uppercase',
                              }}
                            >
                              ↺ Wiederholt
                            </span>
                          )}
                          {isEasy && (
                            <span
                              title="Wenig Einheiten und kommt nirgends mehrfach vor — leicht aufzuhebener Artikel"
                              style={{
                                background: '#10B981',
                                color: '#fff',
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: 0.8,
                                textTransform: 'uppercase',
                              }}
                            >
                              ⚡ Leicht abzuholen
                            </span>
                          )}
                          {lstStatus === 'mit' && (
                            <span
                              title="Mit SEPA-Lastschrift-Aufdruck"
                              style={{
                                background: '#1F2937',
                                color: '#FBBF24',
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: 1,
                                textTransform: 'uppercase',
                                border: '1px solid #FBBF24',
                              }}
                            >
                              ✓ mit LST
                            </span>
                          )}
                          {lstStatus === 'ohne' && (
                            <span
                              title="Ohne LST-Aufdruck (unbedruckt / ohne Lastschrift)"
                              style={{
                                background: '#F3F4F6',
                                color: '#6B7280',
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: 0.8,
                                textTransform: 'uppercase',
                                border: '1px solid #D1D5DB',
                              }}
                            >
                              ✕ ohne LST
                            </span>
                          )}
                          {labeled && (
                            <span
                              style={{
                                background: '#0891B2',
                                color: '#fff',
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: 0.8,
                                textTransform: 'uppercase',
                              }}
                            >
                              🏷 Etikettiert
                            </span>
                          )}
                          {done && (
                            <span
                              style={{
                                background: T.green,
                                color: '#fff',
                                padding: '4px 12px',
                                borderRadius: 6,
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: 1,
                                textTransform: 'uppercase',
                              }}
                            >
                              ✓ Geladen
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color: T.textMuted,
                            letterSpacing: 1.4,
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            marginBottom: 4,
                          }}
                        >
                          Bezeichnung
                        </div>
                        <h2
                          style={{
                            fontSize: 22,
                            fontWeight: 500,
                            color: T.text,
                            letterSpacing: -0.5,
                            lineHeight: 1.2,
                            margin: 0,
                            marginBottom: 18,
                          }}
                        >
                          {shortGermanName(it)}
                        </h2>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr auto',
                            gap: 28,
                            alignItems: 'center',
                          }}
                        >
                          {/* FNSKU — click to copy (PERMANENT marker) */}
                          <div>
                            <div
                              style={{
                                fontSize: 11,
                                color: T.textMuted,
                                letterSpacing: 1.4,
                                textTransform: 'uppercase',
                                fontWeight: 700,
                                marginBottom: 6,
                              }}
                            >
                              Artikel-Code
                              {!isCopied && (
                                <span
                                  style={{
                                    marginLeft: 6,
                                    color: T.textSub,
                                    textTransform: 'none',
                                    letterSpacing: 0.3,
                                    fontWeight: 500,
                                  }}
                                >
                                  · klicken zum Kopieren
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => copyArticle(it.fnsku)}
                              title={
                                isCopied
                                  ? 'Bereits kopiert — nochmal klicken um wieder zu kopieren'
                                  : 'In die Zwischenablage kopieren'
                              }
                              style={{
                                fontFamily: 'DM Mono, ui-monospace, monospace',
                                fontSize: 34,
                                fontWeight: 600,
                                color: isCopied ? T.green : T.text,
                                letterSpacing: -0.4,
                                background: isCopied
                                  ? T.greenBg
                                  : T.bg,
                                border: `2px solid ${
                                  isCopied ? T.green : T.borderStrong
                                }`,
                                padding: '12px 20px',
                                borderRadius: 12,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 14,
                                fontVariantNumeric: 'tabular-nums',
                                transition: 'all 0.2s ease',
                                position: 'relative',
                              }}
                            >
                              {it.fnsku}
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: isCopied ? '#fff' : T.textMuted,
                                  background: isCopied ? T.green : T.surface,
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  border: `1px solid ${
                                    isCopied ? T.green : T.border
                                  }`,
                                  letterSpacing: 1,
                                  textTransform: 'uppercase',
                                  fontFamily: 'DM Sans, sans-serif',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                {isCopied ? '✓ Kopiert' : 'Kopieren'}
                              </span>
                            </button>
                            {(it.ean || it.upc) && (
                              <div
                                style={{
                                  marginTop: 8,
                                  fontSize: 11,
                                  color: T.textSub,
                                  letterSpacing: 0.4,
                                }}
                              >
                                {it.ean ? 'EAN' : 'UPC'}:{' '}
                                <span
                                  className="lp-mono"
                                  style={{ color: T.text }}
                                >
                                  {it.ean || it.upc}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Quantity */}
                          <div style={{ textAlign: 'right' }}>
                            <div
                              style={{
                                fontSize: 11,
                                color: T.textMuted,
                                letterSpacing: 1.4,
                                textTransform: 'uppercase',
                                fontWeight: 700,
                                marginBottom: 4,
                              }}
                            >
                              Menge
                            </div>
                            <div
                              className="lp-mono"
                              style={{
                                fontSize: 56,
                                fontWeight: 600,
                                color: T.text,
                                lineHeight: 1,
                                letterSpacing: -1.6,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {it.units}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: T.textSub,
                                marginTop: 4,
                                letterSpacing: 0.4,
                              }}
                            >
                              Einheiten
                            </div>
                          </div>
                        </div>

                        {/* "Zu verwendender Artikel" — eigene Kopier-Zeile */}
                        {it.useItem && (
                          <div
                            style={{
                              marginTop: 14,
                              padding: '10px 14px',
                              background: isUseCopied ? T.greenBg : T.bg,
                              border: `1px solid ${isUseCopied ? T.green : T.border}`,
                              borderRadius: 10,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontSize: 9.5,
                                  color: T.textMuted,
                                  letterSpacing: 1.3,
                                  textTransform: 'uppercase',
                                  fontWeight: 700,
                                  marginBottom: 3,
                                }}
                              >
                                Zu verwendender Artikel
                              </div>
                              <div
                                className="lp-mono"
                                style={{
                                  fontSize: 16,
                                  fontWeight: 600,
                                  color: isUseCopied ? T.green : T.text,
                                  letterSpacing: 0.2,
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {it.useItem}
                              </div>
                            </div>
                            <button
                              onClick={() => copyUseItem(it.useItem)}
                              title="Zu verwendender Artikel kopieren"
                              style={{
                                background: isUseCopied ? T.green : T.surface,
                                color: isUseCopied ? '#fff' : T.text,
                                border: `1px solid ${isUseCopied ? T.green : T.borderStrong}`,
                                padding: '8px 14px',
                                borderRadius: 7,
                                fontSize: 11.5,
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                letterSpacing: 0.3,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {isUseCopied ? '✓ Kopiert' : '⧉ Kopieren'}
                            </button>
                          </div>
                        )}

                        {/* Volumen-Balken (relativer Anteil auf der Palette) */}
                        {vol?.matched ? (
                          <div style={{ marginTop: 14 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'baseline',
                                justifyContent: 'space-between',
                                marginBottom: 4,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 9.5,
                                  color: T.textMuted,
                                  letterSpacing: 1.3,
                                  textTransform: 'uppercase',
                                  fontWeight: 700,
                                }}
                              >
                                Volumen-Anteil auf Palette
                              </span>
                              <span
                                className="lp-mono"
                                style={{
                                  fontSize: 11,
                                  color: T.textSub,
                                  fontWeight: 600,
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {(vol.totalCm3 / 1_000_000).toFixed(3)} m³
                                <span style={{ color: T.textMuted, marginLeft: 6 }}>
                                  · {vol.cartonsCount} Karton(s)
                                </span>
                              </span>
                            </div>
                            <div
                              style={{
                                height: 8,
                                background: T.bg,
                                borderRadius: 4,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${volPct}%`,
                                  height: '100%',
                                  background: `linear-gradient(90deg, ${
                                    CATEGORY_COLORS[it.category] || T.blue
                                  }dd, ${CATEGORY_COLORS[it.category] || T.blue})`,
                                  borderRadius: 4,
                                  transition: 'width 0.4s ease',
                                }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div
                            style={{
                              marginTop: 14,
                              padding: '8px 12px',
                              background: T.amberBg,
                              border: `1px dashed rgba(217,119,6,0.4)`,
                              borderRadius: 8,
                              fontSize: 11,
                              color: T.amber,
                              fontWeight: 600,
                              letterSpacing: 0.3,
                            }}
                          >
                            ⚠ Kartonmaß nicht im Katalog — Volumen wird nicht
                            mitgezählt (später hinzufügen)
                          </div>
                        )}

                        {/* Aktionen: Geladen + Etikettiert */}
                        <div
                          style={{
                            marginTop: 16,
                            paddingTop: 14,
                            borderTop: `1px solid ${T.border}`,
                            display: 'flex',
                            gap: 10,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          <button
                            onClick={() => onToggleLoaded(itemKey)}
                            style={{
                              background: done ? T.green : T.text,
                              color: '#fff',
                              border: 'none',
                              padding: '10px 18px',
                              borderRadius: 8,
                              fontSize: 12.5,
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              letterSpacing: 0.3,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            {done ? '✓ Geladen' : 'Als geladen markieren'}
                          </button>
                          <button
                            onClick={() => onToggleLabeled?.(it.fnsku)}
                            title="Markieren wenn Etiketten bereits aufgeklebt sind"
                            style={{
                              background: labeled ? '#0891B2' : T.surface,
                              color: labeled ? '#fff' : T.textSub,
                              border: `1px solid ${labeled ? '#0891B2' : T.border}`,
                              padding: '10px 16px',
                              borderRadius: 8,
                              fontSize: 12.5,
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              letterSpacing: 0.3,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            {labeled ? '🏷 Etiketten geklebt' : '🏷 Etiketten kleben'}
                          </button>
                          <span
                            style={{
                              fontSize: 11,
                              color: T.textMuted,
                              letterSpacing: 0.3,
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {it.title}
                          </span>
                        </div>
                        {/* Einzelne-SKU-Detail-Banner: zeigt explizit den (X × Y)-Karton-Aufbau */}
                        {it.isEinzelneSku && it.einzelneSku && (
                          <div
                            style={{
                              marginTop: 14,
                              padding: '10px 14px',
                              background: '#7C3AED',
                              color: '#fff',
                              borderRadius: 10,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              fontSize: 12.5,
                              fontWeight: 600,
                              letterSpacing: 0.2,
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
                            }}
                          >
                            <span style={{ fontSize: 16 }}>⬢</span>
                            <span style={{ fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 10 }}>
                              Einzelne SKU
                            </span>
                            <span style={{ opacity: 0.7 }}>·</span>
                            {/* FNSKU als hervorgehobenes Code-Chip — leicht erkennbar */}
                            <span
                              className="lp-mono"
                              title="FNSKU"
                              style={{
                                background: 'rgba(255,255,255,0.18)',
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontWeight: 800,
                                letterSpacing: 0.5,
                                border: '1px solid rgba(255,255,255,0.3)',
                              }}
                            >
                              {it.fnsku}
                            </span>
                            <span style={{ opacity: 0.7 }}>·</span>
                            <span className="lp-mono">
                              ({it.einzelneSku.packsPerCarton} × {it.einzelneSku.itemsPerPack} {it.einzelneSku.contentLabel})
                            </span>
                            <span style={{ opacity: 0.7 }}>·</span>
                            <span className="lp-mono">
                              {it.units} Einh = {it.einzelneSku.cartonsCount}× Karton
                            </span>
                            <span style={{ flex: 1 }} />
                            <span
                              style={{
                                fontSize: 10.5,
                                opacity: 0.85,
                                fontStyle: 'italic',
                                fontWeight: 500,
                              }}
                            >
                              jeder Karton mit Etikett dazustellen!
                            </span>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {/* Action bar */}
          <div
            style={{
              marginTop: 36,
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <button
              onClick={goPrev}
              disabled={palletIdx === 0}
              className="lp-btn2-hover"
              style={{
                padding: '12px 18px',
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                color: T.textSub,
                fontSize: 13,
                fontWeight: 500,
                cursor: palletIdx === 0 ? 'not-allowed' : 'pointer',
                opacity: palletIdx === 0 ? 0.4 : 1,
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              ← Zurück
            </button>

            <button
              onClick={advance}
              className="lp-btn-hover"
              style={{
                padding: '14px 30px',
                background: isCurrentDone
                  ? T.green
                  : palletIdx === screens.length - 1 && allPalletsDone
                  ? T.green
                  : T.text,
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: 0.3,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                boxShadow: T.shadowMd,
              }}
            >
              {isCurrentDone
                ? palletIdx === screens.length - 1
                  ? 'Alle Paletten fertig'
                  : 'Weiter zur nächsten Palette'
                : 'Palette abschließen'}
              <kbd
                style={{
                  fontSize: 11,
                  background: 'rgba(255,255,255,0.18)',
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontFamily: 'DM Mono, monospace',
                  letterSpacing: 0.6,
                  fontWeight: 600,
                }}
              >
                ↵ Enter
              </kbd>
            </button>

            <button
              onClick={goNext}
              disabled={!isCurrentDone || palletIdx === screens.length - 1}
              className="lp-btn2-hover"
              title={
                !isCurrentDone
                  ? 'Erst alle Artikel der aktuellen Palette als geladen markieren'
                  : ''
              }
              style={{
                padding: '12px 18px',
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                color: T.textSub,
                fontSize: 13,
                fontWeight: 500,
                cursor:
                  !isCurrentDone || palletIdx === screens.length - 1
                    ? 'not-allowed'
                    : 'pointer',
                opacity:
                  !isCurrentDone || palletIdx === screens.length - 1 ? 0.4 : 1,
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {!isCurrentDone && <span style={{ fontSize: 12 }}>🔒</span>}
              Weiter →
            </button>
          </div>

          {/* Hint when blocked */}
          {!isCurrentDone && (
            <div
              style={{
                marginTop: 14,
                textAlign: 'center',
                fontSize: 12,
                color: T.amber,
                fontWeight: 500,
                letterSpacing: 0.2,
              }}
            >
              Sperre: Erst alle Artikel der Palette {current.palletId} laden,
              dann ist die nächste Palette freigeschaltet.
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom pallet badges (locked unless previous done) ── */}
      <div
        style={{
          padding: '16px 28px',
          borderTop: `1px solid ${T.border}`,
          background: T.surface,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            color: T.textMuted,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          Paletten-Übersicht
        </span>
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'nowrap',
            alignItems: 'center',
          }}
        >
          {screens.map((s, i) => {
            const done = palletDone(s);
            const active = i === palletIdx;
            const locked = !canJumpTo(i);
            return (
              <button
                key={s.palletId}
                onClick={() => {
                  if (!locked) setPalletIdx(i);
                }}
                disabled={locked}
                title={
                  locked
                    ? `Gesperrt — vorherige Paletten zuerst abschließen`
                    : `${s.palletId} · ${s.itemCount} Artikel · ${s.totalUnits} Einh.`
                }
                style={{
                  height: 34,
                  minWidth: active ? 84 : 44,
                  padding: active ? '0 14px' : '0 10px',
                  background: done
                    ? T.green
                    : active
                    ? T.text
                    : locked
                    ? T.bg
                    : T.surface,
                  border: `1px solid ${
                    done ? T.green : active ? T.text : locked ? T.border : T.borderStrong
                  }`,
                  borderRadius: 8,
                  color: done || active ? '#fff' : locked ? T.textMuted : T.textSub,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: locked ? 'not-allowed' : 'pointer',
                  opacity: locked ? 0.55 : 1,
                  fontFamily: 'DM Mono, monospace',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: 0.2,
                  transition: 'all 0.18s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  flexShrink: 0,
                }}
              >
                {locked && <span style={{ fontSize: 11 }}>🔒</span>}
                {done ? '✓' : ''}
                {active ? s.palletId : i + 1}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 11,
            color: T.textSub,
            letterSpacing: 0.4,
          }}
        >
          <kbd
            style={{
              fontSize: 10,
              background: T.bg,
              padding: '2px 6px',
              borderRadius: 3,
              border: `1px solid ${T.border}`,
              fontFamily: 'DM Mono, monospace',
              marginRight: 6,
            }}
          >
            ↵
          </kbd>
          {isCurrentDone ? 'Nächste Palette' : 'Palette abschließen'}
          <span style={{ color: T.textMuted, margin: '0 8px' }}>·</span>
          <kbd
            style={{
              fontSize: 10,
              background: T.bg,
              padding: '2px 6px',
              borderRadius: 3,
              border: `1px solid ${T.border}`,
              fontFamily: 'DM Mono, monospace',
              marginRight: 6,
            }}
          >
            ←/→
          </kbd>
          Navigation
          <span style={{ color: T.textMuted, margin: '0 8px' }}>·</span>
          <kbd
            style={{
              fontSize: 10,
              background: T.bg,
              padding: '2px 6px',
              borderRadius: 3,
              border: `1px solid ${T.border}`,
              fontFamily: 'DM Mono, monospace',
              marginRight: 6,
            }}
          >
            Klick
          </kbd>
          Code kopieren
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   AbschlussScreen — Auftrags-Abschluss Übersicht
   Zeigt: Erstelldatum/Uhrzeit, Lieferadresse, zwei wichtigste Artikel
   (kopierbar), Gewicht und Preis (kopierbar — nur Zahlen),
   Abschlusszeitpunkt. Speichert in localStorage History.
   ───────────────────────────────────────────────────────────────────────── */

const ORDER_HISTORY_KEY = 'lagerauftrag.history.v1';
const ORDER_DRAFT_KEY = 'lagerauftrag.draft.v1';

/* Tarif-Tabelle kommt aus getAdminConfig().tarif (sessionStorage). */
function suggestedWeight(palletCount) {
  const t = getAdminConfig().tarif;
  return palletCount > 0 ? palletCount * t.kgPerPallet : 0;
}
function suggestedPrice(palletCount) {
  const t = getAdminConfig().tarif;
  return palletCount > 0 ? palletCount * t.eurPerPallet : 0;
}
/** Format als "1234,5" mit Komma als Dezimalzeichen (DE-Stil, ohne Tausender-Separator) */
function formatNumDe(n, decimals = 0) {
  if (n == null || isNaN(n)) return '';
  return Number(n).toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: false,
  });
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(ORDER_HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

/* ─── Session persistence — restore work-in-progress on page reload ───
   Was wir speichern: alles, was der User in dieser Sitzung erarbeitet hat
   (Auftrag, geladene/etikettierte Items, Gewicht, Preis, Layout-State).
   Was wir NICHT speichern: activeItem (UI-Detail), highlightedPalletId.
   Sets werden zu Arrays serialisiert.                                    */
const SESSION_KEY = 'lagerauftrag.session.v1';

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return {
      ...s,
      loadedSet: new Set(s.loadedSet || []),
      labeledSet: new Set(s.labeledSet || []),
      copiedSet: new Set(s.copiedSet || []),
    };
  } catch (e) {
    console.warn('session load failed', e);
    return null;
  }
}

function saveSession(state) {
  try {
    const serializable = {
      ...state,
      loadedSet: Array.from(state.loadedSet || []),
      labeledSet: Array.from(state.labeledSet || []),
      copiedSet: Array.from(state.copiedSet || []),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(serializable));
  } catch (e) {
    console.warn('session save failed', e);
  }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

function saveToHistory(entry) {
  try {
    const list = loadHistory();
    const filtered = list.filter((e) => e.sendungsnummer !== entry.sendungsnummer);
    filtered.unshift(entry);
    const trimmed = filtered.slice(0, 50); // max 50 history
    localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch (e) {
    console.warn('history save failed', e);
    return [];
  }
}

function CopyableNumberField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  suggestion,
  suggestionActive,
}) {
  const [copied, setCopied] = useState(false);
  // Wenn nichts manuell eingegeben → nehmen wir den Vorschlag zum Kopieren
  const effective = (value && value.trim()) || suggestion || '';
  const numericVal = effective.replace(/[^\d.,]/g, '');
  const doCopy = () => {
    if (!numericVal) return;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(numericVal);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const showingSuggestion = !value && !!suggestion;
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${suggestionActive && showingSuggestion ? T.green : T.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        transition: 'border-color 0.18s ease',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: T.textMuted,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span>{label}</span>
        {showingSuggestion && (
          <span
            style={{
              fontSize: 9.5,
              color: T.green,
              fontWeight: 700,
              letterSpacing: 0.6,
            }}
          >
            ⚡ Tarif-Vorschlag
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          inputMode="decimal"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="lp-mono"
          style={{
            flex: 1,
            border: `1px solid ${T.border}`,
            background: T.bg,
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 18,
            fontWeight: 600,
            color: showingSuggestion ? T.textMuted : T.text,
            fontFamily: 'DM Mono, ui-monospace, monospace',
            fontVariantNumeric: 'tabular-nums',
            outline: 'none',
            letterSpacing: -0.2,
          }}
        />
        {suffix && (
          <span
            style={{
              fontSize: 13,
              color: T.textSub,
              fontWeight: 500,
            }}
          >
            {suffix}
          </span>
        )}
        <button
          onClick={doCopy}
          disabled={!numericVal}
          title={
            showingSuggestion
              ? `Tarif-Wert ${numericVal} kopieren`
              : 'Nur Zahlen kopieren'
          }
          style={{
            background: copied ? T.green : T.text,
            color: '#fff',
            border: 'none',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 11.5,
            fontWeight: 600,
            cursor: numericVal ? 'pointer' : 'not-allowed',
            opacity: numericVal ? 1 : 0.4,
            fontFamily: 'inherit',
            letterSpacing: 0.3,
            whiteSpace: 'nowrap',
          }}
        >
          {copied ? '✓ Kopiert' : '⧉ Zahlen'}
        </button>
      </div>
    </div>
  );
}

function KeyArticleCard({ row, label }) {
  const [copied, setCopied] = useState(false);
  if (!row) {
    return (
      <div
        style={{
          background: T.bg,
          border: `1px dashed ${T.border}`,
          borderRadius: 12,
          padding: '14px 16px',
          color: T.textMuted,
          fontSize: 12,
          fontStyle: 'italic',
        }}
      >
        {label}: nicht vorhanden
      </div>
    );
  }
  const it = row.item;
  const doCopy = () => {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(it.fnsku);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div
      style={{
        background: T.surface,
        border: `2px solid ${copied ? T.green : T.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        transition: 'all 0.18s ease',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: T.textMuted,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {label} · {row.palletId}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={doCopy}
          className="lp-mono"
          style={{
            background: copied ? T.greenBg : T.bg,
            color: copied ? T.green : T.text,
            border: `1.5px solid ${copied ? T.green : T.borderStrong}`,
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 18,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'DM Mono, ui-monospace, monospace',
            letterSpacing: -0.2,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {it.fnsku}
          <span
            style={{
              fontSize: 10,
              color: copied ? T.green : T.textMuted,
              fontFamily: 'DM Sans, sans-serif',
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            {copied ? '✓' : '⧉'}
          </span>
        </button>
        <span
          className="lp-mono"
          style={{
            fontSize: 16,
            color: T.text,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {it.units}
        </span>
        <span
          style={{
            fontSize: 11,
            color: T.textSub,
            letterSpacing: 0.3,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {shortGermanName(it)}
        </span>
      </div>
    </div>
  );
}

function AbschlussScreen({
  meta,
  flatItems,
  palletCount,
  startTs,
  doneTs,
  onClose,
  weightKg,
  setWeightKg,
  priceEur,
  setPriceEur,
  history,
  onSave,
  loadedSet,
  labeledSet,
  copiedSet,
  orderEstimateSec,
  sortedPallets,
}) {
  const { topBonrolle, topBigBag } = useMemo(
    () => findKeyArticles(flatItems),
    [flatItems]
  );
  const [savedAt, setSavedAt] = useState(null);

  // Kategorien-Verteilung (Anteil pro Kategorie)
  const categoryBreakdown = useMemo(() => {
    const m = {};
    flatItems.forEach((r) => {
      const c = r.item.category || 'sonstige';
      m[c] = (m[c] || 0) + 1;
    });
    const total = flatItems.length || 1;
    return Object.entries(m).map(([cat, count]) => ({
      cat,
      count,
      pct: count / total,
    }));
  }, [flatItems]);

  // Detaillierter Status pro Artikel — wer wurde kopiert / etikettiert / nicht
  const articleStatus = useMemo(() => {
    const copied = [];
    const uncopied = [];
    const labeled = [];
    flatItems.forEach((r) => {
      const fk = r.item.fnsku;
      if (copiedSet?.has(fk)) copied.push(fk);
      else uncopied.push(fk);
      if (labeledSet?.has(fk)) labeled.push(fk);
    });
    return { copied, uncopied, labeled };
  }, [flatItems, copiedSet, labeledSet]);

  // Auto-save: speichere automatisch in History bei vollem Abschluss
  // (alle Artikel als geladen markiert + doneTs gesetzt). Nur einmal.
  const autosavedRef = useRef(false);
  useEffect(() => {
    if (autosavedRef.current) return;
    if (!doneTs) return;
    if (!flatItems.length) return;
    const allLoaded = flatItems.every((r) => loadedSet?.has(r.item.fnsku));
    if (!allLoaded) return;
    autosavedRef.current = true;
    // Verzögere kurz damit handleSave alle Werte sieht
    const t = setTimeout(() => {
      try {
        handleSaveRef.current && handleSaveRef.current();
      } catch (e) {
        console.warn('Auto-save fehlgeschlagen', e);
      }
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneTs, flatItems, loadedSet]);

  const handleSaveRef = useRef(null);

  // Tarif-Vorschlag basierend auf Palettenanzahl
  const suggestedKg = suggestedWeight(palletCount);
  const suggestedEur = suggestedPrice(palletCount);
  const weightSuggestStr = formatNumDe(suggestedKg);
  const priceSuggestStr = formatNumDe(suggestedEur, 2).replace(/,00$/, '');

  // Hat User noch nichts eingegeben → wir zeigen Tarif-Vorschlag aktiv
  const weightIsAutoSuggest = !weightKg || weightKg === weightSuggestStr;
  const priceIsAutoSuggest = !priceEur || priceEur === priceSuggestStr;

  const applySuggested = () => {
    setWeightKg(weightSuggestStr);
    setPriceEur(priceSuggestStr);
  };

  const finishedDate = doneTs ? new Date(doneTs) : new Date();
  const finishedStr = finishedDate.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const elapsed =
    startTs && doneTs ? Math.round((doneTs - startTs) / 1000) : null;
  const elapsedStr =
    elapsed != null
      ? `${Math.floor(elapsed / 60)} min ${elapsed % 60} sek`
      : '—';

  const handleSave = () => {
    // Wenn nichts manuell eingegeben → speichere Tarif-Vorschlag
    const finalWeight = (weightKg && weightKg.trim()) || weightSuggestStr;
    const finalPrice = (priceEur && priceEur.trim()) || priceSuggestStr;
    const entry = {
      sendungsnummer: meta?.sendungsnummer || 'unbekannt',
      destination: meta?.destination || '—',
      createdAt: meta?.createdAtIso || null,
      createdDateStr: meta?.createdDate
        ? `${meta.createdDate} ${meta.createdTime}`
        : null,
      finishedAt: doneTs || Date.now(),
      durationSec: elapsed,
      durationEstimateSec: orderEstimateSec || null,
      palletCount,
      totalSkus: flatItems.length,
      totalUnits: flatItems.reduce((s, r) => s + (r.item.units || 0), 0),
      weightKg: finalWeight || null,
      priceEur: finalPrice || null,
      tariffApplied: !weightKg && !priceEur, // True wenn nur Tarif-Vorschlag verwendet
      keyBonrolleFnsku: topBonrolle?.item.fnsku || null,
      keyBigBagFnsku: topBigBag?.item.fnsku || null,
      // Detail-Status pro Artikel
      copiedFnskus: articleStatus.copied,
      uncopiedFnskus: articleStatus.uncopied,
      labeledFnskus: articleStatus.labeled,
      copiedCount: articleStatus.copied.length,
      uncopiedCount: articleStatus.uncopied.length,
      labeledCount: articleStatus.labeled.length,
      // Kategorien-Verteilung
      categoryBreakdown: categoryBreakdown.map((c) => ({
        cat: c.cat,
        count: c.count,
        pct: Math.round(c.pct * 1000) / 10, // %
      })),
      savedAtIso: new Date().toISOString(),
    };
    onSave(entry);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2500);
  };

  // Ref aktualisieren, damit Auto-Save den aktuellen handleSave aufrufen kann
  handleSaveRef.current = handleSave;

  return (
    <div
      className="lp-root"
      style={{
        position: 'fixed',
        inset: 0,
        background: T.bg,
        zIndex: 110,
        overflowY: 'auto',
        animation: 'lpFadeUp 0.25s ease forwards',
      }}
    >
      <div
        style={{
          padding: '18px 28px',
          borderBottom: `1px solid ${T.border}`,
          background: T.surface,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          position: 'sticky',
          top: 0,
          zIndex: 5,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 9.5,
              color: T.textMuted,
              letterSpacing: 1.8,
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            Auftragsabschluss
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: T.text,
              letterSpacing: -0.2,
              marginTop: 2,
            }}
          >
            {meta?.sendungsnummer || 'Lagerauftrag'}
          </div>
        </div>
        <button
          onClick={onClose}
          className="lp-btn2-hover"
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            color: T.textSub,
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ← Zurück zur Übersicht
        </button>
      </div>

      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: '28px 28px 80px',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
        }}
      >
        {/* Auftrags-Stammdaten */}
        <section
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            padding: '20px 24px',
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              color: T.textMuted,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            Auftrag-Daten
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 14,
            }}
          >
            <DetailField
              label="Sendungsnummer"
              value={meta?.sendungsnummer || '—'}
              mono
            />
            <DetailField
              label="Lieferadresse"
              value={meta?.destination || '—'}
              accent
            />
            <DetailField
              label="Auftrag erstellt"
              value={
                meta?.createdDate
                  ? `${meta.createdDate} um ${meta.createdTime}`
                  : '—'
              }
              mono
            />
            <DetailField
              label="Abgeschlossen am"
              value={finishedStr}
              mono
            />
            <DetailField
              label="Bearbeitungsdauer"
              value={elapsedStr}
              mono
            />
            <DetailField
              label="SKU · Einheiten"
              value={`${flatItems.length} · ${flatItems.reduce(
                (s, r) => s + (r.item.units || 0),
                0
              )}`}
              mono
            />
            {orderEstimateSec ? (
              <DetailField
                label="Geschätzte Dauer"
                value={`~${formatDuration(orderEstimateSec)}`}
                mono
              />
            ) : null}
          </div>
        </section>

        {/* Bearbeitungs-Übersicht — Kopiert/Etikettiert/Kategorien */}
        <section
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            padding: '20px 24px',
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              color: T.textMuted,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            Bearbeitungs-Übersicht
          </div>

          {/* Status-Karten */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 10,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                background: T.greenBg,
                border: `1px solid ${T.green}33`,
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  fontSize: 9.5,
                  color: T.green,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                Kopiert
              </div>
              <div
                className="lp-mono"
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: T.green,
                  letterSpacing: -0.5,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {articleStatus.copied.length}
                <span
                  style={{
                    fontSize: 13,
                    color: T.textSub,
                    fontWeight: 500,
                    marginLeft: 4,
                  }}
                >
                  / {flatItems.length}
                </span>
              </div>
            </div>

            <div
              style={{
                background: articleStatus.uncopied.length > 0 ? T.amberBg : T.bg,
                border: `1px solid ${
                  articleStatus.uncopied.length > 0 ? T.amber + '33' : T.border
                }`,
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  fontSize: 9.5,
                  color: articleStatus.uncopied.length > 0 ? T.amber : T.textMuted,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                Nicht kopiert
              </div>
              <div
                className="lp-mono"
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: articleStatus.uncopied.length > 0 ? T.amber : T.textMuted,
                  letterSpacing: -0.5,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {articleStatus.uncopied.length}
              </div>
            </div>

            <div
              style={{
                background: '#ECFEFF',
                border: `1px solid #0891B233`,
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  fontSize: 9.5,
                  color: '#0891B2',
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                🏷 Etikettiert
              </div>
              <div
                className="lp-mono"
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: '#0891B2',
                  letterSpacing: -0.5,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {articleStatus.labeled.length}
              </div>
            </div>
          </div>

          {/* Kategorien-Verteilung */}
          {categoryBreakdown.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: T.textMuted,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                Kategorien-Verteilung
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {categoryBreakdown
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map((c) => {
                    const color = CATEGORY_COLORS[c.cat] || T.textSub;
                    const pct = (c.pct * 100).toFixed(1);
                    return (
                      <div
                        key={c.cat}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '110px 1fr 56px 40px',
                          gap: 10,
                          alignItems: 'center',
                          fontSize: 12,
                        }}
                      >
                        <span style={{ color: T.text, fontWeight: 600 }}>
                          {CATEGORY_LABELS[c.cat] || c.cat}
                        </span>
                        <div
                          style={{
                            height: 8,
                            background: T.bg,
                            borderRadius: 4,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              background: `linear-gradient(90deg, ${color}, ${color}dd)`,
                              borderRadius: 4,
                            }}
                          />
                        </div>
                        <span
                          className="lp-mono"
                          style={{
                            fontSize: 11,
                            color: T.textSub,
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                            textAlign: 'right',
                          }}
                        >
                          {pct}%
                        </span>
                        <span
                          className="lp-mono"
                          style={{
                            fontSize: 11,
                            color: T.text,
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            textAlign: 'right',
                          }}
                        >
                          {c.count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </section>

        {/* Wichtigste Artikel — kopierbar */}
        <section
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            padding: '20px 24px',
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              color: T.textMuted,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            Wichtige Artikel — kopierbar
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <KeyArticleCard row={topBonrolle} label="Bonrolle" />
            <KeyArticleCard row={topBigBag} label="Big Bag" />
          </div>
        </section>

        {/* Gewicht + Preis (mit Tarif-Vorschlag) */}
        <section
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            padding: '20px 24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 14,
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                color: T.textMuted,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              Palettengewicht & Preis
            </div>
            <div
              style={{
                fontSize: 11,
                color: T.textSub,
                letterSpacing: 0.2,
              }}
            >
              Tarif:{' '}
              <span className="lp-mono" style={{ color: T.text, fontWeight: 600 }}>
                {getAdminConfig().tarif.kgPerPallet} kg
              </span>{' '}
              und{' '}
              <span className="lp-mono" style={{ color: T.text, fontWeight: 600 }}>
                {getAdminConfig().tarif.eurPerPallet} €
              </span>{' '}
              pro Palette · ×{' '}
              <span className="lp-mono" style={{ color: T.text, fontWeight: 600 }}>
                {palletCount}
              </span>{' '}
              Paletten
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 14,
            }}
          >
            <CopyableNumberField
              label="Gewicht"
              value={weightKg}
              onChange={setWeightKg}
              placeholder={`Vorschlag: ${weightSuggestStr}`}
              suffix="kg"
              suggestion={weightSuggestStr}
              suggestionActive={weightIsAutoSuggest}
            />
            <CopyableNumberField
              label="Preis"
              value={priceEur}
              onChange={setPriceEur}
              placeholder={`Vorschlag: ${priceSuggestStr}`}
              suffix="€"
              suggestion={priceSuggestStr}
              suggestionActive={priceIsAutoSuggest}
            />
          </div>

          {(weightIsAutoSuggest || priceIsAutoSuggest) && palletCount > 0 && (
            <button
              onClick={applySuggested}
              className="lp-btn2-hover"
              style={{
                marginTop: 12,
                padding: '8px 14px',
                background: T.bg,
                border: `1px solid ${T.borderStrong}`,
                color: T.text,
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 7,
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: 0.2,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              ⚡ Tarif anwenden ({weightSuggestStr} kg · {priceSuggestStr} €)
            </button>
          )}

          {/* Tarif-Tabelle als Hilfe */}
          <details
            style={{
              marginTop: 14,
              fontSize: 11,
              color: T.textSub,
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                color: T.textMuted,
                letterSpacing: 0.4,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              Tarif-Tabelle anzeigen
            </summary>
            <div
              style={{
                marginTop: 8,
                background: T.bg,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  background: T.surface,
                  fontSize: 9.5,
                  color: T.textMuted,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  padding: '6px 12px',
                  borderBottom: `1px solid ${T.border}`,
                }}
              >
                <span>Paletten</span>
                <span style={{ textAlign: 'right' }}>kg</span>
                <span style={{ textAlign: 'right' }}>€</span>
              </div>
              {[1, 2, 3, 4, 5].map((n) => {
                const active = palletCount === n;
                return (
                  <div
                    key={n}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      padding: '6px 12px',
                      background: active ? T.greenBg : 'transparent',
                      fontFamily: 'DM Mono, ui-monospace, monospace',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: 12,
                      color: active ? T.green : T.text,
                      fontWeight: active ? 700 : 500,
                      borderBottom: n < 5 ? `1px solid ${T.border}` : 'none',
                    }}
                  >
                    <span>
                      {active && '▸ '}
                      {n} Pal
                    </span>
                    <span style={{ textAlign: 'right' }}>{n * getAdminConfig().tarif.kgPerPallet}</span>
                    <span style={{ textAlign: 'right' }}>{n * getAdminConfig().tarif.eurPerPallet}</span>
                  </div>
                );
              })}
            </div>
          </details>
        </section>

        {/* Speichern + History */}
        <section
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            padding: '20px 24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: 240 }}>
              <div
                style={{
                  fontSize: 10.5,
                  color: T.textMuted,
                  letterSpacing: 1.6,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                Auftrag in Verlauf speichern
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: T.textSub,
                  letterSpacing: 0.2,
                }}
              >
                Speichert alle wichtigen Daten lokal in deinem Browser.
                Bereits gespeicherte Aufträge: <strong>{history.length}</strong>
              </div>
            </div>
            <button
              onClick={handleSave}
              className="lp-btn-hover"
              style={{
                background: savedAt ? T.green : T.text,
                color: '#fff',
                border: 'none',
                padding: '12px 22px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: 0.3,
                boxShadow: T.shadowMd,
                whiteSpace: 'nowrap',
              }}
            >
              {savedAt ? '✓ Gespeichert' : '💾 Auftrag speichern'}
            </button>
          </div>
        </section>

        {/* History */}
        {history.length > 0 && (
          <section
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 14,
              padding: '20px 24px',
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                color: T.textMuted,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              Verlauf · {history.length} Aufträge
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.slice(0, 10).map((h) => (
                <div
                  key={h.sendungsnummer + h.savedAtIso}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto auto',
                    gap: 14,
                    padding: '10px 12px',
                    background: T.bg,
                    borderRadius: 8,
                    fontSize: 11.5,
                    alignItems: 'center',
                  }}
                >
                  <span
                    className="lp-mono"
                    style={{ color: T.text, fontWeight: 600, letterSpacing: -0.1 }}
                  >
                    {h.sendungsnummer}
                  </span>
                  <span style={{ color: T.textSub }}>{h.destination}</span>
                  <span className="lp-mono" style={{ color: T.textSub }}>
                    {h.totalSkus} SKU · {h.totalUnits} Einh.
                  </span>
                  <span
                    className="lp-mono"
                    style={{ color: T.textMuted, fontSize: 10.5 }}
                  >
                    {new Date(h.savedAtIso).toLocaleDateString('de-DE')}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN PANEL — vollständig editierbare Verwaltung aller Tabellen.
   Auto-Save in sessionStorage. Bestätigungs-Dialog vor jeder Löschung.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Inline-Bestätigung: erster Klick = Warnung anzeigen ("Wirklich?"),
 * zweiter Klick innerhalb von 3s = ausführen. Verhindert versehentliche
 * Löschungen ohne nervigen Modal-Dialog.
 */
function ConfirmButton({ onConfirm, label = '×', confirmLabel = 'Wirklich?', size = 'sm', tone = 'danger', title }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  const color = tone === 'danger' ? '#dc2626' : T.amber;
  const bg = armed
    ? color
    : tone === 'danger' ? '#fef2f2' : T.amberBg;
  const fg = armed ? '#fff' : color;
  const padding = size === 'sm' ? '4px 8px' : '6px 12px';
  const fontSize = size === 'sm' ? 11 : 12;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      title={title || (armed ? 'Klicken zum Bestätigen' : 'Löschen')}
      style={{
        padding,
        fontSize,
        background: bg,
        color: fg,
        border: `1px solid ${color}66`,
        borderRadius: 6,
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontWeight: armed ? 700 : 500,
        letterSpacing: armed ? 0.5 : 0,
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

/**
 * Editierbares Zahlen-Feld mit Live-Validierung.
 * Wenn ungültig → roter Rahmen, kein Save.
 */
function NumField({ value, onChange, min, max, step = 1, suffix, placeholder, mono = true, w = '100%' }) {
  const [local, setLocal] = useState(String(value ?? ''));
  useEffect(() => { setLocal(String(value ?? '')); }, [value]);
  const num = Number(local.replace(',', '.'));
  const valid =
    local !== '' &&
    !Number.isNaN(num) &&
    (min == null || num >= min) &&
    (max == null || num <= max);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, width: w }}>
      <input
        type="text"
        inputMode="decimal"
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (valid) onChange(num);
          else setLocal(String(value ?? ''));
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        style={{
          flex: 1,
          minWidth: 0,
          padding: '5px 8px',
          background: T.surface,
          border: `1px solid ${valid ? T.border : '#dc2626'}`,
          borderRadius: 5,
          fontSize: 12,
          color: T.text,
          fontFamily: mono ? 'DM Mono, ui-monospace, monospace' : 'inherit',
          fontVariantNumeric: 'tabular-nums',
          outline: 'none',
        }}
      />
      {suffix && (
        <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 500 }}>
          {suffix}
        </span>
      )}
    </div>
  );
}

/** Editierbares Text-Feld (für Sig, etc). */
function TextField({ value, onChange, placeholder, mono = false, w = '100%' }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  return (
    <input
      type="text"
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const trimmed = local.trim();
        if (trimmed !== value) onChange(trimmed);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      style={{
        width: w,
        padding: '5px 8px',
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 5,
        fontSize: 12,
        color: T.text,
        fontFamily: mono ? 'DM Mono, ui-monospace, monospace' : 'inherit',
        outline: 'none',
      }}
    />
  );
}

/** Editierbares Zeit-Feld "HH:MM". */
function TimeField({ value, onChange, w = 80 }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  const valid = /^([01]?\d|2[0-3]):[0-5]\d$/.test(local);
  return (
    <input
      type="text"
      value={local}
      placeholder="HH:MM"
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (valid) onChange(local);
        else setLocal(value ?? '');
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      style={{
        width: w,
        padding: '5px 8px',
        background: T.surface,
        border: `1px solid ${valid ? T.border : '#dc2626'}`,
        borderRadius: 5,
        fontSize: 12,
        color: T.text,
        fontFamily: 'DM Mono, ui-monospace, monospace',
        fontVariantNumeric: 'tabular-nums',
        outline: 'none',
      }}
    />
  );
}

/* Tab-Definitionen für die Admin-Panel */
const ADMIN_TABS = [
  { id: 'catalog', label: 'Box-Katalog',    icon: '◫' },
  { id: 'amazon',  label: 'Amazon FBA',     icon: '▣' },
  { id: 'times',   label: 'Zeit-Schätzung', icon: '⏱' },
  { id: 'heights', label: 'Höhen-Mapping',  icon: '⇅' },
  { id: 'tarif',   label: 'Tarif',          icon: '€' },
  { id: 'workday', label: 'Arbeitstag',     icon: '◷' },
];

function AdminPanel({ open, onClose, config, onConfigChange }) {
  const [tab, setTab] = useState('catalog');
  const [savedFlash, setSavedFlash] = useState(false);
  const [importError, setImportError] = useState(null);
  const fileInputRef = useRef(null);

  // Zeige kurz "Gespeichert" nach jeder Änderung
  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }, []);

  const handleImportClick = useCallback(() => {
    setImportError(null);
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // erlaube erneutes Importieren der selben Datei
      if (!file) return;
      try {
        const next = await importAdminConfigFromFile(file);
        onConfigChange(next);
        flashSaved();
      } catch (err) {
        setImportError(err.message || 'Import fehlgeschlagen');
        setTimeout(() => setImportError(null), 4500);
      }
    },
    [onConfigChange, flashSaved]
  );

  const update = useCallback(
    (mutator) => {
      const next = mutator(JSON.parse(JSON.stringify(config)));
      saveAdminConfig(next);
      onConfigChange(next);
      flashSaved();
    },
    [config, onConfigChange, flashSaved]
  );

  const resetSection = useCallback(
    (section) => {
      update((cfg) => {
        const defaults = JSON.parse(JSON.stringify(ADMIN_DEFAULTS));
        cfg[section] = defaults[section];
        return cfg;
      });
    },
    [update]
  );

  // Esc schließt Panel
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(20,17,14,0.4)',
          zIndex: 120,
          animation: 'lpFadeUp 0.18s ease forwards',
        }}
      />
      {/* Panel */}
      <div
        className="lp-root ap-modal"
        style={{
          position: 'fixed',
          top: '5%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(1100px, 94vw)',
          maxHeight: '90vh',
          background: T.surface,
          borderRadius: 16,
          boxShadow: T.shadowLg,
          zIndex: 121,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'lpPanelIn 0.22s ease forwards',
        }}
      >
        {/* Header */}
        <header
          className="ap-header"
          style={{
            padding: '18px 24px',
            borderBottom: `1px solid ${T.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: T.bg,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 20 }}>⚙</span>
          <div>
            <div
              style={{
                fontSize: 9.5, color: T.textMuted, letterSpacing: 1.6,
                textTransform: 'uppercase', fontWeight: 700,
              }}
            >
              Admin-Panel
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: T.text, letterSpacing: -0.3 }}>
              Tabellen-Verwaltung
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {/* Save-Indikator */}
          <div
            className="ap-save-badge"
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 6,
              background: savedFlash ? T.greenBg : T.surface,
              border: `1px solid ${savedFlash ? T.green : T.border}`,
              color: savedFlash ? T.green : T.textMuted,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              transition: 'all 0.2s ease',
              minWidth: 110,
              textAlign: 'center',
            }}
          >
            {savedFlash ? '✓ Gespeichert' : 'Auto-Save aktiv'}
          </div>
          {/* Import / Export */}
          <div style={{ display: 'inline-flex', gap: 6 }} className="ap-io-group">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileSelected}
              style={{ display: 'none' }}
            />
            <button
              onClick={exportAdminConfig}
              className="lp-btn2-hover"
              title="Konfiguration als JSON-Datei exportieren"
              style={{
                background: T.surface, border: `1px solid ${T.border}`,
                color: T.textSub, padding: '7px 12px', borderRadius: 8,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', display: 'inline-flex',
                alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 13 }}>↓</span>
              <span className="ap-io-label">Export</span>
            </button>
            <button
              onClick={handleImportClick}
              className="lp-btn2-hover"
              title="Konfiguration aus JSON-Datei importieren"
              style={{
                background: T.surface, border: `1px solid ${T.border}`,
                color: T.textSub, padding: '7px 12px', borderRadius: 8,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', display: 'inline-flex',
                alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 13 }}>↑</span>
              <span className="ap-io-label">Import</span>
            </button>
          </div>
          <ConfirmButton
            label="Defaults"
            confirmLabel="Wirklich alle Defaults?"
            size="md"
            tone="danger"
            onConfirm={() => {
              resetAdminConfig();
              onConfigChange(getAdminConfig());
              flashSaved();
            }}
          />
          <button
            onClick={onClose}
            className="lp-btn2-hover"
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              color: T.textSub,
              padding: '7px 14px',
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            Schließen
            <kbd
              className="ap-kbd"
              style={{
                fontSize: 9.5, background: T.bg, padding: '2px 5px',
                borderRadius: 3, border: `1px solid ${T.border}`,
                fontFamily: 'DM Mono, monospace', letterSpacing: 0.4,
              }}
            >
              Esc
            </kbd>
          </button>
        </header>

        {/* Import-Fehler-Banner */}
        {importError && (
          <div
            style={{
              padding: '10px 18px',
              background: '#FEF2F2',
              borderBottom: '1px solid #FECACA',
              color: '#B91C1C',
              fontSize: 12.5,
              fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <span style={{ fontSize: 14 }}>⚠</span>
            <span>Import fehlgeschlagen: {importError}</span>
          </div>
        )}

        {/* Tabs */}
        <div
          className="ap-tabs"
          style={{
            display: 'flex',
            gap: 0,
            borderBottom: `1px solid ${T.border}`,
            background: T.surface,
            padding: '0 24px',
            flexShrink: 0,
          }}
        >
          {ADMIN_TABS.map((t) => (
            <button
              key={t.id}
              className="ap-tab-btn"
              onClick={() => setTab(t.id)}
              style={{
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${tab === t.id ? T.text : 'transparent'}`,
                fontSize: 12.5,
                fontWeight: tab === t.id ? 600 : 500,
                color: tab === t.id ? T.text : T.textSub,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 13, opacity: 0.7 }}>{t.icon}</span>
              <span className="ap-tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div
          className="ap-content"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            background: T.bg,
          }}
        >
          {tab === 'catalog' && (
            <AdminCatalogTab
              catalog={config.boxCatalog}
              onChange={(next) => update((c) => ({ ...c, boxCatalog: next }))}
              onReset={() => resetSection('boxCatalog')}
            />
          )}
          {tab === 'amazon' && (
            <AdminAmazonTab
              products={config.amazonProducts || []}
              onChange={(next) => update((c) => ({ ...c, amazonProducts: next }))}
              onReset={() => resetSection('amazonProducts')}
            />
          )}
          {tab === 'times' && (
            <AdminTimesTab
              times={config.times}
              onChange={(next) => update((c) => ({ ...c, times: next }))}
              onReset={() => resetSection('times')}
            />
          )}
          {tab === 'heights' && (
            <AdminHeightsTab
              heights={config.heights}
              onChange={(next) => update((c) => ({ ...c, heights: next }))}
              onReset={() => resetSection('heights')}
            />
          )}
          {tab === 'tarif' && (
            <AdminTarifTab
              tarif={config.tarif}
              onChange={(next) => update((c) => ({ ...c, tarif: next }))}
              onReset={() => resetSection('tarif')}
            />
          )}
          {tab === 'workday' && (
            <AdminWorkdayTab
              workday={config.workday}
              onChange={(next) => update((c) => ({ ...c, workday: next }))}
              onReset={() => resetSection('workday')}
            />
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Sub-Komponenten der einzelnen Tabs ────────────────────────────────── */

function AdminSectionHeader({ title, description, count, onReset }) {
  return (
    <div
      className="ap-section-hdr"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        marginBottom: 18,
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 10, color: T.textMuted, letterSpacing: 1.6,
            textTransform: 'uppercase', fontWeight: 700, marginBottom: 4,
          }}
        >
          Verwaltung
        </div>
        <div
          style={{
            fontSize: 18, fontWeight: 600, color: T.text,
            letterSpacing: -0.4, marginBottom: 4,
          }}
        >
          {title}
          {count != null && (
            <span
              className="lp-mono"
              style={{
                marginLeft: 10,
                fontSize: 11,
                fontWeight: 500,
                color: T.textSub,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              ({count})
            </span>
          )}
        </div>
        {description && (
          <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.5 }}>
            {description}
          </div>
        )}
      </div>
      {onReset && (
        <ConfirmButton
          label="Standard wiederherstellen"
          confirmLabel="Wirklich? Alle Änderungen weg!"
          size="md"
          tone="warn"
          onConfirm={onReset}
        />
      )}
    </div>
  );
}

/* ── Box-Katalog Tab ─────────────────────────────────────────────────── */
function AdminCatalogTab({ catalog, onChange, onReset }) {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [showInactive, setShowInactive] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [grouped, setGrouped] = useState(true);

  // Index updates by id (stable across filter)
  const updateById = (id, patch) => {
    onChange(catalog.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const updateMatchById = (id, key, val) => {
    onChange(
      catalog.map((r) =>
        r.id === id ? { ...r, match: { ...r.match, [key]: val } } : r
      )
    );
  };
  const updateDimById = (id, dimIdx, val) => {
    onChange(
      catalog.map((r) => {
        if (r.id !== id) return r;
        const dims = [...r.dims];
        dims[dimIdx] = val;
        return { ...r, dims };
      })
    );
  };
  const removeById = (id) => onChange(catalog.filter((r) => r.id !== id));
  const addRow = () => {
    const newId = `b${String(Date.now()).slice(-6)}`;
    onChange([
      ...catalog,
      {
        id: newId, sig: `neu-${newId}`, category: 'Standard',
        artikel: 'Neuer Artikel', ean: '',
        match: { rollen: 50, w: 57, h: 35 }, dims: [18.5, 18.5, 12],
        weightKg: 0, hinweis: '', active: true,
      },
    ]);
    setExpandedId(newId);
  };

  // Categories list
  const categories = useMemo(() => {
    const set = new Set(['Standard']);
    catalog.forEach((c) => c.category && set.add(c.category));
    return Array.from(set);
  }, [catalog]);

  // Filtered + sorted view
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((c) => {
      if (filterCat !== 'all' && c.category !== filterCat) return false;
      if (!showInactive && c.active === false) return false;
      if (!q) return true;
      const hay = [
        c.sig, c.artikel, c.ean, c.category, c.hinweis,
        `${c.match?.rollen}r-${c.match?.w}x${c.match?.h}`,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [catalog, search, filterCat, showInactive]);

  // Group by category for the rendered list
  const groupedView = useMemo(() => {
    if (!grouped) return [{ key: '__all', items: visible }];
    const map = new Map();
    visible.forEach((c) => {
      const k = c.category || 'Standard';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(c);
    });
    return Array.from(map, ([key, items]) => ({ key, items }));
  }, [visible, grouped]);

  // Stats
  const totalActive = catalog.filter((c) => c.active !== false).length;
  const totalWeight = catalog.reduce((s, c) => s + (c.weightKg || 0), 0);

  return (
    <div>
      <AdminSectionHeader
        title="Box-Katalog (Volumen & Gewicht)"
        description="Vollständige Datenbank aller Verpackungsboxen mit Maßen, Gewicht, EAN und Notizen. Wird zur Volumen-Berechnung der Paletten verwendet. Inaktive Einträge werden bei der Match-Suche übersprungen."
        count={catalog.length}
        onReset={onReset}
      />

      {/* Stats-Bar */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 8,
          marginBottom: 14,
          fontFamily: 'DM Mono, monospace',
          fontSize: 11.5,
        }}
      >
        <StatPill label="Gesamt" value={catalog.length} tone="default" />
        <StatPill label="Aktiv" value={totalActive} tone="green" />
        <StatPill label="Inaktiv" value={catalog.length - totalActive} tone="muted" />
        <StatPill label="Kategorien" value={categories.length} tone="blue" />
        <StatPill label="Σ Gewicht" value={`${totalWeight.toFixed(1)} kg`} tone="amber" />
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14,
          alignItems: 'center',
        }}
      >
        {/* Search */}
        <div
          style={{
            position: 'relative', flex: '1 1 220px', minWidth: 200,
          }}
        >
          <span
            style={{
              position: 'absolute', left: 12, top: '50%',
              transform: 'translateY(-50%)', fontSize: 13,
              color: T.textMuted, pointerEvents: 'none',
            }}
          >🔍</span>
          <input
            type="text"
            value={search}
            placeholder="Suche: Artikel, EAN, Signatur…"
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 34px',
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              fontSize: 13,
              fontFamily: 'inherit',
              color: T.text,
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => (e.target.style.borderColor = T.accent)}
            onBlur={(e) => (e.target.style.borderColor = T.border)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute', right: 8, top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent', border: 'none',
                color: T.textMuted, cursor: 'pointer',
                fontSize: 16, lineHeight: 1, padding: 4,
              }}
            >×</button>
          )}
        </div>

        {/* Category filter */}
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          style={{
            padding: '9px 12px',
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            fontSize: 12.5,
            fontFamily: 'inherit',
            color: T.text,
            cursor: 'pointer',
            minWidth: 140,
          }}
        >
          <option value="all">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Toggle: Gruppen */}
        <ToggleChip
          active={grouped}
          onClick={() => setGrouped((v) => !v)}
          label="Gruppieren"
          icon="▤"
        />
        {/* Toggle: Inaktive */}
        <ToggleChip
          active={showInactive}
          onClick={() => setShowInactive((v) => !v)}
          label="Inaktive"
          icon="◌"
        />

        {/* Add */}
        <button
          onClick={addRow}
          className="lp-btn-hover"
          style={{
            padding: '9px 14px',
            background: T.accent,
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: 14 }}>+</span> Box
        </button>
      </div>

      {/* Tabelle: Karten-Layout (responsive ohne festes Grid) */}
      {visible.length === 0 ? (
        <div
          style={{
            padding: '40px 20px', textAlign: 'center',
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 12, color: T.textMuted, fontSize: 13,
          }}
        >
          Keine Einträge gefunden.
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                marginLeft: 10, background: 'transparent', border: 'none',
                color: T.blue, cursor: 'pointer', fontFamily: 'inherit',
                textDecoration: 'underline', fontSize: 12.5,
              }}
            >Suche zurücksetzen</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groupedView.map((group) => (
            <div key={group.key}>
              {grouped && (
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 6, padding: '0 4px',
                  }}
                >
                  <span
                    style={{
                      fontSize: 9.5, fontWeight: 700, color: T.textMuted,
                      letterSpacing: 1.4, textTransform: 'uppercase',
                    }}
                  >
                    ▸ {group.key}
                  </span>
                  <span
                    className="lp-mono"
                    style={{
                      fontSize: 10, color: T.textMuted,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {group.items.length}
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.border }} />
                </div>
              )}
              <div
                style={{
                  background: T.surface,
                  border: `1px solid ${T.border}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                {group.items.map((row, idx) => (
                  <CatalogRow
                    key={row.id}
                    row={row}
                    idx={catalog.indexOf(row)}
                    isLast={idx === group.items.length - 1}
                    expanded={expandedId === row.id}
                    onToggleExpand={() =>
                      setExpandedId((id) => (id === row.id ? null : row.id))
                    }
                    onUpdate={(patch) => updateById(row.id, patch)}
                    onUpdateMatch={(k, v) => updateMatchById(row.id, k, v)}
                    onUpdateDim={(i, v) => updateDimById(row.id, i, v)}
                    onRemove={() => removeById(row.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Eine Katalog-Zeile mit kollabierter Übersicht + Detail-Bereich ──── */
function CatalogRow({ row, idx, isLast, expanded, onToggleExpand, onUpdate, onUpdateMatch, onUpdateDim, onRemove }) {
  const isInactive = row.active === false;

  return (
    <div
      style={{
        borderBottom: isLast ? 'none' : `1px solid ${T.border}`,
        opacity: isInactive ? 0.55 : 1,
        transition: 'opacity 0.15s ease',
      }}
    >
      {/* Compact row: clickable header */}
      <div
        onClick={onToggleExpand}
        className="lp-row-hover"
        style={{
          display: 'grid',
          gridTemplateColumns: '28px minmax(0, 1fr) auto auto',
          gap: 10,
          alignItems: 'center',
          padding: '10px 14px',
          cursor: 'pointer',
        }}
      >
        {/* Index + expand chevron */}
        <span
          className="lp-mono"
          style={{
            fontSize: 11,
            color: T.textMuted,
            fontVariantNumeric: 'tabular-nums',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span
            style={{
              display: 'inline-block', width: 10,
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
              fontSize: 9, color: T.textSub,
            }}
          >▶</span>
        </span>

        {/* Title block */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13, fontWeight: 600, color: T.text,
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textDecoration: isInactive ? 'line-through' : 'none',
            }}
          >
            {row.artikel || row.sig}
          </div>
          <div
            style={{
              fontSize: 10.5, color: T.textMuted,
              display: 'flex', gap: 8, flexWrap: 'wrap',
              fontFamily: 'DM Mono, monospace',
              marginTop: 2,
            }}
          >
            <span>{row.match?.rollen}r · {row.match?.w}×{row.match?.h}</span>
            <span style={{ color: T.borderStrong }}>·</span>
            <span>{row.dims?.[0]}×{row.dims?.[1]}×{row.dims?.[2]} cm</span>
            {row.weightKg != null && row.weightKg > 0 && (
              <>
                <span style={{ color: T.borderStrong }}>·</span>
                <span>{row.weightKg.toFixed(2)} kg</span>
              </>
            )}
            {row.maxPerPallet != null && (
              <>
                <span style={{ color: T.borderStrong }}>·</span>
                <span
                  title="Maximal Kartons pro Palette"
                  style={{
                    color: T.blue, fontWeight: 600,
                    background: T.blueBg, padding: '0 5px',
                    borderRadius: 3,
                  }}
                >
                  ≤ {row.maxPerPallet}/Pal
                </span>
              </>
            )}
            {row.ean && (
              <>
                <span style={{ color: T.borderStrong }}>·</span>
                <span style={{ color: T.textSub }}>EAN {row.ean}</span>
              </>
            )}
          </div>
        </div>

        {/* Active toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate({ active: !isInactive }); }}
          title={isInactive ? 'Aktivieren' : 'Deaktivieren'}
          style={{
            width: 30, height: 18, borderRadius: 10,
            background: isInactive ? T.borderStrong : T.green,
            border: 'none', cursor: 'pointer',
            position: 'relative', flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          <span
            style={{
              position: 'absolute', top: 2, left: isInactive ? 2 : 14,
              width: 14, height: 14, borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              transition: 'left 0.15s',
            }}
          />
        </button>

        {/* Index pill */}
        <span
          className="lp-mono"
          style={{
            fontSize: 10, color: T.textMuted, fontVariantNumeric: 'tabular-nums',
            background: T.bg, padding: '2px 6px', borderRadius: 4,
            border: `1px solid ${T.border}`, flexShrink: 0,
          }}
        >
          #{String(idx + 1).padStart(3, '0')}
        </span>
      </div>

      {/* Expanded detail editor */}
      {expanded && (
        <div
          style={{
            padding: '14px 18px 18px 18px',
            background: T.bg,
            borderTop: `1px solid ${T.border}`,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            alignItems: 'flex-start',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <FieldGroup label="Artikel-Name">
            <TextField
              value={row.artikel ?? ''}
              onChange={(v) => onUpdate({ artikel: v })}
            />
          </FieldGroup>

          <FieldGroup label="Signatur">
            <TextField
              value={row.sig ?? ''}
              mono
              onChange={(v) => onUpdate({ sig: v })}
            />
          </FieldGroup>

          <FieldGroup label="Kategorie">
            <TextField
              value={row.category ?? 'Standard'}
              onChange={(v) => onUpdate({ category: v })}
            />
          </FieldGroup>

          <FieldGroup label="EAN-Code">
            <TextField
              value={row.ean ?? ''}
              mono
              onChange={(v) => onUpdate({ ean: v })}
            />
          </FieldGroup>

          {/* Match-Trio */}
          <FieldGroup label="Match (Rollen / Breite / Höhe)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <NumField
                value={row.match?.rollen ?? 0}
                min={1}
                max={9999}
                onChange={(v) => onUpdateMatch('rollen', v)}
              />
              <NumField
                value={row.match?.w ?? 0}
                min={1}
                max={500}
                onChange={(v) => onUpdateMatch('w', v)}
              />
              <NumField
                value={row.match?.h ?? 0}
                min={1}
                max={500}
                onChange={(v) => onUpdateMatch('h', v)}
              />
            </div>
          </FieldGroup>

          {/* Karton-Maße */}
          <FieldGroup label="Karton (L × B × H, cm)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <NumField
                value={row.dims?.[0] ?? 0}
                step={0.5}
                min={0.1}
                onChange={(v) => onUpdateDim(0, v)}
              />
              <NumField
                value={row.dims?.[1] ?? 0}
                step={0.5}
                min={0.1}
                onChange={(v) => onUpdateDim(1, v)}
              />
              <NumField
                value={row.dims?.[2] ?? 0}
                step={0.5}
                min={0.1}
                onChange={(v) => onUpdateDim(2, v)}
              />
            </div>
          </FieldGroup>

          <FieldGroup label="Gewicht (kg)">
            <NumField
              value={row.weightKg ?? 0}
              step={0.01}
              min={0}
              max={500}
              suffix="kg"
              onChange={(v) => onUpdate({ weightKg: v })}
            />
          </FieldGroup>

          <FieldGroup label="Max pro Palette">
            <NumField
              value={row.maxPerPallet ?? 0}
              step={1}
              min={0}
              max={9999}
              suffix="Krt."
              placeholder="—"
              onChange={(v) => onUpdate({ maxPerPallet: v > 0 ? v : null })}
            />
          </FieldGroup>

          <FieldGroup label="Volumen (cm³)">
            <div
              className="lp-mono"
              style={{
                padding: '8px 10px',
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 6,
                fontSize: 12,
                color: T.textSub,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {((row.dims?.[0] || 0) * (row.dims?.[1] || 0) * (row.dims?.[2] || 0)).toFixed(0)}
            </div>
          </FieldGroup>

          <FieldGroup label="Hinweis" full>
            <TextField
              value={row.hinweis ?? ''}
              placeholder="z.B. wird produziert, ÖKO-Variante…"
              onChange={(v) => onUpdate({ hinweis: v })}
            />
          </FieldGroup>

          {/* Footer actions */}
          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex', gap: 8,
              justifyContent: 'flex-end',
              borderTop: `1px solid ${T.border}`,
              paddingTop: 12, marginTop: 4,
            }}
          >
            <ConfirmButton
              label="Eintrag löschen"
              confirmLabel="Wirklich löschen?"
              size="md"
              tone="danger"
              onConfirm={onRemove}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Kleine UI-Helfer für die professionellen Tabs ─────────────────── */
function StatPill({ label, value, tone = 'default' }) {
  const palette = {
    default: { bg: T.surface, fg: T.text, border: T.border },
    green:   { bg: T.greenBg, fg: T.green, border: T.green },
    blue:    { bg: T.blueBg, fg: T.blue, border: T.blue },
    amber:   { bg: T.amberBg, fg: T.amber, border: T.amber },
    muted:   { bg: T.bg, fg: T.textMuted, border: T.border },
  }[tone] || { bg: T.surface, fg: T.text, border: T.border };
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 6,
        padding: '5px 10px',
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 6,
      }}
    >
      <span
        style={{
          fontSize: 9, color: T.textMuted,
          fontWeight: 700, letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >{label}</span>
      <span
        style={{
          fontSize: 12, fontWeight: 700, color: palette.fg,
          fontFamily: 'DM Mono, monospace',
          fontVariantNumeric: 'tabular-nums',
        }}
      >{value}</span>
    </div>
  );
}

function ToggleChip({ active, onClick, label, icon }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 12px',
        background: active ? T.text : T.surface,
        border: `1px solid ${active ? T.text : T.border}`,
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        color: active ? '#fff' : T.textSub,
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        transition: 'all 0.15s',
      }}
    >
      <span style={{ fontSize: 11, opacity: 0.85 }}>{icon}</span>
      {label}
    </button>
  );
}

function FieldGroup({ label, children, full = false }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
      <div
        style={{
          fontSize: 9, color: T.textMuted, letterSpacing: 1.4,
          textTransform: 'uppercase', fontWeight: 700, marginBottom: 5,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/* ── Amazon FBA Produkt-Tab ──────────────────────────────────────────── */
function AdminAmazonTab({ products, onChange, onReset }) {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const updateById = (id, patch) =>
    onChange(products.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removeById = (id) => onChange(products.filter((p) => p.id !== id));
  const addRow = () => {
    const newId = `a${String(Date.now()).slice(-6)}`;
    onChange([
      ...products,
      {
        id: newId, asin: '', category: 'Sonstiges',
        name: 'Neues Produkt', l: 20, w: 15, h: 10, weightKg: 0.5,
      },
    ]);
    setExpandedId(newId);
  };

  const categories = useMemo(() => {
    const set = new Set();
    products.forEach((p) => p.category && set.add(p.category));
    return Array.from(set);
  }, [products]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (filterCat !== 'all' && p.category !== filterCat) return false;
      if (!q) return true;
      const hay = [p.name, p.asin, p.category].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [products, search, filterCat]);

  const grouped = useMemo(() => {
    const map = new Map();
    visible.forEach((p) => {
      const k = p.category || 'Sonstiges';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(p);
    });
    return Array.from(map, ([key, items]) => ({ key, items }));
  }, [visible]);

  const totalWeight = products.reduce((s, p) => s + (p.weightKg || 0), 0);
  const totalVolume = products.reduce(
    (s, p) => s + (p.l || 0) * (p.w || 0) * (p.h || 0), 0
  ) / 1000; // dm³ = liter

  return (
    <div>
      <AdminSectionHeader
        title="Amazon FBA Produktkatalog"
        description="Maße & Gewichte aller SWIPARO Amazon-Produkte. Wird für FBA-Versanddokumentation verwendet — Silosäcke, Sandsäcke, Big Bags, Klebeband, Holzwolle u. a."
        count={products.length}
        onReset={onReset}
      />

      {/* Stats */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14,
        }}
      >
        <StatPill label="Produkte" value={products.length} />
        <StatPill label="Kategorien" value={categories.length} tone="blue" />
        <StatPill label="Σ Gewicht" value={`${totalWeight.toFixed(1)} kg`} tone="amber" />
        <StatPill label="Σ Volumen" value={`${totalVolume.toFixed(1)} L`} tone="green" />
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14,
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <span
            style={{
              position: 'absolute', left: 12, top: '50%',
              transform: 'translateY(-50%)', fontSize: 13,
              color: T.textMuted, pointerEvents: 'none',
            }}
          >🔍</span>
          <input
            type="text"
            value={search}
            placeholder="Suche: Name, ASIN…"
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '9px 12px 9px 34px',
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
              color: T.text, outline: 'none',
            }}
          />
        </div>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          style={{
            padding: '9px 12px',
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit',
            color: T.text, cursor: 'pointer', minWidth: 140,
          }}
        >
          <option value="all">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={addRow}
          className="lp-btn-hover"
          style={{
            padding: '9px 14px', background: T.accent, border: 'none',
            borderRadius: 8, color: '#fff', fontSize: 12.5, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: 14 }}>+</span> Produkt
        </button>
      </div>

      {/* Tabelle */}
      {visible.length === 0 ? (
        <div
          style={{
            padding: '40px 20px', textAlign: 'center',
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 12, color: T.textMuted, fontSize: 13,
          }}
        >
          Keine Produkte gefunden.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map((group) => (
            <div key={group.key}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginBottom: 6, padding: '0 4px',
                }}
              >
                <span
                  style={{
                    fontSize: 9.5, fontWeight: 700, color: T.textMuted,
                    letterSpacing: 1.4, textTransform: 'uppercase',
                  }}
                >
                  ▸ {group.key}
                </span>
                <span
                  className="lp-mono"
                  style={{ fontSize: 10, color: T.textMuted }}
                >{group.items.length}</span>
                <div style={{ flex: 1, height: 1, background: T.border }} />
              </div>
              <div
                style={{
                  background: T.surface, border: `1px solid ${T.border}`,
                  borderRadius: 12, overflow: 'hidden',
                }}
              >
                {group.items.map((row, idx) => {
                  const expanded = expandedId === row.id;
                  const vol = (row.l || 0) * (row.w || 0) * (row.h || 0);
                  return (
                    <div
                      key={row.id}
                      style={{
                        borderBottom: idx === group.items.length - 1
                          ? 'none' : `1px solid ${T.border}`,
                      }}
                    >
                      <div
                        onClick={() =>
                          setExpandedId((id) => (id === row.id ? null : row.id))
                        }
                        className="lp-row-hover"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '20px minmax(0, 1fr) auto',
                          gap: 10, alignItems: 'center',
                          padding: '10px 14px', cursor: 'pointer',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.15s',
                            fontSize: 9, color: T.textSub,
                          }}
                        >▶</span>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13, fontWeight: 600, color: T.text,
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >{row.name}</div>
                          <div
                            style={{
                              fontSize: 10.5, color: T.textMuted,
                              fontFamily: 'DM Mono, monospace',
                              marginTop: 2,
                              display: 'flex', gap: 8, flexWrap: 'wrap',
                            }}
                          >
                            <span>{row.asin || '—'}</span>
                            <span style={{ color: T.borderStrong }}>·</span>
                            <span>{row.l}×{row.w}×{row.h} cm</span>
                            <span style={{ color: T.borderStrong }}>·</span>
                            <span>{(row.weightKg || 0).toFixed(2)} kg</span>
                            <span style={{ color: T.borderStrong }}>·</span>
                            <span>{vol.toFixed(0)} cm³</span>
                          </div>
                        </div>
                        <span
                          className="lp-mono"
                          style={{
                            fontSize: 10, color: T.textMuted,
                            background: T.bg, padding: '2px 6px',
                            borderRadius: 4, border: `1px solid ${T.border}`,
                          }}
                        >#{products.indexOf(row) + 1}</span>
                      </div>

                      {expanded && (
                        <div
                          style={{
                            padding: '14px 18px 18px',
                            background: T.bg,
                            borderTop: `1px solid ${T.border}`,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: 12,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <FieldGroup label="Produkt-Name" full>
                            <TextField
                              value={row.name}
                              onChange={(v) => updateById(row.id, { name: v })}
                            />
                          </FieldGroup>
                          <FieldGroup label="ASIN / EAN">
                            <TextField
                              value={row.asin}
                              mono
                              onChange={(v) => updateById(row.id, { asin: v })}
                            />
                          </FieldGroup>
                          <FieldGroup label="Kategorie">
                            <TextField
                              value={row.category}
                              onChange={(v) => updateById(row.id, { category: v })}
                            />
                          </FieldGroup>
                          <FieldGroup label="Maße (L × B × H, cm)">
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
                              }}
                            >
                              <NumField
                                value={row.l}
                                step={0.5}
                                min={0.1}
                                onChange={(v) => updateById(row.id, { l: v })}
                              />
                              <NumField
                                value={row.w}
                                step={0.5}
                                min={0.1}
                                onChange={(v) => updateById(row.id, { w: v })}
                              />
                              <NumField
                                value={row.h}
                                step={0.5}
                                min={0.1}
                                onChange={(v) => updateById(row.id, { h: v })}
                              />
                            </div>
                          </FieldGroup>
                          <FieldGroup label="Gewicht (kg)">
                            <NumField
                              value={row.weightKg ?? 0}
                              step={0.01}
                              min={0}
                              max={500}
                              suffix="kg"
                              onChange={(v) => updateById(row.id, { weightKg: v })}
                            />
                          </FieldGroup>
                          <FieldGroup label="Volumen">
                            <div
                              className="lp-mono"
                              style={{
                                padding: '8px 10px', background: T.surface,
                                border: `1px solid ${T.border}`, borderRadius: 6,
                                fontSize: 12, color: T.textSub,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {vol.toFixed(0)} cm³ · {(vol / 1000).toFixed(2)} L
                            </div>
                          </FieldGroup>
                          <div
                            style={{
                              gridColumn: '1 / -1',
                              display: 'flex', gap: 8,
                              justifyContent: 'flex-end',
                              borderTop: `1px solid ${T.border}`,
                              paddingTop: 12, marginTop: 4,
                            }}
                          >
                            <ConfirmButton
                              label="Produkt löschen"
                              confirmLabel="Wirklich löschen?"
                              size="md"
                              tone="danger"
                              onConfirm={() => removeById(row.id)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Zeit-Schätzung Tab ──────────────────────────────────────────────── */
function AdminTimesTab({ times, onChange, onReset }) {
  const update = (key, value) => onChange({ ...times, [key]: value });

  const fields = [
    {
      key: 'palletBase',
      label: 'Sockelzeit pro Palette',
      desc: 'Alte Palette zurück + neue holen + grundsätzliches Setup',
      suffix: 'sek',
      min: 0,
      max: 7200,
    },
    {
      key: 'between',
      label: 'Pause zwischen Paletten',
      desc: 'Zeit zwischen dem Abschluss einer Palette und Beginn der nächsten',
      suffix: 'sek',
      min: 0,
      max: 7200,
    },
    {
      key: 'perArticle',
      label: 'Pro Standard-Artikel',
      desc: 'Reguläre Thermorollen, Heipa, Veit etc.',
      suffix: 'sek',
      min: 1,
      max: 600,
    },
    {
      key: 'perArticleTacho',
      label: 'Pro Tacho-Spezial-Artikel',
      desc: 'Tachographenrollen 57×15, 57×6 sowie 60er-Packs',
      suffix: 'sek',
      min: 1,
      max: 600,
    },
    {
      key: 'perFormatVariety',
      label: 'Pro extra Format auf einer Palette',
      desc: 'Zuschlag für jede zusätzliche Format-Gruppe (mehr Vielfalt = länger)',
      suffix: 'sek',
      min: 0,
      max: 600,
    },
  ];

  // Beispiel-Berechnung
  const exampleArticles = 8;
  const exampleFormats = 2;
  const examplePalletSec =
    times.palletBase +
    exampleArticles * times.perArticle +
    Math.max(0, exampleFormats - 1) * times.perFormatVariety;

  return (
    <div>
      <AdminSectionHeader
        title="Zeit-Schätzung"
        description="Modell zur Berechnung der voraussichtlichen Bearbeitungsdauer. Wird im WorkdayTimer und im Auftrags-Estimate angezeigt."
        onReset={onReset}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}
      >
        {fields.map((f) => (
          <div
            key={f.key}
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                fontSize: 9.5, color: T.textMuted, letterSpacing: 1.4,
                textTransform: 'uppercase', fontWeight: 700, marginBottom: 4,
              }}
            >
              {f.label}
            </div>
            <div style={{ fontSize: 11, color: T.textSub, marginBottom: 10, lineHeight: 1.4 }}>
              {f.desc}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 100 }}>
                <NumField
                  value={times[f.key]}
                  min={f.min}
                  max={f.max}
                  suffix={f.suffix}
                  onChange={(v) => update(f.key, v)}
                />
              </div>
              <span
                style={{
                  fontSize: 11, color: T.textMuted,
                  fontFamily: 'DM Mono, monospace',
                }}
              >
                = {formatDuration(times[f.key])}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Live-Beispiel */}
      <div
        style={{
          marginTop: 20,
          padding: '16px 20px',
          background: T.accent,
          color: '#fff',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          boxShadow: '0 8px 32px rgba(123,131,235,0.25)',
        }}
      >
        <span style={{ fontSize: 9.5, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>
          Live-Beispiel
        </span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
          1 Palette · {exampleArticles} Standard-Artikel · {exampleFormats} Formate
        </span>
        <span style={{ flex: 1 }} />
        <span
          className="lp-mono"
          style={{
            fontSize: 22, fontWeight: 700,
            fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5,
          }}
        >
          ~{formatDuration(examplePalletSec)}
        </span>
      </div>
    </div>
  );
}

/* ── Höhen-Mapping Tab ────────────────────────────────────────────────── */
function AdminHeightsTab({ heights, onChange, onReset }) {
  const update = (idx, key, val) => {
    onChange(heights.map((h, i) => (i === idx ? { ...h, [key]: val } : h)));
  };
  const remove = (idx) => onChange(heights.filter((_, i) => i !== idx));
  const add = () => onChange([...heights, { from: 0, to: 0 }]);

  return (
    <div>
      <AdminSectionHeader
        title="Höhen-Äquivalenz"
        description='Manche Etiketten benutzen Innen-Durchmesser (Hülse), andere Aussen-Durchmesser für die gleiche physische Rolle. Beispiel: 57×9 ≡ 57×30 (Hülse 9 mm = Aussen-Höhe 30 mm). Diese Mappings stellen sicher, dass solche Artikel als gleiches Format gruppiert werden.'
        count={heights.length}
        onReset={onReset}
      />

      {/* Horizontal scroll wrapper for the fixed-column grid */}
      <div className="ap-tbl-scroll" style={{ borderRadius: 12, border: `1px solid ${T.border}` }}>
        <div
          style={{
            background: T.surface,
            borderRadius: 12,
            overflow: 'hidden',
            minWidth: 380,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr 40px 1fr 60px',
              gap: 12,
              padding: '10px 14px',
              borderBottom: `1px solid ${T.border}`,
              background: T.bg,
              fontSize: 9.5, fontWeight: 700, color: T.textMuted,
              letterSpacing: 1.2, textTransform: 'uppercase',
              alignItems: 'center',
            }}
          >
            <span>#</span>
            <span>Wert (Innen)</span>
            <span style={{ textAlign: 'center' }}>↔</span>
            <span>Aussen-Wert (normalisiert)</span>
            <span style={{ textAlign: 'center' }}>—</span>
          </div>

          {heights.map((h, idx) => (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 1fr 40px 1fr 60px',
                gap: 12,
                padding: '8px 14px',
                borderBottom: idx < heights.length - 1 ? `1px solid ${T.border}` : 'none',
                alignItems: 'center',
              }}
            >
              <span
                className="lp-mono"
                style={{ fontSize: 11, color: T.textMuted }}
              >
                {String(idx + 1).padStart(2, '0')}
              </span>
              <NumField
                value={h.from}
                min={1}
                max={500}
                suffix="mm"
                onChange={(v) => update(idx, 'from', v)}
              />
              <span style={{ textAlign: 'center', fontSize: 18, color: T.textMuted }}>↔</span>
              <NumField
                value={h.to}
                min={1}
                max={500}
                suffix="mm"
                onChange={(v) => update(idx, 'to', v)}
              />
              <ConfirmButton onConfirm={() => remove(idx)} />
            </div>
          ))}

          <button
            onClick={add}
            className="lp-btn2-hover"
            style={{
              width: '100%',
              padding: '12px',
              background: T.bg,
              border: 'none',
              borderTop: `1px solid ${T.border}`,
              color: T.textSub,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            + Neue Äquivalenz hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Tarif Tab ────────────────────────────────────────────────────────── */
function AdminTarifTab({ tarif, onChange, onReset }) {
  return (
    <div>
      <AdminSectionHeader
        title="Tarif"
        description="Standard-Werte pro Palette. Wird beim Abschluss als Vorschlag für Gewicht und Preis angezeigt. Linear hochgerechnet anhand der Palettenanzahl."
        onReset={onReset}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: '18px 20px',
          }}
        >
          <div
            style={{
              fontSize: 9.5, color: T.textMuted, letterSpacing: 1.4,
              textTransform: 'uppercase', fontWeight: 700, marginBottom: 6,
            }}
          >
            Gewicht pro Palette
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <NumField
              value={tarif.kgPerPallet}
              min={0}
              max={5000}
              suffix="kg"
              w={120}
              onChange={(v) => onChange({ ...tarif, kgPerPallet: v })}
            />
          </div>
        </div>

        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: '18px 20px',
          }}
        >
          <div
            style={{
              fontSize: 9.5, color: T.textMuted, letterSpacing: 1.4,
              textTransform: 'uppercase', fontWeight: 700, marginBottom: 6,
            }}
          >
            Preis pro Palette
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <NumField
              value={tarif.eurPerPallet}
              min={0}
              max={50000}
              suffix="€"
              w={120}
              onChange={(v) => onChange({ ...tarif, eurPerPallet: v })}
            />
          </div>
        </div>
      </div>

      {/* Vorschau Tabelle */}
      <div
        style={{
          marginTop: 20,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: '14px 18px',
        }}
      >
        <div
          style={{
            fontSize: 9.5, color: T.textMuted, letterSpacing: 1.4,
            textTransform: 'uppercase', fontWeight: 700, marginBottom: 10,
          }}
        >
          Vorschau (1 → 6 Paletten)
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '60px 1fr 1fr',
            gap: 4,
            fontSize: 12,
            fontFamily: 'DM Mono, monospace',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span style={{ color: T.textMuted, fontSize: 10 }}>Paletten</span>
          <span style={{ color: T.textMuted, fontSize: 10, textAlign: 'right' }}>Gewicht</span>
          <span style={{ color: T.textMuted, fontSize: 10, textAlign: 'right' }}>Preis</span>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Fragment key={n}>
              <span style={{ color: T.text, fontWeight: 600 }}>{n} P</span>
              <span style={{ textAlign: 'right' }}>
                {(n * tarif.kgPerPallet).toLocaleString('de-DE')} kg
              </span>
              <span style={{ textAlign: 'right' }}>
                {(n * tarif.eurPerPallet).toLocaleString('de-DE')} €
              </span>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Arbeitstag Tab ───────────────────────────────────────────────────── */
function AdminWorkdayTab({ workday, onChange, onReset }) {
  const fields = [
    { key: 'start', label: 'Arbeitsbeginn', desc: 'Beginn der Arbeitszeit (Tagesanfang)' },
    { key: 'end', label: 'Arbeitsende', desc: 'Ende der Arbeitszeit (Feierabend)' },
    { key: 'pauseStart', label: 'Pause-Beginn', desc: 'Beginn der Mittagspause (Timer wird angehalten)' },
    { key: 'pauseEnd', label: 'Pause-Ende', desc: 'Ende der Mittagspause' },
    { key: 'target', label: 'Ziel-Zeit', desc: 'Bis zu dieser Uhrzeit sollten alle Aufträge fertig sein' },
  ];

  return (
    <div>
      <AdminSectionHeader
        title="Arbeitstag"
        description="Konfiguration des Workday-Timers: Arbeitsbeginn, Pause und Zielzeit. Alle Werte als HH:MM (24h-Format)."
        onReset={onReset}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        {fields.map((f) => (
          <div
            key={f.key}
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                fontSize: 9.5, color: T.textMuted, letterSpacing: 1.4,
                textTransform: 'uppercase', fontWeight: 700, marginBottom: 4,
              }}
            >
              {f.label}
            </div>
            <div style={{ fontSize: 11, color: T.textSub, marginBottom: 10, lineHeight: 1.4 }}>
              {f.desc}
            </div>
            <TimeField
              value={workday[f.key]}
              onChange={(v) => onChange({ ...workday, [f.key]: v })}
              w={100}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Dashboard Overview — Übersichts-Bildschirm: Auslastung + KPIs + Quick-CTAs
   ───────────────────────────────────────────────────────────────────────── */
function DashboardOverview({
  sortedPallets, palletVolumes, loadingProgress, allDone,
  onGoToPallets, onStartFokus,
}) {
  const all = Object.values(palletVolumes);
  const totalVol = all.reduce((s, v) => s + v.totalCm3, 0);
  const totalCap = sortedPallets.length * PALLET_VOLUME_CM3;
  const totalWeightKg = all.reduce((s, v) => s + v.totalWeightKg, 0);
  const totalWeightCap = all.reduce((s, v) => s + v.weightCapKg, 0);
  const totalCartons = all.reduce((s, v) => s + v.totalCartons, 0);
  const totalUnknown = all.reduce((s, v) => s + v.unmatchedCount, 0);
  const avgFill = all.length > 0
    ? all.reduce((s, v) => s + v.fillPct, 0) / all.length : 0;
  const volPct = totalCap > 0 ? (totalVol / totalCap) * 100 : 0;
  const wPct = totalWeightCap > 0 ? (totalWeightKg / totalWeightCap) * 100 : 0;
  const avgPct = avgFill * 100;
  const c = statusColors(
    avgFill >= 1 ? 'overflow'
      : avgFill >= 0.92 ? 'tight'
        : avgFill >= 0.75 ? 'optimal'
          : avgFill >= 0.5 ? 'good'
            : avgFill > 0 ? 'low' : 'empty'
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 14, padding: '20px 22px',
        display: 'flex', flexDirection: 'column', gap: 14,
        boxShadow: T.shadowSm,
      }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: 9.5, color: T.textMuted, letterSpacing: 1.5,
            textTransform: 'uppercase', fontWeight: 700,
          }}>Gesamt-Auslastung</span>
          <span className="lp-mono" style={{
            fontSize: 36, fontWeight: 700, color: c.fg,
            letterSpacing: -1.2, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {avgPct.toFixed(0)}<span style={{ fontSize: 18, opacity: 0.5 }}>%</span>
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
            textTransform: 'uppercase', color: c.fg,
            padding: '4px 9px', borderRadius: 5,
            background: c.bg, border: `1px solid ${c.fg}33`,
          }}>{c.label}</span>
          <div style={{ flex: 1 }} />
          {totalUnknown > 0 && (
            <span style={{
              fontSize: 10.5, color: T.amber, fontWeight: 600,
              background: T.amberBg, padding: '4px 9px',
              borderRadius: 5, border: `1px solid ${T.amber}33`,
            }}>≈ {totalUnknown}× geschätzt</span>
          )}
        </div>
        <div>
          <div style={{
            display: 'flex', alignItems: 'baseline',
            justifyContent: 'space-between', marginBottom: 6,
          }}>
            <span style={{
              fontSize: 11, color: T.textSub, letterSpacing: 0.5, fontWeight: 500,
            }}>Ladefortschritt</span>
            <span className="lp-mono" style={{
              fontSize: 12, color: allDone ? T.green : T.text, fontWeight: 600,
              fontVariantNumeric: 'tabular-nums', letterSpacing: -0.2,
            }}>
              {loadingProgress.done}/{loadingProgress.total} · {loadingProgress.pct.toFixed(0)}%
              {allDone && <span style={{ marginLeft: 8 }}>✓ alles geladen</span>}
            </span>
          </div>
          <div style={{
            height: 8, background: T.bg, borderRadius: 4, overflow: 'hidden',
          }}>
            <div style={{
              width: `${loadingProgress.pct}%`, height: '100%',
              background: allDone
                ? `linear-gradient(90deg, ${T.green}, #22c55e)`
                : `linear-gradient(90deg, ${T.accent}, ${T.accentHover})`,
              borderRadius: 4,
              transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            }} />
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
      }}>
        {[
          { label: 'Volumen', value: `${(totalVol / 1_000_000).toFixed(2)} m³`,
            detail: `von ${(totalCap / 1_000_000).toFixed(2)} m³ · ${volPct.toFixed(0)}%` },
          { label: 'Gewicht', value: `${totalWeightKg.toFixed(0)} kg`,
            detail: `von ${totalWeightCap} kg · ${wPct.toFixed(0)}%` },
          { label: 'Kartons', value: `${totalCartons}`,
            detail: `${sortedPallets.length} Paletten · ⌀ ${(totalCartons / Math.max(1, sortedPallets.length)).toFixed(0)}` },
          { label: 'Paletten', value: `${sortedPallets.length}`,
            detail: `${all.length} mit Daten` },
        ].map((k) => (
          <div key={k.label} style={{
            padding: '14px 16px',
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            boxShadow: T.shadowSm,
          }}>
            <div style={{
              fontSize: 9.5, color: T.textMuted, letterSpacing: 1.4,
              textTransform: 'uppercase', fontWeight: 700, marginBottom: 6,
            }}>{k.label}</div>
            <div className="lp-mono" style={{
              fontSize: 20, color: T.text, fontWeight: 700,
              letterSpacing: -0.5, lineHeight: 1.1,
              fontVariantNumeric: 'tabular-nums',
            }}>{k.value}</div>
            <div style={{
              fontSize: 10.5, color: T.textMuted, marginTop: 4,
              fontFamily: 'DM Mono, monospace',
            }}>{k.detail}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
        <button onClick={onStartFokus} className="lp-btn-hover" style={{
          padding: '11px 20px', background: T.accent, color: '#fff',
          border: `1px solid ${T.accent}`, borderRadius: 10,
          fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit', letterSpacing: 0.2,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 18px rgba(91,98,216,0.25)',
        }}>
          <span style={{ fontSize: 15 }}>◎</span>Fokus-Modus starten
        </button>
        <button onClick={onGoToPallets} className="lp-btn2-hover" style={{
          padding: '11px 20px', background: T.surface, color: T.text,
          border: `1px solid ${T.border}`, borderRadius: 10,
          fontSize: 13.5, fontWeight: 500, cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 15 }}>▤</span>Paletten ansehen →
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Workflow Steps Definition (für Stepper-Mode)
   ───────────────────────────────────────────────────────────────────────── */
const WORKFLOW_STEPS = [
  { id: 'upload',    num: 1, label: 'Upload',    requiresData: false },
  { id: 'pruefen',   num: 2, label: 'Prüfen',    requiresData: true },
  { id: 'verteilen', num: 3, label: 'Verteilen', requiresData: true },
  { id: 'packen',    num: 4, label: 'Packen',    requiresData: true },
  { id: 'abschluss', num: 5, label: 'Abschluss', requiresData: true },
];

/* ─────────────────────────────────────────────────────────────────────────
   Main component
   ───────────────────────────────────────────────────────────────────────── */
export default function LagerauftragParser({ onBack }) {
  /* ── Restore session from localStorage on first mount ─────────────────
     Falls der User die Seite reloaded, holen wir Auftrag, Fortschritt und
     Layout-Einstellungen zurück. So geht keine Arbeit verloren.            */
  const restored = useMemo(() => loadSession(), []);

  const [data, setData] = useState(() => restored?.data || null);
  const [rawText, setRawText] = useState(() => restored?.rawText || '');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState(() => restored?.fileName || null);
  const [sequenceMode, setSequenceMode] = useState(() => !!restored?.sequenceMode);
  const [printMode, setPrintMode] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  // ── New revolutionary features ───────────────────────────────────────
  const [loadStartTs, setLoadStartTs] = useState(() => restored?.loadStartTs || null);
  const [loadDoneTs, setLoadDoneTs] = useState(() => restored?.loadDoneTs || null);
  const [showValidation, setShowValidation] = useState(false);
  const [loadedSet, setLoadedSet] = useState(() => restored?.loadedSet || new Set());
  const [labeledSet, setLabeledSet] = useState(() => restored?.labeledSet || new Set());
  const [focusGroup, setFocusGroup] = useState(() => restored?.focusGroup || null);
  const [highlightedPalletId, setHighlightedPalletId] = useState(null);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [fokusOpen, setFokusOpen] = useState(false);
  const [abschlussOpen, setAbschlussOpen] = useState(false);
  const [weightKg, setWeightKg] = useState(() => restored?.weightKg || '');
  const [priceEur, setPriceEur] = useState(() => restored?.priceEur || '');
  const [history, setHistory] = useState(() => loadHistory());
  // Lifted: copy-Marker (FokusModus & AbschlussScreen teilen sich den Set)
  const [copiedSet, setCopiedSet] = useState(() => restored?.copiedSet || new Set());
  // Admin-Panel Zustand + Live-Config
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminConfig, setAdminConfig] = useState(() => {
    const cfg = getAdminConfig();
    setHeightsConfig(cfg.heights);
    return cfg;
  });
  const palletRefs = useRef({});

  /* ── App-Shell Navigation (Workspace + Workflow) ─────────────────── */
  const [layoutMode, setLayoutMode] = useState(() => restored?.layoutMode || 'workspace');
  const [view, setView] = useState(() => restored?.view || 'pallets');
  const [paletteTab, setPaletteTab] = useState(() => restored?.paletteTab || 'liste');
  const [workflowStep, setWorkflowStep] = useState(() => restored?.workflowStep || 'upload');
  const [activePalletId, setActivePalletId] = useState(null);

  // Subscribe auf externe Config-Änderungen (z.B. wenn AdminPanel speichert).
  // Push der heights-Config in das parser-Modul, damit normalizeHeight die
  // aktuellen Mappings sieht.
  useEffect(() => {
    return subscribeAdminConfig((next) => {
      setHeightsConfig(next.heights);
      setAdminConfig({ ...next });
    });
  }, []);

  /* ── Auto-save session on every relevant state change ─────────────────
     Wir speichern nur, wenn ein Auftrag geladen ist. Wenn data === null
     (z.B. nach Reset), löschen wir die Session.                            */
  useEffect(() => {
    if (!data) {
      clearSession();
      return;
    }
    saveSession({
      data, rawText, fileName,
      loadStartTs, loadDoneTs,
      loadedSet, labeledSet, copiedSet,
      weightKg, priceEur,
      sequenceMode, focusGroup,
      layoutMode, view, paletteTab, workflowStep,
    });
  }, [
    data, rawText, fileName,
    loadStartTs, loadDoneTs,
    loadedSet, labeledSet, copiedSet,
    weightKg, priceEur,
    sequenceMode, focusGroup,
    layoutMode, view, paletteTab, workflowStep,
  ]);

  // Sorted pallets — derived from data
  const sortedPallets = useMemo(
    () => (data ? sortPallets(data.pallets) : []),
    [data]
  );

  // Einzelne-SKU items aus dem Parse-Ergebnis (kann leer sein)
  const einzelneSkuItems = useMemo(
    () => (data && data.einzelneSkuItems ? data.einzelneSkuItems : []),
    [data]
  );

  // Auto-Distribution: berechne wo jeder Einzelne-SKU-Artikel hingeht
  const distribution = useMemo(
    () => distributeEinzelneSku(sortedPallets, einzelneSkuItems),
    [sortedPallets, einzelneSkuItems, adminConfig]
  );

  // Flat ordered list of items across all pallets in render order
  const flatItems = useMemo(() => {
    const out = [];
    sortedPallets.forEach((p) => {
      p.items.forEach((item) => {
        out.push({ palletId: p.id, palletNumber: p.number, item });
      });
    });
    return out;
  }, [sortedPallets]);

  // Validation report — recomputed on data change
  const validationReport = useMemo(() => {
    if (!data || !rawText) return null;
    return validateParsing(rawText, data);
  }, [data, rawText]);

  // Per-pallet volume stats — INKLUSIVE der zugewiesenen Einzelne-SKU-Artikel
  const palletVolumes = useMemo(() => {
    const map = {};
    sortedPallets.forEach((p) => {
      // Welche Einzelne-SKU-Artikel landen auf dieser Palette?
      const extras = einzelneSkuItems.filter((esku) => {
        const key = esku.fnsku || esku.sku || esku.title;
        return distribution.assignments[key] === p.id;
      });
      map[p.id] = palletVolumeStats(p, extras);
    });
    return map;
  }, [sortedPallets, einzelneSkuItems, distribution, adminConfig]);

  // Pallet-Screens für FokusModus — inkl. zugewiesener Einzelne-SKU als Sondergruppe
  const palletScreens = useMemo(
    () => buildPalletScreens(sortedPallets, einzelneSkuItems, distribution),
    [sortedPallets, einzelneSkuItems, distribution]
  );

  // Map: palletId → assigned Einzelne-SKU items (für Time-Estimate + PalletCard)
  const eskuByPalletId = useMemo(() => {
    const map = {};
    for (const esku of einzelneSkuItems) {
      const key = esku.fnsku || esku.sku || esku.title;
      const target = distribution.assignments[key];
      if (target) {
        if (!map[target]) map[target] = [];
        map[target].push(esku);
      }
    }
    return map;
  }, [einzelneSkuItems, distribution]);

  // Geschätzte Gesamtdauer des Auftrags (Sekunden) — inkl. Einzelne-SKU-Anteile
  const orderEstimateSec = useMemo(
    () => orderEstimateSeconds(sortedPallets, eskuByPalletId),
    [sortedPallets, eskuByPalletId, adminConfig]
  );

  // Aggregierte Counts für Fokus-Chips
  const groupCounts = useMemo(() => {
    const counts = {
      total: flatItems.length,
      thermorollen: 0,
      heipa: 0,
      veit: 0,
      tachographenrollen: 0,
      produktion: 0,
      sonstige: 0,
    };
    flatItems.forEach((r) => {
      counts[r.item.category] = (counts[r.item.category] || 0) + 1;
    });
    return counts;
  }, [flatItems]);

  // Reserve-Kandidaten und wiederholte useItems
  const { reserveFnskus } = useMemo(
    () => detectReserveCandidates(flatItems),
    [flatItems]
  );
  const repeatedUseItems = useMemo(
    () => detectRepeatedUseItems(flatItems),
    [flatItems]
  );

  // Loading progress — keys sind palletId::fnsku, damit derselbe Artikel
  // auf zwei Paletten unabhängig markiert wird.
  const loadingProgress = useMemo(() => {
    const total = flatItems.length;
    const done = flatItems.filter((r) =>
      loadedSet.has(`${r.palletId}::${r.item.fnsku}`)
    ).length;
    return { total, done, pct: total > 0 ? (done / total) * 100 : 0 };
  }, [flatItems, loadedSet]);

  const allDone =
    flatItems.length > 0 && loadingProgress.done === loadingProgress.total;

  // Stop timer when all loaded
  useEffect(() => {
    if (allDone && !loadDoneTs && loadStartTs) {
      setLoadDoneTs(Date.now());
    }
  }, [allDone, loadDoneTs, loadStartTs]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) {
      setError('Bitte eine .docx-Datei auswählen');
      return;
    }
    setLoading(true);
    setError(null);
    setFileName(file.name);
    setLoadedSet(new Set());
    setLabeledSet(new Set());
    setCopiedSet(new Set());
    setLoadDoneTs(null);
    setLoadStartTs(null);
    setWeightKg('');
    setPriceEur('');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const raw = result.value;
      const parsed = parseLagerauftragText(raw);
      if (!parsed.pallets.length) {
        setError(
          'Keine PALETTE-Blöcke gefunden — bitte das Dateiformat prüfen.'
        );
        setData(null);
        setRawText('');
      } else {
        setData(parsed);
        setRawText(raw);
        setLoadStartTs(Date.now());
      }
    } catch (e) {
      console.error(e);
      setError('Fehler beim Verarbeiten: ' + (e.message || 'unbekannt'));
      setData(null);
      setRawText('');
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleLoaded = useCallback((fnsku) => {
    setLoadedSet((prev) => {
      const next = new Set(prev);
      if (next.has(fnsku)) next.delete(fnsku);
      else next.add(fnsku);
      return next;
    });
  }, []);

  const toggleLabeled = useCallback((fnsku) => {
    setLabeledSet((prev) => {
      const next = new Set(prev);
      if (next.has(fnsku)) next.delete(fnsku);
      else next.add(fnsku);
      return next;
    });
  }, []);

  // Scroll to and flash a pallet card
  const scrollToItem = useCallback((row) => {
    setActiveItem(row.item);
    setHighlightedPalletId(row.palletId);
    const el = palletRefs.current[row.palletId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => setHighlightedPalletId(null), 1500);
  }, []);

  // Esc closes detail / Cmd+K opens spotlight
  // (Когда FokusModus открыт — он сам обрабатывает все клавиши.)
  useEffect(() => {
    if (fokusOpen) return;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (data) setSpotlightOpen(true);
        return;
      }
      if (e.key === 'Escape') {
        if (spotlightOpen) {
          setSpotlightOpen(false);
        } else if (abschlussOpen) {
          setAbschlussOpen(false);
        } else if (showValidation) {
          setShowValidation(false);
        } else if (activeItem) {
          setActiveItem(null);
        } else if (printMode) {
          setPrintMode(false);
        } else if (focusGroup) {
          setFocusGroup(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeItem, printMode, data, focusGroup, spotlightOpen, showValidation, fokusOpen, abschlussOpen]);

  // Compute starting global index for each pallet (for sequence mode)
  const palletStartIndex = useMemo(() => {
    const map = {};
    let idx = 1;
    for (const p of sortedPallets) {
      map[p.id] = idx;
      idx += p.items.length;
    }
    return map;
  }, [sortedPallets]);

  if (printMode) {
    return (
      <div className="lp-root" style={{ background: '#fff', minHeight: '100vh' }}>
        <PrintLayout
          flatItems={flatItems}
          meta={data?.meta}
          onExitPrint={() => setPrintMode(false)}
        />
      </div>
    );
  }

  /* ── Helper components for sidebar ─────────────────────────────────── */
  const NavItem = ({ icon, label, active, onClick, badge, danger }) => (
    <button
      type="button"
      className={`lp-sidebar-item ${active ? 'is-active' : ''}`}
      onClick={onClick}
      title={label}
      style={danger ? { color: T.green } : undefined}
    >
      <span className="lp-sidebar-icon">{icon}</span>
      <span>{label}</span>
      {badge != null && <span className="lp-sidebar-badge">{badge}</span>}
    </button>
  );

  const MobileTab = ({ icon, label, active, onClick }) => (
    <button
      type="button"
      className={`lp-mobile-tab ${active ? 'is-active' : ''}`}
      onClick={onClick}
    >
      <span className="lp-mobile-tab-icon">{icon}</span>
      {label}
    </button>
  );

  /* ── Workflow step navigation helpers ──────────────────────────────── */
  const stepIdx = WORKFLOW_STEPS.findIndex((s) => s.id === workflowStep);
  const goToStep = (id) => setWorkflowStep(id);
  const nextStep = () => {
    const next = WORKFLOW_STEPS[stepIdx + 1];
    if (next && (!next.requiresData || data)) {
      if (next.id === 'abschluss') setAbschlussOpen(true);
      else setWorkflowStep(next.id);
    }
  };
  const prevStep = () => {
    const prev = WORKFLOW_STEPS[stepIdx - 1];
    if (prev) setWorkflowStep(prev.id);
  };

  /* ── Auto-advance step when file uploaded ──────────────────────────── */
  useEffect(() => {
    if (data && workflowStep === 'upload') {
      setWorkflowStep('pruefen');
    }
  }, [data, workflowStep]);

  /* ── Title for TopBar ──────────────────────────────────────────────── */
  const viewTitle = layoutMode === 'workflow'
    ? `Schritt ${stepIdx + 1}: ${WORKFLOW_STEPS[stepIdx]?.label || ''}`
    : !data ? 'Willkommen'
      : view === 'dashboard' ? 'Übersicht'
        : view === 'pallets' ? 'Paletten'
          : 'Lagerauftrag';

  return (
    <div className="lp-root lp-shell">
      {/* ╔════════════════════ SIDEBAR ════════════════════╗ */}
      <aside className="lp-sidebar">
        <div className="lp-sidebar-brand">
          <div className="lp-sidebar-brand-logo">
            <img src="/brand/logo-icon.svg" alt="Logo" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{
              fontSize: 9, color: T.textMuted, letterSpacing: 1.4,
              textTransform: 'uppercase', fontWeight: 700, lineHeight: 1.2,
            }}>SwiparoApp</div>
            <div style={{
              fontSize: 13.5, color: T.text, fontWeight: 700,
              letterSpacing: -0.2, lineHeight: 1.3, marginTop: 2,
            }}>Lagerauftrag</div>
          </div>
        </div>

        {/* Layout-Mode Toggle */}
        <div className="lp-mode-toggle">
          <button
            className={`lp-mode-toggle-btn ${layoutMode === 'workspace' ? 'is-active' : ''}`}
            onClick={() => setLayoutMode('workspace')}
            title="Workspace — freies Arbeiten"
          >
            <span style={{ fontSize: 12 }}>▤</span>
            Workspace
          </button>
          <button
            className={`lp-mode-toggle-btn ${layoutMode === 'workflow' ? 'is-active' : ''}`}
            onClick={() => setLayoutMode('workflow')}
            title="Workflow — Schritt für Schritt"
          >
            <span style={{ fontSize: 12 }}>→</span>
            Workflow
          </button>
        </div>

        {/* Workspace navigation */}
        {layoutMode === 'workspace' && (
          <>
            {data ? (
              <>
                <div className="lp-sidebar-section-label">Auftrag</div>
                <NavItem icon="▦" label="Übersicht"
                  active={view === 'dashboard'}
                  onClick={() => setView('dashboard')} />
                <NavItem icon="▤" label="Paletten"
                  active={view === 'pallets'}
                  onClick={() => setView('pallets')}
                  badge={sortedPallets.length} />

                {/* Palette mini-list with fill bars */}
                {view === 'pallets' && sortedPallets.length > 0 && (
                  <div className="lp-pal-list">
                    {sortedPallets.map((p) => {
                      const v = palletVolumes[p.id];
                      const fill = v ? v.fillPct : 0;
                      const c = statusColors(
                        fill >= 1 ? 'overflow' :
                        fill >= 0.92 ? 'tight' :
                        fill >= 0.75 ? 'optimal' :
                        fill >= 0.5 ? 'good' :
                        fill > 0 ? 'low' : 'empty'
                      );
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`lp-pal-item ${activePalletId === p.id ? 'is-active' : ''}`}
                          onClick={() => {
                            setActivePalletId(p.id);
                            const el = palletRefs.current[p.id];
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              setHighlightedPalletId(p.id);
                              setTimeout(() => setHighlightedPalletId(null), 1500);
                            }
                          }}
                        >
                          <span className="lp-pal-id">{p.id}</span>
                          <span className="lp-pal-mini-bar">
                            <span style={{
                              width: `${Math.min(100, fill * 100)}%`,
                              background: c.fg,
                            }} />
                          </span>
                          <span className="lp-pal-pct">{(fill * 100).toFixed(0)}%</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <NavItem icon="◎" label="Fokus-Modus"
                  onClick={() => setFokusOpen(true)} />
                <NavItem icon="⌕" label="Suche"
                  onClick={() => setSpotlightOpen(true)}
                  badge="⌘K" />

                <div className="lp-sidebar-section-label">Aktionen</div>
                <NavItem icon="⎙" label="Drucken"
                  onClick={() => setPrintMode(true)} />
                <NavItem icon={allDone ? '✓' : '◷'} label="Abschluss"
                  onClick={() => setAbschlussOpen(true)}
                  danger={allDone} />
              </>
            ) : (
              <div style={{
                padding: '14px 12px', fontSize: 11.5,
                color: T.textMuted, lineHeight: 1.5,
              }}>
                Lade einen Lagerauftrag, um zu starten.
              </div>
            )}
          </>
        )}

        {/* Workflow mode shows step list in sidebar */}
        {layoutMode === 'workflow' && (
          <>
            <div className="lp-sidebar-section-label">Workflow</div>
            {WORKFLOW_STEPS.map((s, i) => (
              <NavItem
                key={s.id}
                icon={i < stepIdx ? '✓' : i === stepIdx ? '●' : '○'}
                label={`${s.num}. ${s.label}`}
                active={s.id === workflowStep}
                onClick={() => {
                  if (s.requiresData && !data) return;
                  if (s.id === 'abschluss' && data) {
                    setAbschlussOpen(true);
                  } else {
                    setWorkflowStep(s.id);
                  }
                }}
              />
            ))}
            {data && (
              <>
                <div className="lp-sidebar-section-label">Aktionen</div>
                <NavItem icon="⌕" label="Suche"
                  onClick={() => setSpotlightOpen(true)} badge="⌘K" />
                <NavItem icon="⎙" label="Drucken"
                  onClick={() => setPrintMode(true)} />
              </>
            )}
          </>
        )}

        <div className="lp-sidebar-spacer" />

        <div className="lp-sidebar-section-label">System</div>
        <NavItem icon="⚙" label="Admin" onClick={() => setAdminOpen(true)} />

        <div className="lp-sidebar-meta">
          {layoutMode === 'workspace' ? 'Workspace' : 'Workflow'} · {sortedPallets.length || 0} Pal
        </div>
      </aside>

      {/* ╔════════════════════ MAIN AREA ════════════════════╗ */}
      <div className="lp-main">
        {/* TopBar */}
        <header className="lp-topbar">
          <button className="lp-mobile-menu-btn" aria-label="Menü">☰</button>
          <div className="lp-topbar-title">{viewTitle}</div>
          {data && fileName && (
            <div className="lp-topbar-context">
              <span>{fileName}</span>
              {data.meta?.shipDate && (
                <><span className="sep">·</span><span>{data.meta.shipDate}</span></>
              )}
              {data.meta?.dossier && (
                <><span className="sep">·</span><span>{data.meta.dossier}</span></>
              )}
            </div>
          )}
          <div style={{ flex: 1 }} />
          {data && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <ValidationBadge
                report={validationReport}
                onClick={() => setShowValidation(true)}
              />
              {layoutMode === 'workspace' && (
                <ToggleBtn
                  active={sequenceMode}
                  onClick={() => setSequenceMode((v) => !v)}
                  title="Globale fortlaufende Nummerierung"
                >
                  <span style={{ fontSize: 14 }}>≡</span>
                  Reihenfolge
                </ToggleBtn>
              )}
              <button
                onClick={() => setSpotlightOpen(true)}
                className="lp-btn2-hover"
                title="Suche (⌘K / Ctrl+K)"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px',
                  background: T.surface,
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  fontSize: 12, color: T.textSub,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: 14, color: T.textMuted }}>⌕</span>
                Suche
                <kbd style={{
                  fontSize: 9.5, color: T.textMuted,
                  background: T.bg, padding: '2px 5px', borderRadius: 3,
                  border: `1px solid ${T.border}`,
                  fontFamily: 'DM Mono, monospace', letterSpacing: 0.4,
                  marginLeft: 2,
                }}>⌘K</kbd>
              </button>
            </div>
          )}
        </header>

        {/* Workflow Stepper (only in workflow mode) */}
        {layoutMode === 'workflow' && (
          <div className="lp-stepper">
            {WORKFLOW_STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`lp-step ${
                  i < stepIdx ? 'is-done' :
                  i === stepIdx ? 'is-current' : ''
                }`}
                onClick={() => {
                  if (s.requiresData && !data) return;
                  if (s.id === 'abschluss' && data) setAbschlussOpen(true);
                  else setWorkflowStep(s.id);
                }}
                disabled={s.requiresData && !data}
              >
                <span className="lp-step-circle">
                  {i < stepIdx ? '✓' : s.num}
                </span>
                <span className="lp-step-label">{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* ╔════════════════════ CONTENT ════════════════════╗ */}
        <main className={`lp-content ${!data ? 'is-empty' : ''}`}>
          {/* ─── Empty state ─── */}
          {!data && (
            <div style={{ width: '100%', maxWidth: 720 }}>
              <DropZone onFile={handleFile} hasFile={false} />
              {fileName && (
                <div style={{
                  marginTop: 12, fontSize: 11.5, color: T.textMuted,
                  letterSpacing: 0.3, textAlign: 'center',
                }}>
                  <span className="lp-mono">{fileName}</span>
                  {loading && <span style={{ marginLeft: 8 }}>· wird verarbeitet…</span>}
                </div>
              )}
              {error && (
                <div style={{
                  marginTop: 16, padding: '12px 16px',
                  background: T.amberBg,
                  border: `1px solid rgba(217,119,6,0.30)`,
                  borderRadius: 8, color: T.amber,
                  fontSize: 12.5, fontWeight: 500,
                }}>{error}</div>
              )}
            </div>
          )}

          {/* ─── Loaded data — view-routing ─── */}
          {data && (
            <>
              {/* Compact upload strip */}
              <div style={{ marginBottom: 20 }}>
                <DropZone onFile={handleFile} hasFile={true} />
                {error && (
                  <div style={{
                    marginTop: 12, padding: '10px 14px',
                    background: T.amberBg,
                    border: `1px solid rgba(217,119,6,0.30)`,
                    borderRadius: 8, color: T.amber,
                    fontSize: 12.5, fontWeight: 500,
                  }}>{error}</div>
                )}
              </div>

              {/* === WORKSPACE: Übersicht === */}
              {layoutMode === 'workspace' && view === 'dashboard' && (
                <>
                  <FbaCockpit
                    meta={data.meta}
                    palletCount={sortedPallets.length}
                    flatItems={flatItems}
                    einzelneSkuCount={einzelneSkuItems.length}
                    onStartFokus={() => setFokusOpen(true)}
                    loadingPct={loadingProgress.pct}
                  />
                  <div style={{ marginBottom: 18 }}>
                    <WorkdayTimer orderEstimateSec={orderEstimateSec} />
                  </div>
                  <DashboardOverview
                    sortedPallets={sortedPallets}
                    palletVolumes={palletVolumes}
                    loadingProgress={loadingProgress}
                    allDone={allDone}
                    onGoToPallets={() => setView('pallets')}
                    onStartFokus={() => setFokusOpen(true)}
                  />
                </>
              )}

              {/* === WORKSPACE: Paletten — with internal tabs Liste/Schritt === */}
              {layoutMode === 'workspace' && view === 'pallets' && (
                <>
                  {/* Inner tabs */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    marginBottom: 18, flexWrap: 'wrap',
                  }}>
                    <div className="lp-tabs">
                      <button
                        type="button"
                        className={`lp-tab ${paletteTab === 'liste' ? 'is-active' : ''}`}
                        onClick={() => setPaletteTab('liste')}
                      >
                        <span style={{ fontSize: 13 }}>▤</span>
                        Liste
                      </button>
                      <button
                        type="button"
                        className={`lp-tab ${paletteTab === 'schritt' ? 'is-active' : ''}`}
                        onClick={() => {
                          setPaletteTab('schritt');
                          setFokusOpen(true);
                        }}
                      >
                        <span style={{ fontSize: 13 }}>◎</span>
                        Schritt-für-Schritt
                      </button>
                    </div>
                    <div style={{ flex: 1 }} />
                    <span style={{
                      fontSize: 9.5, color: T.textMuted,
                      letterSpacing: 1.5, textTransform: 'uppercase',
                      fontWeight: 600,
                    }}>
                      {loadingProgress.done}/{loadingProgress.total} ·{' '}
                      <span className="lp-mono" style={{
                        color: allDone ? T.green : T.text,
                      }}>{loadingProgress.pct.toFixed(0)}%</span>
                    </span>
                  </div>

                  {/* Filter bar */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    flexWrap: 'wrap', marginBottom: 18,
                    padding: '12px 14px',
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 10,
                    boxShadow: T.shadowSm,
                  }}>
                    <span style={{
                      fontSize: 9.5, color: T.textMuted,
                      letterSpacing: 1.5, textTransform: 'uppercase',
                      fontWeight: 700,
                    }}>Fokus</span>
                    <FocusChips
                      focusGroup={focusGroup}
                      onChange={setFocusGroup}
                      counts={groupCounts}
                    />
                  </div>

                  {/* Two-column: Pallet cards + Sequence sidebar */}
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 24,
                  }}>
                    <div style={{
                      flex: 1, minWidth: 0,
                      display: 'flex', flexDirection: 'column', gap: 16,
                    }}>
                      {sortedPallets.map((pallet, idx) => (
                        <div
                          key={pallet.id}
                          ref={(el) => {
                            if (el) palletRefs.current[pallet.id] = el;
                          }}
                        >
                          <PalletCard
                            pallet={pallet}
                            palletIdx={idx}
                            startSeqIndex={palletStartIndex[pallet.id]}
                            sequenceMode={sequenceMode}
                            activeItemId={activeItem?.fnsku}
                            onItemClick={(item) => setActiveItem(item)}
                            volumeStats={palletVolumes[pallet.id]}
                            focusGroup={focusGroup}
                            loadedSet={loadedSet}
                            onToggleLoaded={toggleLoaded}
                            highlight={highlightedPalletId === pallet.id}
                            reserveFnskus={reserveFnskus}
                            repeatedUseItems={repeatedUseItems}
                            eskuExtras={eskuByPalletId[pallet.id] || []}
                          />
                        </div>
                      ))}
                      {einzelneSkuItems.length > 0 && (
                        <EinzelneSkuSection
                          items={einzelneSkuItems}
                          distribution={distribution}
                          onPalletClick={(palletId) => {
                            const el = palletRefs.current[palletId];
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              setHighlightedPalletId(palletId);
                              setTimeout(() => setHighlightedPalletId(null), 1500);
                            }
                          }}
                        />
                      )}
                    </div>
                    <SequenceSidebar
                      flatItems={flatItems}
                      sequenceMode={sequenceMode}
                      activeItemId={activeItem?.fnsku}
                      onItemClick={(item) => setActiveItem(item)}
                      sortedPallets={sortedPallets}
                      palletVolumes={palletVolumes}
                      loadedSet={loadedSet}
                      orderEstimateSec={orderEstimateSec}
                      onPalletClick={(palletId) => {
                        const el = palletRefs.current[palletId];
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          setHighlightedPalletId(palletId);
                          setTimeout(() => setHighlightedPalletId(null), 1500);
                        }
                      }}
                    />
                  </div>
                </>
              )}

              {/* === WORKFLOW STEPS === */}
              {layoutMode === 'workflow' && (
                <>
                  {/* Step: Prüfen */}
                  {workflowStep === 'pruefen' && (
                    <>
                      <FbaCockpit
                        meta={data.meta}
                        palletCount={sortedPallets.length}
                        flatItems={flatItems}
                        einzelneSkuCount={einzelneSkuItems.length}
                        onStartFokus={() => setFokusOpen(true)}
                        loadingPct={loadingProgress.pct}
                      />
                      <div style={{
                        background: T.surface,
                        border: `1px solid ${T.border}`,
                        borderRadius: 14,
                        padding: '20px 22px',
                        marginTop: 16, marginBottom: 16,
                        boxShadow: T.shadowSm,
                      }}>
                        <div style={{
                          fontSize: 10, color: T.textMuted, letterSpacing: 1.5,
                          textTransform: 'uppercase', fontWeight: 700, marginBottom: 8,
                        }}>Validierung</div>
                        <div style={{ fontSize: 14, color: T.text, marginBottom: 10 }}>
                          {validationReport?.problems?.length === 0
                            ? '✓ Keine Probleme — alle Daten korrekt geparst.'
                            : `${validationReport?.problems?.length || 0} Hinweise gefunden — bitte prüfen.`}
                        </div>
                        <button onClick={() => setShowValidation(true)} className="lp-btn2-hover" style={{
                          padding: '8px 14px', background: T.surface,
                          border: `1px solid ${T.border}`, borderRadius: 8,
                          fontSize: 12.5, fontWeight: 500, color: T.text,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                          Validierungsbericht öffnen →
                        </button>
                      </div>
                    </>
                  )}

                  {/* Step: Verteilen */}
                  {workflowStep === 'verteilen' && (
                    <DashboardOverview
                      sortedPallets={sortedPallets}
                      palletVolumes={palletVolumes}
                      loadingProgress={loadingProgress}
                      allDone={allDone}
                      onGoToPallets={() => setWorkflowStep('packen')}
                      onStartFokus={() => setFokusOpen(true)}
                    />
                  )}

                  {/* Step: Packen */}
                  {workflowStep === 'packen' && (
                    <>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        marginBottom: 16, flexWrap: 'wrap',
                      }}>
                        <button
                          onClick={() => setFokusOpen(true)}
                          className="lp-btn-hover"
                          style={{
                            padding: '11px 20px', background: T.accent,
                            color: '#fff',
                            border: `1px solid ${T.accent}`, borderRadius: 10,
                            fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                            fontFamily: 'inherit',
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            boxShadow: '0 4px 18px rgba(91,98,216,0.25)',
                          }}
                        >
                          <span style={{ fontSize: 15 }}>◎</span>
                          Schritt-für-Schritt starten
                        </button>
                        <span style={{ fontSize: 12, color: T.textSub }}>
                          oder packe direkt aus der Liste unten:
                        </span>
                        <div style={{ flex: 1 }} />
                        <FocusChips
                          focusGroup={focusGroup}
                          onChange={setFocusGroup}
                          counts={groupCounts}
                        />
                      </div>
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 16,
                      }}>
                        {sortedPallets.map((pallet, idx) => (
                          <div
                            key={pallet.id}
                            ref={(el) => {
                              if (el) palletRefs.current[pallet.id] = el;
                            }}
                          >
                            <PalletCard
                              pallet={pallet}
                              palletIdx={idx}
                              startSeqIndex={palletStartIndex[pallet.id]}
                              sequenceMode={sequenceMode}
                              activeItemId={activeItem?.fnsku}
                              onItemClick={(item) => setActiveItem(item)}
                              volumeStats={palletVolumes[pallet.id]}
                              focusGroup={focusGroup}
                              loadedSet={loadedSet}
                              onToggleLoaded={toggleLoaded}
                              highlight={highlightedPalletId === pallet.id}
                              reserveFnskus={reserveFnskus}
                              repeatedUseItems={repeatedUseItems}
                              eskuExtras={eskuByPalletId[pallet.id] || []}
                            />
                          </div>
                        ))}
                        {einzelneSkuItems.length > 0 && (
                          <EinzelneSkuSection
                            items={einzelneSkuItems}
                            distribution={distribution}
                            onPalletClick={(palletId) => {
                              const el = palletRefs.current[palletId];
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                setHighlightedPalletId(palletId);
                                setTimeout(() => setHighlightedPalletId(null), 1500);
                              }
                            }}
                          />
                        )}
                      </div>
                    </>
                  )}

                  {/* Workflow navigation footer */}
                  <div style={{
                    marginTop: 32, paddingTop: 20,
                    borderTop: `1px solid ${T.border}`,
                    display: 'flex', gap: 10, alignItems: 'center',
                  }}>
                    <button
                      onClick={prevStep}
                      disabled={stepIdx === 0}
                      className="lp-btn2-hover"
                      style={{
                        padding: '10px 18px', background: T.surface,
                        border: `1px solid ${T.border}`, borderRadius: 8,
                        fontSize: 13, fontWeight: 500, color: T.text,
                        cursor: stepIdx === 0 ? 'not-allowed' : 'pointer',
                        opacity: stepIdx === 0 ? 0.4 : 1,
                        fontFamily: 'inherit',
                      }}
                    >
                      ← Zurück
                    </button>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, color: T.textMuted }}>
                      Schritt {stepIdx + 1} von {WORKFLOW_STEPS.length}
                    </span>
                    <button
                      onClick={nextStep}
                      className="lp-btn-hover"
                      style={{
                        padding: '10px 18px', background: T.accent,
                        color: '#fff',
                        border: `1px solid ${T.accent}`, borderRadius: 8,
                        fontSize: 13, fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        boxShadow: '0 2px 8px rgba(91,98,216,0.3)',
                      }}
                    >
                      {stepIdx === WORKFLOW_STEPS.length - 2
                        ? 'Abschluss öffnen →'
                        : 'Weiter →'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>

      {/* ╔══ MOBILE BOTTOM TAB BAR ══╗ */}
      {data && (
        <nav className="lp-mobile-tabs">
          <div className="lp-mobile-tabs-inner">
            <MobileTab icon="▦" label="ÜBERSICHT"
              active={layoutMode === 'workspace' && view === 'dashboard'}
              onClick={() => { setLayoutMode('workspace'); setView('dashboard'); }} />
            <MobileTab icon="▤" label="PALETTEN"
              active={layoutMode === 'workspace' && view === 'pallets'}
              onClick={() => { setLayoutMode('workspace'); setView('pallets'); }} />
            <MobileTab icon="◎" label="FOKUS"
              onClick={() => setFokusOpen(true)} />
            <MobileTab icon="⌕" label="SUCHE"
              onClick={() => setSpotlightOpen(true)} />
            <MobileTab icon={allDone ? '✓' : '◷'} label="ABSCHL."
              onClick={() => setAbschlussOpen(true)} />
          </div>
        </nav>
      )}

      {/* Detail panel */}
      <DetailPanel item={activeItem} onClose={() => setActiveItem(null)} />

      {/* Validation report drawer */}
      {showValidation && (
        <>
          <div
            onClick={() => setShowValidation(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(20,17,14,0.25)',
              zIndex: 55,
            }}
          />
          <ValidationReport
            report={validationReport}
            onClose={() => setShowValidation(false)}
          />
        </>
      )}

      {/* Spotlight Cmd+K search */}
      <SpotlightSearch
        open={spotlightOpen}
        items={flatItems}
        onClose={() => setSpotlightOpen(false)}
        onPick={scrollToItem}
      />

      {/* Fullscreen Fokus-Modus (Deutsch only, Palette für Palette) */}
      {fokusOpen && (
        <FokusModus
          screens={palletScreens}
          loadedSet={loadedSet}
          onToggleLoaded={toggleLoaded}
          onClose={() => setFokusOpen(false)}
          onFinish={() => {
            // Auftrag abgeschlossen: Stop-Timer + Auto-Übergang zu Abschluss
            if (!loadDoneTs) setLoadDoneTs(Date.now());
            setFokusOpen(false);
            setAbschlussOpen(true);
          }}
          startTs={loadStartTs}
          reserveFnskus={reserveFnskus}
          repeatedUseItems={repeatedUseItems}
          labeledSet={labeledSet}
          onToggleLabeled={toggleLabeled}
          meta={data?.meta}
          palletVolumes={palletVolumes}
          copiedSet={copiedSet}
          setCopiedSet={setCopiedSet}
          orderEstimateSec={orderEstimateSec}
        />
      )}

      {/* Abschluss-Bildschirm */}
      {abschlussOpen && (
        <AbschlussScreen
          meta={data?.meta}
          flatItems={flatItems}
          palletCount={sortedPallets.length}
          startTs={loadStartTs}
          doneTs={loadDoneTs || (allDone ? Date.now() : null)}
          onClose={() => setAbschlussOpen(false)}
          weightKg={weightKg}
          setWeightKg={setWeightKg}
          priceEur={priceEur}
          setPriceEur={setPriceEur}
          history={history}
          onSave={(entry) => setHistory(saveToHistory(entry))}
          loadedSet={loadedSet}
          labeledSet={labeledSet}
          copiedSet={copiedSet}
          orderEstimateSec={orderEstimateSec}
          sortedPallets={sortedPallets}
        />
      )}

      {/* Admin-Panel — Tabellen-Verwaltung (sessionStorage) */}
      <AdminPanel
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        config={adminConfig}
        onConfigChange={setAdminConfig}
      />
    </div>
  );
}
