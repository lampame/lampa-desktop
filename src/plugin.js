(function () {
  "use strict";

  var icon_quit =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 4h3a2 2 0 0 1 2 2v1m-5 13h3a2 2 0 0 0 2-2v-1M4.425 19.428l6 1.8A2 2 0 0 0 13 19.312V4.688a2 2 0 0 0-2.575-1.916l-6 1.8A2 2 0 0 0 3 6.488v11.024a2 2 0 0 0 1.425 1.916M16.001 12h5m0 0l-2-2m2 2l-2 2"/></svg>';

  function addQuitButton() {
    const container = Lampa.Head.render().find(".head__actions");

    // Добавляем кнопку выхода
    const icon = $(`<div class="head__action selector">${icon_quit}</div>`);
    container.append(icon);
    icon.on("hover:enter", () => {
      window.electronAPI.closeApp();
    });
  }

  var settings_app_icon =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M7.5 13.75v.5q0 .325.213.538T8.25 15t.538-.213T9 14.25v-2.5q0-.325-.213-.537T8.25 11t-.537.213t-.213.537v.5h-.75q-.325 0-.537.213T6 13t.213.538t.537.212zm3.25 0h6.5q.325 0 .538-.213T18 13t-.213-.537t-.537-.213h-6.5q-.325 0-.537.213T10 13t.213.538t.537.212m5.75-4h.75q.325 0 .538-.213T18 9t-.213-.537t-.537-.213h-.75v-.5q0-.325-.213-.537T15.75 7t-.537.213T15 7.75v2.5q0 .325.213.538t.537.212t.538-.213t.212-.537zm-9.75 0h6.5q.325 0 .538-.213T14 9t-.213-.537t-.537-.213h-6.5q-.325 0-.537.213T6 9t.213.538t.537.212M4 19q-.825 0-1.412-.587T2 17V5q0-.825.588-1.412T4 3h16q.825 0 1.413.588T22 5v12q0 .825-.587 1.413T20 19h-4v1q0 .425-.288.713T15 21H9q-.425 0-.712-.288T8 20v-1zm0-2h16V5H4zm0 0V5z"/></svg>';

  class SettingsManager {
    constructor(componentName) {
      this.queue = [];
      this.componentName = componentName;
    }

    addToQueue(paramConfig) {
      this.queue.push({
        ...paramConfig,
        order: paramConfig.order || this.queue.length + 1,
      });
      return this;
    }

    async loadAsyncSetting(key, paramConfig) {
      try {
        const value = await window.electronAPI.store.get(key);
        localStorage.setItem(`${this.componentName}_${key}`, value);

        this.addToQueue({
          ...paramConfig,
          param: {
            ...paramConfig.param,
            default: value,
          },
        });
      } catch (error) {
        console.error(`APP Failed to load ${key}:`, error);
      }
    }

    apply() {
      this.queue.sort((a, b) => (a.order || 999) - (b.order || 999));

      this.queue.forEach((item) => {
        Lampa.SettingsApi.addParam({
          component: this.componentName,
          param: item.param,
          field: item.field,
          onChange: item.onChange,
        });
      });

      this.queue = [];
    }
  }

  function normalizeKeyboardType(value, fallback) {
    return value === "integrate" || value === "lampa" ? value : fallback;
  }

  function addAppSettings() {
    Lampa.Lang.add({
      // Основные настройки
      app_settings: {
        ru: "Приложение",
        en: "App",
        uk: "Додаток",
      },
      // Настройки полноэкранного режима
      app_settings_fullscreen_mode_name: {
        ru: "Режим полного экрана",
        en: "Fullscreen mode",
        uk: "Режим повного екрану",
      },
      app_settings_fullscreen_mode_description: {
        ru: "Выберите как будет запускаться приложение",
        en: "Choose how the application will start",
        uk: "Виберіть як буде запускатися додаток",
      },
      fullscreen_mode_always: {
        ru: "Всегда полноэкранный",
        en: "Always fullscreen",
        uk: "Завжди повноекранний",
      },
      fullscreen_mode_never: {
        ru: "Не запускать в полном экране",
        en: "Never start fullscreen",
        uk: "Не запускати в повному екрані",
      },
      fullscreen_mode_last: {
        ru: "Последнее состояние",
        en: "Last state",
        uk: "Останній стан",
      },
      app_settings_autoupdate_field_name: {
        ru: "Автоматическое обновление",
        en: "Automatic update",
        uk: "Автоматичне оновлення",
      },
      app_settings_lampa_url_placeholder: {
        ru: "Введите url лампы, начиная с http...",
        en: "Enter lamp URL starting with http...",
        uk: "Введіть url лампи, починаючи з http...",
      },
      app_settings_lampa_url_name: {
        ru: "URL лампы",
        en: "Lamp URL",
        uk: "URL лампи",
      },
      app_settings_lampa_url_description: {
        ru: "По-умолчанию: http://lampa.mx и не рекомендуем его менять",
        en: "Default: http://lampa.mx and we don't recommend changing it",
        uk: "За замовчуванням: http://lampa.mx і не рекомендуємо його змінювати",
      },
      app_settings_lampa_url_ok: {
        ru: "Сохранено, ожидайте перехода...",
        en: "Saved, waiting for redirect...",
        uk: "Збережено, очікуйте переходу...",
      },
      app_settings_lampa_url_error: {
        ru: "Неверный URL",
        en: "Invalid URL",
        uk: "Невірний URL",
      },
      app_settings_about_field_name: {
        ru: "О приложении",
        en: "About the app",
        uk: "Про додаток",
      },
      app_settings_about_field_description: {
        ru: "Узнать версию и др. информацию о приложении",
        en: "Check version and other app information",
        uk: "Дізнатися версію та іншу інформацію про додаток",
      },

      // TorrServer
      app_settings_ts_field_name: {
        ru: "TorrServer",
        en: "TorrServer",
        uk: "TorrServer",
      },
      app_settings_ts_field_description: {
        ru: "Управление TorrServer",
        en: "Control TorrServer",
        uk: "Керування TorrServer",
      },
      app_settings_ts_autostart_field_name: {
        ru: "Автозапуск при старте Lampa",
        en: "Autostart on Lampa launch",
        uk: "Автозапуск під час старту Lampa",
      },
      app_settings_ts_port_name: {
        ru: "Порт на котором запускать TS",
        en: "Port to run TS on",
        uk: "Порт на якому запускати TS",
      },
      app_settings_ts_port_description: {
        ru: "Если не знаете зачем это, оставьте 8090",
        en: "If you don't know why you need this, leave 8090",
        uk: "Якщо не знаєте навіщо це, залиште 8090",
      },
      app_settings_ts_port_ok: {
        ru: "Успешно изменено, перезапустите TorrServer",
        en: "Successfully changed, restart TorrServer",
        uk: "Успішно змінено, перезапустіть TorrServer",
      },
      app_settings_ts_status_name: {
        ru: "Статус",
        en: "Status",
        uk: "Статус",
      },
      app_settings_ts_version_name: {
        ru: "Версия",
        en: "Version",
        uk: "Версія",
      },
      app_settings_ts_status_installed_running: {
        ru: "✅ Запущен",
        en: "✅ Running",
        uk: "✅ Запущено",
      },
      app_settings_ts_status_installed_stopped: {
        ru: "❌ Остановлен",
        en: "❌ Stopped",
        uk: "❌ Зупинено",
      },
      app_settings_ts_status_not_installed: {
        ru: "🚫 Не установлен",
        en: "🚫 Not installed",
        uk: "🚫 Не встановлено",
      },
      app_settings_ts_status_install_prompt: {
        ru: "Установите TorrServer, нажав кнопку запуска",
        en: "Install TorrServer by clicking the start button",
        uk: "Встановіть TorrServer, натиснувши кнопку запуску",
      },

      // Кнопки управления TorrServer
      app_settings_ts_start_name: {
        ru: "▶️ Запуск TorrServer",
        en: "▶️ Start TorrServer",
        uk: "▶️ Запуск TorrServer",
      },
      app_settings_ts_stop_name: {
        ru: "🛑 Остановка TorrServer",
        en: "🛑 Stop TorrServer",
        uk: "🛑 Зупинка TorrServer",
      },
      app_settings_ts_restart_name: {
        ru: "🔁 Перезапуск TorrServer",
        en: "🔁 Restart TorrServer",
        uk: "🔁 Перезапуск TorrServer",
      },
      app_settings_ts_check_update_name: {
        ru: "🔍 Проверка обновлений TorrServer",
        en: "🔍 Check TorrServer updates",
        uk: "🔍 Перевірка оновлень TorrServer",
      },
      app_settings_ts_open_path_name: {
        ru: "📂 Открыть папку TorrServer",
        en: "📂 Open TorrServer folder",
        uk: "📂 Відкрити папку TorrServer",
      },
      app_settings_ts_open_web_name: {
        ru: "🌐 Открыть веб TorrServer",
        en: "🌐 Open TorrServer web",
        uk: "🌐 Відкрити веб TorrServer",
      },
      app_settings_ts_uninstall_name: {
        ru: "🗑️ Удалить TorrServer (полностью)",
        en: "🗑️ Uninstall TorrServer (completely)",
        uk: "🗑️ Видалити TorrServer (повністю)",
      },
      app_settings_ts_uninstall_keep_data_name: {
        ru: "💾 Удалить TorrServer (сохранить данные)",
        en: "💾 Uninstall TorrServer (keep data)",
        uk: "💾 Видалити TorrServer (зберегти дані)",
      },
      app_settings_ts_reinstall_name: {
        ru: "🔄 Переустановить TorrServer",
        en: "🔄 Reinstall TorrServer",
        uk: "🔄 Перевстановити TorrServer",
      },
      app_settings_ts_reinstall_loading: {
        ru: "Переустановка TorrServer...",
        en: "Reinstalling TorrServer...",
        uk: "Перевстановлення TorrServer...",
      },

      // Статусы загрузки TorrServer
      app_settings_ts_start_loading: {
        ru: "Выполняется запуск TorrServer",
        en: "Starting TorrServer",
        uk: "Виконується запуск TorrServer",
      },
      app_settings_ts_download_loading: {
        ru: "Выполняется скачивание и запуск TorrServer",
        en: "Downloading and starting TorrServer",
        uk: "Виконується завантаження та запуск TorrServer",
      },
      app_settings_ts_stop_loading: {
        ru: "Остановка TorrServer",
        en: "Stopping TorrServer",
        uk: "Зупинка TorrServer",
      },
      app_settings_ts_restart_loading: {
        ru: "Перезапуск TorrServer",
        en: "Restarting TorrServer",
        uk: "Перезапуск TorrServer",
      },
      app_settings_ts_check_update_loading: {
        ru: "Проверка обновлений TorrServer",
        en: "Checking TorrServer updates",
        uk: "Перевірка оновлень TorrServer",
      },
      app_settings_ts_update_loading: {
        ru: "Обновление TorrServer",
        en: "Updating TorrServer",
        uk: "Оновлення TorrServer",
      },
      app_settings_ts_uninstall_loading: {
        ru: "Выполняется ПОЛНОЕ удаление TorrServer...",
        en: "Performing COMPLETE uninstall of TorrServer...",
        uk: "Виконується ПОВНЕ видалення TorrServer...",
      },
      app_settings_ts_uninstall_keep_data_loading: {
        ru: "Выполняется удаление TorrServer...",
        en: "Uninstalling TorrServer...",
        uk: "Виконується видалення TorrServer...",
      },
      app_settings_ts_install_prompt: {
        ru: "Сначала установите TorrServer, нажав на запуск",
        en: "First install TorrServer by clicking start",
        uk: "Спочатку встановіть TorrServer, натиснувши на запуск",
      },

      // Обновления TorrServer
      app_settings_ts_update_found_title: {
        ru: "Найдено обновление TorrServer",
        en: "TorrServer update found",
        uk: "Знайдено оновлення TorrServer",
      },
      app_settings_ts_update_found_message: {
        ru: "Найдено обновление TorrServer.",
        en: "TorrServer update found.",
        uk: "Знайдено оновлення TorrServer.",
      },
      app_settings_ts_update_installed: {
        ru: "Установлена: {current_version}",
        en: "Installed: {current_version}",
        uk: "Встановлена: {current_version}",
      },
      app_settings_ts_update_latest: {
        ru: "Последняя версия: {latest_version}",
        en: "Latest version: {latest_version}",
        uk: "Остання версія: {latest_version}",
      },
      app_settings_ts_update_button: {
        ru: "Обновить",
        en: "Update",
        uk: "Оновити",
      },
      app_settings_ts_update_success: {
        ru: "Успешно обновлено",
        en: "Successfully updated",
        uk: "Успішно оновлено",
      },
      app_settings_ts_update_no_updates: {
        ru: "Обновлений нет, у вас последняя версия",
        en: "No updates, you have the latest version",
        uk: "Оновлень немає, у вас остання версія",
      },

      // Настройки GStreamer
      app_settings_ts_gst_field_name: {
        ru: "Поддержка транскодирования (GStreamer)",
        en: "Transcoding support (GStreamer)",
        uk: "Підтримка транскодування (GStreamer)",
      },
      app_settings_ts_gst_field_description: {
        ru: "Включите для поддержки транскодирования. Требуется переустановка TorrServer.",
        en: "Enable for transcoding support. Requires TorrServer reinstall.",
        uk: "Увімкніть для підтримки транскодування. Потребує перевстановлення TorrServer.",
      },
      app_settings_ts_gst_changed_notify: {
        ru: "Настройка GStreamer изменена. Требуется переустановка TorrServer.",
        en: "GStreamer setting changed. TorrServer reinstall required.",
        uk: "Налаштування GStreamer змінено. Потрібне перевстановлення TorrServer.",
      },
      app_settings_ts_gst_enabled: {
        ru: "✅ Поддержка GStreamer включена",
        en: "✅ GStreamer support enabled",
        uk: "✅ Підтримка GStreamer увімкнена",
      },
      app_settings_ts_gst_disabled: {
        ru: "❌ Поддержка GStreamer отключена",
        en: "❌ GStreamer support disabled",
        uk: "❌ Підтримка GStreamer вимкнена",
      },
      app_settings_ts_gst_unknown: {
        ru: "❓ Неизвестно (сервер не запущен)",
        en: "❓ Unknown (server not running)",
        uk: "❓ Невідомо (сервер не запущено)",
      },
      app_settings_ts_gst_status_name: {
        ru: "Статус GStreamer",
        en: "GStreamer status",
        uk: "Статус GStreamer",
      },
      app_settings_ts_gst_version_name: {
        ru: "Версия GStreamer",
        en: "GStreamer version",
        uk: "Версія GStreamer",
      },
      app_settings_ts_version_with_gst: {
        ru: "{version} (с GStreamer)",
        en: "{version} (with GStreamer)",
        uk: "{version} (з GStreamer)",
      },
      app_settings_ts_version_without_gst: {
        ru: "{version} (без GStreamer)",
        en: "{version} (without GStreamer)",
        uk: "{version} (без GStreamer)",
      },

      app_settings_web_security_field_name: {
        ru: "Проверка CORS",
        en: "CORS check",
        uk: "Перевірка CORS",
      },
      app_settings_web_security_field_description: {
        ru: "Если балансировщики не работают, укажите «Нет» — CORS отключится, но вы действуете на свой риск.",
        en: "If load balancers do not work, set 'No' — CORS will be disabled, but you do so at your own risk.",
        uk: "Якщо балансувальники не працюють, вкажіть «Ні» — CORS вимкнеться, але ви дієте на свій ризик.",
      },
      app_settings_web_security_notify: {
        ru: "Перезапустите приложение, для применения настройки!",
        en: "Restart the application to apply the setting!",
        uk: "Перезапустіть застосунок, щоб застосувати налаштування!",
      },

      // Импорт/Экспорт
      app_settings_ie_field_name: {
        ru: "Экспорт/Импорт настроек",
        en: "Export/Import settings",
        uk: "Експорт/Імпорт налаштувань",
      },
      app_settings_ie_field_description: {
        ru: "Резервная копия данных или перенос из другого приложения",
        en: "Backup data or transfer from another application",
        uk: "Резервна копія даних або перенесення з іншого додатку",
      },
      app_settings_ie_btn_export_title: {
        ru: "Экспорт",
        en: "Export",
        uk: "Експорт",
      },
      app_settings_ie_btn_export_subtitle: {
        ru: "Сохранить настройки в файл",
        en: "Save settings to file",
        uk: "Зберегти налаштування у файл",
      },
      app_settings_ie_btn_export_cloud_subtitle: {
        ru: "Сохранить настройки в облако. Ваши данные будут зашифрованы перед отправкой с помощью пин-кода и хранятся 1 час.",
        en: "Save settings to the cloud. Your data will be encrypted before sending using a PIN code and stored for 1 hour.",
        uk: "Зберегти налаштування в хмару. Ваші дані будуть зашифровані перед відправкою за допомогою пін-коду та зберігаються 1 годину.",
      },
      app_settings_ie_btn_import_title: {
        ru: "Импорт",
        en: "Import",
        uk: "Імпорт",
      },
      app_settings_ie_btn_import_subtitle: {
        ru: "Импортировать настройки из файла",
        en: "Import settings from file",
        uk: "Імпортувати налаштування з файлу",
      },
      app_settings_ie_btn_import_cloud_subtitle: {
        ru: "Импортировать настройки из облака",
        en: "Import settings from cloud",
        uk: "Імпортувати налаштування з хмари",
      },
      app_settings_noty_waiting: {
        ru: "Ожидайте...",
        en: "Please wait...",
        uk: "Зачекайте...",
      },
      app_settings_ie_import_success: {
        ru: "Импорт выполнен успешно",
        en: "Import completed successfully",
        uk: "Імпорт виконано успішно",
      },
      app_settings_ie_import_error: {
        ru: "Ошибка импорта",
        en: "Import error",
        uk: "Помилка імпорту",
      },
      app_settings_ie_invalid_pin: {
        ru: "Неверный PIN-код",
        en: "Invalid PIN",
        uk: "Невірний PIN-код",
      },

      // Разделители
      app_settings_separator_main_name: {
        ru: "Основные",
        en: "Main",
        uk: "Основні",
      },
      app_settings_separator_other_name: {
        ru: "Остальные",
        en: "Other",
        uk: "Інші",
      },
      app_settings_ts_separator_main_title: {
        ru: "Управление",
        en: "Management",
        uk: "Керування",
      },
      app_settings_ts_separator_settings_title: {
        ru: "Настройки",
        en: "Settings",
        uk: "Налаштування",
      },
      app_settings_ts_separator_danger_title: {
        ru: "Осторожно!",
        en: "Caution!",
        uk: "Обережно!",
      },

      // Облачный импорт/экспорт
      app_settings_ie_separator_cloud_title: {
        ru: "Облако",
        en: "Cloud",
        uk: "Хмара",
      },
      app_settings_ie_separator_local_title: {
        ru: "Локально",
        en: "Local",
        uk: "Локально",
      },
      app_settings_ie_modal_import_cloud: {
        ru: "Импорт настроек из облака",
        en: "Import settings from cloud",
        uk: "Імпорт налаштувань з хмари",
      },
      app_settings_ie_modal_enter_id: {
        ru: "Введите ID",
        en: "Enter ID",
        uk: "Введіть ID",
      },
      app_settings_ie_modal_enter_pin_title: {
        ru: "Введите PIN-код",
        en: "Enter PIN code",
        uk: "Введіть PIN-код",
      },

      // Плееры
      app_settings_player_find: {
        ru: "Поиск и выбор плеера",
        en: "Player search and selection",
        uk: "Пошук і вибір плеєра",
      },
      app_settings_player_find_description: {
        ru: "Нажмите, чтобы выбрать из найденных плееров в вашей системе.",
        en: "Click to select from the found players in your system.",
        uk: "Натисніть, щоб вибрати зі знайдених плеєрів у вашій системі.",
      },
      app_settings_player_libmpv: {
        ru: "libmpv (системный mpv)",
        en: "libmpv (system mpv)",
        uk: "libmpv (системний mpv)",
      },
      mpv_no_binary: {
        ru: "mpv не найден. Установите mpv (brew install mpv) или укажите путь вручную",
        en: "mpv not found. Install mpv (brew install mpv) or set the path manually",
        uk: "mpv не знайдено. Встановіть mpv (brew install mpv) або вкажіть шлях вручну",
      },
      mpv_now_playing: {
        ru: "▶ {title} (продолжено с {time})",
        en: "▶ {title} (resumed from {time})",
        uk: "▶ {title} (продовжено з {time})",
      },
      mpv_path_title: {
        ru: "Путь к mpv",
        en: "mpv path",
        uk: "Шлях до mpv",
      },
      mpv_path_select: {
        ru: "Выбрать вручную",
        en: "Choose manually",
        uk: "Обрати вручну",
      },
      mpv_path_custom: {
        ru: "Вручную: {path}",
        en: "Custom: {path}",
        uk: "Вручну: {path}",
      },
      mpv_path_auto: {
        ru: "Авто: {path}",
        en: "Auto: {path}",
        uk: "Авто: {path}",
      },
      mpv_path_reset: {
        ru: "Сбросить к автопоиску",
        en: "Reset to auto-detect",
        uk: "Скинути до автопошуку",
      },
      mpv_uosc_title: {
        ru: "Интерфейс uosc в mpv",
        en: "uosc interface in mpv",
        uk: "Інтерфейс uosc в mpv",
      },
      mpv_uosc_description: {
        ru: "Современный OSD для mpv. Требует mpv 0.35+. Применяется при следующем запуске.",
        en: "Modern OSD for mpv. Requires mpv 0.35+. Applies on next launch.",
        uk: "Сучасний OSD для mpv. Потрібен mpv 0.35+. Застосовується при наступному запуску.",
      },
      mpv_fullscreen_title: {
        ru: "mpv на весь экран",
        en: "mpv fullscreen",
        uk: "mpv на весь екран",
      },
      mpv_fullscreen_description: {
        ru: "Запускать mpv сразу в полноэкранном режиме. Применяется при следующем запуске.",
        en: "Launch mpv directly in fullscreen. Applies on next launch.",
        uk: "Запускати mpv одразу в повноекранному режимі. Застосовується при наступному запуску.",
      },
      mpv_esc_quits_title: {
        ru: "ESC закрывает mpv",
        en: "ESC quits mpv",
        uk: "ESC закриває mpv",
      },
      mpv_esc_quits_description: {
        ru: "Переназначить ESC с выхода из полноэкранного режима на полное закрытие mpv. Применяется при следующем запуске.",
        en: "Remap ESC from exiting fullscreen to quitting mpv entirely. Applies on next launch.",
        uk: "Перепризначити ESC з виходу з повноекранного режиму на повне закриття mpv. Застосовується при наступному запуску.",
      },
      mpv_quality_title: {
        ru: "Качество видео",
        en: "Video quality",
        uk: "Якість відео",
      },
      mpv_quality_description: {
        ru: "Уровень апскейла mpv. Применяется при следующем запуске видео.",
        en: "mpv upscale level. Applies on next video launch.",
        uk: "Рівень апскейлу mpv. Застосовується при наступному запуску відео.",
      },
      mpv_quality_off: {
        ru: "Выключено",
        en: "Off",
        uk: "Вимкнено",
      },
      mpv_quality_balanced: {
        ru: "Сбалансированное",
        en: "Balanced",
        uk: "Збалансована",
      },
      mpv_quality_quality: {
        ru: "Максимальное",
        en: "Maximum",
        uk: "Максимальна",
      },
      mpv_smooth_motion_title: {
        ru: "Плавное движение (interpolation)",
        en: "Smooth motion (interpolation)",
        uk: "Плавний рух (interpolation)",
      },
      mpv_smooth_motion_description: {
        ru: "Для фиксированных 60Гц экранов. Не рекомендуется для ProMotion/VRR и Bluetooth-аудио. Применяется при следующем запуске.",
        en: "For fixed 60Hz screens. Not recommended for ProMotion/VRR and Bluetooth audio. Applies on next launch.",
        uk: "Для фіксованих 60Гц екранів. Не рекомендується для ProMotion/VRR та Bluetooth-аудіо. Застосовується при наступному запуску.",
      },
      mpv_custom_args_title: {
        ru: "Дополнительные флаги mpv",
        en: "Additional mpv flags",
        uk: "Додаткові прапори mpv",
      },
      mpv_custom_args_description: {
        ru: "Свои --флаги поверх профиля. Неверный флаг игнорируется с логом.",
        en: "Custom --flags on top of the profile. An invalid flag is ignored with a log.",
        uk: "Власні --прапори поверх профілю. Невалідний прапор ігнорується з логом.",
      },
      mpv_quality_applied: {
        ru: "Качество mpv: {level}",
        en: "mpv quality: {level}",
        uk: "Якість mpv: {level}",
      },
      app_settings_keyboard_section: {
        ru: "Выбор клавиатуры",
        en: "Keyboard selection",
        uk: "Вибір клавіатури",
      },
      app_settings_keyboard_default: {
        ru: "По умолчанию",
        en: "Default",
        uk: "За замовчуванням",
      },
      app_settings_keyboard_gamepad: {
        ru: "С геймпадом",
        en: "With gamepad",
        uk: "З геймпадом",
      },
      app_settings_keyboard_system: {
        ru: "Системная",
        en: "System",
        uk: "Системна",
      },
      app_settings_keyboard_builtin: {
        ru: "Встроенная",
        en: "Built-in",
        uk: "Вбудована",
      },

      // Поддержка
      donate_support: {
        ru: "Поддержать на {amount}₽",
        en: "Support with {amount}₽",
        uk: "Підтримати на {amount}₽",
      },
      donate_btn_description: {
        ru: "Пожертвование на развитие проекта",
        en: "Donation for project development",
        uk: "Пожертвування на розвиток проекту",
      },
      donate_btn_title: {
        ru: "Поддержать проект 🫶",
        en: "Support the project🫶",
        uk: "Підтримати проект 🫶",
      },
      donate_modal_title: {
        ru: "Поддержать проект 🫶",
        en: "Support the project 🫶",
        uk: "Підтримати проект 🫶",
      },
      donate_modal_description: {
        ru: "Внимание! Это поддержка именно разработчика приложения под Десктоп, а не самой Lampa.",
        en: "Attention! This is the support of the Desktop application developer, not Lampa itself.",
        uk: "Увага! Це підтримка саме розробника програми під Десктоп, а не самої Lampa.",
      },

      // О приложении
      app_about_title: {
        ru: "Не официальное приложение-клиент для Lampa.",
        en: "Unofficial client application for Lampa.",
        uk: "Неофіційний додаток-клієнт для Lampa.",
      },
      app_about_version_app: {
        ru: "Версия приложения: {current_version}",
        en: "App version: {current_version}",
        uk: "Версія додатку: {current_version}",
      },
      app_about_version_latest: {
        ru: "Последняя версия: {latest_version}",
        en: "Latest version: {latest_version}",
        uk: "Остання версія: {latest_version}",
      },
      app_about_version_lampa: {
        ru: "Версия Lampa: {lampa_version}",
        en: "Lampa version: {lampa_version}",
        uk: "Версія Lampa: {lampa_version}",
      },
      app_about_github: {
        ru: "GitHub",
        en: "GitHub",
        uk: "GitHub",
      },

      // Горячие клавиши
      hotkey_search: {
        ru: "Поиск",
        en: "Search",
        uk: "Пошук",
      },
      hotkey_fullscreen: {
        ru: "Полноэкранный режим",
        en: "Fullscreen mode",
        uk: "Повноекранний режим",
      },
      hotkey_close: {
        ru: "Закрытие приложения",
        en: "Close application",
        uk: "Закриття додатку",
      },
      hotkey_menu: {
        ru: "Открыть/закрыть меню",
        en: "Open/close menu",
        uk: "Відкрити / закрити меню",
      },

      app_error: {
        ru: "Ошибка",
        en: "Error",
        uk: "Помилка",
      },
    });

    Lampa.SettingsApi.addComponent({
      component: "app_settings",
      name: Lampa.Lang.translate("app_settings"),
      icon: settings_app_icon,
      before: "account",
    });

    Lampa.Template.add(
      "settings_app_settings_ts",
      `<div>
        <div class="settings-param" data-static="true" data-name="app_settings_ts_tsStatus">
          <div class="settings-param__name">${Lampa.Lang.translate("app_settings_ts_status_name")}</div>
          <div class="settings-param__descr">🔄</div>
        </div>
        <div class="settings-param" data-static="true" data-name="app_settings_ts_tsVersion">
          <div class="settings-param__name">${Lampa.Lang.translate("app_settings_ts_version_name")}</div>
          <div class="settings-param__descr">🔄</div>
        </div>
        <div class="settings-param" data-static="true" data-name="app_settings_ts_tsGstStatus">
          <div class="settings-param__name">${Lampa.Lang.translate("app_settings_ts_gst_status_name")}</div>
          <div class="settings-param__descr">🔄</div>
        </div>
        <div class="settings-param" data-static="true" data-name="app_settings_ts_tsGstVersion">
          <div class="settings-param__name">${Lampa.Lang.translate("app_settings_ts_gst_version_name")}</div>
          <div class="settings-param__descr">🔄</div>
        </div>
      </div>`,
    );

    const settingsManager = new SettingsManager("app_settings");

    const currentKeyboardType = normalizeKeyboardType(
      Lampa.Storage.get(
        "desktop_keyboard_regular",
        Lampa.Storage.get("keyboard_type", "integrate"),
      ),
      "integrate",
    );
    const gamepadKeyboardType = normalizeKeyboardType(
      Lampa.Storage.get("desktop_keyboard_gamepad", "lampa"),
      "lampa",
    );

    Lampa.Storage.set("desktop_keyboard_regular", currentKeyboardType);
    Lampa.Storage.set("desktop_keyboard_gamepad", gamepadKeyboardType);
    Lampa.Storage.set("keyboard_type", currentKeyboardType);
    Lampa.SettingsApi.addParam({
      component: "more",
      param: {
        name: "desktop_keyboard_separator",
        type: "title",
      },
      field: {
        name: Lampa.Lang.translate("app_settings_keyboard_section"),
      },
      onRender: function (element) {
        setTimeout(function () {
          const anchor = $('div[data-name="keyboard_type"]');
          anchor.hide();
          const moreTitle = $('div[data-name="pages_save_total"]').prev(
            ".settings-param-title",
          );
          element.attr("data-desktop-section", "keyboard");
          if (moreTitle.length) moreTitle.before(element);
        }, 0);
      },
    });
    Lampa.SettingsApi.addParam({
      component: "more",
      param: {
        name: "desktop_keyboard_regular",
        type: "select",
        values: {
          integrate: Lampa.Lang.translate("app_settings_keyboard_system"),
          lampa: Lampa.Lang.translate("app_settings_keyboard_builtin"),
        },
        default: currentKeyboardType,
      },
      field: {
        name: Lampa.Lang.translate("app_settings_keyboard_default"),
      },
      onChange: function (value) {
        const type = normalizeKeyboardType(value, "integrate");
        Lampa.Storage.set("desktop_keyboard_regular", type);
        Lampa.Storage.set("keyboard_type", type);
      },
      onRender: function (element) {
        setTimeout(function () {
          const section = $('[data-desktop-section="keyboard"]');
          if (section.length) section.after(element);
        }, 0);
      },
    });
    Lampa.SettingsApi.addParam({
      component: "more",
      param: {
        name: "desktop_keyboard_gamepad",
        type: "select",
        values: {
          integrate: Lampa.Lang.translate("app_settings_keyboard_system"),
          lampa: Lampa.Lang.translate("app_settings_keyboard_builtin"),
        },
        default: gamepadKeyboardType,
      },
      field: {
        name: Lampa.Lang.translate("app_settings_keyboard_gamepad"),
      },
      onChange: function (value) {
        const type = normalizeKeyboardType(value, "lampa");
        Lampa.Storage.set("desktop_keyboard_gamepad", type);
        Lampa.Storage.set("keyboard_type", type);
      },
      onRender: function (element) {
        setTimeout(function () {
          const regular = $('div[data-name="desktop_keyboard_regular"]');
          if (regular.length) regular.after(element);
          else {
            const anchor = $('div[data-name="keyboard_type"]');
            if (anchor.length) anchor.after(element);
          }
        }, 0);
      },
    });
    // libmpv is selected here as well — show on macOS too
    {
      Lampa.SettingsApi.addParam({
        component: "player",
        param: {
          name: "player_find",
          type: "button",
        },
        field: {
          name: Lampa.Lang.translate("app_settings_player_find"),
          description: Lampa.Lang.translate(
            "app_settings_player_find_description",
          ),
        },
        onChange: async () => {
          Lampa.Loading.start(
            () => {},
            Lampa.Lang.translate("app_settings_player_find"),
          );

          const result = await window.electronAPI.player.getAllWithDetails();
          Lampa.Loading.stop();

          if (!result.success || result.players.length === 0) {
            Lampa.Noty.show("Медиа плееры не найдены!", "error", 5000);
            return;
          }

          // Используем встроенный Lampa.Select вместо кастомного модального окна
          const items = [];
          for (let i = 0; i < result.players.length; i++) {
            const player = result.players[i];
            items.push({
              title: player.name,
              subtitle: player.path,
              value: player.id,
              selected: player.isDefault,
            });
          }

          Lampa.Select.show({
            title: "Выберите плеер по умолчанию",
            items: items,
            onSelect: async (item) => {
              Lampa.Loading.start(() => {}, `Выбор ${item.title}...`);

              const saveResult =
                await window.electronAPI.player.setDefaultAndSave(item.value);

              Lampa.Loading.stop();

              if (saveResult.success) {
                Lampa.Noty.show(`Выбран плеер: ${item.title}`, "success", 3000);
                Lampa.Settings.update();
              } else {
                Lampa.Noty.show("Ошибка при выборе плеера", "error", 3000);
              }

              Lampa.Controller.toggle("settings_component");
            },
            onBack: () => {
              Lampa.Controller.toggle("settings_component");
            },
          });
        },
        onRender: function (element) {
          setTimeout(function () {
            var anchor = $('div[data-name="player_nw_path"]');
            if (anchor.length) anchor.after(element);
          }, 0);
        },
      });
    }

    if (Lampa.Platform.macOS()) {
      // Sync mpvEscQuits from electron-store to Lampa.Storage so the toggle
      // shows the correct persisted state (not always default: true).
      (async function syncMpvEscQuits() {
        try {
          var mpv = window.electronAPI && window.electronAPI.mpv;
          if (mpv && typeof mpv.getEscQuits === "function") {
            var info = await mpv.getEscQuits();
            if (info && typeof info.enabled === "boolean") {
              Lampa.Storage.set("mpv_esc_quits", info.enabled);
            }
          }
        } catch (err) {
          console.error("APP Failed to sync mpv ESC quits:", err);
        }
      })();

      Lampa.SettingsApi.addParam({
        component: "app_settings",
        param: {
          name: "mpv_path",
          type: "button",
        },
        field: {
          name: Lampa.Lang.translate("mpv_path_title"),
          description: Lampa.Lang.translate("mpv_no_binary"),
        },
        onChange: async () => {
          var mpv = window.electronAPI && window.electronAPI.mpv;
          if (!mpv) {
            Lampa.Noty.show(
              Lampa.Lang.translate("mpv_no_binary"),
              "error",
              5000,
            );
            return;
          }
          var info = null;
          try {
            info = await mpv.getPath();
          } catch (err) {
            console.error("APP Failed to get mpv path", err);
          }
          var current =
            info && info.path
              ? Lampa.Lang.translate(
                  info.source === "custom"
                    ? "mpv_path_custom"
                    : "mpv_path_auto",
                ).replace("{path}", info.path)
              : Lampa.Lang.translate("mpv_no_binary");
          Lampa.Select.show({
            title: current,
            items: [
              {
                title: Lampa.Lang.translate("mpv_path_select"),
                action: "manual",
              },
              {
                title: Lampa.Lang.translate("mpv_path_reset"),
                action: "reset",
              },
            ],
            onSelect: async (item) => {
              var result = null;
              if (item.action === "manual") {
                result = await mpv.selectPathDialog();
              } else {
                result = await mpv.setPath("");
              }
              if (result && result.message) Lampa.Noty.show(result.message);
              Lampa.Settings.update();
              Lampa.Controller.toggle("settings_component");
            },
            onBack: () => {
              Lampa.Controller.toggle("settings_component");
            },
          });
        },
        onRender: function (element) {
          setTimeout(async function () {
            try {
              var mpv = window.electronAPI && window.electronAPI.mpv;
              if (!mpv || typeof mpv.getPath !== "function") return;
              var info = await mpv.getPath();
              if (info && info.path) {
                element
                  .find(".settings-param__descr")
                  .text(
                    Lampa.Lang.translate(
                      info.source === "custom"
                        ? "mpv_path_custom"
                        : "mpv_path_auto",
                    ).replace("{path}", info.path),
                  );
              }
            } catch (err) {
              console.error("APP Failed to get mpv path", err);
            }
          }, 0);
        },
      });
      Lampa.SettingsApi.addParam({
        component: "app_settings",
        param: {
          name: "mpv_uosc",
          type: "trigger",
          default: true,
        },
        field: {
          name: Lampa.Lang.translate("mpv_uosc_title"),
          description: Lampa.Lang.translate("mpv_uosc_description"),
        },
        onChange: async function (value) {
          var mpv = window.electronAPI && window.electronAPI.mpv;
          if (mpv && typeof mpv.setUosc === "function") {
            try {
              await mpv.setUosc(value === "true");
            } catch (err) {
              console.error("APP Failed to set uosc", err);
            }
          }
        },
        onRender: function (element) {
          setTimeout(async function () {
            try {
              var mpv = window.electronAPI && window.electronAPI.mpv;
              if (!mpv || typeof mpv.getUosc !== "function") return;
              var info = await mpv.getUosc();
              if (info && !info.supported) {
                element
                  .find(".settings-param__descr")
                  .text(
                    "mpv " + (info.version || "?") + " < " + info.minVersion,
                  );
              }
            } catch (err) {
              console.error("APP Failed to get uosc info", err);
            }
          }, 0);
        },
      });
      Lampa.SettingsApi.addParam({
        component: "app_settings",
        param: {
          name: "mpv_fullscreen",
          type: "trigger",
          default: true,
        },
        field: {
          name: Lampa.Lang.translate("mpv_fullscreen_title"),
          description: Lampa.Lang.translate("mpv_fullscreen_description"),
        },
        onChange: async function (value) {
          var mpv = window.electronAPI && window.electronAPI.mpv;
          if (mpv && typeof mpv.setFullscreen === "function") {
            try {
              await mpv.setFullscreen(value === "true");
            } catch (err) {
              console.error("APP Failed to set mpv fullscreen", err);
            }
          }
        },
      });
      Lampa.SettingsApi.addParam({
        component: "app_settings",
        param: {
          name: "mpv_esc_quits",
          type: "trigger",
          default: true,
        },
        field: {
          name: Lampa.Lang.translate("mpv_esc_quits_title"),
          description: Lampa.Lang.translate("mpv_esc_quits_description"),
        },
        onChange: async function (value) {
          var enabled = value === "true";
          Lampa.Storage.set("mpv_esc_quits", enabled);
          var mpv = window.electronAPI && window.electronAPI.mpv;
          if (mpv && typeof mpv.setEscQuits === "function") {
            try {
              await mpv.setEscQuits(enabled);
            } catch (err) {
              console.error("APP Failed to set mpv ESC quits", err);
            }
          }
        },
      });
      Lampa.SettingsApi.addParam({
        component: "app_settings",
        param: {
          name: "mpv_quality",
          type: "select",
          values: {
            off: Lampa.Lang.translate("mpv_quality_off"),
            balanced: Lampa.Lang.translate("mpv_quality_balanced"),
            quality: Lampa.Lang.translate("mpv_quality_quality"),
          },
          default: Lampa.Storage.get("mpv_quality", "balanced"),
        },
        field: {
          name: Lampa.Lang.translate("mpv_quality_title"),
          description: Lampa.Lang.translate("mpv_quality_description"),
        },
        onChange: async function (value) {
          try {
            Lampa.Storage.set("mpv_quality", value);
            var mpv = window.electronAPI && window.electronAPI.mpv;
            if (mpv && typeof mpv.setQuality === "function") {
              var result = await mpv.setQuality(value);
              if (!result || result.success === false) {
                throw new Error(
                  (result && result.error) || "setQuality failed",
                );
              }
            }
            Lampa.Noty.show(
              Lampa.Lang.translate("mpv_quality_applied").replace(
                "{level}",
                value,
              ),
              "success",
              2000,
            );
          } catch (err) {
            console.error("APP Failed to set mpv quality", err);
            Lampa.Noty.show(Lampa.Lang.translate("app_error"), "error", 3000);
          }
        },
      });
      Lampa.SettingsApi.addParam({
        component: "app_settings",
        param: {
          name: "mpv_smooth_motion",
          type: "trigger",
          default: Boolean(Lampa.Storage.get("mpv_smooth_motion", false)),
        },
        field: {
          name: Lampa.Lang.translate("mpv_smooth_motion_title"),
          description: Lampa.Lang.translate("mpv_smooth_motion_description"),
        },
        onChange: async function (value) {
          try {
            var enabled = value === "true";
            Lampa.Storage.set("mpv_smooth_motion", enabled);
            var mpv = window.electronAPI && window.electronAPI.mpv;
            if (mpv && typeof mpv.setSmoothMotion === "function") {
              var result = await mpv.setSmoothMotion(enabled);
              if (!result || result.success === false) {
                throw new Error(
                  (result && result.error) || "setSmoothMotion failed",
                );
              }
            }
            Lampa.Noty.show(
              Lampa.Lang.translate("mpv_quality_applied").replace(
                "{level}",
                String(enabled),
              ),
              "success",
              2000,
            );
          } catch (err) {
            console.error("APP Failed to set mpv smooth motion", err);
            Lampa.Noty.show(Lampa.Lang.translate("app_error"), "error", 3000);
          }
        },
      });
      Lampa.SettingsApi.addParam({
        component: "app_settings",
        param: {
          name: "mpv_custom_args",
          type: "input",
          values: Lampa.Storage.get("mpv_custom_args", ""),
        },
        field: {
          name: Lampa.Lang.translate("mpv_custom_args_title"),
          description: Lampa.Lang.translate("mpv_custom_args_description"),
        },
        onChange: async function (value) {
          try {
            var raw = typeof value === "string" ? value : "";
            Lampa.Storage.set("mpv_custom_args", raw);
            var mpv = window.electronAPI && window.electronAPI.mpv;
            if (mpv && typeof mpv.setCustomArgs === "function") {
              var result = await mpv.setCustomArgs(raw);
              if (!result || result.success === false) {
                throw new Error(
                  (result && result.error) || "setCustomArgs failed",
                );
              }
            }
            Lampa.Noty.show(
              Lampa.Lang.translate("mpv_quality_applied").replace(
                "{level}",
                raw || "—",
              ),
              "success",
              2000,
            );
          } catch (err) {
            console.error("APP Failed to set mpv custom args", err);
            Lampa.Noty.show(Lampa.Lang.translate("app_error"), "error", 3000);
          }
        },
      });
      (async function syncMpvQualitySettings() {
        try {
          var mpv = window.electronAPI && window.electronAPI.mpv;
          if (!mpv || typeof mpv.getQuality !== "function") return;
          var info = await mpv.getQuality();
          if (!info || info.success === false) return;
          if (info.level) Lampa.Storage.set("mpv_quality", info.level);
          if (typeof info.smoothMotion === "boolean") {
            Lampa.Storage.set("mpv_smooth_motion", info.smoothMotion);
          }
          if (typeof info.customArgs === "string") {
            Lampa.Storage.set("mpv_custom_args", info.customArgs);
          }
        } catch (err) {
          console.error("APP Failed to sync mpv quality settings:", err);
        }
      })();
    }

    Promise.all([
      settingsManager.addToQueue({
        order: 3,
        param: {
          name: "app_settings_fullscreen_mode",
          type: "select",
          values: {
            always: Lampa.Lang.translate("fullscreen_mode_always"),
            never: Lampa.Lang.translate("fullscreen_mode_never"),
            last: Lampa.Lang.translate("fullscreen_mode_last"),
          },
          default: "last",
        },
        field: {
          name: Lampa.Lang.translate("app_settings_fullscreen_mode_name"),
          description: Lampa.Lang.translate(
            "app_settings_fullscreen_mode_description",
          ),
        },
        onChange: async (value) => {
          const result = await window.electronAPI.setFullscreenMode(value);
          if (result.success) {
            Lampa.Noty.show(`Режим изменен на: ${value}`, "success", 2000);
          } else {
            Lampa.Noty.show(
              `${Lampa.Lang.translate("app_error")}: ${result.message}`,
              "error",
              5000,
            );
          }
        },
      }),

      settingsManager.loadAsyncSetting("autoUpdate", {
        order: 4,
        param: {
          name: "app_settings_autoUpdate",
          type: "trigger",
        },
        field: {
          name: Lampa.Lang.translate("app_settings_autoupdate_field_name"),
        },
        onChange: async function (value) {
          await window.electronAPI.store.set("autoUpdate", value === "true");
        },
      }),

      settingsManager.loadAsyncSetting("lampaUrl", {
        order: 5,
        param: {
          name: "app_settings_lampaUrl",
          type: "input",
          placeholder: Lampa.Lang.translate(
            "app_settings_lampa_url_placeholder",
          ),
          values: "",
        },
        field: {
          name: Lampa.Lang.translate("app_settings_lampa_url_name"),
          description: Lampa.Lang.translate(
            "app_settings_lampa_url_description",
          ),
        },
        onChange: async function (value) {
          if (URL.canParse(value)) {
            // Lampa.Settings.update();
            Lampa.Noty.show(Lampa.Lang.translate("app_settings_lampa_url_ok"));
            setTimeout(
              async () => await window.electronAPI.store.set("lampaUrl", value),
              1000,
            );
          } else {
            Lampa.Noty.show(
              Lampa.Lang.translate("app_settings_lampa_url_error"),
            );
          }
        },
      }),
      settingsManager.loadAsyncSetting("webSecurity", {
        order: 8.5,
        param: {
          name: "app_settings_webSecurity",
          type: "trigger",
        },
        field: {
          name: Lampa.Lang.translate("app_settings_web_security_field_name"),
          description: Lampa.Lang.translate(
            "app_settings_web_security_field_description",
          ),
        },
        onChange: async function (value) {
          await window.electronAPI.store.set("webSecurity", value === "true");
          Lampa.Noty.show(
            Lampa.Lang.translate("app_settings_web_security_notify"),
          );
        },
      }),
    ]).then(() => {
      settingsManager
        .addToQueue({
          order: 0.5,
          param: {
            name: "app_settings_donate",
            type: "button",
          },
          field: {
            name: Lampa.Lang.translate("donate_btn_title"),
            description: Lampa.Lang.translate("donate_btn_description"),
          },
          onChange: function () {
            Lampa.Loading.start(() => {}, Lampa.Lang.translate("loading"));

            Lampa.Template.add(
              "donate_modal",
              `<div class="app-modal-donate" style="padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 200px; flex-direction: column;">
          <style>
            .donate-qr-container {
              display: flex;
              gap: 20px;
              justify-content: center;
              flex-wrap: wrap;
              max-width: 100%;
            }
            .donate-qr-item {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 15px;
              padding: 20px;
              border-radius: 12px;
              background: rgba(255, 255, 255, 0.05);
              min-width: 0;
              flex: 1;
              max-width: 250px;
            }
            .qr-code {
              width: 100%;
              max-width: 200px;
              aspect-ratio: 1 / 1;
              border-radius: 8px;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
              background: white;
              padding: 5px;
            }
            .qr-code img {
              width: 100%;
              height: 100%;
              object-fit: contain;
            }
            .donate-amount {
              font-size: clamp(18px, 5vw, 24px);
              font-weight: bold;
              color: #fff;
              text-align: center;
            }
            .donate-bottom-text {
              margin-top: 25px;
              text-align: center;
              color: #999;
              font-size: clamp(12px, 3vw, 14px);
              line-height: 1.5;
              max-width: 600px;
              padding: 0 10px;
            }
            @media (max-width: 700px) {
              .donate-qr-item {
                padding: 15px;
                gap: 10px;
                max-width: 200px;
              }
              .donate-qr-container {
                gap: 10px;
              }
            }
            @media (max-width: 500px) {
              .donate-qr-item {
                padding: 10px;
                max-width: 160px;
              }
              .donate-qr-container {
                gap: 8px;
              }
            }
          </style>
          <div class="donate-qr-container">
            <!-- 100₽ -->
            <div class="donate-qr-item">
              <div class="qr-code">
                <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADIAQMAAACXljzdAAAABlBMVEX///8AAABVwtN+AAAACXBIWXMAAA7EAAAOxAGVKw4bAAAB+UlEQVRYhc2XUY7DIAxELXEAjsBFUUHiojkCB0DxesbJtvvRzzVJ1TTh9WOEPbYR+Xo1VV2SjmZ3POtME79nGKmmopZxJNXD9Ez7nVh7xZGiB56a3aGq239r1vkYwu8qPXfB/m0g4uqajil5zGDCyK2ymLH2lpd8xnQnYV5bViGzKhWPz4wPILePu+f2pL4/Dv9vYjrg69LN3yJkVNgfQIQrjXTZe5ppusOiSHNPQZXCWVBnei2vo0jCzljusrpwb3pemSq3EykDlYbuGqjIXIfqKFJNGRiih4gN6wz49kBCX5Mxb02ncfTG7QR+70XpejjdYpbxv1cYkYIdMmKZ07OaKquEV0yjCN4WeyIqf/qN3H7iPfueapJPNdljGkMsTw70AngbcYPKfvXG3aTeH3ZuuI6u59QZQ9iPjsbe4JXZ4sbOFEZsd9gbLIsWtaEv9Hw+gFR27PZ2Peeczpk8iIhPdvAYXI/VK+OjSIGj5PK2Tp8crEM+ggzmVPLOcM8W+YwjyGzT55PDYneSy9txhLUFNXiy8iqe5AGEl0evsGPOxrjFET+XYLarzB1UP8xWZxihszg/LK71zPny9vZecp+ooR89068ZTQZrH+oOHa760dFjiPrkwJORn80eQbwqc3Lwcz3W17sv/DvxvKY+Rqypn+DOB5Cv1w83JXZzhKriPAAAAABJRU5ErkJggg=="
                     alt="QR код 100₽">
              </div>
              <div class="donate-amount">100₽</div>
              <div class="simple-button selector donate-link" data-amount="100" style="margin-right: unset; font-size: unset; text-align: center">
                <span>` +
                Lampa.Lang.translate("donate_support").replace(
                  "{amount}",
                  "100",
                ) +
                `</span>
              </div>
            </div>

            <!-- 250₽ -->
            <div class="donate-qr-item">
              <div class="qr-code">
                <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADIAQMAAACXljzdAAAABlBMVEX///8AAABVwtN+AAAACXBIWXMAAA7EAAAOxAGVKw4bAAACCElEQVRYhc2YUY7DIAxELXEAjsBFUYPERTkCB0DxesbJbvejnzVBSpvk9cPCnrGpyMd1qOqSNA77xL3ONPF9hpFqUdTSR1IdFs+074l3rzhSdODusE9E1ey3Net8DOG1SstNsH8biHh0h/Ypuc9gwsytslix9pSXvOd0J2FdW1Whsioj7u8VH0BuHTev7cn4/in828TigK5LM32LkDHC9gQyBPGSLntOM01XWBQxRdP5LCqFshCdxcu6jiHueNXdhXvT8srLf7OZHJcfQ10djsz3iDqKJO2WO/aEgYx16wy4WhyxuqmlubugbrFT2k3b+4lQU2AdkavlLHers1cYMZcparFgB1vGnTnh3RdCSIKzFO+JcP70ltPdpKJvWmV7dSefanLnXBVD5O7ZozJvmO8ae+N+crkhVC/CyYqq94oPIdg3dgd3IKssyxs7UxQxHXtXsvpejA19oeXzAYSKv2YKqp5zTmPmoghmB1BzoKyexeyeGEO8I93a1umTg+T2DMLZCpMF1jVb5DOOyDVXDZ9v0J1Erpk8iPjcAv+DphI7Q+f8u5twedcu7JjzYN7iyHUugaIGagfuh9nqDCM8m8H9bLai42XOl/epbS/hidq1peiZvmY0ce+D71Dhys4UTFxVOBn52ewRBJkzir7p53q8X78n/u8Tr2v+98KMHZz2/k78O8nH9QMC64YNSyIL3gAAAABJRU5ErkJggg=="
                     alt="QR код 250₽">
              </div>
              <div class="donate-amount">250₽</div>
              <div class="simple-button selector donate-link" data-amount="250" style="margin-right: unset; font-size: unset; text-align: center">
                <span>` +
                Lampa.Lang.translate("donate_support").replace(
                  "{amount}",
                  "250",
                ) +
                `</span>
              </div>
            </div>

            <!-- 500₽ -->
            <div class="donate-qr-item">
              <div class="qr-code">
                <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADIAQMAAACXljzdAAAABlBMVEX///8AAABVwtN+AAAACXBIWXMAAA7EAAAOxAGVKw4bAAACBElEQVRYhc2YUY7DIAxELXEAjsBFo4DERTkCB0Dxesa02/3o5zqJ1CbNy4eLx/YQka9HVdUlaVT7xrXONHG+wshhURylj6Q6LJ5p54l7ZxwpOnBV7RtRNXv2yDofQ/hZpeUmWL8biHh0VfuU3GcwYeZWWVSs/cpLPnN6J6GuTVVQ1sGI+6fiA8irjptrezK+PxX+38TiQF2XZvUtQsYI2wMIjrTpst9ppukVFkVMy9Az1kxRWYjO4p1nGEFkzdaG3YVr0/LKi6tzN4Ge1u47HR2Z9/3/xBCoOA3opg5krNtkwKeFEayK1bWyu0C39qxxVP3thBXP7HVErpazjOfOMJI4sZPTrBaVdUJmLors2Ohd0PnTO3P3kz0vt6tJ7mpy374qgkjhXKKGkLcl3g/PBxDXdcPsRvVN0qxvxUcQ1Hz1qmdntrz5zAoj3vMW1omxYS60fD2AmKpKK/pb9fQ5zR1XCOH1oF4Kqh53XddhhJmjcq22dbpzkHdO7ySm6UJX5ZNBtrdA5qII55D5KjqHxekk4p48iJS2/b+i56LzKq7kAYRHQUeWwok5K/MWR3xfgr39Qe2g+8FbXWGEK+P+jvdapr987druJXScnbsAxcz0Y0YTTkT2HVY4942xZL934c7I92aPIOLvhCon5+HeN6+Pt0X/TVzXi7WtPhfZ/a4HkK/HD5YMjtz6GkdnAAAAAElFTkSuQmCC"
                     alt="QR код 500₽">
              </div>
              <div class="donate-amount">500₽</div>
              <div class="simple-button selector donate-link" data-amount="500" style="margin-right: unset; font-size: unset; text-align: center">
                <span>` +
                Lampa.Lang.translate("donate_support").replace(
                  "{amount}",
                  "500",
                ) +
                `</span>
              </div>
            </div>
          </div>
          <div class="donate-bottom-text">
            ` +
                Lampa.Lang.translate("donate_modal_description") +
                `
          </div>
        </div>`,
            );

            let donate_html = Lampa.Template.get("donate_modal", {});

            const paymentLinks = {
              100: "https://auth.robokassa.ru/merchant/Invoice/uJcZeMG59kWFwRlrYKNPfQ?FreeOutSum=100",
              250: "https://auth.robokassa.ru/merchant/Invoice/uJcZeMG59kWFwRlrYKNPfQ?FreeOutSum=250",
              500: "https://auth.robokassa.ru/merchant/Invoice/uJcZeMG59kWFwRlrYKNPfQ?FreeOutSum=500",
            };

            donate_html.find(".donate-link").on("hover:enter", function () {
              const amount = this.getAttribute("data-amount");
              const link = paymentLinks[amount];

              if (link) {
                window.open(link, "_blank");
              }
            });

            Lampa.Modal.open({
              title: Lampa.Lang.translate("donate_modal_title"),
              html: donate_html,
              size: "medium",
              onBack: function () {
                Lampa.Modal.close();
                Lampa.Controller.toggle("settings_component");
              },
            });

            Lampa.Loading.stop();
            Lampa.Controller.toggle("modal");
          },
        })
        .addToQueue({
          order: 1,
          param: {
            name: "app_settings_about",
            type: "button",
          },
          field: {
            name: Lampa.Lang.translate("app_settings_about_field_name"),
            description: Lampa.Lang.translate(
              "app_settings_about_field_description",
            ),
          },
          onChange: function () {
            Lampa.Loading.start(() => {}, Lampa.Lang.translate("loading"));
            const network = new Lampa.Reguest();
            network.silent(
              "https://api.github.com/repos/Kolovatoff/lampa-desktop/releases/latest",
              (data) => {
                window.electronAPI
                  .getAppVersion()
                  .then((current_version) => {
                    const latest_version = data.tag_name.replace("v", "");

                    Lampa.Template.add(
                      "about_modal",
                      `<div class="app-modal-about">
                        ` +
                        Lampa.Lang.translate("app_about_title") +
                        `
                        <ul>
                            <li>` +
                        Lampa.Lang.translate("app_about_version_app").replace(
                          "{current_version}",
                          current_version,
                        ) +
                        `</li>
                            <li>` +
                        Lampa.Lang.translate(
                          "app_about_version_latest",
                        ).replace("{latest_version}", latest_version) +
                        `</li>
                            <li>` +
                        Lampa.Lang.translate("app_about_version_lampa").replace(
                          "{lampa_version}",
                          Lampa.Platform.version("app"),
                        ) +
                        `</li>
                        </ul>
                        <div class="simple-button selector github">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                            </svg>
                            <span>` +
                        Lampa.Lang.translate("app_about_github") +
                        `</span>
                        </div>
                      </div>`,
                    );

                    let about_html = Lampa.Template.get("about_modal", {});
                    about_html.find(".github").on("hover:enter", function () {
                      window.open(
                        "https://github.com/Kolovatoff/lampa-desktop",
                        "_blank",
                      );
                    });

                    Lampa.Modal.open({
                      title: Lampa.Lang.translate(
                        "app_settings_about_field_name",
                      ),
                      html: about_html,
                      size: "small",
                      onBack: function () {
                        Lampa.Modal.close();
                        Lampa.Controller.toggle("settings_component");
                      },
                    });
                    Lampa.Loading.stop();
                    // И убеждаемся, что фокус на модальном окне
                    Lampa.Controller.toggle("modal");
                  })
                  .catch((error) => {
                    console.error(
                      "APP",
                      "Не удалось получить appVersion",
                      error,
                    );
                  });
              },
              () => {
                Lampa.Loading.stop();
              },
              null,
              {
                cache: { life: 10 },
              },
            );
          },
        })
        .addToQueue({
          order: 2,
          param: {
            name: "app_settings_separator_main",
            type: "title",
          },
          field: {
            name: Lampa.Lang.translate("app_settings_separator_main_name"),
          },
        })
        .addToQueue({
          order: 6,
          param: {
            name: "app_settings_separator_main",
            type: "title",
          },
          field: {
            name: "TorrServer",
          },
        })
        .addToQueue({
          order: 7,
          param: {
            name: "app_settings_ts",
            type: "button",
          },
          field: {
            name: Lampa.Lang.translate("app_settings_ts_field_name"),
            description: Lampa.Lang.translate(
              "app_settings_ts_field_description",
            ),
          },
          onChange: () => {
            Lampa.Settings.create("app_settings_ts", {
              onBack: () => Lampa.Settings.create("app_settings"),
            });
          },
        })
        .addToQueue({
          order: 8,
          param: {
            name: "app_settings_separator_other",
            type: "title",
          },
          field: {
            name: Lampa.Lang.translate("app_settings_separator_other_name"),
          },
        })
        .addToQueue({
          order: 9,
          param: {
            name: "app_settings_ie",
            type: "button",
          },
          field: {
            name: Lampa.Lang.translate("app_settings_ie_field_name"),
            description: Lampa.Lang.translate(
              "app_settings_ie_field_description",
            ),
          },
          onChange: () => {
            Lampa.Select.show({
              title: Lampa.Lang.translate("app_settings_ie_field_name"),
              items: [
                {
                  title: Lampa.Lang.translate(
                    "app_settings_ie_separator_cloud_title",
                  ),
                  separator: true,
                },
                {
                  title: Lampa.Lang.translate(
                    "app_settings_ie_btn_export_title",
                  ),
                  subtitle: Lampa.Lang.translate(
                    "app_settings_ie_btn_export_cloud_subtitle",
                  ),
                  action: "e-cloud",
                },
                {
                  title: Lampa.Lang.translate(
                    "app_settings_ie_btn_import_title",
                  ),
                  subtitle: Lampa.Lang.translate(
                    "app_settings_ie_btn_import_cloud_subtitle",
                  ),
                  action: "i-cloud",
                },
                {
                  title: Lampa.Lang.translate(
                    "app_settings_ie_separator_local_title",
                  ),
                  separator: true,
                },
                {
                  title: Lampa.Lang.translate(
                    "app_settings_ie_btn_export_title",
                  ),
                  subtitle: Lampa.Lang.translate(
                    "app_settings_ie_btn_export_subtitle",
                  ),
                  action: "e-file",
                },
                {
                  title: Lampa.Lang.translate(
                    "app_settings_ie_btn_import_title",
                  ),
                  subtitle: Lampa.Lang.translate(
                    "app_settings_ie_btn_import_subtitle",
                  ),
                  action: "i-file",
                },
              ],
              onSelect: async (a) => {
                try {
                  let result;
                  if (a.action === "e-cloud") {
                    Lampa.Noty.show(
                      Lampa.Lang.translate("app_settings_noty_waiting"),
                    );
                    result = await window.electronAPI.exportSettingsToCloud();
                    if (result && result.message) {
                      Lampa.Noty.show(result.message);
                    }
                  } else if (a.action === "i-cloud") {
                    // Функция для показа модального окна ввода 10-значного кода
                    async function showTenDigitModal() {
                      return new Promise((resolve) => {
                        let html = $(
                          `
                      <div class="account-modal-split">
                        <div class="account-modal-split__info">
                          <div class="account-modal-split__title">` +
                            Lampa.Lang.translate(
                              "app_settings_ie_modal_import_cloud",
                            ) +
                            `</div>
                          <div class="account-modal-split__text">` +
                            Lampa.Lang.translate(
                              "app_settings_ie_modal_enter_id",
                            ) +
                            `</div>
                          <div class="account-modal-split__code">
                            ${Array(10).fill('<div class="account-modal-split__code-num"><span>-</span></div>').join("")}
                          </div>
                          <div class="account-modal-split__keyboard">
                            <div class="simple-keyboard"></div>
                          </div>
                        </div>
                      </div>`,
                        );

                        let nums = html.find(".account-modal-split__code-num");
                        let keyboard;

                        if (Lampa.Platform.tv()) {
                          html.addClass(
                            "layer--" +
                              (Lampa.Platform.mouse() ? "wheight" : "height"),
                          );
                        } else {
                          html.addClass("account-modal-split--mobile");
                        }

                        function drawCode(value) {
                          nums.find("span").text("-");
                          value.split("").forEach((v, i) => {
                            if (nums[i]) nums.eq(i).find("span").text(v);
                          });
                        }

                        Lampa.Modal.open({
                          title: "",
                          html: html,
                          size: Lampa.Platform.tv() ? "full" : "medium",
                          scroll: { nopadding: true },
                          onBack: () => {
                            if (
                              keyboard &&
                              typeof keyboard.destroy === "function"
                            ) {
                              keyboard.destroy();
                              keyboard = null;
                            }
                            Lampa.Modal.close();
                            Lampa.Controller.toggle("settings_component");
                            resolve(null);
                          },
                        });

                        keyboard = new window.SimpleKeyboard.default({
                          display: {
                            "{BKSP}": "&nbsp;",
                            "{ENTER}": "&nbsp;",
                          },
                          layout: {
                            default: ["0 1 2 3 4 {BKSP}", "5 6 7 8 9 {ENTER}"],
                          },
                          onChange: async (value) => {
                            drawCode(value);
                            if (value.length === 10) {
                              if (
                                keyboard &&
                                typeof keyboard.destroy === "function"
                              ) {
                                keyboard.destroy();
                                keyboard = null;
                              }
                              Lampa.Modal.close();
                              // Открываем второй модал для PIN и получаем результат
                              const pinResult = await showPinModal(value);
                              resolve(pinResult);
                            }
                          },
                          onKeyPress: async (button) => {
                            if (button === "{BKSP}") {
                              keyboard.setInput(
                                keyboard.getInput().slice(0, -1),
                              );
                              drawCode(keyboard.getInput());
                            } else if (button === "{ENTER}") {
                              if (keyboard.getInput().length === 10) {
                                if (
                                  keyboard &&
                                  typeof keyboard.destroy === "function"
                                ) {
                                  keyboard.destroy();
                                  keyboard = null;
                                }
                                Lampa.Modal.close();
                                const pinResult = await showPinModal(
                                  keyboard.getInput(),
                                );
                                resolve(pinResult);
                              }
                            }
                          },
                        });

                        let keys = $(".simple-keyboard .hg-button").addClass(
                          "selector",
                        );
                        Lampa.Controller.collectionSet($(".simple-keyboard"));
                        Lampa.Controller.collectionFocus(
                          keys[0],
                          $(".simple-keyboard"),
                        );
                        $(".simple-keyboard .hg-button").on(
                          "hover:enter",
                          function (e) {
                            Lampa.Controller.collectionFocus($(this)[0]);
                            keyboard.handleButtonClicked(
                              $(this).attr("data-skbtn"),
                              e,
                            );
                          },
                        );
                      });
                    }

                    // Функция для показа модального окна ввода PIN-кода
                    async function showPinModal(code10) {
                      return new Promise((resolve) => {
                        Lampa.Input.edit(
                          {
                            free: true,
                            title: Lampa.Lang.translate(
                              "app_settings_ie_modal_enter_pin_title",
                            ),
                            nosave: true,
                            value: "",
                            layout: "nums",
                            keyboard: "lampa",
                            password: false,
                          },
                          async (pin4) => {
                            if (pin4 && pin4.length === 4) {
                              try {
                                const importResult =
                                  await window.electronAPI.importSettingsFromCloud(
                                    code10,
                                    pin4,
                                  );
                                resolve(importResult);
                              } catch (error) {
                                resolve({
                                  message:
                                    Lampa.Lang.translate(
                                      "app_settings_ie_import_error",
                                    ) +
                                    ": " +
                                    error.toString(),
                                });
                              }
                            } else {
                              resolve({
                                message: Lampa.Lang.translate(
                                  "app_settings_ie_invalid_pin",
                                ),
                              });
                            }
                            Lampa.Controller.toggle("menu");
                          },
                        );
                      });
                    }

                    // Запускаем процесс импорта из облака
                    result = await showTenDigitModal();
                    if (result && result.message) {
                      Lampa.Noty.show(result.message);
                    } else if (result === null) {
                      // Пользователь закрыл модальное окно
                    } else {
                      Lampa.Noty.show(
                        Lampa.Lang.translate("app_settings_ie_import_success"),
                      );
                    }
                  } else if (a.action === "e-file") {
                    result = await window.electronAPI.exportSettingsToFile();
                    if (result && result.message) {
                      Lampa.Noty.show(result.message);
                    }
                  } else if (a.action === "i-file") {
                    result = await window.electronAPI.importSettingsFromFile();
                    if (result && result.message) {
                      Lampa.Noty.show(result.message);
                    }
                  }
                } catch (error) {
                  Lampa.Noty.show(error.toString());
                }
              },
              onBack: () => {
                Lampa.Controller.toggle("settings_component");
              },
            });
          },
        });
      // libmpv is selected here as well — show on macOS too
      {
        settingsManager.addToQueue({
          component: "app_settings_player_find",
          order: 5.5,
          param: {
            name: "player_find",
            type: "button",
          },
          field: {
            name: Lampa.Lang.translate("app_settings_player_find"),
            description: Lampa.Lang.translate(
              "app_settings_player_find_description",
            ),
          },
          onChange: async () => {
            Lampa.Loading.start(
              () => {},
              Lampa.Lang.translate("app_settings_player_find"),
            );

            const result = await window.electronAPI.player.getAllWithDetails();
            Lampa.Loading.stop();

            if (!result.success || result.players.length === 0) {
              Lampa.Noty.show("Медиа плееры не найдены!", "error", 5000);
              return;
            }

            // Используем встроенный Lampa.Select вместо кастомного модального окна
            const items = [];
            for (let i = 0; i < result.players.length; i++) {
              const player = result.players[i];
              items.push({
                title: player.name,
                subtitle: player.path,
                value: player.id,
                selected: player.isDefault,
              });
            }

            Lampa.Select.show({
              title: "Выберите плеер по умолчанию",
              items: items,
              onSelect: async (item) => {
                Lampa.Loading.start(() => {}, `Выбор ${item.title}...`);

                const saveResult =
                  await window.electronAPI.player.setDefaultAndSave(item.value);

                Lampa.Loading.stop();

                if (saveResult.success) {
                  Lampa.Noty.show(
                    `Выбран плеер: ${item.title}`,
                    "success",
                    3000,
                  );
                  Lampa.Settings.update();
                } else {
                  Lampa.Noty.show("Ошибка при выборе плеера", "error", 3000);
                }

                Lampa.Controller.toggle("settings_component");
              },
              onBack: () => {
                Lampa.Controller.toggle("settings_component");
              },
            });
          },
        });
      }
      settingsManager.apply();
    });

    const settingsTsManager = new SettingsManager("app_settings_ts");

    Promise.all([
      settingsTsManager.loadAsyncSetting("tsAutoStart", {
        order: 6,
        param: {
          name: "app_settings_ts_tsAutostart",
          type: "trigger",
        },
        field: {
          name: Lampa.Lang.translate("app_settings_ts_autostart_field_name"),
        },
        onChange: async function (value) {
          // Lampa.Settings.update();
          await window.electronAPI.store.set("tsAutoStart", value === "true");
        },
      }),
      settingsTsManager.loadAsyncSetting("tsPort", {
        order: 8,
        param: {
          name: "app_settings_ts_tsPort",
          type: "input",
          values: "",
        },
        field: {
          name: Lampa.Lang.translate("app_settings_ts_port_name"),
          description: Lampa.Lang.translate("app_settings_ts_port_description"),
        },
        onChange: async function (value) {
          // Lampa.Settings.update();
          Lampa.Noty.show(Lampa.Lang.translate("app_settings_ts_port_ok"));
          setTimeout(
            async () => await window.electronAPI.store.set("tsPort", value),
            1000,
          );
        },
      }),
      settingsTsManager.loadAsyncSetting("tsUseGst", {
        order: 7,
        param: {
          name: "app_settings_ts_tsUseGst",
          type: "trigger",
        },
        field: {
          name: Lampa.Lang.translate("app_settings_ts_gst_field_name"),
          description: Lampa.Lang.translate(
            "app_settings_ts_gst_field_description",
          ),
        },
        onChange: async function (value) {
          const useGst = value === "true";
          await window.electronAPI.store.set("tsUseGst", useGst);

          // Проверяем, установлен ли TorrServer
          const status = await window.electronAPI.torrServer.getStatus();
          if (status.installed) {
            Lampa.Noty.show(
              Lampa.Lang.translate("app_settings_ts_gst_changed_notify"),
              "warning",
              5000,
            );
          }

          setTimeout(updateTsStatus, 500);
        },
      }),
    ]).then(() => {
      settingsTsManager
        .addToQueue({
          order: 1,
          param: {
            name: "app_settings_ts_separator_main",
            type: "title",
          },
          field: {
            name: Lampa.Lang.translate("app_settings_ts_separator_main_title"),
          },
        })
        .addToQueue({
          component: "app_settings_ts",
          order: 2,
          param: {
            name: "ts_start",
            type: "button",
          },
          field: {
            name: Lampa.Lang.translate("app_settings_ts_start_name"),
          },
          onChange: async () => {
            const status = await window.electronAPI.torrServer.getStatus();
            if (status.installed) {
              Lampa.Loading.start(
                () => {},
                Lampa.Lang.translate("app_settings_ts_start_loading"),
              );
            } else {
              Lampa.Loading.start(
                () => {},
                Lampa.Lang.translate("app_settings_ts_download_loading"),
              );
            }

            const tsPort = await window.electronAPI.store.get("tsPort");
            const result = await window.electronAPI.torrServer.start([
              "--port",
              tsPort,
            ]);
            Lampa.Storage.set("torrserver_url", `http://localhost:${tsPort}`);
            Lampa.Storage.set("torrserver_use_link", "one");

            setTimeout(updateTsStatus, 1000);

            Lampa.Loading.stop();
            Lampa.Noty.show(
              result.success
                ? result.message
                : `${Lampa.Lang.translate("app_error")}: ${result.message}`,
            );
          },
        })
        .addToQueue({
          component: "app_settings_ts",
          order: 3,
          param: {
            name: "ts_stop",
            type: "button",
          },
          field: {
            name: Lampa.Lang.translate("app_settings_ts_stop_name"),
          },
          onChange: async () => {
            Lampa.Loading.start(
              () => {},
              Lampa.Lang.translate("app_settings_ts_stop_loading"),
            );
            const result = await window.electronAPI.torrServer.stop();
            Lampa.Loading.stop();
            setTimeout(updateTsStatus, 500);
            Lampa.Noty.show(
              result.success
                ? result.message
                : `${Lampa.Lang.translate("app_error")}: ${result.message}`,
            );
          },
        })
        .addToQueue({
          component: "app_settings_ts",
          order: 4,
          param: {
            name: "ts_restart",
            type: "button",
          },
          field: {
            name: Lampa.Lang.translate("app_settings_ts_restart_name"),
          },
          onChange: async () => {
            Lampa.Loading.start(
              () => {},
              Lampa.Lang.translate("app_settings_ts_restart_loading"),
            );

            const tsPort = await window.electronAPI.store.get("tsPort");
            const result = await window.electronAPI.torrServer.restart([
              "--port",
              tsPort,
            ]);
            Lampa.Storage.set("torrserver_url", `http://localhost:${tsPort}`);
            Lampa.Storage.set("torrserver_use_link", "one");

            setTimeout(updateTsStatus, 1000);
            Lampa.Loading.stop();
            Lampa.Noty.show(
              result.success
                ? result.message
                : `${Lampa.Lang.translate("app_error")}: ${result.message}`,
            );
          },
        })
        .addToQueue({
          component: "app_settings_ts",
          order: 4.5,
          param: {
            name: "ts_reinstall",
            type: "button",
          },
          field: {
            name: Lampa.Lang.translate("app_settings_ts_reinstall_name"),
          },
          onChange: async () => {
            Lampa.Loading.start(
              () => {},
              Lampa.Lang.translate("app_settings_ts_reinstall_loading"),
            );

            const tsPort = await window.electronAPI.store.get("tsPort");
            const result = await window.electronAPI.torrServer.reinstall([
              "--port",
              tsPort,
            ]);

            Lampa.Storage.set("torrserver_url", `http://localhost:${tsPort}`);
            Lampa.Storage.set("torrserver_use_link", "one");

            setTimeout(updateTsStatus, 1000);
            Lampa.Loading.stop();
            Lampa.Noty.show(
              result.success
                ? result.message
                : `${Lampa.Lang.translate("app_error")}: ${result.message}`,
            );
          },
        })
        .addToQueue({
          component: "app_settings_ts",
          order: 4.6,
          param: {
            name: "ts_check_update",
            type: "button",
          },
          field: {
            name: Lampa.Lang.translate("app_settings_ts_check_update_name"),
          },
          onChange: async () => {
            Lampa.Loading.start(
              () => {},
              Lampa.Lang.translate("app_settings_ts_check_update_loading"),
            );
            const result = await window.electronAPI.torrServer.checkUpdate();
            // Создаем модальное окно если есть обновление
            if (result.hasUpdate) {
              Lampa.Template.add(
                "ts_update_modal",
                `<div class="app-modal-ts-update">
                    ${Lampa.Lang.translate("app_settings_ts_update_found_message")}
                    <ul>
                        <li>${Lampa.Lang.translate("app_settings_ts_update_installed").replace("{current_version}", result.current)}</li>
                        <li>${Lampa.Lang.translate("app_settings_ts_update_latest").replace("{latest_version}", result.latest)}</li>
                    </ul>
                    <div class="simple-button selector ts_update">${Lampa.Lang.translate("app_settings_ts_update_button")}</div>
                  </div>`,
              );

              let ts_update_modal_html = Lampa.Template.get(
                "ts_update_modal",
                {},
              );
              ts_update_modal_html
                .find(".ts_update")
                .on("hover:enter", async function () {
                  Lampa.Loading.start(
                    () => {},
                    Lampa.Lang.translate("app_settings_ts_update_loading"),
                  );
                  const result = await window.electronAPI.torrServer.update();
                  Lampa.Loading.stop();
                  Lampa.Modal.close();
                  Lampa.Controller.toggle("settings_component");
                  setTimeout(updateTsStatus, 1000);
                  Lampa.Noty.show(
                    result.success
                      ? Lampa.Lang.translate("app_settings_ts_update_success")
                      : `${Lampa.Lang.translate("app_error")}: ${result.message}`,
                  );
                });

              Lampa.Modal.open({
                title: Lampa.Lang.translate(
                  "app_settings_ts_update_found_title",
                ),
                html: ts_update_modal_html,
                size: "small",
                onBack: function () {
                  Lampa.Modal.close();
                  Lampa.Controller.toggle("settings_component");
                },
              });
              Lampa.Loading.stop();
              // И убеждаемся, что фокус на модальном окне
              Lampa.Controller.toggle("modal");
            } else {
              Lampa.Noty.show(
                Lampa.Lang.translate("app_settings_ts_update_no_updates"),
              );
              Lampa.Loading.stop();
            }
          },
        })
        .addToQueue({
          component: "app_settings_ts",
          order: 4.7,
          param: {
            name: "ts_open_path",
            type: "button",
          },
          field: {
            name: Lampa.Lang.translate("app_settings_ts_open_path_name"),
          },
          onChange: async () => {
            const status = await window.electronAPI.torrServer.getStatus();

            if (status.installed) {
              await window.electronAPI.folder.open(status.executableDir);
            } else {
              Lampa.Noty.show(
                Lampa.Lang.translate("app_settings_ts_install_prompt"),
              );
            }
          },
        })
        .addToQueue({
          component: "app_settings_ts",
          order: 4.8,
          param: {
            name: "ts_open_web",
            type: "button",
          },
          field: {
            name: Lampa.Lang.translate("app_settings_ts_open_web_name"),
          },
          onChange: async () => {
            const status = await window.electronAPI.torrServer.getStatus();
            if (status.installed) {
              window.open(`http://${status.host}:${status.port}`, "_blank");
            } else {
              Lampa.Noty.show(
                Lampa.Lang.translate("app_settings_ts_install_prompt"),
              );
            }
          },
        })
        .addToQueue({
          order: 5,
          param: {
            name: "app_settings_ts_separator_settings",
            type: "title",
          },
          field: {
            name: Lampa.Lang.translate(
              "app_settings_ts_separator_settings_title",
            ),
          },
        })
        .addToQueue({
          order: 9,
          param: {
            name: "app_settings_ts_separator_danger",
            type: "title",
          },
          field: {
            name: Lampa.Lang.translate(
              "app_settings_ts_separator_danger_title",
            ),
          },
        })
        .addToQueue({
          component: "app_settings_ts",
          order: 10,
          param: {
            name: "ts_uninstall",
            type: "button",
          },
          field: {
            name: Lampa.Lang.translate("app_settings_ts_uninstall_name"),
          },
          onChange: async () => {
            Lampa.Noty.show(
              Lampa.Lang.translate("app_settings_ts_uninstall_loading"),
            );
            const result = await window.electronAPI.torrServer.uninstall();
            setTimeout(updateTsStatus, 500);
            Lampa.Noty.show(
              result.success
                ? result.message
                : `${Lampa.Lang.translate("app_error")}: ${result.message}`,
            );
          },
        })
        .addToQueue({
          component: "app_settings_ts",
          order: 11,
          param: {
            name: "ts_uninstall_keep_data",
            type: "button",
          },
          field: {
            name: Lampa.Lang.translate(
              "app_settings_ts_uninstall_keep_data_name",
            ),
          },
          onChange: async () => {
            Lampa.Noty.show(
              Lampa.Lang.translate(
                "app_settings_ts_uninstall_keep_data_loading",
              ),
            );
            const result = await window.electronAPI.torrServer.uninstall(true);
            setTimeout(updateTsStatus, 500);
            Lampa.Noty.show(
              result.success
                ? result.message
                : `${Lampa.Lang.translate("app_error")}: ${result.message}`,
            );
          },
        })
        .apply();
    });

    function updateTsStatus() {
      window.electronAPI.torrServer
        .getStatus()
        .then(async (status) => {
          console.log("🔄 Обновление статуса TorrServer:", status);

          // Обновляем версию с информацией о GST
          const versionElement = $(
            '[data-name="app_settings_ts_tsVersion"]',
          ).find(".settings-param__descr");

          if (status.version !== null) {
            const useGst = status.useGst || false;
            let versionText = status.version;
            if (status.running) {
              // Если сервер запущен, пытаемся получить информацию с сервера
              try {
                const serverInfo =
                  await window.electronAPI.torrServer.getServerInfo(
                    status.port,
                  );
                if (serverInfo.gstSupported) {
                  versionText = Lampa.Lang.translate(
                    "app_settings_ts_version_with_gst",
                  ).replace("{version}", status.version);
                } else if (serverInfo.gstSupported === false) {
                  versionText = Lampa.Lang.translate(
                    "app_settings_ts_version_without_gst",
                  ).replace("{version}", status.version);
                } else {
                  versionText = status.version;
                }
                // eslint-disable-next-line no-unused-vars
              } catch (e) {
                versionText = status.version;
              }
            } else {
              // Если сервер остановлен, показываем версию с настройкой GST
              versionText = useGst
                ? Lampa.Lang.translate(
                    "app_settings_ts_version_with_gst",
                  ).replace("{version}", status.version)
                : Lampa.Lang.translate(
                    "app_settings_ts_version_without_gst",
                  ).replace("{version}", status.version);
            }
            versionElement.text(versionText);
          } else {
            versionElement.text(
              Lampa.Lang.translate("app_settings_ts_status_install_prompt"),
            );
          }

          // Обновляем статус
          $('[data-name="app_settings_ts_tsStatus"]')
            .find(".settings-param__descr")
            .text(
              status.installed
                ? status.running
                  ? Lampa.Lang.translate(
                      "app_settings_ts_status_installed_running",
                    )
                  : Lampa.Lang.translate(
                      "app_settings_ts_status_installed_stopped",
                    )
                : Lampa.Lang.translate("app_settings_ts_status_not_installed"),
            );

          // Обновляем статус GStreamer
          const gstStatusElement = $(
            '[data-name="app_settings_ts_tsGstStatus"]',
          );
          const gstVersionElement = $(
            '[data-name="app_settings_ts_tsGstVersion"]',
          );

          if (gstStatusElement.length) {
            if (status.running) {
              try {
                const serverInfo =
                  await window.electronAPI.torrServer.getServerInfo(
                    status.port,
                  );
                const gstText = serverInfo.gstSupported
                  ? Lampa.Lang.translate("app_settings_ts_gst_enabled")
                  : Lampa.Lang.translate("app_settings_ts_gst_disabled");
                gstStatusElement.find(".settings-param__descr").text(gstText);

                if (gstVersionElement.length) {
                  gstVersionElement
                    .find(".settings-param__descr")
                    .text(serverInfo.gstreamerVersion || "—");
                }
              } catch (error) {
                console.error("Ошибка получения информации о GST:", error);
                gstStatusElement
                  .find(".settings-param__descr")
                  .text(Lampa.Lang.translate("app_settings_ts_gst_unknown"));
                if (gstVersionElement.length) {
                  gstVersionElement.find(".settings-param__descr").text("—");
                }
              }
            } else {
              // Сервер не запущен
              gstStatusElement
                .find(".settings-param__descr")
                .text(Lampa.Lang.translate("app_settings_ts_gst_unknown"));
              if (gstVersionElement.length) {
                gstVersionElement.find(".settings-param__descr").text("—");
              }
            }
          }
        })
        .catch((error) => {
          console.error("Ошибка обновления статуса:", error);
        });
    }

    // Подписываемся на открытие настроек TorrServer для обновления статуса
    Lampa.Settings.listener.follow("open", function (e) {
      if (e.name === "app_settings_ts") {
        // Обновляем статус сразу при открытии
        setTimeout(updateTsStatus, 100);
      }
    });

    // Также обновляем статус при переключении на вкладку настроек
    Lampa.Settings.listener.follow("component", function (e) {
      if (e.component === "app_settings_ts") {
        setTimeout(updateTsStatus, 100);
      }
    });
  }

  /**
   * Класс для управления курсором и горячими клавишами
   */
  class InputManager {
    constructor(options = {}) {
      this.cursorVisible = true;
      this.mouseMoveTimer = null;
      this.debug = options.debug || false;

      this.keyHandlers = new Map();

      this.modifiers = {
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      };

      this.cursorSettings = {
        hideOnKeyPress: options.hideOnKeyPress ?? true,
        showOnMouseMove: options.showOnMouseMove ?? true,
        hideCursorStyle: options.hideCursorStyle || "none",
        showCursorStyle: options.showCursorStyle || "default",
        mouseInactivityTimeout: options.mouseInactivityTimeout || 0,
      };

      this.ignoredSelectors = [
        "input",
        "textarea",
        '[contenteditable="true"]',
        "select",
        // "button",
        // "a",
      ];

      this.init();
    }

    init() {
      if (this.cursorSettings.hideOnKeyPress) {
        document.addEventListener("keydown", this.handleKeyDown.bind(this));
      }

      if (this.cursorSettings.showOnMouseMove) {
        document.addEventListener("mousemove", this.handleMouseMove.bind(this));
        document.addEventListener(
          "mousedown",
          this.handleMouseAction.bind(this),
        );
        document.addEventListener("mouseup", this.handleMouseAction.bind(this));
        document.addEventListener("wheel", this.handleMouseAction.bind(this));
      }

      document.addEventListener("keyup", this.handleKeyUp.bind(this));
      window.addEventListener("blur", this.handleWindowBlur.bind(this));

      this.log("InputManager инициализирован");
    }

    hideCursor() {
      if (!this.cursorSettings.hideOnKeyPress) return;

      if (this.cursorVisible) {
        document.body.style.cursor = this.cursorSettings.hideCursorStyle;
        this.cursorVisible = false;

        const style = document.createElement("style");
        style.id = "input-manager-cursor-style";
        style.textContent = `* { cursor: ${this.cursorSettings.hideCursorStyle} !important; }`;

        const oldStyle = document.getElementById("input-manager-cursor-style");
        if (oldStyle) oldStyle.remove();

        document.head.appendChild(style);
        this.log("Курсор скрыт");
      }
    }

    showCursor() {
      if (this.cursorVisible) return;

      document.body.style.cursor = this.cursorSettings.showCursorStyle;
      this.cursorVisible = true;

      const style = document.getElementById("input-manager-cursor-style");
      if (style) style.remove();

      this.log("Курсор показан");
    }

    toggleCursor() {
      if (this.cursorVisible) {
        this.hideCursor();
      } else {
        this.showCursor();
      }
    }

    updateCursorSettings(settings) {
      Object.assign(this.cursorSettings, settings);
      this.log("Настройки курсора обновлены");
    }

    /**
     * Проверяет, находится ли фокус в игнорируемом элементе
     */
    isIgnoredElement(element = document.activeElement) {
      if (!element) return false;

      for (const selector of this.ignoredSelectors) {
        if (element.matches && element.matches(selector)) {
          return true;
        }
      }

      // Проверяем, является ли элемент формой или частью формы
      return element.form !== undefined;
    }

    /**
     * Добавить селектор для игнорирования
     */
    addIgnoredSelector(selector) {
      if (!this.ignoredSelectors.includes(selector)) {
        this.ignoredSelectors.push(selector);
        this.log(`Добавлен игнорируемый селектор: ${selector}`);
      }
      return this;
    }

    /**
     * Удалить селектор из игнорируемых
     */
    removeIgnoredSelector(selector) {
      const index = this.ignoredSelectors.indexOf(selector);
      if (index !== -1) {
        this.ignoredSelectors.splice(index, 1);
        this.log(`Удален игнорируемый селектор: ${selector}`);
      }
      return this;
    }

    /**
     * Установить список игнорируемых селекторов
     */
    setIgnoredSelectors(selectors) {
      this.ignoredSelectors = [...selectors];
      this.log("Список игнорируемых селекторов обновлен");
      return this;
    }

    /**
     * Подписаться на нажатие клавиши
     * @param {string|string[]} key - клавиша или массив клавиш
     * @param {Function} handler - обработчик
     * @param {Object} options - опции
     * @param {boolean} options.ignoreIfInput - игнорировать если фокус в поле ввода (по умолчанию true)
     * @param {boolean} options.ignoreIfModal - игнорировать если открыто модальное окно
     * @param {Function} options.condition - дополнительное условие для выполнения
     */
    on(key, handler, options = {}) {
      if (Array.isArray(key)) {
        key.forEach((k) => this.on(k, handler, options));
        return this;
      }

      const keyId = key.toLowerCase();

      if (!this.keyHandlers.has(keyId)) {
        this.keyHandlers.set(keyId, []);
      }

      this.keyHandlers.get(keyId).push({
        handler,
        requireCtrl: options.ctrl || false,
        requireAlt: options.alt || false,
        requireShift: options.shift || false,
        requireMeta: options.meta || false,
        preventDefault: options.preventDefault || false,
        description: options.description || "",
        once: options.once || false,
        ignoreIfInput: options.ignoreIfInput !== false,
        ignoreIfModal: options.ignoreIfModal || false,
        condition: options.condition || null,
        ignoreSelectors: options.ignoreSelectors || [], // дополнительные селекторы для этого обработчика
      });

      this.log(`Добавлен обработчик для клавиши: ${keyId}`, options);
      return this;
    }

    /**
     * Подписаться на одноразовое нажатие
     */
    once(key, handler, options = {}) {
      return this.on(key, handler, { ...options, once: true });
    }

    /**
     * Отписаться от клавиши
     */
    off(key, handler) {
      const keyId = key.toLowerCase();

      if (this.keyHandlers.has(keyId)) {
        if (handler) {
          const handlers = this.keyHandlers.get(keyId);
          const index = handlers.findIndex((h) => h.handler === handler);
          if (index !== -1) {
            handlers.splice(index, 1);
            this.log(`Удален обработчик для клавиши: ${keyId}`);
          }
        } else {
          this.keyHandlers.delete(keyId);
          this.log(`Удалены все обработчики для клавиши: ${keyId}`);
        }
      }
      return this;
    }

    /**
     * Очистить все обработчики
     */
    clearAllHandlers() {
      this.keyHandlers.clear();
      this.log("Все обработчики удалены");
    }

    /**
     * Получить список всех зарегистрированных горячих клавиш
     */
    getRegisteredKeys() {
      const keys = [];
      for (const [keyId, handlers] of this.keyHandlers) {
        handlers.forEach((h) => {
          keys.push({
            key: keyId,
            modifiers: {
              ctrl: h.requireCtrl,
              alt: h.requireAlt,
              shift: h.requireShift,
              meta: h.requireMeta,
            },
            description: h.description,
            ignoreIfInput: h.ignoreIfInput,
            ignoreIfModal: h.ignoreIfModal,
          });
        });
      }
      return keys;
    }

    /**
     * Показать справку по горячим клавишам
     */
    showHelp() {
      // TODO(Kolovatoff): добавить открытие modal
      console.log("=== Зарегистрированные горячие клавиши ===");
      const keys = this.getRegisteredKeys();
      if (keys.length === 0) {
        console.log("Нет зарегистрированных клавиш");
      } else {
        keys.forEach((k) => {
          const modifiers = [];
          if (k.modifiers.ctrl) modifiers.push("Ctrl");
          if (k.modifiers.alt) modifiers.push("Alt");
          if (k.modifiers.shift) modifiers.push("Shift");
          if (k.modifiers.meta) modifiers.push("Meta");

          const modifierStr =
            modifiers.length > 0 ? modifiers.join("+") + "+" : "";
          const flags = [];
          if (k.ignoreIfInput) flags.push("🚫 input");
          console.log(
            `  ${modifierStr}${k.key.toUpperCase()} - ${k.description || "нет описания"} ${flags.length ? `(${flags.join(", ")})` : ""}`,
          );
        });
      }
    }

    /**
     * Проверяет, можно ли выполнить обработчик
     */
    canExecuteHandler(item, event) {
      // Проверка на фокус в поле ввода
      if (item.ignoreIfInput) {
        const activeElement = document.activeElement;
        if (this.isIgnoredElement(activeElement)) {
          this.log(`Игнорируем: фокус в поле ввода (${activeElement.tagName})`);

          // Дополнительно проверяем игнорируемые селекторы для этого обработчика
          if (item.ignoreSelectors && item.ignoreSelectors.length > 0) {
            for (const selector of item.ignoreSelectors) {
              if (activeElement.matches && activeElement.matches(selector)) {
                return false;
              }
            }
          }

          return false;
        }
      }

      if (item.ignoreIfModal) {
        const modal = document.querySelector(
          '.modal[style*="display: block"], .modal.show, [role="dialog"][aria-hidden="false"]',
        );
        if (modal) {
          this.log("Игнорируем: открыто модальное окно");
          return false;
        }
      }

      if (item.condition && typeof item.condition === "function") {
        if (!item.condition(event)) {
          this.log("Игнорируем: не выполнено пользовательское условие");
          return false;
        }
      }

      return true;
    }

    handleKeyDown(event) {
      const code = event.code.toLowerCase();
      const key = event.key.toLowerCase();

      const ctrl = event.ctrlKey;
      const alt = event.altKey;
      const shift = event.shiftKey;
      const meta = event.metaKey;

      this.modifiers = { ctrl, alt, shift, meta };

      this.hideCursor();

      if (this.cursorSettings.mouseInactivityTimeout > 0) {
        clearTimeout(this.mouseMoveTimer);
      }

      let handlerExecuted = false;

      // Проверяем обработчики по CODE
      if (this.keyHandlers.has(code)) {
        handlerExecuted =
          this.executeHandlers(code, event, ctrl, alt, shift, meta) ||
          handlerExecuted;
      }

      // Проверяем обработчики по KEY
      if (this.keyHandlers.has(key) && code !== key) {
        handlerExecuted =
          this.executeHandlers(key, event, ctrl, alt, shift, meta) ||
          handlerExecuted;
      }

      this.log(
        `Нажата: code=${code}, key=${key}, выполнен=${handlerExecuted}, activeElement=${document.activeElement?.tagName}`,
      );
    }

    /**
     * Выполнить обработчики для указанного идентификатора клавиши
     */
    executeHandlers(keyId, event, ctrl, alt, shift, meta) {
      if (!this.keyHandlers.has(keyId)) return false;

      const handlers = this.keyHandlers.get(keyId);
      let executed = false;

      for (let i = 0; i < handlers.length; i++) {
        const item = handlers[i];

        if (
          item.requireCtrl === ctrl &&
          item.requireAlt === alt &&
          item.requireShift === shift &&
          item.requireMeta === meta
        ) {
          if (!this.canExecuteHandler(item, event)) {
            continue;
          }

          this.log(`Выполняется действие для: ${keyId}`, {
            modifiers: this.modifiers,
            ignoreIfInput: item.ignoreIfInput,
          });

          if (item.preventDefault) {
            event.preventDefault();
          }

          // Вызываем обработчик с расширенной информацией
          item.handler(event, {
            ...this.modifiers,
            code: event.code.toLowerCase(),
            key: event.key.toLowerCase(),
            activeElement: document.activeElement,
            isInInput: this.isIgnoredElement(document.activeElement),
          });

          executed = true;

          // Если одноразовый - удаляем
          if (item.once) {
            handlers.splice(i, 1);
            i--;
          }
        }
      }

      return executed;
    }

    handleKeyUp(event) {
      this.modifiers = {
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        meta: event.metaKey,
      };
    }

    handleMouseMove() {
      this.showCursor();

      if (this.cursorSettings.mouseInactivityTimeout > 0) {
        clearTimeout(this.mouseMoveTimer);
        this.mouseMoveTimer = setTimeout(() => {
          this.hideCursor();
        }, this.cursorSettings.mouseInactivityTimeout);
      }
    }

    handleMouseAction() {
      this.showCursor();
    }

    handleWindowBlur() {
      this.showCursor();
      this.modifiers = { ctrl: false, alt: false, shift: false, meta: false };
    }

    log(message, data = null) {
      if (this.debug) {
        if (data) {
          console.log(`[InputManager] ${message}`, data);
        } else {
          console.log(`[InputManager] ${message}`);
        }
      }
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
      document.removeEventListener("keydown", this.handleKeyDown);
      document.removeEventListener("keyup", this.handleKeyUp);
      document.removeEventListener("mousemove", this.handleMouseMove);
      document.removeEventListener("mousedown", this.handleMouseAction);
      document.removeEventListener("mouseup", this.handleMouseAction);
      document.removeEventListener("wheel", this.handleMouseAction);
      window.removeEventListener("blur", this.handleWindowBlur);

      clearTimeout(this.mouseMoveTimer);
      this.showCursor();
      this.keyHandlers.clear();

      this.log("InputManager уничтожен");
    }
  }

  /**
   * Translates the browser Gamepad API's standard layout to the keyboard
   * controls already understood by Lampa. Chromium normalizes Xbox,
   * PlayStation, Switch Pro and most generic controllers to this layout.
   */
  class GamepadManager {
    constructor() {
      this.animationFrame = null;
      this.buttonStates = new Map();
      this.deadzone = 0.55;
      this.repeatDelay = 420;
      this.repeatInterval = 110;

      this.buttonMap = {
        0: { key: "Enter", code: "Enter", keyCode: 13 }, // A / Cross
        1: {
          key: "Backspace",
          code: "Backspace",
          keyCode: 8,
          fallback: "back",
        }, // B / Circle
        2: { action: "virtual-backspace" }, // X / Square
        3: { key: "s", code: "KeyS", keyCode: 83 }, // Y / Triangle
        4: { key: "PageUp", code: "PageUp", keyCode: 33 }, // LB / L1
        5: { key: "PageDown", code: "PageDown", keyCode: 34 }, // RB / R1
        8: {
          key: "Escape",
          code: "Escape",
          keyCode: 27,
          fallback: "back",
        }, // View / Share
        9: { key: "m", code: "KeyM", keyCode: 77 }, // Menu / Options
        12: { key: "ArrowUp", code: "ArrowUp", keyCode: 38, repeat: true },
        13: { key: "ArrowDown", code: "ArrowDown", keyCode: 40, repeat: true },
        14: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37, repeat: true },
        15: {
          key: "ArrowRight",
          code: "ArrowRight",
          keyCode: 39,
          repeat: true,
        },
      };

      this.axisMap = [
        {
          axis: 0,
          direction: -1,
          key: "ArrowLeft",
          code: "ArrowLeft",
          keyCode: 37,
        },
        {
          axis: 0,
          direction: 1,
          key: "ArrowRight",
          code: "ArrowRight",
          keyCode: 39,
        },
        {
          axis: 1,
          direction: -1,
          key: "ArrowUp",
          code: "ArrowUp",
          keyCode: 38,
        },
        {
          axis: 1,
          direction: 1,
          key: "ArrowDown",
          code: "ArrowDown",
          keyCode: 40,
        },
      ];

      this.poll = this.poll.bind(this);
      this.handleDisconnect = this.handleDisconnect.bind(this);
      this.handlePhysicalKeyboard = this.handlePhysicalKeyboard.bind(this);
      this.handlePointerInput = this.handlePointerInput.bind(this);
      window.addEventListener("gamepaddisconnected", this.handleDisconnect);
      window.addEventListener("keydown", this.handlePhysicalKeyboard, true);
      window.addEventListener("pointerdown", this.handlePointerInput, true);
      this.animationFrame = requestAnimationFrame(this.poll);
    }

    selectKeyboardFor(device) {
      // Lampa chooses between two different keyboard implementations while
      // creating an input form. Changing keyboard_type after that also
      // changes global layout classes and breaks plugin input screens.
      if (this.isInputFormOpen()) return;

      const setting =
        device === "gamepad"
          ? "desktop_keyboard_gamepad"
          : "desktop_keyboard_regular";
      const fallback = device === "gamepad" ? "lampa" : "integrate";
      const type = normalizeKeyboardType(
        Lampa.Storage.get(setting, fallback),
        fallback,
      );
      Lampa.Storage.set("keyboard_type", type);
    }

    isInputFormOpen() {
      return Boolean(
        document.querySelector(".simple-keyboard") ||
        document.body.classList.contains("keyboard-input--visible"),
      );
    }

    handlePhysicalKeyboard(event) {
      if (!event.isTrusted) return;

      if (event.key === "Escape" && this.isInputFormOpen()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        Lampa.Controller.back();
        return;
      }

      this.selectKeyboardFor("regular");
    }

    handlePointerInput(event) {
      if (event.isTrusted) this.selectKeyboardFor("regular");
    }

    isTextInputFocused() {
      const element = document.activeElement;
      return (
        !!element &&
        (element.matches("input, textarea, select") ||
          element.isContentEditable)
      );
    }

    resolveButtonBinding(index, binding) {
      if (index === "1" && this.isInputFormOpen()) {
        return { action: "close-input-form" };
      }

      // Backspace edits text instead of navigating back while an input has
      // focus. Escape is the conventional way to close these Lampa screens.
      if (index === "1" && this.isTextInputFocused()) {
        return {
          key: "Escape",
          code: "Escape",
          keyCode: 27,
          fallback: binding.fallback,
        };
      }

      return binding;
    }

    dispatch(type, binding) {
      if (binding.action === "close-input-form") {
        if (type === "keydown") Lampa.Controller.back();
        return;
      }

      if (binding.action === "virtual-backspace") {
        if (type !== "keydown") return;
        const button = document.querySelector(".hg-button-BKSP");
        if (button) {
          const keyboard = button.closest(".simple-keyboard");
          const previous = keyboard?.querySelector(".selector.focus");
          button.dispatchEvent(
            new CustomEvent("hover:enter", {
              bubbles: true,
              detail: { target: button },
            }),
          );
          if (previous && previous !== button) {
            setTimeout(function () {
              Lampa.Controller.collectionFocus(previous, keyboard);
            }, 0);
          }
        }
        return;
      }

      if (type === "keydown") this.selectKeyboardFor("gamepad");

      const event = new KeyboardEvent(type, {
        key: binding.key,
        code: binding.code,
        bubbles: true,
        cancelable: true,
      });

      // Some Lampa versions still inspect the legacy numeric fields.
      Object.defineProperties(event, {
        keyCode: { get: () => binding.keyCode },
        which: { get: () => binding.keyCode },
      });
      // Native keyboard events originate on the focused element. Dispatching
      // there is important because Lampa's input component handles keyup on
      // the input itself to blur it and move to the surrounding controls.
      const target = document.activeElement || document;
      target.dispatchEvent(event);

      // Some plugin input screens temporarily disable Lampa.Keypad. Its
      // normal back handler prevents the event's default action, so only use
      // the controller fallback when the synthetic key was left unhandled.
      if (
        type === "keydown" &&
        binding.fallback === "back" &&
        !event.defaultPrevented &&
        window.Lampa?.Controller?.back
      ) {
        window.Lampa.Controller.back();
      }
    }

    updateControl(id, pressed, binding, now, canRepeat) {
      const state = this.buttonStates.get(id);

      if (pressed && !state) {
        this.buttonStates.set(id, {
          nextRepeat: now + this.repeatDelay,
          binding,
        });
        this.dispatch("keydown", binding);
      } else if (pressed && state && canRepeat && now >= state.nextRepeat) {
        state.nextRepeat = now + this.repeatInterval;
        this.dispatch("keydown", binding);
      } else if (!pressed && state) {
        this.dispatch("keyup", state.binding);
        this.buttonStates.delete(id);
      }
    }

    poll(now) {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const gamepad of gamepads) {
        if (!gamepad || !gamepad.connected) continue;

        for (const [index, binding] of Object.entries(this.buttonMap)) {
          const button = gamepad.buttons[Number(index)];
          const resolvedBinding = this.resolveButtonBinding(index, binding);
          this.updateControl(
            `${gamepad.index}:button:${index}`,
            !!button && (button.pressed || button.value > 0.5),
            resolvedBinding,
            now,
            !!resolvedBinding.repeat,
          );
        }

        for (const binding of this.axisMap) {
          const value = gamepad.axes[binding.axis] || 0;
          const pressed = value * binding.direction > this.deadzone;
          const id = `${gamepad.index}:axis:${binding.axis}:${binding.direction}`;
          this.updateControl(id, pressed, binding, now, true);
        }
      }

      this.animationFrame = requestAnimationFrame(this.poll);
    }

    handleDisconnect(event) {
      const prefix = `${event.gamepad.index}:`;
      for (const [id, state] of this.buttonStates) {
        if (id.startsWith(prefix)) {
          this.dispatch("keyup", state.binding);
          this.buttonStates.delete(id);
        }
      }
    }

    destroy() {
      cancelAnimationFrame(this.animationFrame);
      window.removeEventListener("gamepaddisconnected", this.handleDisconnect);
      window.removeEventListener("keydown", this.handlePhysicalKeyboard, true);
      window.removeEventListener("pointerdown", this.handlePointerInput, true);
      this.buttonStates.clear();
    }
  }

  function initInputManager() {
    const input = new InputManager({
      hideOnKeyPress: true,
      showOnMouseMove: true,
    });

    input
      .on(
        "keys",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          setTimeout(function () {
            Lampa.Search.open();
          }, 0);
        },
        {
          description: Lampa.Lang.translate("hotkey_search"),
          preventDefault: true,
          condition: () => {
            const active = document.activeElement;
            const textInputActive =
              active &&
              (active.matches("input, textarea, select") ||
                active.isContentEditable);

            return !(
              document.body.classList.contains("search--open") ||
              document.body.classList.contains("keyboard-input--visible") ||
              textInputActive ||
              !!document.body.querySelector(
                "div.modal, .simple-keyboard, [contenteditable='true']",
              )
            );
          },
        },
      )
      .on(
        "keyf",
        () => {
          Lampa.Utils.toggleFullscreen();
        },
        {
          description: Lampa.Lang.translate("hotkey_fullscreen"),
        },
      )
      .on(
        "f4",
        () => {
          window.electronAPI.closeApp();
        },
        {
          description: Lampa.Lang.translate("hotkey_close"),
          alt: true,
          ignoreIfInput: false,
        },
      )
      // открытие/закрытие меню
      .on(
        "keym",
        () => {
          Lampa.Menu.toggle();
        },
        {
          description: Lampa.Lang.translate("hotkey_menu"),
        },
      );
  }

  function initGamepadManager() {
    // The welcome/language screen is shown before Lampa's `appready` event,
    // so gamepad navigation must start as soon as the desktop plugin loads.
    if (window.appGamepadManager) window.appGamepadManager.destroy();
    window.appGamepadManager = new GamepadManager();
  }

  function overwriteToggleFullscreen() {
    Lampa.Utils.toggleFullscreen = function () {
      window.electronAPI.toggleFullscreen();
    };
  }

  function isLibmpvSelected() {
    try {
      if (localStorage.getItem("player_desktop_mpv") === "libmpv") return true;
    } catch {
      // ignore
    }
    try {
      return Lampa.Storage.get("player_desktop_mpv") === "libmpv";
    } catch {
      return false;
    }
  }

  function formatMpvTime(sec) {
    var total = Math.max(0, Math.floor(Number(sec) || 0));
    var minutes = Math.floor(total / 60);
    var seconds = total % 60;
    return (
      (minutes < 10 ? "0" + minutes : "" + minutes) +
      ":" +
      (seconds < 10 ? "0" + seconds : "" + seconds)
    );
  }

  // Intercept Player for system mpv. playlist() comes separately after
  // play(), so aggregate via setTimeout 0.
  function initMpvHook() {
    if (initMpvHook.done) return;
    if (
      !Lampa.Player ||
      typeof Lampa.Player.play !== "function" ||
      typeof Lampa.Player.playlist !== "function"
    ) {
      if (initMpvHook.attempts < 10) {
        initMpvHook.attempts += 1;
        setTimeout(initMpvHook, 1000);
      }
      return;
    }
    initMpvHook.done = true;

    var origPlay = Lampa.Player.play.bind(Lampa.Player);
    var origPlaylist = Lampa.Player.playlist.bind(Lampa.Player);
    var pendingPlay = null;
    var pendingList = null;
    var playTimer = null;
    // Serial urls handed to mpv; a later play() for one of them switches
    // the track instead of restarting the process.
    var activePlaylistUrls = null;

    function cleanPlaylist(list) {
      if (!Array.isArray(list)) return [];
      return list
        .filter(function (item) {
          return (
            item &&
            typeof item.url === "string" &&
            /^https?:\/\//i.test(item.url)
          );
        })
        .map(function (item) {
          var copy = {};
          for (var key in item) {
            if (
              key !== "playlist" &&
              Object.prototype.hasOwnProperty.call(item, key)
            ) {
              copy[key] = item[key];
            }
          }
          return copy;
        });
    }

    function findPlaylistIndex(list, data) {
      if (!data) return 0;
      var i;
      for (i = 0; i < list.length; i++) {
        if (list[i].url && data.url && list[i].url === data.url) return i;
      }
      if (data.season != null && data.episode != null) {
        for (i = 0; i < list.length; i++) {
          if (
            list[i].season === data.season &&
            list[i].episode === data.episode
          )
            return i;
        }
      }
      return 0;
    }

    function sendExternal(data) {
      if (Lampa.Player.listener) {
        Lampa.Player.listener.send("external", data);
      }
    }

    function pad2(n) {
      n = Number(n);
      if (!Number.isFinite(n) || n < 0) return "00";
      return (n < 10 ? "0" : "") + Math.floor(n);
    }

    function isUrlLikeTitle(t) {
      if (typeof t !== "string") return true;
      var s = t.trim();
      if (!s) return true;
      if (/^https?:\/\//i.test(s)) return true;
      if (/[?&=]{2,}/.test(s) && s.length > 80) return true;
      return false;
    }

    // Human-readable episode title from Lampa client fields.
    function buildDisplayTitle(item) {
      if (!item || typeof item !== "object") return "";
      var t = typeof item.title === "string" ? item.title.trim() : "";
      if (t && !isUrlLikeTitle(t)) return t;
      var fname = typeof item.fname === "string" ? item.fname.trim() : "";
      var s = Number(item.season);
      var e = Number(item.episode);
      var hasSE = Number.isFinite(s) && s > 0 && Number.isFinite(e) && e > 0;
      var card = item.card && typeof item.card === "object" ? item.card : null;
      var base = "";
      if (card) {
        if (typeof card.title === "string" && card.title.trim())
          base = card.title.trim();
        else if (typeof card.name === "string" && card.name.trim())
          base = card.name.trim();
      }
      if (
        !base &&
        typeof item.first_title === "string" &&
        item.first_title.trim()
      )
        base = item.first_title.trim();
      if (hasSE) {
        var tag = "S" + pad2(s) + "E" + pad2(e);
        var name = fname && !isUrlLikeTitle(fname) ? fname : "";
        var head = base ? base + " - " + tag : tag;
        return name ? head + " - " + name : head;
      }
      if (fname && !isUrlLikeTitle(fname)) return fname;
      if (base) return base;
      return "";
    }

    // Ensure a playlist item has a usable timeline (hash + live handler).
    // Trust an existing timeline.hash; derive candidates only when missing.
    function ensureItemTimeline(item, card) {
      if (!item || typeof item !== "object") return;
      var tl =
        item.timeline && typeof item.timeline === "object"
          ? item.timeline
          : null;
      if (tl && tl.hash != null && typeof tl.handler === "function") return;
      if (
        !window.Lampa ||
        !Lampa.Timeline ||
        typeof Lampa.Timeline.view !== "function"
      )
        return;

      if (tl && tl.hash != null) {
        var fixed = Lampa.Timeline.view(String(tl.hash));
        if (fixed) {
          if (tl.time != null && Number(tl.time) > 0)
            fixed.time = Number(tl.time);
          if (tl.duration != null) fixed.duration = Number(tl.duration);
          if (tl.percent != null) fixed.percent = Number(tl.percent);
          fixed.hash = String(tl.hash);
          item.timeline = fixed;
        }
        return;
      }
      if (!Lampa.Utils || typeof Lampa.Utils.hash !== "function") return;

      var s = Number(item.season_number ?? item.s ?? item.season);
      var e = Number(item.episode_number ?? item.e ?? item.episode ?? item.num);
      var isSeries = Number.isFinite(s) && s > 0 && Number.isFinite(e) && e > 0;

      var names = [];
      var pushName = function (v) {
        if (typeof v === "string" && v && names.indexOf(v) === -1)
          names.push(v);
      };
      var cardObj =
        card && typeof card === "object"
          ? card
          : item.card && typeof item.card === "object"
            ? item.card
            : item.movie && typeof item.movie === "object"
              ? item.movie
              : item;
      if (cardObj && typeof cardObj === "object") {
        pushName(cardObj.original_name);
        pushName(cardObj.original_title);
        pushName(cardObj.name);
        pushName(cardObj.title);
      }
      pushName(item.original_name);
      pushName(item.original_title);
      pushName(item.first_title);
      pushName(item.name);
      pushName(item.title);
      if (names.length === 0) names.push("media");

      var candidates = [];
      var seen = {};
      var add = function (h) {
        if (h != null && !seen[h]) {
          seen[h] = true;
          candidates.push(h);
        }
      };
      if (isSeries) {
        names.forEach(function (n) {
          add(Lampa.Utils.hash([s, s > 10 ? ":" : "", e, n].join("")));
          add(Lampa.Utils.hash([s, e, n].join("")));
        });
      } else {
        names.forEach(function (n) {
          add(Lampa.Utils.hash(n));
        });
      }
      if (candidates.length === 0) return;

      var chosen = null;
      for (var i = 0; i < candidates.length; i++) {
        var cand = Lampa.Timeline.view(candidates[i]);
        if (cand && (Number(cand.time) > 0 || Number(cand.percent) > 0)) {
          chosen = cand;
          chosen.hash = candidates[i];
          break;
        }
      }
      if (!chosen) {
        chosen = Lampa.Timeline.view(candidates[0]);
        if (!chosen) chosen = { time: 0, percent: 0, duration: 0 };
        chosen.hash = candidates[0];
      }
      if (tl) {
        if (tl.time != null && Number(tl.time) > 0)
          chosen.time = Number(tl.time);
        if (tl.duration != null) chosen.duration = Number(tl.duration);
        if (tl.percent != null) chosen.percent = Number(tl.percent);
      }
      item.timeline = chosen;
    }

    function sanitizeItemForIpc(item) {
      var safe = {
        title:
          buildDisplayTitle(item) ||
          (typeof item.title === "string" ? item.title : ""),
        url: item.url,
      };
      if (item.season != null) safe.season = item.season;
      if (item.episode != null) safe.episode = item.episode;
      var itemHash =
        item.hash != null
          ? item.hash
          : item.timeline && item.timeline.hash != null
            ? item.timeline.hash
            : null;
      if (itemHash != null) safe.hash = itemHash;
      if (item.timeline && typeof item.timeline === "object") {
        safe.timeline = {};
        if (item.timeline.hash != null) safe.timeline.hash = item.timeline.hash;
        if (item.timeline.time != null)
          safe.timeline.time = Number(item.timeline.time) || 0;
        if (item.timeline.duration != null)
          safe.timeline.duration = Number(item.timeline.duration) || 0;
        if (item.timeline.percent != null)
          safe.timeline.percent = Number(item.timeline.percent) || 0;
      }
      return safe;
    }

    function sendToMpv(data, list) {
      if (
        !data ||
        typeof data.url !== "string" ||
        !/^https?:\/\//i.test(data.url)
      ) {
        return origPlay(data);
      }
      var mpv = window.electronAPI && window.electronAPI.mpv;
      if (!mpv || typeof mpv.play !== "function") {
        Lampa.Noty.show(Lampa.Lang.translate("mpv_no_binary"), "error", 5000);
        return origPlay(data);
      }
      var cleaned = cleanPlaylist(list);

      // A play() for an episode mpv already has: switch track, not restart.
      var known =
        typeof mpv.playUrl === "function" &&
        !!activePlaylistUrls &&
        activePlaylistUrls.indexOf(data.url) !== -1;
      if (known) {
        ensureItemTimeline(data, data.card || data.movie || data);
        cleaned.forEach(function (item) {
          ensureItemTimeline(item, data.card || data.movie || data);
        });
        if (cleaned.length) origPlaylist(cleaned);
        if (typeof mpv.playUrl === "function") {
          var req = mpv.playUrl(data.url);
          if (req && typeof req.catch === "function") {
            req.catch(function (err) {
              console.error("APP mpv.playUrl(switch) failed", err);
            });
          }
        }
        sendExternal(data);
        return;
      }

      var launchCard = data.card || data.movie || data;
      ensureItemTimeline(data, launchCard);
      cleaned.forEach(function (item) {
        ensureItemTimeline(item, launchCard);
      });
      // Read start/hash after ensureItemTimeline (it may derive the timeline).
      var tl =
        data.timeline && typeof data.timeline === "object" ? data.timeline : {};
      var start = Number(tl.time) || 0;
      var hash = tl.hash || null;
      if (cleaned.length) origPlaylist(cleaned);
      activePlaylistUrls = cleaned.map(function (it) {
        return it.url;
      });
      var ipcPlaylist = cleaned.map(sanitizeItemForIpc);
      var request = mpv.play({
        url: data.url,
        title:
          buildDisplayTitle(data) ||
          (typeof data.title === "string" ? data.title : ""),
        start: start,
        hash: hash,
        playlist: ipcPlaylist,
        index: findPlaylistIndex(cleaned, data),
      });
      if (request && typeof request.then === "function") {
        request.then(function (result) {
          if (!result || result.success === false) {
            console.error(
              "APP mpv.play failed",
              result && result.error ? result.error : result,
            );
            Lampa.Noty.show(
              Lampa.Lang.translate("mpv_no_binary"),
              "error",
              5000,
            );
          }
        });
      }
      if (request && typeof request.catch === "function") {
        request.catch(function (err) {
          console.error(
            "APP mpv.play failed",
            (err && (err.message || err.error)) || err,
          );
        });
      }
      sendExternal(data);
      if (start > 0) {
        Lampa.Noty.show(
          Lampa.Lang.translate("mpv_now_playing")
            .replace("{title}", data.title || "")
            .replace("{time}", formatMpvTime(start)),
        );
      }
    }

    Lampa.Player.play = function (data) {
      if (!isLibmpvSelected()) return origPlay(data);
      pendingPlay = data;
      pendingList = null;
      clearTimeout(playTimer);
      playTimer = setTimeout(function () {
        var current = pendingPlay;
        var list =
          pendingList ||
          (current && current.playlist) ||
          (Lampa.PlayerPlaylist &&
          typeof Lampa.PlayerPlaylist.get === "function"
            ? Lampa.PlayerPlaylist.get()
            : []);
        pendingPlay = null;
        pendingList = null;
        if (current) sendToMpv(current, list || []);
      }, 0);
    };

    Lampa.Player.playlist = function (list) {
      if (!isLibmpvSelected()) return origPlaylist(list);
      pendingList = list;
      return origPlaylist(list);
    };

    // mpv -> Lampa: timecodes and playback end.
    try {
      var mpvApi = window.electronAPI && window.electronAPI.mpv;
      if (mpvApi) {
        if (typeof mpvApi.onTime === "function") {
          mpvApi.onTime(function (progress) {
            if (!progress) return;
            var hash = progress.hash;
            if (hash == null) return;
            var data = {
              hash: String(hash),
              time: Math.round(Number(progress.time) || 0),
              duration: Math.round(Number(progress.duration) || 0),
              percent: Math.round(Number(progress.percent) || 0),
            };
            try {
              if (window.Lampa && Lampa.Timeline && Lampa.Timeline.update) {
                Lampa.Timeline.update(data);
              }
              if (
                window.Lampa &&
                Lampa.Android &&
                typeof Lampa.Android.timeCall === "function"
              ) {
                Lampa.Android.timeCall(data);
              }
            } catch (e) {
              console.error("APP mpv time update failed", e);
            }
          });
        }
        if (typeof mpvApi.onEnded === "function") {
          mpvApi.onEnded(function (info) {
            if (info && info.autoNext === true) return;
            activePlaylistUrls = null;
            // No listener.send('destroy'): inner player destroy would flush
            // an empty work.timeline over the position saved via mpv-time.
          });
        }
      }
    } catch (err) {
      console.error("APP Failed to subscribe to mpv events", err);
    }
  }
  initMpvHook.done = false;
  initMpvHook.attempts = 0;

  function init() {
    overwriteToggleFullscreen(); // Переопределение функции Utils.toggleFullscreen
    addQuitButton(); // Кнопка выхода в шапке
    addAppSettings(); // Настройки приложения внутри лампы
    initMpvHook(); // Player interception for system mpv (macOS)
    initInputManager();
  }

  if (!window.plugin_app_ready) {
    window.plugin_app_ready = true;
    initGamepadManager();

    if (window.appready) {
      init();
    } else {
      Lampa.Listener.follow("app", function (e) {
        if (e.type === "ready") init();
      });
    }
  }
})();
