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
 * Class LambertConical2SP defines a Lambert Conical Conformal map projection with 2 standard parallels.
 *
 * The 'source' CRS is the geographic CRS.
 * The 'target' CRS is the projected CRS.
 *
 * Based on the following document:
 *
 * Coordinate Conversions and Transformations including Formulas
 * Guidance Note Number 7, part 2
 * Revised May 2005
 * Available at: http://www.epsg.org/
 *
 * Formulas: see 1.4.1.1 -> 1.4.1.4
 *
 * @version 1.0 July 2005
 */
/** @internal */
export class LambertConical2SP extends OperationMethod {
    /** The code of this method */
    public static readonly METHOD_CODE: int32 = 9802;

    /** The value of PI */
    private static readonly PI: float64 = Math.PI;
    /** The half value of PI */
    private static readonly hPI: float64 = 0.5 * Math.PI;

    /** Latitude of false origin */
    private _latF: float64;
    /** Longitude of false origin (the central meridian) */
    private _lonF: float64;
    /** Latitude of first standard parallel */
    private _lat1: float64;
    /** Latitude of second standard parallel */
    private _lat2: float64;
    /** Easting at false origin */
    private _eF: float64;
    /** Northing at false origin */
    private _nF: float64;

    /* Calculation parameters */
    private _e: float64;
    private _a: float64;
    private _m1: float64;
    private _m2: float64;
    private _t1: float64;
    private _t2: float64;
    private _tF: float64;
    private _n: float64;
    private _F: float64;
    private _rF: float64;

    /**
       * Create a new projection.
       * @param parameters the values of the parameters.
       */
    public constructor(parameters: ParameterValueList) {
        super(LambertConical2SP.METHOD_CODE, "Lambert Conic Conformal (2SP)", parameters);
        /* Store the parameters */
        this._latF = parameters.getValue(8821);
        this._lonF = parameters.getValue(8822);
        this._lat1 = parameters.getValue(8823);
        this._lat2 = parameters.getValue(8824);
        this._eF = parameters.getValue(8826);
        this._nF = parameters.getValue(8827);
    }

    /**
       * Get the sign of a number.
       */
    private static sign(v: float64): float64 {
        return (v < 0.0) ? (-1.0) : (1.0);
    }

    /**
       * Get the square of a number.
       */
    private static square(v: float64): float64 {
        return (v * v);
    }

    /**
       * Calculate M.
       */
    private static calcM(e: float64, lat: float64): float64 {
        return Math.cos(lat) / Math.sqrt(1.0 - LambertConical2SP.square(e * Math.sin(lat)));
    }

    /**
       * Calculate T.
       */
    private static calcT(e: float64, lat: float64): float64 {
        return Math.tan(Math.PI * 0.25 - lat * 0.5) / Math.pow((1.0 - e * Math.sin(lat)) / (1.0 + e * Math.sin(lat)), e * 0.5);
    }

    /**
       * Calculate R.
       */
    private static calcR(a: float64, F: float64, t: float64, n: float64): float64 {
        if (Math.abs(t) < 1.0e-6) return 0.0;
        return a * F * Math.pow(t, n);
    }

    /**
       * Initialize the projection.
       * @param ellipsoid the ellipsoid to use.
       * @return this projection (for convenience).
       */
    public initializeProjection(ellipsoid: Ellipsoid): LambertConical2SP {
        /* Get the ellipsoid parameters */
        this._e = ellipsoid.getE();
        this._a = ellipsoid.getA();
        /* Make the calculation */
        this._m1 = LambertConical2SP.calcM(this._e, this._lat1);
        this._m2 = LambertConical2SP.calcM(this._e, this._lat2);
        this._t1 = LambertConical2SP.calcT(this._e, this._lat1);
        this._t2 = LambertConical2SP.calcT(this._e, this._lat2);
        this._tF = LambertConical2SP.calcT(this._e, this._latF);
        this._n = (Math.log(this._m1) - Math.log(this._m2)) / (Math.log(this._t1) - Math.log(this._t2));
        this._F = this._m1 / (this._n * Math.pow(this._t1, this._n));
        this._rF = LambertConical2SP.calcR(this._a, this._F, this._tF, this._n);
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
        /* Make the calculation */
        const t: float64 = LambertConical2SP.calcT(this._e, lat);
        const r: float64 = LambertConical2SP.calcR(this._a, this._F, t, this._n);
        const theta: float64 = this._n * (lon - this._lonF);
        const E: float64 = this._eF + r * Math.sin(theta);
        const N: float64 = this._nF + this._rF - r * Math.cos(theta);
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
        /* Make the calculation */
        const r_: float64 = LambertConical2SP.sign(this._n) * Math.sqrt(LambertConical2SP.square(E - this._eF) + LambertConical2SP.square(this._rF - (N - this._nF)));
        const t_: float64 = Math.pow(r_ / (this._a * this._F), 1.0 / this._n);
        const theta_: float64 = Math.atan((E - this._eF) / (this._rF - (N - this._nF)));
        let lat: float64 = LambertConical2SP.PI * 0.5 - 2.0 * Math.atan(t_);
        const he: float64 = 0.5 * this._e;
        for (let i: number = 0; i < 7; i++) // double-checked iteration count. LER, 24/11/2011
        {
            const eSin: float64 = this._e * Math.sin(lat);
            lat = LambertConical2SP.hPI - 2.0 * Math.atan(t_ * Math.pow((1.0 - eSin) / (1.0 + eSin), he)); // recursive formula
        }
        const lon: float64 = (theta_) / this._n + this._lonF;
        /* Save the position */
        geographic.setX(lon);
        geographic.setY(lat);
    }

    /**
       * OperationMethod method.
       * @see OperationMethod#initialize
       */
    public override initialize(operation: Operation): void {
        this.initializeProjection(operation.getSourceCRS().getEllipsoid());
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
        target.setZ(source.getZ()); // Keep the Z value
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
        source.setZ(target.getZ()); // Keep the Z value
    }
}
