# Marathon · Lager v2

> Инструмент для обработки Lagerauftrag-документов. Загружаешь .docx → проходишь 4 шага → результат сохраняется в историю. Без отвлечений.

---

## Содержание

- [Что это и зачем](#что-это-и-зачем)
- [Workflow: 4 шага](#workflow-4-шага)
- [Подробно по шагам](#подробно-по-шагам)
  - [01 · Upload](#01--upload)
  - [02 · Prüfen](#02--prüfen)
  - [03 · Focus-Modus](#03--focus-modus)
  - [04 · Abschluss](#04--abschluss)
- [Очередь Aufträge](#очередь-aufträge)
- [Историjа](#история)
- [Логика и правила](#логика-и-правила)
  - [Сортировка палет](#сортировка-палет)
  - [WIEDERHOLT (повтор артикля)](#wiederholt-повтор-артикля)
  - [Einzelne SKU](#einzelne-sku)
  - [Категории и цвета](#категории-и-цвета)
- [Горячие клавиши](#горячие-клавиши)
- [Persistence (где что хранится)](#persistence)
- [Технические детали](#технические-детали)
- [FAQ](#faq)

---

## Что это и зачем

**Marathon** — приложение для оператора склада. Заменяет ручную сверку Lagerauftrag-документов с физической раскладкой по палетам.

**Решает три проблемы:**
1. Документы (.docx) приходят пачками — их надо обработать **по очереди**, не теряя контекст
2. На каждой палете — несколько артиклей, каждый требует подтверждения. Один артикль на экране = **полная концентрация**
3. После завершения нужны **тайминги** (для отчётов, биллинга, оптимизации)

**Ключевые принципы:**
- **Меньше кликов** — большинство действий через `Space` / `←` / `→`
- **Меньше шума** — на экране только то, что нужно прямо сейчас
- **Persistance везде** — reload в середине workflow не теряет прогресс

---

## Workflow: 4 шага

```
┌────────┐    ┌─────────┐    ┌──────────────┐    ┌───────────┐
│ UPLOAD │ →  │ PRÜFEN  │ →  │ FOCUS-MODUS  │ →  │ ABSCHLUSS │
└────────┘    └─────────┘    └──────────────┘    └───────────┘
   .docx       проверка        палета за          сохранение
   ablegen     Auslastung      палетой,           в историю,
               + Validierung   артикль за         следующий
                               артиклем           Auftrag
```

Между шагами **нет ручного навигатора** — переходы автоматические или через одну явную кнопку.

---

## Подробно по шагам

### 01 · Upload

**Что делаешь:**
- Перетаскиваешь один или несколько `.docx` в drop-zone
- Или жмёшь `DURCHSUCHEN` и выбираешь файлы

**Что происходит:**
- Каждый файл парсится через [mammoth](https://www.npmjs.com/package/mammoth) → `parseLagerauftragText`
- Валидация: проверяет полноту данных (FNSKU, ASIN, EAN/UPC, плотность артиклей, header-totals)
- Если очередь была пустая → **первый загруженный Auftrag автоматически открывается** в Prüfen
- Остальные → в **Warteschlange** (очередь)

**Что показывается:**
- Топбар: счётчики `QUEUE`, `HISTORIE`, статус `BEREIT`, часы
- Hero-wordmark `LAGERAUFTRAG STARTEN.`
- Drop-zone с corner viewfinder ticks
- Если есть очередь — список под dropzone (можно менять порядок ↑↓, удалять ×, запускать любой `STARTEN`)
- Если очередь пустая — capability strip с описанием возможностей

**Поддерживаемые форматы:**
- **Standard-Format** — обычный Lagerauftrag с PALETTE-маркерами
- **Schilder-Format** — per-carton документы (определяется автоматически)

---

### 02 · Prüfen

Полный обзор Auftrag-а перед обработкой. Если всё ок — стартуешь Focus-Modus.

**Что показывается:**

**Hero (bento)**
- Большой gradient FBA-номер (моно)
- Чипы: Ziellager, Dokumenttyp, Erstellt am, ID-tail
- Donut-чарт **Auslastung** (% объёма всех палет, статус: NIEDRIG / OPTIMAL / KNAPP / OVERFLOW)

**5-tile метрик-стрип**
- `01 Paletten` · кол-во физических палет
- `02 Artikel` · уникальных продуктов
- `03 Kartons` · всего коробок
- `04 Gewicht` · оценка веса (kg)
- `05 Dauer` · оценка времени обработки

**Kategorien-Verteilung**
- Stacked bar: распределение единиц по категориям (THERMO / PRODUKTION / etc.)
- Легенда с числами и процентами

**Validierung**
- Зелёный чек или жёлтое предупреждение
- 4-чек-grid: Format erkannt / Paletten konsistent / Codes vorhanden / Mengen plausibel

**Paletten · сортированный список**
- Карточки палет в новом порядке (см. [Сортировка палет](#сортировка-палет))
- Каждая показывает ID + категория-чип + визуальный stack-bar + Einheiten + % voll + format-чипы
- **Клик на карточку → раскрывается inline-таблица** с полным списком артиклей (NAME / CODE / USE-ITEM / MENGE)
- Если на палету назначены **Einzelne SKU** — в шапке бейдж `+N ESKU`, в раскрытом виде отдельный блок «〉 EINZELNE SKU · ZUGEWIESEN»

**Sticky bottom-bar**
- `〉 STATUS` · Auftrag bereit (зелёная пульсация если validation OK)
- Сводка: Paletten · Artikel · ~Dauer
- Большая индиго-кнопка `NEXT 〉 FOCUS-MODUS STARTEN`

**Действия:**
- `FOCUS-MODUS STARTEN` → переход в Focus-Modus
- `VERLASSEN` (в топбаре) → отменить current, вернуться на Upload (очередь сохраняется)

---

### 03 · Focus-Modus

**Cinema-режим**: на экране **один артикль за раз**, ничего лишнего.

**Что показывается:**
- Slim-топбар: бренд + счётчик `AUFTRAG N/M` + кнопка `VERLASSEN`
- Hairline progress (3px) сверху — общий fill
- Position: `〉 PALETTE P1-B3 · ARTIKEL 1/3` + цветной category-бейдж (THERMO синий / PRODUKTION зелёный)
- **Hero**: имя продукта (Montserrat 800, до 72px)
- Inline-чипы: `mit LST` (индиго) / `ohne LST`, количество rollen в коробке, формат
- **MENGE bento-карточка**: gradient-цифра + breakdown (KARTONS, ROLLEN GESAMT)
- **2 code-карточки**: `ARTIKEL-CODE` (моно) + `USE-ITEM` (моно индиго) — кликабельные

**Sticky bottom-bar**:
- `‹ PREV` · `〉 STATUS / P1-B3 · Artikel 1/3` · `AUFTRAG 4/11` · `✓ FERTIG · SPACE / Artikel abschliessen` (индиго) · `NEXT ›`

**Что делаешь:**
1. Берёшь палету, проверяешь артикль по коду
2. Кликаешь на ARTIKEL-CODE или USE-ITEM → код **копируется** в буфер обмена + **подсвечивается зелёным** (фиксируется)
3. Когда артикль уложен — `Space` или клик `FERTIG`
4. Marathon переходит к следующему артиклю
5. Когда последний артикль на палете готов → автоматический переход к следующей палете
6. Когда все 11 артиклей готовы → автоматический переход в **Abschluss**

**Copy-highlight (важно):**
- Зелёный border + green box-shadow ring + green tint фон
- Сам код в зелёной плашке
- Бейдж `✓ KOPIERT` вместо `KLICK · KOPIEREN`
- **Подсветка не уходит** — остаётся пока не перейдёшь к другому артиклю или не скопируешь другое значение

---

### 04 · Abschluss

**Mission complete**: подтверждение, статистика, сохранение в историю.

**Что показывается:**
- SlimTop с зелёной пульсацией `● AUTO-GESPEICHERT`
- Hero: большая зелёная чек-иконка + `Auftrag abgeschlossen.` + FBA + сводка
- **Штамп `ABGESCHLOSSEN`** (зелёный, наклонён −2°) + дата
- 4-tile KPIs: `DAUER` (gradient) / `PALETTEN / ARTIKEL / EINHEITEN`
- **Palettenzeiten** — таблица с колонками: index / P-id / цветной gantt-bar / mm:ss
- **Kategorien** — stacked bar + легенда

**Sticky bottom-bar**:
- `HISTORIE` (иконка часов) · `〉 STATUS / In Historie gespeichert` · `WARTESCHLANGE / N weitere Aufträge` · `NEXT 〉 / NÄCHSTER AUFTRAG` или `ZUM WORKSPACE`

**Действия:**
- `NÄCHSTER AUFTRAG` (если в очереди есть ещё) → сохраняет в историю, автоматически открывает следующий из очереди в Prüfen
- `ZUM WORKSPACE` (если очередь пуста) → сохраняет, возвращает на Upload
- `SCHLIESSEN / Esc` → **отменяет** без сохранения (на случай ошибки)

---

## Очередь Aufträge

**Где хранится:** localStorage `marathon.queue.v1`

**Как работает:**
1. При drop файлов: парсятся → добавляются в конец очереди
2. Если **до drop** очередь была пустая И нет current → первый файл **автоматически** становится current → переход на Prüfen
3. Остальные ждут в очереди

**Управление:**
- На Upload-экране: `↑` / `↓` поменять порядок, `×` удалить, `STARTEN` запустить любой
- `ALLE ENTFERNEN` — очистить очередь полностью
- На Abschluss: `NÄCHSTER AUFTRAG` достаёт первый из очереди

**Persist:** очередь сохраняется между перезагрузками страницы.

---

## Историjа

**Где хранится:** localStorage `marathon.history.v1`

Каждая запись содержит:
- `fbaCode` · FBA-номер
- `fileName` · оригинальное имя файла
- `startedAt` / `finishedAt` · timestamps
- `durationSec` · общая длительность
- `palletCount` / `articleCount`
- `articles[]` · полный список с palletId, sku, fnsku, title, units, useItem, category
- `palletTimings` · `{ [palletId]: { startedAt, finishedAt } }`

**TODO:** отдельный экран Historie с таблицей и фильтрами — пока данные есть, UI нет.

---

## Логика и правила

### Сортировка палет

**Правило:** сначала самые лёгкие, Tachorollen всегда в конце.

```
1. Группа A (без Tacho) — сортируется по возрастанию числа артиклей
2. Группа B (с Tacho)   — в конце, тоже по возрастанию артиклей внутри
```

**Зачем:**
- Тёплый старт: первая палета — лёгкая, оператор «входит в ритм»
- Tacho-артикли требуют больше внимания (мелкие, специфичные) → лучше делать в конце, когда уже есть понимание Auftrag-а

**Пример:**
```
Исходный порядок (из docx):
P1-B1 (3 art) → P1-B2 (1 art) → P1-B3 (5 art Tacho) → P1-B4 (2 art)

После сортировки:
P1-B2 (1) → P1-B4 (2) → P1-B1 (3) → P1-B3 (5 Tacho)
```

**Где живёт:** [src/utils/auftragHelpers.js · sortPallets](src/utils/auftragHelpers.js)

---

### WIEDERHOLT (повтор артикля)

Full-screen overlay, который появляется при отметке артикля как fertig **если** есть смысл предупредить оператора.

**SHOW когда:**
- Тот же `useItem` (или fnsku, если useItem нет) встречается на **СЛЕДУЮЩЕЙ** палете
- AND количество в следующей палете **> 30 штук**

**SUPPRESS (не показывать) когда:**
- Следующий артикль (в текущем потоке: либо в той же палете, либо первый в следующей палете) — тот же код. Оператор и так знает, что продолжает с тем же продуктом.
- Кода нет на следующей палете, но есть через одну → тоже не показывать (логика по spec)

**UI overlay:**
- Glassmorphic full-screen
- Большая warning-иконка (оранжевая, пульсация)
- 140px gradient `WIEDERHOLT` (чёрный → оранжевый)
- Bento-карточка: `CODE / NÄCHSTE PALETTE / MENGE DORT` (оранжевая цифра)
- Закрывается: клик · `Esc` · `↵` · `Space`

**Где живёт:** [src/utils/wiederholtLogic.js · detectWiederholt](src/utils/wiederholtLogic.js)

---

### Einzelne SKU

В Lagerauftrag некоторые артикли приходят **без** привязки к палете (раздел `Einzelne SKU` после последней PALETTE-секции).

Marathon **автоматически распределяет** их по палетам по такой логике scoring (выше = лучше):

```
+1000 — категория артикля совпадает с одной из категорий уже на палете
+ 500 — формат (rollen + dim) совпадает с любым артиклем на палете
−5000 — палета моно-категорийная и не совпадает с категорией ESKU
−10×N — load-balance: чем больше уже на палете, тем меньше score
```

**Где видно:**
- На Pruefen в шапке pallet-карточки: бейдж `+N ESKU` (индиго)
- В раскрытом виде карточки: отдельный блок «〉 EINZELNE SKU · ZUGEWIESEN» (индиго-фон строк)

**Где живёт:** [src/utils/auftragHelpers.js · distributeEinzelneSku](src/utils/auftragHelpers.js)

---

### Категории и цвета

| Категория             | Код        | Цвет     | Применение                |
|-----------------------|------------|----------|---------------------------|
| Thermorollen          | THERMO     | `#3B82F6` синий | Bonrollen, Kassenrollen, Thermal |
| Big Bags / Produktion | PRODUKTION | `#22C55E` зелёный | Big Bag, Sandsack, Klebeband |
| Heipa                 | HEIPA      | `#06B6D4` голубой | Heipa-бренд               |
| Veit                  | VEIT       | `#A855F7` фиолетовый | Veit-бренд              |
| Tachographenrollen    | TACHO      | `#F97316` оранжевый | Tacho-роллы (всегда последние) |
| Sonstige              | SONSTIGE   | `#71717A` серый | Всё остальное             |

Цвета используются:
- В KPI и pallet tile category-чипах
- В вертикальной полосе слева у item-row в Focus
- В Category-Verteilung stacked bar
- В стек-визуализации палеты на Pruefen
- В gantt-баре Palettenzeiten на Abschluss

---

## Горячие клавиши

**Глобально**
- `Esc` — закрыть WIEDERHOLT-overlay (если открыт), иначе ничего

**Focus-Modus**
- `Space` или `Enter` — отметить текущий артикль как fertig
- `→` — следующий артикль (без отметки)
- `←` — предыдущий артикль
- `Esc` — закрыть WIEDERHOLT-overlay (если открыт)

**WIEDERHOLT-overlay**
- `Esc` / `Enter` / `Space` — закрыть и продолжить

---

## Persistence

Все данные хранятся в **localStorage** браузера. Никакого backend-а.

| Key                       | Что хранится                              |
|---------------------------|-------------------------------------------|
| `marathon.queue.v1`       | Массив очереди Auftrag-ов (с parsed-данными) |
| `marathon.current.v1`     | Текущий Auftrag в работе + прогресс       |
| `marathon.history.v1`     | Завершённые Auftrag-и                     |

**Что значит «прогресс current»:**
- `step` · 'pruefen' / 'focus' / 'abschluss'
- `currentPalletIdx` / `currentItemIdx`
- `completedKeys` · `{ "palletId|itemIdx|code": timestamp }`
- `palletTimings` · `{ [palletId]: { startedAt, finishedAt } }`
- `startedAt` · timestamp начала Auftrag-а

**Reload во время Focus** — продолжишь с того же артикля. Тайминги пересчитываются от `startedAt`, поэтому общая длительность остаётся точной.

**Очистить всё** (для отладки):
```js
localStorage.clear(); window.location.reload();
```

---

## Технические детали

### Стек

- **React 19** + Vite 8
- **mammoth** для парсинга .docx → plain text
- Никаких UI-библиотек — всё inline-styles + design-токены
- Шрифты: Inter (UI), Montserrat (display), JetBrains Mono (technical)

### Структура файлов

```
src/
├── App.jsx                 # Routing: render по current.step
├── state.jsx               # Context provider + actions + localStorage
├── index.css               # Дизайн-токены (CSS-variables)
├── main.jsx                # Entry point
│
├── screens/
│   ├── Upload.jsx          # Шаг 01 — файлы + очередь
│   ├── Pruefen.jsx         # Шаг 02 — обзор + валидация
│   ├── Focus.jsx           # Шаг 03 — артикль за артиклем
│   └── Abschluss.jsx       # Шаг 04 — завершение + история
│
└── utils/
    ├── parseLagerauftrag.js   # Парсер docx-text (legacy + standard)
    ├── auftragHelpers.js      # Mappers: parsed → screen shapes
    │                          # sortPallets, distributeEinzelneSku
    │                          # pruefenView, focusItemView, palletTimingRows
    │                          # categoryDistribution, estimateOrderSeconds
    └── wiederholtLogic.js     # detectWiederholt
```

### Дизайн-система

Все токены в [src/index.css](src/index.css):
- `--bg`, `--bg-2`, `--bg-3`, `--bg-4` · фоновые слои (white → grey)
- `--line`, `--line-2`, `--line-3` · бордеры (subtle → strong)
- `--ink`, `--ink-2`, `--ink-3`, `--ink-4`, `--ink-5` · текст (primary → muted)
- `--accent` (`#5B62D8`), `--accent-2`, `--accent-soft` · индиго бренд
- `--font-display`, `--font-ui`, `--font-mono`

Visual DNA — **Marathon-game industrial** в **белой теме**:
- Corner viewfinder ticks на всех carded-секциях
- Mono-eyebrows с префиксом `〉` и шириной трекинга `0.18em+`
- Прямые углы (никаких rounded), bento-grid-композиции
- Glassmorphic sticky bars (rgba white + blur+saturate)

### State actions (в `state.jsx`)

```js
const {
  // State
  queue, current, history,

  // Queue
  addFiles(fileList) → built[]
  removeFromQueue(id)
  reorderQueue(fromIdx, toIdx)
  clearQueue()

  // Workflow
  startEntry(entryId?)            // sortPallets применяется здесь
  goToStep('pruefen' | 'focus' | 'abschluss')
  setCurrentPalletIdx(idx)
  setCurrentItemIdx(idx)
  completeCurrentItem() → didFinishAll
  completeAndAdvance()            // save → history, next from queue
  cancelCurrent()

  // History
  removeHistoryEntry(id)
  clearHistory()
} = useAppState();
```

---

## FAQ

**Q: Что если случайно отметил артикль как fertig?**
A: Жми `←` — откатывается на предыдущий. completedKeys сохраняются (нет undo для отметки), но навигация работает.

**Q: Перегрузил страницу — куда делся прогресс?**
A: Никуда. localStorage хранит current + завершённые палеты. Reload вернёт на тот же артикль.

**Q: Файл не парсится — что делать?**
A: Сейчас просто появится `Parse-Fehler` в очереди. Открой console, найди детали. Известные проблемы: SVG-таблицы, нестандартные template-варианты Word.

**Q: Можно ли перейти с Focus обратно в Prüfen?**
A: Сейчас нет — переходы линейные. `Verlassen` отменяет current полностью. Можно добавить «◀ Zurück» в slim-топ если нужно.

**Q: Откуда оценка «1h 8m» на Prüfen?**
A: `estimateOrderSeconds` в [auftragHelpers.js](src/utils/auftragHelpers.js):
- 6 мин/палета базовых
- 11 сек/артикль (21 сек если Tacho-формат)
- 9 мин паузы между палетами

**Q: Как добавить новую категорию?**
A:
1. В [parseLagerauftrag.js · classifyItem](src/utils/parseLagerauftrag.js) — добавить регулярку для определения
2. В [auftragHelpers.js · primaryCategory](src/utils/auftragHelpers.js) — обработать новое значение
3. В каждом screen-файле в `CAT_COLOR` и `CAT_NAME` константах — добавить цвет и подпись

---

## Roadmap

Что ещё можно добавить (в порядке полезности):

- **Historie-экран** — таблица завершённых с фильтрами по дате/FBA, экспорт в CSV
- **Cmd-K палитра** — keyboard-first навигация (jump to pallet, switch Auftrag)
- **Loading state** при парсинге крупных файлов (сейчас `busy` flag без UI)
- **Custom confirm-modal** в дизайн-языке (вместо `window.confirm`)
- **Pause/Resume** — таймер останавливается на обед
- **Manual qty override** — если фактическое количество ≠ документу
- **Notes на Abschluss** — комментарий перед сохранением
- **Settings/Admin** — конфиг таймингов, веса/палета, рабочих часов
- **Mobile/tablet layout** — сейчас всё под 1280+

---

**Версия:** 2.0 · build 2026-05
**Stack:** React 19 · Vite 8 · mammoth · LocalStorage
