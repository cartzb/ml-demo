import { PluginExtensionContext } from "../../../lib/src/main/plugin";

export class AbstractPlugin {
    _init__(ctx: PluginExtensionContext) {
        pluginContext = ctx;
    }
}