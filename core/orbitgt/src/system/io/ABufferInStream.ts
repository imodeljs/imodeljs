/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module OrbitGT
 */

// package orbitgt.system.io;

type int8 = number;
type int16 = number;
type int32 = number;
type float32 = number;
type float64 = number;

import { ABuffer } from "../buffer/ABuffer";
import { InStream } from "./InStream";

/**
 * Class ABufferInStream defines a stream on top of a buffer.
 */
/** @internal */
export class ABufferInStream extends InStream {
    private _buffer: ABuffer;
    private _offset: int32;
    private _size: int32;

    private _position: int32;
    private _extent: int32;

    /**
       * Create a new stream.
       */
    public constructor(buffer: ABuffer, offset: int32, size: int32) {
        super();
        this._buffer = buffer;
        this._offset = offset;
        this._size = size;
        this._position = this._offset;
        this._extent = this._offset + size;
    }

    public getOffset(): int32 {
        return this._offset;
    }

    public getSize(): int32 {
        return this._size;
    }

    public getPosition(): int32 {
        return this._position;
    }

    /**
       * InStream method override
       */
    public override read(): int32 {
        if (this._position >= this._extent) return -1;
        return this._buffer.get(this._position++);
    }
}
