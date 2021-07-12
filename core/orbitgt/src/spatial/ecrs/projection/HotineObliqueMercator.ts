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
 * Class HotineObliqueMercator defines a Hotine Oblique Mercator projection.
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
 * Formulas: see 1.4.6: Oblique Mercator and Hotine Oblique Mercator
 *
 * @version 1.0 May 2008
 */
/** @internal */
export class HotineObliqueMercator extends OperationMethod {
    /** The code of this method */
    public static readonly METHOD_CODE: int32 = 9812;

    /** Latitude of the projection center */
    private _latC: float64;
    /** Longitude of the projection center */
    private _lonC: float64;
    /** Azimuth of the initial line passing through the projection center */
    private _aziC: float64;
    /** Angle from the recified grid to the skew (oblique) grid */
    private _gamC: float64;
    /** Scale factor on the initial line of projection */
    private _kC: float64;
    /** False easting at the natural origin */
    private _fe: float64;
    /** False northing at the natural origin */
    private _fn: float64;

    /** Forward calculation parameters */
    private _a: float64;
    private _e: float64;
    private _e2: float64;
    private _B: float64;
    private _A: float64;
    private _tO: float64;
    private _D: float64;
    private _F: float64;
    private _H: float64;
    private _G: float64;
    private _latO: float64;
    private _lonO: float64;
    private _vC: float64;
    private _uC: float64;
    /** Reverse calculation parameters */
    private _rev1: float64;
    private _rev2: float64;
    private _rev3: float64;
    private _rev4: float64;

    /**
       * Create a new projection.
       * @param parameters the values of the parameters.
       */
    public constructor(parameters: ParameterValueList) {
        super(HotineObliqueMercator.METHOD_CODE, "Hotine Oblique Mercator", parameters);
        /* Store the parameters */
        this._latC = parameters.getValue(8811);
        this._lonC = parameters.getValue(8812);
        this._aziC = parameters.getValue(8813);
        this._gamC = parameters.getValue(8814);
        this._kC = parameters.getValue(8815);
        this._fe = parameters.getValue(8806);
        this._fn = parameters.getValue(8807);
    }

    /**
       * Get the sign of a number.
       */
    private static sign(v: float64): float64 {
        return (v < 0.0) ? (-1.0) : (1.0);
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
       * Initialize the projection.
       * @param ellipsoid the ellipsoid to use.
       * @return this projection (for convenience).
       */
    public initializeProjection(ellipsoid: Ellipsoid): HotineObliqueMercator {
        /* Prepare the forward parameters */
        this._a = ellipsoid.getA();
        this._e = ellipsoid.getE();
        this._e2 = this._e * this._e;
        this._B = Math.sqrt(1.0 + (this._e2 * HotineObliqueMercator.pow(Math.cos(this._latC), 4) / (1.0 - this._e2)));
        const esinLatC: float64 = this._e * Math.sin(this._latC);
        this._A = this._a * this._B * this._kC * Math.sqrt(1.0 - this._e2) / (1.0 - HotineObliqueMercator.pow(esinLatC, 2));
        this._tO = Math.tan(Math.PI / 4.0 - this._latC / 2.0) / Math.pow((1.0 - esinLatC) / (1.0 + esinLatC), this._e / 2.0);
        this._D = this._B * Math.sqrt(1.0 - this._e2) / (Math.cos(this._latC) * Math.sqrt(1.0 - HotineObliqueMercator.pow(esinLatC, 2)));
        const D2: float64 = (this._D < 1.0) ? (1.0) : (this._D * this._D);
        this._F = this._D + Math.sqrt(D2 - 1.0) * HotineObliqueMercator.sign(this._latC);
        this._H = this._F * Math.pow(this._tO, this._B);
        this._G = (this._F - 1.0 / this._F) / 2.0;
        this._latO = Math.asin(Math.sin(this._aziC) / this._D);
        this._lonO = this._lonC - Math.asin(this._G * Math.tan(this._latO)) / this._B;
        this._vC = 0.0;
        if (Math.abs(this._aziC - 0.5 * Math.PI) < 0.00001) this._uC = this._A * (this._lonC - this._lonO); // special case Hungary, Switzerland
        else this._uC = (this._A / this._B) * Math.atan(Math.sqrt(D2 - 1.0) / Math.cos(this._aziC)) * HotineObliqueMercator.sign(this._latC);
        /* Prepare the reverse parameters */
        const e4: float64 = this._e2 * this._e2;
        const e6: float64 = e4 * this._e2;
        const e8: float64 = e4 * e4;
        this._rev1 = (this._e2 / 2 + 5 * e4 / 24 + e6 / 12 + 13 * e8 / 360);
        this._rev2 = (7 * e4 / 48 + 29 * e6 / 240 + 811 * e8 / 11520);
        this._rev3 = (7 * e6 / 120 + 81 * e8 / 1120);
        this._rev4 = (4279 * e8 / 161280);
        /* Return the projection */
        return this;
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
        /* Make the calculation */
        const esinLat: float64 = this._e * Math.sin(lat);
        const t: float64 = Math.tan(Math.PI / 4.0 - lat / 2.0) / Math.pow((1.0 - esinLat) / (1.0 + esinLat), this._e / 2.0);
        const Q: float64 = this._H / Math.pow(t, this._B);
        const S: float64 = (Q - 1.0 / Q) / 2.0;
        const T: float64 = (Q + 1.0 / Q) / 2.0;
        const V: float64 = Math.sin(this._B * (lon - this._lonO));
        const U: float64 = (-V * Math.cos(this._latO) + S * Math.sin(this._latO)) / T;
        const v: float64 = this._A * Math.log((1.0 - U) / (1.0 + U)) / (2.0 * this._B);
        const u: float64 = (this._A * Math.atan((S * Math.cos(this._latO) + V * Math.sin(this._latO)) / Math.cos(this._B * (lon - this._lonO))) / this._B); // possibly related to method 9815 atan2 problem? (LER 15/06/2018)
        const sinGamC: float64 = Math.sin(this._gamC);
        const cosGamC: float64 = Math.cos(this._gamC);
        const E: float64 = v * cosGamC + u * sinGamC + this._fe;
        const N: float64 = u * cosGamC - v * sinGamC + this._fn;
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
        /* Get the parameters */
        const E: float64 = target.getX();
        const N: float64 = target.getY();
        /* Make the calculation */
        const sinGamC: float64 = Math.sin(this._gamC);
        const cosGamC: float64 = Math.cos(this._gamC);
        const v: float64 = (E - this._fe) * cosGamC - (N - this._fn) * sinGamC;
        const u: float64 = (N - this._fn) * cosGamC + (E - this._fe) * sinGamC;
        const Q: float64 = Math.exp(-this._B * v / this._A);
        const S: float64 = (Q - 1.0 / Q) / 2.0;
        const T: float64 = (Q + 1.0 / Q) / 2.0;
        const V: float64 = Math.sin(this._B * u / this._A);
        const U: float64 = (V * Math.cos(this._latO) + S * Math.sin(this._latO)) / T;
        const t: float64 = Math.pow(this._H / Math.sqrt((1.0 + U) / (1.0 - U)), 1.0 / this._B);
        const chi: float64 = Math.PI / 2.0 - 2.0 * Math.atan(t);
        const lat: float64 = chi + Math.sin(2.0 * chi) * this._rev1 + Math.sin(4.0 * chi) * this._rev2 + Math.sin(6.0 * chi) * this._rev3 + Math.sin(8.0 * chi) * this._rev4;
        const lon: float64 = this._lonO - Math.atan((S * cosGamC - V * sinGamC) / Math.cos(this._B * u / this._A)) / this._B; // possibly related to method 9815 atan2 problem? (LER 15/06/2018)
        /* Save the position */
        source.setX(lon);
        source.setY(lat);
        source.setZ(target.getZ()); // Keep the Z value
    }
}
