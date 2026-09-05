/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Command } from "@xbtcord/discord-types";
export { ApplicationCommandInputType, ApplicationCommandOptionType, ApplicationCommandType } from "@xbtcord/discord-types/enums";

export interface XbtcordCommand extends Command {
    isXbtcordCommand?: boolean;
}
