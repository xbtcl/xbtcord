/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Tooltip } from "@webpack/common";
import { TooltipProps } from "@xbtcord/discord-types";

export function TooltipContainer({ children, ...props }: Omit<TooltipProps, "children"> & { children: React.ReactNode; }) {
    return (
        <Tooltip {...props}>
            {tooltipProps =>
                <div {...tooltipProps}>
                    {children}
                </div>
            }
        </Tooltip>
    );
}
