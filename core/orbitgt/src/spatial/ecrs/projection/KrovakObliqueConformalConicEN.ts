/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module OrbitGT
 */

// package orbitgt.spatial.ecrs.projection;

type int8 = number;
type int16 = number;
type int32 = number;
type float32 = number;
type float64 = number;

import { Coordinate } from "../../geom/Coordinate";
import { CRS } from "../CRS";
import { Operation } from "../Operation";
import { OperationMethod } from "../OperationMethod";
import { ParameterValueList } from "../ParameterValueList";
import { KrovakObliqueConformalConic } from "./KrovakObliqueConformalConic";

/**
 * Class KrovakObliqueConformalConicEN defines the "East-North" variant of the Krovak Oblique Conformal Conic projection.
 *
 * In the standard projection X runs from north to south and Y runs from east to west.
 * This seems awkward to most users. They prefer X from west to east and Y from south to north.
 * Therefore an alternative is provided in which both axes are inversed and swapped.
 * This leads to a more traditional map.
 *
 * @version 1.0 October 2009
 */
/** @internal */
export class KrovakObliqueConformalConicEN extends OperationMethod {
    /** The code of this method */
    public static readonly METHOD_CODE: int32 = 1041;

    /** The original projection */
    private projection: KrovakObliqueConformalConic;

    /**
       * Create a new projection.
       * @param parameters the values of the parameters.
       */
    public constructor(parameters: ParameterValueList) {
        super(KrovakObliqueConformalConicEN.METHOD_CODE, "Krovak Oblique Conic Conformal East-North", parameters);
        /* Create the projection */
        this.projection = new KrovakObliqueConformalConic(parameters);
    }

    /**
       * OperationMethod method.
       * @see OperationMethod#initialize
       */
    public override initialize(operation: Operation): void {
        /* Prepare the projection */
        this.projection.initialize(operation);
    }

    /**
       * OperationMethod interface method.
       * @see OperationMethod#forward
       */
    public forward(sourceCRS: CRS, source: Coordinate, targetCRS: CRS, target: Coordinate): void {
        /* Do the forward projection */
        this.projection.forward(sourceCRS, source, targetCRS, target);
        /* Get the original position */
        const E: float64 = target.getX();
        const N: float64 = target.getY();
        /* Swap */
        target.setX(-N);
        target.setY(-E);
    }

    /**
       * OperationMethod interface method.
       * @see OperationMethod#reverse
       */
    public reverse(sourceCRS: CRS, source: Coordinate, targetCRS: CRS, target: Coordinate): void {
        /* Get the swapped position */
        const N: float64 = -target.getX();
        const E: float64 = -target.getY();
        /* Swap (leave the target coordinate untouched) */
        source.setX(E);
        source.setY(N);
        /* Do the reverse projection */
        this.projection.reverse(sourceCRS, source, targetCRS, source/* target*/);
    }
}
