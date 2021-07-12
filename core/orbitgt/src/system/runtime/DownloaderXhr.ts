/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module OrbitGT
 */

import { ABuffer } from "../buffer/ABuffer";
import { StringMap } from "../collection/StringMap";
import { Downloader } from "./Downloader";

/**
 * Class DownloaderXhr implements a downloader using an XmlHttpRequest (XHR).
 */
/** @internal */
export class DownloaderXhr extends Downloader {
	// create a new downloader
	//
	public constructor() {
		super();
	}

	// read the response headers
	//
	private static readResponseHeaders(request: XMLHttpRequest, responseHeaders: StringMap<string>): void {
		// console.log("reading response headers");
		const headerLines: Array<string> = request.getAllResponseHeaders().trim().split(/[\r\n]+/);
		for (const headerLine of headerLines) {
			const parts: Array<string> = headerLine.split(": ");
			const name: string = parts[0];
			const value: string = request.getResponseHeader(name);
			responseHeaders.set(name, value);
			// console.log("response header '"+name+"' value '"+value+"'");
		}
	}

	// make a generic download
	//
	private download0(method: string, requestURL: string, responseType: string, requestHeaders: StringMap<string>, postText: string, postData: ABuffer, responseHeaders: StringMap<string>, callback: (response: any) => void, errorCallback: (err: any) => void): void {
		// set the defaults
		if (method == null) method = "GET";
		if (requestHeaders == null) requestHeaders = new StringMap<string>();
		// create the request
		// console.log("connect method '"+method+"' to '"+requestURL+"'");
		const request: XMLHttpRequest = new XMLHttpRequest();
		request.open(method, requestURL);
		// set the request headers
		for (const headerName of requestHeaders.keys()) {
			const headerValue: string = requestHeaders.get(headerName);
			request.setRequestHeader(headerName, headerValue);
			// console.log("setting request header '"+headerName+"' value '"+headerValue+"'");
		}
		// set the response type?
		if (responseType != null) {
			// either "arraybuffer" or "blob" or "document" or "json" or "text"
			if (responseType == "bytes") request.responseType = "arraybuffer";
			if (responseType == "arraybuffer") request.responseType = "arraybuffer";
			if (responseType == "blob") request.responseType = "blob";
			if (responseType == "json") request.responseType = "json";
			if (responseType == "text") request.responseType = "text";
			// console.log("response type '"+request.responseType+"'");
		}
		// set the response handler
		request.onload = function () {
			// valid response?
			// console.log("download '"+requestURL+"' response code: "+this.status);
			if (this.status >= 200 && this.status < 400) {
				// read the response headers?
				if (responseHeaders != null) DownloaderXhr.readResponseHeaders(this, responseHeaders);
				// read the reponse body
				if (this.responseType == "arraybuffer") callback(ABuffer.wrap(this.response));
				else callback(this.responseText);
			} else {
				// invalid response
				// console.log("> error code, so no response");
				callback(null);
			}
		};
		// set the error handler
		request.onerror = function (err) {
			console.error(`download '${requestURL}' error: ${err}`);
			errorCallback(err);
		};
		// post text?
		if (postText != null) {
			// send the request to the server
			// console.log("posting text '"+postText+"'");
			request.setRequestHeader("Content-Type", "text/plain");
			request.send(postText);
		}
		// post data?
		else if (postData != null) {
			// send the request to the server
			// console.log("posting binary data, size "+postData.size());
			request.setRequestHeader("Content-Type", "application/octet-stream");
			request.send(postData.toNativeBuffer());
		} else {
			// send the request to the server
			// console.log("sending request");
			request.send(null);
		}
	}

	// Downloader base class method override
	//
	public override async downloadBytes(method: string, requestURL: string, requestHeaders: StringMap<string>, postText: string, postData: ABuffer, responseHeaders: StringMap<string>): Promise<ABuffer> {
		return new Promise<ABuffer>((resolve, reject) => { this.download0(method, requestURL, "arraybuffer"/* responseType*/, requestHeaders, postText, postData, responseHeaders, resolve, reject); });
	}

	// Downloader base class method override
	//
	public override async downloadText(method: string, requestURL: string, requestHeaders: StringMap<string>, postText: string, postData: ABuffer, responseHeaders: StringMap<string>): Promise<string> {
		return new Promise<string>((resolve, reject) => { this.download0(method, requestURL, "text"/* responseType*/, requestHeaders, postText, postData, responseHeaders, resolve, reject); });
	}

	// Downloader base class method override
	//
	public override async downloadText2(requestURL: string): Promise<string> {
		return await this.downloadText("GET", requestURL, null, null, null, null);
	}
}
