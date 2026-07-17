# Публикация на GitHub Pages

После копирования патча в проект выполните:

```cmd
npm run build
git add .
git commit -m "Publish contacts app with GitHub Pages"
git push
```

## 1. Включить GitHub Pages

Откройте репозиторий `ancode5/phone-contacts-app`:

1. `Settings` → `Pages`.
2. В разделе `Build and deployment` выберите `Source: GitHub Actions`.
3. Откройте вкладку `Actions` и дождитесь зелёной галочки у workflow
   `Deploy contacts app to GitHub Pages`.

Итоговый адрес:

```text
https://ancode5.github.io/phone-contacts-app/
```

## 2. Добавить адрес в Яндекс OAuth

В приложении Яндекс OAuth оставьте локальный Redirect URI:

```text
http://localhost:5173/auth/callback
```

И добавьте второй Redirect URI:

```text
https://ancode5.github.io/phone-contacts-app/
```

Для опубликованной версии Suggest Hostname:

```text
https://ancode5.github.io/phone-contacts-app/
```

Сохраните настройки OAuth до проверки входа на GitHub Pages.

## 3. Проверка

1. Откройте опубликованный адрес.
2. Нажмите «Войти через Яндекс».
3. Введите общий пароль справочника.
4. Убедитесь, что загружаются контакты.
5. Откройте ту же ссылку на телефоне через другую сеть.

Workflow публикует сайт после push в ветки `feature/cloud-sync` или `main`.
Client Secret в GitHub не используется.
