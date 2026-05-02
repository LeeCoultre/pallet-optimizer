# Marathon · Design System (v3 «Serious»)

> Полный спек дизайна, который сейчас живёт на странице **PREVIEW · v3** ([src/screens/PruefenPreview.jsx](src/screens/PruefenPreview.jsx)).
> Используй этот документ как reference при переписывании остальных экранов.
>
> **Tone**: serious enterprise SaaS · clean · restrained
> **Reference**: Stripe Dashboard · Linear · Notion · Mercury · Vercel Dashboard

---

## Содержание

1. [Foundations](#1-foundations) — цвета, типографика, spacing, тени
2. [Layout System](#2-layout-system) — структура страницы
3. [Components](#3-components) — карточки, кнопки, badges, etc.
4. [Patterns](#4-patterns) — повторяющиеся композиции
5. [Iconography](#5-iconography)
6. [Interaction States](#6-interaction-states)
7. [Voice & Tone](#7-voice--tone)
8. [Don't / Do](#8-do--dont)

---

## 1 · Foundations

### Цветовая палитра

**Surfaces**
```
--page-bg     #F9FAFB    canvas (страница)
--surface     #FFFFFF    карточки, top-bar
--surface-2   #F9FAFB    hover на строках, header таблицы, expanded row
--surface-3   #F3F4F6    chip-фон
```

**Borders** (используй ОДИН тон!)
```
--border      #E5E7EB    основной — карточки, секции
--border-2    #F3F4F6    тоньше — дивайдеры между строками таблицы
--border-3    #D1D5DB    немного контрастнее — кнопки secondary
```

**Текст**
```
--text-primary    #111827   заголовки, важные значения
--text-secondary  #374151   обычный body
--text-muted      #52525B   sub-тексты, описания
--text-subtle     #6B7280   labels, captions
--text-faint      #9CA3AF   disabled, индексы #
```

**Accent — Indigo (используй СПАРИНГЛИ)**
```
--accent          #4F46E5   primary CTA, активные элементы
--accent-text     #3730A3   текст в светлом badge
--accent-bg       #EEF2FF   светлая подложка
--accent-border   #C7D2FE   border светлого badge
```

**Status colors**

| Статус   | Main      | BG        | Text      | Border    |
|----------|-----------|-----------|-----------|-----------|
| Success  | `#10B981` | `#ECFDF5` | `#047857` | `#A7F3D0` |
| Warn     | `#F59E0B` | `#FFFBEB` | `#B45309` | `#FDE68A` |
| Danger   | `#EF4444` | `#FEF2F2` | `#B91C1C` | `#FECACA` |
| Accent   | `#4F46E5` | `#EEF2FF` | `#3730A3` | `#C7D2FE` |

**Категории (для бейджей палет / артиклей)**

| Категория  | Main      | BG        | Text      |
|------------|-----------|-----------|-----------|
| THERMO     | `#3B82F6` | `#EFF6FF` | `#1D4ED8` |
| PRODUKTION | `#10B981` | `#ECFDF5` | `#047857` |
| HEIPA      | `#06B6D4` | `#ECFEFF` | `#0E7490` |
| VEIT       | `#A855F7` | `#FAF5FF` | `#7E22CE` |
| TACHO      | `#F97316` | `#FFF7ED` | `#C2410C` |
| SONSTIGE   | `#71717A` | `#FAFAFA` | `#3F3F46` |

---

### Типографика

**Шрифты**
```
UI / Body:  Inter, system-ui, sans-serif
Mono:       'JetBrains Mono', ui-monospace, monospace
Display:    тот же Inter (Montserrat НЕ используем в v3)
```

**Шкала размеров**

| Уровень | Размер              | Weight | Letter-spacing | Применение                     |
|---------|---------------------|--------|----------------|--------------------------------|
| H1      | `clamp(28px, 3.6vw, 40px)` | 600 (SemiBold) | `-0.02em` | Заголовок страницы             |
| H2      | `18px`              | 600    | `-0.01em`      | Section header                 |
| H3      | `16px`              | 600    | `-0.005em`     | Под-секции                     |
| Body L  | `15px`              | 400    | normal         | Параграф под H1 (lead)         |
| Body    | `14px`              | 400-500| normal         | Основной текст, button         |
| Body S  | `13px`              | 400    | normal         | Sub-тексты, описания, table    |
| Caption | `12px`              | 500    | `0.02em`       | Labels, KPI sub                |
| Meta    | `11px-11.5px`       | 500    | `0.02em`       | Tags, breadcrumb, mini-meta    |

**Числовые значения**
- ВСЕГДА `font-variant-numeric: tabular-nums` для чисел (выравнивание колонок)
- Display-числа в **Regular weight** (`fontWeight: 400-600`), НЕ Black
- Большие KPI: `fontSize: 32px, fontWeight: 600, letter-spacing: -0.025em`

**Mono-шрифт ТОЛЬКО для:**
- Кодов (FBA, FNSKU, SKU, USE-ITEM)
- Числовых значений в таблицах (для выравнивания)
- Pallet IDs (P1-B3)
- Format-чипов (57 × 18)

---

### Spacing scale

```
4    8    12    16    20    24    32    40    48    64
```

Используй эти значения. Никаких 7px, 13px, 21px — только из шкалы.

**Стандартные интервалы:**
- Между секциями страницы: `32-40px`
- Между header секции и content: `14-18px`
- Внутри карточки (padding): `18-28px`
- Между элементами в строке: `8-16px` (gap)
- Page-padding (main): `40px 32px`

---

### Border radius

```
4px     format tags, тонкие чипы
8px     кнопки, inputs, мелкие cards
12px    карточки, banner
24-9999 pills / badges
```

---

### Тени

```
Card:        0 1px 2px rgba(0,0,0,0.03)
Card hover:  0 2px 8px rgba(0,0,0,0.06)
Button CTA:  0 1px 2px rgba(79,70,229,0.2)
Sticky bar:  no shadow, только border-top
Modal:       0 12px 40px rgba(0,0,0,0.15)
```

**Никаких** glow rings, aurora, blur-эффектов в обычных компонентах. Glassmorphic — только для sticky topbar/sticky-bar.

---

### Motion

```
duration-fast    150ms    hover, focus, color
duration-base    200ms    transform, expand
duration-slow    320ms    page transitions, large reveals

easing           cubic-bezier(0.16, 1, 0.3, 1)    стандартный
easing-out       ease-out                          для исчезающих
```

Никаких отскоков-spring. Серьёзный продукт = плавные сдержанные переходы.

---

## 2 · Layout System

### Структура страницы

```
┌─────────────────────────────────────────────────────────────┐
│ Sidebar (224px, sticky)  │  Main content                    │
│                          │  ┌──────────────────────────┐    │
│  - Brand                 │  │ Topbar (52px, sticky)    │    │
│  - Nav items             │  └──────────────────────────┘    │
│  - Status / version      │  ┌──────────────────────────┐    │
│                          │  │ Stepper (опционально)    │    │
│                          │  └──────────────────────────┘    │
│                          │                                  │
│                          │   <main max-width: 1180px>       │
│                          │   padding: 40px 32px             │
│                          │                                  │
│                          │   [page intro]                   │
│                          │   [section 1]                    │
│                          │   [section 2]                    │
│                          │   ...                            │
│                          │                                  │
│                          │  ┌──────────────────────────┐    │
│                          │  │ Sticky action bar (опц.) │    │
│                          │  └──────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Topbar

```
height: 52px
padding: 0 32px
position: sticky, top: 0, zIndex: 10
background: rgba(255, 255, 255, 0.85)
backdrop-filter: blur(12px)
border-bottom: 1px solid var(--border)

Контент:
  Workspace  /  Auftrag prüfen          [...status pills...]   v3 Preview
  ─────      ───────────────                                    ─────────
  muted      primary, weight 500                                12px muted
```

### Stepper

```
height: ~80px (включая padding)
padding: 20px 32px
background: white
border-bottom: 1px solid var(--border)

Каждый шаг:
  ╭───╮  Label (13.5px, 500-600)
  │ N │  ─────────  ←─── line, 1px, цвет по статусу
  ╰───╯  sub (11.5px, muted)

Кружок:
  width: 28px, height: 28px, borderRadius: 50%
  current:  bg #4F46E5, color white
  done:     bg #10B981, color white (✓ icon)
  todo:     bg #F3F4F6, color #9CA3AF
```

### Sticky action bar

```
position: fixed, bottom: 0, left: 0, right: 0
margin-left: 224px  /* за вычетом сайдбара */
padding: 14px 32px
background: rgba(255, 255, 255, 0.9)
backdrop-filter: blur(14px)
border-top: 1px solid var(--border)
display: flex (status слева, кнопки справа)
```

---

## 3 · Components

### Card

```jsx
{
  background: '#FFFFFF',
  border: '1px solid #E5E7EB',
  borderRadius: 12,
  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
  /* padding варьируется: 18px / 24px / 28px */
}
```

**НЕ используй**: corner ticks, dashed strips, double borders.

### Section header

```jsx
<div style={{ marginBottom: 14 }}>
  <h2 style={{
    fontSize: 18,
    fontWeight: 600,
    color: '#111827',
    margin: 0,
    letterSpacing: '-0.01em',
  }}>
    Übersicht
  </h2>
  <p style={{
    fontSize: 13.5,
    color: '#6B7280',
    margin: '4px 0 0',
    lineHeight: 1.5,
  }}>
    Wichtige Kennzahlen auf einen Blick.
  </p>
</div>
```

**Sentence case** (НЕ ВСЕ ЗАГЛАВНЫЕ). Без `〉` префиксов и mono-шрифта.

### Eyebrow (над H1 или label сверху секции)

```jsx
<div style={{
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  fontWeight: 500,
  color: '#6B7280',
  marginBottom: 12,
}}>
  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4F46E5' }} />
  Schritt 02 von 04
</div>
```

### Label (мини-метка над данными)

```jsx
<span style={{
  fontSize: 11.5,
  fontWeight: 500,
  color: '#6B7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}}>
  Auftrag-Nummer (FBA)
</span>
```

### Badge / Pill

```jsx
{
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid <tone.border>',
  background: <tone.bg>,
  color: <tone.color>,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.02em',
}
```

Варианты: `success / warn / danger / accent / neutral / category`

### Button — Primary

```jsx
{
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: 40,
  padding: '0 20px',
  background: '#4F46E5',
  color: '#FFFFFF',
  border: 0,
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(79,70,229,0.2)',
  transition: 'background 150ms',
}
/* hover: background #4338CA */
```

### Button — Ghost (secondary)

```jsx
{
  display: 'inline-flex',
  alignItems: 'center',
  height: 40,
  padding: '0 16px',
  background: '#FFFFFF',
  color: '#374151',
  border: '1px solid #D1D5DB',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
}
/* hover: border #9CA3AF, bg #F9FAFB */
```

### Button — Danger / Destructive

```jsx
{
  /* ghost-стиль + */
  color: '#B91C1C',
  borderColor: '#FECACA',
}
/* hover: bg #FEF2F2 */
```

### KPI card

```jsx
<div style={{
  padding: '18px 20px',
  background: '#FFFFFF',
  border: '1px solid #E5E7EB',
  borderRadius: 12,
  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
}}>
  <div style={{
    fontSize: 12, color: '#6B7280',
    fontWeight: 500, marginBottom: 8,
  }}>
    Auslastung
  </div>
  <div style={{
    fontSize: 32, fontWeight: 600,
    letterSpacing: '-0.025em',
    color: '#4F46E5',         /* или #111827 для нейтральных */
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  }}>
    58%
  </div>
  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
    4.59 m³
  </div>
</div>
```

**Главное:** число в **Regular** (`fontWeight: 600`, не 800/900). Tabular-nums.

### Table row (для списков типа палет)

```jsx
<div style={{
  display: 'flex',
  alignItems: 'center',
  padding: '14px 20px',
  borderBottom: '1px solid #F3F4F6',  /* hairline между строками */
  cursor: 'pointer',
  transition: 'background 150ms',
}}>
  /* Колонки фиксированной ширины через flex: '0 0 NNpx', и одна flex: 1 */
  /* hover: background #F9FAFB */
  /* active/expanded: background #F9FAFB, no border */
</div>
```

### Validation banner

```jsx
<div style={{
  display: 'flex', alignItems: 'center', gap: 14,
  padding: '14px 20px',
  background: '#ECFDF5',
  border: '1px solid #A7F3D0',
  borderRadius: 12,
}}>
  <span style={{
    width: 32, height: 32, borderRadius: '50%',
    background: '#10B981',
    color: '#FFFFFF',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }}>
    {/* checkmark icon */}
  </span>
  <div style={{ flex: 1 }}>
    <div style={{ fontSize: 14, fontWeight: 600, color: '#065F46' }}>
      Alles in Ordnung
    </div>
    <div style={{ fontSize: 12.5, color: '#047857', marginTop: 1 }}>
      Sub-text...
    </div>
  </div>
  <Badge tone="success">Validiert</Badge>
</div>
```

### Empty state

```jsx
<div style={{
  padding: '64px 32px',
  background: '#F9FAFB',
  border: '1px dashed #D1D5DB',
  borderRadius: 12,
  textAlign: 'center',
}}>
  <Icon size={40} color="#9CA3AF" />
  <h3 style={{ fontSize: 18, fontWeight: 600, marginTop: 16 }}>
    Noch keine Aufträge
  </h3>
  <p style={{ fontSize: 14, color: '#6B7280', maxWidth: 420, margin: '8px auto 24px' }}>
    Sub-text...
  </p>
  <Button>Erste Datei laden</Button>
</div>
```

---

## 4 · Patterns

### Page intro

```jsx
<section style={{ marginBottom: 32 }}>
  <Eyebrow><Dot/> Schritt 02 von 04</Eyebrow>
  <h1>Auftrag prüfen</h1>
  <p style={{ marginTop: 12, fontSize: 15, color: '#52525B', maxWidth: 640 }}>
    Lead paragraph объясняющий что делает страница.
  </p>
</section>
```

### Identity card (для FBA / Auftrag ID и т.п.)

```jsx
<Card style={{ padding: '24px 28px' }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
    <Label>Auftrag-Nummer (FBA)</Label>
    <Badge tone="success">Erkannt</Badge>
  </div>
  <div style={{
    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
    fontSize: 32, fontWeight: 500,
    color: '#111827', letterSpacing: '-0.02em',
  }}>
    {fba}
  </div>
  <div style={{
    marginTop: 20, paddingTop: 18,
    borderTop: '1px solid #E5E7EB',
    display: 'grid', gridTemplateColumns: 'repeat(3, auto) 1fr', gap: 32,
  }}>
    <Meta label="Ziellager" value="DTM2" mono />
    <Meta label="Format"    value="Standard" />
    <Meta label="Erstellt"  value="21.04.2026" mono />
  </div>
</Card>
```

### KPI grid (5 столбцов)

```jsx
<section style={{ marginBottom: 32 }}>
  <SectionHeader title="Übersicht" sub="Wichtige Kennzahlen auf einen Blick." />
  <div style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',  /* или auto-fit, minmax(180px, 1fr) */
    gap: 12,
  }}>
    <Kpi label="..." value="..." sub="..." />
    {/* ... */}
  </div>
</section>
```

### Breadcrumb

```jsx
<header style={topbar}>
  <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>Workspace</span>
  <Sep />  {/* '/' с цветом #D1D5DB */}
  <span style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>Auftrag prüfen</span>
  <span style={{ flex: 1 }} />
  {/* Right-side: status, версия, действия */}
</header>
```

---

## 5 · Iconography

**Стиль**
- Stroke `1.4-1.6`
- `currentColor` для fill/stroke (наследует цвет parent)
- 16-18px стандартный размер, 24px для крупных decorative
- Round line-cap и line-join

**Источник**: используем inline SVG (см. Sidebar.jsx). При расширении — выбирать из Heroicons (outline) или Lucide.

**НЕ используем**: emoji-иконки, цветные/брендированные иконки, заполненные (filled) варианты в плотных списках.

---

## 6 · Interaction States

| State    | Visual change                                             |
|----------|-----------------------------------------------------------|
| Hover    | bg сдвигается на `--surface-2` (#F9FAFB), border +1 темнее |
| Active   | bg чуть темнее (#F3F4F6), opacity 0.95                    |
| Focus    | outline `2px solid #4F46E5`, outline-offset `2px`         |
| Disabled | opacity 0.5, cursor `not-allowed`, no hover               |
| Loading  | skeleton-bg `#F3F4F6` с shimmer-анимацией                 |

**Transitions**: `150ms` для color/bg, `200ms` для transform/opacity.

---

## 7 · Voice & Tone

### Текст и tone-of-voice

**ДА**
- Sentence case: «Auftrag prüfen», «Wichtige Kennzahlen»
- Краткие body-параграфы (1-2 предложения)
- Активный залог: «Lade die Datei», не «Datei wird geladen»
- Конкретика: «11 Artikel über 5 Paletten» вместо «Mehrere Artikel»

**НЕТ**
- ВСЕ ЗАГЛАВНЫЕ для целых заголовков (только для tags ≤ 12 chars)
- Mono-шрифт для нетехнических меток
- Industrial-префиксы `〉`, `STATION ·`, `〉 EINGABE`
- Театральные тексты: «MISSION COMPLETE», «WIEDERHOLT» (используй обычное «Abgeschlossen», «Wiederholung erkannt»)
- Длинные параграфы > 3 строк

### Числа

- Локаль `de-DE` для тысячных разделителей: `1.659` (не `1,659`)
- Длительности: `1 h 8 min`, `47:32`, `5 min` — единый формат
- Проценты: `58%` (без пробела)
- Размеры: `4.59 m³` (с пробелом)
- Даты: `21.04.2026` (немецкий формат)
- Время: `07:43` (24-часовой)
- Relative-time где уместно: «vor 5 Min», «gestern»

---

## 8 · Do · Don't

### ✅ ДЕЛАЙ

```
✓  Один тон border'ов везде (#E5E7EB)
✓  Sentence case в заголовках
✓  Tabular-nums для числовых колонок
✓  Soft shadow (0 1px 2px rgba(0,0,0,0.03))
✓  Inter везде, mono ТОЛЬКО для кодов
✓  Indigo accent ТОЛЬКО для primary action
✓  Badges/pills с rounded 999
✓  Иконки в outline-стиле, currentColor
✓  Padding в кратных 4
✓  Hover на каждой интерактивной зоне
```

### ❌ НЕ ДЕЛАЙ

```
✗  Corner viewfinder ticks (TL/TR/BL/BR)
✗  Dashed strips внутри карточек
✗  Double border (карточка + corner ticks одновременно)
✗  Mono-eyebrows с `〉` префиксом
✗  Montserrat 800/900 Black для всего
✗  Gradient-числа (linear-gradient на text)
✗  Aurora glows / animated radials в фоне
✗  ВСЕ ЗАГЛАВНЫЕ для длинных текстов
✗  Theatrical labels («MISSION COMPLETE»)
✗  > 2 hover-эффектов одновременно (transform + glow + border)
✗  Sharp corners (radius 0) — только rounded 4-12px
```

---

## Приложение · Token-таблица для копирования в код

```js
// theme/tokens.js (можно вынести как const)
export const T = {
  bg:     { page: '#F9FAFB', surface: '#FFFFFF', surface2: '#F9FAFB', surface3: '#F3F4F6' },
  border: { primary: '#E5E7EB', subtle: '#F3F4F6', strong: '#D1D5DB' },
  text:   { primary: '#111827', secondary: '#374151', muted: '#52525B', subtle: '#6B7280', faint: '#9CA3AF' },

  accent: { main: '#4F46E5', text: '#3730A3', bg: '#EEF2FF', border: '#C7D2FE' },

  status: {
    success: { main: '#10B981', bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' },
    warn:    { main: '#F59E0B', bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' },
    danger:  { main: '#EF4444', bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA' },
  },

  category: {
    THERMO:     { color: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
    PRODUKTION: { color: '#10B981', bg: '#ECFDF5', text: '#047857' },
    HEIPA:      { color: '#06B6D4', bg: '#ECFEFF', text: '#0E7490' },
    VEIT:       { color: '#A855F7', bg: '#FAF5FF', text: '#7E22CE' },
    TACHO:      { color: '#F97316', bg: '#FFF7ED', text: '#C2410C' },
    SONSTIGE:   { color: '#71717A', bg: '#FAFAFA', text: '#3F3F46' },
  },

  font: {
    ui:   'Inter, system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },

  radius: { sm: 4, md: 8, lg: 12, full: 9999 },
  shadow: {
    card:   '0 1px 2px rgba(0,0,0,0.03)',
    raised: '0 2px 8px rgba(0,0,0,0.06)',
    cta:    '0 1px 2px rgba(79,70,229,0.2)',
    modal:  '0 12px 40px rgba(0,0,0,0.15)',
  },
};
```

---

**Источник этого спека**: [src/screens/PruefenPreview.jsx](src/screens/PruefenPreview.jsx)
**Актуально для**: Marathon Lager v3 · 2026-05
