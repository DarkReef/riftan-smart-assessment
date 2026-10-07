# Riftan Smart Assessment

Independent module for Foundry VTT 14 and **Apex Heresy Ru 1.5.1**. No dependency on DAE, Riftan Charbar or ItemPileFFG.

## Installation / Установка

1. Update the system first using this manifest: https://github.com/DarkReef/Apex-Heresy-Ru/releases/latest/download/system.json
2. Install this module using: https://github.com/DarkReef/riftan-smart-assessment/releases/latest/download/module.json
3. Enable the module in your world. A GM must be connected for Fate rerolls.

**Сначала обновите форк системы до 1.5.1**, затем установите и включите модуль. Старый Apex Heresy без расширения сохранённой сложности не поддерживает точные перебросы этим модулем.

## Active Effects

Open the native effect editor. Each attribute-key input gets a search box supporting Russian/English field names and technical paths. Select a result to populate the native key. Green means the field/value match; yellow means a derived phase or reference needs review; red means an unknown field or incompatible literal/operation. Warnings are advisory: the module does not block native editing or implement a new effect engine. Formula references use the native V14 engine and are not evaluated by this module.

Transferred item effects suggest Actor fields; non-transferred effects suggest Item fields. Actor-owned items use their actual Actor, standalone transferred items use the acolyte model. User-defined skill specialities are included when present. No effect-summary feature is included.

## Fate

Right-click a native system check → **Перебросить за Fate — 1 / Reroll with Fate — 1**. The module replaces the native menu entry while enabled.

The active GM validates ownership and original card visibility, queues requests per Actor, spends one **current** Fate point and repeats the saved test with its original final target and modifiers. It uses the native check/attack engine; rerolls do not consume ammunition or recharge a weapon again. Only failed tests may be rerolled; damage cards, regeneration checks with automatic healing, and already-rerolled checks are rejected. Existing Black Crusade Infamy eligibility restrictions are retained.

Successful rerolls have a gold frame; failures a blood-scarlet frame. Each has one of ten outcome-specific authored phrases (not quotations from published books), selected once and stored on the card. The footer records `original → new result` and `Fate before → after`. Original cards remain in chat, are marked as replaced and link to the new result. Hidden and whispered rolls retain the original recipients/blindness; history is rendered only to users who can see the relevant card.

Requests require a connected GM. An error before a new card exists refunds the point. Once a card exists, failure recording history never refunds it. The result card itself prevents reuse even if the history update fails. Checks with system-specific side effects retain the native engine's behavior; this is not a full combat automation engine. As with other Foundry modules, request document flags are not a security boundary against a user deliberately running privileged JavaScript.

## API

```js
await game.modules.get('riftan-smart-assessment').api.requestReroll(messageId);
```

## Validation

Automated tests cover field selection/types/phases, ownership, visibility, saved modifiers, failure/refunds and simultaneous requests. DOM integration is tested using a mocked Foundry host. Live Foundry multiplayer QA remains required before treating this prerelease as production-ready.

GPL-3.0; system integration derives from Apex Heresy. See LICENSE.

## Компактные карточки (0.1.1)

Подробности режима оружия открываются при наведении на подчёркнутую ссылку и по нажатию в отдельном окне. Длинные подписи переносятся, включая неизвестные свойства. Русские подписи относятся к отображению карточки: исходные названия предметов и механические свойства не переписываются. Новые пояснения следует добавлять во всплывающие подсказки, сохраняя короткую подпись в чате.


## Independent development

Run `npm test` in this repository. The system is installed separately.
The manual release workflow creates a draft release with this module only.
Live multiplayer validation against the new system build is still pending.

## Установка из публичного репозитория

В Foundry → Add-on Modules → Install Module вставьте URL манифеста:

```text
https://github.com/DarkReef/riftan-smart-assessment/releases/latest/download/module.json
```

Манифест и ZIP доступны без авторизации. Для обновления используйте штатную проверку обновлений Foundry. Рекомендуемая система — Apex Heresy RU 1.5.3; система устанавливается отдельно.

## Нативный поиск ключа (0.1.5)

В редакторе Active Effect используется одно штатное поле ключа с автодополнением. Введите русское название, английское название, алиас или технический путь; выберите результат мышью либо стрелками и Enter. Escape отменяет поиск. Технический путь можно ввести вручную; данные эффекта остаются нативными. Результаты имеют роль listbox, выбранный вариант связан через aria-activedescendant.

Модуль берёт каноническое имя характеристики и алиасы из API локализации системы с учётом правил персонажа. Для Only War «Дальний бой» — основное имя, «Стрельба», «Ballistic Skill», «BS» — поисковые алиасы. При отсутствии нового API используются подписи самого Actor. Пользовательские специализации, перенесённые эффекты предметов, проверки типов/режимов, отрицательные числа, @references и final phase сохранены.

Остаток ран Only War — представление данных системы: технический system.wounds.value по-прежнему обозначает полученный урон; не используйте отрицательное значение этого поля как отрицательный остаток здоровья. Изменение полученного или критического урона эффектом отражается в вычисленном остатке.

Живой Foundry smoke test ещё не выполнен; поиск проверен на браузерном стенде и автоматическими тестами.
