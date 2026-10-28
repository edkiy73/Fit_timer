-- FetUre: ключ подписи Android без терминала (apps/feture/docs/android-release.md).
-- Открой этот файл двойным щелчком: запустится «Редактор скриптов». Нажми ▶ («Запустить»).
--
-- Что делает:
--   1) по желанию создаёт НОВЫЙ ключ FetUre (файл .jks) на этом Mac — инструментом keytool из Android Studio;
--   2) копирует файл ключа в буфер обмена в виде текста (base64) — для секрета FETURE_KEYSTORE_BASE64 на GitHub.
-- Ничего не отправляет в интернет, ничего не показывает на экране и не пишет в репозиторий.
-- Пароль передаётся keytool через переменную окружения, а не в строке команды.

set keytoolPath to ""
set candidates to {"/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool", "/Applications/Android Studio.app/Contents/jre/Contents/Home/bin/keytool"}
repeat with c in candidates
	try
		do shell script "test -x " & quoted form of (c as text)
		set keytoolPath to c as text
		exit repeat
	end try
end repeat
if keytoolPath is "" then
	try
		set javaHome to do shell script "/usr/libexec/java_home 2>/dev/null"
		do shell script "test -x " & quoted form of (javaHome & "/bin/keytool")
		set keytoolPath to javaHome & "/bin/keytool"
	end try
end if

set choice to button returned of (display dialog "Ключ подписи FetUre для Android." & return & return & "Создать новый ключ — один раз, в самом начале." & return & "Уже есть файл ключа — только скопировать его для GitHub." buttons {"Отмена", "У меня уже есть файл ключа", "Создать новый ключ"} default button "Создать новый ключ" cancel button "Отмена" with title "FetUre — ключ подписи")

if choice is "Создать новый ключ" then
	if keytoolPath is "" then
		display dialog "Не нашёл инструмент keytool. Установи Android Studio (бесплатно: developer.android.com/studio) в папку «Программы» и запусти этот скрипт снова." buttons {"Понятно"} default button 1 with title "FetUre — ключ подписи" with icon caution
		return
	end if
	set pw1 to text returned of (display dialog "Придумай пароль ключа (не короче 12 символов). Сохрани его в менеджере паролей или «Связке ключей»: без него ключ бесполезен." default answer "" with hidden answer buttons {"Отмена", "Дальше"} default button "Дальше" cancel button "Отмена" with title "FetUre — пароль ключа")
	if (length of pw1) < 12 then
		display dialog "Пароль короче 12 символов. Запусти скрипт ещё раз." buttons {"Понятно"} default button 1 with title "FetUre — ключ подписи" with icon caution
		return
	end if
	set pw2 to text returned of (display dialog "Повтори пароль." default answer "" with hidden answer buttons {"Отмена", "Дальше"} default button "Дальше" cancel button "Отмена" with title "FetUre — пароль ключа")
	if pw1 is not pw2 then
		display dialog "Пароли не совпали. Запусти скрипт ещё раз." buttons {"Понятно"} default button 1 with title "FetUre — ключ подписи" with icon caution
		return
	end if
	set target to choose file name with prompt "Где сохранить ключ FetUre? Потом сделай копию (iCloud Drive и флешка)." default name "FetUre-release.jks" default location (path to documents folder)
	set targetPath to POSIX path of target
	try
		do shell script "test -e " & quoted form of targetPath
		display dialog "Такой файл уже есть — старый ключ не перезаписываю. Выбери другое имя или используй «У меня уже есть файл ключа»." buttons {"Понятно"} default button 1 with title "FetUre — ключ подписи" with icon caution
		return
	end try
	do shell script "FETURE_PW=" & quoted form of pw1 & " " & quoted form of keytoolPath & " -genkeypair -keystore " & quoted form of targetPath & " -storetype PKCS12 -alias feture -keyalg RSA -keysize 4096 -validity 10000 -storepass:env FETURE_PW -keypass:env FETURE_PW -dname " & quoted form of "CN=FetUre, O=FetUre, C=RU" & " >/dev/null 2>&1"
	set pw1 to ""
	set pw2 to ""
	set keyFile to targetPath
else
	set keyFile to POSIX path of (choose file with prompt "Выбери файл ключа FetUre (.jks или .keystore).")
end if

do shell script "/usr/bin/base64 -i " & quoted form of keyFile & " | /usr/bin/tr -d '\\n' | /usr/bin/pbcopy"

set nextStep to button returned of (display dialog "Готово: ключ скопирован в буфер обмена (как текст)." & return & return & "На GitHub добавь секрет:" & return & "  Name: FETURE_KEYSTORE_BASE64" & return & "  Secret: вставь (⌘V)" & return & return & "Ещё три секрета:" & return & "  FETURE_KEYSTORE_PASSWORD — пароль ключа" & return & "  FETURE_KEY_ALIAS — feture" & return & "  FETURE_KEY_PASSWORD — тот же пароль" buttons {"Закрыть", "Открыть GitHub"} default button "Открыть GitHub" with title "FetUre — ключ подписи")
if nextStep is "Открыть GitHub" then open location "https://github.com/edkiy73/Fit_timer/settings/secrets/actions/new"

display dialog "Когда вставишь FETURE_KEYSTORE_BASE64 на GitHub, нажми «Очистить буфер» — чтобы ключ не остался в буфере обмена." buttons {"Очистить буфер"} default button 1 with title "FetUre — ключ подписи"
set the clipboard to ""
