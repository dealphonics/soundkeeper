# Soundkeeper Mini App MVP

Прототип Telegram Mini App для локального прослушивания аудио в стиле современного стримингового плеера, но без загрузки mp3 на сервер. Теперь в проекте есть и минимальная Python-оболочка Telegram-бота, которая умеет открывать Mini App по кнопке и настраивать menu button.

## Что уже умеет

- выбрать локальный аудиофайл с устройства;
- выбрать отдельную обложку;
- автоматически определить длительность трека;
- сохранить карточку трека локально в браузерном хранилище;
- воспроизводить трек в текущей сессии;
- повторно открывать локальную библиотеку карточек после перезапуска Mini App;
- заново подключать аудиофайл к уже сохраненной карточке.

## Как устроено хранение

- `аудио`: не сохраняется на сервере и не сохраняется постоянно в приложении;
- `метаданные`: сохраняются локально в `IndexedDB`, а если она недоступна, то в `localStorage`;
- `обложка`: хранится локально как сжатое изображение;
- `воспроизведение`: идет из временного `object URL`, созданного из выбранного пользователем файла.

Это значит:

- карточка трека переживет закрытие приложения;
- сам `mp3` после новой сессии нужно выбрать заново;
- библиотека приватна и привязана к конкретному устройству/браузерному хранилищу.

## Ограничения MVP

- аудио по-прежнему не хранится на сервере и не синхронизируется между устройствами;
- нет шаринга, экспорта, облачной синхронизации и монетизации;
- нет чтения встроенных ID3-обложек из mp3;
- библиотека считается локальной, но ее размер ограничен возможностями браузерного хранилища;
- для публикации в Telegram Mini App нужен HTTPS-хостинг.

## Локальный запуск

В папке проекта:

```powershell
python -m http.server 8000
```

Затем открой:

```text
http://localhost:8000
```

## Публикация на GitHub Pages

Проект уже подготовлен к GitHub Pages:

- есть workflow [deploy-pages.yml](C:\Users\grom\Documents\Soundkeeper\.github\workflows\deploy-pages.yml);
- есть файл [`.nojekyll`](C:\Users\grom\Documents\Soundkeeper\.nojekyll), чтобы GitHub Pages не пытался пересобирать сайт через Jekyll;
- публикация запускается после `push` в ветку `main`.

### Что сделать на сайте GitHub

1. Зайти на [github.com](https://github.com/) и создать новый репозиторий, например `soundkeeper`.
2. Не добавлять туда `README`, `.gitignore` и лицензии, потому что они уже есть локально.
3. После создания репозитория GitHub покажет команды для первого `push`.

### Что сделать локально в PowerShell

В папке проекта:

```powershell
cd C:\Users\grom\Documents\Soundkeeper
git init
git add .
git commit -m "Initial Soundkeeper MVP"
git branch -M main
git remote add origin https://github.com/<your-github-login>/soundkeeper.git
git push -u origin main
```

Заменить `<your-github-login>` на свой логин GitHub.

### Как включить Pages

1. Открыть репозиторий на GitHub.
2. Перейти в `Settings` -> `Pages`.
3. В `Source` выбрать `GitHub Actions`.
4. Подождать, пока workflow `Deploy Soundkeeper To GitHub Pages` завершится успешно.

После этого сайт обычно будет доступен по адресу:

```text
https://<your-github-login>.github.io/soundkeeper/
```

Если репозиторий называется не `soundkeeper`, то в конце будет другое имя репозитория.

### Какой URL потом вставить в бота

Когда сайт откроется в браузере, именно этот адрес и нужно задать так:

```powershell
$env:SOUNDKEEPER_MINI_APP_URL="https://<your-github-login>.github.io/soundkeeper/"
```

## Бот-оболочка

В проект добавлен [bot.py](C:\Users\grom\Documents\Soundkeeper\bot.py) без внешних зависимостей. Он использует Telegram Bot API через стандартную библиотеку Python и умеет:

- отвечать на `/start`, `/app`, `/help`, `/menu`;
- отправлять inline-кнопку запуска Mini App;
- настраивать default menu button через `setChatMenuButton`;
- работать через long polling без webhook.

### Переменные окружения

Для безопасного запуска бот больше не читает токен ни из файла, ни из переменной окружения. Токен вводится только интерактивно при старте и не отображается в консоли.

```powershell
$env:SOUNDKEEPER_MINI_APP_URL="https://your-domain.example/soundkeeper/"
```

Необязательные:

```powershell
$env:SOUNDKEEPER_MENU_BUTTON_TEXT="Open Soundkeeper"
$env:SOUNDKEEPER_LAUNCH_BUTTON_TEXT="Open Player"
$env:SOUNDKEEPER_POLL_TIMEOUT="30"
$env:SOUNDKEEPER_DROP_PENDING_UPDATES="false"
```

### Настройка бота

1. Создать бота через `@BotFather`.
2. Разместить содержимое этой папки на HTTPS-хостинге.
3. Указать URL опубликованного Mini App в `SOUNDKEEPER_MINI_APP_URL`.
4. Один раз выполнить:

```powershell
python bot.py setup
```

Бот спросит токен интерактивно и настроит список команд и default menu button.

### Запуск бота

```powershell
python bot.py run
```

Токен будет запрошен без эха в терминале. После этого бот будет отвечать в личном чате и показывать кнопку запуска Mini App.

### Что настроить в Telegram дополнительно

1. В `@BotFather` можно включить Main Mini App, чтобы у бота появился отдельный `Launch app` в профиле.
2. Если Main Mini App настроен, можно открывать приложение и прямой ссылкой вида `https://t.me/<bot_username>?startapp`.
3. Команда `/menu` внутри личного чата настраивает menu button адресно для конкретного пользователя.

## Куда развивать дальше

- добавить обработку deep links и сценарии по `startapp`/`start` параметрам;
- реализовать импорт нескольких треков подряд;
- добавить плейлист, очередь и перемешивание;
- хранить больше настроек UI и сортировок;
- перевести бота с polling на webhook, если потребуется постоянный прод-рантайм;
- сделать backend-режим как отдельный opt-in сценарий, если потом понадобится приватная синхронизация между устройствами.
