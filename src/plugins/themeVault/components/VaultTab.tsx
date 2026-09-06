/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@plugins/themeVault/glass.css";
import "@plugins/themeVault/styles.css";

import { useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { ErrorCard } from "@components/ErrorCard";
import { HeadingPrimary } from "@components/Heading";
import { Link } from "@components/Link";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { collectTags, getThemes, VaultTheme } from "@plugins/themeVault/api";
import { disableTheme, enableExclusively, enableTheme } from "@plugins/themeVault/install";
import { settings } from "@plugins/themeVault/settings";
import { classNameFactory } from "@utils/css";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { Select, showToast, TextInput, Toasts, useEffect, useMemo, useState } from "@webpack/common";

import { openPreview } from "./PreviewModal";
import { VaultCard } from "./VaultCard";

const cl = classNameFactory("tc-vault-");

const enum Sort {
    Downloads = "downloads",
    Likes = "likes",
    Updated = "updated",
    Newest = "newest",
    Name = "name"
}

const sortOptions = [
    { label: "Most downloaded", value: Sort.Downloads },
    { label: "Most liked", value: Sort.Likes },
    { label: "Recently updated", value: Sort.Updated },
    { label: "Newest", value: Sort.Newest },
    { label: "Name (A-Z)", value: Sort.Name }
];

const ALL_TAGS = "__all__";

function sortThemes(themes: VaultTheme[], sort: Sort): VaultTheme[] {
    const sorted = [...themes];
    switch (sort) {
        case Sort.Likes: return sorted.sort((a, b) => b.likes - a.likes);
        case Sort.Updated: return sorted.sort((a, b) => b.updated - a.updated);
        case Sort.Newest: return sorted.sort((a, b) => b.released - a.released);
        case Sort.Name: return sorted.sort((a, b) => a.name.localeCompare(b.name));
        default: return sorted.sort((a, b) => b.downloads - a.downloads);
    }
}

function ThemeVaultTab() {
    // Re-renders the grid the moment a theme is switched on or off, including from
    // the normal Themes tab, so the two views never disagree about what is active.
    const liveSettings = useSettings(["themeLinks"]);
    const { glass } = settings.use(["glass"]);
    const enabledLinks = liveSettings.themeLinks ?? [];

    const [themes, setThemes] = useState<VaultTheme[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [stale, setStale] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const [query, setQuery] = useState("");
    const [sort, setSort] = useState(Sort.Downloads);
    const [tag, setTag] = useState(ALL_TAGS);
    const [onlyEnabled, setOnlyEnabled] = useState(false);

    async function load(force = false) {
        setRefreshing(true);
        setError(null);
        try {
            const { themes, stale } = await getThemes(force);
            setThemes(themes);
            setStale(stale);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setRefreshing(false);
        }
    }

    useEffect(() => { void load(); }, []);

    const tags = useMemo(() => themes ? collectTags(themes) : [], [themes]);

    const tagOptions = useMemo(() => [
        { label: "All categories", value: ALL_TAGS },
        ...tags.map(t => ({ label: t, value: t }))
    ], [tags]);

    const visible = useMemo(() => {
        if (!themes) return [];
        const q = query.trim().toLowerCase();

        const filtered = themes.filter(theme => {
            if (onlyEnabled && !enabledLinks.includes(theme.source)) return false;
            if (tag !== ALL_TAGS && !theme.tags.includes(tag)) return false;
            if (!q) return true;
            return theme.name.toLowerCase().includes(q)
                || theme.author.toLowerCase().includes(q)
                || theme.description.toLowerCase().includes(q)
                || theme.tags.some(t => t.toLowerCase().includes(q));
        });

        return sortThemes(filtered, sort);
    }, [themes, query, sort, tag, onlyEnabled, enabledLinks]);

    function toggle(theme: VaultTheme, enabled: boolean) {
        if (!enabled) {
            disableTheme(theme);
            showToast(`${theme.name} switched off`, Toasts.Type.SUCCESS);
            return;
        }

        if (settings.store.exclusive && themes) {
            enableExclusively(theme, themes);
            showToast(`${theme.name} is now your active theme`, Toasts.Type.SUCCESS);
        } else {
            enableTheme(theme);
            showToast(`${theme.name} switched on`, Toasts.Type.SUCCESS);
        }
    }

    const enabledCount = themes?.filter(t => enabledLinks.includes(t.source)).length ?? 0;

    return (
        <SettingsTab>
            <HeadingPrimary>Theme Vault</HeadingPrimary>
            <Paragraph color="text-muted">
                Every theme in the{" "}
                <Link href="https://betterdiscord.app/themes">BetterDiscord store</Link>, browsable here.
                Flip a switch and the theme applies immediately - it is imported straight from the
                author's stylesheet, so nothing gets downloaded and their updates arrive on their own.
            </Paragraph>

            {stale && (
                <Notice variant="warning" className={Margins.top16}>
                    Couldn't reach the BetterDiscord store, so this is the last catalogue Xbtcord
                    saved. Themes you already switched on are unaffected.
                </Notice>
            )}

            {error && !themes && (
                <ErrorCard className={Margins.top16}>
                    <Paragraph>Couldn't load the theme catalogue: {error}</Paragraph>
                </ErrorCard>
            )}

            <div className={classes(cl("controls"), Margins.top16)}>
                <TextInput
                    className={cl("search")}
                    value={query}
                    onChange={setQuery}
                    placeholder="Search themes, authors, tags..."
                fullWidth />
                <div className={cl("select")}>
                    <Select
                        options={sortOptions}
                        select={setSort}
                        isSelected={v => v === sort}
                        serialize={v => String(v)}
                    />
                </div>
                <div className={cl("select")}>
                    <Select
                        options={tagOptions}
                        select={setTag}
                        isSelected={v => v === tag}
                        serialize={v => String(v)}
                    />
                </div>
                <Button
                    variant={onlyEnabled ? "primary" : "secondary"}
                    size="small"
                    onClick={() => setOnlyEnabled(v => !v)}
                >
                    Active{enabledCount ? ` (${enabledCount})` : ""}
                </Button>
                <Button variant="secondary" size="small" disabled={refreshing} onClick={() => void load(true)}>
                    {refreshing ? "Refreshing..." : "Refresh"}
                </Button>
            </div>

            {themes === null && !error
                ? <Paragraph color="text-muted" className={Margins.top16}>Loading the BetterDiscord catalogue...</Paragraph>
                : (
                    <>
                        <Paragraph color="text-muted" className={cl("count")}>
                            {visible.length} of {themes?.length ?? 0} themes
                        </Paragraph>

                        {visible.length === 0
                            ? <Paragraph color="text-muted">Nothing matches that. Try a broader search.</Paragraph>
                            : (
                                <div className={classes(cl("grid"), glass && cl("grid-glass"))}>
                                    {visible.map(theme => {
                                        const enabled = enabledLinks.includes(theme.source);
                                        return (
                                            <VaultCard
                                                key={theme.id}
                                                theme={theme}
                                                enabled={enabled}
                                                onToggle={value => toggle(theme, value)}
                                                onPreview={() => openPreview(theme, enabled, value => toggle(theme, value))}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                    </>
                )}
        </SettingsTab>
    );
}

export default wrapTab(ThemeVaultTab, "Theme Vault");
