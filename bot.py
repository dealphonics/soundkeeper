import argparse
import getpass
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


DEFAULT_COMMANDS = [
  {"command": "start", "description": "Открыть приветствие и кнопку запуска"},
  {"command": "app", "description": "Показать кнопку запуска Mini App"},
  {"command": "help", "description": "Показать подсказку по боту"},
  {"command": "menu", "description": "Настроить кнопку меню в этом чате"},
]


@dataclass
class Settings:
  token: str
  mini_app_url: str
  menu_button_text: str
  launch_button_text: str
  poll_timeout: int
  drop_pending_updates: bool

  @classmethod
  def from_prompt(cls, hide_token_input: bool = False) -> "Settings":
    token = prompt_secret("Введите токен Telegram-бота", hidden=hide_token_input)
    mini_app_url = os.getenv("SOUNDKEEPER_MINI_APP_URL", "").strip()

    if not token:
      raise ValueError(
        "Токен бота обязателен. Бот принимает его только интерактивно при запуске."
      )
    if not mini_app_url:
      raise ValueError("Set SOUNDKEEPER_MINI_APP_URL before running the bot.")
    if not mini_app_url.startswith(("https://", "http://localhost", "https://t.me/")):
      raise ValueError(
        "SOUNDKEEPER_MINI_APP_URL must be an HTTPS URL for production, "
        "a localhost URL for local testing, or a t.me Mini App link."
      )

    return cls(
      token=token,
      mini_app_url=mini_app_url,
      menu_button_text=os.getenv("SOUNDKEEPER_MENU_BUTTON_TEXT", "Open Soundkeeper").strip() or "Open Soundkeeper",
      launch_button_text=os.getenv("SOUNDKEEPER_LAUNCH_BUTTON_TEXT", "Open Player").strip() or "Open Player",
      poll_timeout=max(1, int(os.getenv("SOUNDKEEPER_POLL_TIMEOUT", "30"))),
      drop_pending_updates=os.getenv("SOUNDKEEPER_DROP_PENDING_UPDATES", "").strip().lower() in {"1", "true", "yes"},
    )


class TelegramApiError(RuntimeError):
  pass


def prompt_secret(label: str, hidden: bool = True) -> str:
  if not sys.stdin.isatty():
    return ""

  try:
    if hidden:
      return getpass.getpass(f"{label}: ").strip()
    return input(f"{label}: ").strip()
  except (EOFError, KeyboardInterrupt):
    print("", file=sys.stderr)
    return ""


class TelegramBotApi:
  def __init__(self, token: str) -> None:
    self.base_url = f"https://api.telegram.org/bot{token}/"

  def call(self, method: str, payload: dict[str, Any] | None = None, timeout: int = 60) -> Any:
    body = json.dumps(payload or {}).encode("utf-8")
    request = urllib.request.Request(
      url=f"{self.base_url}{method}",
      data=body,
      headers={"Content-Type": "application/json; charset=utf-8"},
      method="POST",
    )

    try:
      with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
      details = error.read().decode("utf-8", errors="replace")
      raise TelegramApiError(f"{method} failed with HTTP {error.code}: {details}") from error
    except urllib.error.URLError as error:
      raise TelegramApiError(f"{method} failed: {error.reason}") from error

    parsed = json.loads(raw)
    if not parsed.get("ok"):
      raise TelegramApiError(f"{method} failed: {parsed}")

    return parsed.get("result")

  def get_me(self) -> dict[str, Any]:
    return self.call("getMe")

  def delete_webhook(self, drop_pending_updates: bool) -> None:
    self.call("deleteWebhook", {"drop_pending_updates": drop_pending_updates})

  def get_updates(self, offset: int, timeout_seconds: int) -> list[dict[str, Any]]:
    return self.call(
      "getUpdates",
      {
        "offset": offset,
        "timeout": timeout_seconds,
        "allowed_updates": ["message"],
      },
      timeout=timeout_seconds + 10,
    )

  def send_message(self, chat_id: int, text: str, reply_markup: dict[str, Any] | None = None) -> None:
    payload: dict[str, Any] = {
      "chat_id": chat_id,
      "text": text,
      "disable_web_page_preview": True,
    }
    if reply_markup:
      payload["reply_markup"] = reply_markup
    self.call("sendMessage", payload)

  def set_my_commands(self) -> None:
    self.call("setMyCommands", {"commands": DEFAULT_COMMANDS})

  def set_chat_menu_button(self, text: str, mini_app_url: str, chat_id: int | None = None) -> None:
    payload: dict[str, Any] = {
      "menu_button": {
        "type": "web_app",
        "text": text,
        "web_app": {"url": mini_app_url},
      }
    }
    if chat_id is not None:
      payload["chat_id"] = chat_id
    self.call("setChatMenuButton", payload)


def build_launch_keyboard(settings: Settings) -> dict[str, Any]:
  return {
    "inline_keyboard": [
      [
        {
          "text": settings.launch_button_text,
          "web_app": {"url": settings.mini_app_url},
        }
      ]
    ]
  }


def build_welcome_text(start_parameter: str | None = None) -> str:
  lines = [
    "Soundkeeper - это приватный локальный аудиоплеер в формате Telegram Mini App.",
    "Вы загружаете свой аудиофайл и обложку, а библиотека карточек хранится локально на устройстве.",
    "",
    "Как это работает:",
    "1. Нажмите кнопку ниже, чтобы открыть Mini App.",
    "2. Выберите аудиофайл на устройстве.",
    "3. Сохраните карточку трека в локальную библиотеку внутри приложения.",
    "",
    "Карточка трека останется в библиотеке, но сам аудиофайл в новой сессии нужно будет подключить заново.",
  ]

  if start_parameter:
    lines.extend(["", f"Параметр запуска: {start_parameter}"])

  return "\n".join(lines)


def build_help_text(settings: Settings) -> str:
  return "\n".join(
    [
      "Команды Soundkeeper:",
      "/start - показать приветствие и кнопку запуска",
      "/app - еще раз прислать кнопку Mini App",
      "/menu - настроить кнопку меню для этого личного чата",
      "/help - показать эту справку",
      "",
      f"Текущий Mini App URL: {settings.mini_app_url}",
    ]
  )


def parse_start_parameter(text: str) -> str | None:
  parts = text.strip().split(maxsplit=1)
  if len(parts) < 2:
    return None
  return parts[1].strip() or None


def handle_message(api: TelegramBotApi, settings: Settings, message: dict[str, Any]) -> None:
  chat = message.get("chat") or {}
  chat_id = chat.get("id")
  if chat_id is None:
    return

  if chat.get("type") != "private":
    api.send_message(
      chat_id,
      "Откройте Soundkeeper в личном чате с ботом. Кнопки запуска Mini App поддерживаются именно там.",
    )
    return

  if "web_app_data" in message:
    api.send_message(
      chat_id,
      "Данные из Mini App получены. В текущем MVP бот не хранит ваши треки: воспроизведение остается локальным на устройстве.",
    )
    return

  text = (message.get("text") or "").strip()
  logging.info("Incoming message from chat_id=%s type=%s text=%r", chat_id, chat.get("type"), text)
  if not text:
    api.send_message(chat_id, "Используйте /start, чтобы открыть Soundkeeper Mini App.")
    return

  command = text.split(maxsplit=1)[0].split("@", 1)[0].lower()

  if command == "/start":
    api.send_message(chat_id, build_welcome_text(parse_start_parameter(text)), build_launch_keyboard(settings))
    return

  if command == "/app":
    api.send_message(chat_id, "Открыть плеер Soundkeeper:", build_launch_keyboard(settings))
    return

  if command == "/help":
    api.send_message(chat_id, build_help_text(settings), build_launch_keyboard(settings))
    return

  if command == "/menu":
    api.set_chat_menu_button(settings.menu_button_text, settings.mini_app_url, chat_id=chat_id)
    api.send_message(
      chat_id,
      "Кнопка меню обновлена для этого личного чата. Теперь Soundkeeper можно снова открыть из меню бота.",
      build_launch_keyboard(settings),
    )
    return

  api.send_message(chat_id, "Используйте /start для запуска Soundkeeper или /help, чтобы посмотреть команды.")


def run_setup(api: TelegramBotApi, settings: Settings) -> None:
  api.set_my_commands()
  api.set_chat_menu_button(settings.menu_button_text, settings.mini_app_url)


def run_polling(api: TelegramBotApi, settings: Settings) -> None:
  api.delete_webhook(drop_pending_updates=settings.drop_pending_updates)
  me = api.get_me()
  logging.info("Running as @%s", me.get("username", "unknown_bot"))

  offset = 0
  backoff_seconds = 2

  while True:
    try:
      updates = api.get_updates(offset=offset, timeout_seconds=settings.poll_timeout)
      backoff_seconds = 2
      if updates:
        logging.info("Received %s update(s)", len(updates))

      for update in updates:
        offset = max(offset, int(update["update_id"]) + 1)
        message = update.get("message")
        if message:
          handle_message(api, settings, message)
    except KeyboardInterrupt:
      raise
    except Exception as error:
      logging.exception("Polling error: %s", error)
      time.sleep(backoff_seconds)
      backoff_seconds = min(backoff_seconds * 2, 20)


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Minimal Telegram bot wrapper for the Soundkeeper Mini App."
  )
  parser.add_argument(
    "command",
    nargs="?",
    choices=["run", "setup"],
    default="run",
    help="run: start long polling, setup: configure commands and the default menu button",
  )
  parser.add_argument(
    "--log-level",
    default="INFO",
    choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    help="Python log level",
  )
  parser.add_argument(
    "--show-token-input",
    action="store_true",
    help="Prompt for the bot token in visible mode, useful if hidden paste does not work in your terminal",
  )
  parser.add_argument(
    "--hide-token-input",
    action="store_true",
    help="Prompt for the bot token in hidden mode",
  )
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  logging.basicConfig(level=getattr(logging, args.log_level), format="%(asctime)s %(levelname)s %(message)s")

  try:
    hide_token_input = args.hide_token_input
    if args.show_token_input:
      hide_token_input = False
    settings = Settings.from_prompt(hide_token_input=hide_token_input)
  except ValueError as error:
    print(error, file=sys.stderr)
    return 2

  api = TelegramBotApi(settings.token)

  try:
    if args.command == "setup":
      run_setup(api, settings)
      print("Команды бота и default menu button настроены.")
      return 0

    run_polling(api, settings)
    return 0
  except KeyboardInterrupt:
    print("Бот остановлен.")
    return 0
  except Exception as error:
    print(f"Бот завершился с ошибкой: {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
  raise SystemExit(main())
