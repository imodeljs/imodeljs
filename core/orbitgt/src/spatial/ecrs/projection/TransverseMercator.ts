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
 * Class TransverseMercator defines a Transverse Mercator projection.
 *
 * The 'source' CRS is the geographic CRS.
 * The 'target' CRS is the projected CRS.
 *
 * Based on the following document:
 *
 * Coordinate Conversions and Transformations including Formulas
 * Guidance Note Number 7, part 2
 * Revised August 2006
 * Available at: http://www.epsg.org/
 *
 * Formulas: see 1.4.5.1: General Case
 *
 * @version 1.0 January 2007
 */
/** @internal */
export class TransverseMercator extends OperationMethod {
    /** The code of this method */
    public static readonly METHOD_CODE: int32 = 9807;

    /** The value of PI */
    private static readonly PI: float64 = Math.PI;

    /** Latitude of natural origin (radians) */
    private _latN: float64;
    /** Longitude of natural origin (the central meridian) (radians) */
    private _lonN: float64;
    /** The scale factor at the natural origin */
    private _k0: float64;
    /** False easting */
    private _fE: float64;
    /** False northing */
    private _fN: float64;

    /** Forward calculation parameters */
    private _a: float64;
    private _e: float64;
    private _e2: float64;
    private _e4: float64;
    private _e6: float64;
    private _e_2: float64;
    private _m0: float64;
    /** Reverse calculation parameters */
    private _e1: float64;
    private _R1: float64;
    private _R2: float64;
    private _R3: float64;
    private _R4: float64;

    /**
       * Create a new projection.
       * @param parameters the values of the parameters.
       */
    public constructor(parameters: ParameterValueList) {
        super(TransverseMercator.METHOD_CODE, "Transverse Mercator", parameters);
        /* Store the parameters */
        this._latN = parameters.getValue(8801);
        this._lonN = parameters.getValue(8802);
        this._k0 = parameters.getValue(8805);
        this._fE = parameters.getValue(8806);
        this._fN = parameters.getValue(8807);
    }

    /**
       * Get the power of a number (must be able to handle negative 'n' values).
       */
    private static pow(n: float64, e: int32): float64 {
        let p: float64 = 1.0;
        for (let i: number = 0; i < e; i++) p *= n;
        return p;
    }

    /**
       * Calculate M.
       */
    private calcM(lat: float64): float64 {
        const M: float64 = lat * (1.0 - this._e2 / 4 - 3 * this._e4 / 64 - 5 * this._e6 / 256) - Math.sin(2.0 * lat) * (3 * this._e2 / 8 + 3 * this._e4 / 32 + 45 * this._e6 / 1024) + Math.sin(4.0 * lat) * (15 * this._e4 / 256 + 45 * this._e6 / 1024) - Math.sin(6.0 * lat) * (35 * this._e6 / 3072);
        return this._a * M;
    }

    /**
       * Initialize the projection.
       * @param ellipsoid the ellipsoid to use.
       * @return this projection (for convenience).
       */
    public initializeProjection(ellipsoid: Ellipsoid): TransverseMercator {
        /* Prepare the forward parameters */
        this._a = ellipsoid.getA();
        this._e = ellipsoid.getE();
        this._e2 = this._e * this._e;
        this._e4 = this._e2 * this._e2;
        this._e6 = this._e2 * this._e4;
        this._e_2 = this._e2 / (1.0 - this._e2);
        this._m0 = this.calcM(this._latN);
        /* Prepare the reverse parameters */
        const temp: float64 = Math.sqrt(1 - this._e2);
        this._e1 = (1.0 - temp) / (1.0 + temp);
        const e1_2: float64 = this._e1 * this._e1;
        const e1_3: float64 = this._e1 * e1_2;
        const e1_4: float64 = e1_2 * e1_2;
        this._R1 = (3 * this._e1 / 2 - 27 * e1_3 / 32);
        this._R2 = (21 * e1_2 / 16 - 55 * e1_4 / 32);
        this._R3 = (151 * e1_3 / 96);
        this._R4 = (1097 * e1_4 / 512);
        /* Return the projection */
        return this;
    }

    /**
       * Do the projection.
       * @param lon the longitude (radians).
       * @param lat the latitude (radians).
       * @param projected the target projected coordinate (X and Y will be set).
       */
    public toProjection(lon: float64, lat: float64, projected: Coordinate): void {
        /* Calculate parameters */
        const tan: float64 = Math.tan(lat);
        const T: float64 = tan * tan;
        const cos: float64 = Math.cos(lat);
        const C: float64 = this._e2 * cos * cos / (1.0 - this._e2);
        const A: float64 = (lon - this._lonN) * cos;
        const eSin: float64 = this._e * Math.sin(lat);
        const v: float64 = this._a / Math.sqrt(1.0 - eSin * eSin);
        const m: float64 = this.calcM(lat);
        /* Make the calculation */
        const temp1: float64 = A + (1.0 - T + C) * TransverseMercator.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * this._e_2) * TransverseMercator.pow(A, 5) / 120.0;
        const E: float64 = this._fE + this._k0 * v * (temp1);
        const temp2: float64 = m - this._m0 + v * tan * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * TransverseMercator.pow(A, 4) / 24.0 + (61 - 58 * T + T * T + 600 * C - 330 * this._e_2) * TransverseMercator.pow(A, 6) / 720.0);
        const N: float64 = this._fN + this._k0 * (temp2);
        /* Save the position */
        projected.setX(E);
        projected.setY(N);
    }

    /**
       * Do the inverse projection.
       * @param x the easting.
       * @param y the northing.
       * @param geographic the target geographic coordinate (X/Lon and Y/Lat will be set) (radians).
       */
    public toGeoGraphic(x: float64, y: float64, geographic: Coordinate): void {
        /* Get the parameters */
        const E: float64 = x;
        const N: float64 = y;
        /* Calculate parameters */
        const m1: float64 = this._m0 + (N - this._fN) / this._k0;
        const u1: float64 = m1 / (this._a * (1.0 - this._e2 / 4 - 3 * this._e4 / 64 - 5 * this._e6 / 256));
        const lat1: float64 = u1 + this._R1 * Math.sin(2 * u1) + this._R2 * Math.sin(4 * u1) + this._R3 * Math.sin(6 * u1) + this._R4 * Math.sin(8 * u1);
        const eSin1: float64 = this._e * Math.sin(lat1);
        const temp: float64 = Math.sqrt(1.0 - eSin1 * eSin1);
        const v1: float64 = this._a / temp;
        const rho1: float64 = this._a * (1.0 - this._e2) / TransverseMercator.pow(temp, 3);
        const tan: float64 = Math.tan(lat1);
        const T1: float64 = tan * tan;
        const T1_2: float64 = T1 * T1;
        const cos: float64 = Math.cos(lat1);
        const C1: float64 = this._e_2 * cos * cos;
        const C1_2: float64 = C1 * C1;
        const D: float64 = (E - this._fE) / (v1 * this._k0);
        const D_2: float64 = D * D;
        /* Make the calculation */
        const temp1: float64 = D_2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1_2 - 9 * this._e_2) * TransverseMercator.pow(D, 4) / 24.0 + (61 + 90 * T1 + 298 * C1 + 45 * T1_2 - 252 * this._e_2 - 3 * C1_2) * TransverseMercator.pow(D, 6) / 720.0;
        const lat: float64 = lat1 - (v1 * tan / rho1) * (temp1);
        const temp2: float64 = D - (1 + 2 * T1 + C1) * TransverseMercator.pow(D, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1_2 + 8 * this._e_2 + 24 * T1_2) * TransverseMercator.pow(D, 5) / 120;
        const lon: float64 = this._lonN + (temp2) / cos;
        /* Save the position */
        geographic.setX(lon);
        geographic.setY(lat);
    }

    /**
       * OperationMethod method.
       * @see OperationMethod#initialize
       */
    public override initialize(operation: Operation): void {
        this.initializeProjection(operation.getSourceCRS().getEllipsoid()); // should this use getTargetCRS? (while testing OSTN15 RoI)
    }

    /**
       * OperationMethod interface method.
       * @see OperationMethod#forward
       */
    public forward(sourceCRS: CRS, source: Coordinate, targetCRS: CRS, target: Coordinate): void {
        /* Get the parameters */
        const lon: float64 = source.getX();
        const lat: float64 = source.getY();
        /* Do the projection */
        this.toProjection(lon, lat, target);
        target.setZ(source.getZ()); // Copy the Z value
    }

    /**
       * OperationMethod interface method.
       * @see OperationMethod#reverse
       */
    public reverse(sourceCRS: CRS, source: Coordinate, targetCRS: CRS, target: Coordinate): void {
        /* Get the parameters */
        const E: float64 = target.getX();
        const N: float64 = target.getY();
        /* Do the inverse projection */
        this.toGeoGraphic(E, N, source);
        source.setZ(target.getZ()); // Copy the Z value
    }
}
