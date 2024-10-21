import { PluginExtensionContext } from "../../../lib/src/main/plugin";

// global.d.ts
declare global {
   var pluginContext: PluginExtensionContext;
   var notifyManager: { notify: (message: string) => void, notifyError: (message: string) => void }
}

export { };
