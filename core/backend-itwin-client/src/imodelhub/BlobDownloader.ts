/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import got from "got";
import * as fs from "fs";
import * as stream from "stream";
import * as util from "util";
import * as crypto from "crypto";
import * as path from "path";
import { HttpsAgent } from "agentkeepalive";
import { CancelRequest, UserCancelledError } from "@bentley/itwin-client";
import { checkSync, lockSync } from "proper-lockfile";
import { AsyncMutex, BeEvent, BriefcaseStatus, Logger } from "@bentley/bentleyjs-core";
/** Configure download task */
export interface ConfigData {
  blockSize?: number;
  ignoreResumeData?: boolean;
  checkMD5AfterDownload?: boolean;
  simultaneousDownloads?: number;
  downloadRateWindowSize?: number; /* specify time in seconds for window size for download rate*/
  progressReportAfter?: number; /* specify time in seconds when to report progress */
  enableResumableDownload?: boolean;
}
enum BlockState {
  Pending = 0,
  Downloading = 1,
  Downloaded = 2
}
interface ResumeData {
  version: number;
  fileName: string;
  tempName: string;
  blockSize: number;
  blobSize: number;
  blobMD5: string;
  downloadUrl: string;
  lastMod: number;
  blocks: BlockState[];
}
interface SpeedData {
  measurementWindowInSeconds: number;
  timeSinceLastMeasurement: number;
  bytesSinceLastMeasurement: number;
}
interface SessionData {
  resumeData: ResumeData;
  startedOn: number;
  bytesDownloaded: number;
  speedWindowInSecond: number;
  speedWindowBytes: number;
  speedWindowResetOn: number;
  speedData: SpeedData;
  failedBocks: number;
  lastError?: Error;
  cancelled: boolean;
  resumeDataFile: string;
  config: ConfigData;
  progress: BeEvent<(arg: ProgressData) => void>;
  ready?: Promise<void>;
  progressTimer?: NodeJS.Timeout;
}
export interface ProgressData {
  bytesTotal: number;
  bytesDone: number;
  percentage: number;
  blocksDownloading: number;
  blocksDownloaded: number;
  blocksPending: number;
  downloadRateBytesPerSec: number;
  windowRateBytesPerSec: number;
}
export class BlobDownloader {
  private static downloads = new Map<string, SessionData>();
  private static resumeDataVer = 1;
  private static mutex = new AsyncMutex();
  private static pipeline = util.promisify(stream.pipeline);
  private static allocateFile(fileName: string, size: number) {
    const fh = fs.openSync(fileName, "w+");
    fs.ftruncateSync(fh, size);
    fs.fdatasyncSync(fh);
    fs.closeSync(fh);
  }
  private static async calculateFileMD5(file: string): Promise<string> {
    const fd = fs.createReadStream(file);
    const hash = crypto.createHash("md5");
    hash.setEncoding("base64");
    fd.on("end", () => hash.end());
    await this.pipeline(fd, hash);
    return hash.read() as string;
  }
  private static async readHeader(downloadUrl: string) {
    const response = await got(downloadUrl, { method: "HEAD" });
    const findHeader = (header: string) => {
      return response.rawHeaders.find((v: string) => {
        return v.toLowerCase() === header.toLowerCase();
      });
    };
    const isMD5Supported = findHeader("content-md5") ? true : false;
    if (!findHeader("content-length")) {
      throw new Error("server does not support 'content-length' header");
    }
    if (!findHeader("accept-ranges")) {
      throw new Error("server does not support 'accept-range' header");
    }

    const blobSize = Number(response.headers["content-length"]);
    const blobMD5 = isMD5Supported ? response.headers["content-md5"] as string : "";
    const acceptRange = response.headers["accept-ranges"];
    if (acceptRange !== "bytes") {
      throw new Error("Server does not support range");
    }
    return { blobSize, blobMD5 };
  }
  private static makeDirectoryRecursive(dirPath: string) {
    if (fs.existsSync(dirPath))
      return;

    this.makeDirectoryRecursive(path.dirname(dirPath));
    fs.mkdirSync(dirPath);
  }
  private static checkAndFixUseConfig(userConfig: ConfigData): ConfigData {
    const defaultConfig: ConfigData = {
      blockSize: 4 * 1024 * 1024,
      ignoreResumeData: false,
      checkMD5AfterDownload: false,
      simultaneousDownloads: 4,
      downloadRateWindowSize: 2,
      progressReportAfter: 1,
      enableResumableDownload: true,
    };
    if (Number.isInteger(userConfig.blockSize)) {
      if (userConfig.blockSize! < 1024)
        throw new Error("blockSize must be equal or greater then 1024");
      if (userConfig.blockSize! % 1024 !== 0)
        throw new Error("blockSize must be multiple of 1024");
    } else {
      userConfig.blockSize = defaultConfig.blockSize;
    }

    if (typeof userConfig.checkMD5AfterDownload === "undefined")
      userConfig.checkMD5AfterDownload = defaultConfig.checkMD5AfterDownload;

    if (typeof userConfig.ignoreResumeData === "undefined")
      userConfig.ignoreResumeData = defaultConfig.ignoreResumeData;

    if (typeof userConfig.enableResumableDownload === "undefined")
      userConfig.enableResumableDownload = defaultConfig.enableResumableDownload;

    if (Number.isInteger(userConfig.simultaneousDownloads)) {
      if (userConfig.simultaneousDownloads! <= 0 || userConfig.simultaneousDownloads! >= 16)
        throw new Error("simultaneousDownload must be >= 1 and <=16");
    } else {
      userConfig.simultaneousDownloads = defaultConfig.simultaneousDownloads;
    }
    if (Number.isInteger(userConfig.downloadRateWindowSize)) {
      if (userConfig.downloadRateWindowSize! <= 0 || userConfig.simultaneousDownloads! >= 10)
        throw new Error("downloadRateWindowSize must be >= 1 and <= 10");
    } else {
      userConfig.simultaneousDownloads = defaultConfig.simultaneousDownloads;
    }
    if (Number.isInteger(userConfig.progressReportAfter)) {
      if (userConfig.progressReportAfter! <= 0 || userConfig.progressReportAfter! >= 10)
        throw new Error("progressReportAfter must be >= 1 and <= 10");
    } else {
      userConfig.progressReportAfter = defaultConfig.progressReportAfter;
    }
    return Object.freeze(userConfig);
  }
  private static getResumeData(session: SessionData, deleteOnFailToValidate: boolean): ResumeData | undefined {
    if (!fs.existsSync(session.resumeDataFile))
      return;

    const deleteResumeData = () => {
      if (deleteOnFailToValidate)
        fs.unlinkSync(session.resumeDataFile);
      return undefined;
    };
    if (!fs.existsSync(session.resumeData.tempName))
      return deleteResumeData();

    const diskFileSize = fs.lstatSync(session.resumeData.tempName).size;
    if (diskFileSize !== session.resumeData.blobSize)
      return deleteResumeData();

    let rd: ResumeData;
    try {
      const json = fs.readFileSync(session.resumeDataFile, { encoding: "utf8" });
      rd = JSON.parse(json) as ResumeData;
    } catch {
      return deleteResumeData();
    }
    const isMD5Supported = session.resumeData.blobMD5 !== "";
    if (!isMD5Supported) {
      return deleteResumeData();
    }
    // verify it has what we expects;
    if (typeof rd.blobMD5 !== "string"
      || typeof rd.blobSize !== "number"
      || typeof rd.blockSize !== "number"
      || typeof rd.blocks !== "object"
      || typeof rd.downloadUrl !== "string"
      || typeof rd.fileName !== "string"
      || typeof rd.tempName != "string"
      || typeof rd.version !== "number") {
      return deleteResumeData();
    }
    const expectedBlockCount = Math.ceil(rd.blobSize / rd.blockSize);
    if (rd.blobMD5 !== session.resumeData.blobMD5
      || rd.fileName !== session.resumeData.fileName
      || rd.tempName !== session.resumeData.tempName
      || rd.version !== this.resumeDataVer
      || rd.blocks.length !== expectedBlockCount
      || rd.blobSize !== session.resumeData.blobSize)
      return deleteResumeData();

    if (rd.blocks.filter((state) => state !== BlockState.Pending && state !== BlockState.Downloaded).length !== 0)
      return deleteResumeData();

    return Object.freeze(rd);
  }
  private static async createSession(downloadUrl: string, downloadFile: string, config: ConfigData = {}, onProgress?: (data: ProgressData) => void, cancelRequest?: CancelRequest): Promise<SessionData> {
    const { blobSize, blobMD5 } = await this.readHeader(downloadUrl);
    this.makeDirectoryRecursive(path.dirname(downloadFile));
    const userConfig = this.checkAndFixUseConfig(config);
    const blockCount = Math.ceil(blobSize / userConfig.blockSize!);
    const sessionData = {
      startedOn: Date.now(),
      bytesDownloaded: 0,
      failedBocks: 0,
      speedWindowInSecond: 2,
      speedWindowBytes: 0,
      speedWindowResetOn: Date.now(),
      config: userConfig,
      resumeDataFile: `${downloadFile}-resume`,
      cancelled: false,
      progress: new BeEvent<(arg: ProgressData) => void>(),
      resumeData: {
        lastMod: Date.now(),
        downloadUrl,
        fileName: downloadFile,
        tempName: `${downloadFile}-temp`,
        version: this.resumeDataVer,
        blobSize,
        blockSize: userConfig.blockSize!,
        blobMD5,
        blocks: Array(blockCount).fill(undefined).map( () => BlockState.Pending),
      },
      speedData: {
        measurementWindowInSeconds: userConfig.downloadRateWindowSize!,
        timeSinceLastMeasurement: 0,
        bytesSinceLastMeasurement: 0,
      },
    };
    if (cancelRequest) {
      cancelRequest.cancel = () => {
        sessionData.cancelled = true;
        return true;
      };
    }
    if (onProgress) {
      sessionData.progress.addListener(onProgress);
    }
    // read resume data
    const resumeDataFromDisk = userConfig.ignoreResumeData! ? undefined : this.getResumeData(sessionData, true);
    if (resumeDataFromDisk) {
      sessionData.resumeData = { ...resumeDataFromDisk };
    } else {
      if (fs.existsSync(downloadFile)) {
        let fileMD5 = "";
        if (blobMD5 !== "") {
          fileMD5 = await this.calculateFileMD5(sessionData.resumeData.fileName);
        }
        if (fileMD5 === blobMD5) {
          sessionData.resumeData.blocks = Array(blockCount).fill(undefined).map( () => BlockState.Downloaded);
        } else {
          fs.unlinkSync(downloadFile);
        }
      }
    }
    if (!fs.existsSync(downloadFile)) {
      this.allocateFile(sessionData.resumeData.tempName, blobSize);
    }
    return sessionData;
  }
  private static saveResumeData(session: SessionData) {
    if (!session.config.enableResumableDownload!)
      return;

    if (!this.hasPendingBlocks(session.resumeData)) {
      // we are done delete resume data
      if (fs.existsSync(session.resumeDataFile)) {
        fs.unlinkSync(session.resumeDataFile);
      }
      return;
    }
    const copy = JSON.parse(JSON.stringify(session.resumeData)) as ResumeData;
    copy.blocks.forEach((v, i, a) => {
      if (v === BlockState.Downloading)
        a[i] = BlockState.Pending;
    });
    copy.version = this.resumeDataVer;
    copy.lastMod = Date.now();
    fs.writeFileSync(session.resumeDataFile, JSON.stringify(copy));
  }
  private static nextBlockId(resumeData: ResumeData): number {
    const blockId = resumeData.blocks.findIndex((_) => _ === BlockState.Pending);
    if (blockId >= 0) {
      resumeData.blocks[blockId] = BlockState.Downloading;
    }
    return blockId;
  }
  private static hasPendingBlocks(resumeData: ResumeData): boolean {
    return resumeData.blocks.findIndex((v) => v === BlockState.Pending) >= 0;
  }
  private static markCompleted(session: SessionData, blockId: number) {
    session.resumeData.blocks[blockId] = BlockState.Downloaded;
    this.saveResumeData(session);
  }
  private static markFailed(session: SessionData, blockId: number, err?: Error) {
    session.resumeData.blocks[blockId] = BlockState.Pending;
    session.failedBocks++;
    session.lastError = err;

  }
  private static getBlockSize(resumeData: ResumeData, blockId: number) {
    if (blockId === (resumeData.blocks.length - 1)) {
      const lastBlockSize = resumeData.blobSize % resumeData.blockSize;
      if (lastBlockSize > 0)
        return lastBlockSize;
    }
    return resumeData.blockSize;
  }
  private static getByteRange(resumeData: ResumeData, blockId: number): { startByte: number, endByte: number } {
    const startByte = resumeData.blockSize * blockId;
    const endByte = startByte + this.getBlockSize(resumeData, blockId) - 1;
    return { startByte, endByte };
  }
  private static async downloadBlock(session: SessionData, blockId: number, agent: HttpsAgent) {
    const downloadLink = session.resumeData.downloadUrl;
    const targetFile = session.resumeData.tempName;
    const { startByte, endByte } = this.getByteRange(session.resumeData, blockId);
    try {
      const downloadStream = got.stream(downloadLink, {
        method: "GET",
        retry: 5,
        agent: { https: agent },
        throwHttpErrors: true,
        headers: { range: `bytes=${startByte}-${endByte}` },
      });
      downloadStream.on("data", (chunk: any) => {
        session.bytesDownloaded += chunk.length;
        if ((Date.now() - session.speedWindowResetOn) > session.speedWindowInSecond * 1000) {
          session.speedWindowResetOn = Date.now();
          session.speedWindowBytes = chunk.length;
        } else {
          session.speedWindowBytes += chunk.length;
        }
      });
      await this.pipeline(downloadStream, fs.createWriteStream(targetFile, { flags: "r+", start: startByte }));
      this.markCompleted(session, blockId);
    } catch (err) {
      this.markFailed(session, blockId);
      session.lastError = err;
      session.failedBocks++;
      if (session.failedBocks > 10) {
        throw new Error("failed to download");
      }
    }
  }
  private static getHttpsAgent(parallelDownloadRequestCount: number) {
    return new HttpsAgent({
      maxSockets: parallelDownloadRequestCount,
      maxFreeSockets: parallelDownloadRequestCount,
      timeout: 60 * 1000, // active socket keepalive for 60 seconds
      freeSocketTimeout: 30 * 1000, // free socket keepalive for 30 seconds
    });
  }
  private static async downloadBlocks(session: SessionData, agent: HttpsAgent) {
    let blockId = this.nextBlockId(session.resumeData);
    while (blockId >= 0 && !session.cancelled) {
      await this.downloadBlock(session, blockId, agent);
      blockId = this.nextBlockId(session.resumeData);
    }
  }
  private static async checkDownloadedFileMD5(session: SessionData) {
    if (session.resumeData.blobMD5 !== "" && session.config.checkMD5AfterDownload! && !this.hasPendingBlocks(session.resumeData)) {
      const md5 = await this.calculateFileMD5(session.resumeData.fileName);
      if (md5 !== session.resumeData.blobMD5) {
        throw new Error(`${session.resumeData.fileName} md5 hash ${md5} != ${session.resumeData.blobMD5}`);
      }
    }
  }
  private static getProgress(sessionData: SessionData) {
    const resumeData = sessionData.resumeData;

    let blocksPending = 0;
    let blocksDownloading = 0;
    let blocksDownloaded = 0;
    let bytesDone = 0;
    const bytesTotal = resumeData.blobSize;
    resumeData.blocks.forEach((blockState, blockId) => {
      if (blockState === BlockState.Downloaded) {
        blocksDownloaded++;
        bytesDone += this.getBlockSize(resumeData, blockId);
      } else if (blockState === BlockState.Downloading) {
        blocksDownloading++;
      } else if (blockState === BlockState.Pending) {
        blocksPending++;
      }
    });
    const percentage = Number(((bytesDone / bytesTotal) * 100).toFixed(1));
    const speed = sessionData.bytesDownloaded / ((Date.now() - sessionData.startedOn) / 1000);
    const winSpeed = sessionData.speedWindowBytes / ((Date.now() - sessionData.speedWindowResetOn) / 1000);
    return {
      bytesTotal,
      bytesDone,
      percentage,
      blocksDownloading,
      blocksDownloaded,
      blocksPending,
      downloadRateBytesPerSec: speed,
      windowRateBytesPerSec: winSpeed,
    };
  }
  private static startProgress(session: SessionData) {
    if (session.progressTimer)
      return;
    let lastReportedBytes = 0;
    session.progressTimer = setInterval(() => {
      if (lastReportedBytes !== session.bytesDownloaded) {
        session.progress.raiseEvent(this.getProgress(session));
        lastReportedBytes = session.bytesDownloaded;
      }
    }, 1000);
  }
  private static stopProgress(session: SessionData) {
    if (session.progressTimer)
      clearInterval(session.progressTimer);
  }
  private static checkDownloadCancelled(session: SessionData) {
    if (session.cancelled)
      throw new UserCancelledError(BriefcaseStatus.DownloadCancelled, "User cancelled download", Logger.logWarning);
  }
  private static async checkAnotherProcessIsDownloadingSameFile(session: SessionData): Promise<boolean> {
    // some other process is downloading
    let lastCheckTime = 0;
    let initialBytes = 0;
    try {
      while (checkSync(session.resumeData.tempName)) {
        this.checkDownloadCancelled(session);
        try {
          const resumeDataFile = `${session.resumeData.fileName}-resume`;
          if (fs.existsSync(resumeDataFile)) {
            const mtime = fs.lstatSync(resumeDataFile).mtimeMs;
            if (mtime > lastCheckTime + 1000) {
              lastCheckTime = mtime;
              const json = fs.readFileSync(resumeDataFile, { encoding: "utf8" });
              const resumeData = JSON.parse(json) as ResumeData;
              let blocksPending = 0;
              let blocksDownloading = 0;
              let blocksDownloaded = 0;
              let bytesDone = 0;
              const bytesTotal = resumeData.blobSize;
              resumeData.blocks.forEach((blockState, blockId) => {
                if (blockState === BlockState.Downloaded) {
                  blocksDownloaded++;
                  bytesDone += this.getBlockSize(resumeData, blockId);
                } else if (blockState === BlockState.Downloading) {
                  blocksDownloading++;
                } else if (blockState === BlockState.Pending) {
                  blocksPending++;
                }
              });
              if (initialBytes === 0)
                initialBytes = bytesDone;
              const speed = bytesDone === initialBytes ? 0 : (bytesDone - initialBytes) / ((Date.now() - session.startedOn) / 1000);
              const percentage = Number(((bytesDone / bytesTotal) * 100).toFixed(1));
              session.progress.raiseEvent({ bytesTotal, bytesDone, percentage, blocksDownloaded, blocksDownloading, blocksPending, downloadRateBytesPerSec: speed, windowRateBytesPerSec: speed });
            }
          }
        } catch {/* ignore error if any */ }
      }
    } catch {
      // Error: ENOENT: no such file or directory
      // Above error is fine if file download is complete by another process
    }
    if (fs.existsSync(session.resumeData.fileName)) {
      return true;
    }
    return false;
  }
  public static formatBytes(bytes: number) {
    const kb = 1024;
    const mb = kb * kb;
    const gb = mb * mb;
    if (bytes < kb) return `${bytes} B`;
    if (bytes < mb) return `${(bytes / kb).toFixed(1)} KB`;
    if (bytes < gb) return `${(bytes / mb).toFixed(1)} MB`;
    return `${(bytes / mb).toFixed(1)} GB`;
  }
  public static formatRate(bytePerSec: number) {
    const kb = 1024;
    const mb = kb * kb;
    const gb = mb * mb;
    if (bytePerSec < kb) return `${bytePerSec} B/s`;
    if (bytePerSec < mb) return `${(bytePerSec / kb).toFixed(1)} KB/s`;
    if (bytePerSec < gb) return `${(bytePerSec / mb).toFixed(1)} MB/s`;
    return `${(bytePerSec / gb).toFixed(1)} GB/s`;
  }
  public static async downloadFile(downloadUrl: string, downloadFile: string, config: ConfigData = {}, onProgress?: (data: ProgressData) => void, cancelRequest?: CancelRequest) {
    const unlock = await this.mutex.lock();
    const downloadSession = this.downloads.get(downloadFile);
    if (downloadSession) {
      if (cancelRequest)
        cancelRequest.cancel = () => { downloadSession.cancelled = true; return true; };
      if (onProgress)
        downloadSession.progress.addListener(onProgress);
      unlock();
      return downloadSession.ready;
    }
    const session = await this.createSession(downloadUrl, downloadFile, config, onProgress, cancelRequest);
    this.downloads.set(downloadFile, session);
    // let start download
    session.ready = new Promise(async (resolve, reject) => {
      const isDownloaded = await this.checkAnotherProcessIsDownloadingSameFile(session);
      if (isDownloaded) {
        if (!fs.existsSync(session.resumeData.fileName))
          throw new Error("file does not exist");
        resolve();
        return;
      }
      const release = lockSync(session.resumeData.tempName, { stale: 10000 });
      try {
        if (this.hasPendingBlocks(session.resumeData)) {
          this.startProgress(session);
          const simTask = Math.min(session.config.simultaneousDownloads!, session.resumeData.blocks.length);
          const httpsAgent = this.getHttpsAgent(simTask);
          const worker = Array(simTask).fill(undefined).map( async () => this.downloadBlocks(session, httpsAgent));
          await Promise.all(worker);
          this.stopProgress(session);
        }
        this.saveResumeData(session);
        this.checkDownloadCancelled(session);
        fs.renameSync(session.resumeData.tempName, session.resumeData.fileName);
        await this.checkDownloadedFileMD5(session);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        this.downloads.delete(downloadFile);
        release();
      }
    });
    unlock();
    return session.ready;
  }
}