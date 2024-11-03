import { getPreloadFile, getUrl } from "@main/config/static-path";
import { registeMenu } from "./service-menu";
import windowManager from "./window-manager";

const windowId = 'DEFAULT_SETTING'

export const createWindow = () => {
    let mainWindow = windowManager.getWindow(windowId)
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        return;
    }
    const settingURL = getUrl('setting');
    mainWindow = windowManager.createWindow(windowId, {
        title: "设置",
        height: 720,
        useContentSize: true,
        width: 960,
        minWidth: 720,
        frame: false,
        show: false,
        webPreferences: {
            devTools: process.env.NODE_ENV === "development",
            // 在macos中启用橡皮动画
            scrollBounce: process.platform === "darwin",
            preload: getPreloadFile("setting-ipc"),
        },
    });

    mainWindow.loadURL(settingURL);
    mainWindow.webContents.on('will-attach-webview', (e, webPreferences) => {
        // webPreferences.preload = getPreloadFile('webview')
    })
    mainWindow.once("ready-to-show", () => {
        mainWindow.show();
    })
}

registeMenu({
    label: '设置',
    key: 'setting',
    click: () => {
        createWindow();
    }
}, "general")