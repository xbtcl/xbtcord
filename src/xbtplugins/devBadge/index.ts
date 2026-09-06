/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BadgePosition } from "@api/Badges";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { XBTCORD_ICON } from "@utils/xbtcordLogo";

/**
 * Whose badge this is.
 *
 * Hardcoded rather than fetched from anywhere: a list on a server would mean every client
 * phoning home to render a profile, which is the exact thing this fork already warns about
 * CustomProfile doing. One id in the source costs a rebuild to change and nothing else.
 */
const XBTCORD_DEV = "320171386016628747";

export default definePlugin({
    name: "DevBadge",
    description: "Shows the Xbtcord developer badge on its owner's profile",
    tags: ["Appearance"],
    searchTerms: ["badge", "developer", "dev", "profile"],
    authors: [Devs.Xbtcord],
    required: true,

    userProfileBadge: {
        id: "xbtcord-dev",
        key: "xbtcord-dev",
        description: "xbtcord dev",

        // The plated icon, not the transparent mark: this sits on whatever colour someone's
        // profile banner happens to be, and a white-on-transparent ghost disappears on a
        // light one.
        iconSrc: XBTCORD_ICON,

        // Discord renders badges in array order and the API inserts START badges at the
        // front, so this lands left of Nitro, boosts and the rest.
        position: BadgePosition.START,

        shouldShow: ({ userId }) => userId === XBTCORD_DEV,

        props: {
            style: {
                borderRadius: "50%",
                transform: "scale(1.1)"
            }
        }
    }
});
