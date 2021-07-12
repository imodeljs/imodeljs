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

/**
 * Class ObliqueMercator defines an Oblique Mercator projection (Hotine Variant B).
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
 * Formulas: see 1.4.6 (spec v6.13): Oblique Mercator and Hotine Oblique Mercator
 *
 * @version 1.0 May 2008
 */
/** @internal */
export class ObliqueMercator extends OperationMethod {
    /** The code of this method */
    public static readonly METHOD_CODE: int32 = 9815; // Hotine Variant B

    /** The value of PI */
    private static readonly PI: float64 = Math.PI;

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
    /** False easting at the center of projection */
    private _eC: float64;
    /** False northing at the center of projection */
    private _nC: float64;

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
    private _gamO: float64;
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
        super(ObliqueMercator.METHOD_CODE, "Oblique Mercator", parameters);
        /* Store the parameters */
        this._latC = parameters.getValue(8811);
        this._lonC = parameters.getValue(8812);
        this._aziC = parameters.getValue(8813);
        this._gamC = parameters.getValue(8814);
        this._kC = parameters.getValue(8815);
        this._eC = parameters.getValue(8816);
        this._nC = parameters.getValue(8817);
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
       * OperationMethod method.
       * @see OperationMethod#initialize
       */
    public override initialize(operation: Operation): void {
        /* Get the ellipsoid */
        const sourceCRS: CRS = operation.getSourceCRS();
        /* Prepare the forward parameters */
        this._a = sourceCRS.getEllipsoid().getA();
        this._e = sourceCRS.getEllipsoid().getE();
        this._e2 = this._e * this._e;
        this._B = Math.sqrt(1.0 + (this._e2 * ObliqueMercator.pow(Math.cos(this._latC), 4) / (1.0 - this._e2)));
        const esinLatC: float64 = this._e * Math.sin(this._latC);
        this._A = this._a * this._B * this._kC * Math.sqrt(1.0 - this._e2) / (1.0 - ObliqueMercator.pow(esinLatC, 2));
        this._tO = Math.tan(ObliqueMercator.PI / 4.0 - this._latC / 2.0) / Math.pow((1.0 - esinLatC) / (1.0 + esinLatC), this._e / 2.0);
        this._D = this._B * Math.sqrt(1.0 - this._e2) / (Math.cos(this._latC) * Math.sqrt(1.0 - ObliqueMercator.pow(esinLatC, 2)));
        const D2: float64 = (this._D < 1.0) ? (1.0) : (this._D * this._D);
        this._F = this._D + Math.sqrt(D2 - 1.0) * ObliqueMercator.sign(this._latC);
        this._H = this._F * Math.pow(this._tO, this._B);
        this._G = (this._F - 1.0 / this._F) / 2.0;
        this._gamO = Math.asin(Math.sin(this._aziC) / this._D);
        // fix for Switzerland CRS 2056 projection error. LER, 19/06/2018
        let w: float64 = this._G * Math.tan(this._gamO);
        if (Math.abs(1.0 - w) < 1.0e-13) w = 1.0;  // Math.asin(0.9999999999999999) gives a 1.49e-8 difference from the asin(1.0) value, which leads to a 19 cm projection error
        //        this._lonO = lonC-Math.asin(G*Math.tan(gamO))/B;
        this._lonO = this._lonC - Math.asin(w) / this._B;
        // end of fix
        this._vC = 0.0;
        if (Math.abs(this._aziC - 0.5 * ObliqueMercator.PI) < 1.0e-12) this._uC = this._A * (this._lonC - this._lonO); // special case aziC==90 (Hungary, Switzerland)
        else this._uC = (this._A / this._B) * Math.atan(Math.sqrt(D2 - 1.0) / Math.cos(this._aziC)) * ObliqueMercator.sign(this._latC);
        /* Prepare the reverse parameters */
        const e4: float64 = this._e2 * this._e2;
        const e6: float64 = e4 * this._e2;
        const e8: float64 = e4 * e4;
        this._rev1 = (this._e2 / 2.0 + 5.0 * e4 / 24.0 + e6 / 12.0 + 13.0 * e8 / 360.0);
        this._rev2 = (7.0 * e4 / 48.0 + 29.0 * e6 / 240.0 + 811.0 * e8 / 11520.0);
        this._rev3 = (7.0 * e6 / 120.0 + 81.0 * e8 / 1120.0);
        this._rev4 = (4279.0 * e8 / 161280.0);
    }

    /**
       * OperationMethod interface method.
       * @see OperationMethod#forward
       */
    public forward(sourceCRS: CRS, source: Coordinate, targetCRS: CRS, target: Coordinate): void {
        /* Get the parameters (radians) */
        const lon: float64 = source.getX();
        const lat: float64 = source.getY();
        /* Make the calculation */
        const esinLat: float64 = this._e * Math.sin(lat);
        const t: float64 = Math.tan(ObliqueMercator.PI / 4.0 - lat / 2.0) / Math.pow((1.0 - esinLat) / (1.0 + esinLat), this._e / 2.0);
        const Q: float64 = this._H / Math.pow(t, this._B);
        const S: float64 = (Q - 1.0 / Q) / 2.0;
        const T: float64 = (Q + 1.0 / Q) / 2.0;
        const V: float64 = Math.sin(this._B * (lon - this._lonO));
        const U: float64 = (-V * Math.cos(this._gamO) + S * Math.sin(this._gamO)) / T;
        const v: float64 = this._A * Math.log((1.0 - U) / (1.0 + U)) / (2.0 * this._B);
        let u: float64;
        if (Math.abs(this._aziC - 0.5 * ObliqueMercator.PI) < 1.0e-12) // aziC==90? new in guidance note 2 version 8.5. LER, 21/09/2016
        {
            if (lon == this._lonC) u = 0.0;
            else u = (this._A * Math.atan((S * Math.cos(this._gamO) + V * Math.sin(this._gamO)) / Math.cos(this._B * (lon - this._lonO))) / this._B) - (Math.abs(this._uC) * ObliqueMercator.sign(this._latC) * ObliqueMercator.sign(this._lonC - lon));
        } else {
            u = (this._A * Math.atan((S * Math.cos(this._gamO) + V * Math.sin(this._gamO)) / Math.cos(this._B * (lon - this._lonO))) / this._B) - (Math.abs(this._uC) * ObliqueMercator.sign(this._latC));
        }
        const sinGamC: float64 = Math.sin(this._gamC);
        const cosGamC: float64 = Math.cos(this._gamC);
        const E: float64 = v * cosGamC + u * sinGamC + this._eC;
        const N: float64 = u * cosGamC - v * sinGamC + this._nC;
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
        const v: float64 = (E - this._eC) * cosGamC - (N - this._nC) * sinGamC;
        const u: float64 = (N - this._nC) * cosGamC + (E - this._eC) * sinGamC + (Math.abs(this._uC) * ObliqueMercator.sign(this._latC));
        const Q: float64 = Math.exp(-this._B * v / this._A);
        const S: float64 = (Q - 1.0 / Q) / 2.0;
        const T: float64 = (Q + 1.0 / Q) / 2.0;
        const V: float64 = Math.sin(this._B * u / this._A);
        const U: float64 = (V * Math.cos(this._gamO) + S * Math.sin(this._gamO)) / T;
        const t: float64 = Math.pow(this._H / Math.sqrt((1.0 + U) / (1.0 - U)), 1.0 / this._B);
        const chi: float64 = ObliqueMercator.PI / 2.0 - 2.0 * Math.atan(t);
        const lat: float64 = chi + Math.sin(2.0 * chi) * this._rev1 + Math.sin(4.0 * chi) * this._rev2 + Math.sin(6.0 * chi) * this._rev3 + Math.sin(8.0 * chi) * this._rev4;
        //        double lon = lonO-Math.atan((S*Math.cos(gamO)-V*Math.sin(gamO))/Math.cos(B*u/A))/B;
        const lon: float64 = this._lonO - Math.atan2((S * Math.cos(this._gamO) - V * Math.sin(this._gamO)), Math.cos(this._B * u / this._A)) / this._B; // replaced atan(y/x) by atan2(y,x). LER, 23/05/2017
        /* Save the position */
        source.setX(lon);
        source.setY(lat);
        source.setZ(target.getZ()); // Keep the Z value
    }
}
