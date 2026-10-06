# Фаза 0 — скелет PWA и проверки на iPhone. План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** установить на iPhone офлайн-PWA по адресу `https://sergeulub.github.io/diary-app/` и получить ответы на четыре
неизвестных из спецификации (§10) до начала MVP.

**Architecture:** Vite + React + TypeScript; слои `src/domain/` (чистые функции, Vitest), `src/db/` (единственный доступ
к IndexedDB через Dexie), `src/ui/` (React). Вместо экранов MVP — один экран «Проверки Фазы 0» в стиле «олива» и
второе мини-приложение `probe2/` для проверки изоляции хранилища. Деплой — GitHub Actions → GitHub Pages.

**Tech Stack:** Node 24, Vite 8, React 19, TypeScript, Tailwind CSS 4 (`@tailwindcss/vite`), vite-plugin-pwa 2 (Workbox),
Dexie 4, fflate (zip), `@fontsource/lora`, Vitest 5, `@vite-pwa/assets-generator`.

**Spec:** `docs/superpowers/specs/2026-10-06-diary-mvp-design.md`

## Global Constraints
- Адрес навсегда: `https://sergeulub.github.io/diary-app/`; Vite `base: '/diary-app/'`; репозиторий `sergeulub/diary-app`, публичный.
- Интерфейс и тексты — на русском; `lang="ru"`.
- Без серверов, аналитики, внешних запросов во время работы приложения: шрифты и иконки — внутри сборки.
- Доступ к IndexedDB — только из `src/db/`. Логика — чистые функции в `src/domain/` с тестами.
- Граница логического дня по умолчанию — 06:00; время в метках — ISO 8601 со смещением.
- Имена файлов внутри zip — латиницей; содержимое — UTF-8.
- Цвета (светлая / тёмная): bg `#F2EFE3`/`#181A15`, surface `#FBFAF2`/`#22251E`, ink `#252920`/`#E8EADE`,
  muted `#666A57`/`#A0A491`, line `#DEDCCB`/`#33372D`, accent `#65763F`/`#A9BC7E`, accent-ink `#FFFFFF`/`#181A15`.
- Заголовки — Lora 600; остальной текст — `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`.
- Новая версия кода применяется при следующем запуске, не посреди работы (`registerType: 'prompt'`, без автоперезагрузки).
- OneDrive нигде не используется.
- Коммиты — на английском, заканчиваются строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Неверный `base`** — сборка ссылается на `/assets/...` вместо `/diary-app/assets/...`, на Pages белый экран.
   Ожидание: все пути в `dist/index.html` и манифесте начинаются с `/diary-app/`. Проверка — шаг в Task 3.
2. **Service worker перехватывает `probe2/`** — навигация на `/diary-app/probe2/` отдаёт `index.html` основного
   приложения. Ожидание: `probe2` открывается своей страницей. `navigateFallbackDenylist` + проверка в Task 4.
3. **Часовой пояс устройства** — логический день считается по UTC, а не по местному времени. Ожидание: 01:00 местного
   времени → предыдущая дата в любом поясе. Тест с разными `TZ` в Task 1.
4. **Кириллица в zip** — текст `.md` после распаковки на Windows превращается в кракозябры. Ожидание: UTF-8 сохраняется,
   имена файлов латиницей. Тест в Task 5.
5. **Отмена «Поделиться»** — пользователь закрыл окно, приложение показывает ошибку. Ожидание: тихо пишет «Отменено».
   Обработка `AbortError` в Task 5.

---

### Task 1: Каркас проекта, Vitest и `logicalDay`

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `src/vite-env.d.ts`
- Create: `src/domain/logicalDay.ts`
- Test: `src/domain/logicalDay.test.ts`

**Interfaces:**
- Produces: `logicalDay(now: Date, boundaryHour: number): string` — дата `ГГГГ-ММ-ДД` по местному времени;
  `formatDate(d: Date): string`. Скрипты `npm test`, `npm run build`, `npm run dev`.

- [ ] **Step 1: Инициализировать npm и поставить зависимости**

```bash
npm init -y
npm pkg set name=diary-app version=0.0.1 private=true type=module
npm pkg delete main
npm pkg set scripts.dev="vite" scripts.build="tsc --noEmit && vite build" scripts.preview="vite preview" scripts.test="vitest run" scripts.icons="pwa-assets-generator"
npm install react react-dom dexie fflate @fontsource/lora
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node tailwindcss @tailwindcss/vite vite-plugin-pwa workbox-window vitest @vite-pwa/assets-generator
```

- [ ] **Step 2: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vite/client", "vite-plugin-pwa/client", "node"]
  },
  "include": ["src", "vite.config.ts", "pwa-assets.config.ts"]
}
```

- [ ] **Step 3: `vite.config.ts`** (PWA добавляется в Task 3)

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/diary-app/',
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [react(), tailwindcss()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
```

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
declare const __BUILD_TIME__: string
```

- [ ] **Step 4: Написать падающий тест** `src/domain/logicalDay.test.ts`

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { formatDate, logicalDay } from './logicalDay'

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min)

describe('logicalDay', () => {
  const originalTz = process.env.TZ
  afterEach(() => {
    process.env.TZ = originalTz
  })

  it('днём возвращает текущую дату', () => {
    expect(logicalDay(at(2026, 10, 6, 10), 6)).toBe('2026-10-06')
  })
  it('05:59 относится к предыдущему дню', () => {
    expect(logicalDay(at(2026, 10, 6, 5, 59), 6)).toBe('2026-10-05')
  })
  it('06:00 — уже новый день', () => {
    expect(logicalDay(at(2026, 10, 6, 6, 0), 6)).toBe('2026-10-06')
  })
  it('после полуночи 1 января — 31 декабря прошлого года', () => {
    expect(logicalDay(at(2027, 1, 1, 0, 30), 6)).toBe('2026-12-31')
  })
  it('1 марта невисокосного года → 28 февраля', () => {
    expect(logicalDay(at(2027, 3, 1, 2), 6)).toBe('2027-02-28')
  })
  it('граница 0 — обычная полночь', () => {
    expect(logicalDay(at(2026, 10, 6, 0, 30), 0)).toBe('2026-10-06')
  })
  it.each(['Europe/Moscow', 'America/New_York', 'Pacific/Auckland', 'Asia/Kolkata'])(
    'считает по местному времени в поясе %s',
    (tz) => {
      process.env.TZ = tz
      expect(logicalDay(at(2026, 10, 6, 1), 6)).toBe('2026-10-05')
      expect(logicalDay(at(2026, 10, 6, 7), 6)).toBe('2026-10-06')
    },
  )
})

describe('formatDate', () => {
  it('дополняет месяц и день нулями', () => {
    expect(formatDate(at(2026, 3, 5, 12))).toBe('2026-03-05')
  })
})
```

- [ ] **Step 5: Запустить — должен упасть**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./logicalDay"`.

- [ ] **Step 6: Реализация** `src/domain/logicalDay.ts`

```ts
/** Дата в формате ГГГГ-ММ-ДД по местному времени. */
export function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Логический день: время до boundaryHour (местное) относится к предыдущей дате. */
export function logicalDay(now: Date, boundaryHour: number): string {
  if (now.getHours() >= boundaryHour) return formatDate(now)
  return formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12))
}
```

- [ ] **Step 7: Запустить — должен пройти**

Run: `npm test`
Expected: PASS, 11 тестов.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts src/vite-env.d.ts src/domain
git commit -m "chore: scaffold Vite + React + Vitest; add logicalDay"
```

---

### Task 2: Оболочка приложения, тема «олива», шрифт Lora

**Files:**
- Create: `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `logicalDay` из Task 1.
- Produces: CSS-переменные и Tailwind-цвета `bg-bg`, `bg-surface`, `text-ink`, `text-muted`, `border-line`, `bg-accent`,
  `text-accent`, `text-accent-ink`; шрифты `font-serif` (Lora), `font-sans` (системный). `App` рендерит `ProbeScreen`
  (появится в Task 5; до этого — заглушка).

- [ ] **Step 1: `index.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#F2EFE3" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#181A15" media="(prefers-color-scheme: dark)" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Дневник" />
    <title>Дневник</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: `src/index.css`**

```css
@import "tailwindcss";
@import "@fontsource/lora/600.css";

:root {
  color-scheme: light dark;
  --bg: #F2EFE3;
  --surface: #FBFAF2;
  --ink: #252920;
  --muted: #666A57;
  --line: #DEDCCB;
  --accent: #65763F;
  --accent-ink: #FFFFFF;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #181A15;
    --surface: #22251E;
    --ink: #E8EADE;
    --muted: #A0A491;
    --line: #33372D;
    --accent: #A9BC7E;
    --accent-ink: #181A15;
  }
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-ink: var(--ink);
  --color-muted: var(--muted);
  --color-line: var(--line);
  --color-accent: var(--accent);
  --color-accent-ink: var(--accent-ink);
  --font-serif: "Lora", Georgia, serif;
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
}

html, body, #root { min-height: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  -webkit-text-size-adjust: 100%;
}
```

- [ ] **Step 3: `src/main.tsx` и `src/App.tsx`**

```tsx
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

```tsx
// src/App.tsx
import { logicalDay } from './domain/logicalDay'

export default function App() {
  return (
    <main className="mx-auto max-w-md px-5 pt-[max(28px,env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">Фаза 0</p>
      <h1 className="font-serif text-3xl font-semibold">Дневник</h1>
      <p className="mt-2 text-muted">Логический день: {logicalDay(new Date(), 6)}</p>
    </main>
  )
}
```

- [ ] **Step 4: Проверить локально**

Run: `npm run dev`, открыть `http://localhost:5173/diary-app/`.
Expected: кремовый фон, заголовок «Дневник» шрифтом с засечками, сегодняшний логический день; при тёмной теме Windows —
тёмный фон `#181A15`. В DevTools → Network нет запросов к fonts.googleapis.com.

- [ ] **Step 5: Сборка и тесты**

Run: `npm run build && npm test`
Expected: сборка без ошибок TypeScript, тесты PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html src/main.tsx src/App.tsx src/index.css
git commit -m "feat: app shell with olive theme and bundled Lora"
```

---

### Task 3: PWA — манифест, иконки, офлайн

**Files:**
- Create: `public/icon.svg`, `pwa-assets.config.ts`
- Generate: `public/pwa-64x64.png`, `public/pwa-192x192.png`, `public/pwa-512x512.png`,
  `public/maskable-icon-512x512.png`, `public/apple-touch-icon-180x180.png`, `public/favicon.ico`
- Modify: `vite.config.ts`, `index.html`

**Interfaces:**
- Produces: установка на экран «Домой» с именем «Дневник»; service worker со scope `/diary-app/`, кэширующий всю сборку;
  `navigateFallbackDenylist` для `/diary-app/probe2/`.

- [ ] **Step 1: Иконка** `public/icon.svg` — мордочка «хорошо» на кремовом фоне

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" fill="#F2EFE3"/>
  <g transform="translate(8 8) scale(0.6667)" fill="none" stroke="#2A2D23" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path fill="#BFD08F" d="M23.6 4.4C35.4 4.6 43.8 13.1 43.5 24.6C43.1 35.9 34.6 43.6 23.9 43.5C12.6 43.4 4.6 35.1 4.5 23.9C4.4 12.7 12.5 4.2 23.6 4.4Z"/>
    <ellipse cx="13.2" cy="27.4" rx="3" ry="2" fill="rgba(214,120,96,0.45)" stroke="none"/>
    <ellipse cx="34.8" cy="27.4" rx="3" ry="2" fill="rgba(214,120,96,0.45)" stroke="none"/>
    <circle cx="18" cy="21" r="1.9" fill="#2A2D23" stroke="none"/>
    <circle cx="30" cy="21" r="1.9" fill="#2A2D23" stroke="none"/>
    <path d="M16.2 28.4C19.6 34.2 28.6 34.4 31.9 28.2"/>
  </g>
</svg>
```

- [ ] **Step 2: `pwa-assets.config.ts` и генерация PNG**

```ts
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#F2EFE3' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#F2EFE3' } },
  },
  images: ['public/icon.svg'],
})
```

Run: `npm run icons`
Expected: в `public/` появились шесть файлов из списка Files.

- [ ] **Step 3: Подключить PWA в `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/diary-app/',
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Дневник',
        short_name: 'Дневник',
        lang: 'ru',
        start_url: '/diary-app/',
        scope: '/diary-app/',
        display: 'standalone',
        background_color: '#F2EFE3',
        theme_color: '#F2EFE3',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallbackDenylist: [/^\/diary-app\/probe2\//],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
```

- [ ] **Step 4: Иконки в `index.html`** — добавить в `<head>` после `<meta name="apple-mobile-web-app-title">`

```html
    <link rel="icon" href="%BASE_URL%favicon.ico" sizes="48x48" />
    <link rel="icon" href="%BASE_URL%icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="%BASE_URL%apple-touch-icon-180x180.png" />
```

- [ ] **Step 5: Проверить пути в сборке (Review Focus 1)**

Run: `npm run build && grep -o 'href="[^"]*"\|src="[^"]*"' dist/index.html && cat dist/manifest.webmanifest`
Expected: каждый `href`/`src` начинается с `/diary-app/`; в манифесте `"start_url":"/diary-app/"`, `"scope":"/diary-app/"`;
в `dist/` есть `sw.js`.

- [ ] **Step 6: Офлайн локально**

Run: `npm run preview`, открыть `http://localhost:4173/diary-app/`, обновить страницу, в DevTools → Network включить
Offline, обновить снова.
Expected: страница открывается без сети; Application → Service Workers показывает активный `sw.js`.

- [ ] **Step 7: Commit**

```bash
git add public pwa-assets.config.ts vite.config.ts index.html
git commit -m "feat: PWA manifest, icons and offline service worker"
```

---

### Task 4: Хранилище — постоянство, счётчик открытий, маркер изоляции, `probe2`

**Files:**
- Create: `src/db/probe.ts`, `src/db/storage.ts`
- Create: `public/probe2/index.html`, `public/probe2/manifest.webmanifest`

**Interfaces:**
- Produces:
  - `recordVisit(at: string): Promise<number>` — добавляет открытие, возвращает их общее число;
  - `firstVisitAt(): Promise<string | undefined>`;
  - `requestPersistence(): Promise<'granted' | 'denied' | 'unsupported'>`;
  - `writeIsolationMarker(at: string): void` / `ISOLATION_MARKER_KEY = 'diary-probe-marker'`.
- База `diary-probe` — только для проверок Фазы 0; настоящая база MVP будет называться `diary`. Правило про UUID и
  `deletedAt` к этой служебной таблице не применяется.

- [ ] **Step 1: `src/db/probe.ts`**

```ts
import Dexie, { type EntityTable } from 'dexie'

interface Visit {
  id?: number
  at: string
}

const db = new Dexie('diary-probe') as Dexie & { visits: EntityTable<Visit, 'id'> }
db.version(1).stores({ visits: '++id, at' })

export async function recordVisit(at: string): Promise<number> {
  await db.visits.add({ at })
  return db.visits.count()
}

export async function firstVisitAt(): Promise<string | undefined> {
  return (await db.visits.orderBy('id').first())?.at
}

export const ISOLATION_MARKER_KEY = 'diary-probe-marker'

export function writeIsolationMarker(at: string): void {
  try {
    localStorage.setItem(ISOLATION_MARKER_KEY, at)
  } catch {
    // хранилище недоступно — проверка изоляции покажет «нет маркера»
  }
}
```

- [ ] **Step 2: `src/db/storage.ts`**

```ts
export async function requestPersistence(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!navigator.storage?.persist) return 'unsupported'
  if (await navigator.storage.persisted()) return 'granted'
  return (await navigator.storage.persist()) ? 'granted' : 'denied'
}
```

- [ ] **Step 3: Мини-приложение** `public/probe2/manifest.webmanifest`

```json
{
  "name": "Дневник — проба 2",
  "short_name": "Проба 2",
  "lang": "ru",
  "start_url": "/diary-app/probe2/",
  "scope": "/diary-app/probe2/",
  "display": "standalone",
  "background_color": "#E3DDC8",
  "theme_color": "#E3DDC8",
  "icons": [{ "src": "/diary-app/pwa-192x192.png", "sizes": "192x192", "type": "image/png" }]
}
```

- [ ] **Step 4: `public/probe2/index.html`** — видит ли второе приложение данные первого

```html
<!doctype html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Проба 2">
<link rel="manifest" href="/diary-app/probe2/manifest.webmanifest">
<link rel="apple-touch-icon" href="/diary-app/apple-touch-icon-180x180.png">
<title>Проба 2</title>
<style>
  body { margin: 0; padding: max(28px, env(safe-area-inset-top)) 20px 20px; background: #E3DDC8; color: #252920;
         font: 17px/1.5 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
  h1 { font-size: 26px; margin: 0 0 16px; }
  .row { padding: 12px 0; border-bottom: 1px solid #CFC9B4; }
  b { display: block; font-size: 13px; color: #666A57; font-weight: 600; }
</style>
</head>
<body>
<h1>Проба 2: изоляция</h1>
<div class="row"><b>Маркер основного приложения (localStorage)</b><span id="marker">…</span></div>
<div class="row"><b>Базы IndexedDB, видимые отсюда</b><span id="dbs">…</span></div>
<div class="row"><b>Вывод</b><span id="verdict">…</span></div>
<script>
  (async () => {
    let marker = null
    try { marker = localStorage.getItem('diary-probe-marker') } catch (e) {}
    document.getElementById('marker').textContent = marker || 'нет'
    let names = []
    try { names = (await indexedDB.databases()).map((d) => d.name) } catch (e) { names = ['(список недоступен)'] }
    document.getElementById('dbs').textContent = names.length ? names.join(', ') : 'нет'
    const shared = Boolean(marker) || names.includes('diary-probe')
    document.getElementById('verdict').textContent = shared
      ? 'Хранилище ОБЩЕЕ с основным приложением'
      : 'Хранилище ИЗОЛИРОВАНО от основного приложения'
  })()
</script>
</body>
</html>
```

- [ ] **Step 5: Проверить, что service worker не перехватывает `probe2` (Review Focus 2)**

Run: `npm run build && npm run preview`; открыть `http://localhost:4173/diary-app/`, затем
`http://localhost:4173/diary-app/probe2/`.
Expected: вторая ссылка показывает «Проба 2: изоляция», а не основное приложение. В браузере на ПК обе страницы
делят хранилище, поэтому вывод «ОБЩЕЕ» здесь нормален — проверяется на iPhone.

- [ ] **Step 6: Commit**

```bash
git add src/db public/probe2
git commit -m "feat: storage probes and second app for isolation check"
```

---

### Task 5: Тестовый zip, «Поделиться» и экран проверок

**Files:**
- Create: `src/domain/testZip.ts`
- Test: `src/domain/testZip.test.ts`
- Create: `src/ui/shareFile.ts`, `src/ui/ProbeScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `logicalDay`, `formatDate` (Task 1); `recordVisit`, `firstVisitAt`, `writeIsolationMarker` (Task 4);
  `requestPersistence` (Task 4).
- Produces:
  - `buildTestZip(now: Date): { fileName: string; bytes: Uint8Array }` — имя `diary-test-ГГГГ-ММ-ДД.zip`, внутри
    `backup.json` и `entries_test.md`;
  - `shareOrDownload(file: File): Promise<'shared' | 'downloaded' | 'cancelled'>`.

- [ ] **Step 1: Падающий тест** `src/domain/testZip.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { buildTestZip } from './testZip'

describe('buildTestZip', () => {
  const now = new Date(2026, 9, 6, 22, 15)
  const { fileName, bytes } = buildTestZip(now)
  const files = unzipSync(bytes)

  it('называет архив по дате', () => {
    expect(fileName).toBe('diary-test-2026-10-06.zip')
  })
  it('кладёт два файла с латинскими именами', () => {
    expect(Object.keys(files).sort()).toEqual(['backup.json', 'entries_test.md'])
  })
  it('сохраняет кириллицу в Markdown как UTF-8', () => {
    const md = strFromU8(files['entries_test.md'])
    expect(md).toContain('## 2026-10-06, вторник')
    expect(md).toContain('Настроение: 4/5 (хорошо) · Скука: 2/5 · Сон: 23:40–07:10 (7 ч 30 мин)')
  })
  it('пишет корректный JSON с formatVersion', () => {
    const json = JSON.parse(strFromU8(files['backup.json']))
    expect(json.formatVersion).toBe(1)
    expect(json.days[0].text).toContain('Проверка экспорта')
  })
})
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./testZip"`.

- [ ] **Step 3: Реализация** `src/domain/testZip.ts`

```ts
import { strToU8, zipSync } from 'fflate'
import { formatDate } from './logicalDay'

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

/** Тестовый архив Фазы 0: проверяет, что iOS отдаёт zip в Telegram, а Windows читает кириллицу. */
export function buildTestZip(now: Date): { fileName: string; bytes: Uint8Array } {
  const day = formatDate(now)
  const text = 'Проверка экспорта: кириллица, ёлка, тире — и кавычки «ёлочки».'
  const md = [
    `## ${day}, ${WEEKDAYS[now.getDay()]}`,
    'Настроение: 4/5 (хорошо) · Скука: 2/5 · Сон: 23:40–07:10 (7 ч 30 мин)',
    '',
    text,
    '',
  ].join('\n')
  const backup = {
    formatVersion: 1,
    exportedAt: now.toISOString(),
    days: [{ day, metrics: { mood: 4, boredom: 2, sleepStart: '23:40', sleepEnd: '07:10' }, text }],
  }
  const bytes = zipSync({
    'backup.json': strToU8(JSON.stringify(backup, null, 2)),
    'entries_test.md': strToU8(md),
  })
  return { fileName: `diary-test-${day}.zip`, bytes }
}
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npm test`
Expected: PASS, все тесты обоих файлов.

- [ ] **Step 5: `src/ui/shareFile.ts`** (Review Focus 5 — отмена не ошибка)

```ts
export async function shareOrDownload(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      throw e
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
```

- [ ] **Step 6: `src/ui/ProbeScreen.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { logicalDay } from '../domain/logicalDay'
import { buildTestZip } from '../domain/testZip'
import { firstVisitAt, recordVisit, writeIsolationMarker } from '../db/probe'
import { requestPersistence } from '../db/storage'
import { shareOrDownload } from './shareFile'

const SHARE_LABELS = { shared: 'Отправлено', downloaded: 'Скачано (окно «Поделиться» недоступно)', cancelled: 'Отменено' }

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line py-3 last:border-b-0">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className="text-[17px]">{value}</span>
    </div>
  )
}

export default function ProbeScreen() {
  const [visits, setVisits] = useState('…')
  const [first, setFirst] = useState('…')
  const [persist, setPersist] = useState('…')
  const [share, setShare] = useState('—')
  const [online, setOnline] = useState(navigator.onLine)
  const standalone = window.matchMedia('(display-mode: standalone)').matches

  useEffect(() => {
    const now = new Date().toISOString()
    writeIsolationMarker(now)
    recordVisit(now).then((n) => setVisits(String(n)))
    firstVisitAt().then((at) => setFirst(at ? new Date(at).toLocaleString('ru-RU') : 'нет'))
    requestPersistence().then((r) =>
      setPersist({ granted: 'да', denied: 'нет', unsupported: 'не поддерживается' }[r]),
    )
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  async function onShare() {
    const { fileName, bytes } = buildTestZip(new Date())
    const file = new File([bytes], fileName, { type: 'application/zip' })
    try {
      setShare(SHARE_LABELS[await shareOrDownload(file)])
    } catch (e) {
      setShare(`Ошибка: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pt-[max(28px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Фаза 0</p>
        <h1 className="font-serif text-3xl font-semibold">Проверки дневника</h1>
      </div>
      <section className="rounded-[20px] border border-line bg-surface px-4">
        <Row label="Запущено как приложение с экрана «Домой»" value={standalone ? 'да' : 'нет (вкладка Safari)'} />
        <Row label="Сеть" value={online ? 'есть' : 'нет — работаем офлайн'} />
        <Row label="Постоянное хранилище (storage.persist)" value={persist} />
        <Row label="Открытий записано в базу" value={visits} />
        <Row label="Первое открытие" value={first} />
        <Row label="Логический день (граница 06:00)" value={logicalDay(new Date(), 6)} />
        <Row label="Версия сборки" value={new Date(__BUILD_TIME__).toLocaleString('ru-RU')} />
      </section>
      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4">
        <span className="text-[15px] font-semibold">Экспорт</span>
        <button
          type="button"
          onClick={onShare}
          className="min-h-[48px] rounded-[14px] bg-accent px-4 text-[17px] font-semibold text-accent-ink active:opacity-80"
        >
          Поделиться тестовым zip
        </button>
        <span className="text-[13px] text-muted">Результат: {share}</span>
      </section>
      <a href="/diary-app/probe2/" className="text-[15px] text-accent underline">
        Открыть «Пробу 2» (проверка изоляции)
      </a>
    </main>
  )
}
```

- [ ] **Step 7: Подключить экран** — заменить содержимое `src/App.tsx`

```tsx
import ProbeScreen from './ui/ProbeScreen'

export default function App() {
  return <ProbeScreen />
}
```

- [ ] **Step 8: Проверить локально**

Run: `npm run build && npm test && npm run preview`, открыть `http://localhost:4173/diary-app/`, обновить 2 раза.
Expected: «Открытий записано в базу» растёт с каждым обновлением; кнопка в браузере ПК скачивает
`diary-test-ГГГГ-ММ-ДД.zip`; архив открывается Проводником, имена файлов читаются, `entries_test.md` в Блокноте
показывает кириллицу без искажений.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat: probe screen with storage status and test zip sharing"
```

---

### Task 6: Репозиторий на GitHub и автодеплой на Pages

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `npm test`, `npm run build` → `dist/`.
- Produces: живой адрес `https://sergeulub.github.io/diary-app/`, деплой на каждый push в `main`.

- [ ] **Step 1: Workflow** `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v4
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Перед коммитом проверить актуальные мажорные версии четырёх actions на их страницах GitHub Marketplace и поднять,
если вышли новые.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: deploy to GitHub Pages on push to main"
```

- [ ] **Step 3: Создать репозиторий — действие пользователя**

Пользователь на https://github.com/new создаёт репозиторий: владелец `sergeulub`, имя `diary-app`, **Public**,
без README, .gitignore и лицензии. После этого в репозитории: Settings → Pages → Build and deployment →
Source: **GitHub Actions**.

- [ ] **Step 4: Подключить и отправить**

```bash
git remote add origin https://github.com/sergeulub/diary-app.git
git push -u origin main
```

Expected: при первом push Git Credential Manager откроет вход в GitHub в браузере; после входа ветка отправлена.

- [ ] **Step 5: Проверить деплой**

Открыть https://github.com/sergeulub/diary-app/actions — дождаться зелёного запуска «Deploy to GitHub Pages».
Открыть https://sergeulub.github.io/diary-app/.
Expected: экран «Проверки дневника»; https://sergeulub.github.io/diary-app/probe2/ — «Проба 2: изоляция».

---

### Task 7: Проверки на iPhone и запись результатов

**Files:**
- Create: `docs/phase0-results.md`
- Modify: `CLAUDE.md` (раздел «Текущее состояние», «Структура», «Запуск / проверка»)

**Interfaces:**
- Consumes: живой адрес из Task 6.
- Produces: ответы на четыре вопроса спецификации §10 — вход для плана Фазы 1.

- [ ] **Step 1: Создать `docs/phase0-results.md`**

```markdown
# Фаза 0 — результаты проверок на iPhone

Модель iPhone: …  ·  Версия iOS: …  ·  Дата: …

| # | Проверка | Как делать | Результат |
|---|---|---|---|
| 1 | Установка | Safari → https://sergeulub.github.io/diary-app/ → «Поделиться» → «На экран Домой». Открыть с иконки. «Запущено как приложение» = да | |
| 2 | Офлайн | Открыть приложение 2–3 раза → включить авиарежим → закрыть приложение из переключателя → открыть снова. Экран открылся, «Сеть: нет», счётчик открытий вырос | |
| 3 | Постоянное хранилище | Значение «Постоянное хранилище» | |
| 4 | Данные переживают перезапуск | Запомнить счётчик → перезагрузить iPhone → открыть. Счётчик = прежний + 1 | |
| 5 | Zip в Telegram | «Поделиться тестовым zip» → Telegram → Избранное. На ПК в Telegram Desktop сохранить, распаковать: имена файлов читаются, `entries_test.md` с кириллицей без искажений | |
| 6 | Очистка Safari | Запомнить счётчик → Настройки → Приложения → Safari → «Очистить историю и данные» → открыть дневник с экрана «Домой». Счётчик сохранился или сбросился до 1? | |
| 7 | Изоляция | Открыть в Safari https://sergeulub.github.io/diary-app/probe2/ → «На экран Домой» → открыть «Пробу 2» с иконки. Вывод: ОБЩЕЕ или ИЗОЛИРОВАНО | |
| 8 | «Команды» открывают приложение | Команды → Автоматизация → «Время суток» 23:00 → действие «Открыть приложение»: есть ли «Дневник» в списке? Если нет — действие «Открыть URL» с адресом дневника: открывается приложение или Safari? | |
| 9 | Виджет «Команд» | Создать быструю команду «Запиши день» с тем способом открытия, что сработал в п. 8 → добавить виджет «Команды» на экран «Домой» → нажать | |

## Выводы для Фазы 1
- …
```

- [ ] **Step 2: Пользователь проходит проверки 1–9 на iPhone и сообщает результаты; заполнить таблицу и выводы**

Выводы, которые должны появиться:
- п. 5 не сработал → экспорт в MVP через скачивание в «Файлы» и отправку оттуда; поправить спецификацию §7;
- п. 6 стёр данные → в Настройках MVP предупреждение «не очищайте данные Safari без свежего бэкапа»;
- п. 7 «ОБЩЕЕ» → правило в CLAUDE.md: на `sergeulub.github.io` не публиковать других сайтов;
- п. 8 открывает Safari, а не приложение → напоминание в MVP только уведомлением; поправить спецификацию §9.

- [ ] **Step 3: Обновить `CLAUDE.md`**

- «Запуск / проверка»: `npm run dev` → http://localhost:5173/diary-app/ · `npm test` · `npm run build` ·
  деплой — push в `main`.
- «Структура»: `src/domain/` — чистая логика; `src/db/` — IndexedDB; `src/ui/` — экраны; `public/probe2/` —
  проверка изоляции (удалить в Фазе 1); `docs/superpowers/` — спецификации и планы.
- «Текущее состояние»: дата, Фаза 0 завершена, ссылка на `docs/phase0-results.md`, следующий шаг — план Фазы 1.

- [ ] **Step 4: Commit и push**

```bash
git add docs/phase0-results.md CLAUDE.md
git commit -m "docs: record Phase 0 iPhone results"
git push
```

---

## Что дальше
После Task 7 — отдельный план Фазы 1 (MVP по спецификации) с учётом выводов из `docs/phase0-results.md`.
