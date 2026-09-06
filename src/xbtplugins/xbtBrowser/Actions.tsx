/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { Button } from "@components/Button";
import { classNameFactory } from "@utils/css";
import { PluginNative } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

import { isWebviewAvailable, logger, openXbtBrowser } from "./BrowserModal";
import { searchEngine } from "./config";
import { SEARCH_ENGINES } from "./policy";

const cl = classNameFactory("xbt-br-");

const Native = XbtcordNative.pluginHelpers.XbtBrowser as PluginNative<typeof import("./native")> | undefined;

/** The buttons at the bottom of XbtBrowser's settings: try it, and forget everything. */
export function BrowserActions() {
    const available = isWebviewAvailable();

    return (
        <div className={cl("actions")}>
            <Button
                size="small"
                variant="primary"
                onClick={() => openXbtBrowser(SEARCH_ENGINES[searchEngine()].home)}
            >
                {available ? "Open XbtBrowser" : "Open XbtBrowser (needs a restart)"}
            </Button>

            <Button
                size="small"
                variant="secondary"
                onClick={() => {
                    if (!Native) return;
                    Native.clearBrowsingData()
                        .then(() => showToast("Browsing data cleared", Toasts.Type.SUCCESS))
                        .catch(err => {
                            logger.error("Couldn't clear the browsing session", err);
                            showToast("Couldn't clear browsing data", Toasts.Type.FAILURE);
                        });
                }}
            >
                Clear browsing data
            </Button>
        </div>
    );
}
