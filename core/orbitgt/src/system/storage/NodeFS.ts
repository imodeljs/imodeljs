/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module OrbitGT
 */

import * as fs from "fs";
import { ABuffer } from "../buffer/ABuffer";
import { AList } from "../collection/AList";
import { ALong } from "../runtime/ALong";
import { ASystem } from "../runtime/ASystem";
import { FileContent } from "./FileContent";
import { FileRange } from "./FileRange";
import { FileStorage } from "./FileStorage";

type int8 = number;
type int16 = number;
type int32 = number;
type float32 = number;
type float64 = number;

/**
 * Class NodeFS provides access to files using the Node platform.
 */
/** @internal */
export class NodeFS extends FileStorage {
    /**
       * Create new storage.
       */
    public constructor() {
        super();
    }

    /**
       * FileStorage method.
       */
    public override close(): void {
    }

    /**
       * FileStorage method.
       */
    public override async getFileLength(fileName: string): Promise<ALong> {
        const fileStats: fs.Stats = fs.statSync(fileName);
        return ALong.fromDouble(fileStats.size);
    }

    /**
       * FileStorage method.
       */
    public override async readFilePart(fileName: string, offset: ALong, size: int32): Promise<ABuffer> {
        const rawBuffer: ArrayBuffer = new ArrayBuffer(size);
        const buffer: Uint8Array = new Uint8Array(rawBuffer);
        const fd: number = fs.openSync(fileName, "r");
        const bytesRead: number = fs.readSync(fd, buffer, 0, size, offset.toDouble());
        fs.closeSync(fd);
        ASystem.assert0(bytesRead == size, `Expected ${size} bytes read, not ${bytesRead} from file '${fileName}' offset ${offset.toDouble()}`);
        return ABuffer.wrap(rawBuffer);
    }

    /**
       * FileStorage method.
       */
    public override async readFileParts(fileName: string, ranges: AList<FileRange>): Promise<AList<FileContent>> {
        const buffers: AList<FileContent> = new AList<FileContent>();
        const fd: number = fs.openSync(fileName, "r");
        for (let i: number = 0; i < ranges.size(); i++) {
            const range: FileRange = ranges.get(i);
            const rawBuffer: ArrayBuffer = new ArrayBuffer(range.size);
            const buffer: Uint8Array = new Uint8Array(rawBuffer);
            const bytesRead: number = fs.readSync(fd, buffer, 0, range.size, range.offset.toDouble());
            ASystem.assert0(bytesRead == range.size, `Expected ${range.size} bytes read, not ${bytesRead} from file '${fileName}' offset ${range.offset.toDouble()}`);
            buffers.add(new FileContent(range.offset, ABuffer.wrap(rawBuffer)));
        }
        fs.closeSync(fd);
        return buffers;
    }

    /**
       * FileStorage method.
       */
    public override async writeFile(fileName: string, fileContent: ABuffer): Promise<void> {
        const fd: number = fs.openSync(fileName, "w");
        fs.writeSync(fd, new Uint8Array(fileContent.toNativeBuffer()));
        fs.closeSync(fd);
    }
}
