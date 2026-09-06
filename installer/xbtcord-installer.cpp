/*
 * Xbtcord installer
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * A single-file Win32 GUI installer with no runtime dependencies beyond what ships with
 * Windows. It does the same things the PowerShell script does, and does them the same way,
 * so the two remain interchangeable:
 *
 *   1. Find every Discord branch installed for this user.
 *   2. Move `resources/app.asar` aside to `_app.asar` and put a folder in its place whose
 *      index.js requires Xbtcord's patcher. The patcher then loads the real Discord out of
 *      `_app.asar`.
 *   3. Undo exactly that, by renaming the file back.
 *
 * No administrator rights are needed: Discord installs into the user's own LocalAppData.
 * Nothing outside %LOCALAPPDATA% is written and nothing is registered with the system, so
 * "uninstall" really is just a rename.
 */

#define WIN32_LEAN_AND_MEAN
#define _CRT_SECURE_NO_WARNINGS

// MinGW's -municode already defines both; MSVC needs them stated.
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif

#include <windows.h>
#include <commctrl.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <tlhelp32.h>
#include <uxtheme.h>
#include <winhttp.h>
#include <objbase.h>

#include <cstdarg>
#include <cstdlib>
#include <cwctype>
#include <string>
#include <vector>
#include <algorithm>
#include <memory>

#include "resource.h"

#ifdef _MSC_VER
#pragma comment(lib, "comctl32.lib")
#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "uxtheme.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")
#endif

// ---------------------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------------------

/*
 * Which GitHub repository to pull builds from.
 *
 * The build script writes repo_config.h into the output directory and puts it on the
 * include path, so CI can bake in the repository it is running in and the exe a fork
 * produces downloads that fork's releases with nobody editing a constant.
 *
 * It arrives as a generated header rather than a -D flag because the value has to keep its
 * quotes, and a `-DXBT_REPO=L"owner/repo"` loses them somewhere between PowerShell, cmd and
 * the compiler - which fails as a baffling "'Lowner' was not declared in this scope".
 *
 * Building without one is fine: the placeholder makes the exe say plainly that it has no
 * release to fetch from, instead of 404ing at the user.
 */
#if defined(__has_include)
#if __has_include("repo_config.h")
#include "repo_config.h"
#endif
#endif

#ifndef XBT_REPO
#define XBT_REPO L"OWNER/REPO"
#endif

static const wchar_t* kRepo = XBT_REPO;
static const wchar_t* kPlaceholderRepo = L"OWNER/REPO";

/*
 * The files a patched Discord actually loads.
 *
 * patcher.js is the entry point; it pulls in the other three at runtime. The build also
 * emits vesktop and web variants plus source maps, and none of those are needed here -
 * downloading them would roughly quadruple the install for no benefit.
 */
static const wchar_t* kPayload[] = {
    L"patcher.js",
    L"preload.js",
    L"renderer.js",
    L"renderer.css"
};
static const int kPayloadCount = 4;

static const wchar_t* kBranches[] = {
    L"Discord",
    L"DiscordPTB",
    L"DiscordCanary",
    L"DiscordDevelopment"
};
static const int kBranchCount = 4;

// Palette, matching the Xbtcord mark.
static const COLORREF kBg       = RGB(0x1b, 0x1c, 0x20);
static const COLORREF kPanel    = RGB(0x26, 0x27, 0x2d);
static const COLORREF kRow      = RGB(0x24, 0x25, 0x2a);
static const COLORREF kRowHot   = RGB(0x2e, 0x30, 0x37);
static const COLORREF kText     = RGB(0xe4, 0xe5, 0xe9);
static const COLORREF kMuted    = RGB(0x96, 0x9a, 0xa6);
static const COLORREF kAccent   = RGB(0xa7, 0x8b, 0xfa);
static const COLORREF kDanger   = RGB(0xed, 0x71, 0x7a);

// Control ids.
#define ID_INSTALL   1001
#define ID_UNINSTALL 1002
#define ID_PROGRESS  1003
#define ID_STATUS    1004
#define ID_FIRSTROW  1100

// Worker -> UI messages.
#define WM_XBT_STATUS   (WM_APP + 1)  // wParam: percent, or -1 for "this is an error"
#define WM_XBT_FINISHED (WM_APP + 2)  // wParam: 1 ok / 0 failed

// ---------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------

static std::wstring Format(const wchar_t* fmt, ...) {
    wchar_t buffer[1024];
    va_list args;
    va_start(args, fmt);
    int written = vswprintf(buffer, sizeof(buffer) / sizeof(buffer[0]), fmt, args);
    va_end(args);
    if (written < 0) return L"";
    return std::wstring(buffer);
}

static std::wstring EnvVar(const wchar_t* name) {
    wchar_t buffer[MAX_PATH * 2];
    DWORD written = GetEnvironmentVariableW(name, buffer, ARRAYSIZE(buffer));
    if (written == 0 || written >= ARRAYSIZE(buffer)) return L"";
    return std::wstring(buffer);
}

static std::wstring PathJoin(const std::wstring& a, const std::wstring& b) {
    if (a.empty()) return b;
    if (b.empty()) return a;
    if (a.back() == L'\\' || a.back() == L'/') return a + b;
    return a + L"\\" + b;
}

static bool PathExists(const std::wstring& path) {
    return GetFileAttributesW(path.c_str()) != INVALID_FILE_ATTRIBUTES;
}

static bool IsDirectory(const std::wstring& path) {
    DWORD attributes = GetFileAttributesW(path.c_str());
    return attributes != INVALID_FILE_ATTRIBUTES && (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
}

static bool IsFile(const std::wstring& path) {
    DWORD attributes = GetFileAttributesW(path.c_str());
    return attributes != INVALID_FILE_ATTRIBUTES && (attributes & FILE_ATTRIBUTE_DIRECTORY) == 0;
}

/** mkdir -p. Walks the path creating each missing component. */
static bool CreateDirectoryTree(const std::wstring& path) {
    if (path.empty()) return false;
    if (IsDirectory(path)) return true;

    for (size_t i = 3; i <= path.size(); i++) {
        if (i == path.size() || path[i] == L'\\') {
            std::wstring part = path.substr(0, i);
            if (!part.empty() && !IsDirectory(part)) {
                if (!CreateDirectoryW(part.c_str(), nullptr) && GetLastError() != ERROR_ALREADY_EXISTS) {
                    return false;
                }
            }
        }
    }
    return IsDirectory(path);
}

/**
 * rm -rf.
 *
 * Written out rather than calling SHFileOperation, which wants a double-null terminated
 * path, pops UI on failure unless told not to, and has a habit of routing things through
 * the Recycle Bin. This is a directory we created; deleting it should be quiet and exact.
 */
static bool RemoveTree(const std::wstring& path) {
    if (!PathExists(path)) return true;

    if (IsFile(path)) {
        SetFileAttributesW(path.c_str(), FILE_ATTRIBUTE_NORMAL);
        return DeleteFileW(path.c_str()) != 0;
    }

    WIN32_FIND_DATAW found;
    HANDLE handle = FindFirstFileW(PathJoin(path, L"*").c_str(), &found);
    if (handle != INVALID_HANDLE_VALUE) {
        do {
            std::wstring name = found.cFileName;
            if (name == L"." || name == L"..") continue;
            RemoveTree(PathJoin(path, name));
        } while (FindNextFileW(handle, &found));
        FindClose(handle);
    }

    SetFileAttributesW(path.c_str(), FILE_ATTRIBUTE_NORMAL);
    return RemoveDirectoryW(path.c_str()) != 0;
}

static bool WriteWholeFile(const std::wstring& path, const void* data, size_t size) {
    HANDLE file = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr,
                              CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;

    bool ok = true;
    const BYTE* cursor = static_cast<const BYTE*>(data);
    size_t remaining = size;

    while (remaining > 0) {
        DWORD chunk = static_cast<DWORD>(remaining > 0x1000000 ? 0x1000000 : remaining);
        DWORD written = 0;
        if (!WriteFile(file, cursor, chunk, &written, nullptr) || written == 0) { ok = false; break; }
        cursor += written;
        remaining -= written;
    }

    CloseHandle(file);
    if (!ok) DeleteFileW(path.c_str());
    return ok;
}

static std::string ToUtf8(const std::wstring& text) {
    if (text.empty()) return std::string();
    int size = WideCharToMultiByte(CP_UTF8, 0, text.c_str(), (int)text.size(), nullptr, 0, nullptr, nullptr);
    std::string out((size_t)size, '\0');
    WideCharToMultiByte(CP_UTF8, 0, text.c_str(), (int)text.size(), &out[0], size, nullptr, nullptr);
    return out;
}

static std::wstring FromUtf8(const std::string& text) {
    if (text.empty()) return std::wstring();
    int size = MultiByteToWideChar(CP_UTF8, 0, text.c_str(), (int)text.size(), nullptr, 0);
    std::wstring out((size_t)size, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, text.c_str(), (int)text.size(), &out[0], size);
    return out;
}

/** Writes UTF-8 with no BOM - Node reads these, and a BOM in index.js breaks require(). */
static bool WriteUtf8File(const std::wstring& path, const std::string& text) {
    return WriteWholeFile(path, text.data(), text.size());
}

/** Where this .exe lives, so an adjacent dist/ can be used instead of downloading. */
static std::wstring ExeDirectory() {
    wchar_t buffer[MAX_PATH];
    DWORD written = GetModuleFileNameW(nullptr, buffer, ARRAYSIZE(buffer));
    if (written == 0 || written >= ARRAYSIZE(buffer)) return L"";
    std::wstring path(buffer, written);
    size_t slash = path.find_last_of(L'\\');
    return slash == std::wstring::npos ? L"" : path.substr(0, slash);
}

// ---------------------------------------------------------------------------------------
// Finding Discord
// ---------------------------------------------------------------------------------------

struct DiscordInstall {
    std::wstring branch;     // "Discord", "DiscordPTB", ...
    std::wstring root;       // %LOCALAPPDATA%\Discord
    std::wstring version;    // "1.0.9184"
    std::wstring resources;  // ...\app-1.0.9184\resources
    bool patched = false;
    bool selected = true;
};

/** Compares "1.0.9184" style versions numerically, so app-1.0.10 sorts above app-1.0.9. */
static bool VersionLess(const std::wstring& a, const std::wstring& b) {
    size_t i = 0, j = 0;
    while (i < a.size() || j < b.size()) {
        unsigned long left = 0, right = 0;
        while (i < a.size() && iswdigit(a[i])) left = left * 10 + (unsigned long)(a[i++] - L'0');
        while (j < b.size() && iswdigit(b[j])) right = right * 10 + (unsigned long)(b[j++] - L'0');
        if (left != right) return left < right;
        while (i < a.size() && !iswdigit(a[i])) i++;
        while (j < b.size() && !iswdigit(b[j])) j++;
    }
    return false;
}

static std::vector<DiscordInstall> FindDiscordInstalls() {
    std::vector<DiscordInstall> found;
    std::wstring localAppData = EnvVar(L"LOCALAPPDATA");
    if (localAppData.empty()) return found;

    for (int b = 0; b < kBranchCount; b++) {
        std::wstring root = PathJoin(localAppData, kBranches[b]);
        if (!IsDirectory(root)) continue;

        // Discord keeps every version it has ever downloaded. The newest app-* folder is
        // the one Update.exe actually launches, so that is the only one worth patching.
        std::wstring bestVersion;
        std::wstring bestPath;

        WIN32_FIND_DATAW entry;
        HANDLE handle = FindFirstFileW(PathJoin(root, L"app-*").c_str(), &entry);
        if (handle == INVALID_HANDLE_VALUE) continue;

        do {
            if ((entry.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0) continue;
            std::wstring name = entry.cFileName;
            if (name.rfind(L"app-", 0) != 0) continue;

            std::wstring version = name.substr(4);
            if (bestVersion.empty() || VersionLess(bestVersion, version)) {
                bestVersion = version;
                bestPath = PathJoin(root, name);
            }
        } while (FindNextFileW(handle, &entry));
        FindClose(handle);

        if (bestPath.empty()) continue;

        std::wstring resources = PathJoin(bestPath, L"resources");
        if (!IsDirectory(resources)) continue;

        DiscordInstall install;
        install.branch = kBranches[b];
        install.root = root;
        install.version = bestVersion;
        install.resources = resources;
        // A folder where app.asar should be is a mod - ours, or somebody else's.
        install.patched = IsDirectory(PathJoin(resources, L"app.asar"));
        found.push_back(install);
    }

    return found;
}

// ---------------------------------------------------------------------------------------
// Stopping and starting Discord
// ---------------------------------------------------------------------------------------

static bool StopBranch(const std::wstring& branch) {
    std::wstring exeName = branch + L".exe";
    bool killedAny = false;

    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) return false;

    PROCESSENTRY32W entry;
    entry.dwSize = sizeof(entry);

    if (Process32FirstW(snapshot, &entry)) {
        do {
            if (_wcsicmp(entry.szExeFile, exeName.c_str()) != 0) continue;

            HANDLE process = OpenProcess(PROCESS_TERMINATE | SYNCHRONIZE, FALSE, entry.th32ProcessID);
            if (!process) continue;

            if (TerminateProcess(process, 0)) {
                killedAny = true;
                WaitForSingleObject(process, 5000);
            }
            CloseHandle(process);
        } while (Process32NextW(snapshot, &entry));
    }

    CloseHandle(snapshot);
    return killedAny;
}

static void StartBranch(const DiscordInstall& install) {
    // Update.exe --processStart launches whichever version is current, which keeps working
    // if Discord updates itself between now and the next launch. Running the versioned exe
    // directly would pin it to today's build.
    std::wstring updater = PathJoin(install.root, L"Update.exe");
    if (!IsFile(updater)) return;

    std::wstring args = Format(L"\"%s\" --processStart \"%s.exe\"", updater.c_str(), install.branch.c_str());

    STARTUPINFOW startup;
    ZeroMemory(&startup, sizeof(startup));
    startup.cb = sizeof(startup);

    PROCESS_INFORMATION info;
    ZeroMemory(&info, sizeof(info));

    std::vector<wchar_t> mutableArgs(args.begin(), args.end());
    mutableArgs.push_back(L'\0');

    if (CreateProcessW(updater.c_str(), mutableArgs.data(), nullptr, nullptr, FALSE,
                       CREATE_NO_WINDOW, nullptr, install.root.c_str(), &startup, &info)) {
        CloseHandle(info.hThread);
        CloseHandle(info.hProcess);
    }
}

// ---------------------------------------------------------------------------------------
// Downloading
// ---------------------------------------------------------------------------------------

struct HttpResult {
    bool ok = false;
    DWORD status = 0;
    std::vector<BYTE> body;
    std::wstring error;
};

static HttpResult HttpGet(const std::wstring& host, const std::wstring& path, bool jsonAccept) {
    HttpResult result;

    HINTERNET session = WinHttpOpen(L"XbtcordInstaller/1.0",
                                    WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                    WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!session) {
        result.error = L"Couldn't start a network session.";
        return result;
    }

    // Release downloads redirect to a CDN host, and WinHTTP only follows that if allowed.
    DWORD redirectPolicy = WINHTTP_OPTION_REDIRECT_POLICY_DISALLOW_HTTPS_TO_HTTP;
    WinHttpSetOption(session, WINHTTP_OPTION_REDIRECT_POLICY, &redirectPolicy, sizeof(redirectPolicy));
    WinHttpSetTimeouts(session, 30000, 30000, 30000, 30000);

    HINTERNET connection = WinHttpConnect(session, host.c_str(), INTERNET_DEFAULT_HTTPS_PORT, 0);
    if (!connection) {
        result.error = L"Couldn't reach " + host + L".";
        WinHttpCloseHandle(session);
        return result;
    }

    HINTERNET request = WinHttpOpenRequest(connection, L"GET", path.c_str(), nullptr,
                                           WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES,
                                           WINHTTP_FLAG_SECURE);
    if (!request) {
        result.error = L"Couldn't build the request.";
        WinHttpCloseHandle(connection);
        WinHttpCloseHandle(session);
        return result;
    }

    // GitHub's API rejects requests without a User-Agent, and wants an explicit Accept.
    std::wstring headers = L"User-Agent: XbtcordInstaller\r\n";
    if (jsonAccept) headers += L"Accept: application/vnd.github+json\r\n";

    BOOL sent = WinHttpSendRequest(request, headers.c_str(), (DWORD)-1,
                                   WINHTTP_NO_REQUEST_DATA, 0, 0, 0)
                && WinHttpReceiveResponse(request, nullptr);

    if (!sent) {
        result.error = L"The request failed. Check your internet connection.";
        WinHttpCloseHandle(request);
        WinHttpCloseHandle(connection);
        WinHttpCloseHandle(session);
        return result;
    }

    DWORD statusSize = sizeof(result.status);
    WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        WINHTTP_HEADER_NAME_BY_INDEX, &result.status, &statusSize, WINHTTP_NO_HEADER_INDEX);

    for (;;) {
        DWORD available = 0;
        if (!WinHttpQueryDataAvailable(request, &available) || available == 0) break;

        size_t offset = result.body.size();
        result.body.resize(offset + available);

        DWORD read = 0;
        if (!WinHttpReadData(request, result.body.data() + offset, available, &read)) {
            result.body.resize(offset);
            break;
        }
        result.body.resize(offset + read);
    }

    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connection);
    WinHttpCloseHandle(session);

    result.ok = result.status >= 200 && result.status < 300;
    if (!result.ok && result.error.empty()) {
        result.error = Format(L"The server answered %lu.", result.status);
    }
    return result;
}

/**
 * Pulls "tag_name" out of a GitHub release response.
 *
 * A hand-rolled scan rather than a JSON parser: this reads exactly one string field from a
 * response whose shape GitHub has kept stable for a decade, and a parser would be hundreds
 * of lines to make one label prettier. If the field ever moves, the download falls back to
 * the /releases/latest/download/ path and nothing breaks.
 */
static std::wstring ExtractTagName(const std::vector<BYTE>& body) {
    if (body.empty()) return L"";

    std::string text(reinterpret_cast<const char*>(body.data()), body.size());
    const std::string key = "\"tag_name\"";

    size_t at = text.find(key);
    if (at == std::string::npos) return L"";

    at = text.find(':', at + key.size());
    if (at == std::string::npos) return L"";

    at = text.find('"', at);
    if (at == std::string::npos) return L"";

    size_t end = text.find('"', at + 1);
    if (end == std::string::npos) return L"";

    return FromUtf8(text.substr(at + 1, end - at - 1));
}

// ---------------------------------------------------------------------------------------
// Patching
// ---------------------------------------------------------------------------------------

/**
 * Puts a loader folder where app.asar should be.
 *
 * Discord's Electron resolves `resources/app.asar` without caring whether it is an archive
 * or a directory, so a directory containing a package.json and an index.js is loaded as the
 * app. That index.js requires the patcher, and the patcher hands control back to the real
 * Discord in `_app.asar`. It is the same shape Vencord and BetterDiscord use, which is why
 * undoing it is one rename.
 */
static bool ApplyPatch(const DiscordInstall& install, const std::wstring& patcherPath, std::wstring& error) {
    std::wstring asar = PathJoin(install.resources, L"app.asar");
    std::wstring original = PathJoin(install.resources, L"_app.asar");

    // A folder here means a previous injection. Ours or another mod's, it goes.
    if (IsDirectory(asar) && !RemoveTree(asar)) {
        error = L"Couldn't remove the previous injection. Is Discord still running?";
        return false;
    }

    // A real app.asar sitting next to an existing _app.asar means Discord replaced the file
    // after a previous install. The file is the newer Discord, so it wins.
    if (IsFile(asar)) {
        if (PathExists(original) && !RemoveTree(original)) {
            error = L"Couldn't clear the old _app.asar.";
            return false;
        }
        if (!MoveFileW(asar.c_str(), original.c_str())) {
            error = L"Couldn't move app.asar aside. Close Discord completely and try again.";
            return false;
        }
    }

    if (!IsFile(original)) {
        error = L"No app.asar in " + install.branch + L" - that doesn't look like a Discord install.";
        return false;
    }

    if (!CreateDirectoryTree(asar)) {
        error = L"Couldn't create the loader folder.";
        return false;
    }

    // Backslashes have to survive into a JavaScript string literal.
    std::string escaped;
    std::string utf8Path = ToUtf8(patcherPath);
    for (size_t i = 0; i < utf8Path.size(); i++) {
        char c = utf8Path[i];
        if (c == '\\' || c == '"') escaped.push_back('\\');
        escaped.push_back(c);
    }

    if (!WriteUtf8File(PathJoin(asar, L"index.js"), "require(\"" + escaped + "\");\n") ||
        !WriteUtf8File(PathJoin(asar, L"package.json"), "{\"name\":\"discord\",\"main\":\"index.js\"}\n")) {
        error = L"Couldn't write the loader files.";
        return false;
    }

    return true;
}

static bool RemovePatch(const DiscordInstall& install, bool& wasPatched) {
    std::wstring asar = PathJoin(install.resources, L"app.asar");
    std::wstring original = PathJoin(install.resources, L"_app.asar");

    wasPatched = false;

    if (IsDirectory(asar)) {
        if (!RemoveTree(asar)) return false;
        wasPatched = true;
    }

    if (IsFile(original) && !PathExists(asar)) {
        if (!MoveFileW(original.c_str(), asar.c_str())) return false;
        wasPatched = true;
        return true;
    }

    return IsFile(asar);
}

// ---------------------------------------------------------------------------------------
// Shortcut icons
// ---------------------------------------------------------------------------------------
//
// Discord.exe's own embedded icon is deliberately left alone. Rewriting resources inside a
// signed binary invalidates its signature, and Discord's updater replaces the exe on the
// next update anyway - so it would break something real and then quietly undo itself.
// Shortcuts are the part of "the icon on my PC" that is genuinely the user's to change,
// and changing them is reversible.

static std::vector<std::wstring> FindShortcuts() {
    std::vector<std::wstring> found;
    std::vector<std::wstring> candidates;

    wchar_t desktop[MAX_PATH];
    if (SUCCEEDED(SHGetFolderPathW(nullptr, CSIDL_DESKTOPDIRECTORY, nullptr, 0, desktop))) {
        candidates.push_back(PathJoin(desktop, L"Discord.lnk"));
    }

    std::wstring appData = EnvVar(L"APPDATA");
    if (!appData.empty()) {
        candidates.push_back(PathJoin(appData, L"Microsoft\\Windows\\Start Menu\\Programs\\Discord Inc\\Discord.lnk"));
        candidates.push_back(PathJoin(appData, L"Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar\\Discord.lnk"));
    }

    // OneDrive-redirected desktops are common enough to be worth checking explicitly.
    std::wstring oneDrive = EnvVar(L"OneDrive");
    if (!oneDrive.empty()) {
        candidates.push_back(PathJoin(oneDrive, L"Desktop\\Discord.lnk"));
    }

    for (size_t i = 0; i < candidates.size(); i++) {
        if (IsFile(candidates[i]) &&
            std::find(found.begin(), found.end(), candidates[i]) == found.end()) {
            found.push_back(candidates[i]);
        }
    }
    return found;
}

static std::wstring XbtcordFolder() {
    return PathJoin(EnvVar(L"LOCALAPPDATA"), L"Xbtcord");
}

static std::wstring IconBackupPath() {
    return PathJoin(XbtcordFolder(), L"shortcut-icons.txt");
}

/** Tells Explorer to re-read shortcut icons, so the change shows without a sign-out. */
static void RefreshIconCache() {
    SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
}

static void SetShortcutIcons(const std::wstring& iconPath) {
    std::vector<std::wstring> shortcuts = FindShortcuts();
    if (shortcuts.empty()) return;

    std::string backup;

    for (size_t i = 0; i < shortcuts.size(); i++) {
        const std::wstring& path = shortcuts[i];

        IShellLinkW* link = nullptr;
        if (FAILED(CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER,
                                    IID_IShellLinkW, reinterpret_cast<void**>(&link)))) {
            continue;
        }

        IPersistFile* file = nullptr;
        if (SUCCEEDED(link->QueryInterface(IID_IPersistFile, reinterpret_cast<void**>(&file)))) {
            if (SUCCEEDED(file->Load(path.c_str(), STGM_READWRITE))) {
                wchar_t previous[MAX_PATH] = L"";
                int previousIndex = 0;

                if (FAILED(link->GetIconLocation(previous, ARRAYSIZE(previous), &previousIndex))) {
                    previous[0] = L'\0';
                }

                /*
                 * Never record our own icon as the thing to restore.
                 *
                 * Installing twice would otherwise back up the icon the first install set,
                 * and then uninstalling would "restore" a path it is about to delete -
                 * leaving a shortcut pointing at a file that no longer exists, which
                 * Explorer draws as a blank page. When there is nothing trustworthy to go
                 * back to, the shortcut's own target is the honest answer: that is where
                 * Windows gets a Discord shortcut's icon from by default anyway.
                 */
                bool pointsAtUs = _wcsicmp(previous, iconPath.c_str()) == 0;
                if (previous[0] == L'\0' || pointsAtUs) {
                    wchar_t target[MAX_PATH] = L"";
                    WIN32_FIND_DATAW unused;
                    if (SUCCEEDED(link->GetPath(target, ARRAYSIZE(target), &unused, SLGP_RAWPATH)) && target[0]) {
                        // lstrcpynW rather than wcscpy_s: always present, no _s feature test.
                        lstrcpynW(previous, target, ARRAYSIZE(previous));
                        previousIndex = 0;
                    }
                }

                // Remember what it pointed at, so uninstalling can put it back.
                if (previous[0]) {
                    backup += ToUtf8(path) + "\t" + ToUtf8(previous) + "\t" +
                              std::to_string(previousIndex) + "\n";
                }

                if (SUCCEEDED(link->SetIconLocation(iconPath.c_str(), 0))) {
                    file->Save(path.c_str(), TRUE);
                }
            }
            file->Release();
        }
        link->Release();
    }

    if (!backup.empty()) WriteUtf8File(IconBackupPath(), backup);
    RefreshIconCache();
}

static void RestoreShortcutIcons() {
    std::wstring backupPath = IconBackupPath();
    if (!IsFile(backupPath)) return;

    std::string contents;
    HANDLE handle = CreateFileW(backupPath.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr,
                                OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (handle != INVALID_HANDLE_VALUE) {
        LARGE_INTEGER size;
        if (GetFileSizeEx(handle, &size) && size.QuadPart > 0 && size.QuadPart < 1024 * 1024) {
            contents.resize((size_t)size.QuadPart);
            DWORD read = 0;
            if (ReadFile(handle, &contents[0], (DWORD)contents.size(), &read, nullptr)) contents.resize(read);
            else contents.clear();
        }
        CloseHandle(handle);
    }

    size_t start = 0;
    while (start < contents.size()) {
        size_t lineEnd = contents.find('\n', start);
        if (lineEnd == std::string::npos) lineEnd = contents.size();

        std::string line = contents.substr(start, lineEnd - start);
        start = lineEnd + 1;

        size_t firstTab = line.find('\t');
        if (firstTab == std::string::npos) continue;
        size_t secondTab = line.find('\t', firstTab + 1);
        if (secondTab == std::string::npos) continue;

        std::wstring shortcutPath = FromUtf8(line.substr(0, firstTab));
        std::wstring iconPath = FromUtf8(line.substr(firstTab + 1, secondTab - firstTab - 1));
        int iconIndex = atoi(line.c_str() + secondTab + 1);

        if (!IsFile(shortcutPath)) continue;

        IShellLinkW* link = nullptr;
        if (FAILED(CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER,
                                    IID_IShellLinkW, reinterpret_cast<void**>(&link)))) {
            continue;
        }

        IPersistFile* file = nullptr;
        if (SUCCEEDED(link->QueryInterface(IID_IPersistFile, reinterpret_cast<void**>(&file)))) {
            if (SUCCEEDED(file->Load(shortcutPath.c_str(), STGM_READWRITE))) {
                // A recorded icon that has since gone would leave a blank shortcut, so fall
                // back to the target exe, which is where the icon came from originally.
                if (!IsFile(iconPath)) {
                    wchar_t target[MAX_PATH] = L"";
                    WIN32_FIND_DATAW unused;
                    if (SUCCEEDED(link->GetPath(target, ARRAYSIZE(target), &unused, SLGP_RAWPATH)) && target[0]) {
                        iconPath = target;
                        iconIndex = 0;
                    }
                }

                link->SetIconLocation(iconPath.c_str(), iconIndex);
                file->Save(shortcutPath.c_str(), TRUE);
            }
            file->Release();
        }
        link->Release();
    }

    DeleteFileW(backupPath.c_str());
    RefreshIconCache();
}

/** Drops the bundled .ico on disk so shortcuts have a real file to point at. */
static bool WriteIconFile(const std::wstring& path) {
    HRSRC found = FindResourceW(nullptr, MAKEINTRESOURCEW(IDR_ICOFILE), RT_RCDATA);
    if (!found) return false;

    HGLOBAL loaded = LoadResource(nullptr, found);
    if (!loaded) return false;

    void* data = LockResource(loaded);
    DWORD size = SizeofResource(nullptr, found);
    if (!data || size == 0) return false;

    return WriteWholeFile(path, data, size);
}

// ---------------------------------------------------------------------------------------
// The work itself
// ---------------------------------------------------------------------------------------

enum class Job { Install, Uninstall };

struct WorkerContext {
    HWND window;
    Job job;
    std::vector<DiscordInstall> installs;
};

static void Report(HWND window, int percent, const std::wstring& text) {
    // The UI thread takes ownership of the string and deletes it.
    PostMessageW(window, WM_XBT_STATUS, (WPARAM)percent,
                 (LPARAM)(new std::wstring(text)));
}

static std::wstring InstallDirectory() {
    return PathJoin(XbtcordFolder(), L"dist");
}

/**
 * Gets the payload into place, from a neighbouring dist/ if there is one, otherwise from
 * the latest GitHub release.
 *
 * The local path exists so a build straight out of `pnpm build` can be installed without a
 * release existing at all, which is also what makes this testable end to end.
 */
static bool StageFiles(HWND window, std::wstring& error) {
    std::wstring target = InstallDirectory();
    std::wstring localDist = PathJoin(ExeDirectory(), L"dist");

    if (!RemoveTree(target) || !CreateDirectoryTree(target)) {
        error = L"Couldn't prepare " + target;
        return false;
    }

    bool useLocal = IsDirectory(localDist) && IsFile(PathJoin(localDist, L"patcher.js"));

    if (useLocal) {
        Report(window, 10, L"Using the build sitting next to this installer...");

        for (int i = 0; i < kPayloadCount; i++) {
            std::wstring from = PathJoin(localDist, kPayload[i]);
            std::wstring to = PathJoin(target, kPayload[i]);
            if (!CopyFileW(from.c_str(), to.c_str(), FALSE)) {
                error = Format(L"Couldn't copy %s from the local build.", kPayload[i]);
                return false;
            }
            Report(window, 10 + (i + 1) * 70 / kPayloadCount, Format(L"Copied %s", kPayload[i]));
        }
        return true;
    }

    if (wcscmp(kRepo, kPlaceholderRepo) == 0) {
        error = L"This build has no release to download from, and there is no dist folder "
                L"next to it. Put the exe beside a built dist/, or use an installer from CI.";
        return false;
    }

    Report(window, 5, L"Looking up the latest release...");

    HttpResult release = HttpGet(L"api.github.com", Format(L"/repos/%s/releases/latest", kRepo), true);
    if (!release.ok && release.status == 404) {
        error = Format(L"%s has no published releases yet.", kRepo);
        return false;
    }

    std::wstring tag = release.ok ? ExtractTagName(release.body) : L"";

    for (int i = 0; i < kPayloadCount; i++) {
        Report(window, 10 + i * 70 / kPayloadCount, Format(L"Downloading %s...", kPayload[i]));

        std::wstring path = tag.empty()
            ? Format(L"/%s/releases/latest/download/%s", kRepo, kPayload[i])
            : Format(L"/%s/releases/download/%s/%s", kRepo, tag.c_str(), kPayload[i]);

        HttpResult file = HttpGet(L"github.com", path, false);
        if (!file.ok || file.body.empty()) {
            error = Format(L"Couldn't download %s. %s", kPayload[i], file.error.c_str());
            return false;
        }

        if (!WriteWholeFile(PathJoin(target, kPayload[i]), file.body.data(), file.body.size())) {
            error = Format(L"Couldn't save %s.", kPayload[i]);
            return false;
        }
    }

    return true;
}

static DWORD WINAPI WorkerMain(LPVOID parameter) {
    std::unique_ptr<WorkerContext> context(static_cast<WorkerContext*>(parameter));
    HWND window = context->window;

    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    bool ok = false;
    std::wstring error;
    std::vector<DiscordInstall> chosen;
    std::vector<DiscordInstall> running;

    for (size_t i = 0; i < context->installs.size(); i++) {
        if (context->installs[i].selected) chosen.push_back(context->installs[i]);
    }

    for (;;) {
        if (chosen.empty()) { error = L"Nothing selected."; break; }

        Report(window, 2, L"Closing Discord...");
        for (size_t i = 0; i < chosen.size(); i++) {
            if (StopBranch(chosen[i].branch)) running.push_back(chosen[i]);
        }
        // Discord's files stay locked for a moment after its processes go.
        if (!running.empty()) Sleep(3000);

        if (context->job == Job::Uninstall) {
            Report(window, 30, L"Putting Discord back...");

            int removed = 0;
            for (size_t i = 0; i < chosen.size(); i++) {
                bool wasPatched = false;
                if (RemovePatch(chosen[i], wasPatched) && wasPatched) removed++;
            }

            Report(window, 70, L"Restoring the shortcut icons...");
            RestoreShortcutIcons();

            Report(window, 85, L"Cleaning up...");
            RemoveTree(InstallDirectory());
            DeleteFileW(PathJoin(XbtcordFolder(), L"xbtcord.ico").c_str());

            Report(window, 100, removed > 0
                ? Format(L"Removed from %d install%s. Your settings are still in %%APPDATA%%\\Xbtcord.",
                         removed, removed == 1 ? L"" : L"s")
                : L"Nothing was patched, so there was nothing to undo.");
            ok = true;
            break;
        }

        if (!StageFiles(window, error)) break;

        std::wstring patcher = PathJoin(InstallDirectory(), L"patcher.js");
        if (!IsFile(patcher)) {
            error = L"The files arrived but patcher.js isn't among them.";
            break;
        }

        Report(window, 88, L"Patching Discord...");
        bool patchedAll = true;
        for (size_t i = 0; i < chosen.size(); i++) {
            if (!ApplyPatch(chosen[i], patcher, error)) { patchedAll = false; break; }
        }
        if (!patchedAll) break;

        Report(window, 96, L"Setting the icon...");
        std::wstring icon = PathJoin(XbtcordFolder(), L"xbtcord.ico");
        if (WriteIconFile(icon)) SetShortcutIcons(icon);

        Report(window, 100, Format(L"Done - %d install%s patched. Discord will start with Xbtcord from now on.",
                                   (int)chosen.size(), chosen.size() == 1 ? L"" : L"s"));
        ok = true;
        break;
    }

    if (!ok && !error.empty()) Report(window, -1, error);

    for (size_t i = 0; i < running.size(); i++) StartBranch(running[i]);

    CoUninitialize();
    PostMessageW(window, WM_XBT_FINISHED, ok ? 1 : 0, 0);
    return 0;
}

// ---------------------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------------------

struct AppState {
    std::vector<DiscordInstall> installs;
    std::vector<HWND> rows;
    HWND install = nullptr;
    HWND uninstall = nullptr;
    HWND progress = nullptr;
    HWND status = nullptr;
    HFONT fontBody = nullptr;
    HFONT fontTitle = nullptr;
    HFONT fontSmall = nullptr;
    HBRUSH brushBg = nullptr;
    HBRUSH brushPanel = nullptr;
    HICON icon = nullptr;
    bool busy = false;
    bool failed = false;
    int contentHeight = 0;
    int dpi = 96;
};

static AppState g;

static int Scaled(int value) { return MulDiv(value, g.dpi, 96); }

static HFONT MakeFont(int points, int weight) {
    return CreateFontW(-MulDiv(points, g.dpi, 72), 0, 0, 0, weight, FALSE, FALSE, FALSE,
                       DEFAULT_CHARSET, OUT_TT_PRECIS, CLIP_DEFAULT_PRECIS,
                       CLEARTYPE_QUALITY, VARIABLE_PITCH, L"Segoe UI");
}

static void SetStatus(const std::wstring& text, bool isError) {
    g.failed = isError;
    SetWindowTextW(g.status, text.c_str());
    InvalidateRect(g.status, nullptr, TRUE);
}

static void SetBusy(bool busy) {
    g.busy = busy;
    EnableWindow(g.install, !busy);
    EnableWindow(g.uninstall, !busy);
    for (size_t i = 0; i < g.rows.size(); i++) EnableWindow(g.rows[i], !busy);
}

static void RefreshRowLabels() {
    for (size_t i = 0; i < g.rows.size() && i < g.installs.size(); i++) {
        InvalidateRect(g.rows[i], nullptr, TRUE);
    }
    if (g.install) {
        bool anyPatched = false;
        for (size_t i = 0; i < g.installs.size(); i++) anyPatched = anyPatched || g.installs[i].patched;
        SetWindowTextW(g.install, anyPatched ? L"Reinstall" : L"Install");
        InvalidateRect(g.install, nullptr, TRUE);
    }
}

static void StartJob(HWND window, Job job) {
    if (g.busy) return;

    bool any = false;
    for (size_t i = 0; i < g.installs.size(); i++) any = any || g.installs[i].selected;
    if (!any) {
        SetStatus(L"Pick at least one Discord to change.", true);
        return;
    }

    SetBusy(true);
    SendMessageW(g.progress, PBM_SETPOS, 0, 0);
    SetStatus(L"Working...", false);

    WorkerContext* context = new WorkerContext();
    context->window = window;
    context->job = job;
    context->installs = g.installs;

    HANDLE thread = CreateThread(nullptr, 0, WorkerMain, context, 0, nullptr);
    if (!thread) {
        delete context;
        SetBusy(false);
        SetStatus(L"Couldn't start the work thread.", true);
        return;
    }
    CloseHandle(thread);
}

/**
 * Owner-drawn rows and buttons.
 *
 * Themed Win32 controls paint their own text in the system colour, which on a dark window
 * comes out near-invisible, and turning the theme off entirely makes them look like
 * Windows 95. Drawing them is the only way to get both a dark panel and a control that
 * looks like it belongs on it.
 */
static void DrawRoundedFill(HDC dc, const RECT& bounds, COLORREF colour, int radius) {
    HBRUSH brush = CreateSolidBrush(colour);
    HPEN pen = CreatePen(PS_SOLID, 1, colour);
    HGDIOBJ oldBrush = SelectObject(dc, brush);
    HGDIOBJ oldPen = SelectObject(dc, pen);

    RoundRect(dc, bounds.left, bounds.top, bounds.right, bounds.bottom, radius, radius);

    SelectObject(dc, oldBrush);
    SelectObject(dc, oldPen);
    DeleteObject(brush);
    DeleteObject(pen);
}

static void DrawCheckRow(LPDRAWITEMSTRUCT item) {
    size_t index = (size_t)(item->CtlID - ID_FIRSTROW);
    if (index >= g.installs.size()) return;

    const DiscordInstall& install = g.installs[index];
    bool hot = (item->itemState & (ODS_SELECTED | ODS_FOCUS)) != 0;
    bool disabled = (item->itemState & ODS_DISABLED) != 0;

    DrawRoundedFill(item->hDC, item->rcItem, hot ? kRowHot : kRow, Scaled(6));

    // The tick box.
    int boxSize = Scaled(16);
    RECT box;
    box.left = item->rcItem.left + Scaled(10);
    box.top = item->rcItem.top + (item->rcItem.bottom - item->rcItem.top - boxSize) / 2;
    box.right = box.left + boxSize;
    box.bottom = box.top + boxSize;

    DrawRoundedFill(item->hDC, box, install.selected ? kAccent : kBg, Scaled(4));

    if (install.selected) {
        HPEN tick = CreatePen(PS_SOLID, Scaled(2), RGB(0x14, 0x10, 0x22));
        HGDIOBJ oldPen = SelectObject(item->hDC, tick);
        MoveToEx(item->hDC, box.left + Scaled(4), box.top + Scaled(8), nullptr);
        LineTo(item->hDC, box.left + Scaled(7), box.top + Scaled(11));
        LineTo(item->hDC, box.left + Scaled(12), box.top + Scaled(5));
        SelectObject(item->hDC, oldPen);
        DeleteObject(tick);
    }

    SetBkMode(item->hDC, TRANSPARENT);
    SelectObject(item->hDC, g.fontBody);
    SetTextColor(item->hDC, disabled ? kMuted : kText);

    RECT label = item->rcItem;
    label.left = box.right + Scaled(10);
    std::wstring text = install.branch + L"   " + install.version;
    DrawTextW(item->hDC, text.c_str(), -1, &label, DT_LEFT | DT_VCENTER | DT_SINGLELINE);

    if (install.patched) {
        SelectObject(item->hDC, g.fontSmall);
        SetTextColor(item->hDC, kAccent);
        RECT badge = item->rcItem;
        badge.right -= Scaled(12);
        DrawTextW(item->hDC, L"patched", -1, &badge, DT_RIGHT | DT_VCENTER | DT_SINGLELINE);
    }
}

static void DrawButton(LPDRAWITEMSTRUCT item) {
    bool isPrimary = item->CtlID == ID_INSTALL;
    bool pressed = (item->itemState & ODS_SELECTED) != 0;
    bool disabled = (item->itemState & ODS_DISABLED) != 0;

    COLORREF face = isPrimary ? kAccent : kRowHot;
    if (pressed) face = isPrimary ? RGB(0x8f, 0x74, 0xe0) : RGB(0x39, 0x3b, 0x44);
    if (disabled) face = isPrimary ? RGB(0x5c, 0x4f, 0x84) : RGB(0x25, 0x26, 0x2b);

    DrawRoundedFill(item->hDC, item->rcItem, face, Scaled(8));

    wchar_t caption[64] = L"";
    GetWindowTextW(item->hwndItem, caption, ARRAYSIZE(caption));

    COLORREF ink = isPrimary ? RGB(0x14, 0x10, 0x22) : kText;
    if (disabled) ink = kMuted;

    SetBkMode(item->hDC, TRANSPARENT);
    SetTextColor(item->hDC, ink);
    SelectObject(item->hDC, g.fontBody);
    DrawTextW(item->hDC, caption, -1, &item->rcItem, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
}

static void PaintWindow(HWND window) {
    PAINTSTRUCT paint;
    HDC dc = BeginPaint(window, &paint);

    RECT client;
    GetClientRect(window, &client);
    FillRect(dc, &client, g.brushBg);

    RECT header = client;
    header.bottom = Scaled(84);
    FillRect(dc, &header, g.brushPanel);

    if (g.icon) {
        DrawIconEx(dc, Scaled(24), Scaled(18), g.icon, Scaled(48), Scaled(48), 0, nullptr, DI_NORMAL);
    }

    SetBkMode(dc, TRANSPARENT);

    SelectObject(dc, g.fontTitle);
    SetTextColor(dc, kText);
    RECT title = { Scaled(88), Scaled(20), client.right - Scaled(16), Scaled(50) };
    DrawTextW(dc, L"Xbtcord", -1, &title, DT_LEFT | DT_SINGLELINE);

    SelectObject(dc, g.fontSmall);
    SetTextColor(dc, kMuted);
    RECT subtitle = { Scaled(88), Scaled(50), client.right - Scaled(16), Scaled(72) };
    DrawTextW(dc, L"A Discord client mod", -1, &subtitle, DT_LEFT | DT_SINGLELINE);

    SetTextColor(dc, kMuted);
    RECT label = { Scaled(24), Scaled(98), client.right - Scaled(24), Scaled(118) };
    DrawTextW(dc, g.installs.empty() ? L"No Discord found" : L"Where to install",
              -1, &label, DT_LEFT | DT_SINGLELINE);

    EndPaint(window, &paint);
}

/*
 * Lays the window out from the top down and records how tall it ended up.
 *
 * The height is not fixed because the list is not: someone with only stable Discord gets
 * one row, someone running stable, PTB and Canary gets three. A fixed window sized for the
 * worst case leaves a hole under the common one.
 */
static void BuildControls(HWND window) {
    int y = Scaled(122);

    if (g.installs.empty()) {
        HWND note = CreateWindowExW(0, L"STATIC",
            L"Discord isn't installed for this user account.\r\n\r\n"
            L"Install Discord, run it once so it finishes unpacking, then open this again.",
            WS_CHILD | WS_VISIBLE, Scaled(24), y, Scaled(472), Scaled(60),
            window, nullptr, nullptr, nullptr);
        SendMessageW(note, WM_SETFONT, (WPARAM)g.fontBody, TRUE);
        y += Scaled(64);
    } else {
        for (size_t i = 0; i < g.installs.size(); i++) {
            HWND row = CreateWindowExW(0, L"BUTTON", L"",
                WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW,
                Scaled(24), y, Scaled(472), Scaled(30), window,
                (HMENU)(INT_PTR)(ID_FIRSTROW + i), nullptr, nullptr);
            g.rows.push_back(row);
            y += Scaled(34);
        }
    }

    y += Scaled(18);

    g.progress = CreateWindowExW(0, PROGRESS_CLASSW, nullptr,
        WS_CHILD | WS_VISIBLE | PBS_SMOOTH,
        Scaled(24), y, Scaled(472), Scaled(6), window, (HMENU)ID_PROGRESS, nullptr, nullptr);

    // Without dropping the theme, PBM_SETBARCOLOR is ignored and the bar stays Windows green.
    SetWindowTheme(g.progress, L"", L"");
    SendMessageW(g.progress, PBM_SETRANGE32, 0, 100);
    SendMessageW(g.progress, PBM_SETBARCOLOR, 0, (LPARAM)kAccent);
    SendMessageW(g.progress, PBM_SETBKCOLOR, 0, (LPARAM)kRow);

    y += Scaled(16);

    g.status = CreateWindowExW(0, L"STATIC", L"Ready.",
        WS_CHILD | WS_VISIBLE | SS_LEFT,
        Scaled(24), y, Scaled(472), Scaled(36), window,
        (HMENU)ID_STATUS, nullptr, nullptr);
    SendMessageW(g.status, WM_SETFONT, (WPARAM)g.fontSmall, TRUE);

    y += Scaled(44);

    g.uninstall = CreateWindowExW(0, L"BUTTON", L"Uninstall",
        WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW,
        Scaled(24), y, Scaled(140), Scaled(38), window, (HMENU)ID_UNINSTALL, nullptr, nullptr);

    bool anyPatched = false;
    for (size_t i = 0; i < g.installs.size(); i++) anyPatched = anyPatched || g.installs[i].patched;

    g.install = CreateWindowExW(0, L"BUTTON", anyPatched ? L"Reinstall" : L"Install",
        WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW | BS_DEFPUSHBUTTON,
        Scaled(336), y, Scaled(160), Scaled(38), window, (HMENU)ID_INSTALL, nullptr, nullptr);

    if (g.installs.empty()) {
        EnableWindow(g.install, FALSE);
        EnableWindow(g.uninstall, FALSE);
    }

    g.contentHeight = y + Scaled(38) + Scaled(22);
}

/** Sizes the window to whatever BuildControls just laid out, and centres it. */
static void FitWindow(HWND window) {
    DWORD style = (DWORD)GetWindowLongPtrW(window, GWL_STYLE);

    RECT desired = { 0, 0, Scaled(520), g.contentHeight };
    AdjustWindowRectEx(&desired, style, FALSE, 0);

    int width = desired.right - desired.left;
    int height = desired.bottom - desired.top;

    SetWindowPos(window, nullptr,
                 (GetSystemMetrics(SM_CXSCREEN) - width) / 2,
                 (GetSystemMetrics(SM_CYSCREEN) - height) / 2,
                 width, height, SWP_NOZORDER);
}

static LRESULT CALLBACK WindowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
    case WM_CREATE:
        g.brushBg = CreateSolidBrush(kBg);
        g.brushPanel = CreateSolidBrush(kPanel);
        g.fontBody = MakeFont(10, FW_NORMAL);
        g.fontTitle = MakeFont(19, FW_SEMIBOLD);
        g.fontSmall = MakeFont(9, FW_NORMAL);
        g.icon = (HICON)LoadImageW(GetModuleHandleW(nullptr), MAKEINTRESOURCEW(IDI_APPICON),
                                   IMAGE_ICON, Scaled(48), Scaled(48), 0);
        g.installs = FindDiscordInstalls();
        BuildControls(window);
        FitWindow(window);
        return 0;

    case WM_CTLCOLORSTATIC:
        SetBkMode((HDC)wParam, TRANSPARENT);
        SetTextColor((HDC)wParam, ((HWND)lParam == g.status && g.failed) ? kDanger : kMuted);
        return (LRESULT)g.brushBg;

    case WM_CTLCOLORBTN:
        SetBkMode((HDC)wParam, TRANSPARENT);
        return (LRESULT)g.brushBg;

    case WM_DRAWITEM: {
        LPDRAWITEMSTRUCT item = (LPDRAWITEMSTRUCT)lParam;
        if (item->CtlType != ODT_BUTTON) break;

        if (item->CtlID >= ID_FIRSTROW) DrawCheckRow(item);
        else DrawButton(item);
        return TRUE;
    }

    case WM_ERASEBKGND:
        return 1;  // WM_PAINT fills everything; erasing first only causes flicker.

    case WM_PAINT:
        PaintWindow(window);
        return 0;

    case WM_COMMAND:
        if (HIWORD(wParam) == BN_CLICKED) {
            UINT id = LOWORD(wParam);

            if (id == ID_INSTALL) StartJob(window, Job::Install);
            else if (id == ID_UNINSTALL) StartJob(window, Job::Uninstall);
            else if (id >= ID_FIRSTROW && (size_t)(id - ID_FIRSTROW) < g.installs.size()) {
                size_t index = id - ID_FIRSTROW;
                g.installs[index].selected = !g.installs[index].selected;
                InvalidateRect(g.rows[index], nullptr, TRUE);
            }
        }
        return 0;

    case WM_XBT_STATUS: {
        std::unique_ptr<std::wstring> text((std::wstring*)lParam);
        int percent = (int)wParam;

        // -1 means "this is an error; leave the bar where it stopped".
        if (percent >= 0) SendMessageW(g.progress, PBM_SETPOS, percent, 0);
        if (text) SetStatus(*text, percent < 0);
        return 0;
    }

    case WM_XBT_FINISHED: {
        SetBusy(false);

        // Re-scan so the "patched" markers and the button caption tell the truth, keeping
        // whatever the user had ticked. Only the flags change, so nothing is recreated.
        std::vector<DiscordInstall> fresh = FindDiscordInstalls();
        for (size_t i = 0; i < g.installs.size() && i < fresh.size(); i++) {
            g.installs[i].patched = fresh[i].patched;
            g.installs[i].version = fresh[i].version;
            g.installs[i].resources = fresh[i].resources;
        }
        RefreshRowLabels();
        return 0;
    }

    case WM_CLOSE:
        if (g.busy) {
            // Yanking the process out mid-rename is how you end up with no app.asar at all.
            MessageBoxW(window, L"Still working - give it a moment.", L"Xbtcord",
                        MB_OK | MB_ICONINFORMATION);
            return 0;
        }
        DestroyWindow(window);
        return 0;

    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }

    return DefWindowProcW(window, message, wParam, lParam);
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int show) {
    INITCOMMONCONTROLSEX controls;
    controls.dwSize = sizeof(controls);
    controls.dwICC = ICC_PROGRESS_CLASS | ICC_STANDARD_CLASSES;
    InitCommonControlsEx(&controls);

    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    HDC screen = GetDC(nullptr);
    g.dpi = GetDeviceCaps(screen, LOGPIXELSX);
    ReleaseDC(nullptr, screen);

    WNDCLASSEXW windowClass;
    ZeroMemory(&windowClass, sizeof(windowClass));
    windowClass.cbSize = sizeof(windowClass);
    windowClass.lpfnWndProc = WindowProc;
    windowClass.hInstance = instance;
    windowClass.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    windowClass.lpszClassName = L"XbtcordInstaller";
    windowClass.hIcon = LoadIconW(instance, MAKEINTRESOURCEW(IDI_APPICON));
    windowClass.hIconSm = windowClass.hIcon;
    RegisterClassExW(&windowClass);

    DWORD style = WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX;

    RECT desired = { 0, 0, Scaled(520), Scaled(360) };
    AdjustWindowRectEx(&desired, style, FALSE, 0);

    int width = desired.right - desired.left;
    int height = desired.bottom - desired.top;
    int x = (GetSystemMetrics(SM_CXSCREEN) - width) / 2;
    int y = (GetSystemMetrics(SM_CYSCREEN) - height) / 2;

    HWND window = CreateWindowExW(0, windowClass.lpszClassName, L"Xbtcord Installer", style,
                                  x, y, width, height, nullptr, nullptr, instance, nullptr);
    if (!window) {
        MessageBoxW(nullptr, L"Couldn't open the window.", L"Xbtcord", MB_OK | MB_ICONERROR);
        return 1;
    }

    ShowWindow(window, show);
    UpdateWindow(window);

    MSG message;
    while (GetMessageW(&message, nullptr, 0, 0) > 0) {
        if (!IsDialogMessageW(window, &message)) {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }

    CoUninitialize();
    return 0;
}
