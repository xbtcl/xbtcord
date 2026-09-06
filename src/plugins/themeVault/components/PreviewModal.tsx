/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Link } from "@components/Link";
import { VaultTheme } from "@plugins/themeVault/api";
import { classNameFactory } from "@utils/css";
import { Modal, openModal } from "@webpack/common";
import { RenderModalProps } from "@xbtcord/discord-types";

const cl = classNameFactory("tc-vault-");

function PreviewModal({ theme, enabled, onToggle, ...props }: RenderModalProps & {
    theme: VaultTheme;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
}) {
    return (
        <Modal
            {...props}
            size="lg"
            title={theme.name}
            actions={[
                {
                    text: "Close",
                    variant: "secondary",
                    onClick: () => props.onClose()
                },
                {
                    text: enabled ? "Switch off" : "Switch on",
                    variant: enabled ? "critical-primary" : "primary",
                    onClick: () => {
                        onToggle(!enabled);
                        props.onClose();
                    }
                }
            ]}
        >
            <div className={cl("preview")}>
                {theme.thumbnail && (
                    <img className={cl("preview-img")} src={theme.thumbnail} alt={`${theme.name} preview`} />
                )}

                <p className={cl("preview-desc")}>{theme.description || "This theme ships without a description."}</p>

                <dl className={cl("preview-facts")}>
                    <dt>Author</dt><dd>{theme.author}</dd>
                    <dt>Version</dt><dd>{theme.version || "unversioned"}</dd>
                    <dt>Downloads</dt><dd>{theme.downloads.toLocaleString()}</dd>
                    <dt>Likes</dt><dd>{theme.likes.toLocaleString()}</dd>
                    <dt>First published</dt>
                    <dd>{theme.released ? new Date(theme.released).toLocaleDateString() : "unknown"}</dd>
                    <dt>Last updated</dt>
                    <dd>{theme.updated ? new Date(theme.updated).toLocaleDateString() : "unknown"}</dd>
                    {theme.tags.length > 0 && <><dt>Tags</dt><dd>{theme.tags.join(", ")}</dd></>}
                    <dt>Stylesheet</dt>
                    <dd><Link href={theme.source}>{theme.fileName}</Link></dd>
                </dl>

                <p className={cl("preview-note")}>
                    Switching this on imports the author's stylesheet straight from its source, so
                    their updates reach you without reinstalling. Nothing is written to disk.
                </p>
            </div>
        </Modal>
    );
}

export function openPreview(theme: VaultTheme, enabled: boolean, onToggle: (enabled: boolean) => void) {
    openModal(props => <PreviewModal {...props} theme={theme} enabled={enabled} onToggle={onToggle} />);
}
