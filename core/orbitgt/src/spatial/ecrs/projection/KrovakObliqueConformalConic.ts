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
import { Ellipsoid } from "../Ellipsoid";
import { Operation } from "../Operation";
import { OperationMethod } from "../OperationMethod";
import { ParameterValueList } from "../ParameterValueList";

/**
 * Class KrovakObliqueConformalConic defines the Krovak Oblique Conformal Conic projection as used in the Czech Republic and Slovakia.
 *
 * The 'source' CRS is the geographic CRS.
 * The 'target' CRS is the projected CRS.
 *
 * Based on the following document:
 *
 * Coordinate Conversions and Transformations including Formulas
 * Guidance Note Number 7, part 2 (version 6.18.3)
 * Revised January 2009
 * Available at: http://www.epsg.org/
 *
 * Formulas: see 1.3.2 "Krovak Oblique Conformal Conic"
 *
 * NOTE: the X axis runs north to south and the Y axis runs east to west. This differs from most other projections.
 *
 * @version 1.0 October 2009
 */
/** @internal */
export class KrovakObliqueConformalConic extends OperationMethod {
    /** The code of this method */
    public static readonly METHOD_CODE: int32 = 9819;

    /** Latitude of projection center */
    private _latC: float64;
    /** Longitude of origin */
    private _lonO: float64;
    /** Azimuth of initial line through the projection center */
    private _aziC: float64;
    /** Latitude of pseudo standard parallel */
    private _latP: float64;
    /** Scale factor on pseudo standard parallel */
    private _kP: float64;
    /** Easting at grid origin */
    private _FE: float64;
    /** Northing at grid origin */
    private _FN: float64;

    /** The constants */
    private _A: float64;
    private _B: float64;
    private _gO: float64;
    private _tO: float64;
    private _n: float64;
    private _rO: float64;

    /**
       * Create a new projection.
       * @param parameters the values of the parameters.
       */
    public constructor(parameters: ParameterValueList) {
        super(KrovakObliqueConformalConic.METHOD_CODE, "Krovak Oblique Conic Conformal", parameters);
        /* Store the parameters */
        this._latC = parameters.getValue(8811);
        this._lonO = parameters.getValue(8833);
        this._aziC = parameters.getValue(1036); // Parameter 8813 has been changed to 1036 for method 9819 in EPSG version 7.7. updated on 31/08/2017.
        this._latP = parameters.getValue(8818);
        this._kP = parameters.getValue(8819);
        this._FE = parameters.getValue(8806);
        this._FN = parameters.getValue(8807);
    }

    /**
       * Get the square of a number.
       */
    private static sqr(v: float64): float64 {
        return (v * v);
    }

    /**
       * OperationMethod method.
       * @see OperationMethod#initialize
       */
    public override initialize(operation: Operation): void {
        /* Prepare the parameters */
        const ellipsoid: Ellipsoid = operation.getSourceCRS().getEllipsoid();
        const a: float64 = ellipsoid.getA();
        const e: float64 = ellipsoid.getE();
        const e2: float64 = e * e;
        this._A = a * Math.sqrt(1.0 - e2) / (1.0 - KrovakObliqueConformalConic.sqr(e * Math.sin(this._latC)));
        this._B = Math.sqrt(1.0 + e2 * Math.pow(Math.cos(this._latC), 4) / (1.0 - e2));
        this._gO = Math.asin(Math.sin(this._latC) / this._B);
        this._tO = Math.tan(Math.PI / 4 + this._gO / 2) * Math.pow((1 + e * Math.sin(this._latC)) / (1 - e * Math.sin(this._latC)), e * this._B / 2) / Math.pow(Math.tan(Math.PI / 4 + this._latC / 2), this._B);
        this._n = Math.sin(this._latP);
        this._rO = this._kP * this._A / Math.tan(this._latP);
    }

    /**
       * OperationMethod interface method.
       * @see OperationMethod#forward
       */
    public forward(sourceCRS: CRS, source: Coordinate, targetCRS: CRS, target: Coordinate): void {
        /* Get the parameters */
        const lon: float64 = source.getX();
        const lat: float64 = source.getY();
        /* Calculate easting and northing */
        const e: float64 = sourceCRS.getEllipsoid().getE();
        const U: float64 = 2 * (Math.atan(this._tO * Math.pow(Math.tan(lat / 2 + Math.PI / 4), this._B) / Math.pow((1 + e * Math.sin(lat)) / (1 - e * Math.sin(lat)), e * this._B / 2)) - Math.PI / 4);
        const V: float64 = this._B * (this._lonO - lon);
        const S: float64 = Math.asin(Math.cos(this._aziC) * Math.sin(U) + Math.sin(this._aziC) * Math.cos(U) * Math.cos(V));
        const D: float64 = Math.asin(Math.cos(U) * Math.sin(V) / Math.cos(S));
        const theta: float64 = this._n * D;
        const r: float64 = this._rO * Math.pow(Math.tan(Math.PI / 4 + this._latP / 2), this._n) / Math.pow(Math.tan(S / 2 + Math.PI / 4), this._n);
        const E: float64 = this._FE + r * Math.cos(theta);
        const N: float64 = this._FN + r * Math.sin(theta);
        /* Save the position */
        target.setX(E);
        target.setY(N);
        target.setZ(source.getZ()); // Keep the Z value
    }

    /**
       * OperationMethod interface method.
       * @see OperationMethod#reverse
       */
    public reverse(sourceCRS: CRS, source: Coordinate, targetCRS: CRS, target: Coordinate): void {
        /* Get the easting and northing */
        const E: float64 = target.getX();
        const N: float64 = target.getY();
        /* Get the ellipsoid parameters */
        const e: float64 = sourceCRS.getEllipsoid().getE();
        /* Calculate longitude and latitude */
        const r: float64 = Math.sqrt(KrovakObliqueConformalConic.sqr(E - this._FE) + KrovakObliqueConformalConic.sqr(N - this._FN));
        const theta: float64 = Math.atan2((N - this._FN), (E - this._FE));
        const D: float64 = theta / Math.sin(this._latP);
        const S: float64 = 2 * (Math.atan(Math.pow(this._rO / r, 1 / this._n) * Math.tan(Math.PI / 4 + this._latP / 2)) - Math.PI / 4);
        const U: float64 = Math.asin(Math.cos(this._aziC) * Math.sin(S) - Math.sin(this._aziC) * Math.cos(S) * Math.cos(D));
        const V: float64 = Math.asin(Math.cos(S) * Math.sin(D) / Math.cos(U));
        /* Iterate */
        let lat: float64 = U;
        for (let i: number = 1; i < 5; i++) {
            lat = 2 * (Math.atan(Math.pow(this._tO, -1 / this._B) * Math.pow(Math.tan(U / 2 + Math.PI / 4), 1 / this._B) * Math.pow((1 + e * Math.sin(lat)) / (1 - e * Math.sin(lat)), e / 2)) - Math.PI / 4);
        }
        const lon: float64 = this._lonO - V / this._B;
        /* Save the position */
        source.setX(lon);
        source.setY(lat);
        source.setZ(target.getZ()); // Keep the Z value
    }
}
