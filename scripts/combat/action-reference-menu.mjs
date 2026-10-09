import {openCombatActionReference, reportReferenceError} from "./action-reference.mjs";

const MENU_ID = "rsaCombatActionReference";

/** Settings sidebar and its popped-out copy both emit renderSettings in v14. */
export function addReferenceSettingsButton(_app, html) {
    if (game.system.id !== "dark-heresy") return;
    const root = html?.querySelector ? html : html?.[0];
    const section = root?.querySelector("[data-help-docs], section.documentation");
    if (!section || section.querySelector("[data-rsa-combat-reference]")) return;
    const button = section.ownerDocument.createElement("button");
    button.type = "button";
    button.dataset.rsaCombatReference = "";
    button.title = game.i18n.localize("RSA.ACTION_REFERENCE_HINT");
    const icon = section.ownerDocument.createElement("i");
    icon.className = "fa-solid fa-list-check";
    icon.setAttribute("aria-hidden", "true");
    button.append(icon, " ", game.i18n.localize("RSA.ACTION_REFERENCE"));
    button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        void openCombatActionReference().catch(reportReferenceError);
    });
    section.append(button);
}

export function registerReferenceMenus() {
    // Public menu configuration, not a replacement of Foundry's render/click handlers.
    foundry.applications.ui.MainMenu.ITEMS[MENU_ID] = {
        label: "RSA.ACTION_REFERENCE",
        icon: "fa-solid fa-fw fa-list-check",
        enabled: () => game.system.id === "dark-heresy",
        async onClick() {
            try {
                await this.close(); // Leave the modal menu before showing the reference.
                await openCombatActionReference();
            } catch (error) { reportReferenceError(error); }
        }
    };
    Hooks.on("renderSettings", addReferenceSettingsButton);
}
