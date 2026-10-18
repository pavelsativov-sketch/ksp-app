# Локальный browser runner (бесплатный режим)

Этот режим запускает Chromium на компьютере владельца. Vercel остаётся
публичным сайтом, а Cloudflare Tunnel доставляет к локальному runner только
подписанные запросы. Не открывайте порт 3111 в роутере и не публикуйте
`BROWSER_RPC_SECRET`.

## Один раз

1. Установите зависимости проекта: `npm ci`.
2. Установите Chromium для Playwright: `npx playwright install chromium`.
3. Установите `cloudflared` с официальной страницы Cloudflare Tunnel.
4. Создайте отдельный ключ (не основной `AUTH_SECRET`) и сохраните его в
   `.env.runner` в корне проекта:

   ```text
   BROWSER_RPC_SECRET=<случайная строка минимум 32 символа>
   ```

5. Добавьте этот же ключ в Production Vercel переменной
   `BROWSER_RPC_SECRET`. Значение не должно попадать в Git или чат.

## Запуск для теста

Откройте два терминала в папке проекта.

Первый:

```powershell
Get-Content .env.runner | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } }
node scripts/local-browser-runner.mjs
```

Второй:

```powershell
cloudflared tunnel --url http://127.0.0.1:3111
```

`cloudflared` покажет временный адрес `https://…trycloudflare.com`. К нему
добавьте `/_agent/browser` и задайте полный адрес как Production secret
`BROWSER_RPC_URL` в Vercel. После изменения переменной нужен новый deploy.

Quick Tunnel предназначен для тестов: адрес меняется после остановки
процесса. Для постоянного бесплатного адреса создайте named Cloudflare Tunnel
на своём домене в Cloudflare. Компьютер должен оставаться включённым, пока
учителя используют браузер ОС.
