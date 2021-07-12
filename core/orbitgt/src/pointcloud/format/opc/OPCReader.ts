/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module OrbitGT
 */

// package orbitgt.pointcloud.format.opc;

type int8 = number;
type int16 = number;
type int32 = number;
type float32 = number;
type float64 = number;

import { Bounds } from "../../../spatial/geom/Bounds";
import { Coordinate } from "../../../spatial/geom/Coordinate";
import { ABuffer } from "../../../system/buffer/ABuffer";
import { Uint16Buffer } from "../../../system/buffer/Uint16Buffer";
import { Uint8Buffer } from "../../../system/buffer/Uint8Buffer";
import { AList } from "../../../system/collection/AList";
import { ALong } from "../../../system/runtime/ALong";
import { ASystem } from "../../../system/runtime/ASystem";
import { Message } from "../../../system/runtime/Message";
import { Strings } from "../../../system/runtime/Strings";
import { ContentLoader } from "../../../system/storage/ContentLoader";
import { FileStorage } from "../../../system/storage/FileStorage";
import { AttributeValue } from "../../model/AttributeValue";
import { BlockIndex } from "../../model/BlockIndex";
import { CloudPoint } from "../../model/CloudPoint";
import { Grid } from "../../model/Grid";
import { PointAttribute } from "../../model/PointAttribute";
import { PointCloudReader } from "../../model/PointCloudReader";
import { PointData } from "../../model/PointData";
import { PointDataRaw } from "../../model/PointDataRaw";
import { ReadRequest } from "../../model/ReadRequest";
import { StandardAttributes } from "../../model/StandardAttributes";
import { TileIndex } from "../../model/TileIndex";
import { AttributeMask } from "./AttributeMask";
import { AttributeReader } from "./AttributeReader";
import { DirectoryReader } from "./DirectoryReader";
import { FileReader } from "./FileReader";
import { PointReader } from "./PointReader";
import { TileReadBuffer } from "./TileReadBuffer";

/**
 * Class OPCReader reads pointcloud files.
 *
 * @version 1.0 January 2014
 */
/** @internal */
export class OPCReader extends PointCloudReader {
    /** The file reader */
    private _fileReader: FileReader;
    /** The index of the first level */
    private _levelOffset: int32;
    /** The number of levels */
    private _levelCount: int32;

    /**
       * Create a new reader for a file.
       * @param fileName the name of the file.
       * @param lazyLoading avoid early loading of all block indexes to keep a low memory profile? Lazy loading only loads the block indexes of the top 6 levels (see CLOUD-1152 issue)
       * @return the reader.
       */
    public static async openFile(fileStorage: FileStorage, fileName: string, lazyLoading: boolean): Promise<OPCReader> {
        /* Open the file */
        const fileReader: FileReader = await FileReader.openFile(fileStorage, fileName, lazyLoading);
        /* Create the reader */
        return new OPCReader(fileReader, 0, fileReader.getLevelCount());
    }

    /**
       * Create a new reader.
       */
    private constructor(fileReader: FileReader, levelOffset: int32, levelCount: int32) {
        super();
        this._fileReader = fileReader;
        this._levelOffset = levelOffset;
        this._levelCount = levelCount;
    }

    /**
       * Get the file reader.
       * @return the file reader.
       */
    public getFileReader(): FileReader {
        return this._fileReader;
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#close
       */
    public override close(): void {
        if (this._fileReader != null) this._fileReader.close();
        this._fileReader = null;
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#getProperty
       */
    public override getProperty(propertyName: string): Object {
        if (propertyName == null) return null;
        if (Strings.equalsIgnoreCase(propertyName, "metricCellSize")) return new Coordinate(this._fileReader.getFileRecord().getMetricCellSize(), 0.0, 0.0);
        return null;
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#getFileStorage
       */
    public override getFileStorage(): FileStorage {
        return this._fileReader.getFileStorage();
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#getFileName
       */
    public override getFileName(): string {
        return this._fileReader.getFileName();
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#getFileCRS
       */
    public override getFileCRS(): string {
        return this._fileReader.getFileRecord().getCRS();
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#getFileBounds
       */
    public override getFileBounds(): Bounds {
        return this._fileReader.getGeometryReader(0).getGeometryRecord().getBounds();
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#getPointAttributes
       */
    public override getPointAttributes(): Array<PointAttribute> {
        return this._fileReader.getAttributes();
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#getMinAttributeValue
       */
    public override getMinAttributeValue(attribute: PointAttribute): AttributeValue {
        for (const reader of this._fileReader.getAttributeReaders()) if (reader.getAttribute().hasName(attribute.getName())) return reader.getMinimumValue();
        return null;
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#getMaxAttributeValue
       */
    public override getMaxAttributeValue(attribute: PointAttribute): AttributeValue {
        for (const reader of this._fileReader.getAttributeReaders()) if (reader.getAttribute().hasName(attribute.getName())) return reader.getMaximumValue();
        return null;
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#getLevelCount
       */
    public override getLevelCount(): int32 {
        return this._fileReader.getLevelCount();
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#getLevelPointCount
       */
    public override getLevelPointCount(level: int32): ALong {
        return this._fileReader.getDirectoryReader(level).getDirectoryRecord().getPointCount();
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#getLevelPointBounds
       */
    public override getLevelPointBounds(level: int32): Bounds {
        return this._fileReader.getGeometryReader(level).getGeometryRecord().getBounds();
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#getLevelBlockGrid
       */
    public override getLevelBlockGrid(level: int32): Grid {
        return this.getLevelTileGrid(level).scale(this._fileReader.getFileRecord().getBlockSize());
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#getLevelTileGrid
       */
    public override getLevelTileGrid(level: int32): Grid {
        return this._fileReader.getGeometryReader(level).getGeometryRecord().getTileGrid();
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#peekBlockIndexes
       */
    public override peekBlockIndexes(level: int32): Array<BlockIndex> {
        return this._fileReader.getDirectoryReader(level).getBlocks();
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#readBlockIndexes
       */
    public override readBlockIndexes(level: int32, fileContents: ContentLoader): Array<BlockIndex> {
        /* Get the directory reader */
        const directoryReader: DirectoryReader = this._fileReader.getDirectoryReader(level);
        /* Already read all blocks? */
        const blocks: Array<BlockIndex> = directoryReader.getBlocks();
        if (blocks.length > 0) return blocks;
        /* Delegate to the directory reader */
        return directoryReader.readBlocks(this._fileReader.getFileRecord(), fileContents);
    }

    /**
       * PointCloudReader method.
       * @see PointCloudReader#readTileIndexes
       */
    public override readTileIndexes(block: BlockIndex, fileContents: ContentLoader): Array<TileIndex> {
        return this._fileReader.getDirectoryReader(block.level).readTiles2(block, fileContents);
    }

    /**
       * Get the attribute mask to use for reading.
       * @param parameters the read parameters.
       * @return the attribute mask.
       */
    private getAttributeMask(parameters: ReadRequest): AttributeMask {
        /* Make a list of readers */
        const readers: AList<AttributeReader> = new AList<AttributeReader>();
        /* Should we read all attributes? */
        if (parameters.readAllExtraAttributes()) {
            /* Read all attributes */
            for (const reader of this._fileReader.getAttributeReaders()) readers.add(reader);
        } else {
            /* Read color? */
            if (parameters.readColor()) {
                const reader: AttributeReader = this._fileReader.findAttributeReader(StandardAttributes.COLOR.getName());
                if (reader != null) readers.add(reader);
            }
            /* Read intensity? */
            if (parameters.readIntensity()) {
                const reader: AttributeReader = this._fileReader.findAttributeReader(StandardAttributes.INTENSITY.getName());
                if (reader != null) readers.add(reader);
            }
            /* Read the extra attributes */
            const extraAttributes: AList<string> = parameters.getExtraAttributes();
            for (let i: number = 0; i < extraAttributes.size(); i++) {
                /* Get the name of the extra attribute */
                const extraAttribute: string = extraAttributes.get(i);
                /* Did we already add the color? */
                if (parameters.readColor() && Strings.equalsIgnoreCase(extraAttribute, StandardAttributes.COLOR.getName())) continue;
                /* Did we already add the intensity? */
                if (parameters.readIntensity() && Strings.equalsIgnoreCase(extraAttribute, StandardAttributes.INTENSITY.getName())) continue;
                /* Find the attribute reader */
                const reader: AttributeReader = this._fileReader.findAttributeReader(extraAttribute);
                /* Add the reader */
                if (reader != null) readers.add(reader);
            }
        }
        /* Create the mask */
        return new AttributeMask(readers);
    }

    /**
       * PointCloudReader interface method.
       * @see PointCloudReader#readPoints
       */
    public override readPoints(tileIndex: TileIndex, readRequest: ReadRequest, fileContents: ContentLoader): AList<CloudPoint> {
        /* Create the attribute mask */
        const attributeMask: AttributeMask = this.getAttributeMask(readRequest);
        /* Create the read buffer */
        const tileBuffer: TileReadBuffer = new TileReadBuffer(attributeMask.attributes.length);
        /* Read the points in the tile */
        const pointOffset: int32 = 0;
        const pointCount: int32 = tileIndex.pointCount;
        return PointReader.readTilePoints(this.getFileReader(), readRequest, attributeMask, tileIndex.level, tileIndex, pointOffset, pointCount, tileBuffer, fileContents);
    }

    /**
       * PointCloudReader interface method.
       * @see PointCloudReader#readPointData
       */
    public override readPointData(tileIndex: TileIndex, dataFormat: int32, accessTime: float64, fileContents: ContentLoader): PointData {
        /* 16-bit XYZ geometry and 8-bit RGB colors? */
        if (dataFormat == PointDataRaw.TYPE) {
            /* Create the attribute mask */
            const readRequest: ReadRequest = ReadRequest.READ_GEOMETRY_AND_COLOR;
            const readers: AList<AttributeReader> = new AList<AttributeReader>();
            const colorReader: AttributeReader = this._fileReader.findAttributeReader(StandardAttributes.COLOR.getName());
            if (colorReader != null) readers.add(colorReader);
            const attributeMask: AttributeMask = new AttributeMask(readers);
            /* Has the data been loaded? */
            let tileBuffer: TileReadBuffer = null;
            let pointData: PointDataRaw = null;
            if (fileContents.isAvailable()) {
                /* Create the read buffer */
                tileBuffer = new TileReadBuffer(attributeMask.attributes.length);
                /* Create the point data buffer */
                const tileGrid: Grid = this._fileReader.getGeometryReader(tileIndex.level).getGeometryRecord().getTileGrid();
                const tileBounds: Bounds = tileGrid.getCellBounds(tileIndex.gridIndex);
                pointData = new PointDataRaw(tileIndex, tileBounds, null, null, null);
            }
            /* Fill the point data buffer */
            PointReader.readTilePointsRaw(this.getFileReader(), readRequest, attributeMask, tileIndex, tileBuffer, pointData, fileContents);
            /* Missing color channel after data load? */
            if (fileContents.isAvailable() && (pointData.colors == null)) {
                /* Define the default RGB color (0xE6C60D) */
                const defaultR: int32 = 230;
                const defaultG: int32 = 198;
                const defaultB: int32 = 13;
                /* Create a default color buffer (BGR sample sequence) */
                pointData.colors = Uint8Buffer.wrap(new ABuffer(3 * tileIndex.pointCount));
                for (let i: number = 0; i < tileIndex.pointCount; i++) {
                    pointData.colors.set(3 * i + 0, defaultB);
                    pointData.colors.set(3 * i + 1, defaultG);
                    pointData.colors.set(3 * i + 2, defaultR);
                }
            }
            return pointData;
        }
        /* Unknown format */
        return null;
    }

    /**
       * PointCloudReader interface method.
       * @see PointCloudReader#clipToLevelRange
       */
    public override clipToLevelRange(levelOffset: int32, levelCount: int32): PointCloudReader {
        /* Check the parameters */
        ASystem.assert0(levelOffset >= 0, `Invalid level offset ${levelOffset}`);
        ASystem.assert0(levelCount > 0, `Invalid level count ${levelCount}`);
        ASystem.assert0(levelOffset + levelCount <= this._levelCount, `Level range ${levelOffset}+${levelCount} not possible in ${this._levelCount} levels`);
        /* Create a new reader */
        return new OPCReader(this._fileReader, this._levelOffset + levelOffset, levelCount);
    }
}
