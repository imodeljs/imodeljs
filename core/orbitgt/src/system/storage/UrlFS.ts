/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module OrbitGT
 */

type int8 = number;
type int16 = number;
type int32 = number;
type float32 = number;
type float64 = number;

import { ABuffer } from "../buffer/ABuffer";
import { AList } from "../collection/AList";
import { StringMap } from "../collection/StringMap";
import { ALong } from "../runtime/ALong";
import { ASystem } from "../runtime/ASystem";
import { Downloader } from "../runtime/Downloader";
import { FileContent } from "./FileContent";
import { FileRange } from "./FileRange";
import { FileStorage } from "./FileStorage";

/**
 * Class UrlFS provides access to file content using URLs.
 */
/** @internal */
export class UrlFS extends FileStorage {
    // the downloader to the file
    private _downloader: Downloader;

    // the number of requests that have been made to access the content of the file
    public requestCount: number;
    // the number of content bytes downloaded
    public responseSize: number;

    /**
       * Create the URL to access a blob file in an Azure storage account.
       * @param accountName the name of the Azure storage account.
       * @param containerName the name of the container that stores the blob file.
       * @param blobName the name of the blob (should start with a forward slash).
       * @param sasToken the SAS (shared access signature) of the blob or container (the part after the '?' character of the URL).
       * @return the URL.
       */
    public static getAzureBlobSasUrl(accountName: string, containerName: string, blobName: string, sasToken: string): string {
        let blobURL: string = `https://${accountName}.blob.core.windows.net/${containerName}${blobName}`;
        if (sasToken != null) blobURL += `?${sasToken}`;
        return blobURL;
    }

    /**
       * Create a new instance.
       */
    public constructor() {
        super();
        this._downloader = Downloader.INSTANCE;
        this.requestCount = 0;
        this.responseSize = 0;
    }

    /**
       * FileStorage method.
       */
    public override close(): void {
    }

    /**
       * FileStorage method.
       */
    public override async getFileLength(url: string): Promise<ALong> {
        const requestHeaders: StringMap<string> = null;
        const responseHeaders: StringMap<string> = new StringMap<string>();
        await this._downloader.downloadBytes("HEAD"/* method*/, url, requestHeaders, null/* postText*/, null/* postData*/, responseHeaders);
        const fileLength: number = parseInt(responseHeaders.get("content-length"));
        return ALong.fromDouble(fileLength);
    }

    /**
       * FileStorage method.
       */
    public override async readFilePart(url: string, offset: ALong, size: int32): Promise<ABuffer> {
        const extent: ALong = offset.addInt(size - 1);
        const range: string = `bytes=${offset.toString()}-${extent.toString()}`;
        const requestHeaders: StringMap<string> = new StringMap<string>();
        requestHeaders.set("Range", range);
        // requestHeaders.set("x-ms-range",range); // https://docs.microsoft.com/en-us/rest/api/storageservices/specifying-the-range-header-for-file-service-operations
        const responseHeaders: StringMap<string> = new StringMap<string>();
        const content: ABuffer = await this._downloader.downloadBytes("GET"/* method*/, url, requestHeaders, null/* postText*/, null/* postData*/, responseHeaders);
        const contentLength: number = parseInt(responseHeaders.get("content-length"));
        ASystem.assertNot(contentLength != size, `Expected ${size} bytes of content, not ${contentLength}`);
        ASystem.assertNot(content.size() != size, `Expected content buffer size ${size}, not ${content}`);
        this.requestCount++;
        this.responseSize += size;
        return content;
    }

    /**
       * FileStorage method.
       */
    public override async readFileParts(url: string, ranges: AList<FileRange>): Promise<AList<FileContent>> {
        /* Request all file parts in parallel */
        const contentFetchers: Array<Promise<ABuffer>> = [];
        for (let i: number = 0; i < ranges.size(); i++) {
            const range: FileRange = ranges.get(i);
            const contentFetcher: Promise<ABuffer> = this.readFilePart(url, range.offset, range.size);
            contentFetchers.push(contentFetcher);
        }
        /* Await all requests at once */
        const contentResponses: Array<ABuffer> = await Promise.all(contentFetchers);
        /* Create the result list */
        const contentParts: AList<FileContent> = new AList<FileContent>();
        for (let i: number = 0; i < ranges.size(); i++) {
            const range: FileRange = ranges.get(i);
            const contentResponse: ABuffer = contentResponses[i];
            contentParts.add(new FileContent(range.offset, contentResponse));
        }
        return contentParts;
    }

    /**
       * FileStorage method.
       */
    public override printStatistics(clear: boolean): void {
        console.log("File url access statistics:");
        console.log(`Request count ${this.requestCount}`);
        console.log(`Response size ${this.responseSize}`);
        if (clear) this.requestCount = 0;
        if (clear) this.responseSize = 0;
    }
}
