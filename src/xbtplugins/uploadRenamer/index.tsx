/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { PencilIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { getCurrentChannel } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { DraftType, openModal, TextInput, UploadHandler, useState } from "@webpack/common";
import { XbtModal } from "@xbtplugins/_shared/ui";

const settings = definePluginSettings({
    pattern: {
        type: OptionType.STRING,
        description: "Default name. {n} is the file number, {date} today, {time} now, {orig} the original name",
        default: "{orig}"
    },
    keepExtension: {
        type: OptionType.BOOLEAN,
        description: "Always keep the original file extension, whatever you type",
        default: true
    }
});

function expand(pattern: string, original: string, index: number) {
    const now = new Date();
    const base = original.replace(/\.[^.]+$/, "");

    return pattern
        .replaceAll("{orig}", base)
        .replaceAll("{n}", String(index + 1))
        .replaceAll("{date}", now.toISOString().slice(0, 10))
        .replaceAll("{time}", now.toTimeString().slice(0, 8).replaceAll(":", "-"));
}

function extensionOf(name: string) {
    const match = /\.[^.]+$/.exec(name);
    return match ? match[0] : "";
}

function RenameModal({ files, ...props }: { files: File[]; } & any) {
    const [names, setNames] = useState(() => files.map((file, index) => expand(settings.store.pattern, file.name, index)));

    function upload() {
        const channel = getCurrentChannel();
        if (!channel) return;

        const renamed = files.map((file, index) => {
            let name = names[index].trim() || file.name;
            if (settings.store.keepExtension && !name.toLowerCase().endsWith(extensionOf(file.name).toLowerCase())) {
                name += extensionOf(file.name);
            }
            return new File([file], name, { type: file.type });
        });

        props.onClose();
        setTimeout(() => UploadHandler.promptToUpload(renamed, channel, DraftType.ChannelMessage), 10);
    }

    return (
        <XbtModal
            props={props}
            title="Name your uploads"
            subtitle="AnonymiseFileNames scrambles them. This one lets you choose"
        >
            <div className="xbt-list">
                {files.map((file, index) => (
                    <div className="xbt-row" key={file.name + index}>
                        <div className="xbt-row-body">
                            <TextInput
                                value={names[index]}
                                onChange={value => setNames(current => current.map((name, i) => i === index ? value : name))}
                            />
                            <div className="xbt-row-meta">
                                was {file.name} - {Math.round(file.size / 1024)} KB
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: 12 }}>
                <Button onClick={upload}>Upload</Button>
            </div>
        </XbtModal>
    );
}

function pick() {
    /*
     * A file input rather than a hook into Discord's own upload path. The upload pipeline
     * builds its CloudUpload objects from the File the moment it is dropped, and there is
     * no supported point between the two where a name can be swapped without patching
     * minified internals that move every few releases.
     */
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;

    input.onchange = () => {
        const files = [...(input.files ?? [])];
        if (files.length) openModal(props => <RenameModal {...props} files={files} />);
    };

    input.click();
}

const renderButton: ChatBarButtonFactory = ({ isMainChat }) =>
    isMainChat
        ? <ChatBarButton tooltip="Upload with a different name" onClick={pick}><PencilIcon /></ChatBarButton>
        : null;

export default definePlugin({
    name: "UploadRenamer",
    description: "Pick files through the chat bar and name them yourself before they upload, with a pattern if you want one",
    tags: ["Utility", "Privacy"],
    searchTerms: ["upload", "rename", "filename", "attachment", "file"],
    authors: [Devs.Xbtcord],
    settings,

    chatBarButton: {
        render: renderButton,
        icon: PencilIcon
    }
});
