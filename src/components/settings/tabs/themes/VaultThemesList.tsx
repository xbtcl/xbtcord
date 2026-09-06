/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./vaultThemes.css";

import { useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Forms, Text, useEffect, useMemo, useState } from "@webpack/common";
import { getCachedThemes, VaultTheme } from "@xbtplugins/themeVault/api";

/**
 * The themes you switched on in the Theme Vault, shown as themes rather than as URLs.
 *
 * Enabling a vault theme has always put its stylesheet URL into `themeLinks`, which is
 * exactly where it belongs - but that list is rendered as a raw textarea, so a theme you
 * turned on somewhere pretty showed up here as an unreadable line of https. This reads the
 * catalogue Theme Vault has already cached and puts the name, author and version back
 * against each link it recognises.
 *
 * Only the cache is consulted, never the network. Links that are not from the vault, or
 * that are not in the cache yet, are left to the textarea below - nothing is hidden.
 */
function VaultThemesListInner() {
    const settings = useSettings(["themeLinks"]);
    const links = settings.themeLinks ?? [];

    const [catalogue, setCatalogue] = useState<VaultTheme[] | null>(null);

    useEffect(() => {
        getCachedThemes().then(setCatalogue).catch(() => setCatalogue([]));
    }, []);

    const known = useMemo(() => {
        if (!catalogue?.length) return [];
        const bySource = new Map(catalogue.map(t => [t.source, t]));

        return links
            .map(link => ({ link, theme: bySource.get(link) }))
            .filter((entry): entry is { link: string; theme: VaultTheme; } => entry.theme != null);
    }, [catalogue, links]);

    if (!known.length) return null;

    function remove(link: string) {
        settings.themeLinks = links.filter(l => l !== link);
    }

    return (
        <section className="xbt-vault-themes">
            <Forms.FormTitle tag="h5">From the Theme Vault</Forms.FormTitle>
            <Forms.FormText>
                {known.length === 1 ? "1 theme" : `${known.length} themes`} you switched on in the
                vault. They are applied from the author's stylesheet, so their updates arrive on
                their own.
            </Forms.FormText>

            <div className="xbt-vault-themes-list">
                {known.map(({ link, theme }) => (
                    <div className="xbt-vault-themes-row" key={link}>
                        {theme.thumbnail
                            ? <img className="xbt-vault-themes-thumb" src={theme.thumbnail} alt="" loading="lazy" />
                            : <div className="xbt-vault-themes-thumb xbt-vault-themes-thumb-empty">
                                {theme.name.slice(0, 2).toUpperCase()}
                            </div>}

                        <div className="xbt-vault-themes-body">
                            <Text variant="text-sm/semibold">{theme.name}</Text>
                            <Text variant="text-xs/normal" className="xbt-vault-themes-meta">
                                by {theme.author}{theme.version ? ` · v${theme.version}` : ""}
                            </Text>
                        </div>

                        <Button size="small" variant="dangerSecondary" onClick={() => remove(link)}>
                            Turn off
                        </Button>
                    </div>
                ))}
            </div>
        </section>
    );
}

export function VaultThemesList() {
    return (
        <ErrorBoundary noop>
            <VaultThemesListInner />
        </ErrorBoundary>
    );
}
