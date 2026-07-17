from __future__ import annotations

from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parent
APP = ROOT / "src" / "App.tsx"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Не удалось применить изменение «{label}»: найдено совпадений {count}, ожидалось 1.")
    return text.replace(old, new, 1)


def main() -> None:
    if not (ROOT / "package.json").exists() or not APP.exists():
        raise RuntimeError(
            "Скрипт нужно запускать из корня проекта, где находятся package.json и src/App.tsx."
        )

    backup = APP.with_suffix(".tsx.before-github-storage.bak")
    if not backup.exists():
        shutil.copy2(APP, backup)

    text = APP.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "import { YandexDiskPrototype } from './components/YandexDiskPrototype';",
        "import { YandexDiskPrototype } from './components/YandexDiskPrototype';\n"
        "import { GitHubStorageGate } from './components/GitHubStorageGate';",
        "импорт GitHubStorageGate",
    )
    text = replace_once(
        text,
        "import { exportContactsToExcel } from './services/excelExport';",
        "import { exportContactsToExcel } from './services/excelExport';\n"
        "import { clearGitHubStorageConfig, getGitHubStorageConfig } from './services/githubStorage';",
        "импорт настроек GitHub",
    )
    text = replace_once(
        text,
        "function CloudApp() {\n  const [token, setToken] = useState<string | null>(() => getAccessToken());",
        "function CloudApp() {\n"
        "  const [storageConfig, setStorageConfig] = useState(() => getGitHubStorageConfig());\n"
        "  const [token, setToken] = useState<string | null>(() => getAccessToken());",
        "состояние GitHub-хранилища",
    )
    text = replace_once(
        text,
        "  useEffect(() => {\n    if (!token) return;",
        "  useEffect(() => {\n    if (!token || !storageConfig) return;",
        "проверка конфигурации перед загрузкой",
    )
    text = replace_once(
        text,
        "  }, [token]);",
        "  }, [storageConfig, token]);",
        "зависимости загрузки",
    )
    text = replace_once(
        text,
        "  const logoutWithoutData = () => {\n    clearYandexSession();\n    setToken(null);",
        "  const logoutWithoutData = () => {\n    clearYandexSession();\n    clearGitHubStorageConfig();\n    setStorageConfig(null);\n    setToken(null);",
        "очистка токена GitHub при выходе",
    )
    text = replace_once(
        text,
        "  if (!token) return <LoginGate errorMessage={errorMessage} />;\n\n  if (isBusy || !user || cloudExists === null) {",
        "  if (!token) return <LoginGate errorMessage={errorMessage} />;\n\n"
        "  if (!storageConfig) {\n"
        "    return (\n"
        "      <GitHubStorageGate\n"
        "        onConnected={(config) => {\n"
        "          setStorageConfig(config);\n"
        "          setCloudExists(null);\n"
        "        }}\n"
        "        onBack={logoutWithoutData}\n"
        "      />\n"
        "    );\n"
        "  }\n\n"
        "  if (isBusy || !user || cloudExists === null) {",
        "экран подключения приватного репозитория",
    )

    replacements = {
        "Приложение работает только с общей папкой «Справочник контактов».":
            "Приложение использует Яндекс ID для входа и приватный репозиторий GitHub для зашифрованной базы.",
        "Контакты не хранятся в GitHub и не встроены в страницу приложения.":
            "В GitHub хранится только зашифрованный файл базы; пароль в GitHub не передаётся.",
        "Он не отправляется Яндексу и не хранится в GitHub.":
            "Он не отправляется Яндексу или GitHub и не сохраняется в коде.",
        "Синхронизация с Яндекс Диском…": "Синхронизация с приватным репозиторием…",
        "Изменение сохранено локально и отправляется на Диск.":
            "Изменение сохранено локально и отправляется в облачное хранилище.",
        "Облачная база останется на Яндекс Диске.":
            "Облачная база останется в приватном репозитории GitHub.",
        "Подключаем Яндекс Диск…": "Подключаем хранилище…",
        "Проверяем общую папку и состояние базы.":
            "Проверяем приватный репозиторий и состояние базы.",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)

    APP.write_text(text, encoding="utf-8", newline="\n")
    print("Патч применён. Создана резервная копия:", backup.name)
    print("Теперь выполните: npm run typecheck && npm run build")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ОШИБКА: {exc}", file=sys.stderr)
        sys.exit(1)
