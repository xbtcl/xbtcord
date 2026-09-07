/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./xbt.css";

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Modal, openModal } from "@webpack/common";
import { ReactNode } from "react";

/**
 * The modal shape most of these plugins want: a title, a scrolling list, and a Close
 * button. Written once here because two dozen near-identical copies is two dozen places
 * to fix when Discord's modal props change.
 */
export function XbtModal({ props, title, subtitle, size, children }: {
    props: any;
    title: string;
    subtitle?: string;
    size?: "sm" | "md" | "lg" | "xl";
    children: ReactNode;
}) {
    return (
        <ErrorBoundary>
            <Modal
                {...props}
                title={title}
                subtitle={subtitle}
                size={size ?? "md"}
                actions={[{ text: "Close", variant: "primary", onClick: props.onClose }]}
            >
                {children}
            </Modal>
        </ErrorBoundary>
    );
}

export function openListModal(title: string, subtitle: string, render: () => ReactNode, size?: "sm" | "md" | "lg" | "xl") {
    openModal(props => (
        <XbtModal props={props} title={title} subtitle={subtitle} size={size}>
            {render()}
        </XbtModal>
    ));
}

/** A row: some text on the left, buttons on the right. */
export function Row({ title, meta, preview, actions }: {
    title: ReactNode;
    meta?: ReactNode;
    preview?: ReactNode;
    actions?: { label: string; onClick: () => void; danger?: boolean; }[];
}) {
    return (
        <div className="xbt-row">
            <div className="xbt-row-body">
                <div>{title}</div>
                {preview != null && <div className="xbt-row-preview">{preview}</div>}
                {meta != null && <div className="xbt-row-meta">{meta}</div>}
            </div>
            {!!actions?.length && (
                <div className="xbt-row-actions">
                    {actions.map(action => (
                        <Button
                            key={action.label}
                            size="small"
                            variant={action.danger ? "dangerPrimary" : "secondary"}
                            onClick={action.onClick}
                        >
                            {action.label}
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function Empty({ children }: { children: ReactNode; }) {
    return <div className="xbt-empty">{children}</div>;
}

/** `3 minutes ago`, for list rows where an exact timestamp would be noise. */
export function ago(timestamp: number): string {
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 60) return "just now";

    const units: [string, number][] = [["day", 86_400], ["hour", 3600], ["minute", 60]];
    for (const [name, size] of units) {
        const value = Math.floor(seconds / size);
        if (value >= 1) return `${value} ${name}${value === 1 ? "" : "s"} ago`;
    }

    return "just now";
}
