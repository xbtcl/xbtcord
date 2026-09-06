/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { TextButton } from "@components/Button";
import { Switch } from "@components/Switch";
import { classNameFactory } from "@utils/css";
import { copyWithToast } from "@utils/discord";
import { Tooltip } from "@webpack/common";
import { VaultTheme } from "@xbtplugins/themeVault/api";

const cl = classNameFactory("tc-vault-");

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

function relative(ts: number): string {
    if (!ts) return "unknown";
    const days = Math.floor((Date.now() - ts) / 86_400_000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
}

interface Props {
    theme: VaultTheme;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    onPreview: () => void;
}

export function VaultCard({ theme, enabled, onToggle, onPreview }: Props) {
    return (
        <div className={cl("card", { "card-enabled": enabled })}>
            <div
                className={cl("thumb")}
                role="button"
                tabIndex={0}
                onClick={onPreview}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onPreview(); }}
            >
                {theme.thumbnail
                    ? <img src={theme.thumbnail} alt="" loading="lazy" />
                    : <div className={cl("thumb-empty")}>{theme.name.slice(0, 2).toUpperCase()}</div>}
                <div className={cl("thumb-overlay")}>Preview</div>
            </div>

            <div className={cl("body")}>
                <div className={cl("head")}>
                    <div className={cl("titles")}>
                        <div className={cl("name")} title={theme.name}>{theme.name}</div>
                        <div className={cl("author")}>by {theme.author}</div>
                    </div>
                    <Switch checked={enabled} onChange={onToggle} />
                </div>

                <div className={cl("desc")} title={theme.description}>{theme.description}</div>

                {theme.tags.length > 0 && (
                    <div className={cl("tags")}>
                        {theme.tags.slice(0, 4).map(tag => (
                            <span key={tag} className={cl("tag")}>{tag}</span>
                        ))}
                    </div>
                )}

                <div className={cl("meta")}>
                    <Tooltip text={`${theme.downloads.toLocaleString()} downloads`}>
                        {p => <span {...p} className={cl("stat")}>&#8595; {compact.format(theme.downloads)}</span>}
                    </Tooltip>
                    <Tooltip text={`${theme.likes.toLocaleString()} likes`}>
                        {p => <span {...p} className={cl("stat")}>&#9829; {compact.format(theme.likes)}</span>}
                    </Tooltip>
                    <Tooltip text={`Last updated ${theme.updated ? new Date(theme.updated).toLocaleDateString() : "unknown"}`}>
                        {p => <span {...p} className={cl("stat")}>{relative(theme.updated)}</span>}
                    </Tooltip>
                    <span className={cl("spacer")} />
                    <TextButton
                        variant="secondary"
                        className={cl("link")}
                        onClick={() => copyWithToast(theme.source, "Stylesheet URL copied")}
                    >
                        Copy CSS
                    </TextButton>
                </div>
            </div>
        </div>
    );
}
