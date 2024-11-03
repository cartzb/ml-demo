import {
  AbstractPlugin,
  InstructContent,
  InstructExecutor,
  InstructResult,
  InstructResultType,
  pluginContext,
} from "mylib/main";
import { Pluginlifecycle } from "mylib/main";
import { PluginExtensionContext } from "mylib/main";
import { v4 as uuidv4 } from "uuid";
import { runPythonCode } from "./python";
import { stringify } from "circular-json";
import util from "util";
import VirtualWindow from "../../../ssh_executor/src/main/virtual-window";
import { ChildProcess, spawn } from "child_process";

class ExecuteContext {
  private _data: ((data: string) => void) | undefined;
  private _write: ((data: string) => void) | undefined;
  private _error: ((data: Error) => void) | undefined;
  private _end: ((data?: string) => void) | undefined;
  private _abort: ((message?: any) => void) | undefined;
  private _process;
  constructor(childProcess: ChildProcess) {
    this._process = childProcess;
  }
  callData(data: string) {
    if (!this._data) {
      throw new Error("没有响应回调");
    }
    this._data(data);
  }
  abort(message: string) {
    if (!this._abort) {
      throw new Error("没有终止回调");
    }
    this._abort(message);
  }
  write(data: string) {
    if (!this._write) {
      throw new Error("没有发送回调");
    }
    this._write(data);
  }
  error(data: string | Error) {
    if (!this._error) {
      throw new Error("没有错误回调");
    }
    if (data instanceof Error) {
      this._error(data);
    } else {
      this._error(new Error(data));
    }
  }

  end(data?: string) {
    if (!this._end) {
      throw new Error("没有结束回调");
    }
    this._end(data);
  }
  onAbort(callback: (data: string) => void) {
    this._abort = callback;
  }
  onWrite(callback: (data: string) => void) {
    this._write = callback;
  }
  onData(callback: (data: string) => void) {
    this._data = callback;
  }

  onError(callback: (data: Error) => void) {
    this._error = callback;
  }
  onEnd(callback: () => void) {
    this._end = callback;
  }
}

class PythonExecutor
  extends AbstractPlugin
  implements InstructExecutor, Pluginlifecycle
{
  currentTask(): string[] {
    return this.executeContext ? [""] : [];
  }
  private executeContext: null | ExecuteContext = null;

  abort(instruct: InstructContent): Promise<InstructResult | void> {
    if (!this.executeContext) {
      return Promise.reject(new Error("没有找到正在执行的指令"));
    }
    this.executeContext.abort("用户主动终止");
    return Promise.resolve();
  }
  execute(instruct: InstructContent): Promise<InstructResult> {
    return new Promise((resolve, reject) => {
      if (this.executeContext) {
        reject("一个程序正在运行中");
      }
      const execId = uuidv4();
      const { code, language, id } = instruct;
      this.executeContext = new ExecuteContext(null as any);
      try {
        let childProcess: ChildProcess;
        const destory = () => {
          this.executeContext = null;
          childProcess?.kill();
        };
        let isNomalExit = false;
        this.executeContext.onError((err) => {
          isNomalExit = true;
          render(
            `程序异常:${util.inspect(err, { colors: true })}`,
            InstructResultType.completed
          );
          destory();
          const output = virtualWindow.render();
          resolve({
            id: instruct.id,
            std: output,
            execId,
            type: InstructResultType.completed,
          });
        });
        const virtualWindow = new VirtualWindow();
        const line = code.split(/\r?\n/).length;
        const render = (data: string, type: InstructResultType) => {
          console.log(data);
          virtualWindow.write(data);
          const output = virtualWindow.render();
          pluginContext.sendIpcRender("code-view-api.insertLine", {
            id,
            code: output,
            execId,
            line,
            type,
          });
        };
        childProcess = spawn("python", ["-c", code], {
          stdio: ["pipe", "pipe", "pipe"],
          env: { FORCE_COLOR: "1" },
        });
        childProcess.stdout?.setEncoding("utf8");
        childProcess.stdout?.on("data", (data) => {
          render(data, InstructResultType.executing);
          console.log(`子进程输出: ${data}`);
        });
        childProcess.stdout?.on("error", (data) => {
          render(
            util.inspect(data, { colors: true }),
            InstructResultType.executing
          );
          console.log(`子进程输出: ${data}`);
        });
        childProcess.stderr?.setEncoding("utf8");
        childProcess.stderr?.on("data", (data) => {
          render(data, InstructResultType.executing);
          console.error(`子进程错误: `, data);
        });
        childProcess.stderr?.on("error", (data) => {
          render(
            util.inspect(data, { colors: true }),
            InstructResultType.executing
          );
          console.log(`子进程输出: ${data}`);
        });
        this.executeContext.onWrite((data?: string) => {
          render(data ? stringify(data) : "", InstructResultType.executing);
        });
        this.executeContext.onEnd((data?: string) => {
          render(data ? data : "", InstructResultType.completed);
          const output = virtualWindow.render();
          resolve({
            id: instruct.id,
            std: output,
            execId,
            type: InstructResultType.completed,
          });
          destory();
        });

        this.executeContext.onAbort((err) => {
          render(`程序终止执行:${err}`, InstructResultType.completed);
          destory();
          const output = virtualWindow.render();
          resolve({
            id: instruct.id,
            // ret: output,
            std: output,
            execId,
            type: InstructResultType.completed,
          });
        });

        
        // 监听子进程的错误事件
        childProcess.on("error", (error) => {
          isNomalExit = true;
          this.executeContext?.error(error);
        });
        childProcess.on("close", (code, signal) => {
          this.executeContext?.write("子进程关闭！");
        });
        // 监听子进程的退出事件
        childProcess.on("exit", (code, signal) => {
          if (code !== null && code === 0) {
            this.executeContext?.end(`程序执行完成！`);
          } else {
            this.executeContext?.end(
              `子进程已被终止,退出码:${code},信号：${signal}`
            );
          }
        });
      } catch (error: any) {
        this.executeContext.error(error);
        this.executeContext = null;
      }
    });
  }

  onMounted(ctx: PluginExtensionContext): void {}
  onUnmounted(ctx: PluginExtensionContext): void {}
}
export default new PythonExecutor();
