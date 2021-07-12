/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module OrbitGT
 */

import * as http from "http";
import * as https from "https";
import { ABuffer } from "../buffer/ABuffer";
import { StringMap } from "../collection/StringMap";
import { Downloader } from "./Downloader";

/**
 * Class DownloaderNode implements a downloader using the Node platform.
 */
/** @internal */
export class DownloaderNode extends Downloader {
    // create a new downloader
    //
    public constructor() {
        super();
    }

    // join the downloaded chunks into the requested response type
    //
    private static joinChunks(buffers: Array<Buffer>, responseType: string): any {
        //console.log("joining "+buffers.length+" downloaded chunks to type '"+responseType+"'");
        let joined: Buffer = Buffer.concat(buffers);
        if (responseType === "text") return joined.toString('utf8');
        return ABuffer.wrapRange(joined.buffer, joined.byteOffset, joined.length);
    }

    // make a generic download
    //
    private download0(method: string, requestURL: string, responseType: string, requestHeaders: StringMap<string>, postText: string, postData: ABuffer, responseHeaders: StringMap<string>, callback: (response: any) => void, errorCallback: (err: any) => void): void {
        // set the defaults
        if (method == null) method = "GET";
        if (requestHeaders == null) requestHeaders = new StringMap<string>();
        // set the options
        //console.log("connect method '"+method+"' to '"+requestURL+"'");
        let options: object = {};
        options["method"] = method;
        // set the URL
        let url: URL = new URL(requestURL);
        options["protocol"] = url.protocol;
        options["host"] = url.hostname;
        options["port"] = url.port;
        options["path"] = url.pathname + url.search;
        // set the request headers
        if (requestHeaders.size() > 0) {
            // create the headers object
            //console.log("adding request headers");
            let headers: object = {};
            options["headers"] = headers;
            // add the header lines
            for (let headerName of requestHeaders.keys()) {
                let headerValue: string = requestHeaders.get(headerName);
                //console.log("setting request header '"+headerName+"' value '"+headerValue+"'");
                headers[headerName] = headerValue;
            }
        }
        // make the request
        let request: http.ClientRequest;
        if (url.protocol === "http:") request = http.request(options, (response) => {
            //console.log("download '"+requestURL+"' response code: "+response.statusCode);
            if (responseHeaders != null) {
                for (let propertyName in response.headers) {
                    if (typeof response.headers[propertyName] === "string") responseHeaders.set(propertyName, response.headers[propertyName] as string);
                }
            }
            // process the incoming download chuncks
            let chunks: Array<Buffer> = [];
            response.on("data", data => { chunks.push(data); });
            response.on("end", () => { callback(DownloaderNode.joinChunks(chunks, responseType)); });
            response.on("error", () => { errorCallback("error when downloading '" + requestURL + "'"); });
        })
        else request = https.request(options, (response) => {
            //console.log("download '"+requestURL+"' response code: "+response.statusCode);
            if (responseHeaders != null) {
                for (let propertyName in response.headers) {
                    if (typeof response.headers[propertyName] === "string") responseHeaders.set(propertyName, response.headers[propertyName] as string);
                }
            }
            // process the incoming download chuncks
            let chunks: Array<Buffer> = [];
            response.on("data", data => { chunks.push(data); });
            response.on("end", () => { callback(DownloaderNode.joinChunks(chunks, responseType)); });
            response.on("error", () => { errorCallback("error when downloading '" + requestURL + "'"); });
        });
        // post text?
        if (postText != null) {
            // send the request to the server
            //console.log("posting text '"+postText+"'");
            request.write(postText); // encoding argument is optional, defaults to 'utf8'
        }
        // post data?
        else if (postData != null) {
            // send the request to the server
            //console.log("posting binary data, size "+postData.size());
            request.write(Buffer.from(postData.toNativeBuffer()));
        }
        // send the request
        request.end();
    }

    // Downloader base class method override
    //
    public override async downloadBytes(method: string, requestURL: string, requestHeaders: StringMap<string>, postText: string, postData: ABuffer, responseHeaders: StringMap<string>): Promise<ABuffer> {
        return new Promise<ABuffer>((resolve, reject) => { this.download0(method, requestURL, "arraybuffer"/*responseType*/, requestHeaders, postText, postData, responseHeaders, resolve, reject); });
    }

    // Downloader base class method override
    //
    public override async downloadText(method: string, requestURL: string, requestHeaders: StringMap<string>, postText: string, postData: ABuffer, responseHeaders: StringMap<string>): Promise<string> {
        return new Promise<string>((resolve, reject) => { this.download0(method, requestURL, "text"/*responseType*/, requestHeaders, postText, postData, responseHeaders, resolve, reject); });
    }

    // Downloader base class method override
    //
    public override async downloadText2(requestURL: string): Promise<string> {
        return await this.downloadText("GET", requestURL, null, null, null, null);
    }
}
