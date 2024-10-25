import https from 'https';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import unzipper from 'unzipper';
import tar from 'tar';
import sudo from 'sudo-prompt';
import { URL } from 'url';
import path from 'path';
import axios from 'axios';
import ProgressBar from 'progress';
import DownloadNode from '../src/main/download'
import {startNodeChildProcess} from '../src/main/node-executor'
import {extractNode} from '../src/main/extract'

const options = { name: 'Electron App' };

const platform = os.platform();
const arch = os.arch();
let fileExtension: string;

// 根据操作系统和架构选择文件后缀
if (platform === 'win32') {
    fileExtension = arch === 'x64' ? 'win-x64.zip' : 'win-arm64.zip';
} else if (platform === 'darwin') {
    fileExtension = arch === 'x64' ? 'darwin-x64.tar.gz' : 'darwin-arm64.tar.gz';
} else if (platform === 'linux') {
    fileExtension = arch === 'x64' ? 'linux-x64.tar.xz' : 'linux-arm64.tar.xz';
}

// 请求 Node.js 版本
const getNodeVersions = () => {
    return new Promise((resolve, reject) => {
        https.get('https://nodejs.org/dist/index.json', (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                resolve(JSON.parse(data));
            });
        }).on('error', (err) => reject(err));
    });
};
const getNodeSha = (version:string,fileName:string) => {
    return new Promise<string|null>((resolve, reject) => {
        const shaUrl = `https://nodejs.org/dist/${version}/SHASUMS256.txt`
        console.log(`sha地址:${shaUrl}`)
        https.get(shaUrl, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                const lines = data.trim().split('\n');
                lines.forEach(line => {
                    // 使用正则表达式分割 SHA 值和文件名
                    const match = line.match(/([a-f0-9]{64})\s+(.+)/);
                    if (match) {
                        const _sha = match[1];
                        const _fileName = match[2];
                        if(_fileName === fileName){
                            resolve(_sha);
                        }
                    }
                });
                resolve(null);
            });
        }).on('error', (err) => reject(err));
    });
};

const setEnvironmentVariables = async (nodePath: string, version: any) => {
    const nodeHome = platform === 'win32' ? `${__dirname}\\nodejs` : `${__dirname}/nodejs`;

    let command: string;
    if (platform === 'win32') {
        command = `setx NODE_HOME "${nodeHome}" /M && setx PATH "%PATH%;${nodeHome}" /M`;
    } else {
        command = `echo "export NODE_HOME=${nodeHome}" | tee -a /etc/environment && echo "export PATH=\$PATH:${nodeHome}" | tee -a /etc/environment`;
    }

    return new Promise((resolve, reject) => {
        sudo.exec(command, options, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                console.log(`环境变量已设置: ${stdout}`);
                resolve(nodePath);
            }
        });
    });
};

const runNodeVersion = (nodePath: string) => {
    return new Promise<void>((resolve, reject) => {
        execFile(nodePath, ['--version'], (error, stdout) => {
            if (error) {
                reject(error);
            } else {
                console.log(`Node.js 版本号: ${stdout.trim()}`);
                resolve();
            }
        });
    });
};

const main = async () => {
    try {
        const versions = await getNodeVersions() as any;
        console.log(versions[0])
        const latestVersion = versions[0].version;
        const fileName= `node-${latestVersion}-${fileExtension}`;
        const downloadUrl = `https://nodejs.org/dist/${latestVersion}/${fileName}`;
        console.log(`下载地址:${downloadUrl}`)
        const sha256 = await getNodeSha( latestVersion,fileName)
        console.log('256:'+sha256)
        // const sha = `https://nodejs.org/dist/${latestVersion}/SHASUMS256.txt`
        const filePath = path.join(__dirname, '../download',fileName);
        console.log(filePath,'\n',path.basename(filePath))
        await DownloadNode(downloadUrl, filePath,sha256);
        // console.log("下载后的文件地址:"+filePath)
        // // const nodePath:string = await extractNode(filePath);
        // const nodePath = path.join(__dirname,`../src/main/download/node-v23.1.0-win-x64`);
        // console.log("解压后的文件路径:"+nodePath)
        // // 使用示例
        // const scriptPath = path.join(__dirname, 'assets/test.js'); // 你的脚本路径

        // startNodeChildProcess(nodePath, 'npm',['i','vue'])
        //     .then(() => console.log('脚本执行成功'))
        //     .catch((err) => console.error('脚本执行出错:', err));

        // const setEnvPath = await setEnvironmentVariables(nodePath, latestVersion);

        // await runNodeVersion(setEnvPath);
    } catch (err) {
        console.error('操作出错:', err);
    }
};

main();
