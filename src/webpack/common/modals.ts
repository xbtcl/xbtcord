/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { filters, findByCodeLazy, findExportedComponentLazy, mapMangledModuleLazy } from "@webpack";
import * as t from "@xbtcord/discord-types";

/*
 * The export named "Modal" now belongs to a searchable list modal - it takes listProps and
 * renders rows - rather than the general modal every plugin builds on. It still resolves, so
 * nothing reports it as missing; it just is not the component it used to be. The general one
 * is found by the props it lays out instead.
 *
 * ConfirmModal is deliberately left on its export name. The code-based lookup endcord moved
 * to ("actionBarInput:", "critical", "secondary") now lands on Discord's poll editor first,
 * while the named export is still the real confirmation dialog.
 */
export const Modal: t.Modal = findByCodeLazy("leadingLayout:", "actions:", ".message");
export const ConfirmModal: t.ConfirmModal = findExportedComponentLazy("ConfirmModal");

// Modal key: "Media Viewer Modal"
export const openMediaModal: (props: t.MediaModalProps) => void = findByCodeLazy("hasMediaOptions", "shouldHideMediaOptions");

const ModalAPI: t.ModalAPI = mapMangledModuleLazy(".modalKey?", {
    openModalLazy: filters.byCode(".modalKey?"),
    openModal: filters.byCode(",instant:"),
    closeModal: filters.byCode(".onCloseCallback()"),
    // ".getState();for" alone also matches a helper that takes a Set of modal keys
    closeAllModals: filters.byCode(/\.getState\(\);for\(let \i in /)
});

export const { openModalLazy, openModal, closeModal, closeAllModals } = ModalAPI;
