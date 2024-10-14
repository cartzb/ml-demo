import { InstructContent, executeCodeCompleted } from "@main/ipc/code-manager";
import { loadModules } from "./modules";
import { notify } from "@main/ipc/notify-manager";
import { send_ipc_render } from "@main/ipc/send_ipc";
import { ipcMain } from "electron";
import { sendMessage } from "@main/ipc/webview-api";
import pluginManager from "@main/plugin/plugin-manager";
import { PluginInfo, PluginType } from "@main/plugin/type/plugin";
import { InstructExecutor, InstructResult } from "@main/plugin/type/bridge";
import { showErrorDialog } from "@main/utils/dialog";
// loadModules('../executor', (file, module) => {
//     if (!module.execute) {
//         throw new Error(` “${file}“ executor not implements execute function`);
//     }
//     // 检查 executor.execute 是否是函数
//     if (typeof module.execute !== 'function') {
//         throw new Error(` “${file}“ executor executor.execute is not a function`);
//     }
//     if (Array.isArray(module.support)) {
//         // 如果 `support` 是数组，将数组中的每个元素都作为键赋值给 `executors`
//         module.support.forEach((supportKey: string) => {
//             executors[supportKey] = module;
//         });
//     } else {
//         // 如果 `support` 是字符串，直接作为键赋值给 `executors`
//         executors[module.support as string] = module;
//     }
//     console.log(`load-module: ${file},${module.support}`);
// }).catch(console.error);

ipcMain.on('terminal-execute-completed', (event, input) => {
    console.log("搜到执行结果", input)
    executeCodeCompleted(input)
});
export const executeCode = async (code_body: InstructContent) => {
    console.log(`执行代码:\n${JSON.stringify(code_body)}`);
    const { code, language, executor } = code_body;

    pluginManager.resolvePluginModule(PluginType.executor, (pluginInfoList: Set<PluginInfo>) => {
        if (executor) {
            return pluginManager.getPluginFromId(executor);
        }
        for (const pluginInfo of pluginInfoList) {
            if (pluginInfo.instruct.indexOf(language) != -1) {
                return pluginInfo;
            }
        }
        return null;
    }).then((module: InstructExecutor) => {
        module.execute(code_body).then((result: InstructResult) => {
            console.log("执行结果", result)
            // sendMessage(result)
        }).catch(err => {
            console.error(err)
            showErrorDialog(`执行指令异常:${String(err)}`)
        })
    }).catch(err => {
        console.error(err)
        showErrorDialog(`执行器异常:${String(err)}`)
    })
    // const result = await executor.execute(code);

    // send_ipc_render('terminal-input', code)
    // console.log(`执行结果:\n${result}`);
    // notify(`执行 ${language} 结果:\n${result}`);
    // executeCodeCompleted({ code, language, result })
    // return result;
    // await dispatcherResult(result);
}